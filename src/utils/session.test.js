// @vitest-environment jsdom
/**
 * Session localStorage : l'identité de la réunion affichée fait PARTIE de
 * l'instantané.
 *
 * Le test central est « l'identifiant restauré est celui sauvé avec le
 * contenu » : sans lui, un rechargement restaurait résumé et transcription
 * mais plus leur cible d'écriture — le tag disparaissait des écrans
 * résumé/transcription, et la génération suivante partait sans meetingId, que
 * le serveur prenait pour une réunion NEUVE : conversations en double dans
 * l'historique (mesuré le 2026-08-28).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveSessionData,
  saveMeetingNotesDraft,
  restoreSessionData,
  clearSessionData,
} from './session.js';

const DEFAULT_SUMMARY = 'Votre résumé apparaîtra ici.';
const getDefaultSummaryTextFor = () => DEFAULT_SUMMARY;

/** Instantané minimal valide — chaque test surcharge ce qu'il mesure. */
const snapshot = (over = {}) => ({
  transcriptionHistory: [{ text: 'Bonjour', isDelta: false }],
  transcriptionFullText: 'Bonjour',
  detectedActions: [],
  meetingNotes: '',
  summaryText: DEFAULT_SUMMARY,
  summaryVersions: [],
  activeVersionId: null,
  currentMeetingId: 'm-live-1',
  getDefaultSummaryTextFor,
  currentLanguage: 'fr',
  ...over,
});

const restore = () => restoreSessionData({ getDefaultSummaryTextFor, currentLanguage: 'fr' });

beforeEach(() => localStorage.clear());

describe('currentMeetingId — identité de la réunion affichée', () => {
  it("restaure l'identifiant sauvé avec le contenu", () => {
    saveSessionData(snapshot());
    expect(restore().currentMeetingId).toBe('m-live-1');
  });

  it('null quand rien ne le porte (nouvelle réunion, données antérieures)', () => {
    saveSessionData(snapshot({ currentMeetingId: null }));
    expect(restore().currentMeetingId).toBe(null);
  });

  it("null efface un identifiant précédent — pas d'écran neuf collé à une vieille réunion", () => {
    saveSessionData(snapshot());
    saveSessionData(snapshot({ currentMeetingId: null }));
    expect(restore().currentMeetingId).toBe(null);
  });

  it('`undefined` ne touche pas la clé (appelant d’avant le champ)', () => {
    saveSessionData(snapshot());
    const { currentMeetingId: _omitted, ...sans } = snapshot();
    saveSessionData(sans);
    expect(restore().currentMeetingId).toBe('m-live-1');
  });

  it('clearSessionData la retire avec le reste', () => {
    saveSessionData(snapshot());
    clearSessionData();
    expect(restore().currentMeetingId).toBe(null);
  });
});

describe('restoreSessionData — parité avec la restauration historique', () => {
  it('rend des défauts sûrs sur stockage vide', () => {
    expect(restore()).toEqual({
      transcriptionHistory: [],
      transcriptionFullText: '',
      detectedActions: [],
      meetingNotes: '',
      summaryText: '',
      actionIdCounter: 0,
      summaryVersions: [],
      activeVersionId: null,
      currentMeetingId: null,
    });
  });

  it('écarte les versions encore en génération et suit la version active', () => {
    saveSessionData(
      snapshot({
        summaryVersions: [
          { id: 'v1', html: '<p>V1</p>' },
          { id: 'v2', html: '<p>V2</p>' },
          { id: 'v3', html: '', pending: true },
        ],
        activeVersionId: 'v1',
        summaryText: '<p>V1</p>',
      }),
    );
    const r = restore();
    expect(r.summaryVersions.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(r.activeVersionId).toBe('v1');
    // Le texte affiché est celui de la version active, pas la dernière écrite.
    expect(r.summaryText).toBe('<p>V1</p>');
  });

  it("replie sur la dernière version quand l'active a disparu", () => {
    saveSessionData(
      snapshot({
        summaryVersions: [
          { id: 'v1', html: '<p>V1</p>' },
          { id: 'v2', html: '<p>V2</p>' },
        ],
        activeVersionId: 'v-disparue',
      }),
    );
    const r = restore();
    expect(r.activeVersionId).toBe('v2');
    expect(r.summaryText).toBe('<p>V2</p>');
  });

  it('ne restaure pas un summaryText égal au texte par défaut', () => {
    saveSessionData(snapshot({ summaryText: DEFAULT_SUMMARY }));
    expect(restore().summaryText).toBe('');
  });

  it('attribue un id aux actions restaurées qui n’en ont pas (données anciennes)', () => {
    saveSessionData(snapshot({ detectedActions: [{ title: 'Relancer Globex' }] }));
    const r = restore();
    expect(r.detectedActions).toHaveLength(1);
    expect(r.detectedActions[0].id).toBeTruthy();
    expect(r.actionIdCounter).toBeGreaterThan(0);
  });

  it('le brouillon des notes, écrit à la frappe, est celui que restaure un rechargement', () => {
    // Les notes partent en base au fil de la frappe : si la copie locale
    // n'était écrite qu'au blur, un rechargement réafficherait une version
    // plus ancienne que la base.
    saveSessionData(snapshot({ meetingNotes: 'Au dernier blur' }));
    expect(saveMeetingNotesDraft('Tapé depuis, sans quitter le champ', 'm-live-1')).toBe(true);
    expect(restore().meetingNotes).toBe('Tapé depuis, sans quitter le champ');
    // Une seule clé : le reste de l'instantané n'est pas réécrit.
    expect(restore().transcriptionFullText).toBe('Bonjour');
  });

  it('refuse le brouillon d’une AUTRE réunion que celle de la session locale', () => {
    // Sinon, au rechargement, les notes de B seraient restaurées avec la
    // transcription et l'identifiant de L — et écrites dans L.
    saveSessionData(snapshot({ currentMeetingId: 'm-L', meetingNotes: 'Notes de L' }));
    expect(saveMeetingNotesDraft('Notes de B', 'm-B')).toBe(false);
    expect(restore().meetingNotes).toBe('Notes de L');
  });

  it('vide les textes de remplacement d’autrefois des actions restaurées', () => {
    saveSessionData(
      snapshot({
        detectedActions: [{ id: 1, title: 'New action', owner: 'To be decided', description: '' }],
      }),
    );
    expect(restore().detectedActions[0]).toMatchObject({ id: 1, title: '', owner: '' });
  });
});
