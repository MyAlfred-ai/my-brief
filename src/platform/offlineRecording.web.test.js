/**
 * Capture des coupures sur le WEB (PWA comprise) — sans Filesystem natif.
 *
 * Ce que ces tests protègent : ce qui se dit pendant une coupure réseau en
 * cours de réunion est gardé (en mémoire), transcrit au retour, et rendu à
 * l'écran par coupure entière. Avant, hors de l'app native, ce passage n'était
 * jamais transcrit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Faux MediaRecorder : rend un morceau à l'arrêt, comme un vrai segment court. */
class FakeMediaRecorder {
  static instances = [];
  static isTypeSupported = (type) => type === 'audio/webm;codecs=opus';

  constructor(stream, options) {
    this.stream = stream;
    this.mimeType = options?.mimeType || 'audio/webm';
    this.state = 'inactive';
    this.handlers = {};
    FakeMediaRecorder.instances.push(this);
  }
  addEventListener(type, fn) {
    this.handlers[type] = fn;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.handlers.dataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) });
    this.handlers.stop?.();
  }
}

let offline;
let fetchMock;

beforeEach(async () => {
  vi.resetModules();
  FakeMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  offline = await import('./offlineRecording.js');
});

afterEach(() => {
  offline.endOfflineCapture();
  vi.unstubAllGlobals();
});

const transcribed = (text) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  text: async () => JSON.stringify({ text }),
});

/** Laisse aboutir la finalisation d'un segment et l'envoi qui suit. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('capture des coupures hors de l’app native', () => {
  it('le web sait rattraper une coupure, mais pas démarrer sans réseau', () => {
    expect(offline.isGapCaptureSupported()).toBe(true);
    expect(offline.isOfflineCaptureSupported()).toBe(false);
  });

  it('coupure réseau puis retour : le passage est transcrit et rendu, à sa coupure', async () => {
    const resolved = [];
    fetchMock.mockResolvedValue(transcribed('ce qui s’est dit pendant la coupure'));
    const { started, gapOpened } = offline.startOfflineCapture(
      {},
      {
        live: true,
        getElapsedS: () => 0,
        onGapTranscribed: (gapId, text) => resolved.push({ gapId, text }),
      },
    );
    expect(started).toBe(true);
    expect(gapOpened).toBeNull();

    const gapId = offline.notifyOfflineLiveState(false); // le direct tombe
    expect(gapId).toMatch(/^gap-/);
    await settle();
    // Le segment d'avant la coupure était couvert par le direct : jamais envoyé.
    expect(fetchMock).not.toHaveBeenCalled();

    expect(offline.notifyOfflineLiveState(true)).toBeNull(); // le direct revient
    await settle();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/record');
    expect(url).toContain('source=offline'); // jamais refusé pour un quota atteint entre-temps
    expect(init.body.get('data')).toBeInstanceOf(Blob);
    expect(resolved).toEqual([{ gapId, text: 'ce qui s’est dit pendant la coupure' }]);
  });

  it('réseau toujours absent à l’envoi : le passage est gardé et repart plus tard', async () => {
    const resolved = [];
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    offline.startOfflineCapture(
      {},
      {
        live: true,
        getElapsedS: () => 0,
        onGapTranscribed: (gapId, text) => resolved.push(text),
      },
    );
    offline.notifyOfflineLiveState(false);
    offline.notifyOfflineLiveState(true);
    await settle();
    await settle();
    expect(resolved).toEqual([]); // rien de perdu, rien d'inventé

    fetchMock.mockResolvedValue(transcribed('rattrapé'));
    offline.flushOfflineQueue(); // retour du réseau
    await settle();
    await settle();
    expect(resolved).toEqual(['rattrapé']);
  });

  it('deux captures de suite sur la même transcription : leurs coupures ne portent pas le même nom', async () => {
    const opts = { live: true, getElapsedS: () => 0, onGapTranscribed: () => {} };
    offline.startOfflineCapture({}, opts);
    const first = offline.notifyOfflineLiveState(false);
    offline.endOfflineCapture();
    await settle();

    await new Promise((resolve) => setTimeout(resolve, 5));
    offline.startOfflineCapture({}, opts);
    const second = offline.notifyOfflineLiveState(false);
    expect(second).not.toBe(first);
  });

  it('arrêt en pleine coupure : le passage en attente est compté', async () => {
    offline.startOfflineCapture(
      {},
      { live: true, getElapsedS: () => 0, onGapTranscribed: () => {} },
    );
    offline.notifyOfflineLiveState(false);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(offline.endOfflineCapture().pendingGaps).toBe(1);
  });
});
