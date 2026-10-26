/**
 * Mise en mots du quota de minutes : durées et mois de renouvellement.
 *
 * Les gabarits viennent du dictionnaire (`uiText.quota`), FR et EN : « 1 h 12 »
 * se lit en français, « 1 h 12 min » en anglais, et ce fichier n'a pas à le
 * savoir. Le nom du mois vient d'`Intl`, dans la langue de l'interface, et dans
 * le fuseau du quota, `period.timeZone` — l'heure de Paris, cf.
 * services/api/lib/quota.js. Les bornes sont des instants UTC : celle du
 * 1er octobre à minuit à Paris est le 30 septembre à 22 h UTC, et se lirait
 * « septembre » en UTC comme sur un poste réglé plus à l'ouest.
 */

import { fill } from './i18nFormat.js';

/**
 * « 45 min », « 2 h », « 1 h 05 » — selon les gabarits `minutesOnly`,
 * `hoursOnly`, `hoursMinutes` du dictionnaire.
 * @param {number|null|undefined} minutes
 * @param {{minutesOnly: string, hoursOnly: string, hoursMinutes: string}} texts
 * @returns {string} chaîne vide si la valeur n'est pas un nombre
 */
export function formatMinutes(minutes, texts) {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  const whole = Math.floor(minutes);
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return fill(texts.minutesOnly, { m });
  if (m === 0) return fill(texts.hoursOnly, { h });
  return fill(texts.hoursMinutes, { h, m: String(m).padStart(2, '0') });
}

const LOCALES = { fr: 'fr-FR', en: 'en-GB' };

/**
 * Le nom du mois d'une date ISO, dans la langue de l'interface.
 * @param {string|null|undefined} iso
 * @param {string} lang - 'fr' | 'en'
 * @param {{capitalize?: boolean, timeZone?: string}} [opts] - fuseau : UTC par défaut
 * @returns {string} chaîne vide si la date est illisible
 */
export function monthLabel(iso, lang = 'fr', { capitalize = false, timeZone = 'UTC' } = {}) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const label = new Intl.DateTimeFormat(LOCALES[lang] || LOCALES.fr, {
    month: 'long',
    timeZone,
  }).format(date);
  return capitalize ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

/**
 * Les deux mois d'une période de quota, dans son fuseau : celui en cours
 * (« Septembre », en tête du compteur) et celui du renouvellement (« octobre »).
 * Sans fuseau — un serveur d'avant l'heure de Paris —, UTC, le calendrier
 * qu'il appliquait alors.
 * @param {{start?: string, end?: string, timeZone?: string}|null|undefined} period
 * @param {string} lang - 'fr' | 'en'
 * @returns {{current: string, renewal: string}}
 */
export function periodMonths(period, lang = 'fr') {
  const timeZone = period?.timeZone || 'UTC';
  return {
    current: monthLabel(period?.start, lang, { capitalize: true, timeZone }),
    renewal: monthLabel(period?.end, lang, { timeZone }),
  };
}

/**
 * Un jour du calendrier du crédit : « 20 octobre » (`month: 'short'` :
 * « 20 oct. »). Accepte un instant ISO, lu dans `timeZone` — une prévision
 * d'épuisement à 23 h UTC tombe le lendemain à Paris —, ou un jour civil
 * `2026-10-09` déjà calculé à l'heure de Paris par le serveur, rendu tel quel.
 * @param {string|null|undefined} value
 * @param {string} lang - 'fr' | 'en'
 * @param {{timeZone?: string, month?: 'long'|'short'}} [options]
 */
export function formatDay(value, lang = 'fr', { timeZone = 'UTC', month = 'long' } = {}) {
  if (!value) return '';
  const civil = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(civil ? `${value}T12:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALES[lang] || LOCALES.fr, {
    day: 'numeric',
    month,
    timeZone: civil ? 'UTC' : timeZone,
  }).format(date);
}

/** Jour civil (`2026-10-12`) d'un instant à l'heure de `timeZone`. */
export function civilDay(date, timeZone = 'UTC') {
  // en-CA écrit les dates à l'ISO : AAAA-MM-JJ.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
