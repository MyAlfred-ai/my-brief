/**
 * Pile Realtime assemblée — les scénarios de l'incident du 26/08/2026 vus de
 * bout en bout : socket zombie, erreur OpenAI avalée, canal système sans
 * superviseur. Faux WebSocket + faux temps, aucun réseau.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRealtimeStack } from './stack.js';

const ROTATION_MS = 25 * 60 * 1000;
const STALE_MS = 40_000;
const CHECK_MS = 5_000;

/** Faux WebSocket : open/close/message pilotés à la main. */
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    this.sent.push(data);
  }
  close(code) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  serverClose(code = 1006) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }
  message(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  static last() {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }
}

function makeStack(overrides = {}) {
  const ctx = {
    recording: true,
    paused: false,
    messages: [],
    toasts: [],
    states: [],
    events: [],
    tempkeys: 0,
    systemReady: 0,
    stack: null,
  };
  const stack = createRealtimeStack({
    wsUrl: 'wss://api.test/v1/realtime?intent=transcription',
    getLang: () => 'fr',
    getModel: () => 'gpt-realtime-whisper',
    fetchTempKey: () => {
      ctx.tempkeys += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        data: { value: `sk-${ctx.tempkeys}`, transcriptionModel: 'gpt-realtime-whisper' },
      });
    },
    isRecording: () => ctx.recording,
    isPaused: () => ctx.paused,
    // Câblage réel : handleMessage (App.svelte) délègue les `error` à la pile.
    onMessage: (m, source) => {
      ctx.messages.push({ type: m.type, source });
      if (m.type === 'error') ctx.stack.reportError(m, source);
    },
    onConnectionState: (s) => ctx.states.push(s),
    onSystemReady: () => (ctx.systemReady += 1),
    showToast: (key) => ctx.toasts.push(key),
    reporter: { report: (type, details) => ctx.events.push({ type, ...details }) },
    rotationMs: ROTATION_MS,
    staleMs: STALE_MS,
    silenceCheckMs: CHECK_MS,
    // vi.useFakeTimers() pilote aussi Date : horloge et échéanciers ne peuvent
    // pas diverger, ce qui est exactement ce qu'on veut tester ici.
    now: () => Date.now(),
    WebSocketImpl: FakeWebSocket,
    ...overrides,
  });
  ctx.stack = stack;
  return { stack, ctx };
}

/** Laisse la chaîne /tempkey → rotate créer son socket, puis le rend. */
async function nextSocket(afterCount) {
  for (let i = 0; i < 20 && FakeWebSocket.instances.length <= afterCount; i++) {
    await vi.advanceTimersByTimeAsync(1);
  }
  return FakeWebSocket.last();
}

/** Ouvre le canal micro (1re connexion, clé déjà obtenue par l'écran de démarrage). */
async function openMic(stack) {
  const p = stack.rotateMic('sk-initial');
  FakeWebSocket.last().open();
  await p;
  return FakeWebSocket.last();
}

/** Rattache et ouvre le canal audio système. */
async function openSystem(stack) {
  const before = FakeWebSocket.instances.length;
  const p = stack.attachSystem();
  const ws = await nextSocket(before);
  ws.open();
  await p;
  return ws;
}

