/**
 * Quota de minutes de réunion par groupe : ce qu'un compte peut encore
 * enregistrer ce mois-ci.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 * Chaque groupe porte `meetingMinutesPerMonth` (cf. lib/repositories/groups.js) :
 * des minutes PAR PERSONNE et PAR MOIS, ou `null` pour « illimité ». Un compte
 * hérite du quota le plus généreux de ses groupes : être ajouté à un groupe ne
 * retire jamais de minutes, et « illimité » l'emporte. L'alternative (le plus
 * restrictif, ou le premier groupe) rendait l'appartenance à un second groupe
 * imprévisible, pour l'utilisateur comme pour l'administrateur.
 *
 * ── Ce qui compte ────────────────────────────────────────────────────────────
 * La somme des `meetingDuration` (secondes au chronomètre, cf.
 * lib/meetingDuration.js) des réunions du compte dont la date, `lastConnecion`,
 * celle qu'affiche l'historique — le DÉBUT de la réunion —, tombe dans le mois
 * civil en cours, à l'heure de Paris (`QUOTA_TIME_ZONE`). Le mois civil parce
 * qu'il se lit sans explication (« renouvelé le 1er »), là où une fenêtre
 * glissante demande un calcul. L'heure de Paris parce que c'est à elle que les
 * organisations lisent « le 1er » : en UTC, le premier choix, le renouvellement
 * tombait à 1 h du matin l'hiver, 2 h l'été, et une réunion commencée le 1er à
 * 0 h 30 comptait pour le mois d'avant. Les bornes restent des instants UTC en
 * ISO, comparables tels quels à `lastConnecion`. Un import de fichier ne porte
 * pas de durée mesurée : il ne décompte rien, mais il est refusé quand le quota
 * est atteint.
 *
 * ── Une réunion supprimée compte encore ──────────────────────────────────────
 * Le quota mesure ce qui a été transcrit, et payé chez OpenAI, pas ce que
 * l'historique garde. Calculé sur les seuls documents `resume`, il rendait ses
 * minutes à toute réunion supprimée : un compte au quota atteint s'en
 * redonnait depuis l'historique, sans rien trafiquer. Avant de partir, une
 * réunion dont le mois n'est pas fini laisse donc une TRACE
 * (`DELETED_USAGE_COLLECTION`, `keepDeletedUsage`) : son propriétaire, son
 * `meetingId`, sa date et sa durée — rien de ce qui a été dit. Mêmes noms de
 * champs que `resume`, faute `lastConnecion` comprise : le même filtre et la
 * même somme valent pour les deux. La trace s'efface d'elle-même à la fin du
 * mois de sa réunion (index TTL sur `expiresAt`), quand elle cesse de compter.
 *
 * Une réunion compte UNE fois, pour la plus longue durée qu'on lui connaît
 * (`sumDurations`) : une trace et un document au même `meetingId` — réunion
 * recréée par un onglet resté ouvert sur elle — ne s'additionnent pas.
 *
 * Supprimée PENDANT l'enregistrement (« Supprimer la réunion » en fin de
 * réunion part avant la clôture ; ou depuis un autre appareil), la réunion n'a
 * pas encore de durée : sa trace naît vide, et l'arrêt qui arrive ensuite y
 * inscrit la sienne (`recordLateStop`, appelé par /history/stop). Sans ce
 * rattrapage, ses minutes ne comptaient jamais.
 *
 * Seule exception, inchangée : l'enregistrement où rien n'a été dit, que
 * /history/stop efface lui-même (`discardIfEmpty`), ne laisse pas de trace —
 * il ne laisse rien du tout. Supprimé AVANT son arrêt, le vide ne se constate
 * plus : ses secondes comptent.
 *
 * Alternative écartée : un compteur mensuel par compte, incrémenté à l'arrêt.
 * Une durée s'écrit plusieurs fois sur une même réunion — à l'arrêt, au premier
 * résumé, et à chaque régénération, qui renvoie la durée connue : il aurait
 * fallu retenir, réunion par réunion, ce qui était déjà compté. Et le remplir,
 * au déploiement, du mois en cours, le quota étant déjà en production. La
 * trace ne change ni la règle ni sa source tant que la réunion existe, et ne
 * demande aucune reprise. Son prix : tout NOUVEAU chemin de suppression d'une
 * réunion doit appeler `keepDeletedUsage` d'abord.
 *
 * Une réunion en cours ne compte qu'à son arrêt, quand sa durée est écrite. Le
 * quota s'applique donc au DÉMARRAGE, jamais en cours de réunion : on ne coupe
 * pas la parole pour une minute de trop, la réunion entamée va au bout, et le
 * dépassement se voit le mois suivant. « Atteint » = moins d'une minute pleine
 * restante, ce qui fait coïncider le refus avec le « 0 min » de l'écran.
 *
 * ── Où il s'applique ─────────────────────────────────────────────────────────
 * Sur les deux portes de la transcription (routes/ai.js) : /tempkey, le
 * démarrage d'une réunion en direct, et /record, l'import d'un fichier. Les
 * segments hors ligne de l'app mobile passent aussi par /record, mais SANS
 * quota : ils appartiennent à une réunion déjà commencée, vérifiée à son
 * démarrage, et les refuser perdrait ce qui a été dit. L'écran lit le même
 * état (`GET /quota`, et /init) pour l'afficher et éviter le refus, mais le
 * serveur reste seul juge.
 */
