/**
 * Transcription affichée — transport seul (cf. apiClient.js pour le contrat
 * `{ ok, status, data }`) : la relecture par les notes, et les « Mots
 * remplacés » du compte. La logique vit dans utils/transcriptRefine.js et
 * stores/transcriptCorrections.js.
 */
import { get, post, raw } from './apiClient.js';

/**
 * Relecture des dernières phrases à la lumière des notes — et du contexte du
 * tag de la réunion, que le serveur relit en base d'après `tagId`.
 * @param {string[]} sentences
 * @param {string} notes
 * @param {string|null} [tagId]
 * @returns {Promise<string[]|null>} les phrases relues, ou null en échec
 */
export async function refineSentences(sentences, notes, tagId = null) {
  const body = tagId ? { sentences, notes, tagId } : { sentences, notes };
  const res = await raw('/refine-transcript', { method: 'POST', body });
  return res?.ok ? (await res.json())?.sentences : null;
}

/** La liste de corrections du compte, et son choix d'apprendre depuis les notes. */
export const fetchUserCorrections = () => get('/transcript-corrections');

/**
 * Réglages → Pendant la réunion → Mots remplacés. Champ absent = inchangé.
 * @param {{rules?: Array<{from: string[], to: string}>, learn?: boolean}} body
 */
export const saveUserCorrections = (body) => post('/transcript-corrections', body);

/**
 * Remplacements écrits dans les notes, à verser dans la liste du compte.
 * @param {Array<{from: string, to: string}>} replacements
 */
export const learnUserCorrections = (replacements) =>
  post('/transcript-corrections/learn', { replacements });
