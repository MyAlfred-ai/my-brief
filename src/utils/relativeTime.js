/**
 * Ancienneté d'un horodatage, pour une colonne qu'on parcourt des yeux :
 * « il y a 3 heures », « hier », « il y a 2 semaines », « il y a 4 mois ».
 * La date exacte va dans l'infobulle ou la fiche, pas dans la liste.
 *
 * `Intl.RelativeTimeFormat` en style LONG : le style court rend « il y a 2 m. »
 * et « il y a 3 a » en français, illisibles. `numeric: 'auto'` pour les jours
 * seulement (« hier », « avant-hier ») : sur les autres unités il produit
 * « cette minute-ci » ou « la semaine dernière », qui parlent de calendrier
 * alors qu'on compte des durées.
 *
 * Comme `admin/stats/format.js`, la langue est un ARGUMENT : ces fonctions
 * sont appelées depuis des expressions réactives Svelte, qui ne suivent que
 * les identifiants qu'elles voient.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const localeOf = (lang) => (lang === 'en' ? 'en-US' : 'fr-FR');

function toTime(iso) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * @param {string|null} iso
 * @param {string} lang 'fr' | 'en'
 * @param {number} [now] horodatage de référence (tests)
 * @returns {string|null} `null` si l'horodatage est absent ou illisible
 */
export function formatSince(iso, lang, now = Date.now()) {
  const time = toTime(iso);
  if (time === null) return null;
  const locale = localeOf(lang);
  const counted = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  const named = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  // Une horloge de poste en avance rendrait un écart négatif : « dans 2 min »
  // pour une connexion passée. On borne à zéro.
  const elapsed = Math.max(0, now - time);

  if (elapsed < HOUR) return counted.format(-Math.max(1, Math.floor(elapsed / MINUTE)), 'minute');
  if (elapsed < DAY) return counted.format(-Math.floor(elapsed / HOUR), 'hour');
  const days = Math.floor(elapsed / DAY);
  if (days < 7) return named.format(-days, 'day');
  if (days < 30) return counted.format(-Math.floor(days / 7), 'week');
  if (days < 365) return counted.format(-Math.floor(days / 30), 'month');
  return counted.format(-Math.floor(days / 365), 'year');
}

/**
 * Date et heure à la minute — « 24/09/2026 05:27 » — pour l'infobulle et la
 * fiche. Les secondes n'aident personne à juger si un compte sert encore.
 * @returns {string|null}
 */
export function formatDateTime(iso, lang) {
  const time = toTime(iso);
  if (time === null) return null;
  return new Date(time).toLocaleString(localeOf(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
