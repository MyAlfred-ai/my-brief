/**
 * Un document `user` sans `emailLower` n'est pas un compte (SERVED_ACCOUNT,
 * lib/repositories/users.js).
 *
 * La forme testée est celle relevée en recette : la même adresse portée par
 * deux documents, le compte servi (avec `emailLower`, connecté aujourd'hui) et
 * un doublon inerte (sans `emailLower`, « jamais » connecté), que l'index
 * unique écarte depuis la migration. L'administration listait les deux : la
 * personne apparaissait deux fois, classée une fois avant tout le monde (une
 * clé absente se trie en tête), et les boutons de la ligne en trop agissaient
 * sur le compte servi.
 *
 * Le doublon est semé EN PREMIER : c'est l'ordre naturel qui le faisait passer
 * devant le compte servi dans les écritures ciblées par `{ email }`.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTestApp,
  createFakeDb,
  identityHeaders,
  userDoc,
  defaultGroupDoc,
  groupDoc,
} from './helpers.js';
import { backfillEmailLower } from '../lib/bootstrap.js';

const ADMIN = 'patron@client.fr';
const ALEX = 'alex@client.fr';

/** Le doublon inerte : même adresse, pas de clé, jamais connecté. */
const ghost = (email, extra = {}) => ({
  _id: `ghost-${email}`,
  email,
  name: email.split('@')[0],
  role: 'user',
  disabled: false,
  authProviders: ['oidc'],
  groupIds: ['default'],
  ...extra,
});

const seed = () => ({
  user: [
    ghost(ALEX),
    userDoc(ADMIN, { role: 'admin', groupIds: ['default'] }),
    userDoc(ALEX, {
      groupIds: ['default', 'g-myalfred'],
      lastConnecion: '2026-09-25T14:00:53.000Z',
    }),
  ],
  userGroups: [defaultGroupDoc(), groupDoc('g-myalfred', { name: 'MyAlfred', color: 'violet' })],
});

const getAs = (app, url, email = ADMIN) =>
  app.inject({ method: 'GET', url, headers: identityHeaders(email) });

const postAs = (app, url, body, email = ADMIN) =>
  app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('l administration ne montre qu une ligne par compte', () => {
  it('la liste des utilisateurs ignore le doublon inerte', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await getAs(app, '/api/admin/users');
    expect(res.statusCode).toBe(200);
    expect(res.json().users.map((u) => u.email)).toEqual([ALEX, ADMIN]);
    expect(res.json().total).toBe(2);
    // La ligne restante est le compte servi : ses deux groupes, sa connexion.
    expect(res.json().users[0]).toMatchObject({
      groupIds: ['default', 'g-myalfred'],
      lastConnecion: '2026-09-25T14:00:53.000Z',
    });
  });

  it('la recherche et le filtre par groupe aussi', async () => {
    const { app } = buildTestApp({ seed: seed() });
    expect((await getAs(app, '/api/admin/users?q=alex')).json().total).toBe(1);
    const members = (await getAs(app, '/api/admin/users?group=default')).json();
    expect(members.users.map((u) => u.email)).toEqual([ALEX, ADMIN]);
  });

  it('les effectifs des groupes ne comptent pas le doublon', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const groups = (await getAs(app, '/api/admin/groups')).json().groups;
    expect(groups.find((g) => g.id === 'default').memberCount).toBe(2);
    expect(groups.find((g) => g.id === 'g-myalfred').memberCount).toBe(1);
  });

  it('les statistiques comptent les comptes, pas les documents', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const stats = (await getAs(app, '/api/admin/stats?days=30')).json();
    expect(stats.totals.users).toBe(2);
  });
});

describe('les gardes et les écritures visent le compte servi', () => {
  it('un doublon au rôle admin ne compte pas comme un administrateur de plus', async () => {
    const s = seed();
    s.user.unshift(ghost(ADMIN, { role: 'admin' }));
    const { app } = buildTestApp({ seed: s });
    // Seul administrateur réel : se rétrograder reste refusé, doublon ou pas.
    const res = await postAs(app, '/api/admin/users/update', { email: ADMIN, role: 'user' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('last_admin');
  });

  it('supprimer le compte emporte le doublon, qui ne ressuscitera pas au démarrage', async () => {
    const s = seed();
    // Même adresse, autre casse et espace parasite : c'est la même personne.
    s.user.push(ghost(' Alex@Client.fr ', { _id: 'ghost-casse' }));
    const { app, db } = buildTestApp({ seed: s });
    const res = await postAs(app, '/api/admin/users/delete', { email: ALEX });
    expect(res.statusCode).toBe(204);
    expect(db.data.get('user').map((u) => u.email)).toEqual([ADMIN]);
  });

  it('/init met à jour le compte servi même quand le doublon passe devant', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await getAs(app, '/api/init', ALEX);
    expect(res.statusCode).toBe(200);
    const [inert, , served] = db.data.get('user');
    expect(inert.emailLower).toBeUndefined();
    expect(inert.lastConnecion).toBeUndefined();
    expect(served.lastConnecion).not.toBe('2026-09-25T14:00:53.000Z');
    expect(db.data.get('user')).toHaveLength(3);
  });
});

describe('backfillEmailLower', () => {
  const SILENT = { info() {}, warn() {}, error() {} };

  it('donne sa clé à un document dont emailLower vaut null ou vide', async () => {
    const db = createFakeDb({
      user: [
        { _id: 'a', email: 'Nul@Client.fr', emailLower: null },
        { _id: 'b', email: 'vide@client.fr', emailLower: '' },
        { _id: 'c', email: 'absent@client.fr' },
      ],
    });
    expect(await backfillEmailLower(db, SILENT)).toBe(3);
    expect(db.data.get('user').map((u) => u.emailLower)).toEqual([
      'nul@client.fr',
      'vide@client.fr',
      'absent@client.fr',
    ]);
  });

  it('laisse le doublon d une adresse déjà servie, sans toucher au compte servi', async () => {
    const warnings = [];
    const db = createFakeDb({ user: seed().user });
    expect(await backfillEmailLower(db, { ...SILENT, warn: (m) => warnings.push(m) })).toBe(0);
    expect(db.data.get('user')[0].emailLower).toBeUndefined();
    expect(db.calls.filter((c) => c.op === 'updateOne')).toEqual([]);
    // Signalé par warnDuplicateEmails, pas re-journalisé ici à chaque démarrage.
    expect(warnings).toEqual([]);
  });
});
