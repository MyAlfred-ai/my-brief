/**
 * Câblage de l'authentification dans Fastify : `req.user` sur chaque requête,
 * plus le verrou de changement de mot de passe obligatoire.
 *
 * C'est une simple fonction appelée dans le `register({prefix:'/api'})`
 * existant, pas un plugin `fastify-plugin` : ça garde le pattern déjà en place
 * (`coreRoutes(api)`), évite une dépendance, et encapsule décorateurs et hooks
 * dans le contexte /api — exactement le périmètre voulu.
 */
import { resolveIdentity } from './auth/resolve.js';
import { clearSessionCookie } from './auth/cookies.js';
import { fail, unauthenticated } from './errors.js';

/**
 * Routes accessibles à un compte qui doit changer son mot de passe : la sonde
 * de vivacité, le bootstrap du frontend, et tout /api/auth (dont
 * change-password lui-même, sans quoi le verrou serait indéboulonnable).
 */
const GATE_EXEMPT_PATHS = new Set(['/api/ping', '/api/init']);

/**
 * Seules routes à qui un inconnu peut envoyer un corps : se connecter,
 * récupérer son mot de passe, se déconnecter, signaler une coupure. Chacune
 * porte un `bodyLimit` de quelques Ko.
 *
 * Toutes les autres exigent une identité (ARCHITECTURE.md §3.2) : leur corps
 * — jusqu'à 32 Mo, une transcription de 8 h — n'est lu qu'une fois l'identité
 * établie. Avant, `requireEmail` refusait DANS le handler, donc après la
 * lecture : une poignée de requêtes anonymes de 32 Mo suffisait à épuiser la
 * mémoire du conteneur (256 Mo). test/anonymousBody.test.js tient la liste.
 */
export const ANONYMOUS_BODY_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/logout',
  '/api/logout',
  '/api/client-event',
]);

/** Corps de connexion et de récupération : quelques champs courts. */
export const AUTH_BODY_LIMIT = 16 * 1024;
/** Déconnexion : aucun champ attendu. */
export const LOGOUT_BODY_LIMIT = 1024;

const NO_BODY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function pathOf(req) {
  const url = req.routeOptions?.url;
  if (url) return url;
  const raw = req.url || '';
  const q = raw.indexOf('?');
  return q < 0 ? raw : raw.slice(0, q);
}

export default function authPlugin(api) {
  api.decorateRequest('user', null);

  api.addHook('onRequest', async (req, reply) => {
    const { user, sessionInvalid } = await resolveIdentity({
      req,
      users: api.users,
      sessions: api.sessions,
    });
    req.user = user;
    if (sessionInvalid) {
      // Purge du cookie mort : la requête suivante repartira sur le routeur
      // OIDC au lieu de boucler sur le routeur natif.
      clearSessionCookie(reply, { secure: api.config.cookieSecure });
    }
  });

  // Le verrou est côté serveur, pas seulement dans la modale du frontend :
  // sinon un compte encore sur son mot de passe d'amorçage pourrait utiliser
  // toute l'API en tapant directement les endpoints.
  //
  // 428 Precondition Required, et surtout PAS 401/403 : l'intercepteur fetch du
  // frontend traite 401 et 403 comme une perte de session
  // (src/utils/httpErrorHandler.js) et déconnecterait l'utilisateur — qui
  // reviendrait sur l'écran de connexion, se reconnecterait, et reboucherait.
  api.addHook('onRequest', async (req, reply) => {
    if (!req.user?.mustChangePassword) return;
    const path = pathOf(req);
    if (path.startsWith('/api/auth')) return;
    if (GATE_EXEMPT_PATHS.has(path)) return;
    return fail(reply, 428, 'password_change_required');
  });

  // Corps anonyme : refusé AVANT d'être lu (onRequest précède l'analyse du
  // corps). Même réponse que `requireEmail` dans le handler — le client
  // légitime ne voit aucune différence, sauf un 401 au lieu d'un 400 de
  // validation quand il n'a, de toute façon, pas de session.
  api.addHook('onRequest', async (req, reply) => {
    if (req.user?.email || NO_BODY_METHODS.has(req.method)) return;
    if (ANONYMOUS_BODY_PATHS.has(pathOf(req))) return;
    return unauthenticated(reply);
  });
}
