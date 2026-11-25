/**
 * Préférences, sons et voix de l'Aide IA (routes/aiHelp.js,
 * lib/aiHelp/preferences.js, lib/aiHelp/voices.js) — faux fournisseurs, aucun
 * réseau.
 *
 * Garanties tenues ici :
 *   - une réunion démarre comme le compte l'a réglé (tout allumé sans
 *     réglage), bornée à ce que son groupe permet ;
 *   - un ancien « son coupé » reste coupé ; un ancien `enabled: false` n'éteint
 *     rien ;
 *   - un moteur de voix n'est proposé que si sa clé est renseignée ET qu'un
 *     essai vient de réussir, modèle par modèle — et l'essai n'est pas refait
 *     à chaque ouverture de la page ;
 *   - la synthèse rend l'audio tel quel, relaie une panne amont sans la
 *     déguiser en perte de session, et compte ce qu'elle lit sur la réunion du
 *     compte — jamais sur celle d'un autre.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, groupDoc, defaultGroupDoc } from './helpers.js';
import { UpstreamError, createOpenAiClient } from '../lib/openai.js';
import { createMistralClient } from '../lib/mistral.js';
import { voiceCatalog, OPENAI_SPEECH_MODELS } from '../lib/aiHelp/voices.js';
import { USER_ACTIONS_COLLECTION } from '../lib/repositories/userActions.js';

const PILOT = 'camille@client.fr'; // Aide IA + myBrain
const TALKER = 'hugo@client.fr'; // Aide IA seule
const NOBODY = 'intrus@client.fr';
const MISTRAL_KEY = 'm'.repeat(32);

const owned = (email, fields) => ({ email, emailLower: email, ...fields });
const ALL_ON = { project: true, qa: true, agenda: true, ideas: true };
// Sans myBrain branché, le garde-fou du projet n'est permis à personne.
const ALLOWED = { ...ALL_ON, project: false };

function seed(extra = {}) {
  return {
    user: [
      userDoc(PILOT, { groupIds: ['pilots'] }),
      userDoc(TALKER, { groupIds: ['talkers'] }),
      userDoc(NOBODY),
    ],
    userGroups: [
      defaultGroupDoc(),
      groupDoc('pilots', { aiHelpAllowed: true, aiHelpMyBrainAllowed: true }),
      groupDoc('talkers', { aiHelpAllowed: true }),
    ],
    resume: [
      owned(PILOT, { _id: 'r1', meetingId: 'live-pilot', status: 'recording' }),
      owned(PILOT, { _id: 'r2', meetingId: 'next-pilot', status: 'recording' }),
      owned(TALKER, { _id: 'r3', meetingId: 'live-talker', status: 'recording' }),
    ],
    ...extra,
  };
}

const post = (app, url, body, email = PILOT) =>
  app.inject({
    method: 'POST',
    url: `/api${url}`,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const get = (app, url, email = PILOT) =>
  app.inject({ method: 'GET', url: `/api${url}`, headers: identityHeaders(email) });

/** Une installation, ses clés éventuelles. */
async function build({ openaiKey = '', mistralKey = '', openai, speech, seeded } = {}) {
  const built = buildTestApp({ seed: seeded || seed(), openai, speech });
  if (openaiKey || mistralKey) {
    await built.app.settings.updateAi({
      ...(openaiKey ? { apiKey: openaiKey } : {}),
      ...(mistralKey ? { mistralApiKey: mistralKey } : {}),
    });
  }
  return built;
}

const speechCalls = (client) => client.calls.filter((call) => call.method === 'speech');

