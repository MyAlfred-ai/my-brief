/**
 * Normalisation du HTML de résumé renvoyé par le LLM (espaces, lignes vides,
 * scaffold « --- » reproduit par le modèle), et règles pures des versions de
 * résumé (identifiants, état après un échec). La génération elle-même vit dans
 * App.svelte (POST /resume vers services/api).
 */

export function normalizeSummaryHtml(html) {
  if (!html) return html;
  return (
    html
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Lignes "---" seules (scaffold de template reproduit par le LLM)
      .replace(/^\s*---\s*$/gm, '')
      // Marqueurs de blocs IA du prompt scaffold ([[AI_RESUME_BLOCK]],
      // [[AI_SUMMARY_100_WORDS]]…) : le LLM doit les REMPLACER mais les laisse
      // parfois en préfixe du bloc généré — ils ne sont jamais du contenu.
      // Purge du <p> UNIQUEMENT quand il ne contenait qu'un marqueur : un
      // <p></p> générique peut être un saut de ligne voulu du template
      // (cf. <p><br></p> dans scaffoldMdToHtml / MarkdownEditor).
      .replace(/<p>\s*\[\[AI_[A-Z0-9_]+\]\]\s*<\/p>/g, '')
      .replace(/\[\[AI_[A-Z0-9_]+\]\]/g, '')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .replace(/\s*<ul>/g, '<ul>')
      .replace(/<\/ul>\s*/g, '</ul>')
      .replace(/\s*<ol>/g, '<ol>')
      .replace(/<\/ol>\s*/g, '</ol>')
      .replace(/\s*<li>/g, '<li>')
      .replace(/<\/li>\s*/g, '</li>')
      .replace(/\s*<p>/g, '<p>')
      .replace(/<\/p>\s*/g, '</p>')
      .replace(/\s*<h([1-6])>/g, '<h$1>')
      .replace(/<\/h([1-6])>\s*/g, '</h$1>')
      .trim()
  );
}

/**
 * Identifiant d'une version de résumé.
 *
 * Vit ici, à côté de `normalizeSummaryHtml` et de `LEGACY_VERSION_ID` : côté
 * écran, les identifiants de version n'ont qu'une source — une seconde
 * implémentation ferait diverger leur forme.
 *
 * @returns {string}
 */
export function makeVersionId() {
  return 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Version EN ATTENTE d'un compte rendu qui part à la rédaction : ce que le rail
 * des documents affiche (« Résumé n — génération en cours… ») et que la réponse
 * de /resume complète. `pages` n'est posé que si le Pagimètre a parlé : absent,
 * le badge de longueur reste muet (ResumeOverlays).
 *
 * Sortie d'App.svelte (plafonné par `max-lines`) avec stores/summaryGeneration.js :
 * cette version est aussi ce que le store garde pour la remettre dans le rail
 * quand sa réunion se rouvre pendant la rédaction.
 *
 * @param {{template?: string, ton?: string, longueur?: string, customPrompt?: string,
 *   pages?: number}|null} opts - choix de la carte de génération ; null depuis le dock
 * @param {string} currentTemplate - template en service, repli de `opts.template`
 */
export function pendingVersionFrom(opts, currentTemplate) {
  return {
    id: makeVersionId(),
    html: '',
    template: opts?.template ?? currentTemplate,
    ton: opts?.ton ?? null,
    longueur: opts?.longueur ?? null,
    customPrompt: opts?.customPrompt ?? null,
    ...(opts?.pages ? { pages: opts.pages } : {}),
    generatedAt: new Date().toISOString(),
    pending: true,
  };
}

/**
 * Identifiant de la version reconstruite d'un compte rendu enregistré sans
 * tableau `versions` (réunion n8n, première version jamais arrivée en base).
 *
 * FIXE, et le même que côté serveur (services/api/lib/legacyVersion.js), qui
 * inscrit cette version en base : au démarrage, ou juste avant qu'un nouveau
 * résumé n'écrase le compte rendu. Tiré au hasard ici, il désignerait une
 * version que la base ne connaît pas — une retouche ou une suppression faite
 * dans la foulée la manquerait.
 */
export const LEGACY_VERSION_ID = 'v_legacy';

/**
 * État d'écran après une génération en échec : l'onglet en attente disparaît,
 * et la version affichée RESTE à l'écran.
 *
 * Le message d'erreur ne s'affiche qu'à défaut de version. Posé à la place
 * d'une version, il y entrait au premier blur de l'éditeur, puis en base à la
 * première frappe (App.svelte → handleSummaryBlur, handleSummaryUpdate) : un
 * « Nouveau résumé » en échec effaçait le résumé précédent.
 *
 * @param {Array<{id: string, html: string}>} versions - dont la version en attente
 * @param {string|null} activeVersionId
 * @param {string} pendingId - version en attente, à retirer
 * @param {string} message - texte affiché s'il ne reste aucune version
 * @returns {{versions: Array, activeVersionId: string|null, summaryText: string}}
 */
export function afterFailedGeneration(versions, activeVersionId, pendingId, message) {
  const remaining = versions.filter((v) => v.id !== pendingId);
  const activeId =
    activeVersionId === pendingId ? remaining[remaining.length - 1]?.id : activeVersionId;
  const active = remaining.find((v) => v.id === activeId);
  return {
    versions: remaining,
    activeVersionId: active ? active.id : null,
    summaryText: active ? normalizeSummaryHtml(active.html) : message,
  };
}
