/**
 * Trouver un tag : par son nom, ou par ce que dit son contexte — un acteur,
 * un sigle. Taper « martin » trouve « Projet Atlas » quand son contexte cite
 * Claire Martin : c'est souvent la personne qu'on a en tête, pas le classeur.
 *
 * Utilisé par le sélecteur (components/TagPicker.svelte), le filtre de
 * l'historique (Sidebar) et la liste de « Mes tags » : une seule règle de
 * correspondance, sinon un tag trouvé à un endroit ne le serait pas à l'autre.
 *
 * La comparaison ignore casse et accents (« energie » trouve « Énergie »),
 * mais l'extrait rendu garde le texte tel qu'il est écrit : on replie
 * caractère par caractère en gardant la position d'origine de chacun.
 */

/** Écriture repliée d'un caractère : sans accent, en minuscules. */
const foldChar = (c) =>
  c
    .normalize('NFD')
    .replace(/[\u{0300}-\u{036f}]/gu, '')
    .toLowerCase();

/**
 * Texte replié, et pour chaque caractère replié la position du caractère
 * d'origine — un « œ » ou un « ß » ne change pas de longueur ici, mais une
 * ligature de compatibilité le pourrait.
 * @param {string} text
 * @returns {{folded: string, origin: number[]}}
 */
function foldWithOrigin(text) {
  let folded = '';
  const origin = [];
  let i = 0;
  for (const c of text) {
    const f = foldChar(c);
    for (let k = 0; k < f.length; k += 1) origin.push(i);
    folded += f;
    i += c.length;
  }
  return { folded, origin };
}

/**
 * Casse, accents et espaces neutralisés — pour comparer.
 * @param {unknown} text
 * @returns {string}
 */
export function foldText(text) {
  return foldWithOrigin(String(text ?? ''))
    .folded.replace(/\s+/g, ' ')
    .trim();
}

/** Ce qu'on garde du contexte autour du mot trouvé, en caractères. */
const BEFORE = 22;
const AFTER = 30;

/**
 * Tags qui répondent à la recherche, dans l'ordre où les montrer : ceux dont
 * le NOM la contient (ceux qui COMMENCENT par elle en premier), puis ceux
 * dont seul le contexte la contient — avec l'extrait qui le montre. Recherche
 * vide : aucun résultat (l'appelant montre alors toute la liste).
 *
 * @template {{label: string, context?: string}} T
 * @param {T[]} tags
 * @param {string} query
 * @returns {{tag: T, snippet: {before: string, match: string, after: string}|null}[]}
 */
export function searchTags(tags, query) {
  const q = foldText(query);
  if (!q) return [];
  const starts = [];
  const inside = [];
  const byContext = [];
  for (const tag of tags) {
    const label = foldText(tag.label);
    if (label.startsWith(q)) starts.push({ tag, snippet: null });
    else if (label.includes(q)) inside.push({ tag, snippet: null });
    else {
      const snippet = contextSnippet(tag.context, q);
      if (snippet) byContext.push({ tag, snippet });
    }
  }
  return [...starts, ...inside, ...byContext];
}

/**
 * L'extrait du contexte où se trouve la recherche (déjà repliée), ou `null`.
 * Les retours à la ligne y deviennent des espaces : l'extrait tient sur une
 * ligne de liste.
 */
function contextSnippet(context, q) {
  const flat = String(context || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return null;
  const { folded, origin } = foldWithOrigin(flat);
  const at = folded.indexOf(q);
  if (at === -1) return null;
  const start = origin[at];
  const end = origin[at + q.length - 1] + 1;
  // Bornes posées sur des limites de mot : « …n du siège » ne se lit pas.
  let from = Math.max(0, start - BEFORE);
  if (from > 0) {
    const space = flat.indexOf(' ', from);
    if (space !== -1 && space < start) from = space + 1;
  }
  let to = Math.min(flat.length, end + AFTER);
  if (to < flat.length) {
    const space = flat.lastIndexOf(' ', to);
    if (space > end) to = space;
  }
  return {
    before: `${from > 0 ? '…' : ''}${flat.slice(from, start)}`,
    match: flat.slice(start, end),
    after: `${flat.slice(end, to)}${to < flat.length ? '…' : ''}`,
  };
}

/**
 * Le nom tel que le serveur le compare (routes/tags.js, `labelKey`) : casse
 * et espaces neutralisés, accents GARDÉS — « Énergie » et « Energie » sont
 * deux tags pour lui. Sert à ne pas proposer « Créer « … » » quand le tag
 * existe déjà : le serveur refuserait le doublon.
 * @param {string} label
 */
export function tagLabelKey(label) {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Les tags des dernières réunions, du plus récent au plus ancien, sans
 * doublon — l'historique arrive trié par date décroissante (GET /history).
 * Un tag supprimé depuis (absent de `byId`) est sauté.
 *
 * @param {{tagId?: string|null}[]} items
 * @param {Map<string, unknown>} byId
 * @param {number} [max]
 * @returns {string[]}
 */
export function recentTagIds(items, byId, max = 3) {
  const ids = [];
  for (const item of items) {
    const id = item?.tagId;
    if (!id || ids.includes(id) || !byId.has(id)) continue;
    ids.push(id);
    if (ids.length >= max) break;
  }
  return ids;
}
