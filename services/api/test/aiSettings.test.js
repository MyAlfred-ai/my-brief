/**
 * Clé OpenAI réglable depuis l'administration.
 *
 * Deux garanties à tenir : la clé ne sort jamais de l'API, et une clé fausse
 * est refusée à l'enregistrement plutôt qu'au premier enregistrement audio d'un
 * utilisateur.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, createFakeKeyVerifier } from './helpers.js';
import { normalizeApiKey, createOpenAiClient, relayStatus, UpstreamError } from '../lib/openai.js';
import { createSettingsRepo, toPublicAiSettings, keyHint } from '../lib/repositories/settings.js';
import { createFakeDb } from './helpers.js';
import { FX_FALLBACK } from '../lib/costs/catalog.js';

const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';
const VALID_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

const seed = () => ({ user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER)] });

/**
 * Sans corps, on n'envoie PAS de content-type json : Fastify refuse un corps
 * vide annoncé en JSON. C'est aussi ce que fait le client du frontend
 * (src/services/adminUsersApi.js), qui ne pose l'en-tête que s'il y a un corps.
 */
function post(app, url, body, email = ADMIN) {
  return app.inject({
    method: 'POST',
    url,
    headers: {
      ...identityHeaders(email),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('normalizeApiKey', () => {
  it('nomme le préfixe doublé — la faute de collage qui a cassé la production', () => {
    expect(normalizeApiKey(`sk-${VALID_KEY}`).problem).toBe('openai_key_doubled_prefix');
  });

  it("retire les espaces et retours à la ligne d'un copier-coller", () => {
    expect(normalizeApiKey(`  ${VALID_KEY}\n`)).toEqual({ key: VALID_KEY, problem: '' });
  });

  it('refuse ce qui ne ressemble pas à une clé', () => {
    expect(normalizeApiKey('bonjour').problem).toBe('openai_key_malformed');
    expect(normalizeApiKey('sk-court').problem).toBe('openai_key_malformed');
  });

  it('ne répare jamais une clé : la valeur fautive est renvoyée telle quelle', () => {
    const doubled = `sk-${VALID_KEY}`;
    expect(normalizeApiKey(doubled).key).toBe(doubled);
  });

  it("accepte une chaîne vide sans la signaler — c'est le retrait de la clé", () => {
    expect(normalizeApiKey('')).toEqual({ key: '', problem: '' });
  });
});

describe('projection publique', () => {
  it('ne laisse jamais fuir la clé, seulement son indice', () => {
    const publicView = toPublicAiSettings({ apiKey: VALID_KEY });
    expect(JSON.stringify(publicView)).not.toContain(VALID_KEY);
    expect(publicView).toMatchObject({ hasKey: true, source: 'settings' });
  });

  it("distingue la clé de l'environnement de celle saisie dans l'interface", () => {
    expect(toPublicAiSettings(null, { envKey: VALID_KEY })).toMatchObject({
      hasKey: true,
      source: 'env',
    });
    expect(toPublicAiSettings(null, { envKey: '' })).toMatchObject({
      hasKey: false,
      source: 'none',
    });
  });

  it('montre assez de la clé pour reconnaître un préfixe doublé', () => {
    expect(keyHint(`sk-${VALID_KEY}`)).toMatch(/^sk-sk-/);
  });
});

describe('GET /api/admin/settings/ai', () => {
  it('exige le rôle admin', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/ai',
      headers: identityHeaders(USER),
    });
    expect(res.statusCode).toBe(403);
  });

  it("signale la clé du déploiement quand rien n'est enregistré", async () => {
    const { app } = buildTestApp({
      seed: seed(),
      config: { openai: { apiKey: VALID_KEY, baseUrl: '' } },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/ai',
      headers: identityHeaders(ADMIN),
    });
    expect(res.json().settings).toMatchObject({ hasKey: true, source: 'env' });
    expect(res.payload).not.toContain(VALID_KEY);
  });
});

describe('POST /api/admin/settings/ai', () => {
  it("vérifie la clé auprès d'OpenAI avant de l'enregistrer", async () => {
    const verifyApiKey = createFakeKeyVerifier();
    const { app, db } = buildTestApp({ seed: seed(), verifyApiKey });
    const res = await post(app, '/api/admin/settings/ai', { apiKey: VALID_KEY });
    expect(res.statusCode).toBe(200);
    expect(verifyApiKey.calls).toEqual([VALID_KEY]);
    expect(db.data.get('appSettings').find((d) => d.key === 'ai').apiKey).toBe(VALID_KEY);
  });

  it("N'ENREGISTRE PAS une clé refusée par OpenAI, et relaie son message", async () => {
    const verifyApiKey = createFakeKeyVerifier({
      reject: { status: 401, message: 'Incorrect API key provided: sk-sk-…' },
    });
    const { app, db } = buildTestApp({ seed: seed(), verifyApiKey });
    const res = await post(app, '/api/admin/settings/ai', { apiKey: VALID_KEY });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'openai_key_rejected', upstreamStatus: 401 });
    expect(res.json().upstreamMessage).toContain('Incorrect API key');
    expect(db.data.get('appSettings') || []).toHaveLength(0);
  });

  it('refuse un préfixe doublé sans même appeler OpenAI', async () => {
    const verifyApiKey = createFakeKeyVerifier();
    const { app } = buildTestApp({ seed: seed(), verifyApiKey });
    const res = await post(app, '/api/admin/settings/ai', { apiKey: `sk-${VALID_KEY}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('openai_key_doubled_prefix');
    expect(verifyApiKey.calls).toHaveLength(0);
  });

  it("trace l'administrateur qui a posé la clé", async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/ai', { apiKey: VALID_KEY });
    expect(db.data.get('appSettings').find((d) => d.key === 'ai').updatedBy).toBe(ADMIN);
  });

  it('une clé vide retire la clé enregistrée sans appeler OpenAI', async () => {
    const verifyApiKey = createFakeKeyVerifier();
    const { app, db } = buildTestApp({ seed: seed(), verifyApiKey });
    await post(app, '/api/admin/settings/ai', { apiKey: VALID_KEY });
    const res = await post(app, '/api/admin/settings/ai', { apiKey: '' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({ hasKey: false, source: 'none' });
    expect(db.data.get('appSettings').find((d) => d.key === 'ai').apiKey).toBe('');
    expect(verifyApiKey.calls).toHaveLength(1); // seulement le premier enregistrement
  });

  it("ne touche pas au document des réglages d'authentification", async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/auth', { google: { enabled: false, clientId: 'abc' } });
    await post(app, '/api/admin/settings/ai', { apiKey: VALID_KEY });
    const auth = db.data.get('appSettings').find((d) => d.key === 'auth');
    expect(auth.google.clientId).toBe('abc');
    expect(auth.apiKey).toBeUndefined();
  });

  it('exige le rôle admin', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/ai', { apiKey: VALID_KEY }, USER);
    expect(res.statusCode).toBe(403);
  });
});

describe('modèle de transcription', () => {
  it('enregistre le modèle choisi', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/ai', {
      transcriptionModel: 'gpt-live-transcribe',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({
      transcriptionModel: 'gpt-live-transcribe',
      transcriptionModelSource: 'settings',
      transcriptionModelRetired: null,
    });
    expect(db.data.get('appSettings').find((d) => d.key === 'ai').transcriptionModel).toBe(
      'gpt-live-transcribe',
    );
  });

  it("changer de modèle N'EFFACE PAS la clé — les deux champs sont indépendants", async () => {
    // Le piège : un corps qui portait toujours `apiKey` remettait la clé à vide
    // dès qu'on n'enregistrait que le modèle, et l'IA tombait pour tout le monde.
    const { app, db } = buildTestApp({ seed: seed(), verifyApiKey: createFakeKeyVerifier() });
    await post(app, '/api/admin/settings/ai', { apiKey: VALID_KEY });
    await post(app, '/api/admin/settings/ai', { transcriptionModel: 'gpt-transcribe' });
    const doc = db.data.get('appSettings').find((d) => d.key === 'ai');
    expect(doc.apiKey).toBe(VALID_KEY);
    expect(doc.transcriptionModel).toBe('gpt-transcribe');
  });

  it('un modèle vide revient au défaut', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/ai', { transcriptionModel: 'gpt-transcribe' });
    const res = await post(app, '/api/admin/settings/ai', { transcriptionModel: '' });
    expect(res.json().settings).toMatchObject({
      transcriptionModel: 'gpt-realtime-whisper',
      transcriptionModelSource: 'default',
    });
  });

  it("refuse un modèle hors liste — OpenAI le refuserait chez l'utilisateur", async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/ai', { transcriptionModel: 'gpt-4o-mini' });
    expect(res.statusCode).toBe(400);
  });

  it('refuse un modèle retiré par OpenAI : plus question de le choisir', async () => {
    const { app } = buildTestApp({ seed: seed() });
    for (const transcriptionModel of ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1']) {
      const res = await post(app, '/api/admin/settings/ai', { transcriptionModel });
      expect(res.statusCode).toBe(400);
    }
  });

  it('un modèle retiré, enregistré avant son retrait : remplacé, et l’écran le dit', async () => {
    const { app, db } = buildTestApp({
      seed: { ...seed(), appSettings: [{ key: 'ai', transcriptionModel: 'gpt-4o-transcribe' }] },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/ai',
      headers: identityHeaders(ADMIN),
    });
    expect(res.json().settings).toMatchObject({
      transcriptionModel: 'gpt-transcribe',
      transcriptionModelSource: 'settings',
      transcriptionModelRetired: { from: 'gpt-4o-transcribe', date: '2027-02-26' },
    });
    // Rien n'est réécrit en base : « Garder gpt-transcribe » l'enregistre, et
    // l'avis disparaît.
    const ai = () => db.data.get('appSettings').find((d) => d.key === 'ai');
    expect(ai().transcriptionModel).toBe('gpt-4o-transcribe');
    const kept = await post(app, '/api/admin/settings/ai', {
      transcriptionModel: 'gpt-transcribe',
    });
    expect(kept.json().settings.transcriptionModelRetired).toBeNull();
    expect(ai().transcriptionModel).toBe('gpt-transcribe');
  });

  it('un modèle retiré imposé par le déploiement : remplacé aussi, provenance conservée', async () => {
    const { app } = buildTestApp({
      seed: seed(),
      config: { openai: { apiKey: '', baseUrl: '', models: { transcription: 'whisper-1' } } },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/ai',
      headers: identityHeaders(ADMIN),
    });
    expect(res.json().settings).toMatchObject({
      transcriptionModel: 'gpt-transcribe',
      transcriptionModelSource: 'env',
      transcriptionModelRetired: { from: 'whisper-1' },
    });
  });

  it("sert la liste des choix possibles avec le réglage — l'écran ne peut pas en inventer", async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/ai',
      headers: identityHeaders(ADMIN),
    });
    expect(res.json().settings.transcriptionModels).toEqual([
      'gpt-realtime-whisper',
      'gpt-live-transcribe',
      'gpt-transcribe',
    ]);
  });

  it("le modèle du déploiement sert de défaut tant que rien n'est choisi", async () => {
    const { app } = buildTestApp({
      seed: seed(),
      config: {
        openai: { apiKey: '', baseUrl: '', models: { transcription: 'gpt-live-transcribe' } },
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/ai',
      headers: identityHeaders(ADMIN),
    });
    expect(res.json().settings).toMatchObject({
      transcriptionModel: 'gpt-live-transcribe',
      transcriptionModelSource: 'env',
      transcriptionModelRetired: null,
    });
  });
});

describe('prix des modèles de transcription', () => {
  const getAi = (app) =>
    app.inject({ method: 'GET', url: '/api/admin/settings/ai', headers: identityHeaders(ADMIN) });

  it('joint le prix d’une heure de chaque modèle proposé, aux tarifs de Statistiques', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const body = (await getAi(app)).json();
    expect(body.prices.transcription.map((entry) => entry.model)).toEqual(
      body.settings.transcriptionModels,
    );
    const cheapest = body.prices.transcription.find((entry) => entry.model === 'gpt-transcribe');
    expect(cheapest.unitEur).toBeCloseTo(0.0045 * 60 * FX_FALLBACK.usdToEur, 4);
    expect(body.prices).toMatchObject({ source: 'builtin', fx: { source: 'builtin' } });
  });

  it('suit le dernier relevé des tarifs, et le modèle tout juste enregistré', async () => {
    const { app } = buildTestApp({
      seed: {
        ...seed(),
        appSettings: [
          {
            key: 'pricing',
            models: {
              'gpt-live-transcribe': {
                kind: 'audio',
                provider: 'openai',
                audioMinute: 0.01,
                source: 'litellm',
                checkedAt: '2026-09-30T08:00:00.000Z',
              },
            },
            fx: {
              usdToEur: 0.9,
              date: '2026-09-29',
              fetchedAt: '2026-09-30T08:00:00.000Z',
              source: 'ecb',
            },
            refreshedAt: '2026-09-30T08:00:00.000Z',
          },
        ],
      },
    });
    const res = await post(app, '/api/admin/settings/ai', {
      transcriptionModel: 'gpt-live-transcribe',
    });
    const chosen = res.json().prices.transcription.find((entry) => entry.current);
    expect(chosen.model).toBe('gpt-live-transcribe');
    expect(chosen.unitEur).toBeCloseTo(0.01 * 60 * 0.9, 4);
    expect(res.json().prices.fx).toMatchObject({ usdToEur: 0.9, source: 'ecb' });
  });

  it('des tarifs illisibles ne bloquent pas le réglage de l’IA', async () => {
    const { app } = buildTestApp({ seed: seed() });
    app.pricing.get = async () => {
      throw new Error('base des tarifs illisible');
    };
    const res = await getAi(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.transcriptionModel).toBe('gpt-realtime-whisper');
    expect(res.json().prices).toBeNull();
  });
});

describe('POST /api/admin/settings/ai/test-transcription', () => {
  it('ouvre une VRAIE session avec le modèle candidat', async () => {
    const { app, ai } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/ai/test-transcription', {
      model: 'gpt-transcribe',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, model: 'gpt-transcribe' });
    expect(ai.calls[0]).toMatchObject({
      method: 'realtimeClientSecret',
      model: 'gpt-transcribe',
    });
  });

  it("relaie le refus d'OpenAI — c'est là qu'on apprend qu'un modèle est hors abonnement", async () => {
    // Cas réel : gpt-4o-transcribe-diarize existe, la clé est bonne, mais
    // « Your organization does not have access to this transcription model ».
    const { app } = buildTestApp({
      seed: seed(),
      openai: {
        realtimeClientSecret: () => {
          throw new UpstreamError(
            400,
            '{"error":{"message":"Your organization does not have access to this transcription model."}}',
          );
        },
      },
    });
    const res = await post(app, '/api/admin/settings/ai/test-transcription', {
      model: 'gpt-live-transcribe',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'transcription_model_rejected',
      model: 'gpt-live-transcribe',
      upstreamStatus: 400,
    });
    expect(res.json().upstreamMessage).toContain('does not have access');
  });

  it('sans corps, teste le modèle enregistré', async () => {
    const { app, ai } = buildTestApp({
      seed: { ...seed(), appSettings: [{ key: 'ai', transcriptionModel: 'gpt-live-transcribe' }] },
    });
    const res = await post(app, '/api/admin/settings/ai/test-transcription');
    expect(res.statusCode).toBe(200);
    expect(ai.calls[0].model).toBe('gpt-live-transcribe');
  });

  it('exige le rôle admin', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(
      app,
      '/api/admin/settings/ai/test-transcription',
      { model: 'gpt-transcribe' },
      USER,
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/admin/settings/ai/test', () => {
  it('teste la clé enregistrée', async () => {
    const verifyApiKey = createFakeKeyVerifier();
    const { app } = buildTestApp({ seed: seed(), verifyApiKey });
    await post(app, '/api/admin/settings/ai', { apiKey: VALID_KEY });
    const res = await post(app, '/api/admin/settings/ai/test');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('teste celle du déploiement à défaut', async () => {
    const verifyApiKey = createFakeKeyVerifier();
    const { app } = buildTestApp({
      seed: seed(),
      verifyApiKey,
      config: { openai: { apiKey: 'sk-env-key-0123456789', baseUrl: '' } },
    });
    await post(app, '/api/admin/settings/ai/test');
    expect(verifyApiKey.calls).toEqual(['sk-env-key-0123456789']);
  });

  it("dit qu'aucune clé n'est configurée plutôt que d'interroger OpenAI à vide", async () => {
    const verifyApiKey = createFakeKeyVerifier();
    const { app } = buildTestApp({
      seed: seed(),
      verifyApiKey,
      config: { openai: { apiKey: '', baseUrl: '' } },
    });
    const res = await post(app, '/api/admin/settings/ai/test');
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('openai_key_missing');
    expect(verifyApiKey.calls).toHaveLength(0);
  });
});

describe('résolution de la clé à chaque appel', () => {
  it('la clé enregistrée prime sur celle du déploiement', async () => {
    const repo = createSettingsRepo(createFakeDb({}));
    expect(await repo.resolveOpenAiKey('sk-env')).toBe('sk-env');
    await repo.updateAi({ apiKey: VALID_KEY });
    expect(await repo.resolveOpenAiKey('sk-env')).toBe(VALID_KEY);
  });

  it('un changement de clé prend effet sans redémarrage', async () => {
    let current = 'sk-premiere-cle-0123456789';
    const seen = [];
    const client = createOpenAiClient({
      apiKey: () => current,
      fetchImpl: async (_url, init) => {
        seen.push(init.headers.Authorization);
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
      },
    });
    await client.chat({ model: 'gpt-4o', messages: [] });
    current = VALID_KEY;
    await client.chat({ model: 'gpt-4o', messages: [] });
    expect(seen).toEqual([`Bearer sk-premiere-cle-0123456789`, `Bearer ${VALID_KEY}`]);
  });

  it("sans aucune clé, échoue AVANT d'appeler OpenAI et dit où la régler", async () => {
    let called = false;
    const client = createOpenAiClient({
      apiKey: () => '',
      fetchImpl: async () => {
        called = true;
        return { ok: true, json: async () => ({}) };
      },
    });
    await expect(client.chat({ model: 'gpt-4o', messages: [] })).rejects.toMatchObject({
      status: 503,
    });
    expect(called).toBe(false);
    // 503 relayé tel quel : le frontend distingue « pas configuré » d'un 502 amont.
    expect(relayStatus(503)).toBe(503);
    await client.chat({ model: 'gpt-4o', messages: [] }).catch((err) => {
      expect(JSON.parse(err.body).error.code).toBe('openai_key_missing');
    });
  });
});