import { ownerFilter, ownerFields } from './ownerScope.js';
import { sanitizeDuration } from './meetingDuration.js';
import { normalizeQuotaMinutes, toUserGroup } from './repositories/groups.js';

/** Le fuseau du calendrier des quotas (cf. l'en-tête). */
export const QUOTA_TIME_ZONE = 'Europe/Paris';

/**
 * Ce qu'ont consommé les réunions supprimées, le temps de leur mois (cf.
 * l'en-tête). Collection par utilisateur : inscrite dans `OWNED_COLLECTIONS`,
 * elle part avec le compte.
 */
export const DELETED_USAGE_COLLECTION = 'deletedMeetingUsage';

const wallClockFormats = new Map();

/** Année, mois (0-11), jour, heure, minute et seconde de `date` à l'heure de `timeZone`. */
function wallClock(date, timeZone) {
  let format = wallClockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    wallClockFormats.set(timeZone, format);
  }
  const part = Object.fromEntries(
    format.formatToParts(date).map(({ type, value }) => [type, Number(value)]),
  );
  return { ...part, month: part.month - 1 };
}

/** Avance (ms) de l'heure de `timeZone` sur UTC à l'instant `ms`, pris à la seconde. */
function offsetAt(ms, timeZone) {
  const w = wallClock(new Date(ms), timeZone);
  return Date.UTC(w.year, w.month, w.day, w.hour, w.minute, w.second) - ms;
}

/** L'instant du 1er du mois `month` (0-11, débordement admis) à minuit, heure de `timeZone`. */
function monthStart(year, month, timeZone) {
  return zonedMidnight(year, month, 1, timeZone);
}

/**
 * L'instant de minuit, heure de `timeZone`, du jour `day` du mois `month`
 * (0-11) — débordements admis, comme `Date.UTC`. Sert aussi aux périodes
 * choisies des statistiques : « du 1er au 30 septembre » s'entend à Paris.
 */
export function zonedMidnight(year, month, day, timeZone = QUOTA_TIME_ZONE) {
  const wall = Date.UTC(year, month, day);
  // Deux passes : l'avance lue sur la première estimation peut différer de celle
  // de l'instant cherché quand un changement d'heure les sépare. Minuit existe
  // toujours à Paris, où l'heure change à 2 h et à 3 h du matin.
  const guess = wall - offsetAt(wall, timeZone);
  return new Date(wall - offsetAt(guess, timeZone));
}

