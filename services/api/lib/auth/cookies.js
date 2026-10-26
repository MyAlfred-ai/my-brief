/**
 * Cookie de session native.
 *
 * Pourquoi pas @fastify/cookie : on n'a qu'un seul cookie à lire et à poser, et
 * le plugin devrait être enregistré à la RACINE de buildApp (pas dans le
 * contexte /api) sinon `req.cookies` serait undefined dans notre hook onRequest
 * — les hooks du parent tournent avant ceux de l'enfant. 60 lignes sans
 * dépendance évitent ce piège d'ordre.
 *
 * Le nom du cookie est FIXE : il est câblé dans la règle de routage Traefik
 * (`HeaderRegexp(Cookie, (^|;\s*)mybrief_sess=)`). Le renommer sans toucher les
 * deux composes enverrait toutes les requêtes de session native dans le flux
 * OIDC. Il ne contient par ailleurs ni « oidc », ni « oauth », ni « traefik »,
 * ni « _state » : la boucle de purge de forceReauth() côté frontend ne le
 * ramasse pas (src/utils/httpErrorHandler.js) — à préserver.
 */
export const SESSION_COOKIE = 'mybrief_sess';

/**
 * @param {import('fastify').FastifyRequest} req
 * @param {string} name
 * @returns {string} valeur, ou '' si absente
 */
export function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return '';
}

/** @param {import('fastify').FastifyRequest} req */
export function readSessionToken(req) {
  return readCookie(req, SESSION_COOKIE);
}

/**
 * @param {string} name
 * @param {string} value
 * @param {{maxAgeSec?: number, secure?: boolean, sameSite?: string, path?: string}} [opts]
 */
export function serializeCookie(name, value, opts = {}) {
  const { maxAgeSec, secure = true, sameSite = 'Lax', path = '/' } = opts;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    'HttpOnly',
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push('Secure');
  if (Number.isInteger(maxAgeSec)) parts.push(`Max-Age=${maxAgeSec}`);
  // Pas d'attribut Domain : cookie host-only, il ne fuite pas vers les
  // sous-domaines (le cookie OIDC, lui, est posé sur ${DOMAIN} par le plugin).
  return parts.join('; ');
}

/**
 * Ajoute un Set-Cookie sans écraser les précédents.
 *
 * `reply.header()` REMPLACE la valeur : poser successivement deux cookies
 * (purge de l'état OAuth puis ouverture de session, par exemple) en perdrait
 * un silencieusement. Fastify accepte un tableau pour émettre plusieurs
 * en-têtes Set-Cookie.
 *
 * @param {import('fastify').FastifyReply} reply
 * @param {string} value en-tête Set-Cookie sérialisé
 */
export function appendCookie(reply, value) {
  const existing = reply.getHeader('set-cookie');
  if (!existing) {
    reply.header('set-cookie', value);
    return;
  }
  reply.header('set-cookie', Array.isArray(existing) ? [...existing, value] : [existing, value]);
}

/**
 * @param {import('fastify').FastifyReply} reply
 * @param {string} token
 * @param {{maxAgeMs: number, secure?: boolean}} opts
 */
export function setSessionCookie(reply, token, { maxAgeMs, secure = true }) {
  appendCookie(
    reply,
    serializeCookie(SESSION_COOKIE, token, {
      maxAgeSec: Math.floor(maxAgeMs / 1000),
      secure,
    }),
  );
}

/**
 * Purge le cookie. Envoyé systématiquement quand une session native est
 * invalide : sans ça, le navigateur renverrait éternellement un cookie mort,
 * que Traefik continuerait de router vers le chemin natif — boucle de 401.
 * @param {import('fastify').FastifyReply} reply
 * @param {{secure?: boolean}} [opts]
 */
export function clearSessionCookie(reply, { secure = true } = {}) {
  appendCookie(reply, serializeCookie(SESSION_COOKIE, '', { maxAgeSec: 0, secure }));
}
