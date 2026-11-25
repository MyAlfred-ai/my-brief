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

describe('dialecte Mistral (Voxtral)', () => {
  const VOXTRAL = 'voxtral-mini-transcribe-realtime-2602';

  /** Ouvre un canal Voxtral jusqu'à la bascule : open, puis `session.created`. */
  async function openVoxtral(channel, secret = 'rt_1') {
    const p = channel.rotate({ secret, lang: 'en' });
    const ws = FakeWebSocket.instances.at(-1);
    ws.open();
    ws.message({ type: 'session.created', session: {} });
    await p;
    return ws;
  }

  it('socket Mistral du modèle, jeton `rt_` en second sous-protocole', async () => {
    const { channel } = makeChannel({ getModel: () => VOXTRAL });
    const ws = await openVoxtral(channel);
    expect(ws.url).toBe(
      'wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=voxtral-mini-transcribe-realtime-2602',
    );
    expect(ws.protocols).toEqual(['realtime', 'rt_1']);
  });

  it('attend `session.created` avant de configurer et de basculer', async () => {
    const { channel, events } = makeChannel({ getModel: () => VOXTRAL });
    const p = channel.rotate({ secret: 'rt_1', lang: 'fr' });
    const ws = FakeWebSocket.instances[0];
    ws.open();
    expect(ws.sent).toEqual([]);
    expect(events.switched).toBe(0);
    ws.message({ type: 'session.created', session: {} });
    await p;
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'session.update',
      session: {
        audio_format: { encoding: 'pcm_s16le', sample_rate: 16000 },
        language: 'fr',
        target_streaming_delay_ms: 480,
      },
    });
    expect(events.switched).toBe(1);
  });

  it('une erreur avant `session.created` fait échouer la rotation (jeton refusé)', async () => {
    const { channel, events } = makeChannel({ getModel: () => VOXTRAL });
    const p = channel.rotate({ secret: 'rt_1', lang: 'fr' });
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.fail();
    await expect(p).rejects.toThrow();
    expect(events.switched).toBe(0);
  });

  it('traduit ses deltas en deltas OpenAI ; le texte ENTIER de fin ne passe pas pour un delta', async () => {
    const { channel, events } = makeChannel({ getModel: () => VOXTRAL });
    const ws = await openVoxtral(channel);
    ws.message({ type: 'transcription.text.delta', text: ' Bonjour à' });
    ws.message({ type: 'transcription.done', text: 'Bonjour à tous.' });
    ws.message({ type: 'error', error: { message: 'x', code: 'invalid_request' } });
    expect(events.messages.slice(1)).toEqual([
      { type: 'conversation.item.input_audio_transcription.delta', delta: ' Bonjour à' },
      { type: 'transcription.done', text: 'Bonjour à tous.' },
      { type: 'error', error: { message: 'x', code: 'invalid_request' } },
    ]);
  });

  it('audio en PCM16 16 kHz (48k → 16k), message `input_audio.append`', async () => {
    const { channel } = makeChannel({ getModel: () => VOXTRAL });
    const ws = await openVoxtral(channel);
    channel.sendAudioFrame(new Float32Array(9).fill(0.5), 48000);
    const sent = JSON.parse(ws.sent[1]);
    expect(sent.type).toBe('input_audio.append');
    const pcm = new Int16Array(3).fill(Math.floor(0.5 * 0x7fff));
    expect(sent.audio).toBe(arrayBufferToBase64(pcm.buffer));
  });

  it('rotation : l’ancien socket finit son audio et rend ses derniers mots avant d’être fermé', async () => {
    const { channel, events } = makeChannel({ getModel: () => VOXTRAL });
    const ws1 = await openVoxtral(channel, 'rt_1');
    const ws2 = await openVoxtral(channel, 'rt_2');
    expect(JSON.parse(ws1.sent.at(-1))).toEqual({ type: 'input_audio.end' });
    expect(ws1.closedWith).toBe(null);
    // Ses derniers deltas arrivent encore, l'audio part sur le nouveau.
    ws1.message({ type: 'transcription.text.delta', text: ' fin.' });
    expect(events.messages.at(-1).delta).toBe(' fin.');
    channel.sendAudioFrame(new Float32Array(3), 16000);
    expect(JSON.parse(ws2.sent.at(-1)).type).toBe('input_audio.append');
    vi.advanceTimersByTime(3000);
    expect(ws1.closedWith).toBe(1000);
    expect(events.unexpectedClose).toBe(0);
  });

  it('passer d’OpenAI à Voxtral en cours de réunion : chaque socket parle son dialecte', async () => {
    let model = 'gpt-transcribe';
    const { channel } = makeChannel({ getModel: () => model });
    const p = channel.rotate({ secret: 'ek_1', lang: 'fr' });
    const ws1 = FakeWebSocket.instances[0];
    ws1.open();
    await p;
    model = VOXTRAL;
    const ws2 = await openVoxtral(channel);
    // L'ancien socket OpenAI est fermé net, comme avant.
    expect(ws1.closedWith).toBe(1000);
    channel.sendAudioFrame(new Float32Array(3), 16000);
    expect(JSON.parse(ws2.sent.at(-1)).type).toBe('input_audio.append');
  });
});