/**
 * Le mois civil, heure de Paris, qui contient `now` — en instants UTC. `end`
 * est EXCLU : c'est l'instant du renouvellement, ce que l'écran nomme
 * « renouvelé le 1er … ». `timeZone` accompagne les bornes : l'écran nomme les
 * mois dans ce fuseau, faute de quoi le 1er octobre à minuit à Paris — le
 * 30 septembre à 22 h UTC — se lirait « septembre ».
 * @param {Date} [now]
 * @param {string} [timeZone]
 * @returns {{start: string, end: string, timeZone: string}} bornes ISO (UTC)
 */
export function currentPeriod(now = new Date(), timeZone = QUOTA_TIME_ZONE) {
  const { year, month } = wallClock(now, timeZone);
  return {
    start: monthStart(year, month, timeZone).toISOString(),
    end: monthStart(year, month + 1, timeZone).toISOString(),
    timeZone,
  };
}

/**
 * Le quota qui s'applique à un compte : le plus généreux de ses groupes,
 * « illimité » l'emportant. Sans groupe (jamais en pratique, cf. l'invariant de
 * lib/repositories/groups.js) : illimité, faute de règle à appliquer.
 * @param {Array<object>} groups - documents `userGroups` du compte
 * @returns {{minutes: number|null, group: object|null}} le groupe qui donne le quota
 */
export function effectiveLimit(groups) {
  let best = null;
  for (const group of groups || []) {
    const minutes = normalizeQuotaMinutes(group.meetingMinutesPerMonth);
    if (minutes === null) return { minutes: null, group };
    if (!best || minutes > best.minutes) best = { minutes, group };
  }
  return best || { minutes: null, group: null };
}

/**
 * Secondes de réunion d'une liste de documents `resume` et de traces de
 * réunions supprimées (durées absentes ignorées). Une réunion compte UNE fois,
 * pour sa plus longue durée connue : le `meetingId` la désigne, qu'elle soit
 * encore dans l'historique, supprimée, ou les deux. Un document sans
 * identifiant (n8n) compte pour lui seul.
 */
export function sumDurations(docs) {
  const byMeeting = new Map();
  let total = 0;
  for (const doc of docs || []) {
    const seconds = sanitizeDuration(doc?.meetingDuration) || 0;
    const id = doc?.meetingId == null || doc.meetingId === '' ? null : String(doc.meetingId);
    if (id === null) total += seconds;
    else byMeeting.set(id, Math.max(byMeeting.get(id) || 0, seconds));
  }
  for (const seconds of byMeeting.values()) total += seconds;
  return total;
}

/**
 * La trace qu'une réunion laisse en partant, ou `null` quand il n'y a rien à
 * garder : ni durée ni enregistrement en cours dont l'arrêt en écrira une, ou
 * un mois déjà fini — elle n'y compterait plus. Une date illisible ne compte
 * pas non plus : le filtre du mois ne la retiendrait pas.
 * @param {string} email - le demandeur, propriétaire (la suppression passe par `ownerFilter`)
 * @param {object} doc - le document `resume` qui va partir
 * @param {Date} now
 * @returns {object|null}
 */
export function deletedUsageTrace(email, doc, now) {
  const seconds = sanitizeDuration(doc.meetingDuration);
  if (!seconds && doc.status !== 'recording') return null;
  const startedAt = typeof doc.lastConnecion === 'string' ? new Date(doc.lastConnecion) : null;
  if (!startedAt || Number.isNaN(startedAt.getTime())) return null;
  const { end } = currentPeriod(startedAt);
  if (end <= now.toISOString()) return null;
  return {
    ...ownerFields(email),
    meetingId: doc.meetingId,
    // Telle quelle : c'est elle que compare le filtre du mois.
    lastConnecion: doc.lastConnecion,
    meetingDuration: seconds,
    deletedAt: now.toISOString(),
    // Fin du mois de la réunion : l'index TTL efface la trace quand elle cesse de compter.
    expiresAt: new Date(end),
  };
}

