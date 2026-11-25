/**
 * Groupes fixes et appartenance des comptes existants au démarrage
 * (lib/bootstrap.js, seedGroups).
 *
 * L'invariant « un compte est toujours dans un groupe, et un seul » tient à la
 * lecture (`groupIdOf`) ; ce passage le fait tenir AUSSI en base, là où la
 * liste des membres d'un groupe interroge l'index. Il place aussi, une seule
 * fois, les administrateurs dans le groupe « Admin » à sa naissance.
 */
import { describe, it, expect } from 'vitest';
import { bootstrap, seedGroups } from '../lib/bootstrap.js';
import { createFakeDb, userDoc, groupDoc, defaultGroupDoc, adminGroupDoc } from './helpers.js';
import {
  ADMIN_GROUP_ID,
  ADMIN_GROUP_NAME,
  DEFAULT_GROUP_ID,
  DEFAULT_GROUP_NAME,
} from '../lib/repositories/groups.js';

const SILENT = { info() {}, warn() {}, error() {} };

const groupsOf = (db, email) => db.data.get('user').find((u) => u.emailLower === email).groupIds;
const groupById = (db, id) => db.data.get('userGroups').find((g) => g.id === id);

describe('seedGroups', () => {
  it('crée les deux groupes fixes sur une base qui n en a pas', async () => {
    const db = createFakeDb({ user: [userDoc('a@client.fr')] });
    const res = await seedGroups(db, SILENT);
    expect(res).toMatchObject({ created: true, adminCreated: true });
    // Ils naissent illimités et AVEC le droit aux infographies : restreindre
    // est une décision d'administration, jamais un effet de l'installation.
    expect(groupById(db, DEFAULT_GROUP_ID)).toMatchObject({
      name: DEFAULT_GROUP_NAME,
      isDefault: true,
      meetingMinutesPerMonth: null,
      infographicAllowed: true,
    });
    expect(groupById(db, ADMIN_GROUP_ID)).toMatchObject({
      name: ADMIN_GROUP_NAME,
      isDefault: false,
      meetingMinutesPerMonth: null,
      infographicAllowed: true,
    });
  });

  it('à sa naissance, le groupe Admin reçoit les administrateurs existants, d où qu ils viennent', async () => {
    const db = createFakeDb({
      user: [
        userDoc('chef@client.fr', { role: 'admin', groupIds: [DEFAULT_GROUP_ID] }),
        userDoc('dg@client.fr', { role: 'admin', groupIds: ['g-dir', DEFAULT_GROUP_ID] }),
        userDoc('simple@client.fr', { groupIds: [DEFAULT_GROUP_ID] }),
      ],
      userGroups: [defaultGroupDoc(), groupDoc('g-dir', { name: 'Direction' })],
    });
    const res = await seedGroups(db, SILENT);
    expect(res).toMatchObject({ adminCreated: true, admins: 2 });
    expect(groupsOf(db, 'chef@client.fr')).toEqual([ADMIN_GROUP_ID]);
    expect(groupsOf(db, 'dg@client.fr')).toEqual([ADMIN_GROUP_ID]);
    expect(groupsOf(db, 'simple@client.fr')).toEqual([DEFAULT_GROUP_ID]);
  });

  it('une fois le groupe Admin né, un administrateur placé ailleurs y reste', async () => {
    const db = createFakeDb({
      user: [userDoc('chef@client.fr', { role: 'admin', groupIds: ['g-dir'] })],
      userGroups: [defaultGroupDoc(), adminGroupDoc(), groupDoc('g-dir', { name: 'Direction' })],
    });
    const res = await seedGroups(db, SILENT);
    expect(res).toMatchObject({ adminCreated: false, admins: 0 });
    expect(groupsOf(db, 'chef@client.fr')).toEqual(['g-dir']);
  });

  it('ramène à un seul groupe un compte qui en a plusieurs : celui qui lui donnait ses minutes', async () => {
    const db = createFakeDb({
      user: [
        // « Défaut » illimité l'emportait sur les 600 min des Commerciaux.
        userDoc('a@client.fr', { groupIds: [DEFAULT_GROUP_ID, 'g-sales'] }),
        // Les deux limités : le plus généreux.
        userDoc('b@client.fr', { groupIds: ['g-sales', 'g-intern'] }),
        // Quota égal : celui qui donne les infographies.
        userDoc('c@client.fr', { groupIds: ['g-intern', 'g-design'] }),
        // Tout égal : un autre que le groupe par défaut, choisi par l'administration.
        userDoc('d@client.fr', { groupIds: [DEFAULT_GROUP_ID, 'g-open'] }),
        userDoc('seul@client.fr', { groupIds: ['g-sales'] }),
        // La reprise réécrit chaque compte par son `_id`, que Mongo donne à tout document.
      ].map((doc, i) => ({ _id: `u-${i}`, ...doc })),
      userGroups: [
        defaultGroupDoc(),
        adminGroupDoc(),
        groupDoc('g-sales', { name: 'Commerciaux', meetingMinutesPerMonth: 600 }),
        groupDoc('g-intern', { name: 'Stagiaires', meetingMinutesPerMonth: 60 }),
        groupDoc('g-design', {
          name: 'Design',
          meetingMinutesPerMonth: 60,
          infographicAllowed: true,
        }),
        groupDoc('g-open', {
          name: 'Ouvert',
          meetingMinutesPerMonth: null,
          infographicAllowed: true,
        }),
      ],
    });
    const res = await seedGroups(db, SILENT);
    expect(res.reduced).toBe(4);
    expect(groupsOf(db, 'a@client.fr')).toEqual([DEFAULT_GROUP_ID]);
    expect(groupsOf(db, 'b@client.fr')).toEqual(['g-sales']);
    expect(groupsOf(db, 'c@client.fr')).toEqual(['g-design']);
    expect(groupsOf(db, 'd@client.fr')).toEqual(['g-open']);
    expect(groupsOf(db, 'seul@client.fr')).toEqual(['g-sales']);
  });

  it('inscrit dans le groupe par défaut les comptes sans champ, vidés ou à null', async () => {
    const db = createFakeDb({
      user: [
        userDoc('sans@client.fr'),
        userDoc('vide@client.fr', { groupIds: [] }),
        userDoc('nul@client.fr', { groupIds: null }),
        userDoc('deja@client.fr', { groupIds: ['g-sales'] }),
      ],
      userGroups: [defaultGroupDoc(), adminGroupDoc()],
    });
    const res = await seedGroups(db, SILENT);
    expect(res).toEqual({
      created: false,
      adminCreated: false,
      admins: 0,
      reduced: 0,
      backfilled: 3,
    });
    expect(groupsOf(db, 'sans@client.fr')).toEqual([DEFAULT_GROUP_ID]);
    expect(groupsOf(db, 'vide@client.fr')).toEqual([DEFAULT_GROUP_ID]);
    expect(groupsOf(db, 'nul@client.fr')).toEqual([DEFAULT_GROUP_ID]);
    // Un compte déjà rangé ailleurs n'est pas ramené dans le groupe par défaut.
    expect(groupsOf(db, 'deja@client.fr')).toEqual(['g-sales']);
  });

  it('garde les noms que l administration a donnés aux groupes fixes', async () => {
    const db = createFakeDb({
      userGroups: [
        defaultGroupDoc({ name: 'Tout le monde' }),
        adminGroupDoc({ name: 'Équipe IT' }),
      ],
    });
    await seedGroups(db, SILENT);
    expect(db.data.get('userGroups')).toHaveLength(2);
    expect(groupById(db, DEFAULT_GROUP_ID).name).toBe('Tout le monde');
    expect(groupById(db, ADMIN_GROUP_ID).name).toBe('Équipe IT');
  });

  it('ne double pas un groupe « Admin » que l installation avait déjà créé', async () => {
    const db = createFakeDb({
      userGroups: [defaultGroupDoc(), groupDoc('g-old', { name: 'admin' })],
    });
    await seedGroups(db, SILENT);
    expect(groupById(db, ADMIN_GROUP_ID).name).toBe('Administrateurs');
    expect(groupById(db, 'g-old').name).toBe('admin');
  });

  it('est idempotent', async () => {
    const db = createFakeDb({
      user: [userDoc('a@client.fr'), userDoc('chef@client.fr', { role: 'admin' })],
    });
    await seedGroups(db, SILENT);
    expect(await seedGroups(db, SILENT)).toEqual({
      created: false,
      adminCreated: false,
      admins: 0,
      reduced: 0,
      backfilled: 0,
    });
    expect(db.data.get('userGroups')).toHaveLength(2);
    expect(groupsOf(db, 'chef@client.fr')).toEqual([ADMIN_GROUP_ID]);
  });

  it('ne bloque pas le démarrage si la base refuse', async () => {
    const db = {
      collection: () => ({
        findOne() {
          throw new Error('base indisponible');
        },
        updateOne() {
          throw new Error('base indisponible');
        },
        updateMany() {
          throw new Error('base indisponible');
        },
      }),
    };
    await expect(seedGroups(db, SILENT)).resolves.toEqual({
      created: false,
      adminCreated: false,
      admins: 0,
      reduced: 0,
      backfilled: 0,
    });
  });
});

