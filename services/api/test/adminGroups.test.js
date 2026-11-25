/**
 * Groupes d'utilisateurs — routes /api/admin/groups, appartenance sur les
 * comptes, et ce que l'utilisateur en voit (/init, /auth/session, /login).
 *
 * Ce qui se vérifie ici et nulle part ailleurs : l'invariant « un compte est
 * toujours dans UN groupe, et un seul » (cf. lib/repositories/groups.js) — un
 * compte antérieur au champ compte dans le groupe par défaut, entrer dans un
 * groupe fait quitter le précédent, un retrait renvoie au groupe par défaut,
 * la suppression d'un groupe ne laisse personne sans groupe, et les deux
 * groupes fixes ne se suppriment pas. Et le placement qui suit le rôle : un
 * compte qui devient administrateur entre dans le groupe « Admin », il en
 * sort pour le groupe par défaut quand il redevient utilisateur.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTestApp,
  identityHeaders,
  sessionCookieHeaders,
  userDoc,
  groupDoc,
  defaultGroupDoc,
  adminGroupDoc,
} from './helpers.js';
import { hashPassword } from '../lib/auth/password.js';
import { GROUPS_MAX, DEFAULT_GROUP_ID, ADMIN_GROUP_ID } from '../lib/repositories/groups.js';

const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';
const OTHER = 'autre@client.fr';
const SALES = 'g-sales';

/**
 * Trois comptes, deux groupes. `USER` n'a PAS de champ `groupIds` : c'est un
 * compte antérieur à la fonctionnalité, tel que le backfill du démarrage le
 * trouve — les projections doivent le lire « dans le groupe par défaut ».
 */
const baseSeed = () => ({
  user: [
    userDoc(ADMIN, { role: 'admin', groupIds: [DEFAULT_GROUP_ID] }),
    userDoc(USER),
    userDoc(OTHER, { groupIds: [SALES] }),
  ],
  userGroups: [defaultGroupDoc(), groupDoc(SALES, { name: 'Commerciaux', color: 'blue' })],
});

function asAdmin(app, url, body, email = ADMIN) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const getAs = (app, url, email = ADMIN) =>
  app.inject({ method: 'GET', url, headers: identityHeaders(email) });

const userIn = (db, email) => db.data.get('user').find((u) => u.emailLower === email);

describe('GET /api/admin/groups', () => {
  it('est réservé aux administrateurs', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    expect((await getAs(app, '/api/admin/groups', USER)).statusCode).toBe(403);
  });

  it('rend le groupe par défaut en tête, avec les effectifs et le vocabulaire de l écran', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await getAs(app, '/api/admin/groups');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.groups.map((g) => g.id)).toEqual([DEFAULT_GROUP_ID, SALES]);
    expect(body.groups[0]).toMatchObject({ name: 'Défaut', isDefault: true, memberCount: 2 });
    expect(body.groups[1]).toMatchObject({
      name: 'Commerciaux',
      color: 'blue',
      isDefault: false,
      memberCount: 1,
    });
    expect(body.colors).toContain('blue');
    expect(body.max).toBe(GROUPS_MAX);
    expect(body.defaultId).toBe(DEFAULT_GROUP_ID);
    expect(body.adminId).toBe(ADMIN_GROUP_ID);
    // Jamais de _id ni de champ interne vers l'écran.
    expect(JSON.stringify(body)).not.toContain('nameLower');
  });

  it('trie les autres groupes par nom, sans tenir compte de la casse', async () => {
    const seed = baseSeed();
    seed.userGroups.push(
      groupDoc('g-dir', { name: 'direction' }),
      groupDoc('g-adm', { name: 'Achats' }),
    );
    const { app } = buildTestApp({ seed });
    const names = (await getAs(app, '/api/admin/groups')).json().groups.map((g) => g.name);
    expect(names).toEqual(['Défaut', 'Achats', 'Commerciaux', 'direction']);
  });
});

