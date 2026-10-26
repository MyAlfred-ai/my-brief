/**
 * Lectures des statistiques d'administration communes à l'ÉCRAN et au RAPPORT
 * PDF : écarts à la période précédente, description de la période et du
 * périmètre, tri et export du tableau par utilisateur.
 *
 * Une seule source pour les deux : un rapport qui dirait « +12 % » là où
 * l'écran dit « +11 % », ou « Groupe Ventes » là où l'écran dit « Ventes »,
 * ferait douter des deux. Fonctions pures, la langue et les textes en
 * arguments (cf. l'en-tête de format.js).
 */
import { templateMap } from '../../../config/templates.js';
import { fill } from '../../../utils/i18nFormat.js';
import { dayOf, formatCount, formatDate, formatPercent } from './format.js';

/** Ordre des statuts d'adoption, du plus au moins engagé (cf. services/api/lib/stats.js). */
export const ADOPTION_STATUSES = ['regular', 'occasional', 'dormant', 'never'];

/** Jetons de couleur de chaque statut (styles/tokens.css). */
export const ADOPTION_COLORS = {
  regular: 'var(--adopt-regular)',
  occasional: 'var(--adopt-occasional)',
  dormant: 'var(--adopt-dormant)',
  never: 'var(--adopt-never)',
};

const localeOf = (lang) => (lang === 'en' ? 'en-US' : 'fr-FR');

/** Nom affichable d'un compte : le nom s'il existe, l'adresse sinon. */
export const accountName = (account) => account?.name || account?.email || '';

/**
 * Nom d'un template : celui que l'organisation (ou le compte) lui a donné, puis
 * celui du code, puis sa valeur. `inconnu` = réunion sans template.
 */
export function templateName(row, lang, unknown) {
  if (row.template === 'inconnu') return unknown;
  return row.labels?.[lang] || templateMap[row.template]?.labels?.[lang] || row.template;
}

/**
 * Écart d'une mesure à la période précédente.
 * @returns {{direction: 'up'|'down'|'flat'|'new', ratio: number|null}|null}
 *   null quand il n'y a rien à comparer (pas de période précédente, ou zéro des deux côtés)
 */
export function deltaOf(current, previous) {
  if (previous === null || previous === undefined || current === null || current === undefined)
    return null;
  if (!previous) return current ? { direction: 'new', ratio: null } : null;
  const ratio = (current - previous) / previous;
  if (Math.abs(ratio) < 0.005) return { direction: 'flat', ratio: 0 };
  return { direction: ratio > 0 ? 'up' : 'down', ratio };
}

/** Écart d'un TAUX, en points : 42 % → 50 % = +8 pt. */
export function pointsDeltaOf(current, previous) {
  if (current === null || previous === null || current === undefined || previous === undefined)
    return null;
  const points = Math.round((current - previous) * 100);
  if (!points) return { direction: 'flat', points: 0 };
  return { direction: points > 0 ? 'up' : 'down', points };
}

/** « +12 % », « −8 % », « Nouveau », « = ». */
export function formatDelta(delta, lang, texts) {
  if (!delta) return '';
  if (delta.direction === 'new') return texts.deltaNew;
  if ('points' in delta) {
    return fill(texts.deltaPoints, {
      value: new Intl.NumberFormat(localeOf(lang), { signDisplay: 'exceptZero' }).format(
        delta.points,
      ),
    });
  }
  return new Intl.NumberFormat(localeOf(lang), {
    style: 'percent',
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  }).format(delta.ratio);
}

/** Taux d'adoption : comptes ouverts actifs, rapportés aux comptes ouverts. */
export function adoptionRate(active, enabled) {
  return enabled ? active / enabled : null;
}

/**
 * Libellé de la période : « 30 jours », ou « du 01/09/2026 au 30/09/2026 ».
 * @param {{days: number|null, from?: string|null, to?: string|null}} applied
 */
export function rangeLabelOf(applied, texts, lang) {
  if (applied?.from && applied?.to) {
    return fill(texts.customRangeLabel, {
      from: formatDate(dayOf(applied.from), lang),
      to: formatDate(dayOf(applied.to), lang),
    });
  }
  return texts.ranges[String(applied?.days ?? 30)] || '';
}

/** Bornes réelles de la période, en dates : « 19/07/2026 – 18/08/2026 ». */
export function rangeDatesOf(range, lang) {
  if (!range?.from || !range?.to) return '';
  return `${formatDate(range.from, lang)} – ${formatDate(range.to, lang)}`;
}

/**
 * Le périmètre en mots, un morceau par filtre posé — « Toute l'organisation »
 * sans filtre. Un filtre dont l'option a disparu (groupe supprimé) se dit par
 * son identifiant plutôt que de disparaître : le chiffre affiché en dépend.
 */
export function scopePartsOf(applied, options, texts, lang) {
  const parts = [];
  if (applied?.group) {
    const group = options?.groups?.find((g) => g.id === applied.group);
    parts.push(fill(texts.scopeGroup, { name: group?.name || applied.group }));
  }
  if (applied?.user) {
    const user = options?.users?.find((u) => u.email.toLowerCase() === applied.user);
    parts.push(accountName(user) || applied.user);
  }
  if (applied?.template) {
    const row = options?.templates?.find((t) => t.template === applied.template) || {
      template: applied.template,
    };
    parts.push(fill(texts.scopeTemplate, { name: templateName(row, lang, texts.templateUnknown) }));
  }
  return parts.length ? parts : [texts.everyone];
}

