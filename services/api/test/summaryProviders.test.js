/**
 * Rédaction du compte rendu par OpenAI OU par Mistral (lib/summaryModels.js).
 *
 * Ce que ces tests tiennent : le fournisseur suit le modèle choisi, partout —
 * génération, test de l'écran, prix, constats de configuration — et un modèle
 * Mistral n'est jamais en service sans la clé de Mistral, parce que la panne
 * se verrait à la génération, chez l'utilisateur. Le client Mistral est
 * éprouvé contre un faux `fetch` qui rejoue l'échange relevé dans la
 * documentation de Mistral (aucune clé de test, aucun appel réel).
 */
import { describe, it, expect } from 'vitest';
import {
  buildTestApp,
  createFakeProviderKeyVerifier,
  identityHeaders,
  userDoc,
} from './helpers.js';
import { UpstreamError } from '../lib/openai.js';
import { chatText, createMistralClient } from '../lib/mistral.js';
import { SUMMARY_MODELS, SUMMARY_PROVIDERS, summaryProvider } from '../lib/summaryModels.js';
import { KEYED_PROVIDERS } from '../lib/transcriptionModels.js';
import { PRICE_CATALOG } from '../lib/costs/catalog.js';

const ADMIN = 'patron@client.fr';
const KEY = 'AbCdEf0000000000000000000000002345';
const MISTRAL = 'mistral-large-2512';

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

function fakeFetch(answer) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const { status = 200, body = {} } = answer(String(url), init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchImpl, requests };
}

const rejecting = (status, message) => async () => {
  throw new UpstreamError(status, JSON.stringify({ message }));
};

describe('modèles de rédaction et fournisseurs', () => {
  it('chaque modèle proposé a un fournisseur, et un tarif de texte de ce fournisseur', () => {
    for (const id of SUMMARY_MODELS) {
      expect(['openai', ...KEYED_PROVIDERS]).toContain(summaryProvider(id));
      expect(PRICE_CATALOG[id]?.kind, id).toBe('text');
      expect(PRICE_CATALOG[id].inputMTok, id).toBeGreaterThan(0);
      expect(PRICE_CATALOG[id].outputMTok, id).toBeGreaterThan(0);
      expect(PRICE_CATALOG[id].provider, id).toBe(summaryProvider(id));
    }
  });

  it('les trois paliers de GPT-6 et des modèles Mistral sont proposés', () => {
    for (const id of ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna']) {
      expect(SUMMARY_PROVIDERS[id]).toBe('openai');
    }
    expect(SUMMARY_MODELS.filter((id) => summaryProvider(id) === 'mistral').length).toBeGreaterThan(
      1,
    );
  });

  it('un modèle hors liste (OPENAI_MODEL_SUMMARY) rédige chez OpenAI, comme avant', () => {
    expect(summaryProvider('gpt-5.6-terra')).toBe('openai');
    expect(summaryProvider('')).toBe('openai');
  });
});

