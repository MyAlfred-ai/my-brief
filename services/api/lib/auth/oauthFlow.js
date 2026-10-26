/**
 * Mécanique commune des flux OAuth 2.0 / OIDC de l'API.
 *
 * Deux flux la partagent, pour des finalités différentes :
 *   - routes/auth/ssoFlow.js — CONNEXION (ouvre une session native) ;
 *   - routes/connect.js      — AUTORISATION d'un compte externe (stocke un
 *     refresh token pour envoyer des mails et déposer des documents).
 *
 * Ils avaient chacun leur copie du même enchaînement : PKCE, state en base,
 * cookie d'état, contrôle au retour, échange du code, lecture du profil. Deux
 * copies d'un contrôle anti-CSRF, c'est une copie qui peut être corrigée seule
 * — d'où ce module.
 *
 * Ce qui n'est PAS ici, et qui reste propre à chaque flux : où rediriger en cas
 * d'échec (l'écran de connexion vs le panneau de configuration), et ce qu'on
 * fait du profil obtenu. Les deux appelants gardent donc leur try/catch et leur
 * table de slugs d'erreur.
 */
import { serializeCookie, readCookie, appendCookie } from './cookies.js';
import {
  getEndpoints,
  createPkcePair,
  buildAuthorizationUrl,
  exchangeCode,
  fetchUserInfo,
  readIdTokenClaims,
} from './oidcClient.js';

/**
 * Cookie d'état d'UN flux. Le login et la connexion d'un compte Google ont
 * chacun le leur (`mybrief_oauth`, `mybrief_oauth_connect`) : les deux peuvent
 * être en vol dans le même navigateur sans s'écraser. La connexion d'un compte
 * Microsoft partage celui du login, pour une raison de routage détaillée dans
 * lib/connections/providers.js.
 *
 * Le cookie est ce qui lie le flux À CE navigateur. Sans lui, un attaquant
 * pourrait faire consommer SON code d'autorisation par la victime (login CSRF).
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {string} name - nom du cookie
 * @returns {{name: string, set(reply: object, state: string): void, clear(reply: object): void}}
 */
export function createStateCookie(app, name) {
  return {
    name,
    set(reply, state) {
      appendCookie(
        reply,
        serializeCookie(name, state, {
          maxAgeSec: Math.floor(app.oauthStates.ttlMs / 1000),
          secure: app.config.cookieSecure,
        }),
      );
    },
    clear(reply) {
      appendCookie(
        reply,
        serializeCookie(name, '', { maxAgeSec: 0, secure: app.config.cookieSecure }),
      );
    },
  };
}

/**
 * Endpoints de l'IdP, résolus depuis les réglages du fournisseur.
 * @param {object} provider - entrée de lib/auth/providers.js
 * @param {object} conf - réglages du fournisseur (clientId, discoveryUrl…)
 */
export function endpointsFor(provider, conf) {
  return getEndpoints({
    discoveryUrl: provider.discoveryUrlOf(conf),
    fallback: provider.fallbackEndpoints,
  });
}

/**
 * Départ d'un flux : PKCE, state persisté, cookie posé, URL d'autorisation.
 *
 * Le `code_verifier` PKCE ne transite JAMAIS par le navigateur : il vit dans le
 * document d'état, retrouvé au retour par le `state`.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('fastify').FastifyRequest} req
 * @param {import('fastify').FastifyReply} reply
 * @param {object} opts
 * @param {{set: Function}} opts.cookie - cookie d'état du flux
 * @param {string} opts.flow - marqueur relu au retour (id de fournisseur, ou
 *   nom de flux comme `google-mail`) : un state émis ailleurs ne vaut pas ici
 * @param {string} opts.clientId
 * @param {string} opts.redirectUri
 * @param {object} opts.endpoints
 * @param {string} opts.scopes
 * @param {string} [opts.next] - destination après le flux (validée par safeNext)
 * @param {object|null} [opts.meta] - charge utile propre au flux
 * @param {Record<string,string>} [opts.extraParams] - paramètres d'autorisation
 *   supplémentaires (ex. access_type/prompt pour obtenir un refresh token)
 * @returns {Promise<string>} URL vers laquelle rediriger l'utilisateur
 */
