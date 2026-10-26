import { describe, it, expect } from 'vitest';
import { makeGapMarkerItem, resolveGapMarker, recomputeFullText } from './offlineGaps.js';

const marker = (gapId) =>
  makeGapMarkerItem({
    gapId,
    time: '00:01:00',
    timestamp: '10:00:00',
    author: 'MyBrief',
    text: '⟨ Passage hors ligne ⟩',
  });

const line = (text, isDelta = false) => ({
  time: '00:00:10',
  timestamp: '09:59:00',
  author: 'Intervenant',
  text,
  isDelta,
  source: 'local',
});

describe('makeGapMarkerItem', () => {
  it('produit une ligne finale retrouvable par offlineGapId', () => {
    const item = marker('gap-1');
    expect(item.isDelta).toBe(false);
    expect(item.offlineGapId).toBe('gap-1');
    expect(item.text).toContain('hors ligne');
  });
});

describe('resolveGapMarker', () => {
  it('remplace le texte du marqueur et retire offlineGapId', () => {
    const history = [line('Bonjour.'), marker('gap-1'), line('Suite.')];
    const { history: next, changed } = resolveGapMarker(history, 'gap-1', ' Texte différé. ');
    expect(changed).toBe(true);
    expect(next).toHaveLength(3);
    expect(next[1].text).toBe('Texte différé.');
    expect(next[1].offlineGapId).toBeUndefined();
    expect(next[1].time).toBe('00:01:00'); // position + métadonnées conservées
  });

  it('retire le marqueur si la transcription différée est vide (silence)', () => {
    const history = [line('Bonjour.'), marker('gap-1')];
    const { history: next, changed } = resolveGapMarker(history, 'gap-1', '   ');
    expect(changed).toBe(true);
    expect(next).toHaveLength(1);
    expect(next[0].text).toBe('Bonjour.');
  });

  it('ne touche à rien si le gap est inconnu', () => {
    const history = [line('Bonjour.')];
    const { history: next, changed } = resolveGapMarker(history, 'gap-404', 'x');
    expect(changed).toBe(false);
    expect(next).toBe(history);
  });

  it('ne résout que le gap visé quand plusieurs coupures coexistent', () => {
    const history = [marker('gap-1'), line('Milieu.'), marker('gap-2')];
    const { history: next } = resolveGapMarker(history, 'gap-2', 'Fin retrouvée.');
    expect(next[0].offlineGapId).toBe('gap-1');
    expect(next[2].text).toBe('Fin retrouvée.');
    expect(next.filter((it) => it.offlineGapId)).toHaveLength(1);
  });
});

describe('recomputeFullText', () => {
  it('agrège les lignes finales, exclut deltas et textes vides', () => {
    const history = [
      line('Un.'),
      line('delta en cours', true),
      marker('gap-1'),
      line(''),
      line('Deux.'),
    ];
    expect(recomputeFullText(history)).toBe('Un.\n⟨ Passage hors ligne ⟩\nDeux.');
  });
});
