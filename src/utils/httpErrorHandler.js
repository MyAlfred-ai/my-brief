/**
 * Gestion des erreurs HTTP et des redirections OAuth
 */

import { apiOrigin } from '../config/constants.js';

// ── Hooks d'authentification enfichables (app native Capacitor) ─────────────
// Sur le web les deux hooks restent null => comportement historique inchangé
// (cookie OIDC + forceReauth). L'app native les enregistre au boot :
//  - authTokenProvider : () => jwt|null — jeton Bearer attaché aux appels /api/
//  - authFailureHandler : (reason) => void — remplace le teardown/navigation
//    forceReauth (impossible en WebView : /login n'existe pas dans le bundle)
//    par la réouverture du flux de login navigateur système.
let authTokenProvider = null;
let authFailureHandler = null;

export function registerAuthTokenProvider(fn) {
  authTokenProvider = typeof fn === 'function' ? fn : null;
}

export function registerAuthFailureHandler(fn) {
  authFailureHandler = typeof fn === 'function' ? fn : null;
}

/**
 * Jeton mobile courant, ou '' — lu par services/apiClient.js, qui pose
 * lui-même ses en-têtes plutôt que de dépendre de l'intercepteur global.
 * @returns {string}
 */
export function getAuthToken() {
  return (authTokenProvider && authTokenProvider()) || '';
}

/** Origine considérée comme « API protégée » : celle de VITE_API_BASE_URL
 * (builds mobiles), sinon l'origine de la page (web, comportement historique). */
function protectedOrigin() {
  return apiOrigin || window.location.origin;
}

/**
 * Vérifie si une réponse HTTP indique une erreur d'authentification
 * @param {Response} response - Réponse HTTP
 * @returns {boolean} - True si c'est une erreur d'authentification
 */
export function isAuthenticationError(response) {
  return response.status === 401 || response.status === 403;
}

/**
 * Vérifie si une erreur est liée à une redirection OAuth (CORS)
 * @param {Error} error - Erreur à vérifier
 * @returns {boolean} - True si c'est une erreur OAuth/CORS
 */
export function isOAuthRedirectError(error) {
  if (!error || !error.message) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('cors') ||
    message.includes('oauth') ||
    message.includes('accounts.google.com') ||
    message.includes('redirected')
  );
}

/**
 * Catégorise une erreur d'appel à une API qui dépend d'OpenAI, afin de choisir
 * le message à montrer à l'utilisateur :
 *  - 'auth'       : session OIDC expirée (401/403 ou redirection OAuth) → ré-auth
 *  - 'ai_service' : le backend a répondu en erreur (crédit épuisé, clé OpenAI
 *                   invalide, quota dépassé, panne OpenAI/backend) → service indispo.
 *                   l'API relaie ces échecs en HTTP non-2xx (statut OpenAI ou 502).
 *  - 'network'    : aucune réponse reçue (hors ligne, DNS, timeout, coupure)
 *
 * On NE distingue PAS crédit vs clé vs quota côté utilisateur (regroupés sous
 * 'ai_service') ; la cause technique exacte est loggée via logAiServiceError.
 * @param {{response?: Response|null, error?: Error|null}} params
 * @returns {'auth'|'ai_service'|'network'}
 */
export function categorizeApiError({ response = null, error = null } = {}) {
  if (response) {
    if (isAuthenticationError(response)) return 'auth';
    return 'ai_service';
  }
  if (error && isOAuthRedirectError(error)) return 'auth';
  return 'network';
}

/**
 * Clé i18n du message utilisateur correspondant à une catégorie d'erreur IA.
 * @param {'auth'|'ai_service'|'network'} category
 * @returns {string}
 */
export function aiErrorMessageKey(category) {
  return category === 'network' ? 'messages.aiNetworkError' : 'messages.aiServiceError';
}

/**
 * Logge le détail technique d'une réponse en erreur (message OpenAI relayé par
 * l’API : « exceeded your current quota », « Incorrect API key »…) pour le
 * diagnostic admin, sans l'exposer à l'utilisateur. No-op sur 401/403 (= session,
 * pas un problème de service IA). Clone la réponse pour ne pas consommer le corps
 * utilisé par l'appelant — à appeler AVANT toute lecture du corps.
 * @param {Response} response
 * @param {string} endpoint
 */
