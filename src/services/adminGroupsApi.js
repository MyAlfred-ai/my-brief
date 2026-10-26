/**
 * Client des routes /api/admin/groups. Transport et contrat { ok, status, data } :
 * services/apiClient.js ; slugs d'erreur stables traduits par l'UI.
 *
 * Les membres d'un groupe se lisent par `listUsers({ group })`
 * (services/adminUsersApi.js) : même liste de comptes, même projection.
 */
import { get, post } from './apiClient.js';

/** Catalogue + palette, plafond et identifiant du groupe par défaut. */
export const listGroups = () => get('/admin/groups');

/** @param {{name: string, description?: string, color?: string}} payload */
export const createGroup = (payload) => post('/admin/groups/create', payload);

/** Champ ABSENT = inchangé. @param {{id: string, name?: string, description?: string, color?: string}} payload */
export const updateGroup = (payload) => post('/admin/groups/update', payload);

/** Les membres restent dans leurs autres groupes ; sans autre groupe, ils reviennent au groupe par défaut. */
export const deleteGroup = (id) => post('/admin/groups/delete', { id });

/**
 * Entrées et sorties d'un groupe, par adresse. Tout ou rien côté serveur : une
 * adresse inconnue refuse l'appel entier.
 * @param {string} id
 * @param {{add?: string[], remove?: string[]}} changes
 */
export const changeGroupMembers = (id, { add = [], remove = [] } = {}) =>
  post('/admin/groups/members', {
    id,
    ...(add.length ? { add } : {}),
    ...(remove.length ? { remove } : {}),
  });
