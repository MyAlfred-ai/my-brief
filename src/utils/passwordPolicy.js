/**
 * Miroir client de la politique de mot de passe du serveur
 * (services/api/lib/auth/password.js) — pour un retour immédiat pendant la
 * saisie, PAS pour la sécurité : le serveur revalide systématiquement.
 *
 * La longueur minimale vient de GET /api/auth/config : si elle est durcie côté
 * serveur, le frontend suit sans redéploiement.
 */
export const DEFAULT_MIN_LENGTH = 10;
export const MAX_LENGTH = 200;

/**
 * @param {string} password
 * @param {{email?: string, minLength?: number}} [ctx]
 * @returns {{ok: true} | {ok: false, reason: string}} `reason` est le même slug
 *   que celui renvoyé par le serveur — une seule table de traduction.
 */
export function checkPassword(password, { email = '', minLength = DEFAULT_MIN_LENGTH } = {}) {
  if (!password) return { ok: false, reason: 'required' };
  if (password.length < minLength) return { ok: false, reason: 'too_short' };
  if (password.length > MAX_LENGTH) return { ok: false, reason: 'too_long' };

  const localPart = String(email).split('@')[0].toLowerCase();
  if (localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
    return { ok: false, reason: 'contains_email' };
  }
  return { ok: true };
}