export async function logAiServiceError(response, endpoint = '') {
  if (!response || isAuthenticationError(response)) return;
  let detail = '';
  try {
    detail = (await response.clone().text()).slice(0, 500);
  } catch (_) {
    /* corps illisible ou déjà consommé */
  }
  console.error(`❌ Service IA indisponible sur ${endpoint} (HTTP ${response.status})`, detail);
}

/**
 * Signatures de « plus de crédit / quota épuisé » relayées par les fournisseurs
 * d'IA dans le corps de la réponse (relayé verbatim par l’API). Couvre OpenAI
 * (insufficient_quota, « exceeded your current quota »), Anthropic (« credit
 * balance is too low »), et les formulations génériques (out of credits, billing
 * hard limit, spending limit, payment required…). Insensible à la casse.
 */
const CREDIT_SIGNATURES =
  /insufficient[_\s-]?(?:quota|funds|credit|balance)|exceeded your current quota|credit balance is too low|out of (?:credit|quota)|no (?:remaining )?credit|billing (?:hard )?limit|(?:monthly|spending|usage) limit|quota.{0,30}(?:exceeded|exhaust|depass)|payment required|plan and billing|account is not active|recharge|hors[\s-]?cr[ée]dit|cr[ée]dit[s]? [ée]puis/i;

/**
 * Signature « crédit / quota épuisé » dans un texte d'erreur, quel que soit le
 * fournisseur. Exporté pour que le canal Realtime (WebSocket direct vers
 * OpenAI, donc hors de tout `Response` HTTP) reconnaisse ce cas avec EXACTEMENT
 * les mêmes règles que les appels /tempkey, /actions et /resume — plutôt que
 * d'entretenir une seconde liste de signatures qui divergerait.
 * @param {string} text - code, type ou corps d'erreur
 * @returns {boolean}
 */
export function isCreditExhaustedText(text = '') {
  return CREDIT_SIGNATURES.test(String(text));
}

/**
 * Identifie le fournisseur d'IA à partir du corps d'erreur, pour personnaliser
 * le message utilisateur. Retourne un libellé affichable ou '' si indéterminé.
 * @param {string} text
 * @returns {string}
 */
export function detectAiProvider(text = '') {
  const t = String(text).toLowerCase();
  if (/anthropic|claude/.test(t)) return 'Anthropic';
  if (/azure/.test(t)) return 'Azure OpenAI';
  if (/openai|gpt-|whisper|o[13]-|api\.openai\.com/.test(t)) return 'OpenAI';
  if (/mistral/.test(t)) return 'Mistral';
  if (/gemini|generativelanguage|vertex/.test(t)) return 'Google';
  if (/cohere/.test(t)) return 'Cohere';
  if (/groq/.test(t)) return 'Groq';
  if (/openrouter/.test(t)) return 'OpenRouter';
  return '';
}

/**
 * Inspecte une réponse d'API IA en erreur pour décider du message à montrer.
 * Lit le corps UNE fois (via clone, non destructif pour l'appelant), logue le
 * détail technique pour l'admin, et détecte le cas « plus de crédit / quota
 * épuisé » indépendamment du fournisseur (status 402 OU signature dans le corps).
 *
 * No-op (retourne null) sur 401/403 = session expirée, pas un problème de service.
 *
 * @param {Response} response
 * @param {string} endpoint
 * @returns {Promise<{status:number, isCredit:boolean, provider:string, detail:string}|null>}
 */
export async function inspectAiServiceError(response, endpoint = '') {
  if (!response || isAuthenticationError(response)) return null;
  let detail = '';
  try {
    detail = (await response.clone().text()).slice(0, 1000);
  } catch (_) {
    /* corps illisible ou déjà consommé */
  }

  const isCredit = response.status === 402 || CREDIT_SIGNATURES.test(detail);
  const provider = detectAiProvider(detail);

  const tag = isCredit ? 'Crédit/quota IA épuisé' : 'Service IA indisponible';
  console.error(`❌ ${tag} sur ${endpoint} (HTTP ${response.status})`, detail);

  return { status: response.status, isCredit, provider, detail };
}

/**
 * Gère les erreurs HTTP de manière appropriée
 * @param {Response} response - Réponse HTTP
 * @param {string} endpoint - Nom de l'endpoint (pour les logs)
 * @returns {Promise<string>} - Texte d'erreur ou contenu de la réponse
 */
