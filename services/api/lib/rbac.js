/**
 * Contrôle d'accès par rôle.
 *
 * Même ergonomie synchrone que `requireEmail` (lib/identity.js) : le handler
 * appelle, teste `null`, et sort. La réponse d'erreur est déjà partie.
 *
 * Le rôle est lu sur `req.user`, renseigné par le hook de lib/authPlugin.js à
 * partir du document en base — jamais depuis un en-tête ni un champ fourni par
 * le client.
 */
import { forbidden, unauthenticated } from './errors.js';

/**
 * @returns {object|null} l'identité résolue, ou null (401 déjà envoyé)
 */
export function requireUser(req, reply) {
  if (!req.user?.email) {
    unauthenticated(reply);
    return null;
  }
  return req.user;
}

/**
 * @returns {object|null} l'identité si elle a le rôle demandé, sinon null
 *   (401 sans identité, 403 avec une identité insuffisante)
 */
export function requireRole(role) {
  return (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return null;
    if (user.role !== role) {
      forbidden(reply);
      return null;
    }
    return user;
  };
}

export const requireAdmin = requireRole('admin');
