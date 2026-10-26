/**
 * Réunion EN COURS d'enregistrement — son cycle de vie côté base.
 *
 * ── Ce que ce module change ────────────────────────────────────────────────
 * Un document `resume` ne naissait qu'à la première génération de compte-rendu.
 * Une réunion en cours, ou terminée sans résumé, n'existait donc NULLE PART :
 * ni dans l'historique, ni après un rechargement de page. Fermer l'onglet en
 * pleine réunion effaçait tout ce qui avait été dit.
 *
 * Désormais la réunion est ouverte au DÉMARRAGE (`/history/start`), sa
 * transcription est poussée au fil de l'eau, et elle est close à l'arrêt
 * (`/history/stop`), avec ses notes et ses actions.
 *
 * ── Pourquoi hors d'App.svelte ─────────────────────────────────────────────
 * App.svelte est plafonné (règle `max-lines`) et n'a pas besoin de porter
 * l'intervalle de sauvegarde ni la mémoire du dernier texte envoyé. Il ne
 * garde que ce qui le concerne : quelle réunion est affichée, quel tag poser.
 *
 * ── Contrat ────────────────────────────────────────────────────────────────
 * `liveMeetingIdStore` est écrit ICI et nulle part ailleurs : c'est la seule
 * source de vérité de « quelle ligne de l'historique est en train de tourner »,
 * lue par la Sidebar (italique) et par App (clic sur cette ligne → retour au
 * direct). À NE PAS confondre avec `currentMeetingId` d'App.svelte, qui désigne
 * la réunion AFFICHÉE — consulter une archive pendant qu'on enregistre le fait
 * changer, pas celui-ci.
 *
 * ── Échec toléré ───────────────────────────────────────────────────────────
 * Si `/history/start` n'aboutit pas (hors ligne, serveur injoignable), rien
 * n'est posé et l'enregistrement continue : la réunion naîtra à la première
 * génération de résumé, comme avant. Faire dépendre le démarrage d'une réunion
 * du réseau serait un net recul — c'est exactement ce que /tempkey s'interdit.
 */
import { get } from 'svelte/store';
import { post } from '../services/apiClient.js';
import { LIVE_TRANSCRIPT_SAVE_MS } from '../config/constants.js';
import { liveMeetingIdStore } from './recording.js';

/**
 * Identifiant de réunion tiré côté CLIENT, au démarrage.
 *
 * Le serveur en générait un à la première génération de compte-rendu ; il doit
 * désormais exister avant, puisque c'est lui qui ouvre la ligne d'historique.
 * `crypto.randomUUID` n'est pas garanti hors contexte sécurisé (WebView native
 * en http) — d'où le repli.
 *
 * @returns {string}
 */
export function newMeetingId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Lecture du texte à sauvegarder, fournie par App (le direct peut vivre dans un snapshot). */
let readTranscription = () => '';
/** Dernier texte accepté par le serveur : un échec réseau doit être rejoué, pas oublié. */
let lastSaved = '';
let saveInterval = null;

function stopSaves() {
  clearInterval(saveInterval);
  saveInterval = null;
}

/**
 * Pousse la transcription du direct en base si elle a changé.
 * Exportée pour l'arrêt (dernier envoi avant la clôture) et pour les tests.
 * @returns {Promise<boolean>} true si un envoi a été accepté
 */
export async function flushLiveTranscription() {
  const meetingId = get(liveMeetingIdStore);
  if (!meetingId) return false;
  const text = (readTranscription() || '').trim();
  if (!text || text === lastSaved) return false;
  const res = await post('/transcription/update', { meetingId, transcription: text });
  if (!res?.ok) return false;
  lastSaved = text;
  return true;
}

/**
 * Ouvre la réunion en base et démarre les sauvegardes périodiques.
 *
 * @param {{readTranscription: () => string}} deps - lecture du texte courant du
 *   direct. Une FONCTION et non une valeur : pendant la consultation d'une
 *   archive, le direct vit dans le snapshot d'App, et lire la mauvaise source
 *   écraserait la réunion en cours avec la transcription de celle qu'on lit.
 * @returns {Promise<string|null>} meetingId ouvert, ou null si l'appel a échoué
 */
export async function startLiveMeeting(deps) {
  const meetingId = newMeetingId();
  const res = await post('/history/start', { meetingId, startedAt: new Date().toISOString() });
  if (!res?.ok) {
    console.warn('[live] /history/start refusé — réunion créée au premier résumé', res?.status);
    return null;
  }
  readTranscription = deps?.readTranscription || (() => '');
  lastSaved = '';
  liveMeetingIdStore.set(meetingId);
  stopSaves();
  saveInterval = setInterval(() => {
    flushLiveTranscription().catch((err) => console.warn('[live] sauvegarde en échec', err));
  }, LIVE_TRANSCRIPT_SAVE_MS);
  return meetingId;
}

/**
 * Clôt la réunion : dernier envoi de transcription, durée mesurée, et purge de
 * la ligne si rien n'a été dit (enregistrement lancé par erreur). La purge est
 * décidée par le SERVEUR — un onglet fermé juste après l'arrêt abandonnerait
 * sinon le déchet en base.
 *
 * L'identifiant est lu tout de suite, et retiré du store avant la clôture
 * elle-même : l'italique de la sidebar tombe avec l'arrêt, pas avec la réponse
 * HTTP. Retiré seulement s'il désigne encore CETTE réunion : « Nouvelle
 * réunion » (mobile) arrête puis redémarre aussitôt, et la suivante a pu
 * s'ouvrir pendant l'attente — effacer son identifiant la priverait de ses
 * sauvegardes et de sa clôture.
 *
 * Notes et actions partent AVEC la clôture, dans la même écriture : une
 * réunion terminée par « Enregistrer » se rouvre avec elles, et une réunion
 * qui en porte n'est jamais purgée comme vide. Elles sont relues au DERNIER
 * moment (`readNotesActions`) : l'envoi de la transcription peut prendre des
 * secondes, et un instantané pris au clic écraserait une retouche écrite
 * entre-temps. `settled` : les écritures de notes déjà parties
 * (stores/notesActionsSave.js → settle), attendues pour que la clôture arrive
 * après elles.
 *
 * @param {{duration?: number, readNotesActions?: () => ({notes: string, actions: Array}|null),
 *   settled?: Promise}} [opts] - durée mesurée au chronomètre (secondes)
 * @returns {Promise<{meetingId: string, discarded: boolean}|null>} null si aucune
 *   réunion n'était ouverte (démarrage hors ligne)
 */
export async function stopLiveMeeting({ duration = null, readNotesActions, settled } = {}) {
  const meetingId = get(liveMeetingIdStore);
  if (!meetingId) return null;
  stopSaves();
  await Promise.all([
    flushLiveTranscription().catch(() => {}),
    Promise.resolve(settled).catch(() => {}),
  ]);
  if (get(liveMeetingIdStore) === meetingId) liveMeetingIdStore.set(null);
  const side = readNotesActions?.() || null;
  const res = await post('/history/stop', {
    meetingId,
    duration,
    discardIfEmpty: true,
    ...(typeof side?.notes === 'string' ? { notes: side.notes } : {}),
    ...(Array.isArray(side?.actions) ? { actions: side.actions } : {}),
  });
  return { meetingId, discarded: res?.data?.discarded === true };
}

/** Démontage de l'app : ne pas laisser l'intervalle derrière soi. */
export function disposeLiveMeeting() {
  stopSaves();
}