describe('POST /api/admin/groups/create', () => {
  it('crée un groupe vide, nom nettoyé, et le renvoie', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/create', {
      name: '  Direction   générale ',
      description: 'Le comité de direction.',
      color: 'violet',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().group).toMatchObject({
      name: 'Direction générale',
      description: 'Le comité de direction.',
      color: 'violet',
      isDefault: false,
      memberCount: 0,
    });
    const stored = db.data.get('userGroups').find((g) => g.name === 'Direction générale');
    expect(stored.id).toBeTruthy();
    expect(stored.createdBy).toBe(ADMIN);
    // Un droit se donne explicitement : un groupe créé sans la case ne l'a pas.
    expect(res.json().group.infographicAllowed).toBe(false);
    expect(stored.infographicAllowed).toBe(false);
  });

  it('crée un groupe qui donne le droit aux infographies quand la case est cochée', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/create', {
      name: 'Design',
      infographicAllowed: true,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().group.infographicAllowed).toBe(true);
  });

  it('refuse un nom déjà pris, à la casse et aux espaces près', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/create', { name: ' commerciaux ' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('duplicate_name');
  });

  it('refuse un nom vide et une couleur hors palette', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const blank = await asAdmin(app, '/api/admin/groups/create', { name: '   ' });
    expect(blank.statusCode).toBe(400);
    expect(blank.json().error).toBe('name_required');
    const color = await asAdmin(app, '/api/admin/groups/create', { name: 'X', color: '#ff0000' });
    expect(color.statusCode).toBe(400);
    expect(color.json().error).toBe('color_invalid');
  });

  it('refuse au-delà du plafond', async () => {
    const seed = baseSeed();
    for (let i = seed.userGroups.length; i < GROUPS_MAX; i += 1)
      seed.userGroups.push(groupDoc(`g-${i}`, { name: `Groupe ${i}` }));
    const { app } = buildTestApp({ seed });
    const res = await asAdmin(app, '/api/admin/groups/create', { name: 'Un de trop' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'limit_reached', max: GROUPS_MAX });
  });
});

describe('POST /api/admin/groups/update', () => {
  it('renomme et recolore, y compris le groupe par défaut, qui le reste', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/update', {
      id: DEFAULT_GROUP_ID,
      name: 'Tout le monde',
      color: 'teal',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().group).toMatchObject({
      id: DEFAULT_GROUP_ID,
      name: 'Tout le monde',
      color: 'teal',
      isDefault: true,
      memberCount: 2,
    });
  });

  it('ne touche pas aux champs absents', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/update', {
      id: SALES,
      description: 'Équipe de vente.',
    });
    expect(res.json().group).toMatchObject({
      name: 'Commerciaux',
      color: 'blue',
      description: 'Équipe de vente.',
      infographicAllowed: false,
    });
  });

  it('« Défaut » antérieur au droit le donne ; retiré, le refus est écrit et relu', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const before = (await getAs(app, '/api/admin/groups')).json().groups;
    expect(before.find((g) => g.id === DEFAULT_GROUP_ID).infographicAllowed).toBe(true);
    expect(before.find((g) => g.id === SALES).infographicAllowed).toBe(false);

    const res = await asAdmin(app, '/api/admin/groups/update', {
      id: DEFAULT_GROUP_ID,
      infographicAllowed: false,
    });
    expect(res.json().group.infographicAllowed).toBe(false);
    const stored = db.data.get('userGroups').find((g) => g.id === DEFAULT_GROUP_ID);
    expect(stored.infographicAllowed).toBe(false);
    const after = (await getAs(app, '/api/admin/groups')).json().groups;
    expect(after.find((g) => g.id === DEFAULT_GROUP_ID).infographicAllowed).toBe(false);
  });

  it('404 sur un groupe inconnu, 409 sur un nom déjà pris', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    expect(
      (await asAdmin(app, '/api/admin/groups/update', { id: 'fantome', name: 'X' })).statusCode,
    ).toBe(404);
    const dup = await asAdmin(app, '/api/admin/groups/update', { id: SALES, name: 'DÉFAUT' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('duplicate_name');
  });
});

