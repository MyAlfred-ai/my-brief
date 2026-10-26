/**
 * Le doublon que ces tests verrouillent est apparu en rendant le modèle de
 * transcription réglable : sous gpt-4o-transcribe (et whisper-1), chaque phrase
 * arrive DEUX fois — une fois par les deltas, une fois par le `completed`.
 *
 * Le suivi est tenu PAR SEGMENT (item_id) : un `completed` peut arriver après
 * que le flux a basculé sur le segment suivant (désordre observé sous
 * whisper-1), il ne doit comparer que les deltas de SON segment.
 */
import { describe, it, expect } from 'vitest';
import { createTranscriptDeltaTracker } from './transcriptDeltas.js';

describe('createTranscriptDeltaTracker', () => {
  it('reconnaît un final déjà écrit par ses deltas', () => {
    const tracker = createTranscriptDeltaTracker();
    tracker.onDelta('local', 'item_1', 'Bonjour');
    tracker.onDelta('local', 'item_1', '.');
    expect(tracker.takeCompleted('local', 'item_1', 'Bonjour.')).toBe(true);
  });

  it('tolère les écarts de casse, de ponctuation et les espaces des deltas', () => {
    // Observé : les deltas arrivent avec des espaces de tête (" Bonjour"), le
    // final est reponctué et recapitalisé par le modèle.
    const tracker = createTranscriptDeltaTracker();
    for (const d of [' Ceci', ' est', ' un', ' test']) tracker.onDelta('local', 'item_1', d);
    expect(tracker.takeCompleted('local', 'item_1', 'Ceci est un test.')).toBe(true);
  });

  it("laisse passer un final que les deltas n'ont pas dit", () => {
    const tracker = createTranscriptDeltaTracker();
    tracker.onDelta('local', 'item_1', 'Bonjour');
    expect(tracker.takeCompleted('local', 'item_1', 'Bonjour tout le monde.')).toBe(false);
  });

  it('laisse passer un final sans aucun delta (whisper-1 en différé)', () => {
    expect(createTranscriptDeltaTracker().takeCompleted('local', 'item_1', 'Une phrase.')).toBe(
      false,
    );
  });

  it('sépare les deux flux — micro et audio système sont entrelacés', () => {
    const tracker = createTranscriptDeltaTracker();
    tracker.onDelta('local', 'item_a', 'Bonjour.');
    tracker.onDelta('remote', 'item_b', 'Autre chose.');
    expect(tracker.takeCompleted('remote', 'item_b', 'Autre chose.')).toBe(true);
    // Le flux micro n'a pas été consommé par le final de l'autre flux.
    expect(tracker.takeCompleted('local', 'item_a', 'Bonjour.')).toBe(true);
  });

  it('sépare les segments — un `completed` en retard compare SON segment', () => {
    // Les interlocuteurs alternent : les deltas du segment 2 arrivent avant le
    // `completed` du segment 1. Chacun doit retrouver son propre tampon.
    const tracker = createTranscriptDeltaTracker();
    tracker.onDelta('local', 'item_1', 'Première phrase.');
    tracker.onDelta('local', 'item_2', 'Seconde phrase');
    expect(tracker.takeCompleted('local', 'item_1', 'Première phrase.')).toBe(true);
    tracker.onDelta('local', 'item_2', '.');
    expect(tracker.takeCompleted('local', 'item_2', 'Seconde phrase.')).toBe(true);
  });

  it('repart de zéro après chaque final — le segment suivant est indépendant', () => {
    const tracker = createTranscriptDeltaTracker();
    tracker.onDelta('local', 'item_1', 'Bonjour.');
    tracker.takeCompleted('local', 'item_1', 'Bonjour.');
    tracker.onDelta('local', 'item_1', 'Ensuite');
    // Sans remise à zéro, le tampon vaudrait « Bonjour.Ensuite » et ce final
    // passerait pour du déjà-écrit.
    expect(tracker.takeCompleted('local', 'item_1', 'Ensuite.')).toBe(true);
  });

  it('événements legacy sans item_id : le tampon anonyme du flux fait foi', () => {
    const tracker = createTranscriptDeltaTracker();
    tracker.onDelta('local', '', 'Bonjour.');
    expect(tracker.takeCompleted('local', '', 'Bonjour.')).toBe(true);
  });

  it('borne le suivi : les segments trop anciens sont oubliés, jamais accumulés', () => {
    const tracker = createTranscriptDeltaTracker();
    for (let i = 0; i < 12; i++) tracker.onDelta('local', `item_${i}`, `Phrase ${i}.`);
    // Le plus ancien est sorti de la fenêtre : son final passe pour inédit…
    expect(tracker.takeCompleted('local', 'item_0', 'Phrase 0.')).toBe(false);
    // …les récents restent suivis.
    expect(tracker.takeCompleted('local', 'item_11', 'Phrase 11.')).toBe(true);
  });

  it('reset() vide les deux flux (nouvel enregistrement)', () => {
    const tracker = createTranscriptDeltaTracker();
    tracker.onDelta('local', 'item_1', 'Bonjour.');
    tracker.reset();
    expect(tracker.takeCompleted('local', 'item_1', 'Bonjour.')).toBe(false);
  });

  it('un final vide ne bloque jamais rien', () => {
    const tracker = createTranscriptDeltaTracker();
    tracker.onDelta('local', 'item_1', 'Bonjour.');
    expect(tracker.takeCompleted('local', 'item_1', '')).toBe(false);
  });
});
