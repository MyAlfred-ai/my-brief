import { describe, it, expect } from 'vitest';
import { setAudioEnabled } from './tracks.js';

const streamOf = (...tracks) => ({ getAudioTracks: () => tracks });

describe('setAudioEnabled', () => {
  it('coupe puis rouvre toutes les pistes audio de chaque flux', () => {
    const a = { enabled: true };
    const b = { enabled: true };
    const c = { enabled: true };
    const streams = [streamOf(a, b), streamOf(c)];
    setAudioEnabled(streams, false);
    expect([a, b, c].map((t) => t.enabled)).toEqual([false, false, false]);
    setAudioEnabled(streams, true);
    expect([a, b, c].map((t) => t.enabled)).toEqual([true, true, true]);
  });

  it('ignore un flux absent (pas d’audio système, enregistrement pas encore prêt)', () => {
    const t = { enabled: true };
    expect(() => setAudioEnabled([null, undefined, streamOf(t)], false)).not.toThrow();
    expect(t.enabled).toBe(false);
  });
});
