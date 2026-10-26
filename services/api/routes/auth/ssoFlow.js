/**
 * Flux OIDC partagé par tous les fournisseurs du registre (lib/auth/providers.js).
 *
 * Les deux routes sont des NAVIGATIONS top-level, pas des appels fetch : elles
 * répondent donc par des redirections, jamais par du JSON. Les échecs partent
 * vers `/signin?error=<slug>`, que l'écran de connexion traduit.
 *
 * À l'arrivée, l'utilisateur reçoit une session NATIVE (cookie `mybrief_sess`),
 * identique à celle d'une connexion par mot de passe : un seul type de session
 * à révoquer, à expirer et à router — quel que soit le fournisseur.
 */
import { createRateLimiter } from '../../lib/auth/rateLimit.js';
import { publicOrigin } from '../../lib/auth/originCheck.js';
import { setSessionCookie } from '../../lib/auth/cookies.js';
import { OAUTH_STATE_COOKIE } from '../../lib/auth/oauthState.js';
import {
  createStateCookie,
  endpointsFor,
  startOAuth,
  consumeState,
  exchangeForProfile,
} from '../../lib/auth/oauthFlow.js';
import { isDomainAllowed } from '../../lib/auth/domains.js';
import { normalizeEmail } from '../../lib/repositories/users.js';
import { isProviderUsable } from '../../lib/auth/providers.js';
import { safeNext } from '../../lib/auth/safeNext.js';

const signInUrl = (error) => (error ? `/signin?error=${encodeURIComponent(error)}` : '/');

/**
 * Comptes déjà présents sous l'une des adresses du profil, dans l'ordre des
 * claims (cf. `emailsOf` dans lib/auth/providers.js).
 * @param {object} users - dépôt des utilisateurs
 * @param {string[]} emails
 * @returns {Promise<object[]>}
 */
async function existingAccounts(users, emails) {
  const accounts = [];
  for (const email of emails) {
    const doc = await users.findByEmailLower(normalizeEmail(email));
    if (doc) accounts.push(doc);
  }
  return accounts;
}

/**
 * Démarrage du flux : redirige vers l'IdP.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} provider - entrée de PROVIDERS
 */
export function createStartHandler(app, provider) {
  const byIp = createRateLimiter(app.config.rateLimits.ssoStartByIp);
  app.addHook('onClose', async () => byIp.stop());
  const stateCookie = createStateCookie(app, OAUTH_STATE_COOKIE);

  return async function start(req, reply) {
    const check = byIp.hit(req.ip || 'unknown');
    if (!check.allowed) return reply.redirect(signInUrl('too_many_attempts'), 302);

    const settings = await app.settings.get();
    if (!isProviderUsable(provider.id, settings)) {
      return reply.redirect(signInUrl(provider.errors.disabled), 302);
    }
    const conf = settings[provider.id];

    let endpoints;
    try {
      endpoints = await endpointsFor(provider, conf);
    } catch (err) {
      // Découverte injoignable et pas de repli (Entra) : sans endpoints, on ne
      // sait pas où envoyer l'utilisateur.
      req.log?.error({ err, provider: provider.id }, 'découverte OIDC en échec');
      return reply.redirect(signInUrl(provider.errors.failed), 302);
    }

    const url = await startOAuth(app, req, reply, {
      cookie: stateCookie,
      flow: provider.id,
      clientId: conf.clientId,
      redirectUri: `${publicOrigin(req, app.config)}${provider.callbackPath}`,
      endpoints,
      scopes: provider.scopes,
      // Où revenir après connexion — le flux mobile s'en sert pour reprendre son
      // `/auth/mobile/start`. Validé ici, stocké en base, jamais transmis à l'IdP.
      next: safeNext(req.query?.next),
    });
    return reply.redirect(url, 302);
  };
}

/**
 * Retour de l'IdP : vérifie, échange, ouvre la session.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} provider - entrée de PROVIDERS
 */
export function createCallbackHandler(app, provider) {
  const stateCookie = createStateCookie(app, OAUTH_STATE_COOKIE);

  return async function callback(req, reply) {
    const query = req.query || {};

    // L'utilisateur a refusé l'autorisation, ou l'IdP a rejeté la requête.
    if (query.error) {
      stateCookie.clear(reply);
      const slug =
        query.error === 'access_denied' ? provider.errors.cancelled : provider.errors.failed;
      return reply.redirect(signInUrl(slug), 302);
    }

    // Triple contrôle du state + marqueur de fournisseur — cf. lib/auth/oauthFlow.js.
    const checked = await consumeState(app, req, reply, {
      cookie: stateCookie,
      flow: provider.id,
      state: query.state,
      code: query.code,
    });
    if (!checked.ok) return reply.redirect(signInUrl(provider.errors.stateMismatch), 302);
    const { pending } = checked;

    const settings = await app.settings.get();
    if (!isProviderUsable(provider.id, settings)) {
      return reply.redirect(signInUrl(provider.errors.disabled), 302);
    }
    const conf = settings[provider.id];

    let profile;
    try {
      const endpoints = await endpointsFor(provider, conf);
      ({ profile } = await exchangeForProfile({ code: query.code, conf, pending, endpoints }));
    } catch (err) {
      req.log?.error({ err, provider: provider.id }, 'échec du flux OIDC');
      return reply.redirect(signInUrl(provider.errors.failed), 302);
    }

    const emails = provider.emailsOf(profile);
    if (!emails.length || (provider.requireVerifiedEmail && profile?.email_verified === false)) {
      return reply.redirect(signInUrl(provider.errors.email), 302);
    }

    const accounts = await existingAccounts(app.users, emails);
    // Un seul compte désactivé suffit : c'est la décision d'un administrateur
    // sur cette personne, sous quelque adresse qu'elle se présente.
    if (accounts.some((account) => account.disabled)) {
      return reply.redirect(signInUrl('account_disabled'), 302);
    }
    // Plusieurs comptes : celui de la première adresse qui en a un, dans l'ordre
    // des claims. L'adresse email passant d'abord, une personne qui avait déjà
    // un compte sous elle retrouve celui-là.
    let doc = accounts[0];
    const picture = provider.pictureOf(profile);

    if (!doc) {
      // Pas d'inscription libre : seul un domaine explicitement autorisé donne
      // droit à la création automatique. Liste vide ⇒ personne (cf. lib/auth/domains.js).
      const email = emails.find((candidate) => isDomainAllowed(candidate, settings.allowedDomains));
      if (!email) return reply.redirect(signInUrl('domain_not_allowed'), 302);
      doc = await app.users.create({
        email,
        name: profile.name || undefined,
        role: 'user',
        authProvider: provider.id,
        picture,
      });
    } else {
      if (!(doc.authProviders || []).includes(provider.id)) {
        await app.users.addAuthProvider(doc.emailLower, provider.id);
      }
      // À chaque connexion : la photo change chez l'IdP sans nous prévenir.
      if (picture && picture !== doc.picture) await app.users.setPicture(doc.emailLower, picture);
    }

    const { token } = await app.sessions.create(doc.emailLower, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      provider: provider.id,
    });
    setSessionCookie(reply, token, {
      maxAgeMs: app.sessions.ttlMs,
      secure: app.config.cookieSecure,
    });
    // `pending.next` a été validé au départ du flux et n'a pas quitté la base :
    // on le revalide quand même, la base n'étant pas un périmètre de confiance
    // pour une redirection.
    return reply.redirect(safeNext(pending.next), 302);
  };
}
