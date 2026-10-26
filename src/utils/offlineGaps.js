/**
 * Marqueurs « passage hors ligne » dans la transcription (app native).
 *
 * Pendant une coupure réseau, la transcription live a un trou : App.svelte
 * insère un marqueur à la position chronologique de la coupure, puis le
 * remplace par le texte Whisper batch quand les segments audio du gap ont pu
 * être envoyés (src/platform/offlineRecording.js). Fonctions pures, immutables
 * (mêmes conventions que transcriptionHistory), testées unitairement.
 */
import { buildAttributedTranscript } from './transcriptAttribution.js';

/**
 * Item d'historique représentant un gap non encore transcrit.
 * `offlineGapId` le rend retrouvable pour le remplacement ; `isDelta: false`
 * pour qu'il apparaisse dans le texte complet tant qu'il n'est pas résolu
 * (honnête : le passage existe mais n'est pas transcrit).
 */
export function makeGapMarkerItem({ gapId, time, timestamp, author, text }) {
  return {
    time,
    timestamp,
    author,
    text,
    isDelta: false,
    source: 'local',
    offlineGapId: gapId,
  };
}

/**
 * Remplace le texte du marqueur `gapId` par la transcription différée.
 * Texte vide (silence pendant la coupure, ou réponse filtrée) : le marqueur
 * est retiré — pas de ligne fantôme dans la transcription.
 * @returns {{ history: Array, changed: boolean }}
 */
export function resolveGapMarker(history, gapId, text) {
  const idx = history.findIndex((it) => it.offlineGapId === gapId);
  if (idx === -1) {
    return { history, changed: false };
  }
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return {
      history: [...history.slice(0, idx), ...history.slice(idx + 1)],
      changed: true,
    };
  }
  const { offlineGapId, ...resolved } = history[idx];
  return {
    history: [...history.slice(0, idx), { ...resolved, text: trimmed }, ...history.slice(idx + 1)],
    changed: true,
  };
}

/**
 * Re-dérive le texte complet depuis l'historique (même règle que
 * editTranscription : lignes finales uniquement, vides exclues), étiqueté par
 * locuteur si la réunion a tourné sur les deux flux audio — c'est ce texte-là
 * qui est persisté puis relu, donc il doit porter l'attribution.
 *
 * @param {Array} history
 * @param {string} [selfName] - userInfo.name, étiquette du canal micro
 */
export function recomputeFullText(history, selfName) {
  return buildAttributedTranscript(
    history.filter((it) => !it.isDelta),
    selfName,
  ).text;
}
