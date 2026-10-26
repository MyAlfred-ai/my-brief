/**
 * Authentification de l'app mobile (Capacitor) — montée à la RACINE, hors /api.
 *
 * Rapatriée du sidecar `services/mobile-auth` (Node http brut, CJS, sans le
 * moindre test) : mêmes chemins, mêmes corps de réponse, mêmes noms de
 * variables d'environnement, donc aucun changement côté app installée ni côté
 * exploitant. Ce qui change est ce qui n'était pas tenable :
 *
 *   - l'identité était résolue DEUX fois dans le produit, avec deux règles
 *     différentes, pilotées par une variable (`MOBILE_AUTH_IDENTITY`) qui
 *     devait rester en phase avec un label Traefik — désaccord = OTT émis sur
 *     une identité d'en-tête forgée. Ici, c'est lib/auth/resolve.js qui
 *     tranche, comme pour tout le reste de l'API, et le marqueur `noident`
 *     (infalsifiable, réécrit par Traefik) suffit à disqualifier les en-têtes ;
 *   - le mode `session` faisait un aller-retour HTTP vers l'API pour résoudre
 *     un cookie : c'est désormais un appel de fonction ;
 *   - le nom du cookie de session était codé en dur ici et là-bas.
 *
 * Flux :
 *   1. L'app ouvre `/auth/mobile/start?cc=<sha256(verifier)>` dans le
 *      navigateur système. On mint un OTT lié à ce challenge et on répond une
 *      page 200 qui rebondit vers `mybrief://auth/callback?ott=…`. (Un 302 vers
 *      un scheme custom est bloqué par certaines Custom Tabs sans geste
 *      utilisateur ; une page avec un lien visible marche partout.)
 *   2. L'app échange OTT + verifier sur POST /auth/mobile/exchange contre un
 *      JWT de longue durée.
 *   3. Chaque appel API part en `Authorization: Bearer …` ; un routeur Traefik
 *      dédié le fait valider par ForwardAuth → GET /auth/verify, qui renvoie
 *      les mêmes en-têtes d'identité que le plugin OIDC.
 *
 * ⚠️ Le routeur Traefik de `/auth/mobile/start` DOIT porter un middleware qui
 * établit l'identité : le plugin `oidc`, ou `noident` (session native). Sans
 * l'un des deux, la route est atteinte sans identité — elle répond alors par
 * une redirection vers l'écran de connexion, jamais par un OTT.
 */
import { createRateLimiter } from '../lib/auth/rateLimit.js';
import { resolveIdentity } from '../lib/auth/resolve.js';
import { clearSessionCookie } from '../lib/auth/cookies.js';
import { createOttStore, CODE_CHALLENGE_RE } from '../lib/auth/mobileTokens.js';
import { signMobileJwt, verifyMobileJwt, bearerOf, isUsableSecret } from '../lib/auth/mobileJwt.js';
import { utf8Header } from '../lib/identity.js';
import { safeNext } from '../lib/auth/safeNext.js';
import { fail } from '../lib/errors.js';
import { escapeHtml } from '../lib/text.js';

export const MOBILE_START_PATH = '/auth/mobile/start';
export const MOBILE_EXCHANGE_PATH = '/auth/mobile/exchange';
export const MOBILE_VERIFY_PATH = '/auth/verify';

/** Corps de l'échange : rien d'autre n'est lu, et 4 Ko suffisent largement. */
const EXCHANGE_BODY_LIMIT = 4096;

const EXCHANGE_SCHEMA = {
  body: {
    type: 'object',
    required: ['ott', 'verifier'],
    properties: {
      ott: { type: 'string', minLength: 1, maxLength: 200 },
      verifier: { type: 'string', minLength: 1, maxLength: 200 },
    },
  },
};

/**
 * Page de rebond vers l'app (200 + JS + lien visible — cf. en-tête).
 *
 * `</script>` DANS une chaîne JS reste un `</script>` pour le parseur HTML, qui
 * fermerait le bloc et exécuterait la suite comme du balisage : d'où
 * l'échappement de `<` en `<`, indispensable dès qu'une valeur entre dans
 * un `<script>` (ici l'URL de callback, qui vient de la configuration).
 */
