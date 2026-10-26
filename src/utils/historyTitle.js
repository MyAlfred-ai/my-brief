/**
 * Titre affichable d'une réunion d'historique.
 *
 * Pourquoi ce n'est pas juste `item.title` : l'ancien backend (n8n) renvoyait
 * un titre déjà replié, et son repli était fautif —
 *
 *   title: d.title || d.name || 'Réunion'
 *
 * `name` est le nom de l'UTILISATEUR, pas un titre de réunion : il est stocké
 * dans le document `resume` à côté de `email`. Les réunions antérieures au
 * nœud « Add title field » (qui génère un vrai titre par IA) n'ont pas de
 * `title` ; elles héritaient donc toutes du nom du compte, et l'historique
 * affichait la même ligne répétée — « Mybrief MyAlfred », « Mybrief MyAlfred »…
 *
 * On détecte ce cas (titre identique au nom du compte) et on retombe sur un
 * libellé daté, qui distingue au moins les réunions entre elles.
 */

/**
 * Titre de repli posé par le backend à l'insertion, le temps que la génération
 * IA aboutisse (services/api/lib/prompts.js, UNTITLED_MEETING). Il ne dit rien
 * de la réunion et ne distingue pas deux lignes de la liste : quand il survit
 * (génération en échec), on préfère le libellé daté, comme pour l'ancien repli
 * fautif sur le nom du compte.
 */
const BACKEND_UNTITLED = 'Réunion sans titre';

/**
 * Première date exploitable d'un item d'historique.
 * `lastConnecion` (sans le second « n ») est la faute de frappe d'origine, encore
 * présente en base et dans les insertions du backend : la garder en premier.
 * @param {Object} item
 * @returns {Date|null}
 */
export function historyItemDate(item) {
  const raw = item?.lastConnecion || item?.lastConnection || item?.now;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Libellé de repli daté, sans dépendance à la locale de l'hôte (les tests et
 * les navigateurs ne s'accordent pas sur toLocaleDateString).
 *
 * L'HEURE fait partie du libellé, et pas par coquetterie : depuis que la
 * réunion est créée au démarrage de l'enregistrement, plusieurs réunions du
 * même jour attendent leur premier résumé côte à côte dans l'historique. Un
 * repli à la seule date les rendrait indiscernables.
 *
 * Lecture en heure LOCALE : c'est l'heure à laquelle l'utilisateur se souvient
 * d'avoir tenu la réunion, pas celle du serveur.
 *
 * @param {Date|null} date
 * @param {string} lang
 * @returns {string}
 */
function datedFallback(date, lang) {
  if (!date) return lang === 'en' ? 'Meeting' : 'Réunion';
  const stamp =
    `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return lang === 'en' ? `Meeting ${stamp}` : `Réunion ${stamp}`;
}

/**
 * Titre à afficher pour une réunion d'historique.
 *
 * @param {Object} item - item d'historique tel que renvoyé par /history
 * @param {string} [lang] - 'fr' | 'en'
 * @returns {string}
 */
export function resolveHistoryTitle(item, lang = 'fr') {
  if (!item) return lang === 'en' ? 'Meeting' : 'Réunion';
  if (typeof item === 'string') return item;

  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const accountName = typeof item.name === 'string' ? item.name.trim() : '';

  // Titre réel : présent, et ni le repli sur le nom du compte ni celui du
  // backend en attente de génération.
  if (title && title !== BACKEND_UNTITLED && (!accountName || title !== accountName)) return title;

  return datedFallback(historyItemDate(item), lang);
}

/**
 * Titre d'une ligne d'historique dans la MODALE mobile.
 *
 * Distinct de `resolveHistoryTitle`, qui sert la liste principale : celui-ci
 * accepte les formes héritées que la modale peut encore rencontrer (`filename`,
 * `label`, `id`) et retombe sur un numéro d'ordre plutôt que sur une date.
 * Les fusionner rendrait l'un des deux comportements muet.
 *
 * `fallbackLabel` est injecté plutôt que traduit ici : ce module ne connaît pas
 * le store de langue, et c'est ce qui le garde pur et testable en table.
 *
 * @param {Object|string|null} item
 * @param {number} index - position dans la liste, base 0
 * @param {string} fallbackLabel - libellé traduit, ex. « Réunion »
 * @returns {string}
 */
export function formatHistoryItemTitle(item, index, fallbackLabel = 'Réunion') {
  const numbered = `${fallbackLabel} #${index + 1}`;
  if (!item) return numbered;
  if (typeof item === 'string') return item;

  // ⚠️ Le repli « email + template » exige les DEUX champs. L'écriture d'origine
  // était `item.email + ' ' + item.template` au milieu d'une chaîne de `||` :
  // `+` lie plus fort que `||`, donc deux champs absents produisaient la chaîne
  // « undefined undefined » — truthy. Tous les replis suivants (filename,
  // label, id, now, numéro) étaient donc INATTEIGNABLES, et la modale mobile
  // affichait « undefined undefined » pour toute réunion sans titre.
  const pair = item.email && item.template ? `${item.email} ${item.template}` : '';

  return item.title || pair || item.filename || item.label || item.id || item.now || numbered;
}

/**
 * Ligne secondaire d'une réunion : sa date, à défaut sa durée, à défaut rien.
 *
 * @param {Object|string|null} item
 * @param {string} [lang] - 'fr' | 'en'
 * @returns {string}
 */
export function formatHistoryItemMeta(item, lang = 'fr') {
  if (!item || typeof item === 'string') return '';
  const dateValue = item.lastConnecion || item.now;
  if (dateValue) {
    const date = new Date(dateValue);
    if (!isNaN(date)) return date.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
  }
  if (item.duration) return `${item.duration}`;
  return '';
}
