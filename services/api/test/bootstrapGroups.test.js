/**
 * Groupe par défaut et appartenance des comptes existants au démarrage
 * (lib/bootstrap.js, seedDefaultGroup).
 *
 * L'invariant « un compte est toujours dans au moins un groupe » tient à la
 * lecture (`normalizeGroupIds`) ; ce passage le fait tenir AUSSI en base, là
 * où la liste des membres du groupe par défaut interroge l'index.
 */
import { describe, it, expect } from 'vitest';
import { bootstrap, seedDefaultGroup } from '../lib/bootstrap.js';
import { createFakeDb, userDoc, defaultGroupDoc } from './helpers.js';
import { DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME } from '../lib/repositories/groups.js';

const SILENT = { info() {}, warn() {}, error() {} };

const groupsOf = (db, email) => db.data.get('user').find((u) => u.emailLower === email).groupIds;

describe('seedDefaultGroup', () => {
  it('crée le groupe par défaut sur une base qui n en a pas', async () => {
    const db = createFakeDb({ user: [userDoc('a@client.fr')] });
    const res = await seedDefaultGroup(db, SILENT);
    expect(res.created).toBe(true);
    const group = db.data.get('userGroups').find((g) => g.id === DEFAULT_GROUP_ID);
    // Il naît illimité et AVEC le droit aux infographies : restreindre est une
    // décision d'administration, jamais un effet de l'installation.
    expect(group).toMatchObject({
      name: DEFAULT_GROUP_NAME,
      isDefault: true,
      meetingMinutesPerMonth: null,
      infographicAllowed: true,
    });
  });

  it('inscrit dans le groupe par défaut les comptes sans champ, vidés ou à null', async () => {
    const db = createFakeDb({
      user: [
        userDoc('sans@client.fr'),
        userDoc('vide@client.fr', { groupIds: [] }),
        userDoc('nul@client.fr', { groupIds: null }),
        userDoc('deja@client.fr', { groupIds: ['g-sales'] }),
      ],
      userGroups: [defaultGroupDoc()],
    });
    const res = await seedDefaultGroup(db, SILENT);
    expect(res).toEqual({ created: false, backfilled: 3 });
    expect(groupsOf(db, 'sans@client.fr')).toEqual([DEFAULT_GROUP_ID]);
    expect(groupsOf(db, 'vide@client.fr')).toEqual([DEFAULT_GROUP_ID]);
    expect(groupsOf(db, 'nul@client.fr')).toEqual([DEFAULT_GROUP_ID]);
    // Un compte déjà rangé ailleurs n'est pas ramené dans le groupe par défaut.
    expect(groupsOf(db, 'deja@client.fr')).toEqual(['g-sales']);
  });

  it('garde le nom qu un administrateur a donné au groupe par défaut', async () => {
    const db = createFakeDb({ userGroups: [defaultGroupDoc({ name: 'Tout le monde' })] });
    await seedDefaultGroup(db, SILENT);
    expect(db.data.get('userGroups')).toHaveLength(1);
    expect(db.data.get('userGroups')[0].name).toBe('Tout le monde');
  });

  it('est idempotent', async () => {
    const db = createFakeDb({ user: [userDoc('a@client.fr')] });
    await seedDefaultGroup(db, SILENT);
    expect(await seedDefaultGroup(db, SILENT)).toEqual({ created: false, backfilled: 0 });
    expect(db.data.get('userGroups')).toHaveLength(1);
  });

  it('ne bloque pas le démarrage si la base refuse', async () => {
    const db = {
      collection: () => ({
        updateOne() {
          throw new Error('base indisponible');
        },
        updateMany() {
          throw new Error('base indisponible');
        },
      }),
    };
    await expect(seedDefaultGroup(db, SILENT)).resolves.toEqual({ created: false, backfilled: 0 });
  });
});

describe('au démarrage', () => {
  it('un administrateur désigné par ADMIN_EMAILS naît dans le groupe par défaut, qui existe', async () => {
    const db = createFakeDb({ user: [userDoc('a@client.fr')] });
    const config = {
      adminSeed: { enabled: false, email: '', password: '' },
      legacyAdminDomain: '',
      adminEmails: ['chef@client.fr'],
      adminEmailDomains: [],
    };
    await bootstrap(db, config, SILENT, {});

    expect(db.data.get('userGroups').map((g) => g.id)).toEqual([DEFAULT_GROUP_ID]);
    expect(groupsOf(db, 'chef@client.fr')).toEqual([DEFAULT_GROUP_ID]);
    expect(groupsOf(db, 'a@client.fr')).toEqual([DEFAULT_GROUP_ID]);
    // Les index qui portent la lecture par groupe sont posés.
    const indexes = db.calls
      .filter((c) => c.op === 'createIndex')
      .map((c) => [c.collection, c.spec]);
    expect(indexes).toContainEqual(['user', { groupIds: 1 }]);
    expect(indexes).toContainEqual(['userGroups', { id: 1 }]);
  });
});
