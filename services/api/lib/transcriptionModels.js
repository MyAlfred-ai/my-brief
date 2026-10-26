/**
 * Modèles de transcription Realtime proposables à l'administration.
 *
 * Cette liste n'est pas indicative : `/realtime/client_secrets` REFUSE tout
 * autre identifiant (400, en énumérant les valeurs acceptées). La tenir ici
 * évite qu'un choix d'écran produise une session que le WebSocket rejettera au
 * premier enregistrement — c'est-à-dire chez l'utilisateur, pas chez
 * l'administrateur qui a fait le choix.
 *
 * Relevée en poussant une phrase synthétisée dans une VRAIE session pour chaque
 * modèle (2026-08-09, cf. documentations/TRANSCRIPTION.md) :
 *
 *   modèle                    deltas          événement `completed`
 *   ────────────────────────  ──────────────  ─────────────────────
 *   gpt-realtime-whisper      incrémentaux    JAMAIS émis
 *   gpt-live-transcribe       incrémentaux    JAMAIS émis
 *   gpt-transcribe            incrémentaux    par segment
 *
 * `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` et `whisper-1` en faisaient
 * partie jusqu'à l'annonce de leur retrait (cf. RETIRED_TRANSCRIPTION_MODELS).
 * `gpt-4o-transcribe-diarize`, retiré à la même date, n'y a jamais été :
 * l'organisation n'y a pas accès — raison d'être du bouton « Tester » de
 * l'écran d'administration.
 *
 * La colonne `completed` explique pourquoi le frontend ne peut pas se contenter
 * d'ajouter chaque transcription finale : sous gpt-realtime-whisper (le défaut
 * historique) elle n'arrive jamais, et les lignes sont bouclées à la ponctuation
 * — sous gpt-transcribe, elle arrive EN PLUS des deltas déjà affichés, d'où la
 * déduplication de src/utils/transcriptDeltas.js.
 */

/** Modèle utilisé tant qu'aucun autre n'est choisi — celui d'origine. */
export const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-realtime-whisper';

/** Identifiants acceptés, dans l'ordre d'affichage de l'écran d'administration. */
export const TRANSCRIPTION_MODELS = [
  'gpt-realtime-whisper',
  'gpt-live-transcribe',
  'gpt-transcribe',
];

/**
 * Modèle des transcriptions de FICHIER (`/api/record` : import audio, segments
 * capturés hors ligne). Pas de réglage : c'est un autre endpoint
 * (`/audio/transcriptions`), qui n'accepte pas les modèles du direct
 * (gpt-realtime-whisper, gpt-live-transcribe). gpt-transcribe y répond avec le
 * même `{ text }` que whisper-1, qu'il remplace.
 */
export const FILE_TRANSCRIPTION_MODEL = 'gpt-transcribe';

/** Date à laquelle OpenAI coupe les modèles de RETIRED_TRANSCRIPTION_MODELS. */
export const TRANSCRIPTION_RETIREMENT_DATE = '2027-02-26';

/**
 * Modèles retirés par OpenAI le 26/02/2027 → leur remplaçant.
 *
 * Un réglage enregistré avant le retrait (ou OPENAI_MODEL_TRANSCRIPTION) peut
 * encore les nommer. Les ignorer comme une valeur inconnue ferait retomber
 * l'installation sur le défaut, 3 à 6 fois plus cher que le choix de
 * l'administrateur : on les traduit donc à la RÉSOLUTION, sans réécrire la
 * base, et l'écran dit le remplacement (`retiredFrom`). gpt-transcribe, parce
 * qu'il se comporte comme eux (deltas PUIS `completed` par segment) et coûte
 * moins que gpt-4o-transcribe et whisper-1.
 */
export const RETIRED_TRANSCRIPTION_MODELS = {
  'gpt-4o-transcribe': 'gpt-transcribe',
  'gpt-4o-mini-transcribe': 'gpt-transcribe',
  'whisper-1': 'gpt-transcribe',
};

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isTranscriptionModel(id) {
  return TRANSCRIPTION_MODELS.includes(id);
}

/**
 * Valeur utilisable telle quelle, ou remplaçant d'un modèle retiré ; '' pour
 * une valeur inconnue.
 * @param {string} [id]
 * @returns {string}
 */
function usable(id) {
  if (isTranscriptionModel(id)) return id;
  return Object.hasOwn(RETIRED_TRANSCRIPTION_MODELS, id || '')
    ? RETIRED_TRANSCRIPTION_MODELS[id]
    : '';
}

/**
 * Modèle effectif, sa provenance, et le modèle retiré qu'il remplace le cas
 * échéant. Administration, sinon environnement, sinon défaut. Une valeur
 * inconnue (base éditée à la main, variable d'environnement fautive) est
 * IGNORÉE plutôt que propagée : elle ferait échouer toutes les sessions de
 * transcription de l'installation.
 *
 * @param {string} [stored] - valeur enregistrée en administration
 * @param {string} [envModel] - OPENAI_MODEL_TRANSCRIPTION
 * @returns {{model: string, source: 'settings'|'env'|'default', retiredFrom: string|null}}
 */
export function describeTranscriptionModel(stored, envModel) {
  for (const [source, id] of [
    ['settings', stored],
    ['env', envModel],
  ]) {
    const model = usable(id);
    if (model) return { model, source, retiredFrom: model === id ? null : id };
  }
  return { model: DEFAULT_TRANSCRIPTION_MODEL, source: 'default', retiredFrom: null };
}

/**
 * @param {string} [stored] - valeur enregistrée en administration
 * @param {string} [envModel] - OPENAI_MODEL_TRANSCRIPTION
 * @returns {string}
 */
export function resolveTranscriptionModel(stored, envModel) {
  return describeTranscriptionModel(stored, envModel).model;
}
