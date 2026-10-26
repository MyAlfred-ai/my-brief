/**
 * Le crédit de temps de chaque compte — Administration → Crédit de temps.
 * Fonction PURE : la route lit, ceci calcule.
 *
 * Mêmes règles que le compteur de chacun (lib/quota.js) : la limite la plus
 * généreuse de ses groupes, le mois civil à l'heure de Paris, les réunions
 * supprimées comptées jusqu'à la fin du mois, une réunion comptée une fois.
 * Recalculer ici plutôt qu'appeler `statusFor` compte par compte : une
 * lecture de la période pour toute l'installation au lieu de deux par compte.
 *
 * Ordre d'URGENCE, celui dans lequel un administrateur agit : les crédits
 * épuisés, puis ceux qui le seront avant le renouvellement (l'alerte de
 * rythme), puis les autres comptes limités du moins au plus fourni, enfin les
 * comptes sans limite, du plus au moins consommateur. Les comptes désactivés
 * sont écartés : ils ne consomment plus rien.
 */
import {
  buildQuotaStatus,
  creditPace,
  dailyUsage,
  effectiveLimit,
  exhaustedDay,
  sumDurations,
} from './quota.js';
import { groupsOfUser, toUserGroup } from './repositories/groups.js';
import { meetingDate, ownerKey } from './stats.js';

function groupBy(docs) {
  const map = new Map();
  for (const doc of docs || []) {
    const key = ownerKey(doc);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(doc);
  }
  return map;
}

/** 0 épuisé, 1 alerte de rythme, 2 limité, 3 sans limite. */
function urgency(account) {
  if (account.unlimited) return 3;
  if (account.exhausted) return 0;
  return account.pace?.alert ? 1 : 2;
}

function compareAccounts(a, b) {
  const rank = urgency(a) - urgency(b);
  if (rank) return rank;
  const tie = (a.name || a.email).localeCompare(b.name || b.email);
  if (a.unlimited) return b.usedSeconds - a.usedSeconds || tie;
  if (a.exhausted) return (a.exhaustedOn || '').localeCompare(b.exhaustedOn || '') || tie;
  if (a.pace?.alert) return a.pace.exhaustsAt.localeCompare(b.pace.exhaustsAt) || tie;
  const left = (account) => account.remainingMinutes / (account.limitMinutes || 1);
  return left(a) - left(b) || tie;
}

/**
 * @param {object} input
 * @param {object[]} input.users - comptes servis (cf. SERVED_ACCOUNT)
 * @param {object[]} input.groups - le catalogue `userGroups`
 * @param {object[]} input.kept - réunions de l'historique datées dans la période
 * @param {object[]} input.deleted - traces des réunions supprimées de la période
 * @param {object[]} input.history - toutes les réunions, pour la dernière de chacun
 * @param {{start: string, end: string, timeZone: string}} input.period
 * @param {Date} input.now
 */
export function computeTeamCredits({ users, groups, kept, deleted, history, period, now }) {
  const keptBy = groupBy(kept);
  const deletedBy = groupBy(deleted);
  const lastMeeting = new Map();
  for (const doc of history || []) {
    const key = ownerKey(doc);
    const date = meetingDate(doc);
    if (key && date && (!lastMeeting.has(key) || date > lastMeeting.get(key))) {
      lastMeeting.set(key, date);
    }
  }

  const accounts = (users || [])
    .filter((user) => !user.disabled)
    .map((user) => {
      const key = ownerKey(user);
      const mine = groupsOfUser(groups, user);
      const { minutes, group } = effectiveLimit(mine);
      const docs = [...(keptBy.get(key) || []), ...(deletedBy.get(key) || [])];
      const usedSeconds = sumDurations(docs);
      const status = buildQuotaStatus({ minutes, group, usedSeconds, period });
      return {
        email: user.email || key,
        name: user.name || '',
        role: user.role === 'admin' ? 'admin' : 'user',
        groups: mine.map(toUserGroup),
        unlimited: status.unlimited,
        limitMinutes: status.limitMinutes,
        // Mesuré même sans limite : c'est ce que l'écran montre à leur place.
        usedSeconds,
        remainingMinutes: status.remainingMinutes,
        exhausted: status.exhausted,
        exhaustedOn: status.exhausted ? exhaustedDay(dailyUsage(docs, period), minutes) : null,
        pace: creditPace(status, now),
        meetings: (keptBy.get(key) || []).length,
        lastMeetingAt: lastMeeting.has(key) ? lastMeeting.get(key).toISOString() : null,
      };
    })
    .sort(compareAccounts);

  return {
    period,
    groups: (groups || []).map(toUserGroup),
    summary: {
      accounts: accounts.length,
      limited: accounts.filter((a) => !a.unlimited).length,
      exhausted: accounts.filter((a) => a.exhausted).length,
      atRisk: accounts.filter((a) => a.pace?.alert).length,
    },
    accounts,
  };
}