export async function handleHttpError(response, endpoint = '') {
  // Vérifier si c'est une erreur d'authentification
  if (isAuthenticationError(response)) {
    const contentType = response.headers.get('Content-Type') || '';

    // Si c'est du HTML (page d'erreur d'authentification), ne pas essayer de le parser
    if (contentType.includes('text/html')) {
      console.warn(`⚠️ Session expirée sur ${endpoint} (${response.status})`);
      throw new Error('SESSION_EXPIRED');
    }

    // Sinon, essayer de lire le texte d'erreur
    try {
      const errorText = await response.text();
      console.warn(`⚠️ Erreur d'authentification sur ${endpoint}:`, errorText.substring(0, 200));
      throw new Error('SESSION_EXPIRED');
    } catch (e) {
      if (e.message === 'SESSION_EXPIRED') {
        throw e;
      }
      throw new Error('SESSION_EXPIRED');
    }
  }

  // Pour les autres erreurs, retourner le texte
  try {
    return await response.text();
  } catch (e) {
    return `Erreur HTTP ${response.status}`;
  }
}

/**
 * Gère les erreurs de fetch (réseau, CORS, etc.)
 * @param {Error} error - Erreur à gérer
 * @param {string} endpoint - Nom de l'endpoint (pour les logs)
 */
export function handleFetchError(error, endpoint = '') {
  // Vérifier si c'est une erreur OAuth/CORS
  if (isOAuthRedirectError(error)) {
    console.warn(
      `⚠️ Redirection OAuth détectée sur ${endpoint} - La session a probablement expiré`,
    );
    return 'SESSION_EXPIRED';
  }

  // Autres erreurs réseau
  console.error(`❌ Erreur réseau sur ${endpoint}:`, error.message);
  return null;
}

let reauthInFlight = false;
// 10 min : forceReauth fait un teardown complet (reload + désinscription SW + purge
// caches + logout serveur). À 60 s, couplé au ping /api/ping toutes les 2 min,
// une seule expiration de session déclenchait une boucle reload/relogin permanente
// ("déconnexion/reconnexion tout le temps", app HS au bout d'1 h). Le backoff long
// empêche le teardown de se relancer en rafale ; le ping passif affiche désormais une
// modale au lieu d'auto-déclencher forceReauth (voir isPassiveProbe).
const REAUTH_BACKOFF_MS = 10 * 60 * 1000;
const REAUTH_KEY = 'mybrief_last_reauth';

// ── Garde « enregistrement en cours » ────────────────────────────────────────
// Pendant un enregistrement, AUCUNE navigation/reload n'est tolérée : un reload
// détruit le flux micro + la transcription en cours (réunion perdue). App.svelte
// enregistre un getter au montage ; toute récupération auth (interceptor,
// autoRecoverFromAuthError, forceReauth) est alors DIFFÉRÉE : on note la raison
// et App.svelte re-vérifie la session une fois l'enregistrement arrêté.
let recordingGuard = () => false;
let deferredAuthReason = null;

export function registerRecordingGuard(fn) {
  recordingGuard = typeof fn === 'function' ? fn : () => false;
}

export function isRecordingGuardActive() {
  try {
    return !!recordingGuard();
  } catch (_) {
    return false;
  }
}

function noteDeferredAuthError(reason) {
  if (!deferredAuthReason) deferredAuthReason = reason;
  console.warn(`[auth] récupération différée (enregistrement en cours). Raison: ${reason}`);
}

/** Retourne la raison différée (ou null) et la consomme. */
export function consumeDeferredAuthError() {
  const r = deferredAuthReason;
  deferredAuthReason = null;
  return r;
}

/**
 * Détecte qu'un fetch en `redirect: 'manual'` a été redirigé (session expirée).
 * @param {Response} res
 */
export function isOpaqueAuthRedirect(res) {
  return res && (res.type === 'opaqueredirect' || res.status === 0);
}

/**
 * Inspecte URL + référent + paramètres connus pour deviner que l'utilisateur
 * vient d'une erreur OIDC (page traefikoidc "Invalid state parameter ...",
 * boucle de redirection Google, etc.). Retourne la raison détectée ou null.
 */
