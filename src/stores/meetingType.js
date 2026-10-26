/**
 * « Quel type de réunion ? » — la question que pose startRecording (App.svelte)
 * une fois le micro ouvert, et à laquelle répond MeetingTypeModal.
 *
 * Une promesse, pas un simple état : startRecording ATTEND la réponse au milieu
 * de sa séquence (micro ouvert, partage d'écran pas encore demandé), puis
 * reprend là où il s'était arrêté.
 *
 * Réponses : `true` visio (ouvrir le partage d'écran), `false` présentiel
 * (micro seul), `null` annuler — ne pas démarrer : startRecording relâche le
 * micro et aucune réunion n'est inscrite.
 *
 * Le CONTEXTE dit ce que « Réunion avec visio » va ouvrir, pour que la fenêtre
 * l'annonce : la fenêtre de partage du navigateur (`share`), ou le périphérique
 * « son de l'ordinateur » choisi dans Firefox ou Safari (`device`, avec son
 * nom) — cf. lib/audio/systemAudio.js.
 */
import { writable } from 'svelte/store';

/** La question est à l'écran. */
export const meetingTypeAsked = writable(false);

/** @type {import('svelte/store').Writable<{path: 'share'|'device', deviceLabel?: string}>} */
export const meetingTypeContext = writable({ path: 'share' });

let answer = null;

/**
 * @param {{path: 'share'|'device', deviceLabel?: string}} [context]
 * @returns {Promise<boolean | null>}
 */
export function askMeetingType(context = { path: 'share' }) {
  meetingTypeContext.set(context);
  return new Promise((resolve) => {
    answer = resolve;
    meetingTypeAsked.set(true);
  });
}

/** @param {boolean | null} withVisio - `null` : annuler le démarrage */
export function answerMeetingType(withVisio) {
  meetingTypeAsked.set(false);
  answer?.(withVisio);
  answer = null;
}
