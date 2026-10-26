/**
 * POST /api/record — le fichier passe par le disque et non par la mémoire
 * (cf. l'en-tête de la route, routes/ai.js).
 *
 * TMPDIR pointe, test par test, sur un dossier à soi : c'est ce qui permet
 * d'affirmer « plus rien sur le disque » après chaque requête, sans être
 * dérangé par les autres fichiers de os.tmpdir().
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { buildTestApp, createFakeAudioChunker, identityHeaders, multipartBody } from './helpers.js';
import { UpstreamError, createOpenAiClient } from '../lib/openai.js';
import { FILE_LIMIT } from '../app.js';

let tmp;
let previousTempEnv;

beforeEach(() => {
  previousTempEnv = {
    TMPDIR: process.env.TMPDIR,
    TMP: process.env.TMP,
    TEMP: process.env.TEMP,
  };
  tmp = mkdtempSync(join(tmpdir(), 'mybrief-record-test-'));
  process.env.TMPDIR = tmp;
  process.env.TMP = tmp;
  process.env.TEMP = tmp;
});

afterEach(() => {
  for (const [key, value] of Object.entries(previousTempEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Plus aucun fichier temporaire. Attendu, et non constaté sur-le-champ : sur
 * un refus ou une erreur amont, la réponse part avant que le `finally` de la
 * route ait fini de supprimer le fichier.
 */
const expectDiskEmpty = () => vi.waitFor(() => expect(readdirSync(tmp)).toEqual([]));

function postRecord(app, content, filename = 'reunion.webm') {
  const { body, headers } = multipartBody(content, filename);
  return app.inject({
    method: 'POST',
    url: '/api/record',
    headers: { ...identityHeaders(), ...headers },
    body,
  });
}

