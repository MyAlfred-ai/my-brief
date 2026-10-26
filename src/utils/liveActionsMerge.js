/**
 * Fusion des actions renvoyées par le modèle dans la liste affichée.
 *
 * Avant, `addAction` avait une branche « mise à jour par id » qui n'était
 * jamais atteinte (le prompt ne demandait pas d'id en sortie) et qui, de toute
 * façon, mutait les propriétés en place sans réassigner le tableau : la
 * réactivité Svelte ne partait pas et rien n'était sauvegardé.
 *
 * Ici tout est IMMUTABLE : nouveau tableau, nouvel objet pour les seules cartes
 * modifiées. Les cartes intactes gardent leur référence — les `bind:value` des
 * champs en cours d'édition ne sont pas reconstruits sous les doigts de
 * l'utilisateur.
 */

import { normalizeDate } from './formatUtils.js';
import { normalizeForCompare } from './transcriptEcho.js';

/**
 * Durée de vie des marqueurs d'animation (`flash`). ≈ 3 cycles de pulse.
 * Le CSS borne de son côté le nombre d'itérations : même si ce nettoyage
 * échoue, aucune carte ne clignote indéfiniment.
 */
export const FLASH_DURATION_MS = 2600;

/** Champs que le modèle a le droit de faire évoluer. */
const MERGEABLE_FIELDS = ['title', 'owner', 'dueDate', 'description'];

/**
 * Longueur, en mots, au-delà de laquelle une MISE À JOUR du modèle est
 * refusée, champ par champ. En recette (2026-10-13), le modèle reprenait à
 * chaque fenêtre la description d'une action et y ajoutait « Précision
 * ajoutée : … », le porteur s'allongeant de même : en fin de réunion, une
 * seule carte portait tout le compte rendu. Le prompt l'interdit désormais
 * (services/api/lib/prompts.js) ; ceci est le filet, puisque l'entrée vient
 * d'un modèle : une carte ne peut plus enfler au fil des mises à jour. Le
 * prompt demande 30 mots de description, la marge absorbe une réécriture un
 * peu longue. Une création n'est pas bornée : elle ne s'accumule pas.
 */
export const MAX_UPDATE_WORDS = Object.freeze({ title: 15, owner: 8, description: 45 });

/** Nombre de mots d'un texte. */
function wordCount(text) {
  return String(text ?? '')
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Textes que l'application ÉCRIVAIT dans une action comme de vraies valeurs,
 * faute de placeholder : « Nouvelle action », « À définir »… Ils partaient
 * tels quels dans {{actions}} du compte rendu et dans l'infographie. Une
 * action n'en reçoit plus — ses champs vides s'affichent en placeholder — mais
 * les réunions déjà enregistrées en portent : ils sont reconnus comme vides.
 *
 * Liste FIGÉE, et non relue dans uiText.js : c'est de la donnée historique.
 * Si un libellé d'écran change un jour, les valeurs déjà en base, elles, ne
 * changent pas.
 */
export const LEGACY_ACTION_PLACEHOLDERS = Object.freeze([
  'Nouvelle action',
  'New action',
  'À définir',
  'To be decided',
  "Description de l'action...",
  'Action description...',
]);

/**
 * Vrai si la valeur n'apporte rien : vide, ou égale à un texte de remplacement
 * (ceux d'avant, `LEGACY_ACTION_PLACEHOLDERS`, et ceux que l'appelant ajoute).
 * Le modèle renvoie l'action entière à chaque mise à jour ; sans ce garde-fou,
 * un champ qu'il n'a pas su remplir écraserait ce que l'utilisateur avait saisi.
 */
function isBlank(value, placeholders = []) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  return [...LEGACY_ACTION_PLACEHOLDERS, ...placeholders].some(
    (p) => p && text === String(p).trim(),
  );
}

/** Plus grand id entier de la liste — 0 si aucun. */
function maxActionId(actions) {
  let max = 0;
  for (const action of Array.isArray(actions) ? actions : []) {
    const id = Number(action?.id);
    if (Number.isInteger(id) && id > max) max = id;
  }
  return max;
}

