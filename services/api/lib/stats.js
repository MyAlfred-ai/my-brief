/**
 * Calcul des statistiques d'usage — fonction PURE, sans Mongo ni Fastify.
 *
 * Pourquoi en JavaScript et pas en pipeline d'agrégation Mongo : les dates de
 * `resume` sont des CHAÎNES ISO (héritage n8n, cf. routes/meetings.js) et deux
 * champs se disputent la date de la réunion (`lastConnecion`, faute historique,
 * puis `now` en repli). Un `$group` par mois demanderait un `$dateFromString`
 * tolérant aux documents sans date, illisible et intestable — le fake Mongo des
 * tests n'implémente pas `aggregate`. Le volume est de l'ordre de quelques
 * milliers de réunions par installation, projetées sur une poignée de champs
 * courts : le tri en mémoire coûte moins que la complexité qu'il évite.
 *
 * Règle de comptage : une durée ABSENTE n'est pas une durée nulle. Les réunions
 * antérieures à la persistance de `meetingDuration` (2026-08) sortent des
 * moyennes au lieu de les diluer, et `coverage` dit combien de réunions de la
 * période portent réellement une durée.
 *
 * PÉRIMÈTRE (`scope`) : un groupe, un compte, un template. Il s'applique AVANT
 * tout calcul, si bien que chaque chiffre de la réponse — indicateurs, séries,
 * tableau des comptes, période précédente — parle de la même population. Un
 * écran dont la courbe serait filtrée et pas les indicateurs se contredirait.
 *
 * ADOPTION : chaque compte reçoit un statut, du plus au moins engagé —
 * régulier (une semaine sur deux au moins), occasionnel, en sommeil (rien sur
 * la période, mais déjà utilisé), jamais démarré. Les semaines se comptent
 * depuis la création du compte quand elle tombe dans la période : un compte
 * ouvert il y a dix jours n'a pas à rattraper un trimestre.
 */
import { groupsOfUser, toUserGroup } from './repositories/groups.js';
import { zonedMidnight } from './quota.js';

/** Bornes des tranches de durée, en secondes. Ordonnées : rampe ordinale côté UI. */
export const DURATION_BUCKETS = [
  { id: 'lt15', max: 15 * 60 },
  { id: 'lt30', max: 30 * 60 },
  { id: 'lt60', max: 60 * 60 },
  { id: 'lt120', max: 120 * 60 },
  { id: 'gte120', max: Infinity },
];

/** Périodes proposées par l'écran. 0 = depuis toujours. */
export const RANGE_DAYS = [7, 30, 90, 365, 0];

/** Statuts d'adoption, du plus au moins engagé — l'ordre de la barre et de sa légende. */
export const ADOPTION_STATUSES = ['regular', 'occasional', 'dormant', 'never'];

/** Part des semaines de la période où le compte a enregistré, au-delà de laquelle il est « régulier ». */
export const REGULAR_SHARE = 0.5;

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Date de la réunion. `lastConnecion` (sic) porte la date affichée par
 * l'historique ; `lastConnection` existe sur quelques documents n8n ; `now` est
 * le dernier repli. Une date illisible rend `null` — le document est compté
 * dans les totaux mais reste hors des séries temporelles.
 */
export function meetingDate(doc) {
  const raw = doc?.lastConnecion || doc?.lastConnection || doc?.now;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Clé d'identité d'un compte, insensible à la casse (documents non backfillés inclus). */
export function ownerKey(doc) {
  return (doc?.emailLower || doc?.email || '').trim().toLowerCase();
}

/** Template d'une réunion ; `inconnu` pour un document qui n'en porte pas. */
export function templateOf(doc) {
  return (doc?.template || '').trim() || 'inconnu';
}

/**
 * La réunion a-t-elle un compte rendu ? Même lecture que les dépenses d'IA
 * (lib/costs/usage.js) : `versions` ABSENT = document d'avant les versions, qui
 * en porte un ; `versions: []` = jamais résumée.
 */
export function hasSummary(doc) {
  return !Array.isArray(doc?.versions) || doc.versions.length > 0;
}

function toSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Découpage temporel : au jour sur un mois, à la semaine sur un trimestre, au mois au-delà. */
export function granularityFor(days) {
  if (days && days <= 31) return 'day';
  if (days && days <= 180) return 'week';
  return 'month';
}

/** Lundi de la semaine ISO — le découpage hebdomadaire commence en début de semaine. */
function startOfWeek(date) {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const shift = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - shift);
  return monday;
}

