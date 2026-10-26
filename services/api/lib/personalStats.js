/**
 * « Mes statistiques » — l'usage d'UN compte et son crédit de temps du mois.
 *
 * La même page sert l'utilisateur (GET /api/stats/me) et l'administrateur qui
 * ouvre le compte d'un collègue depuis Administration → Crédit de temps
 * (GET /api/admin/stats/account) : une seule fonction, pour que les deux ne
 * puissent pas montrer des chiffres différents.
 *
 * Des VOLUMES, jamais de contenu : nombres, durées, jours, noms de modèles. Ni
 * titre, ni participant, ni texte — un administrateur qui regarde le compte
 * d'un collègue ne lit rien de ce qui s'est dit. D'où la projection stricte.
 *
 * Le calcul d'usage est celui des statistiques d'administration
 * (lib/stats.js), restreint aux réunions du compte par `ownerFilter`. La
 * période « Ce mois » est le mois CIVIL du crédit (lib/quota.js) et non trente
 * jours glissants : la jauge et les chiffres sous elle parlent du même mois.
 */
import { ownerFilter } from './ownerScope.js';
import { computeUsageStats, meetingDate } from './stats.js';
import { currentPeriod } from './quota.js';

/** Périodes proposées par l'écran : le mois du crédit, puis des fenêtres glissantes. */
export const PERSONAL_RANGES = ['month', '90', '365', 'all'];

/** Champs comptés — rien du contenu de la réunion (cf. l'en-tête). */
const MEETING_FIELDS = {
  _id: 0,
  lastConnecion: 1,
  lastConnection: 1,
  now: 1,
  meetingDuration: 1,
  transcriptionChars: 1,
  template: 1,
  'versions.generatedAt': 1,
};

const LABEL_FIELDS = { _id: 0, value: 1, labels: 1 };

/** Fenêtre d'une période : `days` règle le découpage, `since` impose le début. */
export function rangeWindow(range, period) {
  if (range === '90') return { days: 90, since: null };
  if (range === '365') return { days: 365, since: null };
  if (range === 'all') return { days: 0, since: null };
  return { days: 31, since: new Date(period.start) };
}

/**
 * Comptes rendus des réunions de la période, et combien sont des
 * régénérations. Même lecture que les dépenses d'IA (lib/costs/usage.js) :
 * `versions` absent = document d'avant les versions, un compte rendu ;
 * `versions: []` = jamais résumée.
 */
export function summaryCounts(meetings) {
  let count = 0;
  let regenerated = 0;
  for (const doc of meetings) {
    const versions = Array.isArray(doc.versions) ? doc.versions.length : 1;
    count += versions;
    regenerated += Math.max(0, versions - 1);
  }
  return { count, regenerated };
}

/**
 * Libellés des modèles, par valeur : ceux de l'organisation, puis ceux du
 * compte, qui les recouvrent (même ordre que le choix du modèle à l'écran). Les
 * modèles fournis par le code n'ont pas de document : l'écran les nomme.
 */
export function labelsByTemplate(orgTemplates, userTemplates) {
  const labels = new Map();
  for (const doc of [...orgTemplates, ...userTemplates]) {
    if (doc?.value && doc.labels && typeof doc.labels === 'object') {
      labels.set(doc.value, { fr: doc.labels.fr || doc.value, en: doc.labels.en || doc.value });
    }
  }
  return labels;
}

/**
 * Partie PURE : réunions du compte → charge utile (sans le crédit).
 * @param {{meetings: object[], labels: Map, range: string, period: object, now: Date}} input
 */
export function computePersonalStats({ meetings, labels = new Map(), range, period, now }) {
  const { days, since } = rangeWindow(range, period);
  const usage = computeUsageStats({ meetings, users: [], days, since, now });
  const from = new Date(usage.range.from);
  const inRange = meetings.filter((doc) => {
    const date = meetingDate(doc);
    return date && date >= from && date <= now;
  });
  const summaries = summaryCounts(inRange);
  return {
    range,
    granularity: usage.range.granularity,
    from: usage.range.from,
    to: usage.range.to,
    firstMeetingAt: usage.range.firstMeetingAt,
    coverage: usage.coverage,
    totals: {
      meetings: usage.totals.meetingsInRange,
      meetingsAllTime: usage.totals.meetings,
      durationSeconds: usage.totals.durationSeconds,
      avgDurationSeconds: usage.totals.avgDurationSeconds,
      medianDurationSeconds: usage.totals.medianDurationSeconds,
      longestDurationSeconds: usage.totals.longestDurationSeconds,
      summaries: summaries.count,
      regenerated: summaries.regenerated,
    },
    series: usage.series,
    weekdays: usage.weekdays,
    durationBuckets: usage.durationBuckets,
    templates: usage.templates.map((row) => ({
      ...row,
      labels: labels.get(row.template) || null,
    })),
  };
}

/**
 * Lecture + calcul + crédit du mois.
 * @param {{db: object, quota: object}} deps
 * @param {{email: string, doc?: object|null}} identity - le compte regardé
 * @param {string} range - une valeur de `PERSONAL_RANGES`
 * @param {Date} [now]
 */
export async function personalStats({ db, quota }, identity, range, now = new Date()) {
  const email = identity.doc?.email || identity.email;
  const [meetings, orgTemplates, userTemplates, credit] = await Promise.all([
    db.collection('resume').find(ownerFilter(email)).project(MEETING_FIELDS).toArray(),
    db.collection('templates').find({}).project(LABEL_FIELDS).toArray(),
    db.collection('userTemplates').find(ownerFilter(email)).project(LABEL_FIELDS).toArray(),
    quota.creditFor(identity, now),
  ]);
  return {
    ...computePersonalStats({
      meetings,
      labels: labelsByTemplate(orgTemplates, userTemplates),
      range,
      period: currentPeriod(now),
      now,
    }),
    credit,
  };
}