export function detectAuthErrorReturn() {
  try {
    // NE PAS se fier à document.referrer : après un login RÉUSSI le referrer est
    // /oauth2/callback (Google -> callback -> /), identique au cas d'échec. Le
    // tester ici déclenchait forceReauth sur chaque login réussi -> page blanche
    // au 1er chargement (l'app n'était pas montée), "corrigée" par un refresh.
    // Les vraies erreurs sont soit servies par Traefik sur /oauth2/callback (la
    // SPA ne charge pas), soit rattrapées par init() quand /api/init renvoie du
    // HTML/un redirect, soit signalées par des params d'URL explicites ci-dessous.
    const qs = (location.search || '') + (location.hash || '');
    if (/[?&#](error|error_description)=/i.test(qs)) {
      return 'url-has-oauth-error-param';
    }
    if (/csrf|invalid_state/i.test(qs)) {
      return 'url-has-csrf-marker';
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * Indique si une nouvelle tentative de ré-authentification peut être lancée.
 * Évite les boucles infinies en respectant un backoff localStorage.
 */
export function canReauthNow() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('_reauth') || params.has('_reauth_failed')) return false;
    const last = parseInt(localStorage.getItem(REAUTH_KEY) || '0', 10);
    if (Number.isFinite(last) && Date.now() - last < REAUTH_BACKOFF_MS) return false;
  } catch (_) {
    /* ignore */
  }
  return true;
}

/**
 * Auto-recouvrement silencieux : déclenche forceReauth si le contexte indique
 * une erreur OIDC ET que la backoff l'autorise. Retourne true si on a pris en
 * charge la situation (l'appelant peut bailout), false si rien n'a été fait.
 */
export async function autoRecoverFromAuthError(reason = '') {
  if (isRecordingGuardActive()) {
    noteDeferredAuthError(reason);
    return false;
  }
  if (!canReauthNow()) {
    console.warn(`[auth] auto-recover skipped (backoff or already retried). Reason: ${reason}`);
    return false;
  }
  console.warn(`[auth] auto-recover triggered. Reason: ${reason}`);
  await forceReauth();
  return true;
}

/**
 * Force une ré-authentification propre :
 * 1. Purge cookies OIDC client-side
 * 2. Appelle /oauth2/callback/logout pour purger session serveur
 * 3. Désenregistre le service worker + vide ses caches (sinon F5 sert HTML stale)
 * 4. Navigation dure vers /login (route protégée OIDC) -> un unique flux de login
 *
 * Idempotent — concurrent callers no-op pendant que le flow est en cours.
 */
export async function forceReauth() {
  // Garde AVANT reauthInFlight : un appel différé pendant l'enregistrement ne
  // doit pas verrouiller le flag, sinon la réauth légitime post-stop serait
  // no-op pour toujours.
  if (isRecordingGuardActive()) {
    noteDeferredAuthError('forceReauth-pendant-enregistrement');
    return;
  }
  // App native : pas de teardown/navigation possible (le bundle n'a pas de
  // /login et le SW n'existe pas). Le handler rouvre le flux de login système.
  // Choke point : couvre aussi les appels directs à forceReauth() (App.svelte).
  if (authFailureHandler) {
    authFailureHandler('forceReauth');
    return;
  }
  if (reauthInFlight) return;
  reauthInFlight = true;

  // Mémoriser le timestamp pour le backoff
  try {
    localStorage.setItem(REAUTH_KEY, String(Date.now()));
  } catch (_) {
    /* ignore */
  }

  try {
    // NB sécurité : le cookie de session OIDC est HttpOnly (forcé côté plugin
    // traefikoidc 0.8.24, non configurable) -> il n'est PAS visible/effaçable via
    // document.cookie, et donc PAS volable par XSS. Le nettoyage ci-dessous est
    // best-effort pour d'éventuels cookies NON-HttpOnly ; la vraie invalidation de
    // session se fait côté serveur via /oauth2/callback/logout (appelé plus haut).
    const cookieNames = document.cookie.split(';').map((c) => c.split('=')[0].trim());
    cookieNames.forEach((name) => {
      if (
        name &&
        (name.includes('oidc') ||
          name.includes('oauth') ||
          name.includes('traefik') ||
          name.includes('_state'))
      ) {
        // Purge toutes les variantes (path + domaines)
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/oauth2;`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/oauth2; domain=${window.location.hostname};`;
      }
    });

    try {
      // RP-logout du plugin = callbackURL + "/logout" = /oauth2/callback/logout
      // (et non /oauth2/logout, qui n'est pas routé -> 404 nginx).
      await fetch('/oauth2/callback/logout', {
        method: 'GET',
        cache: 'no-store',
        redirect: 'manual',
      });
    } catch (_) {
      /* ignore */
    }

    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      } catch (_) {
        /* ignore */
      }
    }
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_) {
        /* ignore */
      }
    }
  } finally {
    // Navigation vers /login : route protégée OIDC dédiée (le SPA, lui, est servi
    // PUBLIQUEMENT). C'est l'UNIQUE déclencheur du flux OIDC -> une seule
    // initiation, donc plus de "clobber" du cookie d'état (cause du CSRF
    // mismatch). Le param _reauth coupe toute boucle (cf. canReauthNow) ; au
    // retour authentifié sur /login, main.js réécrit l'URL en /.
    window.location.replace(`/login?_reauth=${Date.now()}`);
  }
}

