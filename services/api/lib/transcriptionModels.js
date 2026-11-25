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
 *
 * Quatre FOURNISSEURS depuis le 2026-10-27 : OpenAI, et trois tiers — Mistral
 * (Voxtral), Speechmatics et AssemblyAI — qui ont chacun leur clé
 * (Administration → IA, « Fournisseurs d'IA ») et leur protocole Realtime,
 * relevés dans leur documentation, sans appel réel (cf.
 * documentations/TRANSCRIPTION.md §2). Le fournisseur suit le MODÈLE : un seul
 * réglage, et le direct comme les fichiers partent chez celui qui l'a.
 */

/** Modèle utilisé tant qu'aucun autre n'est choisi — celui d'origine. */
export const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-realtime-whisper';

/**
 * Fournisseur de chaque modèle accepté, dans l'ordre d'affichage de l'écran
 * d'administration. Il décide de la clé qui paie, du jeton éphémère et du
 * socket du navigateur. src/lib/realtime/channel.js le déduit du PRÉFIXE de
 * l'identifiant (`voxtral-`, `speechmatics-`, `universal-`) : les deux doivent
 * rester alignés, un test de l'API le vérifie.
 *
 * - Voxtral, deux générations : 2602, disponible en général, et 3.0, en aperçu
 *   public depuis le 2026-10-20. Identifiants versionnés et non `-latest` : un
 *   alias qui bascule changerait le protocole ou le prix sous les pieds de
 *   l'administrateur.
 * - Speechmatics n'a pas d'identifiant de modèle à lui seul : `model` vaut
 *   `melia-1` (le plus récent, en direct depuis le 2026-10-13, passe d'une
 *   langue à l'autre) ou `enhanced` (le plus éprouvé). Le préfixe
 *   `speechmatics-` les rend uniques ici ; speechmaticsModel() le retire.
 * - AssemblyAI : ses identifiants tels quels. `universal-3-6-pro`, le plus
 *   juste (32 langues), et `universal-streaming-multilingual`, trois fois
 *   moins cher (6 langues, dont le français).
 * @type {Record<string, 'openai'|'mistral'|'speechmatics'|'assemblyai'>}
 */
export const TRANSCRIPTION_PROVIDERS = {
  'gpt-realtime-whisper': 'openai',
  'gpt-live-transcribe': 'openai',
  'gpt-transcribe': 'openai',
  'voxtral-mini-transcribe-realtime-2602': 'mistral',
  'voxtral-mini-transcribe-realtime-3-0': 'mistral',
  'speechmatics-melia-1': 'speechmatics',
  'speechmatics-enhanced': 'speechmatics',
  'universal-3-6-pro': 'assemblyai',
  'universal-streaming-multilingual': 'assemblyai',
};

/**
 * Fournisseurs TIERS, dans l'ordre de la carte « Fournisseurs d'IA » : chacun a
 * sa clé, enregistrée seulement depuis l'administration (pas d'environnement),
 * dans le champ `<fournisseur>ApiKey` du document `ai` — la même règle de nom
 * côté écran (AiTab.svelte) et dans le corps de POST /settings/ai.
 */
export const KEYED_PROVIDERS = ['mistral', 'speechmatics', 'assemblyai'];

/** @param {string} provider @returns {string} `mistralApiKey`… */
export function providerKeyField(provider) {
  return `${provider}ApiKey`;
}

/** Noms de marque, pour les constats de configuration (jamais traduits). */
export const PROVIDER_LABELS = {
  openai: 'OpenAI',
  mistral: 'Mistral',
  speechmatics: 'Speechmatics',
  assemblyai: 'AssemblyAI',
};

/** Identifiants acceptés, dans l'ordre d'affichage de l'écran d'administration. */
export const TRANSCRIPTION_MODELS = Object.keys(TRANSCRIPTION_PROVIDERS);

/**
 * Modèle des transcriptions de FICHIER (`/api/record` : import audio, segments
 * capturés hors ligne). Pas de réglage : c'est un autre endpoint
 * (`/audio/transcriptions`), qui n'accepte pas les modèles du direct
 * (gpt-realtime-whisper, gpt-live-transcribe). gpt-transcribe y répond avec le
 * même `{ text }` que whisper-1, qu'il remplace.
 */
export const FILE_TRANSCRIPTION_MODEL = 'gpt-transcribe';

/**
 * Modèle de FICHIER d'un modèle tiers du direct : celui de la même génération
 * chez le même fournisseur. Une installation passée à un tiers n'envoie donc
 * plus d'audio à OpenAI, imports compris.
 */
const PROVIDER_FILE_MODELS = {
  'voxtral-mini-transcribe-realtime-2602': 'voxtral-mini-2602',
  'voxtral-mini-transcribe-realtime-3-0': 'voxtral-mini-transcribe-3-0',
  // Speechmatics : le même `model` en fichier qu'en direct.
  'speechmatics-melia-1': 'melia-1',
  'speechmatics-enhanced': 'enhanced',
  // AssemblyAI n'a pas de modèle « streaming » en fichier : son meilleur
  // modèle de fichier, Universal-2 en repli (cf. lib/assemblyai.js).
  'universal-3-6-pro': 'universal-3-5-pro',
  'universal-streaming-multilingual': 'universal-3-5-pro',
};

/**
 * @param {string} id - modèle du direct, résolu
 * @returns {'openai'|'mistral'|'speechmatics'|'assemblyai'}
 */
export function transcriptionProvider(id) {
  return TRANSCRIPTION_PROVIDERS[id] || 'openai';
}

/** `model` de Speechmatics pour un de nos identifiants (`melia-1`, `enhanced`). */
export function speechmaticsModel(id) {
  return String(id || '').replace(/^speechmatics-/, '');
}

/**
 * Modèle des fichiers pour le modèle du direct en service.
 * @param {string} liveModel - modèle du direct, résolu
 * @returns {string}
 */
export function fileTranscriptionModel(liveModel) {
  return PROVIDER_FILE_MODELS[liveModel] || FILE_TRANSCRIPTION_MODEL;
}

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
  return Object.hasOwn(TRANSCRIPTION_PROVIDERS, id || '');
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
