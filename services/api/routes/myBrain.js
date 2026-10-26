/**
 * MyBrain, côté utilisateur — « Ma configuration → MyBrain ».
 *
 *   GET  /mybrain/settings  ce que l'installation propose, le choix du compte,
 *                           et ses derniers envois
 *   POST /mybrain/settings  `{ enabled }` — envoyer ses réunions, ou non
 *   POST /mybrain/send      `{ meetingId }` — « Réessayer » un envoi en échec
 *
 * Le choix n'existe que si l'administration le laisse : politique `optin`.
 * Imposé (`forced`) ou fermé, l'écrire répond 409 — un conflit avec l'état de
 * l'installation, surtout pas un 401/403 que le frontend lirait comme une
 * perte de session.
 *
 * Aucune route d'ici ne reçoit de contenu à envoyer ni de destination : ce qui
 * part est relu en base sous le scope du demandeur, l'adresse de myBrain vient
 * des réglages d'organisation (règle des actions, lib/actions/resolve.js).
 */
import { requireUser } from '../lib/rbac.js';
import { fail } from '../lib/errors.js';
import { isSameOrigin } from '../lib/auth/originCheck.js';
import { createRateLimiter } from '../lib/auth/rateLimit.js';
import { ownerFilter } from '../lib/ownerScope.js';
import { isMyBrainActive } from '../lib/repositories/myBrainSettings.js';
import { myBrainEligibility, feedMeetingToMyBrain } from '../lib/myBrain/feed.js';

/** Envois montés à l'écran : de quoi voir que ça part, pas un journal. */
const RECENT_MAX = 8;

const userMyBrainBody = {
  type: 'object',
  required: ['enabled'],
  additionalProperties: false,
  properties: { enabled: { type: 'boolean' } },
};

const myBrainSendBody = {
  type: 'object',
  required: ['meetingId'],
  additionalProperties: false,
  properties: { meetingId: { type: 'string', minLength: 1, maxLength: 64 } },
};

/**
 * Les derniers envois du compte. Projection STRICTE : l'état de l'envoi et de
 * quoi nommer la réunion (`title`, `name`, date — ce que lit
 * src/utils/historyTitle.js), jamais son contenu.
 */
async function recentSends(app, email) {
  const docs = await app.db
    .collection('resume')
    .find(ownerFilter(email, { 'myBrain.status': { $exists: true } }))
    .sort({ 'myBrain.updatedAt': -1 })
    .project({ _id: 0, meetingId: 1, title: 1, name: 1, lastConnecion: 1, now: 1, myBrain: 1 })
    .limit(RECENT_MAX)
    .toArray();
  return docs.map((doc) => ({
    meetingId: doc.meetingId,
    title: doc.title || '',
    name: doc.name || '',
    lastConnecion: doc.lastConnecion || doc.now || null,
    status: doc.myBrain?.status || '',
    error: doc.myBrain?.error || '',
    retryable: !!doc.myBrain?.retryable,
    // La réunion est peut-être arrivée : l'écran le dit avant « Réessayer ».
    ambiguous: !!doc.myBrain?.ambiguous,
    sentAt: doc.myBrain?.sentAt || null,
    updatedAt: doc.myBrain?.updatedAt || null,
    parts: Number(doc.myBrain?.parts) || 0,
    recipientUnknown: !!doc.myBrain?.recipientUnknown,
  }));
}

async function userView(app, email) {
  const { available, active, policy, enabled, settings } = await myBrainEligibility(app, email);
  const publicUrl = settings.verified?.publicUrl || '';
  return {
    available,
    policy: available ? policy : 'off',
    enabled,
    active,
    // La revue de myBrain, où attend chaque réunion envoyée — à l'adresse que
    // myBrain annonce pour lui-même, pas forcément celle que le serveur joint.
    reviewUrl: available && publicUrl ? `${publicUrl}/revue` : '',
    recent: available ? await recentSends(app, email) : [],
  };
}

export default function myBrainRoutes(app) {
  const sendByAccount = createRateLimiter(app.config.rateLimits.myBrainSendByAccount);
  app.addHook('onClose', async () => sendByAccount.stop());

  app.get('/mybrain/settings', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    return userView(app, user.email);
  });

  app.post('/mybrain/settings', { schema: { body: userMyBrainBody } }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    // Seconde barrière CSRF, gratuite — cf. lib/auth/originCheck.js.
    if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');

    const settings = await app.myBrainSettings.get();
    if (!isMyBrainActive(settings)) return fail(reply, 409, 'mybrain_disabled');
    if (settings.policy === 'forced') return fail(reply, 409, 'mybrain_policy_forced');

    await app.userActions.updateMyBrain(user.email, { enabled: req.body.enabled });
    return userView(app, user.email);
  });

  /**
   * « Réessayer ». Réservé aux réunions qui ne sont PAS arrivées : une réunion
   * envoyée ne se renvoie pas (une seconde proposition dans la revue de
   * myBrain, pour le même contenu). Exécuté pendant la requête — quelques
   * secondes au plus : l'utilisateur attend le verdict, c'est lui qui a cliqué.
   */
  app.post('/mybrain/send', { schema: { body: myBrainSendBody } }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');
    const quota = sendByAccount.hit(user.emailLower);
    if (!quota.allowed) {
      return fail(reply, 429, 'too_many_requests', { retryAfter: quota.retryAfterSec });
    }

    const { meetingId } = req.body;
    const eligibility = await myBrainEligibility(app, user.email);
    if (!eligibility.available) return fail(reply, 409, 'mybrain_disabled');
    if (!eligibility.active) return fail(reply, 409, 'mybrain_not_enabled');

    const doc = await app.db
      .collection('resume')
      .findOne(ownerFilter(user.email, { meetingId }), { projection: { status: 1, myBrain: 1 } });
    if (!doc) return fail(reply, 404, 'meeting_not_found');
    if (doc.status === 'recording') return fail(reply, 409, 'meeting_recording');
    if (doc.myBrain?.status === 'sent') return fail(reply, 409, 'mybrain_already_sent');
    // « Réessayer » reprend un envoi TENTÉ. Une réunion jamais envoyée —
    // antérieure à l'activation, ou terminée quand l'envoi était coupé — ne
    // part pas par cette porte : l'envoi n'est jamais rétroactif.
    if (!doc.myBrain?.status) return fail(reply, 409, 'mybrain_not_retryable');

    const result = await feedMeetingToMyBrain({
      app,
      log: req.log,
      email: user.email,
      meetingId,
      manual: true,
    });
    if (result.status === 'inactive') return fail(reply, 409, 'mybrain_not_enabled');
    // Réclamée par un autre déclencheur à l'instant (geste de fin, relance).
    if (result.status === 'skipped') return fail(reply, 409, 'mybrain_sending');
    if (result.status === 'empty') return fail(reply, 409, 'mybrain_nothing_to_send');
    // myBrain a refusé ou n'a pas répondu : une panne EN AMONT, d'où le 502.
    if (result.status === 'error') return fail(reply, 502, result.error || 'mybrain_error');
    return userView(app, user.email);
  });
}