/**
 * À appeler tôt dans le bootstrap de l'application (avant les premiers fetch
 * d'API). Détecte automatiquement que l'utilisateur revient d'une erreur OIDC
 * et lance la procédure de nettoyage. Si l'utilisateur s'est déjà retrouvé
 * dans la boucle, n'agit pas et laisse l'app afficher son état dégradé.
 */
export async function bootstrapAuthRecovery() {
  const reason = detectAuthErrorReturn();
  if (!reason) return false;
  return await autoRecoverFromAuthError(reason);
}

let fetchInterceptorInstalled = false;

/**
 * Intercepteur global de fetch (à installer UNE SEULE FOIS au tout début du
 * boot, avant le premier fetch). Correctif racine du "Invalid state parameter
 * (CSRF mismatch)".
 *
 * Cause : le plugin traefikoidc régénère un nouveau CSRF et RÉÉCRIT le cookie de
 * session à chaque initiation de login (auth_flow.go). Quand la SPA lance
 * plusieurs requêtes protégées en parallèle sur une session expirée, chacune
 * déclenche une redirection OIDC qui écrase le cookie d'état ("clobber") -> le
 * `state` de la navigation qui atteint réellement le callback ne correspond plus
 * au CSRF du cookie -> page d'erreur CSRF.
 *
 * Parade :
 *  1. Marquer toute requête vers l'API protégée (/api/...) comme XHR via
 *     `X-Requested-With`. Le plugin renvoie alors 401 au lieu de rediriger
 *     (middleware.go: isAjaxRequest) -> plus de réécriture du cookie d'état.
 *  2. Sur perte de session (redirection OIDC opaque OU 401/403), déclencher UNE
 *     SEULE reconnexion propre (autoRecoverFromAuthError : single-flight via
 *     reauthInFlight + backoff). forceReauth purge la session serveur
 *     (/oauth2/callback/logout) puis recharge l'app -> un unique flux OIDC propre
 *     repartant d'un cookie vierge, même si un clobber a eu lieu avant.
 *
 * Ne touche QUE les requêtes same-origin vers /api/. Les assets publics, le SW
 * et /oauth2/callback/logout ne sont pas interceptés (pas de récursion).
 *
 * Depuis la Phase 8, services/apiClient.js pose lui-même l'en-tête XHR, le
 * jeton mobile et la politique de cookies : l'injection ci-dessous ne sert
 * plus qu'aux DEUX envois multipart qui ne passent pas par lui
 * (platform/offlineRecording.js et utils/audioProcessing.js — ils relisent le
 * corps en texte, que le contrat {ok,status,data} ne rend pas). Les deux
 * injections sont idempotentes : chacune ne pose que ce qui manque.
 * La politique de ré-authentification, elle, reste ici et couvre tout /api/.
 */
