/**
 * Client des routes /api/actions — les actions déclenchées par les boutons
 * affichés après une réunion (transcription) ou une génération de résumé,
 * paramétrés dans l'administration (onglet « Actions »).
 *
 * Transport et contrat { ok, status, data } : services/apiClient.js.
 *
 * Deux formes d'envoi : JSON quand seul le contenu compte, multipart dès qu'un
 * FICHIER accompagne le document. Le fichier est fabriqué par le navigateur
 * (le PDF est tiré de sa mise en page, indisponible côté serveur) : c'est lui
 * qui transmet les octets, l'API ne fait que les relayer au fournisseur.
 */
import { get, post, upload } from './apiClient.js';

/**
 * @param {object} payload - { kind, title, content, lang }
 * @param {{blob: Blob, filename: string}} attachment
 * @returns {FormData}
 */
function toFormData(payload, attachment) {
  const form = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  form.append('file', attachment.blob, attachment.filename);
  return form;
}

/**
 * Envoie le document au compte connecté par email. Le destinataire est décidé
 * par le serveur (jamais envoyé d'ici).
 *
 * @param {{kind: 'transcription'|'summary', title?: string, content: string, lang?: string}} payload
 * @param {{blob: Blob, filename: string}} [attachment] - pièce jointe facultative
 */
export const sendDocumentByEmail = (payload, attachment = null) =>
  attachment
    ? upload('/actions/email', toFormData(payload, attachment))
    : post('/actions/email', payload);

/**
 * Dépose le document sur le Drive du compte relié (Google Drive, OneDrive,
 * bibliothèque SharePoint).
 *
 * Le fichier est ici l'objet même de l'action, pas un supplément : il est
 * obligatoire, et l'API n'accepte que le multipart pour cette route.
 *
 * `approved` est un CONSENTEMENT, pas une destination : l'utilisateur ne peut
 * rien choisir avec, seulement confirmer le plan que le serveur a résolu et lui
 * a renvoyé en 409 (cf. l'en-tête de routes/actions/execute.js, qui interdit
 * toute destination dans le corps).
 *
 * @param {{kind: 'transcription'|'summary', title?: string, content: string,
 *   lang?: string, meetingId?: string}} payload
 * @param {{blob: Blob, filename: string}} attachment
 * @param {{approved?: boolean}} [options]
 */
export const storeDocument = (payload, attachment, { approved = false } = {}) =>
  upload(
    '/actions/store',
    toFormData({ ...payload, ...(approved ? { approved: 'true' } : {}) }, attachment),
  );

// ── Fenêtre de navigation ───────────────────────────────────────────────────
// Le jeton d'accès au Drive ne descend jamais ici : le listage passe par l'API.
// Ce que ces appels rendent est une liste de `{ name, cursor }` — on accumule
// les NOMS pour composer le chemin, on renvoie le CURSEUR pour descendre
// (cf. l'en-tête de services/api/routes/actions/storage.js).

/** Bibliothèques disponibles : « Mon Drive », ou OneDrive + sites SharePoint. */
export const fetchStorageDrives = () => get('/actions/storage/drives');

/** @param {{driveId?: string, cursor?: string, search?: string, pageToken?: string}} params */
export function fetchStorageFolders(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, String(value));
  }
  const suffix = query.toString();
  return get(`/actions/storage/folders${suffix ? `?${suffix}` : ''}`);
}

/** Chemin absolu d'un dossier atteint par la recherche, qu'on n'a pas traversé. */
export function fetchStoragePath({ driveId = '', cursor = '' }) {
  const query = new URLSearchParams();
  if (driveId) query.set('driveId', driveId);
  if (cursor) query.set('cursor', cursor);
  return get(`/actions/storage/path?${query.toString()}`);
}

/** @param {{driveId?: string, cursor?: string, name: string}} payload */
export const createStorageFolder = (payload) => post('/actions/storage/folders', payload);

/**
 * Réglages d'actions de l'utilisateur, plus le vocabulaire de l'écran :
 * plafonds, variables admises, et ce que l'administration laisse ouvert.
 *
 * Ces trois derniers viennent du serveur et ne sont jamais recopiés ici — une
 * seconde liste de variables divergerait au premier ajout.
 */
export const fetchActionSettings = () => get('/actions/settings');

/** @param {{mail?: object, storage?: object, naming?: object}} payload */
export const saveActionSettings = (payload) => post('/actions/settings', payload);

// ── Détection d'actions en réunion ──────────────────────────────────────────
// Réglages personnels : il n'y a plus de valeur d'installation au-dessus (cf.
// services/api/routes/actions/detection.js).

/** @returns {Promise<{ok: boolean, data: {settings: object}}>} */
export const fetchDetectionSettings = () => get('/actions/detection');

/**
 * Champ ABSENT = inchangé, champ VIDE = retour au défaut.
 * @param {{enabled?: boolean, sensitivity?: string, triggerWords?: string[],
 *   allowUpdates?: boolean, windowSize?: number, minSentences?: number}} patch
 */
export const saveDetectionSettings = (patch) => post('/actions/detection', patch);

/**
 * Banc d'essai : passe un extrait de réunion dans la détection avec les
 * réglages AFFICHÉS (enregistrés ou non), par le chemin d'exécution de la
 * réunion réelle. Aucun effet de bord — d'où l'écart assumé avec le bouton
 * « Tester » des actions, qui exige un enregistrement préalable.
 *
 * @param {{content: string, settings?: object}} payload
 */
export const testDetection = (payload) => post('/actions/detection/test', payload);

/**
 * Exécute RÉELLEMENT une action avec un document factice.
 *
 * Ce n'est pas un aperçu : un aperçu dit ce qui partirait, il ne dit pas si le
 * jeton est encore valide ni si le dossier existe.
 *
 * @param {{target: 'email'|'storage', kind?: string, lang?: string,
 *   scope?: 'user'|'admin'}} payload
 */
export const runActionTest = (payload) => post('/actions/test', payload);
