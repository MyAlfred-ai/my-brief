/**
 * Corrections de la transcription demandées à l'Aide IA — « Alfred, remplace
 * partout Market par Marquet », « Alfred, corrige : la livraison est le 12,
 * pas le 2 ».
 *
 * Le modèle ne touche à rien : il NOMME le passage et ce qu'il faut lire à la
 * place, le serveur vérifie que le passage est bien dans la transcription
 * (lib/aiHelp/engine.js, `saidInMeeting`), et c'est ici que l'écran calcule
 * les lignes à réécrire. Il les rend à App.svelte par l'événement `edit` qui
 * sert déjà à la correction à la main (double-clic sur une ligne) : même
 * enregistrement, même sauvegarde, rien de plus à savoir pour App.
 *
 * Ce que ce module tient :
 *  - la même lecture qu'une correction automatique (`replacePassage`) : mot
 *    ENTIER, casse et accents indifférents — « Paul » ne touche pas
 *    « Paulette » ;
 *  - `all` faux : la prise de parole la plus RÉCENTE qui porte le passage, et
 *    elle seule ; `all` vrai : toutes ;
 *  - jamais la ligne en cours d'écriture (`isDelta`) : elle est encore
 *    réécrite par le direct ;
 *  - jamais une phrase adressée à l'IA — celle qui porte la demande
 *    (`skipKey`), ni les précédentes (`called`) : « Alfred, remplace Market par
 *    Marquet » deviendrait « remplace Marquet par Marquet » ;
 *  - une prise de parole ne se VIDE pas : retirer un passage qui est toute la
 *    ligne (ou n'en laisserait que la ponctuation) ne fait rien — l'édition à
 *    la main refuse aussi un texte vide.
 */
import { replacePassage } from './transcriptCorrections.js';

/**
 * @param {Array<{text?: string, isDelta?: boolean}>} items - la transcription
 * @param {Array<{find: string, with?: string, all?: boolean, skipKey?: string}>} edits -
 *   appliqués dans l'ordre : le second lit le texte que le premier a laissé
 * @param {(item: object) => string} [keyOf] - ce qui désigne une ligne (`skipKey`)
 * @param {Set<string>} [called] - les lignes où le mot d'appel a déclenché l'IA
 * @returns {Array<{index: number, text: string}>} les lignes à réécrire, une
 *   fois chacune, dans leur état final
 */
export function transcriptEdits(items, edits, keyOf = () => '', called = new Set()) {
  const list = Array.isArray(items) ? items : [];
  const next = new Map();
  const textAt = (index) => (next.has(index) ? next.get(index) : String(list[index]?.text || ''));

  for (const edit of Array.isArray(edits) ? edits : []) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const item = list[index];
      if (!item || item.isDelta) continue;
      const key = keyOf(item);
      if ((edit.skipKey && key === edit.skipKey) || called.has(key)) continue;
      const { text, count } = replacePassage(textAt(index), edit.find, edit.with);
      if (!count) continue;
      const clean = text.replace(/[ \t]{2,}/g, ' ').trim();
      if (!/[\p{L}\p{N}]/u.test(clean)) continue;
      next.set(index, clean);
      if (!edit.all) break;
    }
  }

  return [...next]
    .filter(([index, text]) => text !== String(list[index].text || ''))
    .sort((a, b) => a[0] - b[0])
    .map(([index, text]) => ({ index, text }));
}
