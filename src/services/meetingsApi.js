/**
 * Écritures sur une réunion DÉJÀ en base (résumé édité, transcription éditée,
 * notes et actions).
 *
 * Sorties d'App.svelte, où les deux fonctions étaient le même code à deux
 * exemplaires : même garde, même try/catch, même indicateur, même toast. Elles
 * ne renvoient plus que l'ISSUE ; l'indicateur de sauvegarde, le toast et la
 * relecture de l'historique restent à l'appelant, qui seul les possède.
 *
 * `'idle'` n'est pas une erreur : c'est « il n'y avait rien à écrire » (réunion
 * jamais sauvegardée, version inconnue) — l'indicateur doit retomber, sans
 * signaler d'échec à l'utilisateur.
 */
import { post } from './apiClient.js';

/** @typedef {'idle'|'saved'|'error'} SaveOutcome */

/**
 * @param {string|null} meetingId
 * @param {string|null} versionId
 * @param {string} html
 * @returns {Promise<SaveOutcome>}
 */
export async function persistVersionHtml(meetingId, versionId, html) {
  if (!meetingId || !versionId) {
    console.warn('[save] abandon — meetingId:', meetingId, 'versionId:', versionId);
    return 'idle';
  }
  const res = await post('/versions/update', { meetingId, versionId, html });
  if (!res?.ok) {
    console.error('[save] échec', res?.status);
    return 'error';
  }
  return 'saved';
}

/**
 * Sans cet appel, la transcription est relue depuis MongoDB à chaque
 * rechargement ou re-sélection depuis l'historique : l'édition est perdue.
 *
 * @param {string|null} meetingId
 * @param {string} transcription
 * @returns {Promise<SaveOutcome>}
 */
export async function persistTranscription(meetingId, transcription) {
  if (!meetingId) return 'idle';
  const res = await post('/transcription/update', { meetingId, transcription });
  if (!res?.ok) {
    console.error('[save-transcription] échec', res?.status);
    return 'error';
  }
  return 'saved';
}

/**
 * Notes et actions d'une réunion déjà en base, écrites sans compte rendu.
 * Avant cette route, elles ne partaient qu'avec /resume : une modification
 * faite sur une réunion rouverte était perdue si l'on ne régénérait pas.
 * Appelée en différé par stores/notesActionsSave.js.
 *
 * Un 404 n'est pas un échec à signaler : la réunion a été supprimée (ici,
 * pendant le délai d'écriture, ou depuis un autre onglet) — il n'y a plus rien
 * où écrire, et un toast « non enregistré » suivrait une suppression voulue.
 *
 * Un champ absent n'est pas envoyé, et le serveur ne le touche pas : une note
 * modifiée n'emporte pas les actions, qu'un autre appareil a pu changer.
 *
 * @param {string|null} meetingId
 * @param {{notes?: string, actions?: Array}} notesActions
 * @param {{keepalive?: boolean}} [opts] - `keepalive` : la page se ferme, la
 *   requête doit lui survivre
 * @returns {Promise<SaveOutcome>}
 */
export async function persistNotesActions(meetingId, { notes, actions } = {}, opts = {}) {
  if (!meetingId) return 'idle';
  const body = { meetingId };
  if (typeof notes === 'string') body.notes = notes;
  if (Array.isArray(actions)) body.actions = actions;
  const res = await post('/history/notes-actions', body, opts);
  if (res?.status === 404) return 'idle';
  if (!res?.ok) {
    console.error('[save-notes-actions] échec', res?.status);
    return 'error';
  }
  return 'saved';
}

/**
 * Ajout et suppression d'une version — SANS retour, en meilleur effort.
 *
 * L'appelant a déjà mis son état local à jour quand il appelle ici, et ne
 * ferait rien d'un échec : c'est le comportement qu'avaient ces deux fonctions
 * dans App.svelte, d'où elles sortent pour la place (cliquet max-lines).
 *
 * @param {string|null} meetingId
 * @param {object|null} version
 */
export async function addVersion(meetingId, version) {
  if (!meetingId || !version) return;
  try {
    await post('/versions/add', { meetingId, version });
  } catch (e) {}
}

/**
 * @param {string|null} meetingId
 * @param {string|null} versionId
 */
export async function deleteVersion(meetingId, versionId) {
  if (!meetingId || !versionId) return;
  try {
    await post('/versions/delete', { meetingId, versionId });
  } catch (e) {}
}

/**
 * Nommage IA d'une réunion enregistrée SANS compte rendu (« Enregistrer » à la
 * fin de la réunion) : le serveur pose `titlePending` et génère le titre en
 * tâche de fond — l'appelant relit l'historique jusqu'à la chute du drapeau
 * (stores/history.js → pollHistoryUntilMeetingReady).
 *
 * `'idle'` couvre aussi « rien à nommer » : titre déjà posé (à la main ou
 * généré) ou réunion sans matière — le serveur ne lance rien, et il n'y a
 * rien à attendre ni à signaler.
 *
 * `notesActions` : l'état de la colonne de droite, rangé avec la réunion —
 * sans lui, elle se rouvrait sans ses notes ni ses actions.
 *
 * @param {string|null} meetingId
 * @param {{notes: string, actions: Array}|null} [notesActions]
 * @returns {Promise<SaveOutcome>} 'saved' = titre en cours de génération
 */
export async function requestMeetingTitle(meetingId, notesActions = null) {
  if (!meetingId) return 'idle';
  const res = await post('/history/title', { meetingId, ...(notesActions || {}) });
  if (!res?.ok) {
    console.error('[title] échec', res?.status);
    return 'error';
  }
  return res.data?.titlePending ? 'saved' : 'idle';
}
