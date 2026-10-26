/**
 * Contrôle d'origine sur les routes d'authentification mutantes.
 *
 * Le cookie de session est `SameSite=Lax` : un navigateur ne l'envoie pas sur
 * un POST cross-site, ce qui neutralise déjà le CSRF sur toutes les routes
 * mutantes (elles sont toutes en POST). Ce contrôle est une seconde barrière,
 * gratuite, qui protégerait encore si le cookie devait un jour passer en
 * SameSite=None.
 *
 * Tolérant par construction : une requête SANS `Origin` ni `Sec-Fetch-Site`
 * passe. C'est le cas des appels serveur-à-serveur, de curl, et de app.inject()
 * dans les tests. Seule une origine explicitement DIFFÉRENTE est refusée.
 */

/**
 * Origine publique de l'application, telle que la voit le navigateur.
 *
 * Sert à construire l'URI de redirection OAuth, qui doit correspondre EXACTEMENT
 * à celle déclarée dans la console Google — d'où la priorité donnée à
 * `APP_PUBLIC_URL` : derrière Traefik les en-têtes suffisent, mais une
 * configuration explicite lève toute ambiguïté (proxy en cascade, port
 * non standard).
 *
 * @param {import('fastify').FastifyRequest} req
 * @param {{appPublicUrl?: string}} config
 * @returns {string} origine sans slash final
 */
export function publicOrigin(req, config = {}) {
  if (config.appPublicUrl) return config.appPublicUrl.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return `${String(proto).split(',')[0].trim()}://${String(host).split(',')[0].trim()}`;
}

/** @returns {boolean} */
export function isSameOrigin(req) {
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (
    fetchSite &&
    fetchSite !== 'same-origin' &&
    fetchSite !== 'same-site' &&
    fetchSite !== 'none'
  ) {
    return false;
  }

  const origin = req.headers.origin;
  if (!origin || origin === 'null') return true;

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return true;

  try {
    return new URL(origin).host === String(host);
  } catch {
    return false;
  }
}