describe('au démarrage', () => {
  const config = (over = {}) => ({
    adminSeed: { enabled: false, email: '', password: '' },
    legacyAdminDomain: '',
    adminEmails: [],
    adminEmailDomains: [],
    ...over,
  });

  it('un administrateur désigné par ADMIN_EMAILS naît dans le groupe Admin, qui existe', async () => {
    const db = createFakeDb({ user: [userDoc('a@client.fr')] });
    await bootstrap(db, config({ adminEmails: ['chef@client.fr'] }), SILENT, {});

    expect(db.data.get('userGroups').map((g) => g.id)).toEqual([DEFAULT_GROUP_ID, ADMIN_GROUP_ID]);
    expect(groupsOf(db, 'chef@client.fr')).toEqual([ADMIN_GROUP_ID]);
    expect(groupsOf(db, 'a@client.fr')).toEqual([DEFAULT_GROUP_ID]);
    // Les index qui portent la lecture par groupe sont posés.
    const indexes = db.calls
      .filter((c) => c.op === 'createIndex')
      .map((c) => [c.collection, c.spec]);
    expect(indexes).toContainEqual(['user', { groupIds: 1 }]);
    expect(indexes).toContainEqual(['userGroups', { id: 1 }]);
  });

  it('une promotion par ADMIN_EMAILS ou ADMIN_EMAIL_DOMAINS fait entrer dans le groupe Admin', async () => {
    const db = createFakeDb({
      user: [
        userDoc('chef@client.fr', { groupIds: ['g-sales'] }),
        userDoc('it@interne.fr', { groupIds: [DEFAULT_GROUP_ID] }),
        userDoc('dejà@client.fr', { role: 'admin', groupIds: ['g-sales'] }),
      ],
      userGroups: [defaultGroupDoc(), adminGroupDoc(), groupDoc('g-sales')],
    });
    await bootstrap(
      db,
      config({
        adminEmails: ['chef@client.fr', 'dejà@client.fr'],
        adminEmailDomains: ['interne.fr'],
      }),
      SILENT,
      {},
    );
    expect(groupsOf(db, 'chef@client.fr')).toEqual([ADMIN_GROUP_ID]);
    expect(groupsOf(db, 'it@interne.fr')).toEqual([ADMIN_GROUP_ID]);
    // Déjà administrateur : pas une promotion, son placement ne bouge pas.
    expect(groupsOf(db, 'dejà@client.fr')).toEqual(['g-sales']);
  });

  it('le compte d amorçage naît dans le groupe Admin', async () => {
    const db = createFakeDb();
    await bootstrap(
      db,
      config({
        adminSeed: { enabled: true, email: 'admin@client.fr', password: 'Un-mot-de-passe-1!' },
      }),
      SILENT,
      {},
    );
    expect(groupsOf(db, 'admin@client.fr')).toEqual([ADMIN_GROUP_ID]);
  });
});
