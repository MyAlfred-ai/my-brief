/**
 * Jeton porteur de l'app mobile (JWT HS256).
 *
 * Émis à l'échange de l'OTT, présenté ensuite sur chaque appel API en
 * `Authorization: Bearer …`. Traefik le fait valider par ForwardAuth →
 * `GET /auth/verify` (routes/mobileAuth.js), qui réinjecte les mêmes en-têtes
 * d'identité que le plugin OIDC : le reste du backend ne voit aucune
 * différence entre un utilisateur web et un utilisateur mobile.
 *
 * ⚠️ `mybrief-mobile-auth` est l'`iss` des jetons émis par l'ancien sidecar,
 * dont certains sont dans la nature pour 30 jours. Le renommer déconnecterait
 * tous les téléphones à la mise à jour — il reste tel quel, c'est un
 * identifiant de compatibilité, plus un nom de service.
 *
 * Non révocable (stateless, V1) : pour invalider l'ensemble du parc, faire
 * tourner MOBILE_AUTH_JWT_SECRET.
 */
import jwt from 'jsonwebtoken';

export const MOBILE_JWT_ISSUER = 'mybrief-mobile-auth';

/** Longueur minimale du secret — en deçà, la fonctionnalité reste éteinte. */
export const MIN_SECRET_LENGTH = 32;

/** @param {string} secret @returns {boolean} */
export function isUsableSecret(secret) {
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH;
}

/**
 * @param {{sub: string, user: string, email: string, name: string, picture: string}} claims
 * @param {{secret: string, ttlDays: number}} opts
 * @returns {string}
 */
export function signMobileJwt(claims, { secret, ttlDays }) {
  return jwt.sign(claims, secret, {
    algorithm: 'HS256',
    expiresIn: `${ttlDays}d`,
    issuer: MOBILE_JWT_ISSUER,
  });
}

/**
 * @param {string} token
 * @param {{secret: string}} opts
 * @returns {object|null} claims, ou null si le jeton est refusé
 */
export function verifyMobileJwt(token, { secret }) {
  if (!isUsableSecret(secret) || !token) return null;
  try {
    // `algorithms` ÉPINGLÉ : sans cette liste, jsonwebtoken accepterait un
    // jeton forgé en `alg: none`, ou un RS256 dont la « clé publique » serait
    // notre secret HMAC (confusion d'algorithme). C'est la classe de faille
    // la plus courante sur les JWT.
    return jwt.verify(token, secret, { algorithms: ['HS256'], issuer: MOBILE_JWT_ISSUER });
  } catch {
    return null;
  }
}

/** Extrait le jeton d'un en-tête Authorization. @returns {string} '' si absent */
export function bearerOf(authorization) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization || ''));
  return match ? match[1] : '';
}
