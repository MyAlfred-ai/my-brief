/**
 * Les sons de l'Aide IA et leur verrou (utils/chime.js) — un faux contexte
 * audio qui se comporte comme celui de Chrome : SUSPENDU tant que la page n'a
 * reçu aucun geste, et dont `resume()` ne rend alors jamais la main.
 *
 * Garanties tenues ici :
 *   - verrouillé, un son dû est TU, et le verrou se signale — il n'éclate pas
 *     plus tard, au premier clic ;
 *   - le premier geste de la page déverrouille, une fois pour toutes ;
 *   - déverrouillé, chaque son joue tout de suite — la mélodie du minuteur
 *     comprise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

let gestured;
let contexts;

class FakeAudioContext {
  constructor() {
    this.state = gestured ? 'running' : 'suspended';
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.destination = {};
    this.oscillators = 0;
    contexts.push(this);
  }
  // Comme Chrome : sans geste dans la page, la promesse reste pendante.
  resume() {
    if (!gestured) return new Promise(() => {});
    this.state = 'running';
    return Promise.resolve();
  }
  createOscillator() {
    this.oscillators += 1;
    const node = { frequency: {}, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    return node;
  }
  createGain() {
    const param = {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    return { gain: param, connect: vi.fn() };
  }
  createBuffer(_channels, length) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    return { connect: vi.fn(), start: vi.fn() };
  }
  createBiquadFilter() {
    return { frequency: {}, connect: vi.fn() };
  }
}

function fakeWindow() {
  const listeners = new Map();
  return {
    AudioContext: FakeAudioContext,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    fire: async (type) => {
      gestured = true;
      await listeners.get(type)?.();
    },
    listeners,
  };
}

let chime;
let win;

beforeEach(async () => {
  gestured = false;
  contexts = [];
  win = fakeWindow();
  vi.stubGlobal('window', win);
  vi.useFakeTimers();
  vi.resetModules();
  chime = await import('./chime.js');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('chime — le son verrouillé par le navigateur', () => {
  it('sans geste dans la page : le son est tu, le verrou se signale', async () => {
    const playing = chime.playBell();
    await vi.advanceTimersByTimeAsync(300);
    await playing;
    expect(contexts[0].oscillators).toBe(0);
    expect(get(chime.aiHelpAudioLocked)).toBe(true);
  });

  it('le premier geste déverrouille, une fois pour toutes', async () => {
    chime.armAiHelpAudio(win);
    expect([...win.listeners.keys()]).toEqual(['pointerdown', 'keydown', 'touchend']);
    await win.fire('pointerdown');
    expect(contexts[0].state).toBe('running');
    expect(win.listeners.size).toBe(0);

    await chime.playChime();
    expect(contexts[0].oscillators).toBe(3);
    await chime.playAck();
    // Deux frappes de maillet : un fondamental et un partiel chacune.
    expect(contexts[0].oscillators).toBe(7);
    expect(get(chime.aiHelpAudioLocked)).toBe(false);
  });

  it('la mélodie du minuteur : onze notes, chacune avec son octave — tue elle aussi, verrouillée', async () => {
    const muted = chime.playTimerMelody();
    await vi.advanceTimersByTimeAsync(300);
    await muted;
    expect(contexts[0].oscillators).toBe(0);
    expect(get(chime.aiHelpAudioLocked)).toBe(true);

    gestured = true;
    await chime.unlockAiHelpAudio();
    await chime.playTimerMelody();
    expect(contexts[0].oscillators).toBe(22);
  });

  it('un son tu n’éclate pas plus tard, au premier clic', async () => {
    const playing = chime.playChime();
    await vi.advanceTimersByTimeAsync(300);
    await playing;
    gestured = true;
    expect(await chime.unlockAiHelpAudio()).toBe(true);
    expect(contexts[0].oscillators).toBe(0);
    expect(get(chime.aiHelpAudioLocked)).toBe(false);
  });

  it('sans Web Audio : silence, sans erreur', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    chime = await import('./chime.js');
    await expect(chime.playBell()).resolves.toBeUndefined();
    expect(await chime.readyAudioContext()).toBeNull();
  });
});