/** Parle `ms` sur le canal micro : une frame non silencieuse tous les 100 ms. */
async function speakFor(stack, ms) {
  const frame = new Float32Array(128).fill(0.3);
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    stack.sendMicAudio(frame, 48000, 0.25);
    await vi.advanceTimersByTimeAsync(100);
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('socket zombie : ouvert, muet, application vivante', () => {
  it('transcription muette pendant que l’audio tourne → UNE reconnexion, par le superviseur', async () => {
    const { stack, ctx } = makeStack();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ws = await openMic(stack);
    stack.start();

    await speakFor(stack, STALE_MS + CHECK_MS);

    // Une seule reconnexion : le superviseur est single-flight, le chien de
    // garde ne crée pas de second mécanisme concurrent.
    expect(ctx.tempkeys).toBe(1);
    expect(ctx.toasts.filter((t) => t === 'statuses.transcriptionInterrupted')).toHaveLength(1);
    // Pas de doublon « Connexion perdue » par-dessus (noteDropNotified).
    expect(ctx.toasts).not.toContain('statuses.connectionLost');
    const wd = ctx.events.filter((e) => e.type === 'realtime_watchdog');
    expect(wd).toHaveLength(1);
    expect(wd[0].durationMs).toBeGreaterThanOrEqual(STALE_MS);
    // Make-before-break : l'ancien socket n'est PAS fermé avant que le nouveau
    // soit prêt — aucune parole perdue.
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
    stack.stop();
  });

  it('le nouveau socket prend la main : toast « rétablie » et durée de coupure mesurée', async () => {
    const { stack, ctx } = makeStack();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await openMic(stack);
    stack.start();
    await speakFor(stack, STALE_MS + CHECK_MS);

    const fresh = await nextSocket(1);
    fresh.open();
    await vi.advanceTimersByTimeAsync(1);

    expect(ctx.toasts).toContain('statuses.connectionRestored');
    const restored = ctx.events.find((e) => e.type === 'realtime_restored');
    expect(restored.channel).toBe('mic');
    expect(restored.durationMs).toBeGreaterThanOrEqual(0);
    stack.stop();
  });

  it('messages reçus régulièrement : aucune reconnexion, aucun toast', async () => {
    const { stack, ctx } = makeStack();
    const ws = await openMic(stack);
    stack.start();
    for (let i = 0; i < 20; i++) {
      ws.message({ type: 'conversation.item.input_audio_transcription.delta', delta: 'ok' });
      await speakFor(stack, STALE_MS / 2);
    }
    expect(ctx.tempkeys).toBe(0);
    expect(ctx.toasts).toHaveLength(0);
    expect(ctx.messages.filter((m) => m.source === 'local')).toHaveLength(20);
    stack.stop();
  });

  it('réunion silencieuse : aucune reconnexion, sur 20 min de silence', async () => {
    const { stack, ctx } = makeStack();
    await openMic(stack);
    stack.start();
    const frame = new Float32Array(128);
    for (let i = 0; i < 200; i++) {
      stack.sendMicAudio(frame, 48000, 0.0005); // sous le seuil de RMS
      await vi.advanceTimersByTimeAsync(6_000);
    }
    expect(ctx.tempkeys).toBe(0);
    expect(ctx.toasts).toHaveLength(0);
    stack.stop();
  });

  it('pause : le chien de garde ne se déclenche pas, la reprise repart de zéro', async () => {
    const { stack, ctx } = makeStack();
    await openMic(stack);
    stack.start();
    ctx.paused = true;
    await speakFor(stack, STALE_MS * 4);
    expect(ctx.tempkeys).toBe(0);
    ctx.paused = false;
    stack.noteResumed();
    await speakFor(stack, STALE_MS - CHECK_MS * 2);
    expect(ctx.tempkeys).toBe(0);
    stack.stop();
  });

  it('socket fermé : le chien de garde laisse la main à onUnexpectedClose (une seule reconnexion)', async () => {
    // /tempkey ne répond jamais : la reconnexion reste en vol, le socket reste
    // fermé. Le chien de garde ne doit RIEN ajouter dans cet état.
    const { stack, ctx } = makeStack({
      fetchTempKey: () => {
        ctx.tempkeys += 1;
        return new Promise(() => {});
      },
    });
    const ws = await openMic(stack);
    stack.start();
    ws.serverClose();
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.tempkeys).toBe(1);

    await speakFor(stack, STALE_MS + CHECK_MS * 3);
    expect(ctx.tempkeys).toBe(1);
    stack.stop();
  });
});

describe('erreurs OpenAI — jamais avalées', () => {
  it('session invalide : log, toast, reconnexion, télémétrie', async () => {
    const { stack, ctx } = makeStack();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ws = await openMic(stack);
    stack.start();

    ws.message({
      type: 'error',
      error: { type: 'invalid_request_error', code: 'session_expired' },
    });
    await vi.advanceTimersByTimeAsync(1);

    expect(err).toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toContain('session_expired');
    expect(ctx.toasts).toContain('statuses.transcriptionInterrupted');
    expect(ctx.tempkeys).toBe(1);
    expect(ctx.events.find((e) => e.type === 'realtime_error').code).toBe('session_expired');
    stack.stop();
  });

  it('crédit épuisé : toast dédié, PAS de reconnexion (elle échouerait pareil)', async () => {
    const { stack, ctx } = makeStack();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ws = await openMic(stack);
    stack.start();
    ws.message({ type: 'error', error: { code: 'insufficient_quota' } });
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.toasts).toContain('statuses.transcriptionCreditExhausted');
    expect(ctx.tempkeys).toBe(0);
    stack.stop();
  });

  it('erreur banale : loggée, mais ni toast ni reconnexion', async () => {
    const { stack, ctx } = makeStack();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ws = await openMic(stack);
    stack.start();
    ws.message({ type: 'error', error: { code: 'invalid_value' } });
    await vi.advanceTimersByTimeAsync(1);
    expect(warn).toHaveBeenCalled();
    expect(ctx.toasts).toHaveLength(0);
    expect(ctx.tempkeys).toBe(0);
    stack.stop();
  });

  it('le log ne contient jamais le texte libre de l’erreur (confidentialité réunion)', async () => {
    const { stack } = makeStack();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ws = await openMic(stack);
    stack.start();
    ws.message({
      type: 'error',
      error: { code: 'session_expired', message: 'contexte : le budget 2027 du client' },
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(err.mock.calls.flat().join(' ')).not.toContain('budget');
    stack.stop();
  });

  it('erreur sur le canal système : AUCUN toast (pas d’alerte en double), mais reconnexion système', async () => {
    const { stack, ctx } = makeStack();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sysWs = await openSystem(stack);
    const before = ctx.tempkeys;

    sysWs.message({ type: 'error', error: { code: 'session_expired' } });
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.toasts).toHaveLength(0);
    expect(ctx.tempkeys).toBe(before + 1);
    stack.stop();
  });
});