describe('Aide IA — préférences du compte', () => {
  it('sans réglage : tout allumé, les quatre sons, pas de voix', async () => {
    const { app } = await build();
    const body = (await get(app, '/ai-help')).json();
    expect(body.preferences).toEqual({
      start: { enabled: true, domains: ALL_ON },
      sounds: { alerts: true, ideas: true, actions: true, timer: true },
      voice: {
        enabled: false,
        provider: 'browser',
        model: '',
        voice: '',
        read: { answers: true, alerts: true, ideas: false },
      },
    });
    expect(body.defaults).toEqual({ enabled: true, domains: ALLOWED });
  });

  it('un ancien son coupé reste coupé ; un ancien « éteinte » n’éteint rien', async () => {
    const { app } = await build({
      seeded: seed({
        [USER_ACTIONS_COLLECTION]: [
          owned(PILOT, {
            aiHelp: { enabled: false, sound: false, domains: { ...ALL_ON, ideas: false } },
          }),
        ],
      }),
    });
    const body = (await get(app, '/ai-help')).json();
    expect(body.preferences.sounds).toEqual({
      alerts: false,
      ideas: false,
      actions: false,
      timer: false,
    });
    expect(body.preferences.start).toEqual({ enabled: true, domains: ALL_ON });
    expect(body.defaults.enabled).toBe(true);
  });

  it('enregistre un réglage partiel, et la réunion suivante démarre avec', async () => {
    const { app, db } = await build();
    const saved = await post(app, '/ai-help/preferences', {
      start: { domains: { ideas: false } },
      sounds: { ideas: false },
      voice: { enabled: true, read: { ideas: true } },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().preferences).toMatchObject({
      start: { enabled: true, domains: { ...ALL_ON, ideas: false } },
      sounds: { alerts: true, ideas: false, actions: true },
      voice: {
        enabled: true,
        provider: 'browser',
        read: { answers: true, alerts: true, ideas: true },
      },
    });
    // Le document du compte est écrit sous SON adresse (upsert sur égalité).
    const doc = await db.collection(USER_ACTIONS_COLLECTION).findOne({ emailLower: PILOT });
    expect(doc.aiHelp.preferences.sounds.ideas).toBe(false);

    const opened = await post(app, '/ai-help/session', { meetingId: 'live-pilot' });
    expect(opened.json().session).toMatchObject({
      enabled: true,
      domains: { ...ALLOWED, ideas: false },
    });

    // Éteinte au démarrage : la réunion suivante s'ouvre éteinte.
    await post(app, '/ai-help/preferences', { start: { enabled: false } });
    const next = await post(app, '/ai-help/session', { meetingId: 'next-pilot' });
    expect(next.json().session.enabled).toBe(false);
    expect((await get(app, '/ai-help')).json().defaults.enabled).toBe(false);
  });

  it('le démarrage reste borné aux droits du groupe', async () => {
    const { app } = await build();
    await post(app, '/ai-help/preferences', { start: { domains: ALL_ON } }, TALKER);
    const body = (await get(app, '/ai-help', TALKER)).json();
    expect(body.preferences.start.domains.project).toBe(true);
    expect(body.defaults.domains).toEqual(ALLOWED);
  });

  it('couper le son d’une réunion ne change plus les préférences', async () => {
    const { app } = await build();
    const res = await post(app, '/ai-help/session', { meetingId: 'live-pilot', sound: false });
    expect(res.statusCode).toBe(200);
    expect((await get(app, '/ai-help')).json().preferences.sounds.alerts).toBe(true);
  });

  it('refuse une voix incohérente, un champ inconnu, un compte sans droit', async () => {
    const { app } = await build();
    const refuse = async (voice, slug) => {
      const res = await post(app, '/ai-help/preferences', { voice });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe(slug);
    };
    await refuse({ provider: 'openai', model: 'tts-9', voice: 'alloy' }, 'voice_model_unknown');
    // « marin » n'existe que sur gpt-4o-mini-tts.
    await refuse({ provider: 'openai', model: 'tts-1', voice: 'marin' }, 'voice_unknown');
    await refuse(
      { provider: 'mistral', model: 'voxtral-mini-tts-3-0', voice: 'a b/c' },
      'voice_unknown',
    );
    // Un champ inconnu est retiré par le schéma, jamais enregistré.
    const extra = await post(app, '/ai-help/preferences', { voice: { speed: 2 } });
    expect(extra.json().preferences.voice).not.toHaveProperty('speed');
    const intruder = await post(app, '/ai-help/preferences', { sounds: { ideas: false } }, NOBODY);
    expect(intruder.statusCode).toBe(409);
    expect(intruder.json().error).toBe('ai_help_not_allowed');

    const ok = await post(app, '/ai-help/preferences', {
      voice: { provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'marin' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().preferences.voice).toMatchObject({ provider: 'openai', voice: 'marin' });
  });
});

describe('Aide IA — les moteurs de voix proposés', () => {
  it('sans aucune clé : rien d’autre que le navigateur (rien ici)', async () => {
    const { app, ai } = await build();
    const res = await get(app, '/ai-help/voices');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ providers: [] });
    expect(speechCalls(ai)).toHaveLength(0);
  });

  it('OpenAI : chaque modèle est essayé, un modèle qui échoue n’est pas proposé', async () => {
    const { app, ai } = await build({
      openaiKey: 'sk-test-voix',
      openai: {
        speech: ({ model }) => {
          if (model === 'tts-1') throw new UpstreamError(404, '{"error":"model_not_found"}');
          return Buffer.from('ID3');
        },
      },
    });
    const { providers } = (await get(app, '/ai-help/voices')).json();
    expect(providers.map((p) => p.id)).toEqual(['openai']);
    expect(providers[0].models.map((m) => m.id)).toEqual(['gpt-4o-mini-tts', 'tts-1-hd']);
    expect(providers[0].models[0].voices[0]).toEqual({
      id: 'marin',
      label: 'Marin',
      languages: [],
    });
    expect(providers[0].models[0].retiresAt).toBe('2027-01-06');
    expect(speechCalls(ai)).toHaveLength(3);

    // Gardé : rouvrir la page ne relance pas les essais.
    await get(app, '/ai-help/voices');
    expect(speechCalls(ai)).toHaveLength(3);
  });

  it('une clé remplacée est réessayée aussitôt', async () => {
    const { app, ai } = await build({ openaiKey: 'sk-test-1' });
    await get(app, '/ai-help/voices');
    await app.settings.updateAi({ apiKey: 'sk-test-2' });
    await get(app, '/ai-help/voices');
    expect(speechCalls(ai)).toHaveLength(6);
  });

  it('Mistral : ses voix préréglées sont relues, ses modèles essayés', async () => {
    const { app, speech } = await build({
      mistralKey: MISTRAL_KEY,
      speech: {
        mistral: {
          voices: [
            { id: 'fr_marie_neutral', label: 'Marie', languages: ['fr'] },
            { id: 'gb_jane_neutral', label: 'Jane', languages: ['en'] },
          ],
          speech: ({ model }) => {
            if (model === 'voxtral-mini-tts-2603') throw new UpstreamError(400, '{}');
            return Buffer.from('ID3');
          },
        },
      },
    });
    const { providers } = (await get(app, '/ai-help/voices')).json();
    expect(providers).toEqual([
      {
        id: 'mistral',
        models: [
          {
            id: 'voxtral-mini-tts-3-0',
            voices: [
              { id: 'fr_marie_neutral', label: 'Marie', languages: ['fr'] },
              { id: 'gb_jane_neutral', label: 'Jane', languages: ['en'] },
            ],
          },
        ],
      },
    ]);
    // L'essai parle avec la première voix rendue.
    expect(speechCalls(speech.mistral)[0].params).toMatchObject({ voice: 'fr_marie_neutral' });
  });

  it('Mistral sans voix lisible n’est pas proposé ; un compte sans droit n’a rien', async () => {
    const { app } = await build({
      mistralKey: MISTRAL_KEY,
      speech: {
        mistral: {
          voices: () => {
            throw new UpstreamError(401, '{}');
          },
        },
      },
    });
    expect((await get(app, '/ai-help/voices')).json()).toEqual({ providers: [] });
    expect((await get(app, '/ai-help/voices', NOBODY)).statusCode).toBe(409);
  });

  it('un modèle arrêté n’est plus essayé', async () => {
    const { app, ai } = await build({ openaiKey: 'sk-test' });
    const after = Date.parse(OPENAI_SPEECH_MODELS[0].retiresAt) + 1;
    expect(await voiceCatalog(app, { now: after })).toEqual({ providers: [] });
    expect(speechCalls(ai)).toHaveLength(0);
  });
});

describe('Aide IA — dire un texte', () => {
  const say = (app, body, email = PILOT) =>
    post(
      app,
      '/ai-help/speech',
      { provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'marin', text: 'Bonjour.', ...body },
      email,
    );

  it('OpenAI : l’audio tel quel, la consigne de diction en français', async () => {
    const { app, ai } = await build({ openaiKey: 'sk-test' });
    const res = await say(app, { language: 'fr' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^audio\/mpeg/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.rawPayload.toString()).toBe('ID3-audio-openai');
    expect(speechCalls(ai)[0].params).toMatchObject({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      input: 'Bonjour.',
    });
    expect(speechCalls(ai)[0].params.instructions).toMatch(/français/);
  });

  it('Mistral : par son client, sa voix telle quelle', async () => {
    const { app, speech } = await build({ mistralKey: MISTRAL_KEY });
    const res = await say(app, {
      provider: 'mistral',
      model: 'voxtral-mini-tts-3-0',
      voice: 'fr_marie_neutral',
    });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.toString()).toBe('ID3-audio-mistral');
    expect(speechCalls(speech.mistral)[0].params).toEqual({
      model: 'voxtral-mini-tts-3-0',
      voice: 'fr_marie_neutral',
      input: 'Bonjour.',
    });
  });

  it('compte ce qu’elle lit sur la réunion du compte, jamais sur celle d’un autre', async () => {
    const { app, db } = await build({ openaiKey: 'sk-test' });
    await say(app, { meetingId: 'live-pilot', text: 'Douze lettres' });
    await say(app, { meetingId: 'live-pilot', text: 'Trois' });
    await say(app, { meetingId: 'live-talker', text: 'Pas chez moi' });
    const mine = await db.collection('resume').findOne({ meetingId: 'live-pilot' });
    expect(mine.aiHelp.speech.openai).toEqual({ calls: 2, chars: 18 });
    const theirs = await db.collection('resume').findOne({ meetingId: 'live-talker' });
    expect(theirs.aiHelp?.speech).toBeUndefined();
  });

  it('une panne amont est relayée sans ressembler à une session perdue', async () => {
    const { app } = await build({
      openaiKey: 'sk-test',
      openai: {
        speech: () => {
          throw new UpstreamError(401, '{"error":{"message":"bad key"}}');
        },
      },
    });
    const res = await say(app);
    expect(res.statusCode).toBe(502);
  });

  it('refuse un réglage incohérent, le navigateur, et un compte sans droit', async () => {
    const { app } = await build({ openaiKey: 'sk-test' });
    expect((await say(app, { voice: 'nimbus' })).json().error).toBe('voice_unknown');
    expect((await say(app, { provider: 'browser' })).statusCode).toBe(400);
    expect((await say(app, { text: 'x'.repeat(1201) })).statusCode).toBe(400);
    const intruder = await say(app, {}, NOBODY);
    expect(intruder.statusCode).toBe(409);
  });
});

describe('Aide IA — les clients de synthèse', () => {
  function fakeFetch(respond) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
      return respond(url, init);
    };
    return { fetchImpl, calls };
  }

  it('OpenAI : le binaire, et `instructions` seulement pour gpt-4o-mini-tts', async () => {
    const { fetchImpl, calls } = fakeFetch(
      () => new Response(Buffer.from('ID3-mp3'), { status: 200 }),
    );
    const client = createOpenAiClient({ apiKey: 'sk-test', fetchImpl });
    const audio = await client.speech({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      input: 'Salut',
      instructions: 'Parle en français',
    });
    expect(audio.toString()).toBe('ID3-mp3');
    expect(calls[0].url).toBe('https://api.openai.com/v1/audio/speech');
    expect(calls[0].body).toEqual({
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      input: 'Salut',
      response_format: 'mp3',
      instructions: 'Parle en français',
    });
    await client.speech({ model: 'tts-1', voice: 'alloy', input: 'Salut', instructions: 'x' });
    expect(calls[1].body).not.toHaveProperty('instructions');
  });

  it('Mistral : le base64 de `audio_data` décodé, aucun champ hors documentation', async () => {
    const { fetchImpl, calls } = fakeFetch((url) =>
      url.includes('/audio/voices')
        ? Response.json({
            items: [
              { id: 'uuid-1', slug: 'fr_marie_neutral', name: 'Marie', languages: ['fr'] },
              { id: 'uuid-2', name: 'Sans slug', languages: 'en' },
            ],
          })
        : Response.json({ audio_data: Buffer.from('ID3-mistral').toString('base64') }),
    );
    const client = createMistralClient({ apiKey: MISTRAL_KEY, fetchImpl });
    const audio = await client.speech({
      model: 'voxtral-mini-tts-3-0',
      voice: 'fr_marie_neutral',
      input: 'Salut',
    });
    expect(audio.toString()).toBe('ID3-mistral');
    expect(calls[0].body).toEqual({
      model: 'voxtral-mini-tts-3-0',
      input: 'Salut',
      voice_id: 'fr_marie_neutral',
      response_format: 'mp3',
    });
    expect(await client.voices()).toEqual([
      { id: 'fr_marie_neutral', label: 'Marie', languages: ['fr'] },
      { id: 'uuid-2', label: 'Sans slug', languages: [] },
    ]);
    expect(calls[1].url).toBe('https://api.mistral.ai/v1/audio/voices?type=preset&limit=100');
  });

  it('Mistral : une réponse sans audio est une panne amont', async () => {
    const { fetchImpl } = fakeFetch(() => Response.json({}));
    const client = createMistralClient({ apiKey: MISTRAL_KEY, fetchImpl });
    await expect(
      client.speech({ model: 'voxtral-mini-tts-3-0', voice: 'x', input: 'Salut' }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});
