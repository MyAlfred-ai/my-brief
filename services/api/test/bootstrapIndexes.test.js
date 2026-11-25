/**
 * Index posés au démarrage pour les lectures qui, sans eux, chargeaient des
 * réunions entières (transcriptions comprises) dans le cache de Mongo :
 *  - le quota du mois, filtré sur `lastConnecion`, une branche par côté du
 *    `$or` d'`ownerFilter` ;
 *  - les reprises du démarrage, qui cherchent les réunions SANS
 *    `transcriptionChars` ou `meetingDurationSource` — aucune, en régime établi.
 */
import { describe, it, expect } from 'vitest';
import { bootstrap } from '../lib/bootstrap.js';
import { createFakeDb } from './helpers.js';

const SILENT = { info() {}, warn() {}, error() {} };
const config = {
  adminSeed: { enabled: false, email: '', password: '' },
  legacyAdminDomain: '',
  adminEmails: [],
  adminEmailDomains: [],
};

describe('index de la collection resume', () => {
  it('quota du mois et reprises du démarrage', async () => {
    const db = createFakeDb({});
    await bootstrap(db, config, SILENT, {});
    const indexes = db.calls
      .filter((c) => c.op === 'createIndex' && c.collection === 'resume')
      .map((c) => c.spec);
    expect(indexes).toContainEqual({ emailLower: 1, lastConnecion: 1 });
    expect(indexes).toContainEqual({ email: 1, lastConnecion: 1 });
    expect(indexes).toContainEqual({ transcriptionChars: 1 });
    expect(indexes).toContainEqual({ meetingDurationSource: 1 });
  });
});