describe('dialecte Speechmatics', () => {
  const MODEL = 'speechmatics-melia-1';

  async function openSpeechmatics(channel, secret = 'jwt.temp') {
    const p = channel.rotate({ secret, lang: 'fr' });
    const ws = FakeWebSocket.instances.at(-1);
    ws.open();
    ws.message({ message: 'RecognitionStarted', id: 'sess' });
    await p;
    return ws;
  }

  it('socket UE, clé temporaire en `?jwt=`, sans sous-protocole', async () => {
    const { channel } = makeChannel({ getModel: () => MODEL });
    const ws = await openSpeechmatics(channel, 'ey J+/=');
    expect(ws.url).toBe('wss://eu.rt.speechmatics.com/v2?jwt=ey%20J%2B%2F%3D');
    expect(ws.protocols).toBeUndefined();
  });

  it('StartRecognition dès l’ouverture, bascule seulement après RecognitionStarted', async () => {
    const { channel, events } = makeChannel({ getModel: () => MODEL });
    const p = channel.rotate({ secret: 'jwt', lang: 'en' });
    const ws = FakeWebSocket.instances[0];
    ws.open();
    expect(JSON.parse(ws.sent[0])).toEqual({
      message: 'StartRecognition',
      audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: 16000 },
      transcription_config: {
        language: 'en',
        model: 'melia-1',
        max_delay: 1,
        enable_partials: false,
      },
    });
    expect(events.switched).toBe(0);
    ws.message({ message: 'RecognitionStarted' });
    await p;
    expect(events.switched).toBe(1);
  });

  it('audio en trames BINAIRES PCM16 16 kHz ; EndOfStream cite le dernier paquet', async () => {
    const { channel } = makeChannel({ getModel: () => MODEL });
    const ws1 = await openSpeechmatics(channel);
    channel.sendAudioFrame(new Float32Array(9).fill(0.5), 48000);
    channel.sendAudioFrame(new Float32Array(9).fill(0.5), 48000);
    const frame = ws1.sent[1];
    expect(frame).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Int16Array(frame))).toEqual(new Array(3).fill(Math.floor(0.5 * 0x7fff)));
    await openSpeechmatics(channel);
    expect(JSON.parse(ws1.sent.at(-1))).toEqual({ message: 'EndOfStream', last_seq_no: 2 });
    expect(ws1.closedWith).toBe(null);
    vi.advanceTimersByTime(3000);
    expect(ws1.closedWith).toBe(1000);
  });

  it('AddTranscript devient un delta ; AudioAdded passe tel quel (le canal vit)', async () => {
    const { channel, events } = makeChannel({ getModel: () => MODEL });
    const ws = await openSpeechmatics(channel);
    const word = (content, extra = {}) => ({
      type: 'word',
      attaches_to: 'none',
      alternatives: [{ content }],
      ...extra,
    });
    ws.message({ message: 'AudioAdded', seq_no: 1 });
    ws.message({
      message: 'AddTranscript',
      results: [
        word('Bonjour'),
        word('à'),
        word('tous'),
        { ...word('.'), type: 'punctuation', attaches_to: 'previous' },
      ],
    });
    ws.message({ message: 'AddTranscript', results: [word('Ça'), word('va')] });
    expect(events.messages.slice(1)).toEqual([
      { message: 'AudioAdded', seq_no: 1 },
      { type: 'conversation.item.input_audio_transcription.delta', delta: 'Bonjour à tous.' },
      { type: 'conversation.item.input_audio_transcription.delta', delta: ' Ça va' },
    ]);
  });

  it('une Error avant RecognitionStarted fait échouer la rotation sans attendre', async () => {
    const { channel, events } = makeChannel({ getModel: () => MODEL });
    const p = channel.rotate({ secret: 'jwt', lang: 'fr' });
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.message({ message: 'Error', type: 'not_authorised', reason: 'bad key' });
    await expect(p).rejects.toThrow('not_authorised');
    expect(events.switched).toBe(0);
    expect(events.messages[0]).toEqual({
      type: 'error',
      error: { type: 'not_authorised', code: 'not_authorised' },
    });
  });
});

