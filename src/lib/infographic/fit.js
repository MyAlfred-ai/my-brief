/**
 * Ajustement à la page A4 — la plus grande échelle à laquelle le contenu
 * d'une infographie tient dans sa page.
 *
 * Pourquoi : la page est un A4, sans exception (demande du 2026-11-17). Le
 * serveur borne le nombre d'éléments (lib/infographicLayout.js), mais la
 * longueur des textes varie d'une réunion à l'autre : la feuille réduit alors
 * l'échelle de TOUT son contenu (`--ig-k`, cf. infographic.css), du même
 * facteur, jusqu'à tenir — plutôt que de couper ou d'allonger la page.
 *
 * L'échelle ne dépend pas de la largeur d'affichage (tout est proportionnel à
 * la feuille) : miniature, visionneuse et PNG trouvent la même. Au-dessous de
 * FIT_MIN, le texte deviendrait illisible : on s'arrête là, et ce qui dépasse
 * encore est rogné par le bas de la page.
 */

/** Échelle la plus petite admise. */
export const FIT_MIN = 0.72;

/**
 * @param {(scale: number) => boolean} overflows - applique l'échelle et dit
 *   si le contenu déborde encore de la page
 * @param {{min?: number, steps?: number}} [options]
 * @returns {number} l'échelle retenue, au centième, entre `min` et 1
 */
export function fitScale(overflows, { min = FIT_MIN, steps = 7 } = {}) {
  if (!overflows(1)) return 1;
  if (overflows(min)) return min;
  // Dichotomie : sept mesures suffisent pour le centième sur [0,72 ; 1].
  let fits = min;
  let over = 1;
  for (let i = 0; i < steps; i += 1) {
    const mid = (fits + over) / 2;
    if (overflows(mid)) over = mid;
    else fits = mid;
  }
  return Math.floor(fits * 100) / 100;
}
