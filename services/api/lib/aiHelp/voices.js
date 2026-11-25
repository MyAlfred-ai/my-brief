/**
 * La voix de l'Aide IA : quels moteurs proposer, et la synthèse elle-même.
 *
 *   browser  la synthèse vocale du navigateur — gratuite, sur l'appareil, sans
 *            rien qui sorte. Ses voix ne se connaissent que côté écran : le
 *            serveur ne les liste ni ne les vérifie ;
 *   openai   /audio/speech, sur la clé de l'installation ;
 *   mistral  Voxtral TTS, sur la clé Mistral de l'installation.
 *
 * ── Rien n'est proposé sans avoir été ESSAYÉ ─────────────────────────────────
 * Demande du 2026-11-13 : « tout doit être bien testé avant d'être proposé ».
 * Un moteur n'apparaît dans Réglages → Aide IA que si sa clé est renseignée ET
 * qu'une synthèse d'essai vient de réussir, modèle par modèle
 * (`voiceCatalog`). L'essai coûte quelques caractères ; son résultat est gardé
 * six heures (dix minutes s'il a échoué), par clé — une clé remplacée est
 * réessayée aussitôt. Écarté : une liste écrite d'après la documentation, qui
 * proposerait un modèle arrêté ou une voix retirée sans que personne le sache.
 *
 * ── D'où viennent les listes ─────────────────────────────────────────────────
 * OpenAI (relevé le 2026-11-13, developers.openai.com, guide text-to-speech) :
 * trois modèles, tous annoncés ARRÊTÉS le 6 janvier 2027 — au-delà, l'essai
 * échoue et ils disparaissent d'eux-mêmes, `retiresAt` les retire même avant.
 * Treize voix pour gpt-4o-mini-tts (marin et cedar recommandées), neuf pour
 * les tts-1. Mistral : les voix PRÉRÉGLÉES sont relues à l'API à chaque essai ;
 * les deux modèles sont essayés, le plus récent d'abord.
 */
import { createHash } from 'node:crypto';
import { UpstreamError } from '../openai.js';

export const VOICE_ENGINES = ['browser', 'openai', 'mistral'];
export const SPEECH_TEXT_MAX = 1200;

const OPENAI_CLASSIC = [
  'alloy',
  'ash',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
];
const OPENAI_ALL = ['marin', 'cedar', ...OPENAI_CLASSIC, 'ballad', 'verse'];
const OPENAI_END = '2027-01-06';

export const OPENAI_SPEECH_MODELS = [
  { id: 'gpt-4o-mini-tts', voices: OPENAI_ALL, retiresAt: OPENAI_END },
  { id: 'tts-1-hd', voices: OPENAI_CLASSIC, retiresAt: OPENAI_END },
  { id: 'tts-1', voices: OPENAI_CLASSIC, retiresAt: OPENAI_END },
];
export const MISTRAL_SPEECH_MODELS = [
  { id: 'voxtral-mini-tts-3-0' },
  { id: 'voxtral-mini-tts-2603' },
];

/** Une voix Mistral : un slug préréglé (`gb_jane_neutral`) ou un identifiant. */
const MISTRAL_VOICE_RE = /^[\w.-]{1,80}$/;

const PROBE_OK_MS = 6 * 60 * 60 * 1000;
const PROBE_FAILED_MS = 10 * 60 * 1000;
const PROBE_TEXT = 'OK.';

/** Les consignes de diction de gpt-4o-mini-tts : ses voix sont réglées sur l'anglais. */
const INSTRUCTIONS = {
  fr: 'Parle en français avec un accent français naturel, d’un ton calme, posé et chaleureux.',
  en: 'Speak in a calm, clear and friendly tone.',
};

const retired = (model, now) => model.retiresAt && now >= Date.parse(model.retiresAt);

/**
 * Pourquoi ce réglage de voix est incohérent — '' s'il ne l'est pas. Seul le
 * catalogue écrit est relu ici : une voix Mistral est un identifiant libre,
 * l'essai dira si elle existe.
 * @param {{provider: string, model: string, voice: string}} voice
 */
export function voiceProblem({ provider, model, voice }) {
  if (provider === 'browser') return '';
  if (provider === 'openai') {
    const known = OPENAI_SPEECH_MODELS.find((entry) => entry.id === model);
    if (!known) return 'voice_model_unknown';
    return known.voices.includes(voice) ? '' : 'voice_unknown';
  }
  if (provider === 'mistral') {
    if (!MISTRAL_SPEECH_MODELS.some((entry) => entry.id === model)) return 'voice_model_unknown';
    return MISTRAL_VOICE_RE.test(String(voice || '')) ? '' : 'voice_unknown';
  }
  return 'voice_engine_unknown';
}