describe('dialecte AssemblyAI', () => {
  const MODEL = 'universal-3-6-pro';

  async function openAssembly(channel, secret = 'tok') {
    const p = channel.rotate({ secret, lang: 'fr' });
    const ws = FakeWebSocket.instances.at(-1);
    ws.open();
    ws.message({ type: 'Begin', id: 'sess', expires_at: 0 });
    await p;
    return ws;
  }

  it('toute la configuration dans l’URL, jeton compris ; rien n’est envoyé à l’ouverture', async () => {
    const { channel } = makeChannel({ getModel: () => MODEL });
    const ws = await openAssembly(channel, 'to/k=');
    const url = new URL(ws.url);
    expect(`${url.origin}${url.pathname}`).toBe('wss://streaming.assemblyai.com/v3/ws');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      speech_model: 'universal-3-6-pro',
      encoding: 'pcm_s16le',
      sample_rate: '16000',
      format_turns: 'true',
      token: 'to/k=',
    });
    expect(ws.protocols).toBeUndefined();
    expect(ws.sent).toEqual([]);
  });

  it('partiels révisés → les seuls MOTS nouveaux en delta ; final mis en forme → completed du tour', async () => {
    const { channel, events } = makeChannel({ getModel: () => MODEL });
    const ws = await openAssembly(channel);
    const turn = (transcript, extra = {}) =>
      ws.message({
        type: 'Turn',
        turn_order: 0,
        end_of_turn: false,
        turn_is_formatted: false,
        transcript,
        ...extra,
      });
    turn('my number');
    turn('my number is five');
    turn('my number is'); // révision plus courte : rien de neuf
    turn('My number is 555-0134.', { end_of_turn: true, turn_is_formatted: true });
    const out = events.messages.slice(1).filter((m) => m.type !== 'Turn');
    expect(out).toEqual([
      {
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'aai-0',
        delta: 'my number',
      },
      {
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'aai-0',
        delta: ' is five',
      },
      {
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'aai-0',
        transcript: 'My number is 555-0134.',
      },
    ]);
  });

  it('Universal-Streaming : le final brut reste un delta, le final mis en forme clôt le tour', async () => {
    const { channel, events } = makeChannel({ getModel: () => 'universal-streaming-multilingual' });
    const ws = await openAssembly(channel);
    ws.message({
      type: 'Turn',
      turn_order: 3,
      end_of_turn: true,
      turn_is_formatted: false,
      transcript: 'bonjour à tous',
    });
    ws.message({
      type: 'Turn',
      turn_order: 3,
      end_of_turn: true,
      turn_is_formatted: true,
      transcript: 'Bonjour à tous.',
    });
    expect(events.messages.slice(1).map((m) => m.type)).toEqual([
      'conversation.item.input_audio_transcription.delta',
      'conversation.item.input_audio_transcription.completed',
    ]);
    expect(events.messages[1].item_id).toBe('aai-3');
  });

  it('audio binaire ; Terminate à la rotation, fermeture différée', async () => {
    const { channel } = makeChannel({ getModel: () => MODEL });
    const ws1 = await openAssembly(channel);
    channel.sendAudioFrame(new Float32Array(3), 16000);
    expect(ws1.sent[0]).toBeInstanceOf(ArrayBuffer);
    await openAssembly(channel);
    expect(JSON.parse(ws1.sent.at(-1))).toEqual({ type: 'Terminate' });
    vi.advanceTimersByTime(3000);
    expect(ws1.closedWith).toBe(1000);
  });
});
