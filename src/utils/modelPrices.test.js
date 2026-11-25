/**
 * Niveau de prix en « € » et ordre d'affichage des modèles proposés.
 */
import { describe, it, expect } from 'vitest';
import {
  PRICE_LEVELS,
  SUMMARY_PRICE_STEP,
  priceDelta,
  priceTiers,
  pricedChoices,
} from './modelPrices.js';

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

  it('les comptes rendus, au pas de quatre : l’échelle départage encore un écart de 1 à 100', () => {
    // Prix d'un compte rendu (€, réunion d'une heure) : GPT-6 Luna, Mistral
    // Small 4, Mistral Large 3, GPT-5.4 mini, GPT-5.4, GPT-6 Astra.
    const amounts = [0.003, 0.004, 0.0114, 0.025, 0.0832, 0.2977];
    expect(priceTiers(amounts, { step: SUMMARY_PRICE_STEP })).toEqual([1, 1, 2, 3, 3, 4]);
    // Au doublement, tout ce qui dépasse huit fois Luna plafonnerait.
    expect(priceTiers(amounts)).toEqual([1, 1, 3, 4, 4, 4]);
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

describe('priceDelta', () => {
  const choices = [
    { id: 'a', unitEur: 0.08 },
    { id: 'b', unitEur: 0.03 },
    { id: 'c', unitEur: null },
  ];

  it('l’écart par unité, négatif quand le choix fait économiser', () => {
    expect(priceDelta(choices, 'b', 'a')).toBeCloseTo(-0.05);
    expect(priceDelta(choices, 'a', 'b')).toBeCloseTo(0.05);
  });

  it('rien à dire : choix inchangé, ou un prix inconnu', () => {
    expect(priceDelta(choices, 'a', 'a')).toBeNull();
    expect(priceDelta(choices, '', 'a')).toBeNull();
    expect(priceDelta(choices, 'c', 'a')).toBeNull();
    expect(priceDelta(choices, 'a', 'hors-liste')).toBeNull();
  });
});
