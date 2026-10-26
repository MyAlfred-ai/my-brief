/**
 * Couleur d'un groupe d'utilisateurs → jetons CSS.
 *
 * Palette FERMÉE, en miroir de GROUP_COLORS (services/api/lib/repositories/
 * groups.js) et des jetons `--tag-*` de src/styles/tokens.css : groupes et
 * tags partagent la même palette. Une pastille est une pastille, et deux jeux
 * de couleurs voisines (un vert de tag, un autre vert de groupe) se
 * confondraient à l'écran sans rien dire de plus.
 *
 * Un slug inconnu (palette élargie côté serveur avant le frontend) retombe sur
 * le repli au lieu de peindre une pastille transparente.
 */
export const GROUP_COLORS = ['slate', 'red', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'];

export const GROUP_COLOR_FALLBACK = 'slate';

/**
 * @param {string} color - slug de la palette
 * @returns {{dot: string, soft: string}} valeurs `var(--tag-…)`
 */
export function groupColorVars(color) {
  const known = GROUP_COLORS.includes(color) ? color : GROUP_COLOR_FALLBACK;
  return { dot: `var(--tag-${known})`, soft: `var(--tag-${known}-soft)` };
}