describe('POST /api/admin/groups/delete', () => {
  it('refuse de supprimer le groupe par défaut', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/delete', { id: DEFAULT_GROUP_ID });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('default_group');
    expect(db.data.get('userGroups')).toHaveLength(2);
  });

  it('refuse de supprimer le groupe des administrateurs', async () => {
    const seed = baseSeed();
    seed.userGroups.push(adminGroupDoc());
    const { app, db } = buildTestApp({ seed });
    const res = await asAdmin(app, '/api/admin/groups/delete', { id: ADMIN_GROUP_ID });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('admin_group');
    expect(db.data.get('userGroups')).toHaveLength(3);
  });

  it('renvoie ses membres dans le groupe par défaut, puis disparaît', async () => {
    const seed = baseSeed();
    seed.user.push(userDoc('vendeur@client.fr', { groupIds: [SALES] }));
    const { app, db } = buildTestApp({ seed });

    const res = await asAdmin(app, '/api/admin/groups/delete', { id: SALES });
    expect(res.statusCode).toBe(204);
    expect(db.data.get('userGroups').map((g) => g.id)).toEqual([DEFAULT_GROUP_ID]);
    expect(userIn(db, OTHER).groupIds).toEqual([DEFAULT_GROUP_ID]);
    expect(userIn(db, 'vendeur@client.fr').groupIds).toEqual([DEFAULT_GROUP_ID]);
    // Aucun compte n'a disparu.
    expect(db.data.get('user')).toHaveLength(4);
  });

  it('404 sur un groupe inconnu', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    expect((await asAdmin(app, '/api/admin/groups/delete', { id: 'fantome' })).statusCode).toBe(
      404,
    );
  });
});

describe('POST /api/admin/groups/members', () => {
  it('fait entrer un compte dans le groupe — il quitte le précédent — et renvoie l effectif', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/members', {
      id: SALES,
      add: ['Simple@Client.fr'],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ added: 1, removed: 0 });
    expect(res.json().group).toMatchObject({ id: SALES, memberCount: 2 });
    // Le compte historique (sans champ) quitte le groupe par défaut.
    expect(userIn(db, USER).groupIds).toEqual([SALES]);
    const groups = (await getAs(app, '/api/admin/groups')).json().groups;
    expect(groups.find((g) => g.id === DEFAULT_GROUP_ID).memberCount).toBe(1);
  });

  it('un ajout déjà fait ne compte pas, et n écrit rien', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const before = db.calls.length;
    const res = await asAdmin(app, '/api/admin/groups/members', { id: SALES, add: [OTHER] });
    expect(res.json().added).toBe(0);
    expect(db.calls.slice(before).filter((c) => c.op === 'updateOne')).toHaveLength(0);
  });

  it('retirer un compte de son groupe le renvoie dans le groupe par défaut', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/members', { id: SALES, remove: [OTHER] });
    expect(res.json().removed).toBe(1);
    expect(userIn(db, OTHER).groupIds).toEqual([DEFAULT_GROUP_ID]);
  });

  it('on ne sort pas du groupe par défaut : le retrait ne change rien et ne compte pas', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const before = db.calls.length;
    const res = await asAdmin(app, '/api/admin/groups/members', {
      id: DEFAULT_GROUP_ID,
      remove: [ADMIN],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().removed).toBe(0);
    expect(userIn(db, ADMIN).groupIds).toEqual([DEFAULT_GROUP_ID]);
    expect(db.calls.slice(before).filter((c) => c.op === 'updateOne')).toHaveLength(0);
  });

  it('retirer quelqu un d un groupe dont il n est pas membre ne change rien', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/members', { id: SALES, remove: [ADMIN] });
    expect(res.json().removed).toBe(0);
    expect(userIn(db, ADMIN).groupIds).toEqual([DEFAULT_GROUP_ID]);
  });

  it('une adresse inconnue refuse tout l appel, sans rien écrire', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/members', {
      id: SALES,
      add: [USER, 'fantome@client.fr'],
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'user_not_found', unknown: ['fantome@client.fr'] });
    expect(userIn(db, USER).groupIds).toBeUndefined();
  });

  it('404 sur un groupe inconnu', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    expect(
      (await asAdmin(app, '/api/admin/groups/members', { id: 'fantome', add: [USER] })).statusCode,
    ).toBe(404);
  });
});

