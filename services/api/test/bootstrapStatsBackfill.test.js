/**
 * Les deux reprises de mesures au démarrage (lib/bootstrap.js) : longueur des
 * transcriptions, et durées relues dans les comptes-rendus.
 *
 * Backfill de `transcriptionChars` au démarrage.
 *
 * Pourquoi cette étape existe : l'écran Statistiques affichait « 0 » de texte
 * transcrit sur une base pleine de transcriptions. La donnée était là, seul son
 * compteur manquait — il n'est persisté que depuis le 2026-08-18, et la
 * longueur se recalcule exactement.
 *
 * Ce qui se vérifie ici : le calcul se fait DANS Mongo (pipeline `$strLenCP`,
 * aucune transcription ne remonte à l'API), il ne touche que les documents qui
 * n'ont pas le champ, et un serveur qui refuserait le pipeline ne doit pas
 * empêcher le démarrage.
 */
import { describe, it, expect } from 'vitest';
import { bootstrap } from '../lib/bootstrap.js';
import { createFakeDb, userDoc } from './helpers.js';

const SILENT = { info() {}, warn() {}, error() {} };
const bootConfig = {
  adminSeed: { enabled: false, email: '', password: '' },
  legacyAdminDomain: '',
  adminEmails: [],
  adminEmailDomains: [],
};

const resumeDoc = (over = {}) => ({
  email: 'a@client.fr',
  emailLower: 'a@client.fr',
  meetingId: 'm-1',
  lastConnecion: '2026-08-01T09:00:00.000Z',
  transcription: 'On a parlé du projet.',
  ...over,
});

describe('bootstrap — transcriptionChars', () => {
  it('mesure les transcriptions des réunions qui n’ont pas le champ', async () => {
    const db = createFakeDb({
      user: [userDoc('a@client.fr')],
      resume: [resumeDoc(), resumeDoc({ meetingId: 'm-2', transcription: 'Court.' })],
    });
    await bootstrap(db, bootConfig, SILENT, {});

    const docs = db.data.get('resume');
    expect(docs[0].transcriptionChars).toBe('On a parlé du projet.'.length);
    expect(docs[1].transcriptionChars).toBe('Court.'.length);
  });

  it('ne rapatrie AUCUNE transcription : le calcul part en pipeline', async () => {
    // Lire les transcriptions pour les mesurer ferait transiter des centaines
    // de Mo au démarrage, pour un entier par document.
    const db = createFakeDb({ resume: [resumeDoc()] });
    await bootstrap(db, bootConfig, SILENT, {});

    const reads = db.calls.filter(
      (c) => c.collection === 'resume' && (c.op === 'find' || c.op === 'findOne'),
    );
    for (const read of reads) expect(read.project?.transcription).toBeUndefined();

    const backfill = db.calls.find(
      (c) => c.collection === 'resume' && c.op === 'updateMany' && Array.isArray(c.update),
    );
    expect(backfill.update[0].$set.transcriptionChars).toEqual({ $strLenCP: '$transcription' });
  });

  it('laisse intactes les réunions déjà mesurées, et celles sans transcription', async () => {
    const db = createFakeDb({
      resume: [
        resumeDoc({ transcriptionChars: 4 }), // valeur existante : pas recalculée
        resumeDoc({ meetingId: 'm-3', transcription: undefined }),
      ],
    });
    await bootstrap(db, bootConfig, SILENT, {});

    const docs = db.data.get('resume');
    expect(docs[0].transcriptionChars).toBe(4);
    expect(docs[1].transcriptionChars).toBeUndefined();
  });

  it('rejouable : un second démarrage ne réécrit rien', async () => {
    const db = createFakeDb({ resume: [resumeDoc()] });
    await bootstrap(db, bootConfig, SILENT, {});
    const before = db.calls.filter((c) => c.op === 'updateMany' && Array.isArray(c.update)).length;
    await bootstrap(db, bootConfig, SILENT, {});
    const after = db.calls.filter((c) => c.op === 'updateMany' && Array.isArray(c.update)).length;
    // L'appel repart (il est idempotent par son filtre) mais ne matche plus rien.
    expect(after).toBe(before + 1);
    expect(db.data.get('resume')[0].transcriptionChars).toBe('On a parlé du projet.'.length);
  });

  it('un Mongo trop ancien pour les pipelines n’empêche pas le démarrage', async () => {
    // Confort de statistiques, jamais une contrainte d'intégrité : l'API doit
    // démarrer même si ce calcul est refusé.
    const db = createFakeDb({ resume: [resumeDoc()] });
    db.failNext('updateMany', new Error('update pipelines not supported'));
    await expect(bootstrap(db, bootConfig, SILENT, {})).resolves.toBeUndefined();
  });
});