export async function startOAuth(
  app,
  req,
  reply,
  { cookie, flow, clientId, redirectUri, endpoints, scopes, next, meta = null, extraParams = null },
) {
  const { verifier, challenge } = createPkcePair();
  const { state } = await app.oauthStates.issue({
    codeVerifier: verifier,
    redirectUri,
    provider: flow,
    ...(next === undefined ? {} : { next }),
    ip: req.ip,
    meta,
  });

  cookie.set(reply, state);

  const url = new URL(
    buildAuthorizationUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge: challenge,
      endpoints,
      scopes,
    }),
  );
  for (const [key, value] of Object.entries(extraParams || {})) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Retour de l'IdP : contrôle du state, puis consommation.
 *
 * TRIPLE contrôle — URL == cookie == document non consommé en base — plus le
 * marqueur de flux : un code obtenu sur un flux ne doit pas pouvoir être
 * échangé sur un autre. Le cookie est purgé dans tous les cas, y compris quand
 * le contrôle échoue : un state grillé ne doit pas rester en vol.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {import('fastify').FastifyRequest} req
 * @param {import('fastify').FastifyReply} reply
 * @param {{cookie: object, flow: string, state?: string, code?: string}} opts
 * @returns {Promise<{ok: true, pending: object}|{ok: false}>}
 */
export async function consumeState(app, req, reply, { cookie, flow, state, code }) {
  const cookieState = readCookie(req, cookie.name);
  cookie.clear(reply);
  if (!state || !cookieState || state !== cookieState) return { ok: false };

  const pending = await app.oauthStates.consume(state);
  if (!pending || !code) return { ok: false };
  // Documents émis avant l'ajout du champ : c'était forcément Google.
  if ((pending.provider || 'google') !== flow) return { ok: false };

  return { ok: true, pending };
}

/**
 * Claims que l'id_token peut COMPLÉTER — ceux que `userinfo` ne porte pas chez
 * Entra. `email` et `email_verified` n'y figurent pas, volontairement : les deux
 * sources en donnent la même valeur, et reprendre une adresse sans son
 * attestation pourrait faire passer pour vérifiée une adresse qui ne l'est pas.
 */
const ID_TOKEN_FILLABLE_CLAIMS = ['preferred_username', 'upn', 'name'];

/**
 * Profil de l'utilisateur : `userinfo`, complété par l'id_token.
 *
 * `userinfo` garde le dernier mot : l'id_token ne remplit que ses trous. Deux
 * `sub` différents désignent deux personnes — rien n'est alors emprunté
 * (OpenID Connect Core §5.3.4), et le profil reste celui d'avant ce complément.
 *
 * @param {object} userinfo - réponse de l'endpoint userinfo
 * @param {object} idClaims - claims de l'id_token (cf. readIdTokenClaims)
 * @returns {object}
 */
export function mergeIdentityClaims(userinfo, idClaims) {
  const profile = { ...(userinfo || {}) };
  if (!idClaims?.sub || (profile.sub && profile.sub !== idClaims.sub)) return profile;
  for (const claim of ID_TOKEN_FILLABLE_CLAIMS) {
    if (!profile[claim] && idClaims[claim]) profile[claim] = idClaims[claim];
  }
  return profile;
}

/**
 * Échange du code d'autorisation puis lecture du profil.
 * Lève si l'IdP refuse — l'appelant décide du slug d'erreur et de la
 * destination.
 *
 * @param {{code: string, conf: {clientId: string, clientSecret: string},
 *          pending: {redirectUri: string, codeVerifier: string}, endpoints: object}} opts
 * @returns {Promise<{tokens: object, profile: object}>}
 */
export async function exchangeForProfile({ code, conf, pending, endpoints }) {
  const tokens = await exchangeCode({
    code,
    clientId: conf.clientId,
    clientSecret: conf.clientSecret,
    redirectUri: pending.redirectUri,
    codeVerifier: pending.codeVerifier,
    endpoints,
  });
  const userinfo = await fetchUserInfo({ accessToken: tokens.access_token, endpoints });
  const profile = mergeIdentityClaims(userinfo, readIdTokenClaims(tokens.id_token, conf.clientId));
  return { tokens, profile };
}
