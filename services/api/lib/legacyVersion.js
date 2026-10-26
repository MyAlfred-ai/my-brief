/**
 * Version d'un compte rendu enregistré SANS tableau `versions`.
 *
 * Deux sortes de documents `resume` portent un compte rendu mais aucune
 * version : ceux du pipeline n8n, antérieurs aux versions, et les réunions dont
 * la première version n'est jamais arrivée en base (le client la pousse en
 * meilleur effort, après /resume — cf. src/services/meetingsApi.js).
 *
 * L'écran les affiche pourtant avec un onglet « Résumé 1 », reconstruit depuis
 * `resume` (src/utils/historySelection.js). Cette version n'existait qu'à
 * l'écran, d'où deux pertes :
 *   - un « Nouveau résumé » écrasait `resume` et n'empilait que la nouvelle
 *     version : à la réouverture, le compte rendu d'origine avait disparu ;
 *   - une retouche échouait — Mongo refuse `versions.$[v]` sur un tableau
 *     absent (« The path 'versions' must exist in the document in order to
 *     apply array updates »).
 *
 * La version est donc inscrite en base : au démarrage (lib/bootstrap.js), et
 * au plus tard juste avant qu'un nouveau compte rendu ne l'écrase
 * (routes/meetings.js → persistResume).
 *
 * L'identifiant est FIXE, et le même qu'à l'écran (`LEGACY_VERSION_ID`,
 * src/utils/summary.js) : la version affichée et la version en base sont une
 * seule et même version. Tiré au hasard, il ferait manquer à une retouche ou à
 * une suppression faite dans la foulée la version que la base vient d'inscrire.
 * Unique dans sa réunion, ce qui suffit : les routes ciblent toujours
 * `{meetingId, versions.id}`.
 */

export const LEGACY_VERSION_ID = 'v_legacy';

/**
 * Filtre Mongo des documents sans version — tableau absent, nul ou vide. Un
 * `versions` d'une autre forme n'en fait pas partie : on n'écrase pas une
 * donnée qu'on ne sait pas lire.
 */
export const WITHOUT_VERSIONS = [
  { versions: { $exists: false } },
  { versions: null },
  { versions: { $size: 0 } },
];

/**
 * @param {{resume?: unknown, versions?: unknown, template?: unknown, now?: unknown}|null} doc
 * @returns {{id: string, html: string, template: unknown, ton: null, longueur: null,
 *   customPrompt: null, generatedAt: unknown}|null} la version à inscrire, ou null
 *   si le document a déjà ses versions, ou aucun compte rendu
 */
export function legacyVersionOf(doc) {
  if (!doc) return null;
  const { versions, resume } = doc;
  if (versions != null && !(Array.isArray(versions) && versions.length === 0)) return null;
  if (typeof resume !== 'string' || !resume.trim()) return null;
  return {
    id: LEGACY_VERSION_ID,
    html: resume,
    template: doc.template ?? null,
    ton: null,
    longueur: null,
    customPrompt: null,
    // Date de la dernière écriture du compte rendu — celle que l'écran retient
    // déjà pour la version reconstruite.
    generatedAt: doc.now ?? null,
  };
}
