/**
 * Garde de capture — les trois malmenages d'un téléphone, rejoués avec une
 * horloge, des pistes et un contexte audio factices :
 *   - changement d'application : la page gèle, plus une trame ;
 *   - appel téléphonique : piste muette, contexte `interrupted` (iOS) ;
 *   - micro perdu : piste `ended`.
 * Ce que ces tests protègent avant tout : un micro redemandé est RENDU à
 * l'appelant pour être rebranché partout (le défaut d'origine : il ne
 * l'était que sur l'enregistrement, la transcription restait muette).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCaptureGuard } from './captureGuard.js';

const TIMING = {
  stallMs: 4000,
  checkMs: 3000,
  muteGraceMs: 5000,
  micRetryMs: 12000,
  markerMinMs: 8000,
  refreshMinMs: 15000,
  blockedNoticeMs: 10000,
};

class FakeTarget {
  constructor() {
    this.handlers = new Map();
  }
  addEventListener(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this.handlers.get(type)?.delete(fn);
  }
  emit(type) {
    for (const fn of [...(this.handlers.get(type) || [])]) fn({ type });
  }
  count(type) {
    return this.handlers.get(type)?.size || 0;
  }
}

class FakeTrack extends FakeTarget {
  constructor({ muted = false } = {}) {
    super();
    this.readyState = 'live';
    this.muted = muted;
    this.enabled = true;
    this.stopped = false;
  }
  stop() {
    this.stopped = true;
    this.readyState = 'ended';
  }
  mute() {
    this.muted = true;
    this.emit('mute');
  }
  unmute() {
    this.muted = false;
    this.emit('unmute');
  }
  end() {
    this.readyState = 'ended';
    this.emit('ended');
  }
}

const streamOf = (...tracks) => ({ getAudioTracks: () => tracks, getTracks: () => tracks });

class FakeContext extends FakeTarget {
  constructor() {
    super();
    this.state = 'running';
    this.resume = vi.fn(async () => {
      if (this.resumable) this.state = 'running';
    });
    this.suspend = vi.fn(async () => {});
    this.resumable = true;
  }
}

function setup(overrides = {}) {
  const ctx = new FakeContext();
  const track = new FakeTrack();
  const doc = new FakeTarget();
  doc.visibilityState = 'visible';
  const win = new FakeTarget();
  const env = {
    ctx,
    track,
    doc,
    win,
    stream: streamOf(track),
    recording: true,
    paused: false,
    recovered: [],
    refreshed: [],
    blocked: [],
    persisted: 0,
    network: [],
    adopted: [],
    nextMic: () => streamOf(new FakeTrack()),
    acquired: 0,
  };
  env.guard = createCaptureGuard({
    isRecording: () => env.recording,
    isPaused: () => env.paused,
    getAudioContext: () => env.ctx,
    getMicStream: () => env.stream,
    acquireMic: async () => {
      env.acquired += 1;
      return env.nextMic();
    },
    adoptMic: (stream) => {
      env.adopted.push(stream);
      env.stream = stream;
    },
    onRecovered: (info) => env.recovered.push(info.durationMs),
    refreshLive: (ms) => env.refreshed.push(ms),
    onBlocked: (b) => env.blocked.push(b),
    persist: () => (env.persisted += 1),
    onNetwork: (online) => env.network.push(online),
    doc,
    win,
    now: () => Date.now(),
    timing: TIMING,
    ...overrides,
  });
  return env;
}

/** Le processor du micro rend une trame toutes les 85 ms tant que l'audio coule. */
async function framesFor(env, ms) {
  for (let t = 0; t < ms; t += 100) {
    env.guard.noteFrame();
    await vi.advanceTimersByTimeAsync(100);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('capture saine', () => {
  it('ne fait rien : ni micro redemandé, ni message, ni marqueur', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 60_000);
    expect(env.guard.interrupted).toBe(false);
    expect(env.acquired).toBe(0);
    expect(env.recovered).toEqual([]);
    expect(env.blocked).toEqual([]);
    expect(env.ctx.resume).not.toHaveBeenCalled();
    env.guard.stop();
  });

  it('la pause ne passe pas pour une panne : la piste coupée (enabled) n’est pas « muette »', async () => {
    const env = setup();
    env.guard.start();
    env.track.enabled = false; // pauseRecording
    await framesFor(env, 30_000); // le processor tourne pendant la pause
    expect(env.guard.interrupted).toBe(false);
    expect(env.acquired).toBe(0);
    env.guard.stop();
  });

  it('PC en veille pendant la pause : aucun marqueur « interrompu », mais le canal est renouvelé', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 5_000);
    env.paused = true;
    env.track.enabled = false;
    vi.setSystemTime(Date.now() + 15 * 60_000); // capot fermé : ni trame ni minuteur
    env.guard.noteFrame();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.recovered).toEqual([]); // rien ne s'enregistrait : rien de perdu
    expect(env.refreshed).toHaveLength(1); // le socket, lui, a dormi 15 min
    expect(env.guard.interrupted).toBe(false);
    env.guard.stop();
  });

  it('micro perdu pendant la pause : redemandé et rendu à l’appelant, sans marqueur', async () => {
    const env = setup();
    env.guard.start();
    env.paused = true;
    env.track.enabled = false;
    await framesFor(env, 2_000);
    env.track.end(); // casque éteint pendant la pause café
    await framesFor(env, 1_000);
    expect(env.adopted).toHaveLength(1);
    expect(env.recovered).toEqual([]);
    env.guard.stop();
  });

  it('trou encore ouvert à la reprise : seul ce qui suit la reprise est marqué perdu', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 2_000);
    env.paused = true;
    env.ctx.state = 'suspended';
    env.ctx.resumable = false; // le contexte refuse de repartir pendant la pause
    env.ctx.emit('statechange');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(env.guard.interrupted).toBe(true);

    env.paused = false;
    await env.guard.resumed();
    await vi.advanceTimersByTimeAsync(20_000);
    env.ctx.resumable = true;
    env.ctx.emit('statechange');
    await vi.advanceTimersByTimeAsync(0);
    await framesFor(env, 500);

    expect(env.recovered).toHaveLength(1);
    expect(env.recovered[0]).toBeGreaterThanOrEqual(20_000);
    expect(env.recovered[0]).toBeLessThan(60_000); // pas les 10 min de pause
    env.guard.stop();
  });
});

