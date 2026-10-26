/**
 * État d'enregistrement partagé — miroir EN LECTURE pour les composants
 * (Dock, Sidebar, pastille de connexion) sans prop drilling.
 *
 * App.svelte reste le propriétaire de la logique (MediaRecorder,
 * AudioContext, silence, pauses…) et REFLÈTE son état ici via des réactifs :
 * une seule direction, pas de double source de vérité. Le niveau micro
 * (audioLevelStore) vit encore dans src/store.js — consommateurs existants.
 */
import { writable } from 'svelte/store';

/** 'connected' | 'disconnected' | 'reconnecting' — état du canal Realtime micro. */
export const connectionState = writable('disconnected');

export const isRecordingStore = writable(false);
export const isPausedStore = writable(false);

/**
 * Secondes de réunion ÉCOULÉES depuis le démarrage (pauses exclues), posées
 * par le chronomètre d'App — la même valeur que l'affichage du timer.
 *
 * Déduit du crédit affiché (`quotaNow`, stores/quota.js) : le serveur ne
 * compte une réunion qu'à son arrêt, et un compteur figé pendant qu'on
 * consomme mentirait. Remis à zéro par App une fois le serveur relu après
 * l'arrêt, pas avant : entre les deux, la valeur reste déduite pour que le
 * compteur ne remonte pas le temps d'un aller-retour.
 */
export const liveElapsedStore = writable(0);

/**
 * meetingId de la réunion en train d'être ENREGISTRÉE, ou null.
 *
 * La réunion est inscrite dans l'historique dès le démarrage : la sidebar a
 * besoin de savoir LAQUELLE de ses lignes tourne, pour l'afficher en italique
 * et pour renvoyer au direct plutôt que d'ouvrir un brouillon.
 *
 * Distinct de `currentMeetingId` d'App.svelte, qui désigne la réunion AFFICHÉE
 * — consulter une archive pendant qu'on enregistre le fait changer.
 */
export const liveMeetingIdStore = writable(null);
