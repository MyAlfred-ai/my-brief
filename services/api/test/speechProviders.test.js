/**
 * Transcription par un fournisseur TIERS (Mistral, Speechmatics, AssemblyAI)
 * à côté d'OpenAI.
 *
 * Ce que ces tests tiennent : le fournisseur suit le modèle choisi, partout —
 * jeton du direct, fichiers, test de l'écran, constats de configuration — et
 * un modèle tiers n'est jamais en service sans la clé de son fournisseur,
 * parce que la panne se verrait au démarrage d'une réunion, chez
 * l'utilisateur. Les clients sont éprouvés contre un faux `fetch` qui rejoue
 * les échanges relevés dans la documentation de chaque fournisseur.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTestApp,
  createFakeProviderKeyVerifier,
  identityHeaders,
  multipartBody,
  userDoc,
} from './helpers.js';
import { UpstreamError, upstreamMessage } from '../lib/openai.js';
import { createMistralClient } from '../lib/mistral.js';
import { createSpeechmaticsClient, verifySpeechmaticsKey } from '../lib/speechmatics.js';
import { createAssemblyAiClient, verifyAssemblyAiKey } from '../lib/assemblyai.js';
import { normalizeProviderKey } from '../lib/speechProviders.js';
import {
  KEYED_PROVIDERS,
  TRANSCRIPTION_MODELS,
  fileTranscriptionModel,
  providerKeyField,
  speechmaticsModel,
  transcriptionProvider,
} from '../lib/transcriptionModels.js';
import { PRICE_CATALOG } from '../lib/costs/catalog.js';

const ADMIN = 'patron@client.fr';
const KEY = 'AbCdEf0000000000000000000000002345';

/** Un modèle du direct par fournisseur tiers, et le modèle de fichier attendu. */
const CASES = {
  mistral: { model: 'voxtral-mini-transcribe-realtime-2602', file: 'voxtral-mini-2602' },
  speechmatics: { model: 'speechmatics-melia-1', file: 'melia-1' },
  assemblyai: { model: 'universal-3-6-pro', file: 'universal-3-5-pro' },
};

const adminSeed = (ai = null) => ({
  user: [userDoc(ADMIN, { role: 'admin' })],
  ...(ai ? { appSettings: [{ key: 'ai', ...ai }] } : {}),
});

function post(app, url, body) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(ADMIN), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const getAi = (app) =>
  app.inject({ method: 'GET', url: '/api/admin/settings/ai', headers: identityHeaders(ADMIN) });

describe('modèles et fournisseurs', () => {
  it('chaque modèle proposé a un fournisseur et un tarif de ce fournisseur', () => {
    for (const id of TRANSCRIPTION_MODELS) {
      expect(['openai', ...KEYED_PROVIDERS]).toContain(transcriptionProvider(id));
      expect(PRICE_CATALOG[id]?.audioMinute).toBeGreaterThan(0);
      expect(PRICE_CATALOG[id].provider).toBe(transcriptionProvider(id));
    }
  });

  it('le navigateur déduit le fournisseur du PRÉFIXE : les deux règles restent alignées', () => {
    // Copie de realtimeDialect (src/lib/realtime/channel.js) : si ce test
    // casse, le navigateur parlerait le mauvais protocole à ce modèle.
    const fromPrefix = (id) =>
      /^voxtral-/.test(id)
        ? 'mistral'
        : /^speechmatics-/.test(id)
          ? 'speechmatics'
          : /^universal-/.test(id)
            ? 'assemblyai'
            : 'openai';
    for (const id of TRANSCRIPTION_MODELS) expect(fromPrefix(id)).toBe(transcriptionProvider(id));
  });

  it('un fichier part chez le fournisseur du direct, avec son modèle de fichier', () => {
    for (const { model, file } of Object.values(CASES)) {
      expect(fileTranscriptionModel(model)).toBe(file);
    }
    expect(fileTranscriptionModel('speechmatics-enhanced')).toBe('enhanced');
    expect(fileTranscriptionModel('universal-streaming-multilingual')).toBe('universal-3-5-pro');
    expect(fileTranscriptionModel('gpt-realtime-whisper')).toBe('gpt-transcribe');
    expect(speechmaticsModel('speechmatics-enhanced')).toBe('enhanced');
  });

  it('le nom du champ de clé suit une seule règle, celle de l’écran', () => {
    expect(KEYED_PROVIDERS.map(providerKeyField)).toEqual([
      'mistralApiKey',
      'speechmaticsApiKey',
      'assemblyaiApiKey',
    ]);
  });
});

