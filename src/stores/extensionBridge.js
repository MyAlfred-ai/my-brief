/**
 * Pont avec l'extension Chrome (extension/content.js) — côté application.
 *
 * L'extension n'a aucun accès direct à l'app : elle injecte un script de
 * contenu sur le site lié, qui parle à la page par `window.postMessage`.
 *
 *   extension → app : `hello` (+ version) — à l'injection, et en réponse à
 *   app → extension : `ping` — quand la page « Extension Chrome » s'ouvre
 *                     après l'injection et veut savoir si l'extension est là.
 *   app → extension : `state` — l'enregistrement tourne-t-il, en pause, depuis
 *                     quand. Émis à chaque changement ET en réponse au `hello`
 *                     (le script de contenu arrive après l'app : sans cette
 *                     réponse il ne saurait rien avant le prochain changement).
 *                     L'extension en fait le badge « REC » de son icône.
 *
 * Tout message est filtré sur `event.source === window` ET `event.origin ===
 * location.origin` : un iframe ou une autre origine ne peut pas se faire
 * passer pour l'extension. Le contenu, lui, n'est jamais exécuté — il est lu.
 *
 * `since` est l'instant où l'enregistrement a (re)démarré DANS CET ONGLET :
 * après un rechargement en cours de réunion, l'extension repart de là — elle
 * n'a pas le cumul d'App.svelte, qui n'est pas dans un store. Le badge n'en
 * a pas besoin ; la durée du popup est indicative.
 */
import { writable, get } from 'svelte/store';
import { isRecordingStore, isPausedStore } from './recording.js';

export const APP_SOURCE = 'mybrief-app';
export const EXTENSION_SOURCE = 'mybrief-extension';

/** @type {import('svelte/store').Writable<{installed: boolean, version: string}>} */
export const extensionInfo = writable({ installed: false, version: '' });

/**
 * Le message `state` pour un état donné — pur, testé.
 *
 * @param {{recording: boolean, paused: boolean, since: number|null}} s
 */
export function stateMessage({ recording, paused, since }) {
  return {
    source: APP_SOURCE,
    type: 'state',
    recording: !!recording,
    paused: !!recording && !!paused,
    since: recording ? since : null,
  };
}

/** Ce que l'app a annoncé en dernier — renvoyé tel quel sur `hello`. */
let current = { recording: false, paused: false, since: /** @type {number|null} */ (null) };

/** @param {{postMessage: Function, location: {origin: string}}} win */
function postState(win) {
  win.postMessage(stateMessage(current), win.location.origin);
}

/**
 * Traite un `message` reçu par la fenêtre.
 *
 * @param {{source: any, origin: string, data: any}} event
 * @param {{location: {origin: string}, postMessage?: Function}} [win]
 * @returns {boolean} le message venait bien de l'extension
 */
export function handleBridgeMessage(event, win = window) {
  if (event.source !== win || event.origin !== win.location.origin) return false;
  const data = event.data;
  if (!data || data.source !== EXTENSION_SOURCE || data.type !== 'hello') return false;
  extensionInfo.set({ installed: true, version: String(data.version || '') });
  if (typeof win.postMessage === 'function') postState(win);
  return true;
}

/** Demande à l'extension, si elle est là, de se signaler à nouveau. */
export function pingExtension(win = window) {
  win.postMessage({ source: APP_SOURCE, type: 'ping' }, win.location.origin);
}

/**
 * Nouvel état d'enregistrement : `since` est posé au passage à « en cours »
 * et conservé tant que ça tourne (une pause ne le remet pas).
 *
 * @param {boolean} recording
 * @param {boolean} paused
 * @param {() => number} [now]
 */
export function updateBridgeState(recording, paused, now = Date.now) {
  const since = recording ? (current.since ?? now()) : null;
  current = { recording, paused, since };
  return current;
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => handleBridgeMessage(event));
  const publish = () => {
    updateBridgeState(get(isRecordingStore), get(isPausedStore));
    postState(window);
  };
  isRecordingStore.subscribe(publish);
  isPausedStore.subscribe(publish);
}