/**
 * L'état que lisent l'écran et les portes de la transcription.
 * @param {{minutes: number|null, group: object|null, usedSeconds: number, period: {start: string, end: string}}} input
 */
export function buildQuotaStatus({ minutes, group, usedSeconds, period }) {
  const base = { period, group: group ? toUserGroup(group) : null };
  if (minutes === null) {
    return {
      ...base,
      unlimited: true,
      limitMinutes: null,
      usedSeconds: 0,
      usedMinutes: 0,
      remainingMinutes: null,
      exhausted: false,
    };
  }
  const remainingSeconds = Math.max(0, minutes * 60 - usedSeconds);
  return {
    ...base,
    unlimited: false,
    limitMinutes: minutes,
    usedSeconds,
    usedMinutes: Math.round(usedSeconds / 60),
    remainingMinutes: Math.floor(remainingSeconds / 60),
    exhausted: remainingSeconds < 60,
  };
}

// ── Le crédit au fil du mois (page « Mes statistiques ») ─────────────────────

/**
 * Avance sur le rythme régulier, en part du crédit, au-delà de laquelle l'écran
 * annonce la date d'épuisement. Le rythme régulier consomme le crédit en
 * ligne droite du 1er au renouvellement ; une avance de 15 points (59 % consommé
 * quand 39 % du mois est écoulé) n'est plus un aléa d'agenda. En dessous, une
 * prévision inquiéterait pour une seule longue réunion en début de mois.
 * Une part du crédit plutôt qu'un écart relatif : le 2 du mois, une réunion
 * d'une heure ferait « 300 % d'avance ».
 */
export const PACE_ALERT_THRESHOLD = 0.15;

