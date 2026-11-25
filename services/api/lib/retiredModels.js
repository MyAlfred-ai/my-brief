/**
 * Modèles de texte et d'image qu'OpenAI a retirés ou retire de son API — et
 * pourquoi une variable OPENAI_MODEL_* qui en vise un est IGNORÉE.
 *
 * Source : developers.openai.com/api/docs/deprecations, relue le 2026-11-12
 * à la suite du courriel « GPT-5 et o3 » (coupure le 2026-12-11). Une nouvelle
 * annonce se recopie ici, sous sa date de COUPURE, avec ses instantanés datés :
 * l'API les refuse comme l'alias.
 *
 * ── Le risque couvert ──────────────────────────────────────────────────────
 * Aucun défaut du code ne vise ces modèles (un test le vérifie). Ce qui reste,
 * c'est une variable OPENAI_MODEL_* du `.env` d'un serveur — invisible depuis
 * ce dépôt — restée sur l'un d'eux : le jour de la coupure, chaque appel de cet
 * usage échoue, et pour le TITRE en silence (tâche de fond : la réunion garde
 * « Réunion sans titre »). `loadConfig` ignore donc une telle valeur dès
 * l'annonce : l'usage retombe sur son défaut, comme si la variable était vide,
 * et server.js le dit au démarrage.
 *
 * Écarté : TRADUIRE vers le remplaçant désigné par OpenAI, comme le fait la
 * transcription (lib/transcriptionModels.js). Là-bas, ignorer aurait fait
 * retomber sur un défaut 3 à 6 fois plus cher que le choix de
 * l'administrateur. Ici c'est l'inverse : gpt-5-mini → gpt-5.6-terra aurait
 * multiplié par 6,5 le coût de la détection d'actions, qui tourne en continu
 * (cf. lib/config.js), quand chaque défaut d'usage a été choisi avec son coût
 * et ses paramètres (`reasoning_effort: 'none'` du titre), et celui du compte
 * rendu mesuré (lib/summaryModels.js).
 *
 * Écarté aussi : attendre la date de coupure. La configuration est lue au
 * démarrage ; un conteneur lancé la veille passerait la date avec le modèle
 * retiré. OpenAI demande de migrer AVANT.
 *
 * ── Hors de ce module ──────────────────────────────────────────────────────
 * - Les choix de l'ÉCRAN : leurs listes fermées (lib/summaryModels.js,
 *   lib/infographicModels.js) ne proposent aucun modèle retiré. Un choix
 *   enregistré avant le retrait est traduit et ANNONCÉ dans la rubrique Modèles IA
 *   (RETIRED_INFOGRAPHIC_IMAGE_MODELS pour `gpt-image-2`) : ce qui se voit
 *   s'annonce ; ce qui ne se voit pas (le `.env`) se neutralise.
 * - OPENAI_MODEL_TRANSCRIPTION : lib/transcriptionModels.js traduit déjà ses
 *   modèles retirés (coupure le 2027-02-26).
 * - Voix (tts-*), audio et Realtime généralistes (gpt-realtime, gpt-audio,
 *   coupés en janvier 2027) : l'application ne s'en sert pas.
 */

/**
 * Coupures annoncées, par date. Les dates passées restent : une variable qui
 * vise un modèle déjà coupé échoue aujourd'hui, l'ignorer la répare.
 * @type {ReadonlyArray<{shutdown: string, models: string[]}>}
 */
