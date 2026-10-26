/**
 * Mise en forme des mesures de l'écran Statistiques.
 *
 * Toutes les fonctions prennent la LANGUE en argument plutôt que de lire le
 * store : elles sont appelées depuis des expressions réactives Svelte, qui ne
 * suivent que les identifiants qu'elles voient. Une fonction qui lirait
 * `$currentLanguageStore` en interne ne déclencherait aucun recalcul au
 * changement de langue — le piège déjà rencontré sur les écrans Actions.
 */

import { fill } from '../../../utils/i18nFormat.js';

const localeOf = (lang) => (lang === 'en' ? 'en-US' : 'fr-FR');

/** Entier lisible : 1 284 (fr) / 1,284 (en). */
export function formatCount(value, lang) {
  return new Intl.NumberFormat(localeOf(lang)).format(Math.round(value || 0));
}

/**
 * Durée compacte. Une réunion se lit en minutes, un cumul annuel en heures :
 * le même formateur pour les deux rendrait « 8 400 min » ou « 0,3 h ».
 */
export function formatDuration(seconds, lang) {
  const total = Math.max(0, Math.round(seconds || 0));
  if (!total) return '0 min';
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (!hours) return `${minutes} min`;
  if (hours < 100) return `${formatCount(hours, lang)} h ${String(minutes).padStart(2, '0')}`;
  // Au-delà de cent heures les minutes sont du bruit.
  return `${formatCount(hours, lang)} h`;
}

/**
 * Heures d'un axe ou d'une infobulle. Une décimale SEULEMENT si elle porte de
 * l'information : arrondir 0,5 h à l'entier donnait un axe gradué « 0 / 1 / 1 »,
 * deux graduations identiques à des hauteurs différentes.
 */
export function formatHours(value, lang) {
  const rounded = Math.round((value || 0) * 10) / 10;
  return new Intl.NumberFormat(localeOf(lang), {
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
  }).format(rounded);
}

/**
 * Montant en euros, à la précision qui porte l'information : 1 284 € pour un
 * cumul, 41,20 € pour une dépense, 0,083 € pour un compte rendu — deux
 * décimales y écriraient « 0,08 € » pour 0,083 comme pour 0,076 —, 0,0021 €
 * pour un titre. `compact` arrondit à l'euro à partir de 10 € : le chiffre de
 * tête d'une estimation n'a pas de centimes à offrir. `signed` écrit un écart :
 * +1,09 € / −1,77 €.
 */
export function formatEuros(value, lang, { compact = false, signed = false } = {}) {
  const amount = Number(value) || 0;
  const size = Math.abs(amount);
  let digits = 4;
  if (size >= 100 || (compact && size >= 10)) digits = 0;
  else if (size >= 0.1 || size === 0) digits = 2;
  else if (size >= 0.01) digits = 3;
  return new Intl.NumberFormat(localeOf(lang), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
    ...(signed ? { signDisplay: 'exceptZero' } : {}),
  }).format(amount);
}

/**
 * Tarif public en dollars, tel que le fournisseur l'écrit : 0,017 $ la minute,
 * 2,50 $ le million de jetons, 15 $ — jusqu'à quatre décimales sous le dollar,
 * jamais d'arrondi qui le rendrait méconnaissable.
 */
export function formatUsd(value, lang) {
  const amount = Number(value) || 0;
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat(localeOf(lang), {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : amount >= 1 ? 2 : 4,
  }).format(amount);
}

/** Part d'un total : 63 % (fr) / 63% (en). */
export function formatPercent(ratio, lang) {
  return new Intl.NumberFormat(localeOf(lang), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio || 0);
}

/** Décimal court (taux de change, débit) : 0,8795 / 13,9. */
export function formatDecimal(value, lang, maximumFractionDigits = 4) {
  return new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits }).format(value || 0);
}

/** Volume de texte transcrit : 842 k / 1,2 M caractères. */
export function formatChars(chars, lang) {
  const value = Math.max(0, Math.round(chars || 0));
  if (value < 1000) return formatCount(value, lang);
  if (value < 1000000) return `${formatCount(Math.round(value / 1000), lang)} k`;
  const millions = value / 1000000;
  return `${new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: 1 }).format(millions)} M`;
}

/**
 * Libellé d'un compartiment de la série temporelle.
 * `key` vaut `2026-08-14` (jour, semaine) ou `2026-08` (mois) — construit côté
 * serveur en UTC, relu ici en UTC pour que le 1er du mois ne recule pas d'un
 * jour à l'ouest de Greenwich.
 */
export function formatBucket(key, granularity, lang) {
  const locale = localeOf(lang);
  if (granularity === 'month') {
    const date = new Date(`${key}-01T00:00:00Z`);
    return date.toLocaleDateString(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  const date = new Date(`${key}T00:00:00Z`);
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

/** Libellé long, pour l'infobulle : « lundi 14 août ». */
export function formatBucketLong(key, granularity, lang) {
  const locale = localeOf(lang);
  if (granularity === 'month') {
    const date = new Date(`${key}-01T00:00:00Z`);
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  const date = new Date(`${key}T00:00:00Z`);
  const label = date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return granularity === 'week' ? `${label} +6 j` : label;
}

/** Date courte d'un horodatage ISO, ou `null` si absent/illisible. */
export function formatDate(iso, lang) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(localeOf(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Nombre de jours entiers écoulés depuis `iso`, ou `null`. */
export function daysSince(iso, now = new Date()) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

/**
 * Graduations « rondes » d'un axe : 0, 5, 10 plutôt que 0, 3,67, 7,33.
 * Rend `{max, ticks}` — `max` sert aussi de dénominateur aux barres, pour que
 * la hauteur d'une colonne corresponde à la graduation qu'elle touche.
 */
export function niceScale(rawMax, tickCount = 3) {
  const max = Math.max(1, Math.ceil(rawMax || 0));
  const rough = max / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) || magnitude * 10;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = 0; value <= top + step / 2; value += step)
    ticks.push(Math.round(value * 100) / 100);
  return { max: top, ticks };
}

/** Une date sans heure se lit à midi UTC : minuit UTC la ferait reculer d'un jour à l'ouest. */
export const dayOf = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? `${value}T12:00:00Z` : value;

/**
 * Provenance des tarifs, en deux lignes : « Tarifs du 25/09/2026 (relevé
 * intégré à myBrief) » et « 1 $ = 0,8795 € (taux intégré, 25/09/2026) ».
 * L'écran Statistiques et l'onglet IA affichent les mêmes tarifs : ils le
 * disent avec les mêmes mots.
 *
 * @param {{checkedAt?: string|null, source?: string|null,
 *          fx?: {usdToEur: number, source: string, date: string}}|null} pricing
 * @param {object} t - `$uiText.adminStats.costs`
 * @param {string} lang
 * @returns {{prices: string, fx: string}} '' pour une ligne sans donnée
 */
export function pricingLines(pricing, t, lang) {
  return {
    prices: pricing?.checkedAt
      ? fill(t.pricesAsOf, {
          date: formatDate(dayOf(pricing.checkedAt), lang),
          source: t.sources[pricing.source] || pricing.source,
        })
      : '',
    fx: pricing?.fx
      ? fill(t.fxAsOf, {
          rate: formatDecimal(pricing.fx.usdToEur, lang),
          source: t.fxSources[pricing.fx.source] || pricing.fx.source,
          date: formatDate(dayOf(pricing.fx.date), lang),
        })
      : '',
  };
}
