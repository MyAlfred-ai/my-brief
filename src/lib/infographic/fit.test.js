/**
 * Ajustement à la page A4 : la plus grande échelle qui tient, jamais moins
 * que le plancher de lisibilité, en peu de mesures.
 */
import { describe, it, expect } from 'vitest';
import { fitScale, FIT_MIN } from './fit.js';

/** Contenu qui tient à partir de `limit` (déborde au-dessus). */
const content = (limit) => {
  const calls = [];
  const overflows = (scale) => {
    calls.push(scale);
    return scale > limit;
  };
  return { overflows, calls };
};

describe('fitScale', () => {
  it('ce qui tient à pleine échelle n’est pas réduit, en une seule mesure', () => {
    const { overflows, calls } = content(1.2);
    expect(fitScale(overflows)).toBe(1);
    expect(calls).toEqual([1]);
  });

  it('la plus grande échelle qui tient, au centième près, jamais au-dessus', () => {
    for (const limit of [0.95, 0.873, 0.8, 0.731]) {
      const scale = fitScale(content(limit).overflows);
      expect(scale).toBeLessThanOrEqual(limit);
      expect(limit - scale).toBeLessThan(0.02);
    }
  });

  it('au-delà du plancher, on s’arrête au plancher (le bas de page est rogné)', () => {
    expect(fitScale(content(0.5).overflows)).toBe(FIT_MIN);
  });

  it('peu de mesures : chacune refait la mise en page de la feuille', () => {
    const { overflows, calls } = content(0.84);
    fitScale(overflows);
    expect(calls.length).toBeLessThanOrEqual(9);
  });
});