describe('changement d’application — la page gèle', () => {
  it('au retour, la première trame constate le trou et le rend : marqueur + canal renouvelé', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 5_000);

    // Page gelée 2 min : ni trame ni minuteur. L'horloge, elle, avance.
    vi.setSystemTime(Date.now() + 120_000);
    env.guard.noteFrame();
    await vi.advanceTimersByTimeAsync(0);

    expect(env.recovered).toHaveLength(1);
    expect(env.recovered[0]).toBeGreaterThanOrEqual(120_000);
    expect(env.refreshed).toHaveLength(1); // un socket « ouvert » sous une page gelée est suspect
    expect(env.guard.interrupted).toBe(false);
    expect(env.acquired).toBe(0); // la piste n'a rien : aucun micro redemandé
    env.guard.stop();
  });

  it('un passage éclair (2 s) ne laisse aucune trace', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 5_000);
    vi.setSystemTime(Date.now() + 2_000);
    await framesFor(env, 5_000);
    expect(env.recovered).toEqual([]);
    expect(env.refreshed).toEqual([]);
    env.guard.stop();
  });

  it('court (10 s) : marqué dans la transcription, mais le canal n’est pas renouvelé', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 5_000);
    vi.setSystemTime(Date.now() + 10_000);
    env.guard.noteFrame();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.recovered).toHaveLength(1);
    expect(env.refreshed).toEqual([]);
    env.guard.stop();
  });

  it('passage en arrière-plan et fermeture : ce qui attend est écrit tout de suite', () => {
    const env = setup();
    env.guard.start();
    env.doc.visibilityState = 'hidden';
    env.doc.emit('visibilitychange');
    env.win.emit('pagehide');
    env.doc.emit('freeze');
    expect(env.persisted).toBe(3);
    env.guard.stop();
  });
});

