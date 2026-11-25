/**
 * La voix de l'Aide IA — lire à voix haute ce qu'elle écrit.
 *
 * Trois moteurs, réglés dans Réglages → Aide IA (stores/aiHelp.js tient le
 * réglage, ce module ne fait que parler) :
 *   browser  la synthèse du navigateur (`speechSynthesis`) : gratuite, sur
 *            l'appareil, rien ne sort. Ses voix sont celles du système ;
 *   openai,
 *   mistral  l'audio que rend /ai-help/speech, joué dans le contexte audio
 *            des sons (utils/chime.js) — le même verrou, le même déverrouillage
 *            au premier geste de la page.
 *
 * Une phrase à la fois : `queueSpeech` les enchaîne, `stopSpeaking` coupe la
 * phrase en cours ET celles qui attendaient — couper le son, « Alfred,
 * ferme », fermer la fenêtre de l'IA.
 *
 * Ce qu'elle vient de dire est gardé quelques secondes (`recentSpeech`) : le
 * micro l'entend aussi, et stores/aiHelp.js reconnaît cet écho pour ne pas le
 * lui faire relire (utils/speechEcho.js).
 *
 * Un module ne parle pas à l'utilisateur : les échecs sont des slugs
 * (`voice_blocked`, `voice_unavailable`, `voice_failed`, ou celui du serveur).
 */
import { writable } from 'svelte/store';
import { readyAudioContext } from '../../utils/chime.js';
import * as api from '../../services/aiHelpApi.js';

/** Au-delà, la lecture s'arrête à la fin d'une phrase (le serveur en accepte 1 200). */
export const SPEECH_MAX_CHARS = 900;
/** Combien de temps après la fin d'une phrase on reconnaît encore son écho. */
const ECHO_TAIL_MS = 6000;
/** Débit de lecture supposé, pour garder l'écho d'une phrase dont on ignore la durée. */
const MS_PER_CHAR = 75;

const LOCALES = { fr: 'fr-FR', en: 'en-US' };

/** Elle parle : l'orbe le montre, le bouton du son peut la faire taire. */
export const aiHelpSpeaking = writable(false);

let current = null;
let chain = Promise.resolve();
let generation = 0;
let said = [];

/**
 * Ce qui se lit d'un texte écrit pour l'écran : sans Markdown, sans adresse,
 * coupé à la fin d'une phrase s'il est long.
 * @param {string} text
 */
export function speechTextOf(text) {
  const plain = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_`~>#|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= SPEECH_MAX_CHARS) return plain;
  const cut = plain.slice(0, SPEECH_MAX_CHARS);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > SPEECH_MAX_CHARS / 3 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

function remember(text, until) {
  const now = Date.now();
  said = [...said.filter((entry) => entry.until > now), { text, until }];
}

/** Ce que l'IA a dit il y a moins de quelques secondes — pour reconnaître son écho. */
export function recentSpeech(now = Date.now()) {
  return said.filter((entry) => entry.until > now).map((entry) => entry.text);
}

/** La synthèse du navigateur existe-t-elle ici ? */
export function browserSpeechSupported() {
  return (
    typeof window !== 'undefined' &&
    !!window.speechSynthesis &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

/**
 * Les voix du navigateur. Chrome les charge après coup : on attend leur
 * annonce (`voiceschanged`) une seconde au plus.
 * @returns {Promise<Array<{id: string, label: string, lang: string, local: boolean}>>}
 */
export async function browserVoices() {
  if (!browserSpeechSupported()) return [];
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (!voices.length) {
    voices = await new Promise((resolve) => {
      const done = () => resolve(synth.getVoices());
      synth.addEventListener?.('voiceschanged', done, { once: true });
      setTimeout(done, 1000);
    });
  }
  return voices.map((voice) => ({
    id: voice.voiceURI,
    label: voice.name,
    lang: voice.lang,
    local: voice.localService !== false,
  }));
}

function speakWithBrowser(text, settings, language) {
  if (!browserSpeechSupported()) return Promise.resolve({ ok: false, error: 'voice_unavailable' });
  const synth = window.speechSynthesis;
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = LOCALES[language] || language || LOCALES.fr;
  const voice = settings.voice
    ? synth.getVoices().find((entry) => entry.voiceURI === settings.voice)
    : null;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      current = null;
      remember(text, Date.now() + ECHO_TAIL_MS);
      resolve(result);
    };
    utterance.onend = () => finish({ ok: true });
    utterance.onerror = (event) => {
      const reason = event?.error;
      if (reason === 'interrupted' || reason === 'canceled') finish({ ok: true, stopped: true });
      else
        finish({ ok: false, error: reason === 'not-allowed' ? 'voice_blocked' : 'voice_failed' });
    };
    current = {
      stop: () => {
        synth.cancel();
        finish({ ok: true, stopped: true });
      },
    };
    remember(text, Date.now() + text.length * MS_PER_CHAR + ECHO_TAIL_MS);
    synth.speak(utterance);
  });
}

async function speakWithProvider(text, settings, { language, meetingId }) {
  const ctx = await readyAudioContext();
  if (!ctx) return { ok: false, error: 'voice_blocked' };
  const res = await api.speakAiHelp({
    text,
    provider: settings.provider,
    model: settings.model,
    voice: settings.voice,
    ...(language ? { language } : {}),
    ...(meetingId ? { meetingId } : {}),
  });
  if (!res.ok) return { ok: false, error: res.error || 'voice_failed' };
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(res.data);
  } catch {
    return { ok: false, error: 'voice_failed' };
  }
  return new Promise((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      current = null;
      remember(text, Date.now() + ECHO_TAIL_MS);
      resolve(result);
    };
    source.onended = () => finish({ ok: true });
    current = {
      stop: () => {
        try {
          source.stop();
        } catch {
          // Déjà arrêtée.
        }
        finish({ ok: true, stopped: true });
      },
    };
    remember(text, Date.now() + buffer.duration * 1000 + ECHO_TAIL_MS);
    source.start();
  });
}

/**
 * Dit un texte, tout de suite : ce qui se disait s'arrête.
 * @param {string} text
 * @param {{provider: string, model?: string, voice?: string}} settings
 * @param {{language?: string, meetingId?: string}} [context]
 * @returns {Promise<{ok: boolean, error?: string, stopped?: boolean}>}
 */
export async function speakNow(text, settings, context = {}) {
  stopSpeaking();
  return speak(text, settings, context, generation);
}

async function speak(text, settings, context, gen) {
  const spoken = speechTextOf(text);
  if (!spoken || gen !== generation) return { ok: true, stopped: true };
  aiHelpSpeaking.set(true);
  try {
    return settings?.provider === 'openai' || settings?.provider === 'mistral'
      ? await speakWithProvider(spoken, settings, context)
      : await speakWithBrowser(spoken, settings || {}, context.language);
  } catch {
    return { ok: false, error: 'voice_failed' };
  } finally {
    if (!current) aiHelpSpeaking.set(false);
  }
}

/**
 * Dit un texte APRÈS ceux qui attendent déjà.
 * @returns {Promise<{ok: boolean, error?: string, stopped?: boolean}>}
 */
export function queueSpeech(text, settings, context = {}) {
  const gen = generation;
  const next = chain.then(() => speak(text, settings, context, gen));
  chain = next.catch(() => {});
  return next;
}

/** Se tait : la phrase en cours, et toutes celles qui attendaient. */
export function stopSpeaking() {
  generation += 1;
  current?.stop();
  current = null;
  if (browserSpeechSupported()) window.speechSynthesis.cancel();
  aiHelpSpeaking.set(false);
}