describe('normalizeProviderKey', () => {
  it('reconnaît une clé OpenAI collée dans le champ d’un autre fournisseur', () => {
    expect(normalizeProviderKey('sk-proj-abcdefghijklmnopqrstuvwxyz').problem).toBe(
      'provider_key_looks_openai',
    );
  });

  it("retire les espaces d'un copier-coller, refuse une clé trop courte", () => {
    expect(normalizeProviderKey(`  ${KEY}\n`)).toEqual({ key: KEY, problem: '' });
    expect(normalizeProviderKey('court').problem).toBe('provider_key_malformed');
    expect(normalizeProviderKey('')).toEqual({ key: '', problem: '' });
  });
});

describe('upstreamMessage', () => {
  it('lit les formes d’erreur des fournisseurs tiers, pas seulement celle d’OpenAI', () => {
    const msg = (body) => upstreamMessage(new UpstreamError(401, JSON.stringify(body)));
    expect(msg({ error: { message: 'openai' } })).toBe('openai');
    expect(msg({ error: 'Invalid API key' })).toBe('Invalid API key');
    expect(msg({ message: 'Unauthorized' })).toBe('Unauthorized');
    expect(msg({ detail: 'Bad key' })).toBe('Bad key');
    expect(upstreamMessage(new UpstreamError(500, 'pas du json'))).toBe('');
  });
});

describe.each(KEYED_PROVIDERS)('POST /api/admin/settings/ai — clé %s', (provider) => {
  const { model } = CASES[provider];
  const field = providerKeyField(provider);

  it('choisir un de ses modèles sans sa clé est refusé, en nommant le fournisseur', async () => {
    const { app, verifyProviderKey } = buildTestApp({ seed: adminSeed() });
    const res = await post(app, '/api/admin/settings/ai', { transcriptionModel: model });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'provider_key_missing', provider });
    expect(verifyProviderKey.calls).toEqual([]);
    expect((await getAi(app)).json().settings.transcriptionModel).toBe('gpt-realtime-whisper');
  });

  it('modèle et clé ensemble : la clé est vérifiée chez SON fournisseur, puis gardée secrète', async () => {
    const { app, verifyProviderKey, verifyApiKey } = buildTestApp({ seed: adminSeed() });
    const res = await post(app, '/api/admin/settings/ai', {
      transcriptionModel: model,
      [field]: ` ${KEY} `,
    });
    expect(res.statusCode).toBe(200);
    expect(verifyProviderKey.calls).toEqual([{ provider, key: KEY }]);
    expect(verifyApiKey.calls).toEqual([]);
    const { settings } = res.json();
    expect(settings.transcriptionModel).toBe(model);
    expect(settings.providerKeys[provider]).toEqual({ hasKey: true, hint: 'AbCdEf…2345' });
    // Les autres fournisseurs restent sans clé.
    for (const other of KEYED_PROVIDERS.filter((p) => p !== provider)) {
      expect(settings.providerKeys[other].hasKey).toBe(false);
    }
    expect(res.body).not.toContain(KEY);
  });

  it("N'ENREGISTRE PAS une clé refusée, et relaie le message du fournisseur", async () => {
    const { app, db } = buildTestApp({
      seed: adminSeed(),
      verifyProviderKey: createFakeProviderKeyVerifier({
        reject: { status: 401, message: 'Invalid API key' },
      }),
    });
    const res = await post(app, '/api/admin/settings/ai', {
      transcriptionModel: model,
      [field]: KEY,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'provider_key_rejected',
      provider,
      upstreamStatus: 401,
      upstreamMessage: 'Invalid API key',
    });
    expect(db.data.appSettings || []).toEqual([]);
  });

  it('une clé OpenAI collée dans son champ est nommée, sans appel réseau', async () => {
    const { app, verifyProviderKey } = buildTestApp({ seed: adminSeed() });
    const res = await post(app, '/api/admin/settings/ai', {
      [field]: 'sk-proj-abcdefghijklmnopqrstuvwxyz0123',
    });
    expect(res.json()).toMatchObject({ error: 'provider_key_looks_openai', provider });
    expect(verifyProviderKey.calls).toEqual([]);
  });

  it('retirer sa clé pendant qu’un de ses modèles transcrit est refusé', async () => {
    const { app } = buildTestApp({ seed: adminSeed({ transcriptionModel: model, [field]: KEY }) });
    const res = await post(app, '/api/admin/settings/ai', { [field]: '' });
    expect(res.json()).toMatchObject({ error: 'provider_key_in_use', provider });
    expect((await getAi(app)).json().settings.providerKeys[provider].hasKey).toBe(true);
  });

  it("revenir à OpenAI ET retirer la clé dans le même enregistrement : l'état d'arrivée compte", async () => {
    const { app } = buildTestApp({ seed: adminSeed({ transcriptionModel: model, [field]: KEY }) });
    const res = await post(app, '/api/admin/settings/ai', {
      transcriptionModel: 'gpt-transcribe',
      [field]: '',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.providerKeys[provider]).toEqual({ hasKey: false, hint: '' });
  });
});

