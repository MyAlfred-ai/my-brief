/**
 * État de session de l'extension (V2) et badge de l'icône.
 *
 *  - `recording` : ce que l'onglet MyBrief lié a annoncé en dernier (via
 *    content.js). Stocké en `storage.session` : le service worker s'endort
 *    entre deux événements, sa mémoire ne survit pas — le stockage de
 *    session, si, et il s'efface à la fermeture de Chrome, ce qui est juste :
 *    à la réouverture, aucun enregistrement ne tourne.
 *  - `reminder` : le rappel visio, préférence de l'utilisateur
 *    (`storage.sync`), OFF par défaut. L'activer demande la permission de LIRE
 *    l'adresse des onglets des sites de visio — rien de plus, et rien avant.
 *
 * `refreshBadge()` est le seul endroit qui touche l'icône : REC l'emporte sur
 * le rappel, le rappel n'existe que sans enregistrement.
 */
import { badgeFor, isVideoCallUrl, VIDEO_CALL_HOST_PATTERNS } from './core.js';

const RECORDING_KEY = 'recording';
const REMINDER_KEY = 'reminder';

/** @typedef {{recording: boolean, paused: boolean, since: number|null, tabId: number|null}} RecordingState */

const IDLE = { recording: false, paused: false, since: null, tabId: null };

/** @returns {Promise<RecordingState>} */
export async function getRecordingState() {
  const stored = await chrome.storage.session.get(RECORDING_KEY);
  return { ...IDLE, ...(stored[RECORDING_KEY] || {}) };
}

/** @param {RecordingState} state */
export async function setRecordingState(state) {
  await chrome.storage.session.set({ [RECORDING_KEY]: state });
}

export async function clearRecordingState() {
  await chrome.storage.session.remove(RECORDING_KEY);
}

export async function isReminderEnabled() {
  const stored = await chrome.storage.sync.get(REMINDER_KEY);
  return stored[REMINDER_KEY] === true;
}

/** @param {boolean} enabled */
export async function setReminderEnabled(enabled) {
  await chrome.storage.sync.set({ [REMINDER_KEY]: !!enabled });
}

/** La permission de lire l'adresse des onglets de visio est-elle accordée ? */
export async function hasVideoCallPermission() {
  return chrome.permissions.contains({ origins: VIDEO_CALL_HOST_PATTERNS }).catch(() => false);
}

/**
 * Une visio est-elle ouverte dans un onglet ? Sans permission, la question
 * n'a pas de réponse (tabs.query ne renvoie que les onglets autorisés) :
 * false, et jamais d'erreur.
 */
export async function isVideoCallOpen() {
  if (!(await hasVideoCallPermission())) return false;
  try {
    const tabs = await chrome.tabs.query({ url: VIDEO_CALL_HOST_PATTERNS });
    return tabs.some((t) => isVideoCallUrl(t.url));
  } catch {
    return false;
  }
}

/**
 * Recalcule le badge depuis l'état courant. Appelé à chaque événement utile
 * (message d'état, onglet fermé/rechargé/activé, alarme) — idempotent.
 *
 * @param {(key: string, subs?: string[]) => string} t - i18n
 */
export async function refreshBadge(t) {
  const state = await getRecordingState();
  const visio = state.recording ? false : (await isReminderEnabled()) && (await isVideoCallOpen());
  const badge = badgeFor(state, visio);
  await chrome.action.setBadgeText({ text: badge.text });
  if (badge.color) await chrome.action.setBadgeBackgroundColor({ color: badge.color });
  await chrome.action.setTitle({
    title: badge.titleKey ? t(badge.titleKey, badge.titleSubs) : t('extName'),
  });
}
