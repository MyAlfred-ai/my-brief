/**
 * Client des routes myBrain — l'envoi des réunions au cerveau partagé.
 * Transport et contrat { ok, status, data } : services/apiClient.js ; slugs
 * d'erreur stables traduits par l'UI.
 */
import { get, post } from './apiClient.js';

// ── Administration → MyBrain ───────────────────────────────────────────────
// La clé n'est jamais renvoyée : la lecture expose son existence et l'aperçu
// que myBrain affiche lui-même (« mbk_AbCd…wxyz »).

export const fetchMyBrainAdminSettings = () => get('/admin/settings/mybrain');

/**
 * Champ ABSENT = inchangé, champ VIDE = retiré (`apiKey: ''` débranche). Une
 * adresse ou une clé modifiée est vérifiée auprès de myBrain avant d'être
 * enregistrée.
 * @param {{url?: string, apiKey?: string, policy?: 'off'|'optin'|'forced'}} patch
 */
export const saveMyBrainAdminSettings = (patch) => post('/admin/settings/mybrain', patch);

/**
 * Teste la connexion telle que l'écran la montre, sans rien enregistrer :
 * l'adresse et la clé saisies, celles enregistrées pour ce qui est absent.
 * `draft: true` dans la réponse = c'est la saisie qui a été testée.
 * @param {{url?: string, apiKey?: string}} [draft]
 */
export const testMyBrainConnection = (draft = {}) => post('/admin/settings/mybrain/test', draft);

// ── Ma configuration → MyBrain ─────────────────────────────────────────────

/** Ce que l'installation propose, le choix du compte, ses derniers envois. */
export const fetchMyBrainSettings = () => get('/mybrain/settings');

/** @param {boolean} enabled */
export const saveMyBrainSettings = (enabled) => post('/mybrain/settings', { enabled: !!enabled });

/** « Réessayer » l'envoi d'une réunion qui n'est pas arrivée. */
export const retryMyBrainSend = (meetingId) => post('/mybrain/send', { meetingId });
