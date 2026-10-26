/**
 * Authentification de l'app native (Capacitor).
 *
 * Google interdit OAuth dans les WebViews embarquées : le login se fait dans le
 * NAVIGATEUR SYSTÈME (Custom Tab / SFSafariViewController) sur le flux
 * traefikoidc existant, via le sidecar services/mobile-auth :
 *
 *   login()          ouvre https://<api>/auth/mobile/start?cc=<sha256(verifier)>
 *   deep link        mybrief://auth/callback?ott=…  (capté par appUrlOpen)
 *   handleAppUrl()   POST /auth/mobile/exchange {ott, verifier} -> JWT 30 j
 *   getCachedToken() branché sur l'intercepteur fetch (Authorization: Bearer)
 *
 * Le verifier PKCE ne quitte jamais l'app : un OTT intercepté par une app
 * squattant le scheme mybrief:// est inutilisable.
 * Sur le web, tout ce module est inerte (isNative=false).
 */

import { isNative, nativePlugin } from './index.js';
import { apiOrigin } from '../config/constants.js';

const TOKEN_KEY = 'mybrief_auth_token';
const VERIFIER_KEY = 'mybrief_auth_verifier';

/** Origine du backend d'auth. En mode server.url (approche MIA), la WebView
 * est SUR l'origine du site (apiOrigin vide) => window.location.origin.
 * En mode bundle embarqué, VITE_API_BASE_URL fournit l'origine absolue. */
function authOrigin() {
  return apiOrigin || window.location.origin;
}

let cachedToken = null;

/** Lecture synchrone (branchée sur l'intercepteur fetch). */
export function getCachedToken() {
  return cachedToken;
}

/** Charge le jeton persisté au boot (avant le montage de l'app). */
export async function loadToken() {
  if (!isNative) return null;
  try {
    const { value } = await nativePlugin('Preferences').get({ key: TOKEN_KEY });
    cachedToken = value || null;
  } catch (e) {
    console.warn('[auth-native] lecture du jeton impossible:', (e && e.message) || e);
    cachedToken = null;
  }
  return cachedToken;
}

/**
 * Referme la feuille SFSafariViewController (iOS). Non implémenté sur Android :
 * le deep link a déjà ramené l'app au premier plan, la Custom Tab reste dans la
 * pile arrière (bénin).
 */
async function closeSystemBrowser() {
  try {
    await nativePlugin('Browser').close();
  } catch (_) {
    /* ignore */
  }
}

function randomVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256b64url(s) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Ouvre le flux de login dans le navigateur système.
 * Le verifier est persisté (Preferences) : survit à une éviction de l'activité
 * Android pendant que le Custom Tab est au premier plan.
 */
/**
 * Ouvre le flux de CONNEXION D'UN COMPTE EXTERNE dans le navigateur système.
 *
 * Google refuse OAuth dans une WebView embarquée (`disallowed_useragent`), et
 * la navigation interne ne portait de toute façon aucune identité. Le billet
 * est obtenu par un `fetch` authentifié, puis présenté par la navigation.
 *
 * @param {string} startUrl - URL de départ, billet compris
 */
export async function openConnectFlow(startUrl) {
  if (!isNative) return false;
  await nativePlugin('Browser').open({ url: startUrl });
  return true;
}

export async function login() {
  if (!isNative) return;
  const verifier = randomVerifier();
  await nativePlugin('Preferences').set({ key: VERIFIER_KEY, value: verifier });
  const cc = await sha256b64url(verifier);
  await nativePlugin('Browser').open({ url: `${authOrigin()}/auth/mobile/start?cc=${cc}` });
}

/**
 * Traite un deep link entrant. Retourne true si c'était un callback d'auth
 * traité avec succès (jeton stocké), false sinon.
 * @param {string} url - ex: mybrief://auth/callback?ott=…
 */
export async function handleAppUrl(url) {
  let ott = null;
  let parsed = null;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== 'mybrief:' || !`${parsed.host}${parsed.pathname}`.startsWith('auth')) {
      return false;
    }
    ott = parsed.searchParams.get('ott');
  } catch (_) {
    return false;
  }

  // Retour d'une CONNEXION de compte externe (Drive, mail), pas d'un login :
  // il n'y a pas de jeton à échanger, seulement une feuille de navigateur à
  // refermer et un écran à rafraîchir. Le host reste `auth` parce que l'intent
  // filter Android ne déclare que celui-là — cf. routes/connect.js.
  if (parsed.pathname.replace(/^\//, '') === 'connect' || parsed.host === 'auth/connect') {
    await closeSystemBrowser();
    window.dispatchEvent(
      new CustomEvent('mybrief:connect-returned', {
        detail: { error: parsed.searchParams.get('error') || '' },
      }),
    );
    return true;
  }

  if (!ott) return false;

  const { value: verifier } = await nativePlugin('Preferences').get({ key: VERIFIER_KEY });
  if (!verifier) {
    console.warn('[auth-native] callback reçu sans verifier local (flux non initié ici ?)');
    return false;
  }

  const res = await fetch(`${authOrigin()}/auth/mobile/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ott, verifier }),
  });
  if (!res.ok) {
    console.warn('[auth-native] échange OTT refusé:', res.status);
    return false;
  }
  const { token } = await res.json();
  if (!token) return false;

  cachedToken = token;
  await nativePlugin('Preferences').set({ key: TOKEN_KEY, value: token });
  await nativePlugin('Preferences').remove({ key: VERIFIER_KEY });

  await closeSystemBrowser();
  return true;
}

/** Déconnexion locale : purge le jeton (le JWT est stateless côté serveur). */
export async function logout() {
  cachedToken = null;
  try {
    await nativePlugin('Preferences').remove({ key: TOKEN_KEY });
  } catch (_) {
    /* ignore */
  }
}
