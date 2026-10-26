/**
 * Budget de sortie du client OpenAI (lib/openai.js `chat`).
 *
 * Enjeu : `verbosity` et `reasoning_effort` sont le seul levier d'API sur le
 * volume et la profondeur de la sortie — sans eux, la famille gpt-5 répond en
 * « medium », nettement plus court que l'application ChatGPT à prompt
 * identique. Mais ces deux paramètres font répondre 400 « unrecognized
 * request argument » aux modèles qui ne les connaissent pas : une installation
 * restée sur gpt-4o-mini verrait TOUTES ses générations échouer. D'où le
 * filtrage par famille de modèle, testé ici dans les deux sens.
 */
import { describe, it, expect } from 'vitest';
import { createOpenAiClient, REASONING_EFFORTS, VERBOSITY_LEVELS } from '../lib/openai.js';
import { SUMMARY_MODELS } from '../lib/summaryModels.js';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';

function spyFetch() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      },
    };
  };
  return { calls, fetchImpl };
}

describe('chat() — réglages de volume et de profondeur', () => {
  it('transmet verbosity et reasoning_effort à la famille gpt-5', async () => {
    const { calls, fetchImpl } = spyFetch();
    const client = createOpenAiClient({ apiKey: 'sk-test-000000000000000', fetchImpl });
    await client.chat({
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'x' }],
      verbosity: 'high',
      reasoningEffort: 'medium',
    });
    expect(calls[0].body.verbosity).toBe('high');
    expect(calls[0].body.reasoning_effort).toBe('medium');
  });

  it('les transmet à TOUS les modèles proposés dans l’administration', async () => {
    // Vérifié en dur sur la liste réelle : un identifiant ajouté à
    // SUMMARY_MODELS sans que la regex le reconnaisse partirait sans réglage de
    // volume, et le compte rendu redeviendrait court — la panne d'origine, mais
    // silencieuse. Les paliers 5.6 (`gpt-5.6-sol`) sont le cas qui compte : le
    // point dans le numéro de version ne doit pas casser la reconnaissance.
    for (const model of SUMMARY_MODELS) {
      const { calls, fetchImpl } = spyFetch();
      const client = createOpenAiClient({ apiKey: 'sk-test-000000000000000', fetchImpl });
      await client.chat({
        model,
        messages: [{ role: 'user', content: 'x' }],
        verbosity: 'high',
        reasoningEffort: 'medium',
      });
      expect(calls[0].body.verbosity, model).toBe('high');
      expect(calls[0].body.reasoning_effort, model).toBe('medium');
    }
  });

  it('ne les envoie PAS à un modèle qui les refuse — sinon 400 et plus aucune génération', async () => {
    const { calls, fetchImpl } = spyFetch();
    const client = createOpenAiClient({ apiKey: 'sk-test-000000000000000', fetchImpl });
    for (const model of ['gpt-4o-mini', 'gpt-4o', 'gpt-5-chat-latest']) {
      await client.chat({
        model,
        messages: [{ role: 'user', content: 'x' }],
        verbosity: 'high',
        reasoningEffort: 'high',
      });
    }
    for (const c of calls) {
      expect(c.body.verbosity).toBeUndefined();
      expect(c.body.reasoning_effort).toBeUndefined();
    }
  });

  it('famille gpt-6 : reasoning_effort seulement — verbosity non documentée', async () => {
    // Titre et relecture tournent sur gpt-6-luna avec `none` : filtré, il
    // partirait sans réglage et raisonnerait en « medium », par défaut.
    const { calls, fetchImpl } = spyFetch();
    const client = createOpenAiClient({ apiKey: 'sk-test-000000000000000', fetchImpl });
    for (const model of ['gpt-6-luna', 'gpt-6-sol']) {
      await client.chat({
        model,
        messages: [{ role: 'user', content: 'x' }],
        verbosity: 'high',
        reasoningEffort: 'none',
      });
    }
    for (const c of calls) {
      expect(c.body.reasoning_effort, c.body.model).toBe('none');
      expect(c.body.verbosity, c.body.model).toBeUndefined();
    }
  });

  it("n'ajoute rien quand l'appelant ne demande rien", async () => {
    const { calls, fetchImpl } = spyFetch();
    const client = createOpenAiClient({ apiKey: 'sk-test-000000000000000', fetchImpl });
    await client.chat({ model: 'gpt-5', messages: [{ role: 'user', content: 'x' }] });
    expect(Object.keys(calls[0].body).sort()).toEqual(['messages', 'model']);
  });

  it('jamais de temperature : gpt-5 la refuse', async () => {
    const { calls, fetchImpl } = spyFetch();
    const client = createOpenAiClient({ apiKey: 'sk-test-000000000000000', fetchImpl });
    await client.chat({ model: 'gpt-5', messages: [], verbosity: 'high' });
    expect(calls[0].body.temperature).toBeUndefined();
  });
});

describe("valeurs envoyées — seules celles qu'OpenAI accepte", () => {
  // Relevé le 2026-09-02 : `reasoning_effort: 'minimal'` (génération 5.0) fait
  // répondre 400 aux modèles 5.4/5.6, et avait été écrit dans la route de test
  // d'accès — le bouton ne pouvait jamais réussir. Aucun fake ne peut attraper
  // une valeur d'énumération invalide ; ce test compare donc ce que le code
  // envoie aux ensembles RELEVÉS auprès de l'API.
  const EMAIL = 'patron@client.fr';
  const seed = { user: [userDoc(EMAIL, { role: 'admin' })] };

  const chatCalls = (ai) => ai.calls.filter((c) => c.method === 'chat');

  it('/resume : verbosity et reasoning_effort sont des valeurs valides', async () => {
    const { app, ai } = buildTestApp({ seed, openai: { chat: '<p>CR</p>' } });
    await app.inject({
      method: 'POST',
      url: '/api/resume',
      headers: { ...identityHeaders(EMAIL), 'content-type': 'application/json' },
      body: JSON.stringify({
        transcription: 'On a parlé du projet.',
        systemPrompt: 'Rédige.',
        blocks: [{ marker: '[[AI_SLOT_1]]', systemPrompt: 'Résumé en 20 mots.' }],
        actions: [],
        versionId: 'v1',
        meetingId: null,
      }),
    });
    const tuned = chatCalls(ai).filter((c) => c.params.verbosity || c.params.reasoningEffort);
    expect(tuned.length).toBeGreaterThan(0);
    for (const c of tuned) {
      if (c.params.verbosity) expect(VERBOSITY_LEVELS).toContain(c.params.verbosity);
      if (c.params.reasoningEffort) expect(REASONING_EFFORTS).toContain(c.params.reasoningEffort);
    }
  });

  it("test d'accès au modèle : appel NU, aucun réglage à refuser", async () => {
    const { app, ai } = buildTestApp({ seed, openai: { chat: 'OK' } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/settings/ai/test-summary',
      headers: { ...identityHeaders(EMAIL), 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.4' }),
    });
    expect(res.statusCode).toBe(200);
    const call = chatCalls(ai)[0];
    expect(call.params.model).toBe('gpt-5.4');
    expect(call.params.verbosity).toBeUndefined();
    expect(call.params.reasoningEffort).toBeUndefined();
  });

  it("'minimal' ne fait plus partie des valeurs admises", () => {
    expect(REASONING_EFFORTS).not.toContain('minimal');
  });
});