const fingerprint = (key) => createHash('sha256').update(String(key)).digest('hex').slice(0, 16);

/** Les essais gardés, par application (une par test) et par moteur. */
const probes = new WeakMap();

async function remembered(app, provider, key, run, now) {
  if (!probes.has(app)) probes.set(app, new Map());
  const cache = probes.get(app);
  const id = `${provider}:${fingerprint(key)}`;
  const hit = cache.get(id);
  if (hit && now < hit.until) return hit.result;
  const result = await run();
  cache.set(id, { result, until: now + (result.models.length ? PROBE_OK_MS : PROBE_FAILED_MS) });
  return result;
}

/** Une synthèse d'essai : vrai si elle a rendu de l'audio. */
async function works(fn, log, label) {
  try {
    const audio = await fn();
    return Buffer.isBuffer(audio) && audio.length > 0;
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    log?.info?.({ status: err.status, engine: label }, 'voix de l’Aide IA : essai refusé');
    return false;
  }
}

async function probeOpenAi(app, now, log) {
  const live = OPENAI_SPEECH_MODELS.filter((model) => !retired(model, now));
  const checked = await Promise.all(
    live.map(async (model) => ({
      model,
      ok: await works(
        () => app.openai.speech({ model: model.id, voice: model.voices[0], input: PROBE_TEXT }),
        log,
        `openai:${model.id}`,
      ),
    })),
  );
  return {
    models: checked
      .filter((entry) => entry.ok)
      .map(({ model }) => ({
        id: model.id,
        retiresAt: model.retiresAt,
        voices: model.voices.map((id) => ({
          id,
          label: id[0].toUpperCase() + id.slice(1),
          languages: [],
        })),
      })),
  };
}

async function probeMistral(app, log) {
  let voices = [];
  try {
    voices = await app.speech.mistral.voices();
  } catch (err) {
    if (!(err instanceof UpstreamError)) throw err;
    log?.info?.({ status: err.status }, 'voix de l’Aide IA : voix Mistral illisibles');
    return { models: [] };
  }
  if (!voices.length) return { models: [] };
  const checked = await Promise.all(
    MISTRAL_SPEECH_MODELS.map(async (model) => ({
      model,
      ok: await works(
        () =>
          app.speech.mistral.speech({ model: model.id, voice: voices[0].id, input: PROBE_TEXT }),
        log,
        `mistral:${model.id}`,
      ),
    })),
  );
  return {
    models: checked.filter((entry) => entry.ok).map(({ model }) => ({ id: model.id, voices })),
  };
}

/**
 * Les moteurs de voix que l'installation peut proposer, ESSAYÉS.
 * @returns {Promise<{providers: Array<{id: string, models: object[]}>}>}
 */
export async function voiceCatalog(app, { now = Date.now(), log } = {}) {
  const [openaiKey, mistralKey] = await Promise.all([
    app.settings.resolveOpenAiKey(app.config.openai?.apiKey || ''),
    app.settings.resolveProviderKey('mistral'),
  ]);
  const providers = [];
  if (openaiKey) {
    const result = await remembered(
      app,
      'openai',
      openaiKey,
      () => probeOpenAi(app, now, log),
      now,
    );
    if (result.models.length) providers.push({ id: 'openai', models: result.models });
  }
  if (mistralKey && app.speech?.mistral?.voices) {
    const result = await remembered(app, 'mistral', mistralKey, () => probeMistral(app, log), now);
    if (result.models.length) providers.push({ id: 'mistral', models: result.models });
  }
  return { providers };
}

/**
 * Dit `text` avec la voix choisie. Le réglage a été validé (`voiceProblem`).
 * @param {{provider: 'openai'|'mistral', model: string, voice: string, text: string,
 *   language?: string}} params
 * @returns {Promise<{audio: Buffer, type: string}>}
 */
export async function synthesize(app, { provider, model, voice, text, language = 'fr' }) {
  if (provider === 'openai') {
    const instructions = INSTRUCTIONS[String(language).slice(0, 2)] || INSTRUCTIONS.en;
    const audio = await app.openai.speech({ model, voice, input: text, instructions });
    return { audio, type: 'audio/mpeg' };
  }
  const audio = await app.speech.mistral.speech({ model, voice, input: text });
  return { audio, type: 'audio/mpeg' };
}