describe('POST /api/admin/settings/ai — plusieurs fournisseurs', () => {
  it('la clé d’un AUTRE fournisseur ne satisfait pas le modèle choisi', async () => {
    const { app } = buildTestApp({ seed: adminSeed({ mistralApiKey: KEY }) });
    const res = await post(app, '/api/admin/settings/ai', {
      transcriptionModel: 'speechmatics-enhanced',
    });
    expect(res.json()).toMatchObject({ error: 'provider_key_missing', provider: 'speechmatics' });
  });

  it('changer de modèle chez le même fournisseur garde sa clé, sans revérifier', async () => {
    const { app, verifyProviderKey } = buildTestApp({
      seed: adminSeed({ transcriptionModel: 'speechmatics-melia-1', speechmaticsApiKey: KEY }),
    });
    const res = await post(app, '/api/admin/settings/ai', {
      transcriptionModel: 'speechmatics-enhanced',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.providerKeys.speechmatics.hasKey).toBe(true);
    expect(verifyProviderKey.calls).toEqual([]);
  });

  it('retirer la clé d’un fournisseur qui ne transcrit pas est libre', async () => {
    const { app } = buildTestApp({
      seed: adminSeed({
        transcriptionModel: 'universal-3-6-pro',
        assemblyaiApiKey: KEY,
        mistralApiKey: KEY,
      }),
    });
    const res = await post(app, '/api/admin/settings/ai', { mistralApiKey: '' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.providerKeys).toMatchObject({
      mistral: { hasKey: false },
      assemblyai: { hasKey: true },
    });
  });
});

describe.each(KEYED_PROVIDERS)(
  'POST /api/admin/settings/ai/test-transcription — %s',
  (provider) => {
    const { model } = CASES[provider];

    it('éprouve chez son fournisseur la clé collée, sans la stocker ni appeler OpenAI', async () => {
      const { app, ai, speech, db } = buildTestApp({ seed: adminSeed() });
      const res = await post(app, '/api/admin/settings/ai/test-transcription', {
        model,
        providerKey: KEY,
      });
      expect(res.json()).toEqual({ ok: true, model });
      expect(speech[provider].calls).toEqual([{ method: 'realtimeClientSecret', model, key: KEY }]);
      expect(ai.calls).toEqual([]);
      expect(db.data.appSettings || []).toEqual([]);
    });

    it('sans clé collée, prend la clé enregistrée ; sans aucune, le dit avant tout appel', async () => {
      const saved = buildTestApp({ seed: adminSeed({ [providerKeyField(provider)]: KEY }) });
      await post(saved.app, '/api/admin/settings/ai/test-transcription', { model });
      expect(saved.speech[provider].calls[0]).toMatchObject({ model, key: KEY });

      const none = buildTestApp({ seed: adminSeed() });
      const res = await post(none.app, '/api/admin/settings/ai/test-transcription', { model });
      expect(res.json()).toMatchObject({ error: 'provider_key_missing', provider });
      expect(none.speech[provider].calls).toEqual([]);
    });

    it('un 401 accuse la clé, un autre refus le modèle', async () => {
      for (const [status, slug] of [
        [401, 'provider_key_rejected'],
        [403, 'provider_model_rejected'],
      ]) {
        const { app } = buildTestApp({
          seed: adminSeed({ [providerKeyField(provider)]: KEY }),
          speech: {
            [provider]: {
              realtimeClientSecret: () => {
                throw new UpstreamError(status, JSON.stringify({ error: 'non' }));
              },
            },
          },
        });
        const res = await post(app, '/api/admin/settings/ai/test-transcription', { model });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ error: slug, provider, upstreamStatus: status, model });
      }
    });
  },
);

