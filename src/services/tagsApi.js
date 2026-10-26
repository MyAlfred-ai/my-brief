/**
 * Client des routes /api/tags et /api/history/tag — les tags de conversation.
 *
 * Transport et contrat { ok, status, data } : services/apiClient.js. Les
 * erreurs de ces routes sont de VRAIS codes HTTP avec un slug stable dans
 * `data.error` (`duplicate_label`, `limit_reached`, `tag_not_found`…) — c'est
 * `res.ok` qui décide, pas un `data.ok` comme sur les routes héritées n8n.
 *
 * Transport seulement : ni état, ni traduction, ni décision d'affichage.
 * L'état vit dans stores/tags.js.
 */
import { get, post } from './apiClient.js';

/**
 * Tags du compte + le vocabulaire servi par l'API.
 * @returns {Promise<{ok: boolean, status: number, data: {tags: Array, colors: string[], shapes: string[], max: number}}>}
 */
export const fetchTags = () => get('/tags');

/**
 * Crée un tag (sans `id`) ou modifie un tag existant (avec `id`).
 * @param {{id?: string, label: string, color: string, shape?: string}} tag
 */
export const saveTag = (tag) => post('/tags/save', tag);

/**
 * Supprime un tag et détague les conversations qui le portaient.
 * @param {string} id
 */
export const deleteTag = (id) => post('/tags/delete', { id });

/**
 * Range une conversation dans un tag, ou l'en sort avec `tagId: null`.
 * @param {string} meetingId
 * @param {string|null} tagId
 */
export const setMeetingTag = (meetingId, tagId) => post('/history/tag', { meetingId, tagId });
