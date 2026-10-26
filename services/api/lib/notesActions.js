/**
 * Notes et actions d'une réunion — ce qu'une route accepte avant de l'écrire
 * dans le document `resume`.
 *
 * Jusqu'ici elles n'atteignaient la base que par /resume, à la génération d'un
 * compte rendu : une réunion terminée par « Enregistrer » se rouvrait sans
 * elles, et une modification faite sur une réunion rouverte se perdait faute
 * de régénérer un résumé. Trois routes les acceptent désormais — /history/stop
 * (à l'arrêt), /history/title (au rangement) et /history/notes-actions (à
 * chaque modification, en différé côté client) — et partagent ce schéma : une
 * seule définition de ce qui est accepté.
 *
 * Validation par ajv, dont Fastify active `removeAdditional` : un champ
 * d'action inconnu (marqueur d'animation, reliquat) est retiré, pas refusé.
 * La FORME est vérifiée, pas la taille : un refus ferait perdre ce que
 * l'utilisateur vient d'écrire et, sur /history/stop, empêcherait la clôture
 * de la réunion. La limite de corps de l'API (app.js) borne l'abus — /resume
 * reçoit ces mêmes champs sans plafond.
 */

/** Champs d'une action qui disent quelque chose — `show` et `newBadge` n'en sont pas. */
const CONTENT_FIELDS = ['title', 'owner', 'dueDate', 'description'];

/**
 * Textes de remplacement que l'écran des actions ENREGISTRAIT comme valeurs,
 * faute de placeholder (« Nouvelle action », un porteur « À définir »…). Il ne
 * le fait plus, et les vide à l'ouverture d'une réunion
 * (src/utils/liveActionsMerge.js, LEGACY_ACTION_PLACEHOLDERS) ; une réunion
 * ancienne jamais retouchée en garde pourtant en base. Liste FIGÉE — ce sont
 * les textes historiques, pas ceux de l'interface du jour —, et UNIQUE côté
 * serveur : l'envoi à myBrain (lib/myBrain/document.js) s'en sert aussi, pour
 * que « À définir » ne finisse pas en personne dans le cerveau. Comparée sans
 * casse ; quelques placeholders d'écran y figurent par prudence.
 */
const LEGACY_ACTION_PLACEHOLDERS = new Set(
  [
    'Nouvelle action',
    'New action',
    'À définir',
    'To be decided',
    "Description de l'action...",
    'Action description...',
    'Cliquez pour éditer la description...',
    'Click to edit the description...',
    'Action…',
    'Non définie',
    'Not set',
  ].map((text) => text.toLowerCase()),
);

/**
 * Vrai si le texte n'est qu'un texte de remplacement d'autrefois.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLegacyActionPlaceholder(value) {
  return LEGACY_ACTION_PLACEHOLDERS.has(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  );
}

/** Vrai si la valeur est vide ou n'est qu'un texte de remplacement d'autrefois. */
function isBlank(value) {
  return !String(value ?? '').trim() || isLegacyActionPlaceholder(value);
}

export const notesSchema = { type: 'string' };

/**
 * Forme d'une action telle que le frontend la garde (src/utils/liveActionsMerge.js).
 * Les actions masquées (`show: false`) font partie de la liste : elles restent
 * en base pour pouvoir être rétablies, et pour que la détection ne les
 * repropose pas.
 */
export const actionsSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'integer' },
      title: { type: 'string' },
      owner: { type: 'string' },
      dueDate: { type: 'string' },
      description: { type: 'string' },
      newBadge: { type: 'string' },
      show: { type: 'boolean' },
    },
  },
};

/**
 * Fragment `$set` des seuls champs PRÉSENTS dans le corps : un client qui
 * n'envoie pas les notes ne les efface pas.
 *
 * @param {{notes?: string, actions?: Array}} [body]
 * @returns {{notes?: string, actions?: Array}}
 */
export function notesActionsFields(body = {}) {
  const fields = {};
  if (typeof body.notes === 'string') fields.notes = body.notes;
  if (Array.isArray(body.actions)) fields.actions = body.actions;
  return fields;
}

/**
 * Actions relues en base pour un modèle, sans les textes de remplacement
 * d'autrefois — une infographie régénérée n'affiche pas « Nouvelle action —
 * À définir ».
 *
 * @param {unknown} actions
 * @returns {Array}
 */
export function withoutLegacyPlaceholders(actions) {
  return (Array.isArray(actions) ? actions : []).map((action) => {
    if (!action || typeof action !== 'object') return action;
    const out = { ...action };
    for (const key of CONTENT_FIELDS) {
      if (key in out && isBlank(out[key])) out[key] = '';
    }
    return out;
  });
}

/**
 * Vrai si les notes ou une action portent quelque chose d'écrit. Une réunion
 * qui en porte n'est jamais « vide » au sens de /history/stop : la purger
 * effacerait ce que l'utilisateur a tapé, même sans un mot transcrit. Une
 * carte ajoutée à la main puis laissée vierge, elle, ne compte pas.
 *
 * @param {{notes?: unknown, actions?: unknown}} [side]
 * @returns {boolean}
 */
export function hasNotesActionsContent({ notes, actions } = {}) {
  if (String(notes ?? '').trim()) return true;
  return (Array.isArray(actions) ? actions : []).some((action) =>
    CONTENT_FIELDS.some((key) => !isBlank(action?.[key])),
  );
}
