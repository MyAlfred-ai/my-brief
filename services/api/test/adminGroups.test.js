/**
 * Groupes d'utilisateurs — routes /api/admin/groups, appartenance sur les
 * comptes, et ce que l'utilisateur en voit (/init, /auth/session, /login).
 *
 * Ce qui se vérifie ici et nulle part ailleurs : l'invariant « un compte est
 * toujours dans au moins un groupe » (cf. lib/repositories/groups.js) — un
 * compte antérieur au champ compte dans le groupe par défaut, un retrait de son
 * dernier groupe l'y renvoie, la suppression d'un groupe ne laisse personne
 * sans groupe, et le groupe par défaut ne se supprime pas.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTestApp,
  identityHeaders,
  sessionCookieHeaders,
  userDoc,
  groupDoc,
  defaultGroupDoc,
} from './helpers.js';
import { hashPassword } from '../lib/auth/password.js';
import { GROUPS_MAX, DEFAULT_GROUP_ID } from '../lib/repositories/groups.js';

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
    userDoc(OTHER, { groupIds: [DEFAULT_GROUP_ID, SALES] }),
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
    expect(body.groups[0]).toMatchObject({ name: 'Défaut', isDefault: true, memberCount: 3 });
    expect(body.groups[1]).toMatchObject({
      name: 'Commerciaux',
      color: 'blue',
      isDefault: false,
      memberCount: 1,
    });
    expect(body.colors).toContain('blue');
    expect(body.max).toBe(GROUPS_MAX);
    expect(body.defaultId).toBe(DEFAULT_GROUP_ID);
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
      memberCount: 3,
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

  it('retire le groupe de ses membres ; ceux qui n en avaient pas d autre reviennent au groupe par défaut', async () => {
    const seed = baseSeed();
    // Un compte dont Commerciaux est le SEUL groupe : il ne doit pas rester sans groupe.
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
  it('ajoute un compte au groupe et renvoie l effectif à jour', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/groups/members', {
      id: SALES,
      add: ['Simple@Client.fr'],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ added: 1, removed: 0 });
    expect(res.json().group).toMatchObject({ id: SALES, memberCount: 2 });
    // Le compte historique (sans champ) garde son groupe par défaut ET gagne le nouveau.
    expect(userIn(db, USER).groupIds).toEqual([DEFAULT_GROUP_ID, SALES]);
  });

  it('un ajout déjà fait ne compte pas, et n écrit rien', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const before = db.calls.length;
    const res = await asAdmin(app, '/api/admin/groups/members', { id: SALES, add: [OTHER] });
    expect(res.json().added).toBe(0);
    expect(db.calls.slice(before).filter((c) => c.op === 'updateOne')).toHaveLength(0);
  });

  it('retirer un compte de son dernier groupe le renvoie dans le groupe par défaut', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    // OTHER quitte le groupe par défaut : il lui reste Commerciaux.
    await asAdmin(app, '/api/admin/groups/members', { id: DEFAULT_GROUP_ID, remove: [OTHER] });
    expect(userIn(db, OTHER).groupIds).toEqual([SALES]);
    // Puis Commerciaux : c'était son dernier groupe, il revient au défaut.
    const res = await asAdmin(app, '/api/admin/groups/members', { id: SALES, remove: [OTHER] });
    expect(res.json().removed).toBe(1);
    expect(userIn(db, OTHER).groupIds).toEqual([DEFAULT_GROUP_ID]);
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
  it('la liste porte les groupes de chaque compte, groupe par défaut compris pour un compte historique', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const users = (await getAs(app, '/api/admin/users')).json().users;
    expect(users.find((u) => u.email === USER).groupIds).toEqual([DEFAULT_GROUP_ID]);
    expect(users.find((u) => u.email === OTHER).groupIds).toEqual([DEFAULT_GROUP_ID, SALES]);
  });

  it('?group= ne rend que les membres du groupe', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await getAs(app, `/api/admin/users?group=${SALES}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(1);
    expect(res.json().users.map((u) => u.email)).toEqual([OTHER]);
  });

  it('crée un compte dans les groupes choisis, ou dans le groupe par défaut sans choix', async () => {
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
  });

  it('refuse un groupe inconnu à la création comme à la modification', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const created = await asAdmin(app, '/api/admin/users/create', {
      email: 'nouveau@client.fr',
      groupIds: [SALES, 'fantome'],
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

  it('remplace les groupes d un compte ; une liste vide le remet dans le groupe par défaut', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    const res = await asAdmin(app, '/api/admin/users/update', { email: OTHER, groupIds: [SALES] });
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

describe('ce que l utilisateur voit de ses groupes', () => {
  it('/api/init renvoie les groupes résolus, nom et couleur, dans l ordre du catalogue', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await getAs(app, '/api/init', OTHER);
    expect(res.statusCode).toBe(200);
    expect(res.json().groups).toEqual([
      { id: DEFAULT_GROUP_ID, name: 'Défaut', color: 'slate' },
      { id: SALES, name: 'Commerciaux', color: 'blue' },
    ]);
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
    expect(login.json().user.groups.map((g) => g.name)).toEqual(['Défaut', 'Commerciaux']);
    expect(login.json().user.rights).toEqual({ infographic: true });

    const { token } = await app.sessions.create(OTHER);
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: sessionCookieHeaders(token),
    });
    expect(session.json().user.groups.map((g) => g.name)).toEqual(['Défaut', 'Commerciaux']);
    expect(session.json().user.rights).toEqual({ infographic: true });
  });

  it('les droits suivent les groupes : cumulatifs, et retirés avec le dernier groupe qui les donnait', async () => {
    const seed = baseSeed();
    seed.userGroups[0].infographicAllowed = false;
    seed.userGroups[1].infographicAllowed = true;
    const { app } = buildTestApp({ seed });
    // OTHER est dans Défaut (refuse) ET Commerciaux (accorde) : il a le droit.
    const other = await getAs(app, '/api/init', OTHER);
    expect(other.json().rights).toEqual({ infographic: true });
    // USER n'est que dans Défaut : pas de droit.
    const user = await getAs(app, '/api/init', USER);
    expect(user.json().rights).toEqual({ infographic: false });
  });
});
