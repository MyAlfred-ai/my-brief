/**
 * Niveau de prix en « € » et ordre d'affichage des modèles proposés.
 */
import { describe, it, expect } from 'vitest';
import { PRICE_LEVELS, priceTiers, pricedChoices } from './modelPrices.js';

describe('priceTiers', () => {
  it('le moins cher vaut « € », chaque doublement du prix un € de plus', () => {
    expect(priceTiers([0.16, 0.32, 0.64])).toEqual([1, 2, 3]);
  });

  it('les tarifs de transcription : l’écart qui compte se voit, pas les petits', () => {
    // mini 0,003 $ · gpt-transcribe 0,0045 $ · gpt-4o 0,006 $ · realtime 0,017 $ la minute
    expect(priceTiers([0.158, 0.237, 0.317, 0.897])).toEqual([1, 2, 2, 4]);
  });

  it('plafonne à l’échelle, et ne note jamais un prix inconnu', () => {
    expect(priceTiers([1, 1000, null, undefined, NaN])).toEqual([
      1,
      PRICE_LEVELS,
      null,
      null,
      null,
    ]);
    expect(priceTiers([0.5, 0.5])).toEqual([1, 1]);
  });

  it('gratuit : au bas de l’échelle, les autres se comparent au moins cher des payants', () => {
    expect(priceTiers([0, 2])).toEqual([1, 1]);
    expect(priceTiers([0.4, null])).toEqual([1, null]);
  });
});

describe('pricedChoices', () => {
  const ids = ['gpt-realtime-whisper', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'];

  it('du moins cher au plus cher ; à prix égal, l’ordre du serveur ; sans prix, en dernier', () => {
    const choices = pricedChoices(ids, [
      { model: 'gpt-realtime-whisper', unitEur: 0.897 },
      { model: 'gpt-4o-transcribe', unitEur: 0.317 },
      { model: 'gpt-4o-mini-transcribe', unitEur: 0.158 },
      { model: 'whisper-1', unitEur: null },
    ]);
    expect(choices).toEqual([
      { id: 'gpt-4o-mini-transcribe', unitEur: 0.158, tier: 1 },
      { id: 'gpt-4o-transcribe', unitEur: 0.317, tier: 2 },
      { id: 'gpt-realtime-whisper', unitEur: 0.897, tier: 4 },
      { id: 'whisper-1', unitEur: null, tier: null },
    ]);
  });

  it('sans tarifs (serveur muet), la liste du serveur, telle quelle', () => {
    expect(pricedChoices(ids, null).map((choice) => choice.id)).toEqual(ids);
    expect(pricedChoices(ids, null).every((choice) => choice.tier === null)).toBe(true);
  });
});
