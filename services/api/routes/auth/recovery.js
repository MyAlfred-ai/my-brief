/**
 * Mot de passe oublié : demande d'un lien, puis réinitialisation.
 *
 * Le lien pointe sur /signin?reset=<jeton> — et non /login, déjà pris par le
 * routeur Traefik qui déclenche le flux OIDC.
 */
import { hashPassword, checkPasswordPolicy } from '../../lib/auth/password.js';
import { createRateLimiter } from '../../lib/auth/rateLimit.js';
import { isSameOrigin } from '../../lib/auth/originCheck.js';
import { normalizeEmail } from '../../lib/repositories/users.js';
import { fail } from '../../lib/errors.js';
import { forgotBody, resetBody } from './schemas.js';

export default function recoveryRoutes(app) {
  const forgotByEmail = createRateLimiter(app.config.rateLimits.forgotByEmail);
  const forgotByIp = createRateLimiter(app.config.rateLimits.forgotByIp);
  const resetByIp = createRateLimiter(app.config.rateLimits.resetByIp);
  app.addHook('onClose', async () => {
    forgotByEmail.stop();
    forgotByIp.stop();
    resetByIp.stop();
  });

  /**
   * Répond 202 QUOI QU'IL ARRIVE (compte inconnu, compte sans mot de passe,
   * compte désactivé, envoi en échec) : toute réponse différenciée dirait à un
   * inconnu si l'adresse existe.
   */
  app.post('/forgot-password', { schema: { body: forgotBody } }, async (req, reply) => {
    if (!isSameOrigin(req)) return fail(reply, 403, 'forbidden');
    if (!app.mailer?.enabled) return fail(reply, 501, 'password_reset_disabled');

    const emailLower = normalizeEmail(req.body.email);
    const ipCheck = forgotByIp.hit(req.ip || 'unknown');
    const emailCheck = forgotByEmail.hit(emailLower);
    if (!ipCheck.allowed || !emailCheck.allowed) {
      const retryAfter = Math.max(ipCheck.retryAfterSec, emailCheck.retryAfterSec);
      reply.header('retry-after', String(retryAfter));
      return fail(reply, 429, 'too_many_attempts', { retryAfter });
    }

    const doc = await app.users.findByEmailLower(emailLower);
    if (doc && !doc.disabled) {
      try {
        const { token } = await app.resetTokens.issue({ emailLower, ip: req.ip });
        const base =
          app.config.appPublicUrl ||
          `https://${req.headers['x-forwarded-host'] || req.headers.host || ''}`;
        await app.mailer.sendPasswordReset({
          to: doc.email,
          link: `${base}/signin?reset=${encodeURIComponent(token)}`,
          lang: req.body.lang || 'fr',
          expiresInMinutes: Math.round(app.resetTokens.ttlMs / 60000),
        });
      } catch (err) {
        // Un relais SMTP en panne ne doit ni faire fuiter l'existence du compte,
        // ni remonter en 500 : on trace et on répond comme si tout allait bien.
        req.log?.error({ err }, 'envoi du mail de réinitialisation en échec');
      }
    }

    return reply.code(202).send({ ok: true });
  });

  app.post('/reset-password', { schema: { body: resetBody } }, async (req, reply) => {
    if (!isSameOrigin(req)) return fail(reply, 403, 'forbidden');

    const ipCheck = resetByIp.hit(req.ip || 'unknown');
    if (!ipCheck.allowed) {
      reply.header('retry-after', String(ipCheck.retryAfterSec));
      return fail(reply, 429, 'too_many_attempts', { retryAfter: ipCheck.retryAfterSec });
    }

    // Consommation atomique : le jeton est marqué utilisé dans la même
    // opération que sa lecture, un rejeu concurrent ne peut pas passer.
    const consumed = await app.resetTokens.consume(req.body.token);
    if (!consumed) return fail(reply, 410, 'invalid_or_expired_token');

    const doc = await app.users.findByEmailLower(consumed.emailLower);
    if (!doc || doc.disabled) return fail(reply, 410, 'invalid_or_expired_token');

    const policy = checkPasswordPolicy(req.body.password, { email: doc.email });
    if (!policy.ok) return fail(reply, 400, 'weak_password', { reason: policy.reason });

    const passwordHash = await hashPassword(req.body.password);
    await app.users.setPassword(consumed.emailLower, { passwordHash, mustChangePassword: false });
    // Le mot de passe a pu être réinitialisé parce qu'il était compromis :
    // toutes les sessions et tous les autres liens en vol tombent.
    await app.sessions.destroyAllFor(consumed.emailLower);
    await app.resetTokens.purgeFor(consumed.emailLower);

    return { ok: true };
  });
}