function callbackPage(deepLink) {
  const safe = escapeHtml(deepLink);
  const inScript = JSON.stringify(deepLink).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyBrief — connexion</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;display:flex;min-height:100vh;
       align-items:center;justify-content:center;margin:0;background:#FFFEFC;color:#1a1a1a}
  .card{text-align:center;padding:2rem}
  a.btn{display:inline-block;margin-top:1rem;padding:.9rem 1.6rem;border-radius:12px;
        background:#F38400;color:#fff;text-decoration:none;font-weight:600}
</style></head>
<body><div class="card">
  <h1>Connexion réussie ✓</h1>
  <p>Retour vers l'application…</p>
  <a class="btn" href="${safe}">Revenir dans MyBrief</a>
</div>
<script>location.href = ${inScript};</script>
</body></html>`;
}

const errorPage = (title, detail) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
  `<title>MyBrief</title></head><body><h1>${escapeHtml(title)}</h1>` +
  `<p>${escapeHtml(detail)}</p></body></html>`;

/** @param {import('fastify').FastifyInstance} app */
export default function mobileAuthRoutes(app) {
  const { jwtSecret, jwtTtlDays, ottTtlMs, appCallback } = app.config.mobile;
  const enabled = isUsableSecret(jwtSecret);

  const otts = createOttStore({ ttlMs: ottTtlMs });
  const startByIp = createRateLimiter(app.config.rateLimits.mobileStartByIp);
  const exchangeByIp = createRateLimiter(app.config.rateLimits.mobileExchangeByIp);
  app.addHook('onClose', async () => {
    otts.stop();
    startByIp.stop();
    exchangeByIp.stop();
  });

  const html = (reply, status, body) =>
    reply
      .code(status)
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(body);

  app.get(MOBILE_START_PATH, async (req, reply) => {
    if (!enabled) {
      req.log?.error('MOBILE_AUTH_JWT_SECRET absent ou trop court — flux mobile éteint');
      return html(
        reply,
        503,
        errorPage('Configuration incomplète', "L'authentification mobile n'est pas configurée."),
      );
    }

    const cc = String(req.query?.cc || '');
    if (!CODE_CHALLENGE_RE.test(cc)) {
      return html(
        reply,
        400,
        errorPage('Requête invalide', 'Paramètre cc (code challenge) manquant.'),
      );
    }
    if (!startByIp.hit(req.ip || 'unknown').allowed) {
      return html(reply, 429, errorPage('Trop de tentatives', 'Réessayez dans quelques minutes.'));
    }

    // MÊME résolution que tout le reste de l'API : en-têtes d'identité si un
    // middleware d'authentification est devant, session native si le marqueur
    // `noident` est posé — jamais les deux, jamais deviné.
    const { user, sessionInvalid } = await resolveIdentity({
      req,
      users: app.users,
      sessions: app.sessions,
    });
    if (sessionInvalid) clearSessionCookie(reply, { secure: app.config.cookieSecure });

    if (!user) {
      // Personne n'est connecté dans ce navigateur (ou la route n'est pas
      // passée par le middleware attendu) : on envoie vers l'écran de
      // connexion, qui ramènera ICI une fois la session ouverte. Jamais d'OTT
      // sans identité établie.
      const back = safeNext(`${MOBILE_START_PATH}?cc=${encodeURIComponent(cc)}`);
      return reply.redirect(`/signin?next=${encodeURIComponent(back)}`, 302);
    }

    // `user`/`picture` n'existent que sur le chemin par en-têtes (le plugin les
    // injecte depuis les claims de l'IdP) ; sur le chemin natif, l'email fait
    // office d'identifiant et il n'y a pas d'avatar.
    const fromHeaders = user.source === 'headers';
    const identity = {
      user: (fromHeaders && utf8Header(req.headers, 'x-auth-request-user')) || user.email,
      email: user.email,
      name: user.name || '',
      picture: fromHeaders ? utf8Header(req.headers, 'x-user-picture') : '',
    };

    const ott = otts.issue(cc, identity);
    req.log?.info({ email: identity.email }, 'OTT mobile émis');
    return html(reply, 200, callbackPage(`${appCallback}?ott=${ott}`));
  });

  app.post(
    MOBILE_EXCHANGE_PATH,
    { schema: EXCHANGE_SCHEMA, bodyLimit: EXCHANGE_BODY_LIMIT },
    async (req, reply) => {
      if (!enabled) return fail(reply, 503, 'mobile_auth_disabled');
      if (!exchangeByIp.hit(req.ip || 'unknown').allowed) {
        return fail(reply, 429, 'too_many_attempts');
      }

      const { ott, verifier } = req.body || {};
      const result = otts.consume(ott, verifier);
      if (!result.ok) {
        if (result.reason === 'verifier_mismatch') {
          req.log?.warn('échange mobile refusé : verifier PKCE invalide');
        }
        return fail(reply, 401, result.reason);
      }

      const { identity } = result;
      const token = signMobileJwt(
        {
          sub: identity.email || identity.user,
          user: identity.user,
          email: identity.email,
          name: identity.name,
          picture: identity.picture,
        },
        { secret: jwtSecret, ttlDays: jwtTtlDays },
      );
      req.log?.info({ sub: identity.email || identity.user }, 'JWT mobile émis');
      return reply.send({
        token,
        user: { email: identity.email, name: identity.name, picture: identity.picture },
      });
    },
  );

  /**
   * Cible du ForwardAuth Traefik. N'est routée depuis l'extérieur par aucun
   * compose : Traefik l'appelle sur le réseau interne.
   */
  app.get(MOBILE_VERIFY_PATH, async (req, reply) => {
    const token = bearerOf(req.headers.authorization);
    if (!token) return fail(reply, 401, 'missing_bearer');
    const claims = verifyMobileJwt(token, { secret: jwtSecret });
    if (!claims) return fail(reply, 401, 'invalid_token');

    // TOUJOURS les quatre en-têtes, même vides : ForwardAuth les recopie vers
    // la requête upstream et écrase ainsi toute valeur forgée par le client.
    // X-User-Name : mêmes octets sur le fil que traefikoidc — Node n'accepte
    // que du latin1 dans un en-tête, on y transpose les octets UTF-8.
    reply.header('X-Auth-Request-User', String(claims.user || claims.sub || ''));
    reply.header('X-User-Email', String(claims.email || ''));
    reply.header('X-User-Name', Buffer.from(String(claims.name || ''), 'utf8').toString('latin1'));
    reply.header('X-User-Picture', String(claims.picture || ''));
    return reply.send({ ok: true });
  });
}