describe('appel téléphonique — piste muette, contexte interrompu', () => {
  it('iOS : contexte `interrupted` relancé, pas seulement `suspended`', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 2_000);

    env.ctx.state = 'interrupted';
    env.ctx.emit('statechange');
    await vi.advanceTimersByTimeAsync(0);
    expect(env.ctx.resume).toHaveBeenCalled();
    expect(env.ctx.state).toBe('running');
    env.guard.stop();
  });

  it('la piste se rétablit seule à la fin de l’appel : rien n’est redemandé, le trou est marqué', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 2_000);

    env.doc.visibilityState = 'hidden'; // l'écran d'appel recouvre l'application
    env.track.mute();
    await framesFor(env, 60_000); // le processor rend des zéros
    expect(env.acquired).toBe(0); // jamais de demande de micro écran caché

    env.doc.visibilityState = 'visible';
    env.track.unmute();
    await vi.advanceTimersByTimeAsync(0);

    expect(env.acquired).toBe(0);
    expect(env.recovered).toHaveLength(1);
    expect(env.recovered[0]).toBeGreaterThanOrEqual(60_000);
    env.guard.stop();
  });

  it('la piste reste muette au retour : un nouveau micro est demandé et RENDU à l’appelant', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 2_000);
    env.track.mute();
    await framesFor(env, 8_000); // visible, muette au-delà du délai de grâce

    expect(env.acquired).toBe(1);
    expect(env.adopted).toHaveLength(1);
    expect(env.guard.interrupted).toBe(false);
    expect(env.recovered).toHaveLength(0); // 5 à 8 s : sous le seuil du marqueur
    env.guard.stop();
  });

  it('appel en cours : le micro rendu est muet lui aussi → refusé, arrêté, et pas de rafale', async () => {
    const mutedTracks = [];
    const env = setup();
    env.nextMic = () => {
      const t = new FakeTrack({ muted: true });
      mutedTracks.push(t);
      return streamOf(t);
    };
    env.guard.start();
    await framesFor(env, 2_000);
    env.track.mute();
    await framesFor(env, 60_000);

    expect(env.adopted).toHaveLength(0); // l'ancien flux peut encore se rétablir seul
    expect(mutedTracks.every((t) => t.stopped)).toBe(true);
    // Une demande toutes les 12 s au plus — pas une par vérification (3 s).
    expect(env.acquired).toBeLessThanOrEqual(6);
    expect(env.acquired).toBeGreaterThanOrEqual(3);
    // Prévenu UNE fois, pas à chaque vérification.
    expect(env.blocked).toEqual([true]);

    env.track.unmute();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.blocked).toEqual([true, false]);
    expect(env.recovered).toHaveLength(1);
    env.guard.stop();
  });

  it('micro pris par l’appel (demande refusée) : aucune exception, nouvelle tentative plus tard', async () => {
    const env = setup({
      acquireMic: async () => {
        throw new DOMException('occupé', 'NotReadableError');
      },
    });
    env.guard.start();
    await framesFor(env, 2_000);
    env.track.end();
    await framesFor(env, 30_000);
    expect(env.guard.interrupted).toBe(true);
    expect(env.adopted).toHaveLength(0);
    env.guard.stop();
  });
});

