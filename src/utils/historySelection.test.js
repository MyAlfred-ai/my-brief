import { describe, it, expect } from 'vitest';
import { unpackHistoryItem } from './historySelection.js';
import { LEGACY_VERSION_ID } from './summary.js';

const OPTS = { defaultSummaryText: '<p>Aucun résumé</p>', fallbackTemplate: 'standard' };

describe('unpackHistoryItem', () => {
  it('ouvre la DERNIÈRE version et la rend active', () => {
    const view = unpackHistoryItem(
      {
        resume: '<p>V1</p>',
        versions: [
          { id: 'v1', html: '<p>V1</p>' },
          { id: 'v2', html: '<p>V2</p>' },
        ],
      },
      OPTS,
    );
    expect(view.activeVersionId).toBe('v2');
    expect(view.summaryText).toContain('V2');
  });

  it('compte rendu n8n sans tableau de versions : en reconstruit une, sinon aucun onglet', () => {
    const view = unpackHistoryItem({ resume: '<p>Ancien CR</p>' }, OPTS);
    expect(view.summaryVersions).toHaveLength(1);
    // L'identifiant sous lequel le serveur inscrit cette version en base : tiré
    // au hasard, une retouche faite après un nouveau résumé manquait sa version.
    expect(view.summaryVersions[0].id).toBe(LEGACY_VERSION_ID);
    expect(view.activeVersionId).toBe(LEGACY_VERSION_ID);
    expect(view.summaryVersions[0].template).toBe('standard');
    expect(view.summaryText).toContain('Ancien CR');
  });

  it('réunion enregistrée SANS compte rendu : aucune version, texte par défaut', () => {
    // Brouillon ouvert au démarrage puis clos par « Enregistrer » : une version
    // vide fabriquée ici affichait un onglet « Résumé 1 » qui n'ouvrait que sur
    // le texte d'accueil. Sans version, l'écran s'ouvre sur la transcription,
    // « Nouveau résumé » à côté. summaryText est quand même réassigné : le
    // laisser tel quel montrerait le résumé de la réunion PRÉCÉDEMMENT ouverte.
    for (const draft of [{ resume: '', versions: [] }, { transcription: 'Bonjour.' }]) {
      const view = unpackHistoryItem(draft, OPTS);
      expect(view.summaryVersions).toEqual([]);
      expect(view.activeVersionId).toBeNull();
      expect(view.summaryText).toBe('<p>Aucun résumé</p>');
    }
    const view = unpackHistoryItem({ resume: '', versions: [] }, OPTS);
    expect(view.transcriptionFullText).toBe('');
    expect(view.transcriptionHistory).toEqual([{ time: '', text: '' }]);
  });

  it('accepte les actions en tableau ET en JSON sérialisé', () => {
    const enTableau = unpackHistoryItem({ actions: [{ id: 1, title: 'A' }] }, OPTS);
    const enTexte = unpackHistoryItem({ actions: '[{"id":1,"title":"A"}]' }, OPTS);
    expect(enTableau.detectedActions).toEqual(enTexte.detectedActions);
  });

  it('ne montre pas les actions masquées, mais les garde', () => {
    const view = unpackHistoryItem({ actions: [{ id: 1 }, { id: 2, show: false }] }, OPTS);
    expect(view.detectedActions).toHaveLength(2);
    expect(view.visibleActions).toHaveLength(1);
  });

  it('vide les textes de remplacement d’autrefois : ils s’affichent en placeholder', () => {
    // Écrits comme de vraies valeurs avant le correctif, ils repartaient dans
    // le compte rendu (« — À définir — Description de l'action... »).
    const view = unpackHistoryItem(
      {
        actions: [
          {
            id: 1,
            title: 'Nouvelle action',
            owner: 'À définir',
            dueDate: '',
            description: "Description de l'action...",
          },
          { id: 2, title: 'Relancer Globex', owner: 'Alex', description: 'Avant vendredi' },
        ],
      },
      OPTS,
    );
    expect(view.detectedActions[0]).toMatchObject({ title: '', owner: '', description: '' });
    expect(view.detectedActions[1]).toMatchObject({ title: 'Relancer Globex', owner: 'Alex' });
  });

  it('ids garantis et uniques — une carte ajoutée ensuite ne peut plus doubler une clé', () => {
    const view = unpackHistoryItem(
      { actions: [{ id: 3, title: 'A' }, { id: 3, title: 'B' }, { title: 'C' }] },
      OPTS,
    );
    const ids = view.detectedActions.map((a) => a.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe(3);
  });

  it('découpe la transcription en lignes SANS heure : elle n’existe pas en base', () => {
    // Recopier la date ISO de la réunion sur chaque ligne affichait
    // « 2026-08-27T15:01:27.449Z » en colonne — illisible et ~150 px de marge.
    const view = unpackHistoryItem(
      { transcription: 'Première phrase.\nDeuxième phrase.', now: '2026-08-24T09:00:00.000Z' },
      OPTS,
    );
    expect(view.transcriptionHistory).toHaveLength(2);
    expect(view.transcriptionHistory[0]).toEqual({
      time: '',
      text: 'Première phrase.',
    });
    // Le texte complet doit suivre : export, pied de page et génération le
    // relisent, et il portait sinon la transcription d'une autre session.
    expect(view.transcriptionFullText).toBe('Première phrase.\nDeuxième phrase.');
  });

  it('durée : la valeur en base, jamais un zéro maquillé', () => {
    // Le chronomètre est à zéro quand la réunion vient de l'historique.
    expect(unpackHistoryItem({ meetingDuration: 930 }, OPTS).fallbackMeetingDuration).toBe(930);
    expect(unpackHistoryItem({ meetingDuration: null }, OPTS).fallbackMeetingDuration).toBe(0);
    expect(unpackHistoryItem({}, OPTS).fallbackMeetingDuration).toBe(0);
  });

  it('notes : une chaîne, toujours', () => {
    expect(unpackHistoryItem({ notes: 'Sigle SDIS' }, OPTS).meetingNotes).toBe('Sigle SDIS');
    expect(unpackHistoryItem({ notes: { pas: 'une chaîne' } }, OPTS).meetingNotes).toBe('');
  });
});

describe('unpackHistoryItem — transcription étiquetée par locuteur', () => {
  it('les lignes d’étiquette redeviennent des sources, pas des lignes de transcript', () => {
    const view = unpackHistoryItem(
      {
        transcription: '[Alex]\nBonjour à tous.\n[Visio]\nOui, on t’entend.',
        now: '2026-08-26T09:00:00.000Z',
      },
      OPTS,
    );
    expect(view.transcriptionHistory).toEqual([
      {
        time: '',
        text: 'Bonjour à tous.',
        source: 'local',
        speaker: 'Alex',
      },
      {
        time: '',
        text: 'Oui, on t’entend.',
        source: 'remote',
        speaker: 'Visio',
      },
    ]);
    // Le texte complet garde les étiquettes : c'est lui qui repart au modèle
    // à la régénération, et il est réécrit tel quel en base.
    expect(view.transcriptionFullText).toBe('[Alex]\nBonjour à tous.\n[Visio]\nOui, on t’entend.');
  });

  it('participant nommé par l’utilisateur : relu comme voix de la visio, pas comme micro', () => {
    const view = unpackHistoryItem(
      { transcription: '[Alex]\nBonjour.\n[Marie]\nSalut.\n[Visio]\nOui.' },
      { ...OPTS, selfLabel: 'Alex' },
    );
    expect(view.transcriptionHistory.map((it) => [it.source, it.speaker])).toEqual([
      ['local', 'Alex'],
      ['remote', 'Marie'],
      ['remote', 'Visio'],
    ]);
  });

  it('NON-RÉGRESSION : transcription sans étiquette, forme d’avant à l’identique', () => {
    const view = unpackHistoryItem(
      { transcription: 'Première phrase.\nDeuxième phrase.', now: '2026-08-24T09:00:00.000Z' },
      OPTS,
    );
    expect(view.transcriptionHistory[0]).toEqual({
      time: '',
      text: 'Première phrase.',
    });
  });
});