describe.each(KEYED_PROVIDERS)('/api/tempkey et /api/record — %s', (provider) => {
  const { model, file } = CASES[provider];
  const seed = () => ({
    appSettings: [{ key: 'ai', transcriptionModel: model, [providerKeyField(provider)]: KEY }],
  });

  it('le jeton vient de son fournisseur, sous la forme que lit le navigateur', async () => {
    const { app, ai, speech } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/tempkey?lang=en',
      headers: identityHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(speech[provider].calls).toEqual([
      { method: 'realtimeClientSecret', model, key: undefined },
    ]);
    expect(ai.calls).toEqual([]);
    expect(res.json()).toMatchObject({
      value: `${provider}_token_test`,
      client_secret: { value: `${provider}_token_test` },
      transcriptionModel: model,
    });
  });

  it('un refus du fournisseur est relayé comme celui d’OpenAI (429 tel quel)', async () => {
    const { app } = buildTestApp({
      seed: seed(),
      speech: {
        [provider]: {
          realtimeClientSecret: () => {
            throw new UpstreamError(429, JSON.stringify({ error: 'rate limited' }));
          },
        },
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/tempkey',
      headers: identityHeaders(),
    });
    expect(res.statusCode).toBe(429);
  });

  it('un import part chez lui, avec son modèle de fichier et la langue de l’interface', async () => {
    const { app, ai, speech } = buildTestApp({ seed: seed() });
    const { body, headers } = multipartBody('fake-audio', 'reunion.webm');
    const res = await app.inject({
      method: 'POST',
      url: '/api/record?lang=en',
      headers: { ...identityHeaders(), ...headers },
      body,
    });
    expect(res.json()).toEqual({ text: `transcription ${provider} par défaut` });
    expect(speech[provider].calls[0].params).toMatchObject({
      model: file,
      lang: 'en',
      filename: 'reunion.webm',
    });
    expect(ai.calls).toEqual([]);
  });
});

describe('/api/record — OpenAI inchangé', () => {
  it('sous OpenAI : gpt-transcribe, aucun fournisseur tiers', async () => {
    const { app, ai, speech } = buildTestApp();
    const { body, headers } = multipartBody('fake-audio', 'reunion.webm');
    await app.inject({
      method: 'POST',
      url: '/api/record',
      headers: { ...identityHeaders(), ...headers },
      body,
    });
    expect(ai.calls[0].params.model).toBe('gpt-transcribe');
    for (const provider of KEYED_PROVIDERS) expect(speech[provider].calls).toEqual([]);
  });
});

// ── Clients, contre un faux fetch ───────────────────────────────────────────

/** Faux fetch : journalise chaque requête, répond selon `answer(url, init, n)`. */
function fakeFetch(answer) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const { status = 200, body = {}, text } = answer(String(url), init, requests.length);
    return new Response(text ?? JSON.stringify(body), {
      status,
      headers: { 'content-type': text !== undefined ? 'text/plain' : 'application/json' },
    });
  };
  return { fetchImpl, requests };
}

