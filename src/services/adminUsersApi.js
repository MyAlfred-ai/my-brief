/**
 * Client des routes /api/admin. Transport et contrat { ok, status, data } :
 * services/apiClient.js ; slugs d'erreur stables traduits par l'UI.
 */
import { get, post } from './apiClient.js';

/** `group` : ne rendre que les membres de ce groupe (cf. services/adminGroupsApi.js). */
export function listUsers({ q = '', limit = 100, skip = 0, group = '' } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (group) params.set('group', group);
  params.set('limit', String(limit));
  params.set('skip', String(skip));
  return get(`/admin/users?${params.toString()}`);
}

/** `password` omis ⇒ le serveur en génère un et le renvoie une seule fois. */
export const createUser = (payload) => post('/admin/users/create', payload);

export const updateUser = (payload) => post('/admin/users/update', payload);

export const resetUserPassword = (payload) => post('/admin/users/reset-password', payload);

/** `purgeData: true` supprime aussi réunions, templates personnels et configuration. */
export const deleteUser = (email, purgeData) =>
  post('/admin/users/delete', { email, purgeData: !!purgeData });

// ── Statistiques d'usage ───────────────────────────────────────────────────

/**
 * Agrégats d'usage de l'installation (réservé aux administrateurs), dans le
 * périmètre des filtres.
 *
 * Période : `days`, une valeur d'une liste fermée côté serveur (7, 30, 90,
 * 365, ou 0 pour « depuis toujours »), OU `from` et `to` (`AAAA-MM-JJ`, jours
 * entiers inclus) — `days` est alors ignoré. Toute autre valeur est refusée
 * en 400. Un filtre vide n'est pas envoyé.
 * @param {{days?: number, from?: string, to?: string, group?: string, user?: string, template?: string}} filters
 */
export function fetchUsageStats({
  days = 30,
  from = '',
  to = '',
  group = '',
  user = '',
  template = '',
} = {}) {
  const params = new URLSearchParams();
  if (from && to) {
    params.set('from', from);
    params.set('to', to);
  } else {
    params.set('days', String(days));
  }
  if (group) params.set('group', group);
  if (user) params.set('user', user);
  if (template) params.set('template', template);
  return get(`/admin/stats?${params.toString()}`);
}

/**
 * « Actualiser les tarifs » : le serveur relève en ligne les prix des modèles
 * d'IA et le taux de change, puis les enregistre. La nouvelle estimation se lit
 * ensuite par `fetchUsageStats` — cette réponse ne dit que ce qui a bougé
 * (`updated`, `missing`). 502 `prices_unreachable` : rien n'a pu être relevé,
 * le dernier relevé reste appliqué.
 */
export const refreshAiPrices = () => post('/admin/stats/prices/refresh', {});

// ── Réglages d'authentification ────────────────────────────────────────────
// Le clientSecret Google n'est JAMAIS renvoyé par l'API : la lecture expose
// seulement `hasSecret`, et l'omettre à l'enregistrement conserve la valeur
// déjà en base.

export const fetchAuthSettings = () => get('/admin/settings/auth');

export const saveAuthSettings = (payload) => post('/admin/settings/auth', payload);

// ── Clé OpenAI ─────────────────────────────────────────────────────────────
// La clé n'est jamais renvoyée : la lecture expose son existence, sa provenance
// (`settings` = saisie ici, `env` = fichier du déploiement) et un indice.

export const fetchAiSettings = () => get('/admin/settings/ai');

/**
 * Enregistre la clé et/ou le modèle de transcription.
 *
 * Champ ABSENT = inchangé, champ VIDE = retour au défaut. Ne jamais passer
 * `apiKey: ''` pour un simple changement de modèle : ça effacerait la clé.
 *
 * @param {{apiKey?: string, transcriptionModel?: string}} patch
 */
export const saveAiSettings = (patch) => post('/admin/settings/ai', patch);

/** Teste la clé réellement utilisée, sans rien modifier. */
export const testAiKey = () => post('/admin/settings/ai/test');

/**
 * Ouvre une vraie session Realtime avec ce modèle — c'est l'appel exact que
 * fera l'application au prochain enregistrement. Sans modèle : teste celui déjà
 * enregistré.
 * @param {string} [model]
 */
export const testTranscriptionModel = (model) =>
  post('/admin/settings/ai/test-transcription', model ? { model } : undefined);

/**
 * Vérifie que le compte OpenAI a bien ACCÈS à ce modèle de rédaction : un appel
 * de chat minuscule, pas une génération de compte rendu (qui coûterait le prix
 * d'un vrai résumé). Sans modèle : teste celui déjà en vigueur.
 * @param {string} [model]
 */
export const testSummaryModel = (model) =>
  post('/admin/settings/ai/test-summary', model ? { model } : undefined);

// ── Actions après réunion / résumé ─────────────────────────────────────────
// Visibilité des boutons « Envoyer par mail » / « Entreposer » / « Télécharger »
// proposés sur la transcription et les résumés, plus la destination
// d'entreposage. Le dossier cible n'est renvoyé qu'ici (routes admin).

export const fetchActionsSettings = () => get('/admin/settings/actions');

export const saveActionsSettings = (payload) => post('/admin/settings/actions', payload);

// ── Apparence (logo, phrase d'accueil, couleur primaire) ───────────────────
// L'écran d'administration lit ici (avec `updatedBy`) ; le reste de
// l'application reçoit la même chose, sans les métadonnées, via la sonde
// publique /api/auth/config (capabilities.branding du store auth).

export const fetchBrandingSettings = () => get('/admin/settings/branding');

/**
 * Champ ABSENT = inchangé, champ VIDE = retour à la valeur intégrée.
 * @param {{logo?: string, tagline?: string, taglineEn?: string, primaryColor?: string, secondaryColor?: string}} patch
 */
export const saveBrandingSettings = (patch) => post('/admin/settings/branding', patch);

// Contexte de l'organisation (onglet Configuration). Lecture réservée aux
// administrateurs ; les autres comptes le reçoivent avec les templates
// (GET /api/templates), sans son auteur.
export const fetchOrgContextSettings = () => get('/admin/settings/org-context');

/**
 * Champ ABSENT = inchangé, champ VIDE = plus aucun contexte joint aux résumés.
 * @param {{context?: string}} patch
 */
export const saveOrgContextSettings = (patch) => post('/admin/settings/org-context', patch);

// Corrections automatiques de la transcription (onglet Configuration, sous le
// vocabulaire). Même partage que lui : lecture réservée aux administrateurs,
// les autres comptes reçoivent la liste avec les templates.
export const fetchTranscriptCorrections = () => get('/admin/settings/transcript-corrections');

/**
 * La liste ENTIÈRE ; vide = plus aucune correction.
 * @param {{rules: Array<{from: string[], to: string}>}} payload
 */
export const saveTranscriptCorrections = (payload) =>
  post('/admin/settings/transcript-corrections', payload);