export const OPENAI_RETIREMENTS = [
  {
    shutdown: '2026-08-10',
    models: ['gpt-5.2-chat-latest', 'gpt-5.3-chat-latest'],
  },
  {
    shutdown: '2026-10-23',
    models: [
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-0125',
      'gpt-4',
      'gpt-4-0613',
      'gpt-4-1106-preview',
      'gpt-4-turbo',
      'gpt-4-turbo-2024-04-09',
      'gpt-4.1-nano',
      'gpt-4.1-nano-2025-04-14',
      'gpt-4o-2024-05-13',
      'o1',
      'o1-2024-12-17',
      'o1-pro',
      'o1-pro-2025-03-19',
      'o3-mini',
      'o3-mini-2025-01-31',
      'o4-mini',
      'o4-mini-2025-04-16',
      'gpt-image-1',
    ],
  },
  {
    shutdown: '2026-12-01',
    models: [
      'gpt-image-1-mini',
      'gpt-image-1.5',
      'gpt-image-1.5-2025-12-16',
      'chatgpt-image-latest',
    ],
  },
  {
    // Le courriel du 2026-11-12. gpt-5-mini était le défaut de la détection
    // d'actions jusqu'au 2026-10-14 (passée sur gpt-6-luna, cf. lib/config.js).
    shutdown: '2026-12-11',
    models: [
      'gpt-5',
      'gpt-5-2025-08-07',
      'gpt-5-mini',
      'gpt-5-mini-2025-08-07',
      'gpt-5-nano',
      'gpt-5-nano-2025-08-07',
      'gpt-5-pro',
      'gpt-5-pro-2025-10-06',
      'o3',
      'o3-2025-04-16',
      'o3-pro',
      'o3-pro-2025-06-10',
    ],
  },
  {
    // gpt-4o-mini était le modèle du titre et de la relecture jusqu'au
    // 2026-10-14, et celui du compte rendu jusqu'au 2026-09-01.
    shutdown: '2027-01-14',
    models: [
      'gpt-4o',
      'gpt-4o-2024-08-06',
      'gpt-4o-2024-11-20',
      'gpt-4o-mini',
      'gpt-4o-mini-2024-07-18',
      'gpt-4.1',
      'gpt-4.1-2025-04-14',
      'gpt-4.1-mini',
      'gpt-4.1-mini-2025-04-14',
    ],
  },
  {
    // Retiré de l'écran le 2026-11-12 ; un choix enregistré est lu comme
    // gpt-image-2.5-flare, et la rubrique Modèles IA le dit (lib/infographicModels.js).
    shutdown: '2027-02-10',
    models: ['gpt-image-2', 'gpt-image-2-2026-04-21'],
  },
  {
    shutdown: '2027-04-01',
    models: [
      'gpt-5.1',
      'gpt-5.1-2025-11-13',
      'gpt-5.3-codex',
      'gpt-5.4-nano',
      'gpt-5.4-nano-2026-03-17',
    ],
  },
];

const SHUTDOWN_BY_MODEL = new Map(
  OPENAI_RETIREMENTS.flatMap(({ shutdown, models }) => models.map((model) => [model, shutdown])),
);

/**
 * Date de coupure d'un modèle, ou `null` s'il n'en a pas d'annoncée. Un modèle
 * affiné (`ft:gpt-5-mini-2025-08-07:org::id`) suit celle de son modèle de base,
 * comme le dit OpenAI.
 * @param {string} [id]
 * @returns {string|null} AAAA-MM-JJ
 */
export function retirementDate(id) {
  const raw = String(id || '').trim();
  const base = raw.startsWith('ft:') ? raw.split(':')[1] : raw;
  return SHUTDOWN_BY_MODEL.get(base) || null;
}

/** Variables d'environnement qui imposent un modèle de texte ou d'image. */
export const MODEL_VARIABLES = [
  'OPENAI_MODEL_SUMMARY',
  'OPENAI_MODEL_TITLE',
  'OPENAI_MODEL_ACTIONS',
  'OPENAI_MODEL_REFINE',
  'OPENAI_MODEL_INFOGRAPHIC',
  'OPENAI_MODEL_INFOGRAPHIC_IMAGE',
];

/**
 * Valeur de chaque variable de MODEL_VARIABLES, vidée si elle vise un modèle
 * retiré, et la liste de ce qui a été ignoré — pour le journal du démarrage.
 * @param {Record<string, string|undefined>} env
 * @returns {{values: Record<string, string>, ignored: Array<{variable: string, model: string, shutdown: string}>}}
 */
export function screenModelVariables(env) {
  /** @type {Record<string, string>} */
  const values = {};
  const ignored = [];
  for (const variable of MODEL_VARIABLES) {
    const model = String(env[variable] || '').trim();
    const shutdown = retirementDate(model);
    if (shutdown) ignored.push({ variable, model, shutdown });
    values[variable] = shutdown ? '' : model;
  }
  return { values, ignored };
}
