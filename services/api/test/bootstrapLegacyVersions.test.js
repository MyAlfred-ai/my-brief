/**
 * Reprise au démarrage des comptes rendus sans versions (lib/bootstrap.js →
 * backfillLegacyVersions, cf. lib/legacyVersion.js).
 *
 * Ce qui se vérifie ici : la version inscrite est celle qu'affiche l'écran
 * (même identifiant, même texte), seuls les documents concernés sont touchés,
 * un second démarrage ne réécrit rien, et un échec n'empêche pas l'API de
 * démarrer. La suite — un nouveau résumé qui s'ajoute à cette version — est
 * couverte par summaryVersions.test.js.
 */
import { describe, it, expect } from 'vitest';
import { bootstrap } from '../lib/bootstrap.js';
import { LEGACY_VERSION_ID } from '../lib/legacyVersion.js';
import { createFakeDb } from './helpers.js';

const SILENT = { info() {}, warn() {}, error() {} };
const bootConfig = {
  adminSeed: { enabled: false, email: '', password: '' },
  legacyAdminDomain: '',
  adminEmails: [],
  adminEmailDomains: [],
};

// Champs des autres reprises déjà posés : seule celle des versions écrit ici.
const meeting = (over = {}) => ({
  email: 'a@client.fr',
  emailLower: 'a@client.fr',
  meetingId: 'm-1',
  resume: '<p>Compte rendu n8n</p>',
  template: 'standard',
  now: '2025-06-01T10:00:00.000Z',
  transcription: 'Texte.',
  transcriptionChars: 6,
  meetingDurationSource: 'unknown',
  ...over,
});

const versionWrites = (db) =>
  db.calls.filter(
    (c) => c.collection === 'resume' && c.op === 'updateOne' && c.update.$set?.versions,
  );

describe('bootstrap — versions des comptes rendus qui n’en ont pas', () => {
  it('inscrit la version d’origine : tableau absent, nul ou vide', async () => {
    const db = createFakeDb({
      resume: [
        meeting(),
        meeting({ meetingId: 'm-2', versions: null, resume: '<p>Deux</p>' }),
        meeting({ meetingId: 'm-3', versions: [], resume: '<p>Trois</p>', template: undefined }),
      ],
    });
    await bootstrap(db, bootConfig, SILENT, {});

    const [first, second, third] = db.data.get('resume');
    expect(first.versions).toEqual([
      {
        id: LEGACY_VERSION_ID,
        html: '<p>Compte rendu n8n</p>',
        template: 'standard',
        ton: null,
        longueur: null,
        customPrompt: null,
        generatedAt: '2025-06-01T10:00:00.000Z',
      },
    ]);
    expect(second.versions.map((v) => v.html)).toEqual(['<p>Deux</p>']);
    expect(third.versions[0]).toMatchObject({ id: LEGACY_VERSION_ID, template: null });
    // Le compte rendu lui-même ne bouge pas.
    expect(first.resume).toBe('<p>Compte rendu n8n</p>');
  });

  it('ne touche ni aux réunions versionnées, ni à celles sans compte rendu', async () => {
    const versioned = [{ id: 'v1', html: '<p>V1</p>' }];
    const db = createFakeDb({
      resume: [
        meeting({ versions: versioned }),
        meeting({ meetingId: 'brouillon', resume: '', versions: [] }),
        meeting({ meetingId: 'blanc', resume: '  \n ' }),
        // Forme inconnue : on n'écrase pas ce qu'on ne sait pas lire.
        meeting({ meetingId: 'bizarre', versions: 'v1,v2' }),
        // Sans meetingId, aucune route n'y écrit : rien à reprendre.
        meeting({ meetingId: undefined }),
      ],
    });
    await bootstrap(db, bootConfig, SILENT, {});

    expect(versionWrites(db)).toEqual([]);
    const docs = db.data.get('resume');
    expect(docs[0].versions).toBe(versioned);
    expect(docs[3].versions).toBe('v1,v2');
  });

  it('deux documents au même meetingId gardent chacun leur texte', async () => {
    const db = createFakeDb({
      resume: [meeting({ resume: '<p>Premier</p>' }), meeting({ resume: '<p>Second</p>' })],
    });
    await bootstrap(db, bootConfig, SILENT, {});

    const docs = db.data.get('resume');
    expect(docs[0].versions[0].html).toBe('<p>Premier</p>');
    expect(docs[1].versions[0].html).toBe('<p>Second</p>');
  });

  it('rejouable : un second démarrage ne réécrit rien', async () => {
    const db = createFakeDb({ resume: [meeting()] });
    await bootstrap(db, bootConfig, SILENT, {});
    expect(versionWrites(db)).toHaveLength(1);

    await bootstrap(db, bootConfig, SILENT, {});
    expect(versionWrites(db)).toHaveLength(1);
    expect(db.data.get('resume')[0].versions).toHaveLength(1);
  });

  it('un échec d’écriture n’empêche pas le démarrage', async () => {
    const warnings = [];
    const log = { ...SILENT, warn: (msg) => warnings.push(msg) };
    const db = createFakeDb({ resume: [meeting()] });
    db.failNext('updateOne', new Error('panne Mongo'));

    await expect(bootstrap(db, bootConfig, log, {})).resolves.toBeUndefined();
    expect(warnings.some((w) => w.includes('versions de compte rendu'))).toBe(true);
  });
});