/** Faux OpenAI local : enregistre chaque requête reçue, répond selon `answer(n)`. */
async function startFakeOpenAi(answer) {
  const received = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      const { status, body } = answer(received.length);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    received,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe('/api/record', () => {
  it('transcrit le fichier multipart (champ data) depuis le disque, puis le supprime', async () => {
    let onDisk = null;
    const { app, ai } = buildTestApp({
      openai: {
        transcribe: (params) => {
          onDisk = readFileSync(params.path, 'utf8');
          return { text: 'Bonjour à tous' };
        },
      },
    });
    const res = await postRecord(app, 'octets-audio');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ text: 'Bonjour à tous' });
    expect(ai.calls[0].params).toMatchObject({ filename: 'reunion.webm', mimetype: 'audio/webm' });
    // Plus de copie en mémoire : le client OpenAI reçoit un chemin, pas un buffer.
    expect(ai.calls[0].params.buffer).toBeUndefined();
    expect(ai.calls[0].params.path.startsWith(tmp)).toBe(true);
    expect(onDisk).toBe('octets-audio');
    await expectDiskEmpty();
  });

  it('envoie le fichier à gpt-transcribe, sans format de réponse : whisper-1 est retiré', async () => {
    // gpt-transcribe répond `{ text }` par défaut, comme whisper-1 : aucun
    // `response_format` à ajouter, et `/audio/transcriptions` n'accepte pas
    // les modèles du direct (gpt-live-transcribe).
    const inits = [];
    const client = createOpenAiClient({
      apiKey: 'sk-test-record-0123456789',
      fetchImpl: async (url, init) => {
        inits.push({ url, init });
        return { ok: true, json: async () => ({ text: 'ok', languages: [{ code: 'fr' }] }) };
      },
    });
    const { app } = buildTestApp({ openaiClient: client });
    const res = await postRecord(app, 'audio');

    expect(res.json()).toEqual({ text: 'ok' });
    expect(inits[0].url).toMatch(/\/audio\/transcriptions$/);
    expect(inits[0].init.body.get('model')).toBe('gpt-transcribe');
    expect(inits[0].init.body.has('response_format')).toBe(false);
  });

  it('audio refusé pour sa DURÉE → 413 audio_too_long ; un autre 400 reste relayé', async () => {
    // Message relevé sous gpt-4o-transcribe : le fichier tient dans les 25 Mo,
    // c'est sa durée que le modèle refuse. L'écran dit de le couper.
    const tooLong =
      '{"error":{"message":"audio duration 1800.024 seconds is longer than 1500 seconds ' +
      'which is the maximum for this model","type":"invalid_request_error","param":null}}';
    const other = '{"error":{"message":"Invalid file format.","type":"invalid_request_error"}}';
    const bodies = [tooLong, other];
    const { app } = buildTestApp({
      openai: {
        transcribe: () => {
          throw new UpstreamError(400, bodies.shift());
        },
      },
    });

    const first = await postRecord(app, 'audio');
    expect(first.statusCode).toBe(413);
    expect(first.json()).toEqual({ error: 'audio_too_long' });

    const second = await postRecord(app, 'audio');
    expect(second.statusCode).toBe(502);
    expect(second.body).toBe(other);
    await expectDiskEmpty();
  });

  /**
   * Découpe factice en `count` tranches écrites sur le disque, dans un dossier
   * que `cleanup` efface — comme lib/audioChunks.js.
   */
  function chunkerOf(count) {
    const cleanups = [];
    const chunker = createFakeAudioChunker({
      split: async () => {
        const dir = join(tmp, 'mybrief-chunks-x');
        mkdirSync(dir);
        const paths = Array.from({ length: count }, (_, i) => {
          const path = join(dir, `part00${i}.m4a`);
          writeFileSync(path, `tranche ${i}`);
          return path;
        });
        return {
          paths,
          cleanup: async () => {
            cleanups.push(Date.now());
            rmSync(dir, { recursive: true, force: true });
          },
        };
      },
    });
    chunker.cleanups = cleanups;
    return chunker;
  }

  it('un import long part en tranches, 3 à la fois, et revient dans l’ordre', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const chunker = chunkerOf(5);
    const { app, ai } = buildTestApp({
      audioChunker: chunker,
      openai: {
        transcribe: async (params) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          const i = Number(params.filename.match(/part00(\d)/)[1]);
          // La première tranche répond la DERNIÈRE : l'ordre est celui de l'audio.
          await new Promise((resolve) => setTimeout(resolve, i === 0 ? 40 : 5));
          inFlight -= 1;
          return { text: ` Phrase ${i} ` };
        },
      },
    });
    const res = await postRecord(app, 'audio-long', 'reunion.m4a');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ text: 'Phrase 0 Phrase 1 Phrase 2 Phrase 3 Phrase 4' });
    expect(maxInFlight).toBe(3);
    // Chaque tranche porte son nom (et son extension), pas celui du fichier envoyé.
    expect(ai.calls.map((c) => c.params.filename).sort()).toEqual([
      'part000.m4a',
      'part001.m4a',
      'part002.m4a',
      'part003.m4a',
      'part004.m4a',
    ]);
    expect(basename(chunker.calls[0]).startsWith('mybrief-record-')).toBe(true);
    expect(chunker.cleanups).toHaveLength(1);
    await expectDiskEmpty();
  });

  it('une tranche en échec fait échouer l’import ENTIER — jamais un texte à trous', async () => {
    let finished = 0;
    const chunker = chunkerOf(6);
    const { app, ai } = buildTestApp({
      audioChunker: chunker,
      openai: {
        transcribe: async (params) => {
          if (params.filename === 'part001.m4a') {
            throw new UpstreamError(500, '{"error":{"message":"boom"}}');
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
          // Le fichier de la tranche existe encore quand l'appel se termine.
          readFileSync(params.path);
          finished += 1;
          return { text: 'ok' };
        },
      },
    });
    const res = await postRecord(app, 'audio-long', 'reunion.m4a');

    expect(res.statusCode).toBe(500);
    expect(res.body).toBe('{"error":{"message":"boom"}}');
    // Plus rien ne part après l'échec ; les appels déjà en vol vont au bout
    // AVANT l'effacement des tranches.
    expect(ai.calls.length).toBeLessThan(6);
    expect(finished).toBe(ai.calls.length - 1);
    await expectDiskEmpty();
  });

  it('une tranche refusée pour sa durée → 413 audio_too_long, comme un fichier entier', async () => {
    const { app } = buildTestApp({
      audioChunker: chunkerOf(2),
      openai: {
        transcribe: () => {
          throw new UpstreamError(
            400,
            '{"error":{"message":"audio duration 420 seconds is longer than 400 seconds"}}',
          );
        },
      },
    });
    const res = await postRecord(app, 'audio-long', 'reunion.m4a');
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: 'audio_too_long' });
    await expectDiskEmpty();
  });

  it('sans fichier → 400 missing_file, sans appel amont', async () => {
    const { app, ai } = buildTestApp();
    const boundary = '----empty';
    const res = await app.inject({
      method: 'POST',
      url: '/api/record',
      headers: {
        ...identityHeaders(),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: `--${boundary}--\r\n`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'missing_file' });
    expect(ai.calls).toHaveLength(0);
  });

  it('au-delà de FILE_LIMIT → 413 file_too_large : rien de transcrit, rien sur le disque', async () => {
    const { app, ai } = buildTestApp();
    const res = await postRecord(app, Buffer.alloc(FILE_LIMIT + 1));
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: 'file_too_large' });
    expect(ai.calls).toHaveLength(0);
    await expectDiskEmpty();
  });

  it('erreur amont relayée VERBATIM (402 conservé, 401 remappé en 502), fichier supprimé', async () => {
    // Le frontend lit ce corps pour reconnaître un crédit épuisé : il ne doit
    // pas être réécrit en slug.
    const credit = '{"error":{"code":"insufficient_quota","message":"You exceeded your quota"}}';
    const statuses = [402, 401];
    const { app } = buildTestApp({
      openai: {
        transcribe: () => {
          throw new UpstreamError(statuses.shift(), credit);
        },
      },
    });

    const first = await postRecord(app, 'audio');
    expect(first.statusCode).toBe(402);
    expect(first.headers['content-type']).toContain('application/json');
    expect(first.body).toBe(credit);

    // Un 401 relayé tel quel serait pris pour une session expirée.
    const second = await postRecord(app, 'audio');
    expect(second.statusCode).toBe(502);
    expect(second.body).toBe(credit);
    await expectDiskEmpty();
  });

  it('relance sur 429 : la seconde tentative renvoie le fichier ENTIER, relu sur le disque', async () => {
    // Vrai client OpenAI, vrai fetch, faux serveur local : c'est l'envoi
    // lui-même qu'il faut voir rejouer. Un flux multipart relayé tel quel
    // serait parti vide à la relance.
    const audio = Buffer.from(Array.from({ length: 256 * 1024 }, (_, i) => (i * 31) % 251));
    const upstream = await startFakeOpenAi((n) =>
      n === 1
        ? { status: 429, body: '{"error":{"code":"rate_limit_exceeded"}}' }
        : { status: 200, body: '{"text":"Relancé"}' },
    );
    try {
      const client = createOpenAiClient({
        apiKey: 'sk-test-record-0123456789',
        baseUrl: upstream.baseUrl,
      });
      const { app } = buildTestApp({ openaiClient: client });
      const res = await postRecord(app, audio);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ text: 'Relancé' });
      expect(upstream.received).toHaveLength(2);
      for (const attempt of upstream.received) {
        expect(attempt.url).toBe('/v1/audio/transcriptions');
        expect(attempt.body.includes(audio)).toBe(true);
        // Taille connue d'avance (Blob adossé au fichier) : envoi dimensionné,
        // pas en morceaux de longueur inconnue.
        expect(Number(attempt.headers['content-length'])).toBe(attempt.body.length);
      }
      await expectDiskEmpty();
    } finally {
      await upstream.close();
    }
  });

  it("l'envoi à OpenAI refuse les redirections : sinon fetch retient tout l'audio jusqu'à la réponse", async () => {
    // Mesuré sous Node 20 (cf. lib/openai.js) : en `follow` (le défaut), les
    // 16 Mo d'un segment restent en mémoire pendant toute l'attente de Whisper.
    const inits = [];
    const client = createOpenAiClient({
      apiKey: 'sk-test-record-0123456789',
      fetchImpl: async (url, init) => {
        inits.push(init);
        return { ok: true, json: async () => ({ text: 'ok' }) };
      },
    });
    const { app } = buildTestApp({ openaiClient: client });
    expect((await postRecord(app, 'audio')).statusCode).toBe(200);
    expect(inits[0].redirect).toBe('error');
  });

  it('au-delà de 2 transcriptions en vol → 503 record_busy ; la place se libère ensuite', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    // « En vol » se constate à l'entrée dans le client OpenAI, pas au bout d'un
    // délai : vi.waitFor abandonne à 1 s, et un runner CI chargé a mis plus
    // longtemps à faire franchir le multipart et le disque aux deux requêtes
    // (échec du 2026-10-14, deux vérifications de production en parallèle).
    let arrived = 0;
    let bothArrived;
    const twoInFlight = new Promise((resolve) => {
      bothArrived = resolve;
    });
    const { app, ai } = buildTestApp({
      openai: {
        transcribe: async () => {
          arrived += 1;
          if (arrived === 2) bothArrived();
          await gate;
          return { text: 'ok' };
        },
      },
    });

    const first = postRecord(app, 'un');
    const second = postRecord(app, 'deux');
    // Une requête qui répondrait sans atteindre OpenAI fait échouer ici, avec
    // sa réponse, au lieu de laisser le test pendre jusqu'à son délai.
    const answeredTooSoon = (res) => {
      throw new Error(`réponse ${res.statusCode} avant la transcription : ${res.body}`);
    };
    await Promise.race([twoInFlight, first.then(answeredTooSoon), second.then(answeredTooSoon)]);
    expect(ai.calls).toHaveLength(2);

    const third = await postRecord(app, 'trois');
    expect(third.statusCode).toBe(503);
    expect(third.json()).toEqual({ error: 'record_busy' });
    expect(ai.calls).toHaveLength(2);

    release();
    expect((await first).statusCode).toBe(200);
    expect((await second).statusCode).toBe(200);
    expect((await postRecord(app, 'quatre')).statusCode).toBe(200);
    await expectDiskEmpty();
  });

  it('un échec rend sa place : refus et erreurs amont ne bloquent pas les suivants', async () => {
    let failures = 3;
    const { app } = buildTestApp({
      openai: {
        transcribe: () => {
          if (failures-- > 0) throw new UpstreamError(500, '{"error":{"message":"boom"}}');
          return { text: 'enfin' };
        },
      },
    });
    for (let i = 0; i < 3; i += 1) {
      expect((await postRecord(app, 'audio')).statusCode).toBe(500);
    }
    await postRecord(app, Buffer.alloc(FILE_LIMIT + 1));
    const res = await postRecord(app, 'audio');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ text: 'enfin' });
  });
});
