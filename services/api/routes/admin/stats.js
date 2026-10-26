/**
 * Statistiques d'usage — réservées aux administrateurs.
 *
 * Une route de LECTURE, sans filtre de propriétaire : c'est le seul endroit de
 * l'API qui regarde les réunions de tout le monde. D'où la garde
 * `requireAdmin` en première ligne, comme les autres routes /api/admin.
 *
 * PROJECTION STRICTE — le scan lit les réunions de toute l'installation, et un
 * document `resume` porte la transcription complète et l'HTML de chaque version
 * (plusieurs centaines de Ko à lui seul). Ne demander que les champs comptés
 * garde la réponse et la mémoire du serveur à quelques dizaines de Ko, et
 * garantit surtout qu'aucun contenu de réunion ne sort d'ici : un administrateur
 * voit des volumes, jamais le texte des réunions de ses collègues.
 *
 * Les DÉPENSES D'IA (`costs`) se calculent sur la même lecture et la même
 * période : elles ne demandent que trois dates et un état de plus — la date de
 * chaque version de compte rendu (`versions.generatedAt`, jamais son HTML ni sa
 * consigne) et l'état de l'infographie. Une estimation en échec ne coûte que sa
 * carte : `costs: null`, et le reste de l'écran s'affiche.
 *
 * FILTRES : une période glissante ou choisie (`from`/`to`, jours entiers),
 * un groupe, un compte, un template. Ils cadrent TOUTE la réponse, dépenses
 * comprises — « combien coûte l'équipe commerciale ? » se lit sur la même
 * carte. Les options de chaque filtre (`filters.options`), elles, ne dépendent
 * d'aucun filtre : choisir un groupe ne fait pas disparaître les autres de la
 * liste. Un groupe ou un compte inconnu ne lève pas d'erreur : un filtre posé
 * sur un groupe supprimé entre-temps rend une population vide, que l'écran dit.
 *
 * Le calcul lui-même vit dans lib/stats.js et lib/costs/ (fonctions pures,
 * testées à part).
 *
 * Deux lectures de plus servent Administration → Crédit de temps :
 * le crédit de temps du mois de chaque compte (/stats/credits, calcul dans
 * lib/teamCredits.js), et la page d'un collègue (/stats/account), la même que
 * la sienne (lib/personalStats.js) — des volumes, jamais un titre.
 */
import { requireAdmin } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { SERVED_ACCOUNT } from '../../lib/repositories/users.js';
import { toUserGroup } from '../../lib/repositories/groups.js';
import { USER_ACTIONS_COLLECTION } from '../../lib/repositories/userActions.js';
import { applyScope, computeUsageStats, statsWindow, templateCounts } from '../../lib/stats.js';
import { measureUsage } from '../../lib/costs/usage.js';
import {
  activeModels,
  estimateCosts,
  modelsToPrice,
  spanDaysOf,
} from '../../lib/costs/estimate.js';
import { effectivePricing, pricingProvenance } from '../../lib/costs/pricing.js';
import { refreshPricing } from '../../lib/costs/refresh.js';
import { adminStatsQuery, adminAccountStatsBody } from '../auth/schemas.js';
import { currentPeriod, DELETED_USAGE_COLLECTION } from '../../lib/quota.js';
import { computeTeamCredits } from '../../lib/teamCredits.js';
import { labelsByTemplate, personalStats } from '../../lib/personalStats.js';

/** Champs strictement nécessaires au calcul — voir l'avertissement ci-dessus. */
const MEETING_FIELDS = {
  _id: 0,
  email: 1,
  emailLower: 1,
  name: 1,
  lastConnecion: 1,
  lastConnection: 1,
  now: 1,
  meetingDuration: 1,
  transcriptionChars: 1,
  template: 1,
  // Dépenses : une date par génération de compte rendu, l'état de l'image.
  'versions.generatedAt': 1,
  'infographic.status': 1,
  'infographic.updatedAt': 1,
};

