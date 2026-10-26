/**
 * Canal Realtime — le contrat make-before-break, testé avec un faux WebSocket
 * pilotable. Première couverture de cette logique (zéro test avant extraction).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRealtimeChannel, float32ToPcm16, arrayBufferToBase64 } from './channel.js';

/** Faux WebSocket : on déclenche open/close/message/error à la main. */
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
    this.closedWith = null;
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    this.sent.push(data);
  }
  close(code) {
    this.closedWith = code;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }
  // — pilotage test —
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  serverClose(code = 1006) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }
  fail(err = new Error('boom')) {
    this.onerror?.(err);
  }
  message(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

function makeChannel(overrides = {}) {
  const events = { messages: [], switched: 0, unexpectedClose: 0 };
  const channel = createRealtimeChannel({
    wsUrl: 'wss://api.test/v1/realtime?intent=transcription',
    onMessage: (m) => events.messages.push(m),
    onSwitched: () => (events.switched += 1),
    onUnexpectedClose: () => (events.unexpectedClose += 1),
    WebSocketImpl: FakeWebSocket,
    ...overrides,
  });
  return { channel, events };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('modèle de transcription', () => {
  it('reprend le modèle réglé en administration dans le session.update', async () => {
    // Le jeton a été créé par /tempkey AVEC ce modèle : un session.update qui
    // en annoncerait un autre ferait retomber la session sur un autre modèle,
    // et le réglage n'aurait aucun effet visible.
    let model = '';
    const { channel } = makeChannel({ getModel: () => model });
    model = 'gpt-4o-transcribe';

    const p = channel.rotate({ secret: 's1', lang: 'fr' });
    const ws = FakeWebSocket.instances[0];
    ws.open();
    await p;
    expect(JSON.parse(ws.sent[0]).session.audio.input.transcription.model).toBe(
      'gpt-4o-transcribe',
    );
  });

  it("modèle inconnu du serveur (version antérieure) → celui d'origine", async () => {
    const { channel } = makeChannel();
    const p = channel.rotate({ secret: 's1', lang: 'fr' });
    const ws = FakeWebSocket.instances[0];
    ws.open();
    await p;
    expect(JSON.parse(ws.sent[0]).session.audio.input.transcription.model).toBe(
      'gpt-realtime-whisper',
    );
  });

  it('annonce la VAD serveur avec 500 ms de pré-roll (attaque des prises de parole)', async () => {
    // À 300 ms (défaut), les premiers mots après un silence — changement
    // d'interlocuteur en visio — partaient tronqués vers la transcription.
    const { channel } = makeChannel();
    const p = channel.rotate({ secret: 's1', lang: 'fr' });
    const ws = FakeWebSocket.instances[0];
    ws.open();
    await p;
    expect(JSON.parse(ws.sent[0]).session.audio.input.turn_detection).toEqual({
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 500,
      silence_duration_ms: 500,
    });
  });
});

describe('rotate — make-before-break', () => {
  it('connecte, configure la session, bascule, puis ferme l’ancien en 1000', async () => {
    const { channel, events } = makeChannel();

    const p1 = channel.rotate({ secret: 's1', lang: 'fr' });
    const ws1 = FakeWebSocket.instances[0];
    expect(ws1.protocols).toEqual(['realtime', 'openai-insecure-api-key.s1']);
    ws1.open();
    await p1;
    expect(channel.isOpen()).toBe(true);
    expect(events.switched).toBe(1);
    const session = JSON.parse(ws1.sent[0]);
    expect(session.type).toBe('session.update');
    expect(session.session.audio.input.transcription.language).toBe('fr');

    // Rotation : l'ancien reste vivant jusqu'à la bascule du nouveau.
    const p2 = channel.rotate({ secret: 's2', lang: 'fr' });
    const ws2 = FakeWebSocket.instances[1];
    expect(ws1.closedWith).toBe(null); // pas encore fermé : make-before-break
    ws2.open();
    await p2;
    expect(ws1.closedWith).toBe(1000); // fermé PROPREMENT après bascule
    expect(events.switched).toBe(2);
    expect(events.unexpectedClose).toBe(0); // l'ancien fermé ≠ perte
  });

  it('échec d’ouverture : rejet, ancien socket INTACT, pas de bascule', async () => {
    const { channel, events } = makeChannel();
    const p1 = channel.rotate({ secret: 's1', lang: 'fr' });
    FakeWebSocket.instances[0].open();
    await p1;

    const p2 = channel.rotate({ secret: 's2', lang: 'fr' });
    FakeWebSocket.instances[1].fail();
    await expect(p2).rejects.toThrow();
    expect(channel.isOpen()).toBe(true); // toujours sur ws1
    expect(FakeWebSocket.instances[0].closedWith).toBe(null);
    expect(events.switched).toBe(1);
  });

  it('timeout d’ouverture : rejet après timeoutMs, ancien intact', async () => {
    const { channel } = makeChannel({ timeoutMs: 10000 });
    const p = channel.rotate({ secret: 's1', lang: 'fr' });
    p.catch(() => {}); // évitera l'unhandled rejection au tick des timers
    vi.advanceTimersByTime(10001);
    await expect(p).rejects.toThrow('timeout');
  });
});

describe('fermetures', () => {
  it('fermeture inattendue du socket COURANT → onUnexpectedClose (une fois)', async () => {
    const { channel, events } = makeChannel();
    const p = channel.rotate({ secret: 's1', lang: 'fr' });
    const ws1 = FakeWebSocket.instances[0];
    ws1.open();
    await p;
    ws1.serverClose();
    expect(events.unexpectedClose).toBe(1);
  });

  it('fermeture d’un socket REMPLACÉ : ignorée (guard current !== ws)', async () => {
    const { channel, events } = makeChannel();
    const p1 = channel.rotate({ secret: 's1', lang: 'fr' });
    const ws1 = FakeWebSocket.instances[0];
    ws1.open();
    await p1;
    const p2 = channel.rotate({ secret: 's2', lang: 'fr' });
    FakeWebSocket.instances[1].open();
    await p2;
    // ws1 déjà fermé par la rotation ; un onclose tardif ne signale rien
    ws1.serverClose();
    expect(events.unexpectedClose).toBe(0);
  });

  it('close() volontaire (stopRecording) : pas de onUnexpectedClose', async () => {
    const { channel, events } = makeChannel();
    const p = channel.rotate({ secret: 's1', lang: 'fr' });
    FakeWebSocket.instances[0].open();
    await p;
    channel.close();
    expect(events.unexpectedClose).toBe(0);
    expect(channel.isOpen()).toBe(false);
    expect(channel.isDeadOrDying()).toBe(true);
  });

  it('les messages du socket courant arrivent parsés', async () => {
    const { channel, events } = makeChannel();
    const p = channel.rotate({ secret: 's1', lang: 'fr' });
    const ws1 = FakeWebSocket.instances[0];
    ws1.open();
    await p;
    ws1.message({ type: 'transcript.delta', delta: 'bonjour' });
    expect(events.messages).toEqual([{ type: 'transcript.delta', delta: 'bonjour' }]);
  });
});

describe('sendAudioFrame', () => {
  it('rééchantillonne 48k → 24k, PCM16, base64 ; no-op socket fermé', async () => {
    const { channel } = makeChannel();
    const frame = new Float32Array(8).fill(0.5);
    channel.sendAudioFrame(frame, 48000); // pas de socket : silencieux
    const p = channel.rotate({ secret: 's1', lang: 'fr' });
    const ws1 = FakeWebSocket.instances[0];
    ws1.open();
    await p;
    channel.sendAudioFrame(frame, 48000);
    const sent = JSON.parse(ws1.sent[1]); // [0] = session.update
    expect(sent.type).toBe('input_audio_buffer.append');
    const pcm = new Int16Array(4).fill(Math.floor(0.5 * 0x7fff));
    expect(sent.audio).toBe(arrayBufferToBase64(pcm.buffer)); // moitié des échantillons
  });

  it('float32ToPcm16 : bornes et signes', () => {
    const out = float32ToPcm16(new Float32Array([1, -1, 0, 2, -2]));
    expect(Array.from(out)).toEqual([0x7fff, -0x8000, 0, 0x7fff, -0x8000]);
  });
});
