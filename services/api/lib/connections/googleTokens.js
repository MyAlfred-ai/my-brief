/**
 * Obtention d'un access token Google à partir du refresh token d'une connexion.
 *
 * Extrait de lib/gmail.js, qui en était le seul utilisateur avant que le dépôt
 * sur Drive n'en ait besoin lui aussi. Le rafraîchissement est le seul appel
 * relançable de la chaîne : demander un jeton ne consomme rien, alors qu'un
 * envoi ou un upload rejoué produirait un doublon.
 */
import { withRetry } from '../retry.js';
import { ConnectionAuthError } from './errors.js';

export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * @param {{clientId: string, clientSecret: string, refreshToken: string,
 *   fetchImpl?: Function}} params
 * @returns {Promise<string>} access token frais (~1 h)
 * @throws {ConnectionAuthError} si le refresh token n'est plus accepté
 */
export function refreshGoogleAccessToken({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl = fetch,
}) {
  // Relance sur panne réseau uniquement : un invalid_grant relancé resterait
  // invalid_grant (cf. lib/retry.js, `retryOn` par défaut).
  return withRetry(async () => {
    const res = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      let payload = null;
      try {
        payload = await res.json();
      } catch (_) {
        /* corps non JSON */
      }
      // Seul signal non ambigu d'un accès retiré : l'appelant peut purger.
      if (payload?.error === 'invalid_grant') {
        throw new ConnectionAuthError('google_auth_revoked', { provider: 'google' });
      }
      throw new Error(`google_token_refresh_failed_${res.status}`);
    }
    const data = await res.json();
    if (!data.access_token) throw new Error('google_token_refresh_empty');
    return data.access_token;
  });
}