export function installAuthFetchInterceptor() {
  if (fetchInterceptorInstalled) return;
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  fetchInterceptorInstalled = true;

  const nativeFetch = window.fetch.bind(window);

  const isProtectedApi = (rawUrl) => {
    if (!rawUrl) return false;
    try {
      const u = new URL(rawUrl, window.location.origin);
      return u.origin === protectedOrigin() && u.pathname.startsWith('/api/');
    } catch (_) {
      return typeof rawUrl === 'string' && rawUrl.startsWith('/api/');
    }
  };

  // Sonde passive de connectivité (ping toutes les 2 min). On garde l'en-tête XHR
  // (le plugin renvoie un 401 propre au lieu d'un redirect qui clobber le cookie),
  // mais on NE déclenche PAS forceReauth dessus : sinon une session expirée provoque
  // un teardown complet de l'app toutes les 2 min en boucle. Le ping affiche lui-même
  // une modale "déconnecté" (startApiPingMonitor) → reconnexion pilotée par l'user.
  const isPassiveProbe = (rawUrl) => {
    if (!rawUrl) return false;
    try {
      const u = new URL(rawUrl, window.location.origin);
      return u.origin === protectedOrigin() && u.pathname === '/api/ping';
    } catch (_) {
      return typeof rawUrl === 'string' && rawUrl.startsWith('/api/ping');
    }
  };

  // Routes qui gèrent elles-mêmes leurs erreurs d'autorisation : /api/auth/*
  // (mot de passe actuel erroné = 403, changement de mot de passe obligatoire =
  // 403) et /api/admin/* (403 = « pas administrateur »). Sans cette exclusion,
  // saisir un mauvais mot de passe actuel déconnecterait l'utilisateur — le
  // 403 serait pris pour une perte de session.
  const isSelfHandledAuthRoute = (rawUrl) => {
    if (!rawUrl) return false;
    const path = (() => {
      try {
        const u = new URL(rawUrl, window.location.origin);
        return u.origin === protectedOrigin() ? u.pathname : '';
      } catch (_) {
        return typeof rawUrl === 'string' ? rawUrl : '';
      }
    })();
    return path.startsWith('/api/auth/') || path.startsWith('/api/admin/');
  };

  window.fetch = (input, init) => {
    // Les appelants passent toujours (urlString|URL, init). On ne réécrit pas les
    // objets Request (risque de perdre method/body) : repli natif.
    const isPlainUrl = typeof input === 'string' || input instanceof URL;
    const url = isPlainUrl ? (input instanceof URL ? input.href : input) : input && input.url;

    if (!isPlainUrl || !isProtectedApi(url)) {
      return nativeFetch(input, init);
    }

    const headers = new Headers((init && init.headers) || undefined);
    if (!headers.has('X-Requested-With')) {
      headers.set('X-Requested-With', 'XMLHttpRequest');
    }
    // App native : jeton Bearer (validé par le routeur Traefik dédié +
    // ForwardAuth). Sur le web, authTokenProvider est null => aucun changement.
    const token = authTokenProvider && authTokenProvider();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const finalInit = { ...(init || {}), headers };
    // API cross-origin (WebView Capacitor -> https://domaine) : jamais de
    // cookies. L'auth passe par le Bearer ; `include` forcerait un CORS
    // credentials inutilement permissif côté serveur.
    if (apiOrigin && apiOrigin !== window.location.origin) {
      finalInit.credentials = 'omit';
    }

    return nativeFetch(input, finalInit).then((res) => {
      const selfHandled = isPassiveProbe(url) || isSelfHandledAuthRoute(url);
      if ((isOpaqueAuthRedirect(res) || isAuthenticationError(res)) && !selfHandled) {
        const reason = isAuthenticationError(res) ? `http-${res.status}` : 'opaque-redirect';
        if (isRecordingGuardActive()) {
          // Enregistrement en cours : jamais de teardown/reload. On note, les
          // appelants (rotation tempkey…) retentent en silence, et App.svelte
          // re-vérifie la session après l'arrêt. La garde reste PREMIÈRE :
          // elle prime aussi sur le handler natif.
          noteDeferredAuthError(reason);
        } else if (authFailureHandler) {
          // App native : rouvrir le flux de login navigateur système.
          authFailureHandler(reason);
        } else {
          // Reconnexion propre déclenchée une seule fois (les appels concurrents
          // no-op). Pas de await : l'appelant reçoit la réponse, la navigation de
          // ré-auth se fait en arrière-plan. Exclut la sonde passive (cf isPassiveProbe).
          autoRecoverFromAuthError(reason);
        }
      }
      return res;
    });
  };
}
