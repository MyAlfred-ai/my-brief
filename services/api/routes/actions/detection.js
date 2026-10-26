/**
 * Détection d'actions en réunion — réglages d'un UTILISATEUR, et son banc
 * d'essai.
 *
 * Ces réglages étaient ceux de l'installation, dans l'administration. Ils sont
 * personnels : deux personnes n'animent pas les mêmes réunions, et ce qui est
 * du bruit pour l'une est l'essentiel de l'autre. Il n'y a donc RIEN au-dessus
 * de l'utilisateur — ni plafond ni défaut d'organisation, contrairement aux
 * actions post-réunion (cf. l'en-tête de lib/actions/resolve.js). Un compte qui
 * n'a rien réglé vit les valeurs intégrées.
 *
 * ── Le banc d'essai ────────────────────────────────────────────────────────
 * Il exerce les réglages AFFICHÉS à l'écran, enregistrés ou non : son intérêt
 * est justement de juger un changement avant de l'adopter, et il n'a aucun
 * effet de bord (l'essai d'envoi de mail, lui, impose un enregistrement
 * préalable parce qu'il produit un effet réel).
 *
 * En revanche il ne réimplémente RIEN : `runActionDetection` est le chemin
 * unique, partagé avec `POST /api/actions`. Un banc d'essai qui referait le
 * prompt à sa façon validerait sa propre façon de le faire.
 */
import { requireUser } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { isSameOrigin } from '../../lib/auth/originCheck.js';
import { createRateLimiter } from '../../lib/auth/rateLimit.js';
import { upstreamMessage, UpstreamError } from '../../lib/openai.js';
import { runActionDetection } from '../../lib/actionDetection.js';
import { mergeActionDetectionPatch } from '../../lib/actionDetectionSettings.js';
import { userActionDetectionBody, userActionDetectionTestBody } from '../auth/schemas.js';

export default function actionsDetectionRoutes(app) {
  // Mêmes plafonds que le bouton « Tester » des actions : un geste de
  // diagnostic, pas un usage. Ici il y a en plus un appel au modèle à chaque
  // essai — raison de plus de le borner. Clé par compte ET par IP.
  const byAccount = createRateLimiter(app.config.rateLimits.actionTestByAccount);
  const byIp = createRateLimiter(app.config.rateLimits.actionTestByIp);
  app.addHook('onClose', async () => {
    byAccount.stop();
    byIp.stop();
  });

  app.get('/actions/detection', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    return { settings: await app.userActions.getDetection(user.email) };
  });

  app.post(
    '/actions/detection',
    { schema: { body: userActionDetectionBody } },
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return undefined;
      // Seconde barrière CSRF, gratuite et tolérante aux appels sans Origin
      // (curl, app.inject) — cf. lib/auth/originCheck.js.
      if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');

      // Chaque champ est relayé EXPLICITEMENT par mergeActionDetectionPatch :
      // le corps validé lui est passé tel quel, jamais étalé dans le document.
      const settings = await app.userActions.updateDetection(user.email, req.body);
      return { settings };
    },
  );

  app.post(
    '/actions/detection/test',
    { schema: { body: userActionDetectionTestBody } },
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return undefined;
      if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');

      for (const [limiter, key] of [
        [byAccount, user.emailLower],
        [byIp, req.ip || 'unknown'],
      ]) {
        const quota = limiter.hit(key);
        if (!quota.allowed) {
          return fail(reply, 429, 'too_many_requests', { retryAfter: quota.retryAfterSec });
        }
      }

      const content = String(req.body.content || '').trim();
      if (!content) return fail(reply, 400, 'detection_test_content_missing');

      // Réglages affichés posés sur les réglages enregistrés : l'écran envoie
      // ce qu'il montre, et ce qu'il ne montre pas reste ce qui est en base.
      let settings;
      try {
        settings = mergeActionDetectionPatch(
          await app.userActions.getDetection(user.email),
          req.body.settings || {},
        );
      } catch (err) {
        return fail(reply, 400, 'detection_settings_invalid', { message: err.message });
      }

      try {
        const { actions, prompt } = await runActionDetection({
          openai: app.openai,
          model: app.config.openai.models.actions,
          content,
          actions: [],
          dismissed: [],
          // Langue de l'interface, comme en réunion (repli fr).
          language: req.body.language,
          // Le vocabulaire de l'organisation vient du SERVEUR, comme en
          // réunion : l'essai doit ressembler à la réunion, pas à une requête
          // que l'écran aurait composée.
          settings: { ...settings, businessContext: await app.settings.orgContextText() },
        });
        // `prompt` est rendu à l'écran : devant un résultat surprenant, la
        // consigne réellement envoyée explique mieux que n'importe quel message.
        return { ok: true, actions, prompt, model: app.config.openai.models.actions };
      } catch (err) {
        if (!(err instanceof UpstreamError)) throw err;
        req.log?.warn({ status: err.status }, 'banc d’essai de détection : échec amont');
        return fail(reply, 400, 'detection_test_failed', {
          upstreamStatus: err.status,
          upstreamMessage: upstreamMessage(err),
        });
      }
    },
  );
}
