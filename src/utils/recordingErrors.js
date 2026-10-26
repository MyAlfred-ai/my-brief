/**
 * Message d'un démarrage d'enregistrement refusé, choisi d'après la cause.
 *
 * Remplace une alerte technique (« NotAllowedError… Consultez la console
 * (F12) ») qui n'avait de sens que sur un ordinateur : un téléphone n'a ni
 * console ni F12, et c'est là que le refus du micro est le plus courant — la
 * première invite système, balayée d'un geste. Le message dit quoi FAIRE, et
 * part en toast : une alerte bloquante, en WebView, affiche en titre l'adresse
 * du site.
 */

/** Erreurs de getUserMedia, par `name` (spécification Media Capture). */
const MEDIA_ERROR_KEYS = {
  NotAllowedError: 'alerts.micDenied',
  SecurityError: 'alerts.micDenied',
  NotFoundError: 'alerts.micNotFound',
  OverconstrainedError: 'alerts.micNotFound',
  NotReadableError: 'alerts.micBusy',
  AbortError: 'alerts.micBusy',
};

/**
 * « Annuler » dans « Quel type de réunion ? » (MeetingTypeModal) : le démarrage
 * s'interrompt micro déjà ouvert. Levée comme une erreur, l'annulation emprunte
 * le nettoyage d'un échec (micro relâché, aucune réunion inscrite) — mais ce
 * n'en est pas un : aucun message.
 */
const START_CANCELLED = 'StartCancelled';

export function startCancelledError() {
  return Object.assign(new Error('Démarrage annulé'), { name: START_CANCELLED });
}

/**
 * @param {unknown} error - levée pendant le démarrage (micro, AudioContext,
 *   connexion de transcription…)
 * @returns {string | null} clé uiText du message à afficher — `null` pour une
 *   annulation, qui n'a rien à dire
 */
export function recordingStartErrorKey(error) {
  const name = error && typeof error === 'object' ? error.name : '';
  if (name === START_CANCELLED) return null;
  return MEDIA_ERROR_KEYS[name] || 'alerts.recordingStartFailed';
}
