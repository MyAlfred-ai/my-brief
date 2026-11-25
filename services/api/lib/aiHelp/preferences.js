/**
 * Préférences de l'Aide IA d'un COMPTE — ce avec quoi ses réunions démarrent,
 * ce qui s'entend, et sa voix. Réglées dans Réglages → Aide IA ; une réunion
 * les lit à son ouverture, puis tout se change pour elle seule.
 *
 *   start   allumée ou non, et ses domaines, au démarrage d'une réunion. Absent :
 *           tout allumé — le comportement d'avant ce réglage (2026-11-12) ;
 *   sounds  un son par sens : alertes (carillon), idées (sonnette), gestes
 *           faits (deux notes), fin du minuteur (une courte mélodie) ;
 *   voice   lire à voix haute, avec quel moteur (`browser` : la synthèse du
 *           navigateur, gratuite et locale ; `openai`, `mistral` : la clé de
 *           l'installation), quel modèle, quelle voix, et quoi lire.
 *
 * ── Pourquoi un champ neuf, `aiHelp.preferences` ─────────────────────────────
 * Le compte porte déjà `aiHelp.enabled` et `aiHelp.domains` : c'était « comme
 * la dernière fois », abandonné le 2026-11-12. Des comptes y ont gardé un
 * `enabled: false` posé en coupant l'IA une fois, sans le savoir : relire ces
 * champs comme des préférences éteindrait l'Aide IA de leurs réunions sans
 * qu'ils l'aient choisi ici. Seul `aiHelp.sound: false` est repris — un « je ne
 * veux pas de son » délibéré, qui coupe tous les sons tant que la page n'a
 * pas été enregistrée.
 */
import { AI_HELP_FIRST_DOMAINS, normalizeDomains } from './domains.js';
import { VOICE_ENGINES, voiceProblem } from './voices.js';

export const SOUND_KINDS = ['alerts', 'ideas', 'actions', 'timer'];
export const READ_KINDS = ['answers', 'alerts', 'ideas'];

const DEFAULT_READ = { answers: true, alerts: true, ideas: false };

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const objectOr = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/**
 * Les préférences telles qu'elles valent, champ manquant comblé.
 * @param {object} [raw] - le sous-document `aiHelp` du compte
 */
export function readPreferences(raw) {
  const source = objectOr(raw);
  const prefs = objectOr(source.preferences);
  const start = objectOr(prefs.start);
  const sounds = objectOr(prefs.sounds);
  const voice = objectOr(prefs.voice);
  const read = objectOr(voice.read);
  // Le seul héritage repris : un son coupé exprès (cf. en-tête).
  const soundDefault = source.sound !== false;
  const engine = VOICE_ENGINES.includes(voice.provider) ? voice.provider : 'browser';
  return {
    start: {
      enabled: bool(start.enabled, true),
      domains: normalizeDomains(start.domains, AI_HELP_FIRST_DOMAINS),
    },
    sounds: Object.fromEntries(SOUND_KINDS.map((kind) => [kind, bool(sounds[kind], soundDefault)])),
    voice: {
      enabled: bool(voice.enabled, false),
      provider: engine,
      model: typeof voice.model === 'string' ? voice.model : '',
      voice: typeof voice.voice === 'string' ? voice.voice : '',
      read: Object.fromEntries(
        READ_KINDS.map((kind) => [kind, bool(read[kind], DEFAULT_READ[kind])]),
      ),
    },
  };
}

/**
 * Une préférence reçue, fondue dans celles qui valent. Champ absent :
 * inchangé. Un moteur de voix incohérent (modèle inconnu, voix d'un autre
 * modèle) est REFUSÉ — jamais corrigé en silence.
 *
 * @param {object} current - readPreferences()
 * @param {object} patch - corps validé par `preferencesBody`
 * @returns {{preferences?: object, problem?: string}}
 */
export function mergePreferences(current, patch = {}) {
  const next = {
    start: {
      enabled: bool(patch.start?.enabled, current.start.enabled),
      domains: normalizeDomains(patch.start?.domains, current.start.domains),
    },
    sounds: Object.fromEntries(
      SOUND_KINDS.map((kind) => [kind, bool(patch.sounds?.[kind], current.sounds[kind])]),
    ),
    voice: {
      enabled: bool(patch.voice?.enabled, current.voice.enabled),
      provider: patch.voice?.provider ?? current.voice.provider,
      model: patch.voice?.model ?? current.voice.model,
      voice: patch.voice?.voice ?? current.voice.voice,
      read: Object.fromEntries(
        READ_KINDS.map((kind) => [kind, bool(patch.voice?.read?.[kind], current.voice.read[kind])]),
      ),
    },
  };
  const problem = voiceProblem(next.voice);
  return problem ? { problem } : { preferences: next };
}

const flags = (keys) => ({
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(keys.map((key) => [key, { type: 'boolean' }])),
});

/**
 * @param {string[]} domainKeys - AI_HELP_DOMAINS
 */
export function preferencesBody(domainKeys) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      start: {
        type: 'object',
        additionalProperties: false,
        properties: { enabled: { type: 'boolean' }, domains: flags(domainKeys) },
      },
      sounds: flags(SOUND_KINDS),
      voice: {
        type: 'object',
        additionalProperties: false,
        properties: {
          enabled: { type: 'boolean' },
          provider: { type: 'string', enum: VOICE_ENGINES },
          model: { type: 'string', maxLength: 80 },
          voice: { type: 'string', maxLength: 200 },
          read: flags(READ_KINDS),
        },
      },
    },
  };
}