describe('createMistralClient — chat()', () => {
  it('POST /chat/completions : le modèle et les messages, RIEN d’autre', async () => {
    const { fetchImpl, requests } = fakeFetch(() => ({
      body: { choices: [{ message: { role: 'assistant', content: '<h1>CR</h1>' } }] },
    }));
    const client = createMistralClient({ apiKey: () => 'cle-enregistree-assez-longue', fetchImpl });
    const text = await client.chat({
      model: MISTRAL,
      messages: [{ role: 'user', content: 'x' }],
      // Demandés par /resume pour OpenAI : Mistral les refuserait (422).
      verbosity: 'high',
      reasoningEffort: 'medium',
      timeoutMs: 600_000,
    });
    expect(text).toBe('<h1>CR</h1>');
    expect(requests[0].url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(JSON.parse(requests[0].init.body)).toEqual({
      model: MISTRAL,
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(requests[0].init.headers.Authorization).toBe('Bearer cle-enregistree-assez-longue');
  });

  it('une clé CANDIDATE passe avant l’enregistrée (test de l’écran)', async () => {
    const { fetchImpl, requests } = fakeFetch(() => ({
      body: { choices: [{ message: { content: 'OK' } }] },
    }));
    const client = createMistralClient({ apiKey: () => 'cle-enregistree-assez-longue', fetchImpl });
    await client.chat({ model: MISTRAL, messages: [], key: 'candidate-assez-longue' });
    expect(requests[0].init.headers.Authorization).toBe('Bearer candidate-assez-longue');
  });

  it('un modèle qui raisonne : la réponse seule, jamais la trace', () => {
    // Forme relevée dans la documentation de Mistral : la trace (`thinking`)
    // précède la réponse (`text`). La garder la publierait dans le compte rendu.
    expect(
      chatText([
        { type: 'thinking', thinking: [{ type: 'text', text: 'Je réfléchis…' }] },
        { type: 'text', text: '<h1>Compte rendu</h1>' },
        { type: 'text', text: '<p>Suite</p>' },
      ]),
    ).toBe('<h1>Compte rendu</h1><p>Suite</p>');
    expect(chatText('texte')).toBe('texte');
    expect(chatText(null)).toBe('');
  });
});

describe('GET /api/admin/settings/ai — rédaction', () => {
  it('sert le fournisseur de chaque modèle, et le prix d’un compte rendu', async () => {
    const { app } = buildTestApp({ seed: adminSeed({ apiKey: 'sk-ok' }) });
    const { settings, prices } = (await getAi(app)).json();
    expect(settings.summaryProviders).toEqual(SUMMARY_PROVIDERS);
    expect(prices.summary.map((entry) => entry.model)).toEqual(SUMMARY_MODELS);
    for (const entry of prices.summary) expect(entry.unitEur, entry.model).toBeGreaterThan(0);
    const of = (id) => prices.summary.find((entry) => entry.model === id).unitEur;
    // Ordre de grandeur, pour une réunion d'une heure : Astra coûte bien plus
    // que Luna, et un compte rendu reste sous l'euro.
    expect(of('gpt-6-astra')).toBeGreaterThan(of('gpt-6-luna') * 50);
    expect(of('gpt-6-astra')).toBeLessThan(1);
  });
});

describe('POST /api/admin/settings/ai — modèle Mistral', () => {
  it('sans clé Mistral : refusé, et le refus nomme Mistral', async () => {
    const { app } = buildTestApp({ seed: adminSeed({ apiKey: 'sk-ok' }) });
    const res = await post(app, '/api/admin/settings/ai', { summaryModel: MISTRAL });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'provider_key_missing', provider: 'mistral' });
  });

  it('la clé collée part avec le modèle : vérifiée, puis enregistrée', async () => {
    const verify = createFakeProviderKeyVerifier();
    const { app } = buildTestApp({
      seed: adminSeed({ apiKey: 'sk-ok' }),
      verifyProviderKey: verify,
    });
    const res = await post(app, '/api/admin/settings/ai', {
      summaryModel: MISTRAL,
      mistralApiKey: KEY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({
      summaryModel: MISTRAL,
      summaryModelSource: 'settings',
    });
    expect(verify.calls).toEqual([{ provider: 'mistral', key: KEY }]);
  });

  it('la clé déjà enregistrée (pour Voxtral) suffit', async () => {
    const { app } = buildTestApp({ seed: adminSeed({ apiKey: 'sk-ok', mistralApiKey: KEY }) });
    const res = await post(app, '/api/admin/settings/ai', { summaryModel: MISTRAL });
    expect(res.statusCode).toBe(200);
  });

  it('la clé ne se retire pas tant que Mistral rédige ; elle se retire avec le retour à OpenAI', async () => {
    const { app } = buildTestApp({
      seed: adminSeed({ apiKey: 'sk-ok', mistralApiKey: KEY, summaryModel: MISTRAL }),
    });
    const refused = await post(app, '/api/admin/settings/ai', { mistralApiKey: '' });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ error: 'provider_key_in_use', provider: 'mistral' });

    const both = await post(app, '/api/admin/settings/ai', {
      mistralApiKey: '',
      summaryModel: 'gpt-5.4',
    });
    expect(both.statusCode).toBe(200);
    expect(both.json().settings.providerKeys.mistral.hasKey).toBe(false);
  });
});

describe('/api/resume — rédigé chez le fournisseur du modèle', () => {
  const resume = (app) =>
    post(app, '/api/resume', {
      transcription: 'On a parlé du projet INITECH.',
      systemPrompt: 'Tu es un rédacteur de comptes-rendus.',
      template: 'standard',
      language: 'fr',
      actions: [],
      versionId: 'v1',
      meetingId: null,
      isEdit: false,
    });

  it('modèle Mistral : le compte rendu vient de Mistral, le titre reste chez OpenAI', async () => {
    const { app, ai, speech } = buildTestApp({
      seed: adminSeed({ apiKey: 'sk-ok', mistralApiKey: KEY, summaryModel: MISTRAL }),
      speech: { mistral: { chat: '<h1>CR Mistral</h1>' } },
      openai: { chat: 'Point projet INITECH' },
    });
    const res = await resume(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().resume).toBe('<h1>CR Mistral</h1>');
    const [call] = speech.mistral.calls.filter((c) => c.method === 'chat');
    expect(call.params.model).toBe(MISTRAL);
    expect(call.params.messages[0].content).toBe('Tu es un rédacteur de comptes-rendus.');
    // Rien du compte rendu ne part chez OpenAI.
    const openaiCalls = ai.calls.filter((c) => c.method === 'chat');
    expect(openaiCalls.every((c) => !c.params.messages[0].content.startsWith('Tu es'))).toBe(true);
  });

  it('le refus de Mistral est relayé, sans 401 qui passerait pour une session perdue', async () => {
    const { app } = buildTestApp({
      seed: adminSeed({ apiKey: 'sk-ok', mistralApiKey: KEY, summaryModel: MISTRAL }),
      speech: { mistral: { chat: rejecting(401, 'Unauthorized') } },
    });
    const res = await resume(app);
    expect(res.statusCode).toBe(502);
  });
});

describe('POST /api/admin/settings/ai/test-summary — chez le bon fournisseur', () => {
  it('modèle Mistral : éprouvé chez Mistral, avec la clé collée', async () => {
    const { app, ai, speech } = buildTestApp({ seed: adminSeed({ apiKey: 'sk-ok' }) });
    const res = await post(app, '/api/admin/settings/ai/test-summary', {
      model: MISTRAL,
      providerKey: ` ${KEY} `,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, model: MISTRAL });
    const [call] = speech.mistral.calls;
    expect(call.params).toMatchObject({ model: MISTRAL, key: KEY });
    expect(ai.calls.filter((c) => c.method === 'chat')).toEqual([]);
  });

  it('sans clé, ni collée ni enregistrée : il le dit, sans appel', async () => {
    const { app, speech } = buildTestApp({ seed: adminSeed({ apiKey: 'sk-ok' }) });
    const res = await post(app, '/api/admin/settings/ai/test-summary', { model: MISTRAL });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'provider_key_missing', provider: 'mistral' });
    expect(speech.mistral.calls).toEqual([]);
  });

  it('un 401 accuse la clé, un autre refus le modèle', async () => {
    for (const [status, error] of [
      [401, 'provider_key_rejected'],
      [400, 'provider_model_rejected'],
    ]) {
      const { app } = buildTestApp({
        seed: adminSeed({ apiKey: 'sk-ok', mistralApiKey: KEY }),
        speech: { mistral: { chat: rejecting(status, 'Invalid model') } },
      });
      const res = await post(app, '/api/admin/settings/ai/test-summary', { model: MISTRAL });
      expect(res.json(), String(status)).toMatchObject({
        error,
        provider: 'mistral',
        upstreamMessage: 'Invalid model',
      });
    }
  });

  it('modèle OpenAI : inchangé, chez OpenAI', async () => {
    const { app, ai, speech } = buildTestApp({ seed: adminSeed({ apiKey: 'sk-ok' }) });
    const res = await post(app, '/api/admin/settings/ai/test-summary', { model: 'gpt-6-astra' });
    expect(res.statusCode).toBe(200);
    expect(ai.calls.find((c) => c.method === 'chat').params.model).toBe('gpt-6-astra');
    expect(speech.mistral.calls).toEqual([]);
  });
});

