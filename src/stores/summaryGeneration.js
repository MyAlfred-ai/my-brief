/**
 * Comptes rendus EN COURS de rédaction — pour quelles réunions, et la version
 * en attente de chacune.
 *
 * ── Pourquoi un store ──────────────────────────────────────────────────────
 * App.svelte tenait un booléen unique, `isGeneratingSummary` : tout l'écran le
 * suivait, quelle que soit la réunion affichée. Ouvrir une autre réunion
 * pendant la rédaction la montrait voilée « Résumé en cours… », et la réponse
 * du serveur écrivait le compte rendu PAR-DESSUS la réunion ouverte entre-temps
 * — l'état en attente vivait dans la liste de versions de l'écran, qu'un clic
 * dans l'historique remplace. Ici, chaque rédaction est rattachée à SA réunion :
 *   - la Sidebar anime le titre de la ligne concernée, et d'elle seule ;
 *   - App remet la version en attente dans le rail quand la réunion se rouvre
 *     (`pendingVersionFor`), et c'est la PRÉSENCE de cette version à l'écran
 *     qui dit si le voile, la carte de génération et le dock doivent attendre.
 *
 * ── Invariant ──────────────────────────────────────────────────────────────
 * La version en attente d'une rédaction est dans `summaryVersions` d'App si et
 * seulement si l'écran montre sa réunion. Ouvrir une réunion recompose sa liste
 * depuis l'historique (sans version en attente) puis y remet celle-ci ;
 * « Nouvelle réunion » vide la liste. La réponse du serveur, elle, ne touche
 * l'écran que si elle y retrouve sa version — sinon elle n'écrit qu'en base, et
 * une notification nomme la réunion.
 *
 * ── Plusieurs à la fois ────────────────────────────────────────────────────
 * Une liste, pas un singleton : rien n'empêche de résumer une réunion pendant
 * qu'une autre s'écrit — chacune a sa requête, sa version et sa ligne. Une même
 * réunion, elle, n'a qu'une rédaction à la fois (App le garde, sur la présence
 * d'une version en attente à l'écran).
 *
 * Réunion sans identifiant (audio importé, démarrage hors ligne) : rien à
 * animer dans l'historique et rien à remettre — elle n'a pas de ligne —, mais la
 * rédaction est inscrite quand même, pour que `finally` la retire comme les
 * autres.
 *
 * Ce module ne parle pas à l'utilisateur.
 */
import { writable, derived, get } from 'svelte/store';

/** @typedef {{meetingId: string|null, version: {id: string}}} SummaryGeneration */

/** @type {import('svelte/store').Writable<SummaryGeneration[]>} */
export const summaryGenerations = writable([]);

/** Identifiants des réunions dont un compte rendu s'écrit — la ligne de chacune s'anime. */
export const generatingMeetingIds = derived(
  summaryGenerations,
  (list) => new Set(list.map((g) => g.meetingId).filter((id) => id !== null)),
);

/** Même normalisation que meetingIdOf (stores/history.js) : chaîne, ou null. */
const key = (meetingId) => (meetingId == null || meetingId === '' ? null : String(meetingId));

/**
 * Inscrit une rédaction. À retirer par `endSummaryGeneration` dans TOUS les
 * cas — réponse, erreur, session expirée : une inscription qui traîne
 * laisserait un titre s'animer pour rien.
 *
 * @param {string|number|null} meetingId - réunion rédigée (null : pas encore en base)
 * @param {{id: string}} version - version en attente, telle que posée dans le rail
 */
export function beginSummaryGeneration(meetingId, version) {
  summaryGenerations.update((list) => [...list, { meetingId: key(meetingId), version }]);
}

/** @param {string} versionId - la version en attente de la rédaction terminée */
export function endSummaryGeneration(versionId) {
  summaryGenerations.update((list) => list.filter((g) => g.version.id !== versionId));
}

/**
 * Version en attente de la réunion `meetingId`, ou null : ce qu'App remet dans
 * le rail quand cette réunion se rouvre pendant sa rédaction.
 *
 * @param {string|number|null} meetingId
 * @returns {{id: string}|null}
 */
export function pendingVersionFor(meetingId) {
  const id = key(meetingId);
  if (id === null) return null;
  return get(summaryGenerations).find((g) => g.meetingId === id)?.version ?? null;
}