// ── Tableau par utilisateur ─────────────────────────────────────────────────

const STATUS_RANK = Object.fromEntries(ADOPTION_STATUSES.map((status, index) => [status, index]));
const time = (iso) => (iso ? Date.parse(iso) : -Infinity);
const regularity = (row) => (row.weeks ? Math.min(1, row.activeWeeks / row.weeks) : 0);

/** Valeur de tri de chaque colonne triable. */
export const SORT_KEYS = {
  name: (row) => accountName(row).toLocaleLowerCase(),
  // Le statut, puis la régularité dans le statut : la colonne les montre ensemble.
  status: (row) => (STATUS_RANK[row.status] ?? 99) - regularity(row),
  meetings: (row) => row.meetings,
  durationSeconds: (row) => row.durationSeconds,
  avgDurationSeconds: (row) => row.avgDurationSeconds ?? -1,
  summaries: (row) => row.summaries,
  lastMeetingAt: (row) => time(row.lastMeetingAt),
};

/**
 * Tri du tableau. À égalité, le plus actif d'abord puis le nom : l'ordre ne
 * bouge pas d'un rechargement à l'autre.
 * @param {object[]} rows
 * @param {keyof SORT_KEYS} key
 * @param {'asc'|'desc'} direction
 */
export function sortAccounts(rows, key, direction) {
  const value = SORT_KEYS[key] || SORT_KEYS.meetings;
  const sign = direction === 'asc' ? 1 : -1;
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...rows].sort(
    (a, b) =>
      sign * compare(value(a), value(b)) ||
      b.meetings - a.meetings ||
      accountName(a).localeCompare(accountName(b)),
  );
}

/** Recherche dans le nom, l'adresse et les groupes, sans égard aux accents. */
export function matchesQuery(row, query) {
  const fold = (text) =>
    String(text || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
  const wanted = fold(query).trim();
  if (!wanted) return true;
  return [row.name, row.email, ...(row.groups || []).map((g) => g.name)].some((field) =>
    fold(field).includes(wanted),
  );
}

/** Répartition des statuts : `{status, count, share}` dans l'ordre de la légende. */
export function adoptionItems(adoption) {
  const total = ADOPTION_STATUSES.reduce((sum, status) => sum + (adoption?.[status] || 0), 0);
  return ADOPTION_STATUSES.map((status) => ({
    status,
    count: adoption?.[status] || 0,
    share: total ? (adoption?.[status] || 0) / total : 0,
  }));
}

/** Part des comptes réguliers, déjà formatée (« 45 % ») ; '' sans compte. */
export function regularShareOf(adoption, lang) {
  const items = adoptionItems(adoption);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return total ? formatPercent(items[0].count / total, lang) : '';
}

/**
 * Le tableau par utilisateur en CSV, pour un tableur : séparateur `;` en
 * français (celui qu'attend Excel réglé en français, où la virgule est
 * décimale), `,` en anglais ; durées en MINUTES entières, dates en ISO
 * `AAAA-MM-JJ` — des valeurs qu'un tableur sait trier et additionner, pas des
 * libellés d'écran. BOM UTF-8 en tête : sans lui, Excel lit les accents en
 * Windows-1252.
 */
export function accountsCsv(rows, texts, lang) {
  const separator = lang === 'en' ? ',' : ';';
  const cell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /["\n\r;,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const minutes = (seconds) => (seconds ? Math.round(seconds / 60) : seconds === null ? '' : 0);
  const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
  const c = texts.csv;
  const header = [
    c.name,
    c.email,
    c.groups,
    c.status,
    c.meetings,
    c.previous,
    c.minutes,
    c.avgMinutes,
    c.activeWeeks,
    c.weeks,
    c.summaries,
    c.lastMeeting,
    c.lastSeen,
    c.total,
  ];
  const lines = rows.map((row) => [
    row.name,
    row.email,
    (row.groups || []).map((g) => g.name).join(', '),
    row.disabled ? texts.disabledBadge : texts.statusLabels[row.status],
    row.meetings,
    row.previousMeetings ?? '',
    minutes(row.durationSeconds),
    minutes(row.avgDurationSeconds),
    row.activeWeeks,
    row.weeks,
    row.summaries,
    day(row.lastMeetingAt),
    day(row.lastSeenAt),
    row.meetingsTotal,
  ]);
  return `\u{FEFF}${[header, ...lines].map((line) => line.map(cell).join(separator)).join('\r\n')}\r\n`;
}

/** « 3/6 sem. » et sa phrase longue. */
export function regularityOf(row, texts) {
  const values = { active: row.activeWeeks, weeks: row.weeks };
  return {
    short: fill(texts.regularity, values),
    long: fill(texts.regularityTitle, values),
  };
}

/** « 12 » réunions, et son écart au compte précédent. */
export function trendOf(row, lang, texts) {
  const delta = deltaOf(row.meetings, row.previousMeetings);
  return {
    delta,
    text: formatDelta(delta, lang, texts),
    title:
      row.previousMeetings === null || row.previousMeetings === undefined
        ? ''
        : fill(texts.trendTitle, { count: formatCount(row.previousMeetings, lang) }),
  };
}
