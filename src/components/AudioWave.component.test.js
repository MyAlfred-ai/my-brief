/**
 * Onde sonore — ne tourne que visible à l'écran.
 *
 * Ce qui compte ici : le dock et la barre du téléphone portent chacun une
 * onde, montées ensemble pendant la réunion, l'une masquée par une media
 * query. Avant, les deux boucles tournaient et nourrissaient la même trace :
 * l'onde visible recevait deux barres par pas et défilait deux fois trop vite.
 * Une onde que l'IntersectionObserver dit hors écran ne demande plus aucune
 * image ; redevenue visible, elle reprend la trace commune.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';

let frames;
let observers;
let t;

beforeEach(() => {
  frames = [];
  observers = [];
  t = 0;
  globalThis.requestAnimationFrame = (cb) => frames.push(cb);
  globalThis.cancelAnimationFrame = (id) => (frames[id - 1] = null);
  globalThis.IntersectionObserver = class {
    constructor(cb) {
      this.cb = cb;
      observers.push(this);
    }
    observe(el) {
      this.el = el;
    }
    disconnect() {}
    show(visible) {
      this.cb([{ isIntersecting: visible, target: this.el }]);
    }
  };
});
afterEach(() => {
  delete globalThis.IntersectionObserver;
});

/** Laisse Svelte appliquer un changement d'état (mise à jour en micro-tâche). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Fait avancer les boucles de `n` images de 16,7 ms. */
async function run(n) {
  await settle();
  for (let k = 0; k < n; k++) {
    t += 1000 / 60;
    const pending = frames.filter(Boolean);
    frames = [];
    pending.forEach((cb) => cb(t));
  }
  await settle();
}

const analyser = {
  fftSize: 256,
  getByteTimeDomainData: (a) => {
    for (let i = 0; i < a.length; i++) a[i] = 128 + (i % 2 ? 40 : -40);
  },
};

describe('AudioWave', () => {
  it('masquée : aucune image demandée ; montrée : elle tourne', async () => {
    const AudioWave = (await import('./AudioWave.svelte')).default;
    render(AudioWave, { props: { analyser, active: true } });
    observers[0]?.show(false);
    await run(1);
    expect(frames.filter(Boolean)).toHaveLength(0);

    observers[0]?.show(true);
    await run(3);
    expect(frames.filter(Boolean)).toHaveLength(1);
  });

  it('dock + barre du téléphone montés ensemble : l’onde visible garde son rythme', async () => {
    const AudioWave = (await import('./AudioWave.svelte')).default;
    const solo = render(AudioWave, { props: { analyser: { ...analyser }, active: true } });
    observers[0]?.show(true);
    await run(60);
    const alone = solo.container.querySelectorAll('.wave-bar').length;
    solo.unmount();

    const shared = { ...analyser }; // nouvel analyser = nouvelle réunion, trace neuve
    const visible = render(AudioWave, { props: { analyser: shared, active: true } });
    render(AudioWave, { props: { analyser: shared, active: true } });
    observers[1]?.show(true);
    observers[2]?.show(false); // la copie masquée par sa media query
    await run(60);

    expect(alone).toBeGreaterThan(5);
    expect(visible.container.querySelectorAll('.wave-bar').length).toBe(alone);
  });
});
