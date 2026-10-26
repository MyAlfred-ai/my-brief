/**
 * Comptes sans adresse supprimés au démarrage (lib/bootstrap.js).
 *
 * La forme testée est celle relevée en production Fabrikam : le /init n8n
 * upsertait le document `user` sur l'en-tête `x-user-email` et écrivait `null`
 * pour tout champ absent, puis `migrateRoles` lui a donné un rôle.
 * L'administration l'affichait « null », sans pouvoir le modifier ni le
 * supprimer.
 */
import { describe, it, expect } from 'vitest';
import { bootstrap, removeAddresslessUsers } from '../lib/bootstrap.js';
import { createFakeDb, userDoc } from './helpers.js';

const SILENT = { info() {}, warn() {}, error() {} };

/** Un compte réel. Le fake n'attribue pas d'`_id` : on le pose. */
const account = (id, email) => ({ _id: id, ...userDoc(email) });

/** Le compte fantôme tel que n8n l'a laissé. */
const n8nGhost = (id) => ({
  _id: id,
  email: null,
  name: null,
  lastConnection: null,
  role: 'user',
});

function capture() {
  const lines = [];
  return { logger: { info() {}, warn: (m) => lines.push(m), error() {} }, lines };
}

const idsOf = (db) => db.data.get('user').map((d) => d._id);

describe('removeAddresslessUsers', () => {
  it('supprime le compte fantôme laissé par n8n', async () => {
    const db = createFakeDb({ user: [account('a', 'a@client.fr'), n8nGhost('ghost')] });
    expect(await removeAddresslessUsers(db, SILENT)).toBe(1);
    expect(idsOf(db)).toEqual(['a']);
  });

  it('supprime aussi une adresse absente ou blanche', async () => {
    const db = createFakeDb({
      user: [
        account('a', 'a@client.fr'),
        { _id: 'sans-champ', role: 'user' },
        { _id: 'blanche', email: '   ', emailLower: '' },
      ],
    });
    expect(await removeAddresslessUsers(db, SILENT)).toBe(2);
    expect(idsOf(db)).toEqual(['a']);
  });

  it('garde un compte historique que le backfill n’a pas encore atteint', async () => {
    // Sans `emailLower`, il est candidat par la requête : c'est son adresse
    // brute qui le sauve.
    const db = createFakeDb({
      user: [account('a', 'a@client.fr'), { _id: 'legacy', email: 'Legacy@client.fr' }],
    });
    expect(await removeAddresslessUsers(db, SILENT)).toBe(0);
    expect(idsOf(db)).toEqual(['a', 'legacy']);
  });

  it('garde un compte joignable par emailLower, même sans email brut', async () => {
    // La connexion le retrouve par `emailLower` : il n'est pas inaccessible.
    const db = createFakeDb({
      user: [account('a', 'a@client.fr'), { _id: 'lower', email: null, emailLower: 'b@client.fr' }],
    });
    expect(await removeAddresslessUsers(db, SILENT)).toBe(0);
    expect(idsOf(db)).toEqual(['a', 'lower']);
  });

  it('ne touche à aucune donnée métier', async () => {
    // Une purge sur une adresse nulle retrouverait TOUT document sans email :
    // seul le document `user` doit partir.
    const db = createFakeDb({
      user: [account('a', 'a@client.fr'), n8nGhost('ghost')],
      resume: [
        { meetingId: 'm1', email: null },
        { meetingId: 'm2', email: 'a@client.fr' },
      ],
    });
    await removeAddresslessUsers(db, SILENT);

    expect(db.data.get('resume')).toHaveLength(2);
    const deletions = db.calls.filter((c) => c.op.startsWith('delete'));
    expect(deletions).toEqual([{ collection: 'user', op: 'deleteOne', filter: { _id: 'ghost' } }]);
  });

  it('ne vide jamais la collection : elle passerait pour une base vierge', async () => {
    // `seedAdmin` y créerait le compte d'amorçage au mot de passe par défaut.
    const { logger, lines } = capture();
    const db = createFakeDb({ user: [n8nGhost('ghost')] });

    expect(await removeAddresslessUsers(db, logger)).toBe(0);
    expect(idsOf(db)).toEqual(['ghost']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/CONSERVÉ/);
    expect(lines[0]).toMatch(/amorçage/);
  });

  it("journalise l'_id de chaque compte supprimé, pour le retrouver dans la sauvegarde", async () => {
    const { logger, lines } = capture();
    const db = createFakeDb({ user: [account('a', 'a@client.fr'), n8nGhost('ghost-42')] });

    await removeAddresslessUsers(db, logger);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('_id ghost-42');
  });

  it('est idempotente : un second passage ne supprime plus rien', async () => {
    const db = createFakeDb({ user: [account('a', 'a@client.fr'), n8nGhost('ghost')] });
    expect(await removeAddresslessUsers(db, SILENT)).toBe(1);
    expect(await removeAddresslessUsers(db, SILENT)).toBe(0);
  });

  it('ne bloque pas le démarrage si la base refuse la lecture', async () => {
    const db = {
      collection: () => ({
        find() {
          throw new Error('base indisponible');
        },
      }),
    };
    await expect(removeAddresslessUsers(db, SILENT)).resolves.toBe(0);
  });
});

describe('au démarrage', () => {
  it("le compte fantôme a disparu, sans déclencher le compte d'amorçage", async () => {
    const db = createFakeDb({ user: [account('a', 'a@client.fr'), n8nGhost('ghost')] });
    const config = {
      adminSeed: { enabled: true, email: 'admin@example.test', password: 'Seed-Password-2026' },
      legacyAdminDomain: '',
      adminEmails: [],
      adminEmailDomains: [],
    };
    await bootstrap(db, config, SILENT, {});

    expect(idsOf(db)).toEqual(['a']);
    expect(db.data.get('user').some((d) => d.emailLower === 'admin@example.test')).toBe(false);
  });
});