/**
 * Vrai si l'action dit quelque chose : un titre, un porteur, une échéance ou
 * une description. Une carte ajoutée à la main et laissée vierge n'est pas une
 * action — elle n'a rien à faire dans le compte rendu ni dans le prompt.
 *
 * @param {object} action
 * @returns {boolean}
 */
export function hasActionContent(action) {
  return MERGEABLE_FIELDS.some((field) => !isBlank(action?.[field]));
}

/**
 * Garantit un id numérique, et UNIQUE, à chaque action. Les enregistrements
 * d'avant cette version peuvent ne pas en avoir, or le rendu est keyé par id
 * et les mises à jour s'y adossent. Unique aussi : un compteur resté en
 * arrière (réunion rouverte depuis l'historique) a pu donner à une carte
 * ajoutée l'id d'une carte existante — deux clés égales dans un `{#each}`
 * keyé, et un masquage qui emporte les deux.
 *
 * @param {Array} actions
 * @param {number} [idCounter]
 * @returns {{actions: Array, idCounter: number}}
 */
export function ensureActionIds(actions, idCounter = 0) {
  if (!Array.isArray(actions)) return { actions: [], idCounter };

  let counter = Math.max(idCounter, maxActionId(actions));
  const seen = new Set();
  let changed = false;
  const next = actions.map((action) => {
    const id = Number(action?.id);
    if (Number.isInteger(id) && !seen.has(id)) {
      seen.add(id);
      return action;
    }
    changed = true;
    const fresh = ++counter;
    seen.add(fresh);
    return { ...action, id: fresh };
  });

  return { actions: changed ? next : actions, idCounter: counter };
}

/**
 * Actions telles qu'elles arrivent d'ailleurs (historique, localStorage) :
 * ids garantis, et textes de remplacement d'autrefois vidés — le champ
 * s'affiche alors en placeholder au lieu de passer pour une vraie valeur.
 *
 * @param {Array} actions
 * @param {number} [idCounter]
 * @returns {{actions: Array, idCounter: number}}
 */
export function normalizeActions(actions, idCounter = 0) {
  const { actions: withIds, idCounter: counter } = ensureActionIds(actions, idCounter);
  let changed = false;
  const next = withIds.map((action) => {
    const legacy = MERGEABLE_FIELDS.filter((field) => action?.[field] && isBlank(action[field]));
    if (legacy.length === 0) return action;
    changed = true;
    return { ...action, ...Object.fromEntries(legacy.map((field) => [field, ''])) };
  });
  return { actions: changed ? next : withIds, idCounter: counter };
}

/**
 * Forme ÉCRITE d'une liste d'actions — en base (/resume, /history/*), et dans
 * le prompt du compte rendu : sans marqueurs d'animation, échéance au format
 * yyyy-MM-dd, et sans texte de remplacement. Les actions masquées restent :
 * elles se rétablissent, et la détection ne doit pas les reproposer.
 *
 * @param {Array} actions
 * @returns {Array} nouveaux objets — un instantané, jamais les cartes affichées
 */
export function toStoredActions(actions) {
  return (Array.isArray(actions) ? actions : [])
    .filter((action) => action && typeof action === 'object')
    .map(({ flash, flashAt, updatedFields, ...action }) => {
      const out = { ...action };
      for (const field of MERGEABLE_FIELDS) {
        if (!(field in out)) continue;
        out[field] = isBlank(out[field])
          ? ''
          : field === 'dueDate'
            ? normalizeDate(String(out[field])) || ''
            : String(out[field]);
      }
      return out;
    });
}

/**
 * Ajoute en tête une carte vierge : ses champs VIDES s'affichent en
 * placeholder, rien n'est écrit à la place de l'utilisateur. L'id repart du
 * plus grand de la liste, pas seulement du compteur : sur une réunion rouverte
 * depuis l'historique, le compteur peut être en arrière.
 *
 * @param {Array} actions
 * @param {number} [idCounter]
 * @returns {{actions: Array, idCounter: number}}
 */