describe('micro perdu — piste terminée', () => {
  it('redemandé tout de suite, rendu à l’appelant, et ses pistes sont écoutées à leur tour', async () => {
    const env = setup();
    const replacement = new FakeTrack();
    env.nextMic = () => streamOf(replacement);
    env.guard.start();
    await framesFor(env, 2_000);

    env.track.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.acquired).toBe(1);
    expect(env.adopted).toHaveLength(1);
    expect(env.guard.interrupted).toBe(false);

    // Le micro de remplacement tombe à son tour : il doit être repris aussi.
    await framesFor(env, 15_000);
    replacement.end();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.acquired).toBe(2);
    env.guard.stop();
  });

  it('enregistrement arrêté pendant la demande : le flux obtenu est rendu au système', async () => {
    const late = new FakeTrack();
    let release;
    const env = setup({
      acquireMic: () => new Promise((resolve) => (release = () => resolve(streamOf(late)))),
    });
    env.guard.start();
    env.track.end();
    await vi.advanceTimersByTimeAsync(0);
    env.guard.stop();
    env.recording = false;
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(late.stopped).toBe(true);
    expect(env.adopted).toHaveLength(0);
  });
});

describe('interruption que rien ne lève seul', () => {
  it('prévient au bout de 10 s, et le prochain toucher retente DANS le geste', async () => {
    const env = setup();
    env.ctx.resumable = false; // iOS : resume() sans effet hors d'un geste
    env.guard.start();
    await framesFor(env, 2_000);
    env.ctx.state = 'interrupted';
    env.ctx.emit('statechange');
    await vi.advanceTimersByTimeAsync(12_000);
    expect(env.blocked).toEqual([true]);

    const before = env.ctx.resume.mock.calls.length;
    env.ctx.resumable = true;
    env.win.emit('pointerdown');
    // Synchrone : resume() est parti avant la fin du gestionnaire du toucher.
    expect(env.ctx.resume.mock.calls.length).toBe(before + 1);

    await vi.advanceTimersByTimeAsync(0);
    await framesFor(env, 1_000);
    expect(env.guard.interrupted).toBe(false);
    expect(env.blocked).toEqual([true, false]);
    env.guard.stop();
  });

  it('hors interruption, un toucher ne déclenche rien', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 2_000);
    env.win.emit('pointerdown');
    expect(env.ctx.resume).not.toHaveBeenCalled();
    env.guard.stop();
  });

  it('contexte « running » qui ne rend plus de trames : cycle suspend/resume', async () => {
    const env = setup();
    env.guard.start();
    await framesFor(env, 2_000);
    await vi.advanceTimersByTimeAsync(20_000); // plus une trame, états intacts
    expect(env.ctx.suspend).toHaveBeenCalled();
    expect(env.ctx.resume).toHaveBeenCalled();
    env.guard.stop();
  });
});

describe('réseau', () => {
  it('relaie la perte et le retour annoncés par le navigateur, seulement en enregistrement', () => {
    const env = setup();
    env.guard.start();
    env.win.emit('offline');
    env.win.emit('online');
    expect(env.network).toEqual([false, true]);

    env.recording = false;
    env.win.emit('offline');
    expect(env.network).toEqual([false, true]);
    env.guard.stop();
  });
});

describe('arrêt', () => {
  it('retire tous ses écouteurs et ne se réveille plus', async () => {
    const env = setup();
    env.guard.start();
    env.guard.stop();
    for (const type of ['visibilitychange', 'freeze', 'resume'])
      expect(env.doc.count(type)).toBe(0);
    for (const type of ['pagehide', 'pageshow', 'online', 'offline', 'pointerdown', 'keydown']) {
      expect(env.win.count(type)).toBe(0);
    }
    expect(env.ctx.count('statechange')).toBe(0);

    env.track.end();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(env.acquired).toBe(0);
  });

  it('redémarré, il n’écoute pas deux fois la même piste', () => {
    const env = setup();
    env.guard.start();
    env.guard.watchStream(env.stream);
    expect(env.track.count('ended')).toBe(1);
    env.guard.stop();
  });

  it('arrêté en pleine interruption signalée : le message est levé', async () => {
    const env = setup();
    env.ctx.resumable = false;
    env.guard.start();
    env.ctx.state = 'interrupted';
    await vi.advanceTimersByTimeAsync(15_000);
    expect(env.blocked).toEqual([true]);
    env.guard.stop();
    expect(env.blocked).toEqual([true, false]);
  });
});
