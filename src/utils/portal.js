/**
 * Action Svelte : téléporte un élément dans <body>.
 *
 * Un `position: fixed` est capturé par tout ancêtre transformé (transform,
 * filter) : le dock est centré par `translateX(-50%)`, l'onglet Résumé défile
 * dans une pile filtrée — une fenêtre plein écran rendue dedans ne couvrait
 * que sa colonne (constaté en recette pour la visionneuse d'infographie).
 * Sortir du DOM parent est le seul remède ; Svelte garde la main sur le nœud
 * (événements, réactivité) et le retire à la destruction.
 *
 * Usage : `<div use:portal> … </div>` autour du composant à sortir — une
 * action ne se pose pas sur un composant.
 *
 * @param {HTMLElement} node
 * @param {HTMLElement} [target]
 */
export function portal(node, target = document.body) {
  target.appendChild(node);
  return { destroy: () => node.parentNode && node.parentNode.removeChild(node) };
}