export function prependManualAction(actions, idCounter = 0) {
  const base = Array.isArray(actions) ? actions : [];
  const id = Math.max(idCounter, maxActionId(base)) + 1;
  return {
    actions: [
      { id, title: '', owner: '', dueDate: '', description: '', newBadge: 'Manual', show: true },
      ...base,
    ],
    idCounter: id,
  };
}

/**
 * Masque (`show: false`) ou rétablit une action. Masquée, elle quitte la liste,
 * le compte rendu et l'infographie, et la détection ne la repropose plus ; elle
 * reste dans les données pour pouvoir revenir. Désignée par son id — une
 * référence d'objet ne survit pas à un re-rendu qui reconstruit la carte.
 *
 * @param {Array} actions
 * @param {object} target
 * @param {boolean} show
 * @returns {Array} nouveau tableau, ou celui d'origine si rien ne change
 */
export function setActionShown(actions, target, show) {
  const base = Array.isArray(actions) ? actions : [];
  const matches = (action) =>
    action === target || (target?.id != null && Number(action?.id) === Number(target.id));
  if (!base.some((action) => matches(action) && (action.show !== false) !== show)) return base;
  return base.map((action) => (matches(action) ? { ...action, show } : action));
}

/**
 * Sépare ce qui part au modèle.
 *
 * `active` porte l'id : c'est ce qui permet au modèle de désigner l'action
 * qu'il veut affiner. `dismissed` ne le porte pas — l'utilisateur a masqué
 * ces actions, le modèle doit seulement savoir de quoi il ne doit plus parler.
 * C'est pour ce signal qu'une action masquée reste dans la liste au lieu d'en
 * être supprimée.
 *
 * Les champs d'affichage (`show`, `newBadge`) et d'animation (`flash`…) sont
 * retirés : ils n'ont aucun sens pour le modèle et polluaient le prompt. Une
 * carte vierge (ajoutée à la main, pas encore remplie) ne part pas : le modèle
 * n'a rien à y affiner, et pourrait y verser une tout autre tâche.
 *
 * @param {Array} actions
 * @param {{ownerPlaceholder?: string, descriptionPlaceholder?: string}} [placeholders]
 *   textes à traiter comme vides, en plus de `LEGACY_ACTION_PLACEHOLDERS`
 * @returns {{active: Array, dismissed: Array}}
 */
export function splitActionsForPrompt(actions, placeholders = {}) {
  const blanks = [placeholders.ownerPlaceholder, placeholders.descriptionPlaceholder];
  const active = [];
  const dismissed = [];

  for (const action of Array.isArray(actions) ? actions : []) {
    if (!action || !MERGEABLE_FIELDS.some((field) => !isBlank(action[field], blanks))) continue;
    const clean = (value) => (isBlank(value, blanks) ? '' : String(value).trim());

    if (action.show === false) {
      dismissed.push({ title: clean(action.title), description: clean(action.description) });
      continue;
    }

    active.push({
      id: action.id,
      title: clean(action.title),
      owner: clean(action.owner),
      dueDate: clean(action.dueDate),
      description: clean(action.description),
    });
  }

  return { active, dismissed };
}

/**
 * Applique la réponse du modèle à la liste courante.
 *
 * @param {Array} current Actions affichées (visibles et masquées).
 * @param {Array} incoming Réponse du modèle.
 * @param {object} opts
 * @param {number} opts.idCounter Compteur d'id local.
 * @param {{title?: string, owner?: string, description?: string}} [opts.defaults]
 *   Textes à traiter comme des valeurs qui n'apportent rien, en plus de
 *   `LEGACY_ACTION_PLACEHOLDERS`. Ils ne sont JAMAIS écrits dans une action :
 *   un champ que le modèle n'a pas rempli reste vide, et s'affiche en
 *   placeholder.
 * @param {number} [opts.now]
 * @returns {{actions: Array, idCounter: number, createdIds: Array<number>, updatedIds: Array<number>}}
 */