const weekKey = (date) => startOfWeek(date).toISOString().slice(0, 10);

/** Semaines ISO touchées par l'intervalle, bornes comprises ; 0 s'il est vide. */
function weeksBetween(start, end) {
  if (start > end) return 0;
  return Math.round((startOfWeek(end) - startOfWeek(start)) / WEEK_MS) + 1;
}

/** Clé de compartiment (`2026-08-14` / `2026-08`), stable et triable en ordre lexical. */
function bucketKey(date, granularity) {
  const iso = date.toISOString();
  if (granularity === 'month') return iso.slice(0, 7);
  if (granularity === 'week') return weekKey(date);
  return iso.slice(0, 10);
}

function nextBucket(date, granularity) {
  const next = new Date(date.getTime());
  if (granularity === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
  else if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/**
 * Compartiments VIDES inclus, du début à la fin de la période.
 *
 * Sans ça, un graphique de réunions par jour resserre les jours actifs les uns
 * contre les autres : trois réunions en trois semaines dessinent la même courbe
 * que trois réunions en trois jours. Les trous font partie de l'information.
 */
function emptyBuckets(from, to, granularity) {
  const keys = [];
  let cursor = new Date(from.getTime());
  if (granularity === 'month')
    cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  else if (granularity === 'week') cursor = startOfWeek(from);
  else cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  // Garde-fou : une date aberrante en base (année 1970 ou 3000) produirait des
  // dizaines de milliers de points. Au-delà, on rend ce qu'on a.
  while (cursor <= to && keys.length < 400) {
    keys.push(bucketKey(cursor, granularity));
    cursor = nextBucket(cursor, granularity);
  }
  return keys;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function bucketOf(seconds) {
  return DURATION_BUCKETS.find((bucket) => seconds < bucket.max) || DURATION_BUCKETS.at(-1);
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Minuit (Paris) d'un jour `YYYY-MM-DD` réel, décalé de `shift` jours ; `null` sinon. */
function dayStart(value, shift = 0) {
  const match = ISO_DAY.exec(value || '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  // 2026-02-31 se lirait 3 mars : un jour qui n'existe pas est refusé, pas corrigé.
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value) return null;
  return zonedMidnight(year, month - 1, day + shift);
}

/**
 * La fenêtre demandée : glissante (`days`, une valeur de RANGE_DAYS), ou
 * choisie du `from` au `to` INCLUS, en jours entiers à l'heure de Paris — celle
 * du crédit de temps. `days` vaut alors la longueur de la période, qui ne règle
 * que le découpage des séries.
 *
 * @param {{days?: number, from?: string, to?: string}} query
 * @param {Date} [now]
 * @returns {{days: number, since: Date|null, until: Date|null} | {error: string}}
 */
export function statsWindow({ days, from, to } = {}, now = new Date()) {
  if (!from && !to) {
    return { days: RANGE_DAYS.includes(days) ? days : 30, since: null, until: null };
  }
  const since = dayStart(from);
  const next = dayStart(to, 1);
  if (!since || !next || since >= next || since > now) return { error: 'range_invalid' };
  const until = new Date(next.getTime() - 1);
  const end = until < now ? until : now;
  return { days: Math.max(1, Math.ceil((end - since) / DAY_MS)), since, until };
}

/**
 * Statut d'adoption d'un compte sur la période (cf. l'en-tête).
 * @param {{meetings: number, meetingsUntilEnd: number, activeWeeks: number, weeks: number}} usage
 */
export function adoptionStatus({ meetings, meetingsUntilEnd, activeWeeks, weeks }) {
  if (meetings > 0) return activeWeeks >= REGULAR_SHARE * weeks ? 'regular' : 'occasional';
  return meetingsUntilEnd > 0 ? 'dormant' : 'never';
}

/**
 * Le périmètre filtré : les comptes et les réunions qu'un groupe, un compte ou
 * un template retiennent. Les réunions d'un compte supprimé n'ont plus de
 * compte : elles comptent tant qu'aucun filtre de groupe ni de compte n'est
 * posé, et sortent dès qu'il y en a un — on ne sait plus à qui elles étaient.
 *
 * @param {{meetings?: object[], users?: object[], groups?: object[],
 *          scope?: {group?: string, user?: string, template?: string}}} input
 * @returns {{accounts: Array<{doc: object, key: string, groups: object[]}>, meetings: object[]}}
 */
export function applyScope({ meetings = [], users = [], groups = [], scope = {} }) {
  const group = scope.group || '';
  const user = (scope.user || '').trim().toLowerCase();
  const template = scope.template || '';
  const accounts = users
    .map((doc) => ({
      doc,
      key: ownerKey(doc),
      groups: groups.length ? groupsOfUser(groups, doc).map(toUserGroup) : [],
    }))
    .filter(
      (account) =>
        (!group || account.groups.some((g) => g.id === group)) && (!user || account.key === user),
    );
  const byAccount = !!(group || user);
  const keys = new Set(accounts.map((account) => account.key));
  return {
    accounts,
    meetings: meetings.filter(
      (doc) =>
        (!byAccount || keys.has(ownerKey(doc))) && (!template || templateOf(doc) === template),
    ),
  };
}

/**
 * Templates de toutes les réunions, du plus au moins choisi — les options du
 * filtre, qui ne dépendent d'aucun filtre.
 * @param {object[]} meetings
 * @returns {Array<{template: string, meetings: number}>}
 */
export function templateCounts(meetings = []) {
  const counts = new Map();
  for (const doc of meetings) counts.set(templateOf(doc), (counts.get(templateOf(doc)) || 0) + 1);
  return [...counts.entries()]
    .map(([template, count]) => ({ template, meetings: count }))
    .sort((a, b) => b.meetings - a.meetings || a.template.localeCompare(b.template));
}

/**
 * @param {object} input
 * @param {Array} input.meetings - documents `resume` projetés (dates, durée, template, propriétaire)
 * @param {Array} input.users - documents `user` (email, name, role, disabled, createdAt, lastConnecion, groupIds)
 * @param {Array} [input.groups] - le catalogue `userGroups` : groupes de chaque compte, filtre de groupe
 * @param {number} input.days - fenêtre en jours ; 0 = depuis toujours
 * @param {Date} [input.now] - « maintenant » injectable, pour des tests déterministes
 * @param {Date|null} [input.since] - début imposé (le 1er du mois de « Mes
 *   statistiques », le premier jour d'une période choisie) ; `days` ne règle
 *   alors que le découpage
 * @param {Date|null} [input.until] - fin imposée (dernier jour d'une période
 *   choisie), ramenée à `now` si elle le dépasse
 * @param {{group?: string, user?: string, template?: string}} [input.scope]
 * @returns {object} charge utile de GET /api/admin/stats
 */
export function computeUsageStats({
  meetings = [],
  users = [],
  groups = [],
  days = 30,
  now = new Date(),
  since = null,
  until = null,
  scope = {},
}) {
  const granularity = granularityFor(days);
  const to = until && until < now ? until : now;
  const { accounts: scopedAccounts, meetings: scoped } = applyScope({
    meetings,
    users,
    groups,
    scope,
  });
  const dated = scoped
    .map((doc) => ({ doc, date: meetingDate(doc) }))
    .filter((entry) => entry.date);
  const earliest = dated.reduce(
    (min, entry) => (min === null || entry.date < min ? entry.date : min),
    null,
  );
  const from = since || (days ? new Date(to.getTime() - days * DAY_MS) : earliest || to);

  // La période précédente, de même longueur, juste avant : c'est elle qui dit
  // « en hausse » ou « en baisse ». « Depuis toujours » n'en a pas.
  const span = to.getTime() - from.getTime();
  const previousWindow =
    (since || days) && span > 0 ? { from: new Date(from.getTime() - span), to: from } : null;

  const inRange = dated.filter((entry) => entry.date >= from && entry.date <= to);

  // ── Agrégats de la période ────────────────────────────────────────────────
  const durations = [];
  const chars = [];
  const byBucket = new Map(
    emptyBuckets(from, to, granularity).map((key) => [key, { meetings: 0, durationSeconds: 0 }]),
  );
  const weekdays = Array.from({ length: 7 }, () => 0);
  const byDurationBucket = new Map(DURATION_BUCKETS.map((bucket) => [bucket.id, 0]));
  const byTemplate = new Map();
  const byUser = new Map();
  let withSummary = 0;
  let withInfographic = 0;

  for (const { doc, date } of inRange) {
    const key = bucketKey(date, granularity);
    const slot = byBucket.get(key) || { meetings: 0, durationSeconds: 0 };
    slot.meetings += 1;
    byBucket.set(key, slot);

    // getDay() local : « activité du mardi » se lit dans le fuseau du serveur,
    // celui de l'organisation — pas en UTC.
    weekdays[(date.getDay() + 6) % 7] += 1;

    const seconds = toSeconds(doc.meetingDuration);
    if (seconds) {
      durations.push(seconds);
      slot.durationSeconds += seconds;
      byDurationBucket.set(bucketOf(seconds).id, byDurationBucket.get(bucketOf(seconds).id) + 1);
    }

    const size = Number(doc.transcriptionChars);
    if (Number.isFinite(size) && size > 0) chars.push(size);

    const template = templateOf(doc);
    byTemplate.set(template, (byTemplate.get(template) || 0) + 1);

    const summarized = hasSummary(doc);
    if (summarized) withSummary += 1;
    if (doc.infographic?.status === 'ready') withInfographic += 1;

    const owner = ownerKey(doc);
    if (owner) {
      const entry = byUser.get(owner) || {
        meetings: 0,
        durationSeconds: 0,
        measured: 0,
        summaries: 0,
        weeks: new Set(),
      };
      entry.meetings += 1;
      if (seconds) {
        entry.durationSeconds += seconds;
        entry.measured += 1;
      }
      if (summarized) entry.summaries += 1;
      entry.weeks.add(weekKey(date));
      byUser.set(owner, entry);
    }
  }

  // ── Période précédente ────────────────────────────────────────────────────
  const previousByUser = new Map();
  let previous = null;
  if (previousWindow) {
    const before = dated.filter(
      (entry) => entry.date >= previousWindow.from && entry.date < previousWindow.to,
    );
    const seconds = before.map((entry) => toSeconds(entry.doc.meetingDuration)).filter(Boolean);
    for (const { doc } of before) {
      const owner = ownerKey(doc);
      if (owner) previousByUser.set(owner, (previousByUser.get(owner) || 0) + 1);
    }
    const total = seconds.reduce((sum, value) => sum + value, 0);
    previous = {
      from: previousWindow.from.toISOString(),
      to: previousWindow.to.toISOString(),
      meetings: before.length,
      durationSeconds: total,
      avgDurationSeconds: seconds.length ? Math.round(total / seconds.length) : null,
      withSummary: before.filter((entry) => hasSummary(entry.doc)).length,
      activeUsers: previousByUser.size,
    };
  }

  // ── Comptes ───────────────────────────────────────────────────────────────
  // Dernière réunion TOUTES périodes confondues : un compte sans réunion depuis
  // huit mois ne doit pas ressembler à un compte créé hier. Le STATUT, lui, ne
  // regarde que jusqu'à la fin de la période : sur un mois passé, un compte qui
  // n'a démarré qu'après n'avait « jamais démarré ».
  const lastMeetingByUser = new Map();
  const meetingsByUser = new Map();
  const untilEndByUser = new Map();
  for (const { doc, date } of dated) {
    const owner = ownerKey(doc);
    if (!owner) continue;
    const known = lastMeetingByUser.get(owner);
    if (!known || date > known) lastMeetingByUser.set(owner, date);
    meetingsByUser.set(owner, (meetingsByUser.get(owner) || 0) + 1);
    if (date <= to) untilEndByUser.set(owner, (untilEndByUser.get(owner) || 0) + 1);
  }

  // Un compte créé après la fin de la période n'existait pas encore : il ne
  // compte ni parmi les comptes ouverts, ni dans l'adoption de cette période.
  const existing = scopedAccounts.filter((account) => {
    const createdAt = toDate(account.doc.createdAt);
    return !createdAt || createdAt <= to;
  });

  const rows = existing.map(({ doc: user, key: owner, groups: userGroups }) => {
    const mine = byUser.get(owner);
    const createdAt = toDate(user.createdAt);
    const weeks = weeksBetween(createdAt && createdAt > from ? createdAt : from, to);
    const usage = {
      meetings: mine?.meetings || 0,
      meetingsUntilEnd: untilEndByUser.get(owner) || 0,
      activeWeeks: mine?.weeks.size || 0,
      weeks,
    };
    const last = lastMeetingByUser.get(owner);
    return {
      email: user.email || owner,
      name: user.name || '',
      role: user.role === 'admin' ? 'admin' : 'user',
      disabled: !!user.disabled,
      groups: userGroups,
      createdAt: createdAt ? createdAt.toISOString() : null,
      lastSeenAt: user.lastConnecion || user.lastConnection || null,
      lastMeetingAt: last ? last.toISOString() : null,
      meetings: usage.meetings,
      durationSeconds: mine?.durationSeconds || 0,
      measuredMeetings: mine?.measured || 0,
      avgDurationSeconds: mine?.measured ? Math.round(mine.durationSeconds / mine.measured) : null,
      summaries: mine?.summaries || 0,
      activeWeeks: usage.activeWeeks,
      weeks,
      previousMeetings: previousWindow ? previousByUser.get(owner) || 0 : null,
      meetingsTotal: meetingsByUser.get(owner) || 0,
      status: adoptionStatus(usage),
    };
  });

  // Les comptes désactivés n'apparaissent que s'ils ont enregistré sur la
  // période (leurs réunions sont dans les totaux) ; ils sortent de l'adoption :
  // ils ne sont pas inactifs, ils sont fermés.
  const accounts = rows
    .filter((row) => !row.disabled || row.meetings > 0)
    .sort(
      (a, b) =>
        b.meetings - a.meetings ||
        b.durationSeconds - a.durationSeconds ||
        (a.name || a.email).localeCompare(b.name || b.email),
    );
  const enabled = rows.filter((row) => !row.disabled);
  const adoption = Object.fromEntries(ADOPTION_STATUSES.map((status) => [status, 0]));
  for (const row of enabled) adoption[row.status] += 1;

  if (previous) {
    // Les comptes ouverts À LA FIN de la période précédente : le taux d'adoption
    // d'alors se rapporte à eux, pas aux comptes créés depuis.
    const openThen = enabled.filter((row) => !row.createdAt || new Date(row.createdAt) < from);
    previous.enabledUsers = openThen.length;
    previous.activeAccounts = openThen.filter((row) => row.previousMeetings > 0).length;
  }

  const durationTotal = durations.reduce((sum, value) => sum + value, 0);
  const charsTotal = chars.reduce((sum, value) => sum + value, 0);

  return {
    generatedAt: now.toISOString(),
    range: {
      days,
      granularity,
      from: from.toISOString(),
      to: to.toISOString(),
      firstMeetingAt: earliest ? earliest.toISOString() : null,
    },
    // Ce qui permet à l'écran de dire « moyenne calculée sur 12 des 40 réunions »
    // plutôt que d'afficher une moyenne fausse sans le signaler.
    coverage: {
      meetingsInRange: inRange.length,
      withDuration: durations.length,
      withTranscriptionSize: chars.length,
    },
    totals: {
      meetings: scoped.length,
      meetingsInRange: inRange.length,
      durationSeconds: durationTotal,
      avgDurationSeconds: durations.length ? Math.round(durationTotal / durations.length) : null,
      medianDurationSeconds: median(durations),
      longestDurationSeconds: durations.length ? Math.max(...durations) : null,
      transcribedChars: charsTotal,
      users: scopedAccounts.length,
      activeUsers: byUser.size,
      // L'adoption se lit sur les comptes OUVERTS : actifs parmi eux, rapportés à eux.
      activeAccounts: enabled.filter((row) => row.meetings > 0).length,
      enabledUsers: enabled.length,
      newUsers: enabled.filter((row) => row.createdAt && new Date(row.createdAt) >= from).length,
      withSummary,
      withInfographic,
    },
    previous,
    adoption,
    series: [...byBucket.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => ({ key, ...value })),
    weekdays: weekdays.map((count, index) => ({ index, meetings: count })),
    durationBuckets: DURATION_BUCKETS.map((bucket) => ({
      id: bucket.id,
      count: byDurationBucket.get(bucket.id) || 0,
    })),
    templates: [...byTemplate.entries()]
      .map(([template, count]) => ({ template, meetings: count }))
      .sort((a, b) => b.meetings - a.meetings)
      .slice(0, 6),
    accounts,
  };
}
