/**
 * Reprendre une réunion TERMINÉE. Ce que ces tests protègent : la suite
 * repart du bon chronomètre — celui de CETTE réunion, pas de la dernière
 * enregistrée sur le poste — et le crédit affiché ne déduit pas deux fois ce
 * que le serveur a déjà compté.
 */
import { describe, it, expect } from 'vitest';
import { planMeetingResume, resumeMarkerParts } from './meetingResume.js';

const LINES = [{ text: 'Bonjour à tous.' }, { text: 'Premier point.' }];

describe('planMeetingResume — le chronomètre', () => {
  it('réunion tout juste arrêtée : le chronomètre du poste, la base n’a pas encore reçu l’arrêt', () => {
    const plan = planMeetingResume({ history: LINES, fromArchive: false, liveClockS: 1250 });
    expect(plan.clockS).toBe(1250);
    expect(plan.countedS).toBe(1250);
  });

  it('réunion tout juste arrêtée, base à jour : la plus longue des deux', () => {
    expect(
      planMeetingResume({
        history: LINES,
        fromArchive: false,
        listedDuration: 1250,
        liveClockS: 1249,
      }).clockS,
    ).toBe(1250);
  });

  it('archive rouverte : la durée EN BASE, jamais le chronomètre de la dernière réunion du poste', () => {
    // Le poste a enregistré une autre réunion de 2 h juste avant : la reprise
    // de celle-ci (20 min) ne doit pas repartir de 2 h.
    const plan = planMeetingResume({
      history: LINES,
      fromArchive: true,
      listedDuration: 1200,
      archiveDuration: 1200,
      liveClockS: 7200,
    });
    expect(plan.clockS).toBe(1200);
  });

  it('« Enregistrer » sélectionne sans recharger l’archive : la liste fait foi, pas la durée lue à la dernière ouverture', () => {
    const plan = planMeetingResume({
      history: LINES,
      fromArchive: true,
      listedDuration: 900,
      archiveDuration: 3600, // celle d'une AUTRE archive ouverte plus tôt
    });
    expect(plan.clockS).toBe(900);
  });

  it('liste sans durée (hors ligne, import) : la durée lue à l’ouverture de l’archive', () => {
    expect(
      planMeetingResume({
        history: LINES,
        fromArchive: true,
        listedDuration: null,
        archiveDuration: 640,
      }).clockS,
    ).toBe(640);
    // Hors archive, une durée d'ouverture traînante n'appartient pas à cette réunion.
    expect(
      planMeetingResume({
        history: LINES,
        fromArchive: false,
        archiveDuration: 640,
        liveClockS: 30,
      }).clockS,
    ).toBe(30);
  });

  it('jamais en base (arrêt hors ligne) : rien n’est compté côté serveur, tout se déduit en direct', () => {
    const plan = planMeetingResume({
      history: LINES,
      fromArchive: false,
      liveClockS: 300,
      inBase: false,
    });
    expect(plan.clockS).toBe(300);
    expect(plan.countedS).toBe(0);
  });

  it('valeurs illisibles : zéro, jamais NaN ni négatif', () => {
    const plan = planMeetingResume({
      history: LINES,
      fromArchive: true,
      listedDuration: 'n/a',
      archiveDuration: -5,
    });
    expect(plan.clockS).toBe(0);
  });
});

describe('planMeetingResume — la transcription', () => {
  it('retire la ligne vide d’une archive sans transcription, garde marqueurs et texte', () => {
    const marker = { text: '', offlineGapId: 'lost-gap-1' };
    const plan = planMeetingResume({
      history: [{ time: '', text: '' }, ...LINES, marker, { text: '   ' }],
      fromArchive: true,
    });
    expect(plan.history).toEqual([...LINES, marker]);
  });

  it('ne modifie pas le tableau reçu', () => {
    const history = [{ text: '' }, ...LINES];
    planMeetingResume({ history, fromArchive: true });
    expect(history).toHaveLength(3);
  });
});

describe('resumeMarkerParts', () => {
  const at = new Date(2026, 10, 18, 14, 5);

  it('date en toutes lettres et heure, dans la langue de l’interface', () => {
    expect(resumeMarkerParts(at, 'fr')).toEqual({ date: '18 novembre', time: '14:05' });
    expect(resumeMarkerParts(at, 'en').date).toBe('November 18');
    expect(resumeMarkerParts(at, 'en').time).toMatch(/^0?2:05\s?PM$/);
  });

  it('langue inconnue : le français', () => {
    expect(resumeMarkerParts(at, 'de')).toEqual(resumeMarkerParts(at, 'fr'));
  });
});
