/**
 * Identité utilisateur — en-têtes injectés par Traefik (chemin OIDC/mobile).
 *
 * Sur ce chemin, le service n'authentifie pas lui-même : il n'est joignable que
 * via Traefik (réseaux docker internes), qui a déjà validé la session OIDC
 * (plugin traefikoidc, flux web) ou le JWT mobile (ForwardAuth -> /auth/verify,
 * servi par l'API ou par le sidecar services/mobile-auth selon l'instance) et
 * injecté x-user-email / x-auth-request-user / x-user-name. Même modèle de
 * confiance que n8n avant lui.
 *
 * Depuis l'ajout du login par mot de passe, un SECOND chemin existe : la
 * session native, que le service valide lui-même (lib/auth/). La résolution des
 * deux est centralisée dans lib/auth/resolve.js et posée sur `req.user` par le
 * hook de lib/authPlugin.js.
 *
 * Repli x-user-email -> x-auth-request-user : selon le fournisseur OIDC (Entra
 * notamment), l'email arrive dans l'un ou l'autre. n8n appliquait ce repli de
 * façon inégale selon les endpoints (user-config ne lisait que
 * x-auth-request-user) — ici il est harmonisé partout.
 */

import { unauthenticated } from './errors.js';

/**
 * Node décode les en-têtes entrants en latin1 : les octets UTF-8 émis par
 * traefikoidc (noms accentués) arrivent en mojibake -> on les re-décode pour
 * manipuler du vrai UTF-8 (même mécanique que services/mobile-auth).
 * @param {Object} headers - req.headers
 * @param {string} name - nom d'en-tête en minuscules
 * @returns {string}
 */
export function utf8Header(headers, name) {
  return Buffer.from(String(headers[name] || ''), 'latin1').toString('utf8');
}

/** Au-delà, ce n'est plus une adresse de photo mais un contenu embarqué. */
const MAX_PICTURE_URL = 2048;

/**
 * Adresse de photo de profil affichable telle quelle, ou ''.
 *
 * HTTPS seulement : l'adresse finit dans un `<img src>` — `http:` serait
 * bloqué en contenu mixte, et `data:`/`javascript:` n'ont rien à faire là.
 * @param {unknown} value - claim `picture` ou en-tête X-User-Picture
 * @returns {string}
 */
export function pictureUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > MAX_PICTURE_URL) return '';
  try {
    return new URL(raw).protocol === 'https:' ? raw : '';
  } catch {
    return '';
  }
}

/**
 * Extrait l'identité de la requête.
 * @param {Object} headers - req.headers
 * @returns {{email: string, name: string, picture: string}}
 */
export function identityFromHeaders(headers) {
  const email = utf8Header(headers, 'x-user-email') || utf8Header(headers, 'x-auth-request-user');
  const name = utf8Header(headers, 'x-user-name');
  // Posé par le plugin OIDC quand l'IdP publie `picture` (Google) — vide
  // derrière Entra, dont le compose ne le mappe pas.
  const picture = pictureUrl(utf8Header(headers, 'x-user-picture'));
  return { email, name, picture };
}

/**
 * Email requis : renvoie l'email ou répond 401 et renvoie null.
 * Une requête sans identité n'a traversé ni Traefik+OIDC ni la session native
 * — on refuse plutôt que d'écrire des documents sans propriétaire.
 *
 * L'identité vient de `req.user` SEULEMENT, posée par le hook de
 * authPlugin.js, qui sait quand les en-têtes sont dignes de confiance (pas sur
 * le chemin natif). Un repli sur `X-User-Email` existait pour un routeur monté
 * sans ce hook : aucun ne l'est, et le repli aurait rouvert l'usurpation par
 * en-tête sur le premier qui le serait.
 *
 * @param {import('fastify').FastifyRequest} req
 * @param {import('fastify').FastifyReply} reply
 * @returns {string|null}
 */
export function requireEmail(req, reply) {
  const email = req.user?.email;
  if (!email) {
    unauthenticated(reply);
    return null;
  }
  return email;
}
