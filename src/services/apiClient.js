/**
 * Client HTTP unique du frontend — TOUT appel /api passe par ici.
 *
 * Était quadruplé (authApi, actionsApi, connectApi, adminUsersApi portaient
 * chacun leur copie de `request`) et contourné par ~25 fetch() bruts aux
 * options divergentes : certains sans `credentials:'include'` (le build
 * Capacitor cross-origin perdait la session), d'autres sans
 * `redirect:'manual'` (une redirection OIDC était suivie en silence et la
 * page de login HTML partait dans res.json()).
 *
 * Contrat de retour UNIQUE : { ok, status, data }
 *   - ok     : res.ok (2xx)
 *   - status : code HTTP, 0 = panne réseau
 *   - data   : corps JSON, {} si vide/non-JSON ; les erreurs portent
 *              data.error = slug stable (cf. services/api/lib/errors.js) que
 *              l'UI traduit — le serveur n'envoie aucune chaîne affichable.
 *   - panne réseau : { ok:false, status:0, data:{ error:'network' } }
 *   - redirection opaque (flux OIDC qui reprend la main) :
 *     { ok:false, status:0, data:{ error:'auth_redirect' } } — jamais suivie.
 *
 * Ce module reste PUR : pas de toast, pas de store — l'appelant décide quoi
 * afficher (src/stores/toasts.js fournit notifyApiError pour le cas courant).
 *
 * Ce module pose lui-même les en-têtes d'authentification (Phase 8) : il ne
 * dépend plus de l'intercepteur global window.fetch pour être correct. Celui
 * de utils/httpErrorHandler.js reste installé, mais uniquement pour la
 * politique de ré-authentification et pour les rares fetch qui ne passent pas
 * ici (envoi multipart hors ligne de platform/offlineRecording.js). Les deux
 * injections sont idempotentes — chacune ne pose que ce qui manque.
 */
import { baseUrl, apiOrigin } from '../config/constants.js';
import { getAuthToken } from '../utils/httpErrorHandler.js';

/**
 * En-têtes et politique de cookies communs à TOUS les appels.
 *
 * - `X-Requested-With` : le plugin traefikoidc répond 401 à une requête XHR au
 *   lieu de rediriger vers l'IdP. Sans lui, plusieurs appels concurrents sur
 *   une session expirée initient chacun un flux OIDC, s'écrasent le cookie
 *   d'état, et l'utilisateur tombe sur « Invalid state parameter ».
 * - `Authorization` : jeton mobile, sur l'app native uniquement.
 * - `credentials` : jamais de cookies vers une API cross-origin (WebView
 *   Capacitor) — l'identité y passe par le Bearer, et `include` exigerait un
 *   CORS credentials inutilement permissif côté serveur.
 */
function authFor(headers) {
  const out = new Headers(headers || undefined);
  if (!out.has('X-Requested-With')) out.set('X-Requested-With', 'XMLHttpRequest');
  const token = getAuthToken();
  if (token && !out.has('Authorization')) out.set('Authorization', `Bearer ${token}`);
  return out;
}

const credentialsPolicy = () =>
  apiOrigin && apiOrigin !== window.location.origin ? 'omit' : 'include';

/**
 * @param {string} path
 * @param {{method?: string, body?: any, headers?: object, keepalive?: boolean}} [opts]
 *   `keepalive` : la requête survit à la navigation qui suit (déconnexion),
 *   que le navigateur annulerait sinon.
 */
async function request(path, { method = 'GET', body, headers, keepalive } = {}) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      credentials: credentialsPolicy(),
      ...(keepalive ? { keepalive: true } : {}),
      // Une redirection opaque ne doit jamais être suivie silencieusement :
      // c'est la signature d'un flux OIDC qui reprend la main.
      redirect: 'manual',
      ...(body === undefined
        ? { headers: authFor(headers) }
        : {
            headers: authFor({ 'content-type': 'application/json', ...(headers || {}) }),
            body: JSON.stringify(body),
          }),
    });
    if (res.type === 'opaqueredirect') {
      return { ok: false, status: 0, data: { error: 'auth_redirect' } };
    }
    let data = null;
    if (res.status !== 204) {
      try {
        data = await res.json();
      } catch (_) {
        // 2xx au corps non-JSON = page HTML servie à la place de l'API
        // (session OIDC expirée derrière un proxy qui répond 200) : un faux
        // succès annoncerait « enregistré » alors que rien ne l'est.
        if (res.ok) return { ok: false, status: res.status, data: { error: 'invalid_response' } };
        data = null;
      }
    }
    return { ok: res.ok, status: res.status, data: data || {} };
  } catch (_) {
    return { ok: false, status: 0, data: { error: 'network' } };
  }
}

export const get = (path, opts = {}) => request(path, { ...opts, method: 'GET' });
export const post = (path, body, opts = {}) => request(path, { ...opts, method: 'POST', body });

/**
 * Réponse BRUTE, réservée aux trois endpoints qui inspectent le corps verbatim
 * pour distinguer « crédit IA épuisé » d'une panne quelconque : /tempkey,
 * /actions et /resume. `inspectAiServiceError` a besoin d'un vrai `Response`
 * (il le clone pour lire le corps sans le consommer) — le contrat
 * {ok,status,data} ne peut pas le rendre.
 *
 * Tout le reste doit passer par get/post : c'est ce qui garantit que
 * les erreurs restent des slugs traduisibles.
 *
 * @returns {Promise<Response|null>} null = panne réseau (aucune réponse reçue)
 */
export async function raw(path, { method = 'GET', body, headers } = {}) {
  try {
    return await fetch(`${baseUrl}${path}`, {
      method,
      credentials: credentialsPolicy(),
      redirect: 'manual',
      ...(body === undefined
        ? { headers: authFor(headers) }
        : {
            headers: authFor({ 'content-type': 'application/json', ...(headers || {}) }),
            body: JSON.stringify(body),
          }),
    });
  } catch (_) {
    return null;
  }
}

/**
 * Envoi multipart (import audio) : PAS de content-type manuel — le navigateur
 * pose le boundary lui-même. Même contrat de retour que request().
 */
export async function upload(path, formData, { method = 'POST' } = {}) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      credentials: credentialsPolicy(),
      redirect: 'manual',
      headers: authFor(),
      body: formData,
    });
    if (res.type === 'opaqueredirect') {
      return { ok: false, status: 0, data: { error: 'auth_redirect' } };
    }
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    return { ok: res.ok, status: res.status, data: data || {} };
  } catch (_) {
    return { ok: false, status: 0, data: { error: 'network' } };
  }
}
