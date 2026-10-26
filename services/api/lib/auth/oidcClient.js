/**
 * Client OAuth 2.0 / OpenID Connect générique — joué par l'API elle-même.
 *
 * Généralisation de l'ancien `googleOAuth.js` : rien ici ne connaît Google ni
 * Entra. Ce qui distingue un fournisseur (URL de découverte, scopes, claim
 * porteur de l'email) vit dans `providers.js` ; ce module ne fait que parler
 * OIDC.
 *
 * L'identité est lue sur l'endpoint `userinfo` avec l'access_token plutôt qu'en
 * validant la signature de l'id_token : la réponse vient directement de l'IdP
 * sur TLS, exactement comme l'échange du code. Ça évite d'embarquer une
 * vérification JWKS (récupération des clés, rotation, cache) pour un gain de
 * sécurité nul ici.
 *
 * L'id_token est tout de même LU, pour ce que `userinfo` ne sait pas dire :
 * chez Entra, l'identifiant de connexion (cf. readIdTokenClaims).
 */
import { createHash, randomBytes } from 'node:crypto';

const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, {at: number, endpoints: object}>} — une entrée par URL de découverte */
const discoveryCache = new Map();

/**
 * @param {{discoveryUrl: string, fallback?: object|null, fetchImpl?: Function}} params
 * @returns {Promise<{authorization_endpoint: string, token_endpoint: string, userinfo_endpoint: string}>}
 * @throws {Error} si la découverte échoue ET qu'aucun repli n'est fourni — c'est
 *   le cas des fournisseurs dont les endpoints dépendent du tenant (Entra) : les
 *   deviner produirait des redirections vers le mauvais annuaire.
 */
export async function getEndpoints({ discoveryUrl, fallback = null, fetchImpl = fetch }) {
  if (!discoveryUrl) {
    if (fallback) return fallback;
    throw new Error('discovery_url_missing');
  }

  const cached = discoveryCache.get(discoveryUrl);
  const now = Date.now();
  if (cached && now - cached.at < DISCOVERY_TTL_MS) return cached.endpoints;

  try {
    const res = await fetchImpl(discoveryUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`discovery ${res.status}`);
    const doc = await res.json();
    const endpoints = {
      authorization_endpoint: doc.authorization_endpoint || fallback?.authorization_endpoint,
      token_endpoint: doc.token_endpoint || fallback?.token_endpoint,
      userinfo_endpoint: doc.userinfo_endpoint || fallback?.userinfo_endpoint,
    };
    if (
      !endpoints.authorization_endpoint ||
      !endpoints.token_endpoint ||
      !endpoints.userinfo_endpoint
    ) {
      throw new Error('discovery_incomplete');
    }
    discoveryCache.set(discoveryUrl, { at: now, endpoints });
    return endpoints;
  } catch (err) {
    if (fallback) return fallback;
    throw err;
  }
}

/** PKCE S256 — recommandé même pour un client confidentiel, il neutralise l'interception du code. */
export function createPkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * @param {{clientId: string, redirectUri: string, state: string, codeChallenge: string,
 *          endpoints: object, scopes?: string, loginHint?: string}} params
 * @returns {string} URL d'autorisation
 */
export function buildAuthorizationUrl({
  clientId,
  redirectUri,
  state,
  codeChallenge,
  endpoints,
  scopes = 'openid email profile',
  loginHint,
}) {
  const url = new URL(endpoints.authorization_endpoint);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // `select_account` : sans lui, un navigateur déjà connecté à un compte
  // reconnecte silencieusement CE compte — impossible d'en changer après une
  // déconnexion, ce qui est déroutant sur un poste partagé.
  url.searchParams.set('prompt', 'select_account');
  if (loginHint) url.searchParams.set('login_hint', loginHint);
  return url.toString();
}

/**
 * @returns {Promise<{access_token: string}>}
 * @throws {Error} si l'IdP refuse l'échange
 */
export async function exchangeCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
  codeVerifier,
  endpoints,
  fetchImpl = fetch,
}) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  const res = await fetchImpl(endpoints.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    // Le corps peut contenir le client_secret en écho selon les erreurs : on ne
    // remonte que le code HTTP.
    throw new Error(`token_exchange_failed_${res.status}`);
  }
  return res.json();
}

/**
 * @returns {Promise<{email?: string, email_verified?: boolean, preferred_username?: string,
 *                    upn?: string, name?: string, sub: string}>}
 */
export async function fetchUserInfo({ accessToken, endpoints, fetchImpl = fetch }) {
  const res = await fetchImpl(endpoints.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`userinfo_failed_${res.status}`);
  return res.json();
}

/**
 * Claims de l'id_token rendu par l'échange du code.
 *
 * Pourquoi le lire : l'endpoint `userinfo` d'Entra ne renvoie que `sub`, les
 * noms, `picture` et `email` — Microsoft documente cette liste comme complète.
 * `preferred_username` (l'UPN) n'existe QUE dans l'id_token. Sans lui, un compte
 * dont l'annuaire ne publie pas d'adresse `mail` n'arrivait avec aucun
 * identifiant, et ne pouvait pas se connecter.
 *
 * Pourquoi sans vérifier la signature : le jeton arrive DIRECTEMENT du token
 * endpoint, sur TLS, en réponse à un échange authentifié par le secret client —
 * OpenID Connect Core §3.1.3.7 admet alors TLS comme preuve d'origine. Même
 * raisonnement que pour `userinfo`, cf. en-tête.
 *
 * L'audience, elle, est contrôlée : un jeton émis pour une autre application ne
 * dit rien de l'utilisateur de celle-ci.
 *
 * @param {string|undefined} idToken
 * @param {string} clientId
 * @returns {object} claims, ou `{}` si le jeton manque, est illisible ou ne
 *   nous est pas destiné — l'appelant retombe alors sur `userinfo` seul
 */
export function readIdTokenClaims(idToken, clientId) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3 || !clientId) return {};
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return {};
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return audiences.includes(clientId) ? claims : {};
}

/** Réinitialise le cache de découverte — pour les tests. */
export function resetDiscoveryCache() {
  discoveryCache.clear();
}
