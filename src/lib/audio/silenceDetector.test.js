import { describe, it, expect, vi } from 'vitest';
import { createSilenceDetector } from './silenceDetector.js';

/** Contexte audio factice : `signal.level` règle ce que l'analyser « entend ». */
function fakeContext(signal) {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 0 } });
  const mixer = node();
  const analyser = {
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    get frequencyBinCount() {
      return this.fftSize / 2;
    },
    // Spectre muet : seul le RMS temporel porte le niveau dans ces tests.
    getByteFrequencyData: (a) => a.fill(0),
    // Onde carrée d'amplitude `level` autour de 128 (le silence) : RMS = level.
    getByteTimeDomainData: (a) => {
      for (let i = 0; i < a.length; i++) a[i] = 128 + (i % 2 ? 1 : -1) * signal.level * 128;
    },
  };
  return {
    mixer,
    analyser,
    createAnalyser: () => analyser,
    createGain: () => mixer,
  };
}

function setup({ level = 0 } = {}) {
  const signal = { level };
  const ctx = fakeContext(signal);
  let t = 0;
  const timers = new Map();
  let nextId = 1;
  const onKeepAlive = vi.fn();
  const mic = { connect: vi.fn() };
  const detector = createSilenceDetector({
    audioContext: ctx,
    sources: [mic, null],
    onKeepAlive,
    threshold: 0.015,
    silenceMs: 1000,
    keepAliveMs: 500,
    now: () => t,
    setIntervalFn: (fn) => {
      timers.set(nextId, fn);
      return nextId++;
    },
    clearIntervalFn: (id) => timers.delete(id),
  });
  return {
    detector,
    ctx,
    mic,
    signal,
    timers,
    onKeepAlive,
    advance: (ms) => (t += ms),
  };
}

describe('createSilenceDetector', () => {
  it('branche les sources présentes sur l’analyser, réglé comme avant (fft 256, lissage 0,3)', () => {
    const { detector, ctx, mic } = setup();
    expect(mic.connect).toHaveBeenCalledWith(ctx.mixer);
    expect(ctx.mixer.connect).toHaveBeenCalledWith(ctx.analyser);
    expect(detector.analyser).toBe(ctx.analyser);
    expect(ctx.analyser.fftSize).toBe(256);
    expect(ctx.analyser.smoothingTimeConstant).toBe(0.3);
  });

  it('silence plus long que le seuil → un seul minuteur de keep-alive', () => {
    const { detector, timers, advance } = setup({ level: 0 });
    detector.sample();
    expect(timers.size).toBe(0); // pas encore 1 s de silence
    advance(1001);
    detector.sample();
    detector.sample();
    expect(timers.size).toBe(1);
  });

  it('le son revient → le keep-alive s’arrête, et le compte du silence repart de zéro', () => {
    const { detector, timers, signal, advance } = setup({ level: 0 });
    advance(1500);
    detector.sample();
    expect(timers.size).toBe(1);
    signal.level = 0.2;
    detector.sample();
    expect(timers.size).toBe(0);
    signal.level = 0;
    advance(900);
    detector.sample();
    expect(timers.size).toBe(0);
    advance(200);
    detector.sample();
    expect(timers.size).toBe(1);
  });

  it('niveau sous le seuil = silence ; au-dessus = activité (seuil strict)', () => {
    const { detector, timers, signal, advance } = setup({ level: 0.01 });
    advance(1500);
    detector.sample();
    expect(timers.size).toBe(1);
    signal.level = 0.05;
    detector.sample();
    expect(timers.size).toBe(0);
  });

  it('stop() coupe le keep-alive, débranche le mélangeur et rend sample() inerte', () => {
    const { detector, ctx, timers, advance } = setup({ level: 0 });
    advance(1500);
    detector.sample();
    detector.stop();
    expect(timers.size).toBe(0);
    expect(ctx.mixer.disconnect).toHaveBeenCalled();
    advance(5000);
    detector.sample();
    expect(timers.size).toBe(0);
  });
});

describe('micro remplacé en cours de réunion', () => {
  it('la nouvelle source rejoint le mix ; après l’arrêt, plus rien n’est branché', () => {
    const analyser = { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 4 };
    const mixer = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 0 } };
    const detector = createSilenceDetector({
      audioContext: { createAnalyser: () => analyser, createGain: () => mixer },
      sources: [],
      onKeepAlive: () => {},
    });
    const replacement = { connect: vi.fn() };
    detector.addSource(replacement);
    expect(replacement.connect).toHaveBeenCalledWith(mixer);

    detector.stop();
    const late = { connect: vi.fn() };
    detector.addSource(late);
    expect(late.connect).not.toHaveBeenCalled();
  });
});