const USER_FIELDS = {
  _id: 0,
  email: 1,
  emailLower: 1,
  name: 1,
  role: 1,
  disabled: 1,
  createdAt: 1,
  lastConnecion: 1,
  groupIds: 1,
};

/** Libellés des templates : la valeur et ses noms, jamais la consigne. */
const LABEL_FIELDS = { _id: 0, value: 1, labels: 1 };

/** Le crédit : la durée, l'identifiant qui fait compter une réunion une fois, le jour. */
const CREDIT_FIELDS = {
  _id: 0,
  email: 1,
  emailLower: 1,
  meetingId: 1,
  meetingDuration: 1,
  lastConnecion: 1,
};

/** La dernière réunion de chacun : le propriétaire et la date, rien d'autre. */
const LAST_MEETING_FIELDS = {
  _id: 0,
  email: 1,
  emailLower: 1,
  lastConnecion: 1,
  lastConnection: 1,
  now: 1,
};

export default function adminStatsRoutes(app) {
  /**
   * Dépenses d'IA de la période : volumes mesurés × modèles en service ×
   * derniers tarifs relevés (cf. lib/costs/estimate.js).
   * @returns {Promise<object|null>} `null` si l'estimation échoue
   */
  async function estimate({ req, meetings, stats }) {
    try {
      const [aiDoc, stored, detectionOff] = await Promise.all([
        app.settings.getAi(),
        app.pricing.get(),
        // La détection d'actions ne coûte rien aux comptes qui l'ont coupée.
        app.db
          .collection(USER_ACTIONS_COLLECTION)
          .find({ 'detection.enabled': false })
          .project({ _id: 0, emailLower: 1 })
          .toArray(),
      ]);
      const models = activeModels(aiDoc, app.config.openai?.models);
      const pricing = effectivePricing(stored);
      const usage = measureUsage({
        meetings,
        from: new Date(stats.range.from),
        to: new Date(stats.range.to),
        detectionOff: new Set(detectionOff.map((doc) => doc.emailLower).filter(Boolean)),
      });
      const costs = estimateCosts({ usage, models, pricing, spanDays: spanDaysOf(stats.range) });
      return {
        ...costs,
        pricing: pricingProvenance(
          pricing,
          costs.lines.flatMap((line) => line.models),
        ),
      };
    } catch (err) {
      req.log.error({ err }, 'statistiques : estimation des dépenses en échec');
      return null;
    }
  }

  app.get('/stats', { schema: { querystring: adminStatsQuery } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const query = req.query || {};
    const now = new Date();
    const window = statsWindow(query, now);
    if (window.error) return fail(reply, 400, window.error);
    const scope = {
      group: query.group || '',
      user: (query.user || '').trim().toLowerCase(),
      template: query.template || '',
    };

    const [meetings, users, groups, orgTemplates, userTemplates] = await Promise.all([
      app.db.collection('resume').find({}).project(MEETING_FIELDS).toArray(),
      // Des comptes, pas des documents : un doublon inerte de la même adresse
      // compterait la personne deux fois (cf. SERVED_ACCOUNT).
      app.db.collection('user').find(SERVED_ACCOUNT).project(USER_FIELDS).toArray(),
      app.groups.list(),
      app.db.collection('templates').find({}).project(LABEL_FIELDS).toArray(),
      app.db.collection('userTemplates').find({}).project(LABEL_FIELDS).toArray(),
    ]);

    const stats = computeUsageStats({ meetings, users, groups, now, scope, ...window });
    // Le nom que l'organisation (ou le compte) a donné au template ; les
    // templates fournis par le code n'ont pas de document, l'écran les nomme.
    const labels = labelsByTemplate(orgTemplates, userTemplates);
    const labelled = (row) => ({ ...row, labels: labels.get(row.template) || null });
    const scoped = applyScope({ meetings, users, groups, scope }).meetings;

    return {
      ...stats,
      templates: stats.templates.map(labelled),
      filters: {
        applied: {
          days: query.from ? null : window.days,
          from: query.from || null,
          to: query.to || null,
          ...scope,
        },
        options: {
          groups: groups.map(toUserGroup),
          users: users
            .map((user) => ({
              email: user.email,
              name: user.name || '',
              disabled: !!user.disabled,
            }))
            .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
          templates: templateCounts(meetings).map(labelled),
        },
      },
      costs: await estimate({ req, meetings: scoped, stats }),
    };
  });

  /**
   * Crédit de temps du mois, compte par compte, dans l'ordre d'urgence.
   */
  app.get('/stats/credits', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const now = new Date();
    const period = currentPeriod(now);
    const inPeriod = { lastConnecion: { $gte: period.start, $lt: period.end } };
    const [users, groups, kept, deleted, history] = await Promise.all([
      app.db
        .collection('user')
        .find(SERVED_ACCOUNT)
        .project({ ...USER_FIELDS, groupIds: 1 })
        .toArray(),
      app.groups.list(),
      app.db.collection('resume').find(inPeriod).project(CREDIT_FIELDS).toArray(),
      app.db.collection(DELETED_USAGE_COLLECTION).find(inPeriod).project(CREDIT_FIELDS).toArray(),
      app.db.collection('resume').find({}).project(LAST_MEETING_FIELDS).toArray(),
    ]);
    return computeTeamCredits({ users, groups, kept, deleted, history, period, now });
  });

  /**
   * La page « Mes statistiques » d'un collègue, telle qu'il la voit lui-même.
   */
  app.post('/stats/account', { schema: { body: adminAccountStatsBody } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const doc = await app.users.findByEmail(req.body.email);
    if (!doc) return fail(reply, 404, 'user_not_found');
    const stats = await personalStats(
      { db: app.db, quota: app.quota },
      { email: doc.email, doc },
      req.body.range || 'month',
    );
    return { ...stats, account: { email: doc.email, name: doc.name || '' } };
  });

  /**
   * « Actualiser les tarifs » — relève en ligne les prix des modèles et le taux
   * de change, puis les enregistre pour les affichages suivants.
   *
   * Un seul relevé à la fois pour toute l'installation : deux administrateurs
   * qui cliquent ensemble partagent le même téléchargement au lieu d'en lancer
   * deux.
   *
   * Rien de relevé du tout (sources injoignables — un serveur sur site au
   * trafic sortant filtré, typiquement) : 502 `prices_unreachable`, et le
   * dernier relevé reste appliqué. Un relevé PARTIEL est enregistré et le dit
   * (`updated`, `missing`). Le refus d'une source ne se relaie jamais en
   * 401/403 : l'écran en conclurait à une session perdue.
   */
  let inFlight = null;

  async function refresh(actor, log) {
    const [previous, aiDoc] = await Promise.all([app.pricing.get(), app.settings.getAi()]);
    const result = await refreshPricing({
      requests: modelsToPrice(activeModels(aiDoc, app.config.openai?.models)),
      sources: app.priceSources,
      previous,
    });
    if (result.errors.length) {
      log.warn({ errors: result.errors }, 'tarifs IA : source(s) en échec');
    }
    if (!result.updated.prices && !result.updated.fx) return { ...result, saved: null };
    const saved = await app.pricing.save(result.snapshot, { actor });
    return { ...result, saved };
  }

  app.post('/stats/prices/refresh', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    if (!inFlight) {
      inFlight = refresh(req.user?.email || null, req.log).finally(() => {
        inFlight = null;
      });
    }
    const result = await inFlight;
    if (!result.saved) return fail(reply, 502, 'prices_unreachable');
    const pricing = effectivePricing(result.saved);
    return {
      updated: result.updated,
      missing: result.missing,
      refreshedAt: pricing.refreshedAt,
      fx: pricing.fx,
    };
  });
}
