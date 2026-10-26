/**
 * Fonctions PURES de l'extension — sans `chrome.*`, donc testables sous
 * vitest (extension/lib/core.test.js). Tout ce qui touche aux onglets, au
 * stockage ou au réseau vit dans instance.js.
 */

/**
 * Origine http(s) d'une URL, ou null (chrome://, about:, file:, URL invalide).
 *
 * @param {string|undefined|null} url
 * @returns {string|null}
 */
export function originOf(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
}

/** @param {string} origin */
export function hostLabel(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/** Deep-link lu par l'app (src/stores/recordDeepLink.js) : ouvre ET démarre. */
export const RECORD_HASH = '#record';

export const homeUrl = (origin) => `${origin}/`;
export const recordUrl = (origin) => `${origin}/${RECORD_HASH}`;
export const configUrl = (origin) => `${origin}/#config`;
/** Motif d'hôte accordé et interrogé : tout le site, rien d'autre. */
export const hostPattern = (origin) => `${origin}/*`;

/**
 * La sonde publique /api/auth/config de MyBrief — et pas un autre JSON qui
 * traînerait à cette adresse. `branding` et `actions` y sont toujours.
 *
 * @param {unknown} data
 */
export function isMyBriefConfig(data) {
  return (
    !!data &&
    typeof data === 'object' &&
    typeof (/** @type {any} */ (data).branding) === 'object' &&
    typeof (/** @type {any} */ (data).actions) === 'object'
  );
}

/**
 * Le logo servi par la sonde : data-URL, URL absolue ou chemin relatif au
 * site. Chaîne vide = pas de logo (l'icône de l'extension prend le relais).
 *
 * @param {string|undefined|null} logo
 * @param {string} origin
 * @returns {string|null}
 */
export function resolveLogo(logo, origin) {
  if (!logo) return null;
  try {
    return new URL(logo, origin).href;
  } catch {
    return null;
  }
}

/**
 * L'onglet MyBrief à réutiliser parmi ceux ouverts sur l'origine liée.
 * L'actif de la fenêtre courante d'abord, sinon le dernier consulté : c'est
 * celui que l'utilisateur a en tête. Aucun → null, on en ouvre un.
 *
 * @param {Array<{id?: number, active?: boolean, windowId?: number, lastAccessed?: number}>} tabs
 * @param {number|undefined} currentWindowId
 */
export function pickInstanceTab(tabs, currentWindowId) {
  if (!tabs?.length) return null;
  const inWindow = tabs.find((t) => t.active && t.windowId === currentWindowId);
  if (inWindow) return inWindow;
  return [...tabs].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}

// ── V2 : badge et rappel visio ───────────────────────────────────────────────

/**
 * Sites de visio dont l'extension peut lire l'adresse des onglets — et rien
 * d'autre — une fois le rappel activé (permission demandée à ce moment-là,
 * jamais avant). Teams « application » (teams.microsoft.com/v2/…) n'y est pas
 * reconnu comme visio : son URL est la même en tchat et en réunion, on
 * signalerait Teams ouvert toute la journée.
 */
export const VIDEO_CALL_HOST_PATTERNS = [
  'https://meet.google.com/*',
  'https://teams.microsoft.com/*',
  'https://teams.live.com/*',
  'https://*.zoom.us/*',
  'https://*.webex.com/*',
];

/**
 * L'URL d'un onglet est-elle une visio (salle ou appel), et non la page
 * d'accueil du service ?
 *
 * @param {string|undefined|null} url
 */
export function isVideoCallUrl(url) {
  if (!url) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname;
  const path = u.pathname;
  if (host === 'meet.google.com') return /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/.test(path);
  if (host === 'teams.live.com') return path.startsWith('/meet');
  if (host === 'teams.microsoft.com') return path.startsWith('/l/meetup-join');
  if (host === 'zoom.us' || host.endsWith('.zoom.us')) return /^\/(wc|j|s)\//.test(path);
  if (host === 'webex.com' || host.endsWith('.webex.com')) {
    return /^\/(meet|join|wbxmjs)\b/.test(path);
  }
  return false;
}

/**
 * Le badge de l'icône pour un état donné. « REC » l'emporte ; le point de
 * rappel n'existe que sans enregistrement. Texte vide = pas de badge.
 *
 * @param {{recording: boolean, paused: boolean, since: number|null}} state
 * @param {boolean} videoCallOpen
 * @param {() => number} [now]
 */
export function badgeFor(state, videoCallOpen, now = Date.now) {
  if (state.recording) {
    const minutes =
      typeof state.since === 'number' ? Math.max(0, Math.floor((now() - state.since) / 60000)) : 0;
    return {
      text: 'REC',
      color: state.paused ? '#8b949e' : '#d9534f',
      titleKey: state.paused ? 'titlePaused' : 'titleRecording',
      titleSubs: [String(minutes)],
    };
  }
  if (videoCallOpen) {
    return { text: '•', color: '#2f6fed', titleKey: 'titleVideoCall', titleSubs: [] };
  }
  return { text: '', color: null, titleKey: null, titleSubs: [] };
}

/**
 * `h:mm:ss` au-delà d'une heure, `mm:ss` en deçà.
 *
 * @param {number} ms
 */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