const instant = async () => {};

describe('createMistralClient', () => {
  it('jeton `realtime` lié au modèle, clé relue à chaque appel ; sans clé, rien ne part', async () => {
    let key = 'cle-numero-un-assez-longue';
    const { fetchImpl, requests } = fakeFetch(() => ({
      status: 201,
      body: { client_secret: { value: 'rt_abc' } },
    }));
    const client = createMistralClient({ apiKey: () => key, fetchImpl });
    expect((await client.realtimeClientSecret(CASES.mistral.model)).client_secret.value).toBe(
      'rt_abc',
    );
    key = 'cle-numero-deux-assez-longue';
    await client.realtimeClientSecret(CASES.mistral.model, { key: 'candidate-assez-longue' });
    expect(requests[0].url).toBe('https://api.mistral.ai/v1/client/sessions');
    expect(JSON.parse(requests[0].init.body)).toEqual({
      purpose: 'realtime',
      model: CASES.mistral.model,
    });
    expect(requests[0].init.headers.Authorization).toBe('Bearer cle-numero-un-assez-longue');
    expect(requests[1].init.headers.Authorization).toBe('Bearer candidate-assez-longue');

    const empty = fakeFetch(() => ({}));
    const err = await createMistralClient({ apiKey: () => '', fetchImpl: empty.fetchImpl })
      .realtimeClientSecret('x')
      .catch((e) => e);
    expect(err.status).toBe(503);
    expect(JSON.parse(err.body).error).toMatchObject({
      code: 'provider_key_missing',
      provider: 'mistral',
    });
    expect(empty.requests).toEqual([]);
  });

  it('fichier : multipart file + model, { text }', async () => {
    const { fetchImpl, requests } = fakeFetch(() => ({ body: { text: 'Bonjour à tous.' } }));
    const client = createMistralClient({ apiKey: 'cle', fetchImpl });
    const result = await client.transcribe({
      buffer: Buffer.from('audio'),
      filename: 'a.webm',
      mimetype: 'audio/webm',
      model: 'voxtral-mini-2602',
    });
    expect(result).toEqual({ text: 'Bonjour à tous.' });
    expect(requests[0].url).toBe('https://api.mistral.ai/v1/audio/transcriptions');
    expect(requests[0].init.body.get('model')).toBe('voxtral-mini-2602');
    expect(requests[0].init.redirect).toBe('error');
  });
});