describe('les groupes sur les comptes (/api/admin/users)', () => {
  it('la liste porte le groupe de chaque compte, groupe par défaut compris pour un compte historique', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const users = (await getAs(app, '/api/admin/users')).json().users;
    expect(users.find((u) => u.email === USER).groupIds).toEqual([DEFAULT_GROUP_ID]);
    expect(users.find((u) => u.email === OTHER).groupIds).toEqual([SALES]);
  });

  it('un compte qui porte encore plusieurs groupes est lu dans le premier', async () => {
    const seed = baseSeed();
    seed.user.push(userDoc('ancien@client.fr', { groupIds: [SALES, DEFAULT_GROUP_ID] }));
    const { app } = buildTestApp({ seed });
    const users = (await getAs(app, '/api/admin/users')).json().users;
    expect(users.find((u) => u.email === 'ancien@client.fr').groupIds).toEqual([SALES]);
  });

  it('?group= ne rend que les membres du groupe', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await getAs(app, `/api/admin/users?group=${SALES}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(1);
    expect(res.json().users.map((u) => u.email)).toEqual([OTHER]);
  });

  it('crée un compte dans le groupe choisi, ou dans celui de son rôle sans choix', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const chosen = await asAdmin(app, '/api/admin/users/create', {
      email: 'nouveau@client.fr',
      groupIds: [SALES],
    });
    expect(chosen.statusCode).toBe(201);
    expect(chosen.json().user.groupIds).toEqual([SALES]);
    expect(userIn(db, 'nouveau@client.fr').groupIds).toEqual([SALES]);

    const plain = await asAdmin(app, '/api/admin/users/create', { email: 'autre2@client.fr' });
    expect(plain.json().user.groupIds).toEqual([DEFAULT_GROUP_ID]);

    const admin = await asAdmin(app, '/api/admin/users/create', {
      email: 'chef@client.fr',
      role: 'admin',
    });
    expect(admin.json().user.groupIds).toEqual([ADMIN_GROUP_ID]);
  });

  it('refuse plus d un groupe pour un compte', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/update', {
      email: USER,
      groupIds: [DEFAULT_GROUP_ID, SALES],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
  });

  it('refuse un groupe inconnu à la création comme à la modification', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const created = await asAdmin(app, '/api/admin/users/create', {
      email: 'nouveau@client.fr',
      groupIds: ['fantome'],
    });
    expect(created.statusCode).toBe(400);
    expect(created.json()).toMatchObject({ error: 'group_not_found', unknown: ['fantome'] });

    const updated = await asAdmin(app, '/api/admin/users/update', {
      email: USER,
      groupIds: ['fantome'],
    });
    expect(updated.statusCode).toBe(400);
    expect(updated.json().error).toBe('group_not_found');
  });

  it('change le groupe d un compte ; une liste vide le remet dans le groupe par défaut', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/update', { email: USER, groupIds: [SALES] });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.groupIds).toEqual([SALES]);

    const emptied = await asAdmin(app, '/api/admin/users/update', { email: OTHER, groupIds: [] });
    expect(emptied.json().user.groupIds).toEqual([DEFAULT_GROUP_ID]);
    expect(userIn(db, OTHER).groupIds).toEqual([DEFAULT_GROUP_ID]);
    // Changer de groupe n'est pas un changement de droits : les sessions restent.
    expect(db.calls.filter((c) => c.collection === 'authSession' && c.op === 'deleteMany')).toEqual(
      [],
    );
  });
});

describe('le groupe suit le rôle (/api/admin/users/update)', () => {
  const withAdminGroup = () => {
    const seed = baseSeed();
    seed.userGroups.push(adminGroupDoc());
    return seed;
  };

  it('un compte promu administrateur entre dans le groupe Admin, illimité', async () => {
    const seed = withAdminGroup();
    seed.userGroups[1].meetingMinutesPerMonth = 60;
    const { app, db } = buildTestApp({ seed });
    const res = await asAdmin(app, '/api/admin/users/update', { email: OTHER, role: 'admin' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ role: 'admin', groupIds: [ADMIN_GROUP_ID] });
    expect(userIn(db, OTHER).groupIds).toEqual([ADMIN_GROUP_ID]);
    const quota = (await getAs(app, '/api/quota', OTHER)).json();
    expect(quota).toMatchObject({ unlimited: true, group: { id: ADMIN_GROUP_ID } });
  });

  it('un administrateur rétrogradé quitte le groupe Admin pour le groupe par défaut', async () => {
    const seed = withAdminGroup();
    seed.user.push(userDoc('chef@client.fr', { role: 'admin', groupIds: [ADMIN_GROUP_ID] }));
    const { app, db } = buildTestApp({ seed });
    const res = await asAdmin(app, '/api/admin/users/update', {
      email: 'chef@client.fr',
      role: 'user',
    });
    expect(res.statusCode).toBe(200);
    expect(userIn(db, 'chef@client.fr').groupIds).toEqual([DEFAULT_GROUP_ID]);
  });

  it('un administrateur placé ailleurs par l administration y reste en étant rétrogradé', async () => {
    const seed = withAdminGroup();
    seed.user.push(userDoc('chef@client.fr', { role: 'admin', groupIds: [SALES] }));
    const { app, db } = buildTestApp({ seed });
    await asAdmin(app, '/api/admin/users/update', { email: 'chef@client.fr', role: 'user' });
    expect(userIn(db, 'chef@client.fr').groupIds).toEqual([SALES]);
  });

  it('un groupe choisi dans le même appel l emporte sur le placement par le rôle', async () => {
    const { app, db } = buildTestApp({ seed: withAdminGroup() });
    await asAdmin(app, '/api/admin/users/update', {
      email: OTHER,
      role: 'admin',
      groupIds: [DEFAULT_GROUP_ID],
    });
    expect(userIn(db, OTHER).groupIds).toEqual([DEFAULT_GROUP_ID]);
  });

  it('sans changement de rôle, le groupe ne bouge pas', async () => {
    const { app, db } = buildTestApp({ seed: withAdminGroup() });
    await asAdmin(app, '/api/admin/users/update', { email: ADMIN, role: 'admin', name: 'Patron' });
    expect(userIn(db, ADMIN).groupIds).toEqual([DEFAULT_GROUP_ID]);
  });
});

describe('ce que l utilisateur voit de ses groupes', () => {
  it('/api/init renvoie le groupe résolu, nom et couleur', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await getAs(app, '/api/init', OTHER);
    expect(res.statusCode).toBe(200);
    expect(res.json().groups).toEqual([{ id: SALES, name: 'Commerciaux', color: 'blue' }]);
  });

  it('un compte créé à sa première connexion naît dans le groupe par défaut', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await getAs(app, '/api/init', 'nouveau@client.fr');
    expect(res.json().groups).toEqual([{ id: DEFAULT_GROUP_ID, name: 'Défaut', color: 'slate' }]);
    expect(userIn(db, 'nouveau@client.fr').groupIds).toEqual([DEFAULT_GROUP_ID]);
  });

  it('un identifiant de groupe mort est ignoré ; sans groupe vivant, c est le groupe par défaut', async () => {
    const seed = baseSeed();
    seed.user.push(userDoc('orphelin@client.fr', { groupIds: ['supprime-depuis'] }));
    const { app } = buildTestApp({ seed });
    const res = await getAs(app, '/api/init', 'orphelin@client.fr');
    expect(res.json().groups.map((g) => g.id)).toEqual([DEFAULT_GROUP_ID]);
  });

  it('/api/auth/session et /api/auth/login portent aussi les groupes', async () => {
    const seed = baseSeed();
    seed.user[2].passwordHash = await hashPassword('un-mot-de-passe-solide');
    seed.user[2].authProviders = ['password'];
    const { app } = buildTestApp({ seed });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: OTHER, password: 'un-mot-de-passe-solide' }),
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.groups.map((g) => g.name)).toEqual(['Commerciaux']);
    // Commerciaux ne donne pas les infographies (droit absent = refusé hors « Défaut »).
    expect(login.json().user.rights).toEqual({
      infographic: false,
      aiHelp: false,
      aiHelpMyBrain: false,
    });

    const { token } = await app.sessions.create(OTHER);
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: sessionCookieHeaders(token),
    });
    expect(session.json().user.groups.map((g) => g.name)).toEqual(['Commerciaux']);
    expect(session.json().user.rights).toEqual({
      infographic: false,
      aiHelp: false,
      aiHelpMyBrain: false,
    });
  });

  it('les droits sont ceux du groupe du compte', async () => {
    const seed = baseSeed();
    seed.userGroups[0].infographicAllowed = false;
    seed.userGroups[1].infographicAllowed = true;
    const { app } = buildTestApp({ seed });
    // OTHER est dans Commerciaux (accorde) : il a le droit.
    const other = await getAs(app, '/api/init', OTHER);
    expect(other.json().rights).toEqual({ infographic: true, aiHelp: false, aiHelpMyBrain: false });
    // USER n'est que dans Défaut : pas de droit.
    const user = await getAs(app, '/api/init', USER);
    expect(user.json().rights).toEqual({ infographic: false, aiHelp: false, aiHelpMyBrain: false });
  });
});
