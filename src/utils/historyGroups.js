/**
 * Groupes de l'historique de la sidebar : « Cette semaine », « Semaine
 * dernière », puis un groupe par mois — « septembre 2026 ».
 *
 * Calculés ICI, dans la langue et le fuseau du lecteur. /history renvoie bien
 * un `weekLabel`, mais rédigé en français et dans le fuseau du serveur :
 * l'interface anglaise affichait « Cette semaine » et « septembre 2026 ». Les
 * bornes reprennent celles du serveur (services/api/routes/meetings.js) : des
 * jours glissants, pas des semaines calendaires.
 *
 * Le groupe porte une CLÉ stable, distincte de son libellé : l'état replié
 * d'un groupe, indexé sur la clé, survit au changement de langue.
 */
import { historyItemDate } from './historyTitle.js';

const DAY_MS = 86_400_000;
const LOCALES = { fr: 'fr-FR', en: 'en-GB' };

/**
 * @param {Object} item - item d'historique tel que renvoyé par /history
 * @param {Date} [now]
 * @returns {string} 'this-week' | 'last-week' | 'AAAA-MM'
 */
export function historyGroupKey(item, now = new Date()) {
  const date = historyItemDate(item);
  // Sans date lisible : avec les réunions récentes, comme le repli d'avant.
  if (!date) return 'this-week';
  const diffDays = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  if (diffDays < 7) return 'this-week';
  if (diffDays < 14) return 'last-week';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * @param {string} key - clé rendue par historyGroupKey
 * @param {string} lang - 'fr' | 'en'
 * @param {{groupThisWeek: string, groupLastWeek: string}} texts - $uiText.sidebar
 * @returns {string}
 */
export function historyGroupLabel(key, lang, texts) {
  if (key === 'this-week') return texts.groupThisWeek;
  if (key === 'last-week') return texts.groupLastWeek;
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALES[lang] || LOCALES.fr, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

/**
 * Regroupe dans l'ordre d'ARRIVÉE : /history trie déjà par date affichée, le
 * premier groupe rencontré est donc le plus récent.
 *
 * @param {Object[]} items
 * @param {string} lang
 * @param {{groupThisWeek: string, groupLastWeek: string}} texts
 * @param {Date} [now]
 * @returns {{key: string, label: string, meetings: Object[]}[]}
 */
export function groupHistory(items, lang, texts, now = new Date()) {
  const groups = new Map();
  for (const item of items) {
    const key = historyGroupKey(item, now);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups].map(([key, meetings]) => ({
    key,
    label: historyGroupLabel(key, lang, texts),
    meetings,
  }));
}
