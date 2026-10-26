/**
 * Connexion et déconnexion par mot de passe.
 */
import { verifyPassword, burnVerify } from '../../lib/auth/password.js';
import { setSessionCookie, clearSessionCookie } from '../../lib/auth/cookies.js';
import { createRateLimiter } from '../../lib/auth/rateLimit.js';
import { isSameOrigin } from '../../lib/auth/originCheck.js';
import { normalizeEmail, toSessionUser } from '../../lib/repositories/users.js';
import { fail } from '../../lib/errors.js';
import { loginBody } from './schemas.js';

export default function loginRoutes(app) {
  // Deux compteurs : par IP contre le balayage large, par compte contre le
  // bourrinage ciblé (le second est le seul qui protège vraiment un utilisateur
  // précis, et c'est celui qu'aucun plugin générique ne fournit).
  // Fenêtres : lib/config.js `rateLimits` (surchageables en test).
  const byIp = createRateLimiter(app.config.rateLimits.loginByIp);
  const byAccount = createRateLimiter(app.config.rateLimits.loginByAccount);
  app.addHook('onClose', async () => {
    byIp.stop();
    byAccount.stop();
  });

  app.post('/login', { schema: { body: loginBody } }, async (req, reply) => {
    if (!isSameOrigin(req)) return fail(reply, 403, 'forbidden');
    if (!app.config.passwordLoginEnabled) return fail(reply, 501, 'password_login_disabled');
    // Mode masqué depuis l'administration : la route refuse aussi. Le bouton a
    // disparu de l'écran de connexion, mais l'API ne se fie jamais à ce que
    // l'écran affiche.
    if (!(await app.settings.get()).passwordLogin.enabled) {
      return fail(reply, 501, 'password_login_disabled');
    }

    const emailLower = normalizeEmail(req.body.email);
    const { password } = req.body;

    const ipCheck = byIp.hit(req.ip || 'unknown');
    if (!ipCheck.allowed) {
      reply.header('retry-after', String(ipCheck.retryAfterSec));
      return fail(reply, 429, 'too_many_attempts', { retryAfter: ipCheck.retryAfterSec });
    }
    const accountCheck = byAccount.hit(emailLower);
    if (!accountCheck.allowed) {
      reply.header('retry-after', String(accountCheck.retryAfterSec));
      return fail(reply, 429, 'too_many_attempts', { retryAfter: accountCheck.retryAfterSec });
    }

    const doc = await app.users.findByEmailLower(emailLower);

    // Compte inconnu, désactivé ou sans mot de passe : on brûle quand même le
    // temps CPU d'une vérification. Sans ça, l'écart de latence (~60 ms contre
    // ~0 ms) est un oracle d'énumération d'utilisateurs parfaitement fiable.
    const ok =
      doc && !doc.disabled && doc.passwordHash
        ? await verifyPassword(password, doc.passwordHash)
        : await burnVerify(password);

    // Réponse STRICTEMENT identique dans les quatre cas d'échec : même code,
    // même corps. Toute différence renseignerait sur l'existence du compte.
    if (!ok) return fail(reply, 401, 'invalid_credentials');

    byIp.reset(req.ip || 'unknown');
    byAccount.reset(emailLower);

    const { token } = await app.sessions.create(doc.emailLower, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      provider: 'password',
    });
    setSessionCookie(reply, token, {
      maxAgeMs: app.sessions.ttlMs,
      secure: app.config.cookieSecure,
    });

    return {
      user: toSessionUser(doc, {
        groups: await app.groups.forUser(doc),
        rights: await app.groups.rightsForUser(doc),
      }),
    };
  });

  /** Idempotent : toujours 204, même sans session — le frontend n'a rien à tester. */
  app.post('/logout', async (req, reply) => {
    if (req.user?.sessionToken) await app.sessions.destroy(req.user.sessionToken);
    clearSessionCookie(reply, { secure: app.config.cookieSecure });
    return reply.code(204).send();
  });
}