/**
 * Récupération des durées dans les comptes-rendus.
 *
 * La durée n'a jamais été écrite avant le 2026-08-18 — mais elle était passée au
 * prompt, et les gabarits l'impriment. Ce backfill va la relire là où elle a
 * atterri. Sans lui, l'écran Statistiques reste sans aucune durée jusqu'à ce que
 * l'historique ait entièrement tourné.
 */
describe('bootstrap — durées relues dans les comptes-rendus', () => {
  const withSummary = (over = {}) => ({
    ...resumeDoc(),
    resume: '<p><em>Auteur : Alex — Durée : 00:42:10</em></p>',
    ...over,
  });

  it('retrouve la durée et note sa provenance', async () => {
    const db = createFakeDb({ resume: [withSummary()] });
    await bootstrap(db, bootConfig, SILENT, {});

    const doc = db.data.get('resume')[0];
    expect(doc.meetingDuration).toBe(2530);
    expect(doc.meetingDurationSource).toBe('resume');
  });

  it('ne remplace JAMAIS une durée déjà mesurée au chronomètre', async () => {
    // Le chronomètre fait autorité : le compte-rendu peut avoir été régénéré
    // avec une durée « inconnue » alors que la mesure d'origine est bonne.
    const db = createFakeDb({
      resume: [withSummary({ meetingDuration: 999, resume: '<p>Durée : 00:42:10</p>' })],
    });
    await bootstrap(db, bootConfig, SILENT, {});

    const doc = db.data.get('resume')[0];
    expect(doc.meetingDuration).toBe(999);
    expect(doc.meetingDurationSource).toBe('timer');
  });

  it('marque « unknown » un compte-rendu sans durée, et ne le relit plus', async () => {
    // Sans ce marqueur, chaque démarrage relirait le HTML de toutes les
    // réunions dont la durée est définitivement introuvable.
    const db = createFakeDb({ resume: [withSummary({ resume: '<p>Compte-rendu nu.</p>' })] });
    await bootstrap(db, bootConfig, SILENT, {});
    expect(db.data.get('resume')[0].meetingDurationSource).toBe('unknown');
    expect(db.data.get('resume')[0].meetingDuration).toBeNull();

    const readsBefore = db.calls.filter((c) => c.collection === 'resume' && c.op === 'find').length;
    await bootstrap(db, bootConfig, SILENT, {});
    const scans = db.calls
      .filter((c) => c.collection === 'resume' && c.op === 'find')
      .slice(readsBefore);
    // Le second démarrage interroge encore, mais ne ramène plus rien : aucune
    // écriture ne suit.
    const writes = db.calls.filter(
      (c) =>
        c.collection === 'resume' && c.op === 'updateOne' && c.update.$set?.meetingDurationSource,
    );
    expect(scans.length).toBeGreaterThan(0);
    expect(writes).toHaveLength(1);
  });

  it('ne lit pas les transcriptions au passage', async () => {
    // Ce backfill doit lire le résumé — pas le reste du document, qui pèse.
    const db = createFakeDb({ resume: [withSummary()] });
    await bootstrap(db, bootConfig, SILENT, {});

    const scan = db.calls.find(
      (c) => c.collection === 'resume' && c.op === 'find' && c.project?.resume === 1,
    );
    expect(scan.project.transcription).toBeUndefined();
    expect(scan.project.versions).toBeUndefined();
    expect(scan.limit).toBe(500); // lot plafonné, la suite au prochain boot
  });

  it('une panne de lecture n’empêche pas le démarrage', async () => {
    const db = createFakeDb({ resume: [withSummary()] });
    db.failNext('updateOne', new Error('mongo indisponible'));
    await expect(bootstrap(db, bootConfig, SILENT, {})).resolves.toBeUndefined();
  });
});