describe('GET /api/admin/config-checks — clé de celui qui rédige', () => {
  const issuesOf = async (app) =>
    (
      await app.inject({
        method: 'GET',
        url: '/api/admin/config-checks',
        headers: identityHeaders(ADMIN),
      })
    ).json().issues;

  it('Mistral rédige sans clé (base éditée à la main) : panne des comptes rendus', async () => {
    const { app } = buildTestApp({ seed: adminSeed({ apiKey: 'sk-ok', summaryModel: MISTRAL }) });
    expect(await issuesOf(app)).toContainEqual({
      section: 'ai',
      code: 'ai_summary_provider_key_missing',
      level: 'error',
      vars: { provider: 'Mistral' },
    });
  });

  it('clé révoquée qui transcrit ET rédige : les deux arrêts sont dits', async () => {
    const { app } = buildTestApp({
      seed: adminSeed({
        apiKey: 'sk-ok',
        mistralApiKey: KEY,
        summaryModel: MISTRAL,
        transcriptionModel: 'voxtral-mini-transcribe-realtime-2602',
      }),
      verifyProviderKey: createFakeProviderKeyVerifier({ reject: { status: 401 } }),
    });
    const codes = (await issuesOf(app)).map((issue) => issue.code);
    expect(codes).toContain('ai_provider_key_rejected');
    expect(codes).toContain('ai_summary_provider_key_rejected');
  });
});
