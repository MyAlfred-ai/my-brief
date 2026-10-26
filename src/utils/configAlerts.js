/**
 * Constats du diagnostic → pastilles affichables.
 *
 * Le serveur rend des codes (`{ section, code, level, vars }`, cf.
 * services/api/lib/configChecks.js) ; l'écran veut, par entrée de menu, UNE
 * couleur (le plus grave de ses constats) et les phrases à mettre dans la
 * bulle. Fonctions pures, la langue arrive avec le dictionnaire.
 */

/** Du plus grave au plus léger. */
export const ALERT_LEVELS = ['error', 'warning', 'tip'];

const rank = (level) => {
  const index = ALERT_LEVELS.indexOf(level);
  return index === -1 ? ALERT_LEVELS.length : index;
};

/**
 * Phrase d'un constat. Un code inconnu (serveur plus récent que la page)
 * prend la phrase générique plutôt que d'afficher son code.
 *
 * @param {{code: string, vars?: object}} issue
 * @param {object} texts - `uiText.configChecks`
 */
export function alertText(issue, texts) {
  const template = texts?.issues?.[issue.code] || texts?.unknown || issue.code;
  return Object.entries(issue.vars || {}).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value ?? '')),
    template,
  );
}

/**
 * Une pastille : sa couleur (le plus grave) et ses lignes, les plus graves
 * d'abord. `null` quand il n'y a rien à dire — l'entrée n'en porte pas.
 *
 * @param {Array<{level: string, code: string, vars?: object}>} issues
 * @param {object} texts - `uiText.configChecks`
 * @returns {{level: string, items: Array<{level: string, text: string}>}|null}
 */
export function alertOf(issues, texts) {
  if (!issues?.length) return null;
  const sorted = [...issues].sort((a, b) => rank(a.level) - rank(b.level));
  return {
    level: sorted[0].level,
    items: sorted.map((issue) => ({ level: issue.level, text: alertText(issue, texts) })),
  };
}

/**
 * Pastille de chaque section : `{ ai: {level, items}, … }`.
 * @returns {Record<string, {level: string, items: Array<{level: string, text: string}>}>}
 */
export function alertsBySection(issues, texts) {
  const grouped = {};
  for (const issue of issues || []) (grouped[issue.section] ||= []).push(issue);
  return Object.fromEntries(
    Object.entries(grouped).map(([section, list]) => [section, alertOf(list, texts)]),
  );
}

/**
 * Pastille RÉCAPITULATIVE d'un bouton qui ouvre un panneau (roue crantée,
 * bouclier) : tous les constats du périmètre, dans une bulle bornée — au-delà
 * de `max` lignes, une ligne « + N autres » renvoie au panneau, où chaque
 * section porte les siens.
 *
 * @param {Array<{level: string, code: string, vars?: object}>} issues
 * @param {object} texts - `uiText.configChecks`
 * @param {{title?: string, max?: number}} [options]
 * @returns {{level: string, items: Array<{level: string, text: string}>, title: string,
 *   more: string}|null}
 */
export function summaryAlert(issues, texts, { title = '', max = 4 } = {}) {
  const alert = alertOf(issues, texts);
  if (!alert) return null;
  const hidden = alert.items.length - max;
  return {
    ...alert,
    items: alert.items.slice(0, max),
    title,
    more: hidden > 0 ? String(texts?.more || '').replace('{count}', String(hidden)) : '',
  };
}

/**
 * Plusieurs pastilles déjà composées → une seule : le bouton d'un menu qui
 * regroupe des entrées pastillées (déroulant des sections sur mobile).
 *
 * @param {Array<{level: string, items: Array<{level: string, text: string}>}|null>} alerts
 * @returns {{level: string, items: Array<{level: string, text: string}>}|null}
 */
export function mergeAlerts(alerts) {
  const items = (alerts || [])
    .flatMap((alert) => alert?.items || [])
    .sort((a, b) => rank(a.level) - rank(b.level));
  return items.length ? { level: items[0].level, items } : null;
}
