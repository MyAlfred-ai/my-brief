import { describe, it, expect } from 'vitest';
import { SegmentLedger } from './offlineRecording.js';

/**
 * SegmentLedger = comptabilité pure segments/gaps de la capture hors ligne.
 * Scénario de référence : le test « mode avion en cours de réunion ».
 */
describe('SegmentLedger', () => {
  it('scénario mode avion : segments couverts → gap → retour réseau', () => {
    const ledger = new SegmentLedger();
    ledger.setLive(true);

    // Réunion en ligne : segment couvert par le live.
    ledger.openSegment(0, 0);
    // Mode avion : le live tombe → un gap s'ouvre.
    const { gapOpened } = ledger.setLive(false);
    expect(gapOpened).toBe('gap-1');
    ledger.closeSegment(0, 60, 'seg-000.webm');

    // Segments enregistrés pendant la coupure.
    ledger.openSegment(1, 60);
    ledger.closeSegment(1, 360, 'seg-001.webm');
    ledger.openSegment(2, 360);

    // Le segment couvert n'est jamais en file d'upload.
    expect(ledger.pendingUploads().map((s) => s.index)).toEqual([1]);

    // Sortie du mode avion : le gap se ferme, dernier segment finalisé.
    expect(ledger.setLive(true).gapOpened).toBeNull();
    ledger.closeSegment(2, 420, 'seg-002.webm');
    expect(ledger.gapSegments('gap-1').map((s) => s.index)).toEqual([1, 2]);

    // Transcription différée segment par segment, dans le désordre.
    ledger.markUploaded(2, 'deuxième partie.');
    expect(ledger.gapCompleted('gap-1')).toBe(false);
    ledger.markUploaded(1, 'Première partie,');
    expect(ledger.gapCompleted('gap-1')).toBe(true);
    // Texte reconstitué en ordre chronologique, pas en ordre d'upload.
    expect(ledger.gapText('gap-1')).toBe('Première partie, deuxième partie.');
  });

  it("un gap encore OUVERT n'est jamais complet (le réseau peut revenir avant le live)", () => {
    const ledger = new SegmentLedger();
    ledger.setLive(false);
    ledger.openSegment(0, 0);
    ledger.closeSegment(0, 300, 'seg-000.webm');
    ledger.markUploaded(0, 'texte');
    // Tous les segments transcrits, mais la coupure n'est pas finie.
    expect(ledger.gapCompleted('gap-1')).toBe(false);
    ledger.setLive(true);
    expect(ledger.gapCompleted('gap-1')).toBe(true);
  });

  it('double perte / double retour : un seul gap par coupure, gaps distincts par coupure', () => {
    const ledger = new SegmentLedger();
    expect(ledger.setLive(false).gapOpened).toBe('gap-1');
    expect(ledger.setLive(false).gapOpened).toBeNull(); // déjà en coupure
    ledger.setLive(true);
    expect(ledger.setLive(false).gapOpened).toBe('gap-2'); // nouvelle coupure
  });

  it('segment sans données (double rotation) réglé sans upload', () => {
    const ledger = new SegmentLedger();
    ledger.setLive(false);
    ledger.openSegment(0, 0);
    ledger.closeSegment(0, 0, null); // aucun chunk produit
    ledger.setLive(true);
    expect(ledger.pendingUploads()).toHaveLength(0);
    expect(ledger.gapCompleted('gap-1')).toBe(true);
    expect(ledger.gapText('gap-1')).toBe('');
  });

  it('démarrage hors ligne : gap ouvert dès le premier setLive(false)', () => {
    const ledger = new SegmentLedger();
    const { gapOpened } = ledger.setLive(false);
    expect(gapOpened).toBe('gap-1');
    ledger.openSegment(0, 0);
    expect(ledger.gapSegments('gap-1')).toHaveLength(1);
  });
});