describe('createSpeechmaticsClient', () => {
  it('clé temporaire `rt` de 60 s, en Bearer, renvoyée sous l’enveloppe commune', async () => {
    const { fetchImpl, requests } = fakeFetch(() => ({
      status: 201,
      body: { apikey_id: null, key_value: 'eyJhbG.temp' },
    }));
    const client = createSpeechmaticsClient({ apiKey: 'cle-speechmatics', fetchImpl });
    expect(await client.realtimeClientSecret('speechmatics-melia-1')).toEqual({
      client_secret: { value: 'eyJhbG.temp' },
    });
    expect(requests[0].url).toBe('https://mp.speechmatics.com/v1/api_keys?type=rt');
    expect(requests[0].init.method).toBe('POST');
    expect(requests[0].init.headers.Authorization).toBe('Bearer cle-speechmatics');
    expect(JSON.parse(requests[0].init.body)).toEqual({ ttl: 60 });
  });

  it('fichier : tâche UE (config + data_file), relue jusqu’à `done`, texte relu à part', async () => {
    const { fetchImpl, requests } = fakeFetch((url) => {
      if (url.includes('/transcript')) return { text: 'Bonjour à tous.' };
      if (requests.length === 1) return { status: 201, body: { id: 'job1', status: 'created' } };
      if (requests.length === 2) return { body: { job: { id: 'job1', status: 'running' } } };
      return { body: { job: { id: 'job1', status: 'done' } } };
    });
    const client = createSpeechmaticsClient({ apiKey: 'cle', fetchImpl, sleep: instant });
    const result = await client.transcribe({
      buffer: Buffer.from('audio'),
      filename: 'a.webm',
      model: 'melia-1',
      lang: 'en',
    });
    expect(result).toEqual({ text: 'Bonjour à tous.' });
    expect(requests[0].url).toBe(
      'https://eu1.asr.api.speechmatics.com/v2/jobs/?wait=30&format=txt',
    );
    const form = requests[0].init.body;
    expect(JSON.parse(form.get('config'))).toEqual({
      type: 'transcription',
      transcription_config: { model: 'melia-1', language: 'en' },
    });
    expect(form.get('data_file').name).toBe('a.webm');
    expect(requests[1].url).toBe(
      'https://eu1.asr.api.speechmatics.com/v2/jobs/job1?wait=30&format=txt',
    );
    expect(requests.at(-1).url).toBe(
      'https://eu1.asr.api.speechmatics.com/v2/jobs/job1/transcript?format=txt',
    );
  });

  it('texte embarqué dès la création (`wait`) : aucune relecture', async () => {
    const { fetchImpl, requests } = fakeFetch(() => ({
      status: 201,
      body: { id: 'job1', status: 'done', txt: 'Vite fait.' },
    }));
    const client = createSpeechmaticsClient({ apiKey: 'cle', fetchImpl, sleep: instant });
    expect(await client.transcribe({ buffer: Buffer.from('a'), model: 'enhanced' })).toEqual({
      text: 'Vite fait.',
    });
    expect(requests).toHaveLength(1);
    // Sans langue : celle par défaut de l'application.
    expect(JSON.parse(requests[0].init.body.get('config')).transcription_config.language).toBe(
      'fr',
    );
  });

  it('tâche refusée, ou trop longue : une erreur amont, jamais un texte vide', async () => {
    const rejected = fakeFetch(() => ({ status: 201, body: { id: 'j', status: 'rejected' } }));
    const err = await createSpeechmaticsClient({
      apiKey: 'cle',
      fetchImpl: rejected.fetchImpl,
      sleep: instant,
    })
      .transcribe({ buffer: Buffer.from('a'), model: 'enhanced' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.status).toBe(502);

    let clock = 0;
    const slow = fakeFetch(() => ({ body: { id: 'j', status: 'running' } }));
    const late = await createSpeechmaticsClient({
      apiKey: 'cle',
      fetchImpl: slow.fetchImpl,
      sleep: async () => {
        clock += 11 * 60_000;
      },
      now: () => clock,
    })
      .transcribe({ buffer: Buffer.from('a'), model: 'enhanced' })
      .catch((e) => e);
    expect(late.status).toBe(504);
  });

  it('verifySpeechmaticsKey relaie le refus', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 401, body: { error: 'Permission Denied' } }));
    const err = await verifySpeechmaticsKey({ apiKey: 'x', fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.status).toBe(401);
  });
});

