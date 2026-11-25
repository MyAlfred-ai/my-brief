/**
 * Mise en forme des données d'une infographie : nombres, dates, durées, et
 * les rapports que dessinent les graphiques. Fonctions pures — testées sans
 * navigateur (format.test.js).
 *
 * Les nombres arrivent en NOMBRES (contrat lib/infographicLayout.js côté
 * serveur) : c'est ici, et non dans le modèle, qu'ils prennent le format de la
 * langue de l'infographie — « 1 650 » en français, « 1,650 » en anglais.
 */

/** Espace fine insécable, entre un nombre et son unité en français. */
const NNBSP = '\u{202F}';

const locale = (lang) => (lang === 'en' ? 'en-GB' : 'fr-FR');

/** Nombre lisible : moins de décimales à mesure qu'il grandit. */
export function formatNumber(value, lang = 'fr') {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits })
    .format(value)
    .replace(/\s/g, NNBSP);
}

/** Nombre et unité : « 72 % » / « 72% », « 1,32 M€ » / « 1.32 M€ ». */
export function formatQuantity(value, unit = '', lang = 'fr') {
  const number = formatNumber(value, lang);
  if (!unit) return number;
  if (unit === '%' && lang === 'en') return `${number}%`;
  return `${number}${NNBSP}${unit}`;
}

/** Pourcentage arrondi d'un rapport 0..1 : « 69 % ». */
export function formatPercent(ratio, lang = 'fr') {
  return formatQuantity(Math.round(ratio * 100), '%', lang);
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * Rapport 0..1 que dessine un chiffre, selon sa forme — null si la forme n'en
 * dessine pas (valeur, évolution).
 * @param {{valeur: number, cible: number|null, unite: string, forme: string}} c
 */
export function kpiRatio(c) {
  if (!c || !Number.isFinite(c.valeur)) return null;
  if (c.forme === 'part') {
    if (c.unite === '%') return clamp01(c.valeur / 100);
    return c.cible > 0 ? clamp01(c.valeur / c.cible) : null;
  }
  if (c.forme === 'progression') return c.cible > 0 ? clamp01(c.valeur / c.cible) : null;
  return null;
}

/**
 * Échelle d'un chiffre « objectif » : la valeur et la cible placées sur une
 * même règle, qui dépasse la plus grande des deux d'un quart — ni l'une ni
 * l'autre ne touche le bord.
 */
export function objectiveScale(c) {
  const top = Math.max(c.valeur, c.cible, 0) * 1.25 || 1;
  return {
    max: top,
    valuePos: clamp01(c.valeur / top),
    targetPos: clamp01(c.cible / top),
  };
}

/** Variation d'un chiffre « évolution » depuis sa valeur précédente. */
export function evolutionOf(c) {
  const delta = c.valeur - c.precedent;
  const pct = c.precedent !== 0 ? delta / Math.abs(c.precedent) : null;
  return { delta, pct, up: delta >= 0 };
}

/** Variation signée : « +12 % », « −3 % » (vrai signe moins). */
export function formatSignedPercent(pct, lang = 'fr') {
  const rounded = Math.round(pct * 100);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '\u{2212}' : '';
  return `${sign}${formatQuantity(Math.abs(rounded), '%', lang)}`;
}

/** Date de la réunion : « 12 nov. 2026 ». Vide si illisible. */
export function formatMeetingDate(iso, lang = 'fr') {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Durée : « 45 min », « 1 h 20 ». Vide si inconnue. */
export function formatDuration(seconds, lang = 'fr') {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}${NNBSP}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!m) return `${h}${NNBSP}h`;
  return lang === 'en'
    ? `${h}${NNBSP}h${NNBSP}${m}${NNBSP}min`
    : `${h}${NNBSP}h${NNBSP}${String(m).padStart(2, '0')}`;
}

/**
 * Échéance d'une action : une date ISO devient « 20 nov. » ; un texte libre
 * (« fin du mois ») passe tel quel.
 */
export function formatDue(raw, lang = 'fr') {
  const text = String(raw || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!m) return text;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Idées mises en avant d'un atelier : celles que le modèle a retenues, puis
 * les plus votées, sans doublon, `limit` au plus.
 * @param {Array<{theme: string, idees: Array<{texte: string, votes: number|null, retenue: boolean}>}>} themes
 */
export function topIdeas(themes, limit = 3) {
  const all = (Array.isArray(themes) ? themes : []).flatMap((t) =>
    (t.idees || []).map((idee) => ({ ...idee, theme: t.theme })),
  );
  const score = (i) => (i.retenue ? 1e6 : 0) + (Number.isFinite(i.votes) ? i.votes : 0);
  const ranked = all
    .filter((i) => i.retenue || (Number.isFinite(i.votes) && i.votes > 0))
    .sort((a, b) => score(b) - score(a));
  return ranked.slice(0, limit);
}

/** Choisit le libellé au singulier ou au pluriel. */
export function plural(count, one, many) {
  return count === 1 ? one : many;
}

/**
 * La valeur du bandeau se dessine-t-elle en anneau ? Oui pour une part
 * lisible telle quelle — « 94 % », « 8/10 » —, jamais pour une variation
 * signée (« +12 % » n'est pas 12 % d'un tout). Rapport 0..1, ou null.
 */
export function heroRatio(valeur) {
  const text = String(valeur || '').trim();
  const num = (v) => Number(v.replace(',', '.'));
  const pct = /^(\d+(?:[.,]\d+)?)\s*%$/.exec(text);
  if (pct) return clamp01(num(pct[1]) / 100);
  const frac = /^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/.exec(text);
  if (frac && num(frac[2]) > 0) return clamp01(num(frac[1]) / num(frac[2]));
  return null;
}
