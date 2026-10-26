/**
 * Historique du signal de l'onde sonore — les calculs purs.
 *
 * Ce qui compte ici : le silence donne zéro (pas de bruit amplifié), la voix
 * donne une onde pleine quel que soit le micro (auto-gain), un cri ne
 * dépasse pas 1, et le tampon garde les N dernières barres avec des
 * identifiants uniques, y compris après une remise à zéro.
 */
import { describe, it, expect } from 'vitest';
import { rmsOfBytes, createLevelTracker, createHistory, STEP_MS, CAPACITY } from './waveHistory.js';

/** Sinusoïde d'amplitude `amp` (0..1), en octets centrés sur 128. */
const sine = (amp, n = 256) =>
  Uint8Array.from({ length: n }, (_, i) => Math.round(128 + amp * 127 * Math.sin(i * 0.35)));

describe('rmsOfBytes', () => {
  it('silence (128 partout) → 0 ; sinusoïde pleine → ≈ 0,7 ; vide → 0', () => {
    expect(rmsOfBytes(new Uint8Array(256).fill(128))).toBe(0);
    expect(rmsOfBytes(sine(1))).toBeCloseTo(1 / Math.SQRT2, 1);
    expect(rmsOfBytes(new Uint8Array(0))).toBe(0);
  });
});

describe('createLevelTracker — auto-gain, gate, courbe', () => {
  it('le silence reste plat, même après un long silence (plancher du pic)', () => {
    const t = createLevelTracker();
    for (let i = 0; i < 2000; i++) expect(t.next(0.002)).toBe(0);
  });

  it('un micro faible comme un micro fort donnent une onde pleine', () => {
    const faible = createLevelTracker();
    const fort = createLevelTracker();
    let a = 0;
    let b = 0;
    for (let i = 0; i < 50; i++) {
      a = faible.next(0.03);
      b = fort.next(0.3);
    }
    expect(a).toBeGreaterThan(0.4);
    expect(b).toBeGreaterThan(0.9);
    expect(b).toBeLessThanOrEqual(1);
  });

  it('après un cri, le pic redescend lentement : la voix normale remonte', () => {
    const t = createLevelTracker();
    t.next(0.9);
    const juste = t.next(0.1);
    for (let i = 0; i < 1500; i++) t.next(0.1);
    const plusTard = t.next(0.1);
    expect(plusTard).toBeGreaterThan(juste);
    expect(t.peak).toBeLessThan(0.9);
  });
});

describe('createHistory — tampon keyé', () => {
  it('garde les CAPACITY dernières barres, identifiants croissants', () => {
    const h = createHistory(3);
    h.push(0.1);
    h.push(0.2);
    h.push(0.3);
    const items = h.push(0.4);
    expect(items.map((b) => b.v)).toEqual([0.2, 0.3, 0.4]);
    expect(items.map((b) => b.id)).toEqual([1, 2, 3]);
  });

  it('reset vide la trace sans réutiliser un identifiant', () => {
    const h = createHistory();
    h.push(0.5);
    expect(h.reset()).toEqual([]);
    expect(h.push(0.6)[0].id).toBe(1);
  });

  it('constantes : un pas de 70 ms, 200 barres — ~14 s de trace', () => {
    expect(STEP_MS).toBe(70);
    expect(CAPACITY).toBe(200);
  });
});