export function mergeDetectedActions(
  current,
  incoming,
  { idCounter = 0, defaults = {}, now } = {},
) {
  const stamp = now ?? Date.now();
  const base = Array.isArray(current) ? current : [];
  const items = Array.isArray(incoming) ? incoming : [];
  const blanks = [defaults.owner, defaults.description, defaults.title];

  // Le compteur peut être en arrière de la liste (réunion rouverte depuis
  // l'historique) : une création lui prendrait l'id d'une carte existante.
  let counter = Math.max(idCounter, maxActionId(base));
  let actions = base;
  const createdIds = [];
  const updatedIds = [];

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const incomingId = Number(item.id);
    let index = Number.isInteger(incomingId)
      ? actions.findIndex((a) => Number(a?.id) === incomingId)
      : -1;

    // Le modèle a désigné une action supprimée par l'utilisateur : on ne la
    // ressuscite pas. Le prompt le lui dit déjà, ceci est le filet.
    if (index !== -1 && actions[index].show === false) continue;

    // Pas d'id, mais un titre déjà présent : c'est la même tâche redite
    // autrement. Requalifié en mise à jour plutôt qu'en doublon.
    if (index === -1) {
      const key = normalizeForCompare(item.title);
      if (key) {
        index = actions.findIndex(
          (a) => a?.show !== false && normalizeForCompare(a?.title) === key,
        );
      }
    }

    if (index !== -1) {
      const existing = actions[index];
      const patch = {};
      const updatedFields = [];

      for (const field of MERGEABLE_FIELDS) {
        if (!(field in item)) continue;
        let value = item[field];
        // Une valeur vide n'écrase jamais une valeur déjà renseignée : le
        // modèle renvoie l'action entière, y compris les champs qu'il n'a pas
        // su remplir, et l'utilisateur a pu les saisir à la main.
        if (isBlank(value, blanks)) continue;
        value = field === 'dueDate' ? normalizeDate(String(value)) : String(value).trim();
        if (!value || value === existing[field]) continue;
        // Trop long pour un champ d'action : c'est une accumulation, pas une
        // précision. Le champ garde sa valeur ; les autres s'appliquent.
        if (field in MAX_UPDATE_WORDS && wordCount(value) > MAX_UPDATE_WORDS[field]) continue;
        patch[field] = value;
        updatedFields.push(field);
      }

      // Rien n'a bougé : ni écriture, ni animation. Sans ce test, chaque appel
      // ferait pulser toutes les cartes que le modèle repasse en revue.
      if (updatedFields.length === 0) continue;

      const next = actions.slice();
      next[index] = { ...existing, ...patch, flash: 'updated', flashAt: stamp, updatedFields };
      actions = next;
      updatedIds.push(existing.id);
      continue;
    }

    // Id inconnu : le modèle l'a inventé. On le jette et on crée avec un id du
    // compteur local, sinon deux actions pourraient finir avec le même id.
    const id = ++counter;
    const dueDate = normalizeDate(String(item.dueDate ?? '')) || '';
    actions = [
      {
        id,
        title: isBlank(item.title, blanks) ? '' : String(item.title).trim(),
        owner: isBlank(item.owner, blanks) ? '' : String(item.owner).trim(),
        dueDate,
        description: isBlank(item.description, blanks) ? '' : String(item.description).trim(),
        newBadge: 'AI',
        show: true,
        flash: 'new',
        flashAt: stamp,
      },
      ...actions,
    ];
    createdIds.push(id);
  }

  return { actions, idCounter: counter, createdIds, updatedIds };
}

/**
 * Retire les marqueurs d'animation une fois celle-ci jouée, pour qu'ils ne
 * partent ni en base ni dans le localStorage — une carte restaurée ne doit pas
 * re-pulser au chargement.
 *
 * @param {Array} actions
 * @param {Array<number>} ids
 * @returns {Array} le tableau d'origine si rien n'est à nettoyer
 */
export function clearActionFlashes(actions, ids) {
  if (!Array.isArray(actions) || !Array.isArray(ids) || ids.length === 0) return actions;
  const targets = new Set(ids.map(Number));

  let changed = false;
  const next = actions.map((action) => {
    if (!action || !targets.has(Number(action.id)) || !action.flash) return action;
    changed = true;
    const { flash, flashAt, updatedFields, ...rest } = action;
    return rest;
  });

  return changed ? next : actions;
}