describe('canal audio système — son propre superviseur', () => {
  it('rotation préventive à 25 min, sans dépendre du micro et sans toast', async () => {
    const { stack, ctx } = makeStack();
    const first = await openSystem(stack);
    expect(ctx.systemReady).toBe(1);
    const afterAttach = ctx.tempkeys;

    await vi.advanceTimersByTimeAsync(ROTATION_MS);
    expect(ctx.tempkeys).toBe(afterAttach + 1);
    const rotated = await nextSocket(FakeWebSocket.instances.length - 1);
    rotated.open();
    await vi.advanceTimersByTimeAsync(1);

    // Nouveau socket en service, l'ancien fermé APRÈS la bascule, et le
    // processor audio n'est pas recréé côté App (onSystemReady est idempotent
    // grâce au garde `!wsAudioProcessorSys`).
    expect(ctx.systemReady).toBe(2);
    expect(first.readyState).toBe(FakeWebSocket.CLOSED);
    expect(ctx.toasts).toHaveLength(0);
    stack.stop();
  });

  it('health check système inerte tant qu’aucun audio système n’est rattaché', async () => {
    const { stack, ctx } = makeStack();
    await openMic(stack);
    stack.start();
    // Sans attachSystem(), le socket système n'existe pas : sans le garde
    // `systemAttached`, son health check demanderait un /tempkey toutes les
    // 30 s sur toutes les réunions sans audio système.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(ctx.tempkeys).toBe(0);
    stack.stop();
  });

  it('un échec système répété ne casse ni ne ralentit le micro', async () => {
    const { stack, ctx } = makeStack({
      fetchTempKey: () => Promise.resolve({ ok: false, status: 502, data: {} }),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ws = await openMic(stack);
    stack.start();
    await stack.attachSystem();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    // Le socket micro est intact et continue de transcrire.
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
    ws.message({ type: 'conversation.item.input_audio_transcription.delta', delta: 'ok' });
    expect(ctx.messages.at(-1)).toEqual({
      type: 'conversation.item.input_audio_transcription.delta',
      source: 'local',
    });
    expect(ctx.toasts).toHaveLength(0);
    stack.stop();
  });
});

describe('non-régression', () => {
  it('rotation micro à 25 min, silencieuse, et onPeriodicCheck coupe tout (plafond 8 h)', async () => {
    const { stack, ctx } = makeStack();
    await openMic(stack);
    let capped = false;
    stack.start({ onPeriodicCheck: () => !capped });

    await vi.advanceTimersByTimeAsync(ROTATION_MS);
    expect(ctx.tempkeys).toBe(1);
    const rotated = await nextSocket(1);
    rotated.open();
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.toasts).toHaveLength(0); // rotation planifiée = aucun toast

    capped = true; // onPeriodicCheck === false : plus aucune rotation
    await vi.advanceTimersByTimeAsync(ROTATION_MS * 2);
    expect(ctx.tempkeys).toBe(1);
    stack.stop();
  });

  it('stop() puis close() : plus aucun réveil, les deux sockets fermés', async () => {
    const { stack, ctx } = makeStack();
    const mic = await openMic(stack);
    stack.start();
    const sys = await openSystem(stack);

    const before = ctx.tempkeys; // la 1re connexion système en a consommé une
    stack.stop();
    stack.close();
    ctx.recording = false;
    await vi.advanceTimersByTimeAsync(ROTATION_MS * 3);
    expect(mic.readyState).toBe(FakeWebSocket.CLOSED);
    expect(sys.readyState).toBe(FakeWebSocket.CLOSED);
    expect(ctx.tempkeys).toBe(before);
  });
});