describe('createAssemblyAiClient', () => {
  it('jeton v3 d’une minute, clé TELLE QUELLE (sans Bearer)', async () => {
    const { fetchImpl, requests } = fakeFetch(() => ({
      body: { token: 'tok_123', expires_in_seconds: 60 },
    }));
    const client = createAssemblyAiClient({ apiKey: 'cle-assemblyai', fetchImpl });
    expect(await client.realtimeClientSecret('universal-3-6-pro')).toEqual({
      client_secret: { value: 'tok_123' },
    });
    expect(requests[0].url).toBe('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60');
    expect(requests[0].init.headers.Authorization).toBe('cle-assemblyai');
  });

  it('fichier : envoi, transcription (modèle + repli, langue détectée), relecture jusqu’à `completed`', async () => {
    const { fetchImpl, requests } = fakeFetch((url) => {
      if (url.endsWith('/upload')) return { body: { upload_url: 'https://cdn.example/audio' } };
      if (url.endsWith('/transcript')) return { body: { id: 't1', status: 'queued' } };
      if (requests.length === 3) return { body: { id: 't1', status: 'processing' } };
      return { body: { id: 't1', status: 'completed', text: 'Bonjour à tous.' } };
    });
    const client = createAssemblyAiClient({ apiKey: 'cle', fetchImpl, sleep: instant });
    const result = await client.transcribe({
      buffer: Buffer.from('audio'),
      mimetype: 'audio/webm',
      model: 'universal-3-5-pro',
    });
    expect(result).toEqual({ text: 'Bonjour à tous.' });
    expect(requests[0].url).toBe('https://api.assemblyai.com/v2/upload');
    expect(requests[0].init.headers['Content-Type']).toBe('application/octet-stream');
    expect(requests[1].url).toBe('https://api.assemblyai.com/v2/transcript');
    expect(JSON.parse(requests[1].init.body)).toEqual({
      audio_url: 'https://cdn.example/audio',
      speech_models: ['universal-3-5-pro', 'universal-2'],
      language_detection: true,
    });
    expect(requests[2].url).toBe('https://api.assemblyai.com/v2/transcript/t1');
    expect(requests.every((r) => r.init.headers.Authorization === 'cle')).toBe(true);
  });

  it('transcription en erreur : une erreur amont qui dit pourquoi', async () => {
    const { fetchImpl } = fakeFetch((url) => {
      if (url.endsWith('/upload')) return { body: { upload_url: 'u' } };
      return { body: { id: 't1', status: 'error', error: 'Audio duration is too short' } };
    });
    const err = await createAssemblyAiClient({ apiKey: 'cle', fetchImpl, sleep: instant })
      .transcribe({ buffer: Buffer.from('a'), model: 'universal-3-5-pro' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(upstreamMessage(err)).toContain('too short');
  });

  it('verifyAssemblyAiKey relaie le refus', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 401, body: { error: 'Invalid API key' } }));
    const err = await verifyAssemblyAiKey({ apiKey: 'x', fetchImpl }).catch((e) => e);
    expect(err.status).toBe(401);
  });
});

describe('GET /api/admin/config-checks — clé du fournisseur en service', () => {
  const issuesOf = async (app) =>
    (
      await app.inject({
        method: 'GET',
        url: '/api/admin/config-checks',
        headers: identityHeaders(ADMIN),
      })
    ).json().issues;

  it('clé révoquée chez le fournisseur en service : panne, qui le nomme', async () => {
    const { app } = buildTestApp({
      seed: adminSeed({
        apiKey: 'sk-ok',
        transcriptionModel: 'speechmatics-enhanced',
        speechmaticsApiKey: KEY,
      }),
      verifyProviderKey: createFakeProviderKeyVerifier({ reject: { status: 401 } }),
    });
    expect(await issuesOf(app)).toContainEqual({
      section: 'ai',
      code: 'ai_provider_key_rejected',
      level: 'error',
      vars: { provider: 'Speechmatics' },
    });
  });

  it('modèle en service sans sa clé (base éditée à la main) : panne', async () => {
    const { app } = buildTestApp({
      seed: adminSeed({ apiKey: 'sk-ok', transcriptionModel: 'universal-3-6-pro' }),
    });
    expect(await issuesOf(app)).toContainEqual({
      section: 'ai',
      code: 'ai_provider_key_missing',
      level: 'error',
      vars: { provider: 'AssemblyAI' },
    });
  });

  it('une clé gardée sans modèle de son fournisseur ne déclenche aucune sonde', async () => {
    const verify = createFakeProviderKeyVerifier({ reject: { status: 401 } });
    const { app } = buildTestApp({
      seed: adminSeed({ apiKey: 'sk-ok', assemblyaiApiKey: KEY }),
      verifyProviderKey: verify,
    });
    const codes = (await issuesOf(app)).map((issue) => issue.code);
    expect(codes).not.toContain('ai_provider_key_rejected');
    expect(verify.calls).toEqual([]);
  });
});