/** Jour civil (`2026-10-12`) d'un instant, à l'heure de `timeZone`. */
export function dayKey(date, timeZone = QUOTA_TIME_ZONE) {
  const w = wallClock(date, timeZone);
  return `${w.year}-${String(w.month + 1).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/**
 * La consommation de la période, jour par jour, TOUS les jours du mois inclus
 * (zéro compris) : le graphique « Au fil du mois » trace des paliers, et un jour
 * sans réunion en est un. Mêmes règles que `sumDurations` — une réunion compte
 * une fois, pour sa plus longue durée connue, au jour de son début à l'heure de
 * Paris —, si bien que la somme des jours vaut toujours `usedSeconds`.
 * @param {Array<object>} docs - documents `resume` et traces de la période
 * @param {{start: string, timeZone?: string}} period
 * @returns {Array<{date: string, usedSeconds: number}>}
 */
export function dailyUsage(docs, period) {
  const timeZone = period.timeZone || QUOTA_TIME_ZONE;
  const byMeeting = new Map();
  const loose = [];
  for (const doc of docs || []) {
    const seconds = sanitizeDuration(doc?.meetingDuration) || 0;
    const date = typeof doc?.lastConnecion === 'string' ? new Date(doc.lastConnecion) : null;
    if (!seconds || !date || Number.isNaN(date.getTime())) continue;
    const id = doc.meetingId == null || doc.meetingId === '' ? null : String(doc.meetingId);
    if (id === null) loose.push({ date, seconds });
    else if (!byMeeting.has(id) || seconds > byMeeting.get(id).seconds) {
      byMeeting.set(id, { date, seconds });
    }
  }
  // Les jours du mois se comptent sur le calendrier, pas en ajoutant 24 h : le
  // jour du passage à l'heure d'hiver en dure 25.
  const { year, month } = wallClock(new Date(period.start), timeZone);
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  const days = new Map(
    Array.from({ length: count }, (_, i) => [`${prefix}${String(i + 1).padStart(2, '0')}`, 0]),
  );
  for (const { date, seconds } of [...byMeeting.values(), ...loose]) {
    const key = dayKey(date, timeZone);
    if (days.has(key)) days.set(key, days.get(key) + seconds);
  }
  return [...days].map(([date, usedSeconds]) => ({ date, usedSeconds }));
}

/**
 * Le jour où le crédit s'est épuisé (moins d'une minute pleine restante, la
 * règle de `buildQuotaStatus`), ou `null`.
 * @param {Array<{date: string, usedSeconds: number}>} days
 * @param {number} limitMinutes
 */
export function exhaustedDay(days, limitMinutes) {
  let used = 0;
  for (const day of days) {
    used += day.usedSeconds;
    if (limitMinutes * 60 - used < 60) return day.date;
  }
  return null;
}

/**
 * Le rythme de consommation du mois : ce qu'il resterait au rythme régulier, et
 * le jour où, à ce rythme-ci, le crédit sera épuisé. `alert` dit si l'écran
 * doit l'annoncer (cf. `PACE_ALERT_THRESHOLD`). `null` sans limite.
 * @param {object} status - `buildQuotaStatus`
 * @param {Date} [now]
 */
export function creditPace(status, now = new Date()) {
  if (!status || status.unlimited || !status.period) return null;
  const start = Date.parse(status.period.start);
  const end = Date.parse(status.period.end);
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
  const limitSeconds = status.limitMinutes * 60;
  const usedRatio = limitSeconds > 0 ? Math.min(1, status.usedSeconds / limitSeconds) : 1;
  let exhaustsAt = null;
  if (!status.exhausted && status.usedSeconds > 0 && now.getTime() > start) {
    const at = start + (limitSeconds / status.usedSeconds) * (now.getTime() - start);
    if (at < end) exhaustsAt = new Date(Math.max(at, now.getTime())).toISOString();
  }
  const aheadRatio = usedRatio - elapsed;
  return {
    elapsedRatio: elapsed,
    expectedRemainingSeconds: Math.round(limitSeconds * (1 - elapsed)),
    aheadRatio,
    exhaustsAt,
    alert: exhaustsAt !== null && aheadRatio > PACE_ALERT_THRESHOLD,
  };
}

/**
 * Aucun champ d'appartenance vers le calcul : la durée, et l'identifiant qui
 * fait compter une réunion une seule fois.
 */
const DURATION_FIELDS = { _id: 0, meetingId: 1, meetingDuration: 1 };

/** Le crédit jour par jour : la durée, l'identifiant, et le jour de la réunion. */
const CREDIT_FIELDS = { _id: 0, meetingId: 1, meetingDuration: 1, lastConnecion: 1 };

/** Ce que la suppression relit d'une réunion pour en laisser la trace. */
const TRACE_FIELDS = { _id: 0, meetingId: 1, lastConnecion: 1, meetingDuration: 1, status: 1 };

/**
 * @param {{db: object, users: object, groups: object}} deps
 */
export function createQuotaService({ db, users, groups }) {
  /** Le compte (document chargé ou relu) et la limite que lui donnent ses groupes. */
  async function limitOf(identity) {
    const doc = identity?.doc || (identity?.email ? await users.findByEmail(identity.email) : null);
    const email = doc?.email || identity?.email || '';
    return { email, ...effectiveLimit(await groups.docsForUser(doc)) };
  }

  /**
   * Les réunions de l'historique ET celles supprimées ce mois-ci : même filtre,
   * mêmes champs (cf. l'en-tête).
   */
  async function periodDocs(email, period, fields) {
    const inPeriod = ownerFilter(email, {
      lastConnecion: { $gte: period.start, $lt: period.end },
    });
    const [kept, deleted] = await Promise.all(
      ['resume', DELETED_USAGE_COLLECTION].map((name) =>
        db.collection(name).find(inPeriod).project(fields).toArray(),
      ),
    );
    return { kept, deleted };
  }

  return {
    /**
     * @param {{email?: string, doc?: object|null}} identity - `req.user` (l'email
     *   de l'en-tête ou du document, et le document `user` s'il est déjà chargé)
     * @param {Date} [now] - injectable pour les tests
     */
    async statusFor(identity, now = new Date()) {
      const period = currentPeriod(now);
      const { email, minutes, group } = await limitOf(identity);
      // Illimité : rien à mesurer, /init ne paie pas une lecture de l'historique.
      if (minutes === null || !email) {
        return buildQuotaStatus({ minutes: null, group, usedSeconds: 0, period });
      }
      const { kept, deleted } = await periodDocs(email, period, DURATION_FIELDS);
      return buildQuotaStatus({
        minutes,
        group,
        usedSeconds: sumDurations([...kept, ...deleted]),
        period,
      });
    },

    /**
     * Le crédit du mois tel que le montre « Mes statistiques » : l'état de
     * `statusFor`, plus le détail qu'il ne lit pas — la consommation jour par
     * jour, le rythme, le jour d'épuisement, la part des réunions supprimées
     * (elle explique l'écart avec le temps enregistré de l'historique).
     * `monthSeconds` est mesuré même sans limite : un compte illimité voit
     * aussi ce qu'il a enregistré ce mois-ci.
     * @param {{email?: string, doc?: object|null}} identity
     * @param {Date} [now]
     */
    async creditFor(identity, now = new Date()) {
      const period = currentPeriod(now);
      const { email, minutes, group } = await limitOf(identity);
      const { kept, deleted } = email
        ? await periodDocs(email, period, CREDIT_FIELDS)
        : { kept: [], deleted: [] };
      const monthSeconds = sumDurations([...kept, ...deleted]);
      const status = buildQuotaStatus({ minutes, group, usedSeconds: monthSeconds, period });
      const days = dailyUsage([...kept, ...deleted], period);
      return {
        ...status,
        monthSeconds,
        deletedSeconds: monthSeconds - sumDurations(kept),
        days,
        pace: creditPace(status, now),
        exhaustedOn: status.exhausted ? exhaustedDay(days, minutes) : null,
      };
    },

    /**
     * À appeler AVANT de supprimer une réunion : garde ce qu'elle a consommé
     * (cf. l'en-tête). Dans l'ordre inverse, un échec entre les deux écritures
     * rendrait ses minutes ; ici, une suppression qui échoue après la trace ne
     * compte rien deux fois — même `meetingId`. Une trace impossible à écrire
     * fait échouer la suppression : la réunion reste, et se supprimera au
     * prochain essai.
     * @param {string} email
     * @param {string} meetingId
     * @param {Date} [now]
     * @returns {Promise<number>} nombre de traces laissées
     */
    async keepDeletedUsage(email, meetingId, now = new Date()) {
      const docs = await db
        .collection('resume')
        .find(ownerFilter(email, { meetingId }))
        .project(TRACE_FIELDS)
        .toArray();
      const traces = docs.map((doc) => deletedUsageTrace(email, doc, now)).filter(Boolean);
      if (traces.length) await db.collection(DELETED_USAGE_COLLECTION).insertMany(traces);
      return traces.length;
    },

    /**
     * L'arrêt d'une réunion déjà supprimée : sa durée va à la trace que la
     * suppression a laissée, sans jamais en retirer (`$max` — un arrêt rejoué
     * ne compte pas deux fois). Sans trace — mois fini, réunion inconnue —,
     * rien à faire.
     * @param {string} email
     * @param {string} meetingId
     * @param {number|null} seconds - durée déjà validée (`sanitizeDuration`)
     * @returns {Promise<boolean>} true si une trace l'a reçue
     */
    async recordLateStop(email, meetingId, seconds) {
      if (!seconds) return false;
      const res = await db
        .collection(DELETED_USAGE_COLLECTION)
        .updateMany(ownerFilter(email, { meetingId }), { $max: { meetingDuration: seconds } });
      return (res?.matchedCount || 0) > 0;
    },
  };
}
