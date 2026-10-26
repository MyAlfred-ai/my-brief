/**
 * Changement de mot de passe par l'utilisateur connecté.
 */
import { hashPassword, verifyPassword, checkPasswordPolicy } from '../../lib/auth/password.js';
import { setSessionCookie } from '../../lib/auth/cookies.js';
import { createRateLimiter } from '../../lib/auth/rateLimit.js';
import { isSameOrigin } from '../../lib/auth/originCheck.js';
import { requireUser } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { changePasswordBody } from './schemas.js';

export default function passwordRoutes(app) {
  const limiter = createRateLimiter(app.config.rateLimits.passwordChange);
  app.addHook('onClose', async () => limiter.stop());

  app.post('/change-password', { schema: { body: changePasswordBody } }, async (req, reply) => {
    if (!isSameOrigin(req)) return fail(reply, 403, 'forbidden');
    const user = requireUser(req, reply);
    if (!user) return;

    const check = limiter.hit(user.emailLower);
    if (!check.allowed) {
      reply.header('retry-after', String(check.retryAfterSec));
      return fail(reply, 429, 'too_many_attempts', { retryAfter: check.retryAfterSec });
    }

    const doc = await app.users.findByEmailLower(user.emailLower);
    // Compte OIDC qui n'a jamais eu de mot de passe : il n'y a rien à
    // « changer ». Le distinguer d'un mot de passe faux est sans risque, la
    // route exige déjà une session valide.
    if (!doc?.passwordHash) return fail(reply, 409, 'password_not_set');

    if (!(await verifyPassword(req.body.currentPassword, doc.passwordHash))) {
      return fail(reply, 403, 'invalid_current_password');
    }

    const policy = checkPasswordPolicy(req.body.newPassword, { email: doc.email });
    if (!policy.ok) return fail(reply, 400, 'weak_password', { reason: policy.reason });

    const passwordHash = await hashPassword(req.body.newPassword);
    await app.users.setPassword(user.emailLower, { passwordHash, mustChangePassword: false });

    // Toutes les sessions tombent : changer son mot de passe doit déconnecter
    // les autres appareils. On en recrée aussitôt une pour l'auteur, qui ne
    // doit pas se déconnecter lui-même en cours de route.
    await app.sessions.destroyAllFor(user.emailLower);
    await app.resetTokens.purgeFor(user.emailLower);
    if (user.source === 'session') {
      const { token } = await app.sessions.create(user.emailLower, {
        // La session est RECRÉÉE, pas rouverte : elle garde le fournisseur qui
        // l'avait ouverte. Forcer `password` ici ferait basculer l'avatar d'un
        // utilisateur Google au seul motif qu'il s'est posé un mot de passe.
        provider: user.sessionProvider || 'password',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      setSessionCookie(reply, token, {
        maxAgeMs: app.sessions.ttlMs,
        secure: app.config.cookieSecure,
      });
    }

    return reply.code(204).send();
  });
}
