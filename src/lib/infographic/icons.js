/**
 * Pictogrammes des infographies — un seul trait pour tous : grille 24 × 24,
 * contour arrondi, sans remplissage. Dessinés ici (aucune dépendance) parce
 * qu'ils doivent survivre à l'export PNG : html2canvas sérialise chaque <svg>
 * en image isolée, où ni classe ni variable CSS ne s'appliquent. Chaque
 * pictogramme n'est donc qu'une liste de tracés `d`, et sa couleur une valeur
 * littérale posée par Icon.svelte.
 *
 * Les noms publics (ceux que l'IA choisit) sont dans catalog.js ; les autres
 * (`point`, `pouce`, `fiole`, `boucle`, `plus`, `moins`, `hausse`, `baisse`)
 * servent aux gabarits eux-mêmes.
 */

/** Cercle en tracé : deux demi-arcs. */
const circle = (cx, cy, r) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** @type {Record<string, string[]>} */
export const ICON_PATHS = {
  point: [circle(12, 12, 3.2)],
  document: [
    'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M14 3v5h5',
    'M9 13h6',
    'M9 17h6',
  ],
  calendrier: [
    'M6 5h12a2.5 2.5 0 0 1 2.5 2.5v10.5a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5V7.5A2.5 2.5 0 0 1 6 5z',
    'M3.5 10h17',
    'M8 3v4',
    'M16 3v4',
  ],
  horloge: [circle(12, 12, 8.5), 'M12 7.5V12l3 2'],
  euro: ['M17.5 6.6A7.2 7.2 0 1 0 17.5 17.4', 'M4 10.2h9', 'M4 13.8h9'],
  graphique: ['M4 20h16', 'M7 20v-6', 'M12 20V8', 'M17 20v-9'],
  tendance: ['M3.5 16.5l5.5-5.5 4 4 7-7.5', 'M14.5 7.5h5.5v5.5'],
  cible: [circle(12, 12, 8.5), circle(12, 12, 4.5), circle(12, 12, 0.8)],
  equipe: [
    circle(9, 8, 3.4),
    'M2.8 20c0-3.6 2.8-6 6.2-6s6.2 2.4 6.2 6',
    circle(17, 9, 2.5),
    'M16.6 14.1c2.8.3 4.8 2.4 4.8 5.6',
  ],
  personne: [circle(12, 8, 3.8), 'M4.5 20.5c0-4 3.4-6.8 7.5-6.8s7.5 2.8 7.5 6.8'],
  coche: [circle(12, 12, 9), 'M7.8 12.3l2.9 2.9 5.6-5.8'],
  alerte: ['M12 3.8L2.8 19.8h18.4L12 3.8z', 'M12 10v4.4', 'M12 17.1v.2'],
  drapeau: ['M5 21V4', 'M5 4.5h11.5l-2.2 4 2.2 4H5'],
  fusee: [
    'M14.5 4.5c2.8-1.1 4.6-1 5-1 0 .4.1 2.2-1 5l-6.2 6.2-4-4z',
    'M8.3 10.7L5 10.5 3.5 12l4 1.5',
    'M13.3 15.7l.2 3.3L12 20.5l-1.5-4',
    'M6.5 17.5c-1 .5-2 2-2 3 1 0 2.5-1 3-2',
    circle(15.5, 8.5, 1.3),
  ],
  ampoule: [
    'M9 18h6',
    'M10 21h4',
    'M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2v.5h5v-.5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
  ],
  outil: [
    'M14.7 6.3a4 4 0 0 0-5.4 5.1L3.8 16.9a1.6 1.6 0 0 0 2.3 2.3l5.5-5.5a4 4 0 0 0 5.1-5.4l-2.4 2.4-2.1-.4-.4-2.1z',
  ],
  engrenage: [
    circle(12, 12, 3),
    circle(12, 12, 6.5),
    'M12 2.8v2.7M12 18.5v2.7M2.8 12h2.7M18.5 12h2.7M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9',
  ],
  bouclier: [
    'M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z',
    'M8.8 12l2.2 2.2 4.2-4.4',
  ],
  usine: ['M3 20.5h18', 'M4 20.5V10.5l5 3v-3l5 3V4h4v16.5', 'M7 17h1.5M11 17h1.5'],
  camion: ['M3 6.5h11v10H3z', 'M14 10h4l3 3.5v3h-7', circle(7, 17.5, 1.8), circle(17.5, 17.5, 1.8)],
  panier: ['M3 4h2.5l2.2 10.5h10.6L20.5 7H6.6', circle(9.5, 19, 1.4), circle(17, 19, 1.4)],
  message: [
    'M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z',
    'M8 9h8',
    'M8 12.5h5',
  ],
  loupe: [circle(10.5, 10.5, 6.5), 'M15.5 15.5l5 5'],
  etoile: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z'],
  coeur: [
    'M12 20s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z',
  ],
  cadenas: [
    'M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5z',
    'M8 10.5v-3a4 4 0 0 1 8 0v3',
    'M12 14.5v2',
  ],
  balance: [
    'M12 4v16.5',
    'M7.5 20.5h9',
    'M4.5 7h15',
    'M4.5 7L2 13.5M4.5 7L7 13.5M19.5 7L17 13.5M19.5 7L22 13.5',
    'M2 13.5a2.5 2.5 0 0 0 5 0',
    'M17 13.5a2.5 2.5 0 0 0 5 0',
  ],
  ordinateur: [
    'M4.5 5h15a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    'M9 20h6',
    'M12 16.5V20',
  ],
  feuille: ['M5 19c0-8 5-13.5 14.5-14.5C19 14 13.5 19 5 19z', 'M5 19l7-7'],
  globe: [
    circle(12, 12, 8.5),
    'M3.5 12h17',
    'M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z',
  ],
  diplome: [
    'M2.5 9L12 4.5 21.5 9 12 13.5z',
    'M6.5 11v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11',
    'M21.5 9v5',
  ],
  // ── Pictogrammes des gabarits eux-mêmes ──
  pouce: [
    'M7 10.5v9.5H4.5v-9.5z',
    'M7 10.5l3.5-6.5c1.3 0 2.2 1 2 2.3l-.6 3.2h5.4a2 2 0 0 1 2 2.3l-1.1 6.5a2 2 0 0 1-2 1.7H7',
  ],
  fiole: [
    'M9.5 3.5h5',
    'M10.5 3.5v5.5L5 18.5a1.5 1.5 0 0 0 1.3 2.2h11.4a1.5 1.5 0 0 0 1.3-2.2L13.5 9V3.5',
    'M7.5 14.5h9',
  ],
  boucle: ['M19.5 9A8 8 0 0 0 5 7.5', 'M4.5 4v4h4', 'M4.5 15A8 8 0 0 0 19 16.5', 'M19.5 20v-4h-4'],
  check: ['M5.5 12.5l4.2 4.2 8.8-9.2'],
  plus: ['M12 6v12', 'M6 12h12'],
  moins: ['M6 12h12'],
  hausse: ['M12 19V5', 'M6 11l6-6 6 6'],
  baisse: ['M12 5v14', 'M6 13l6 6 6-6'],
};

/** Tracés d'un pictogramme, `point` pour un nom inconnu. */
export function iconPaths(name) {
  return ICON_PATHS[name] || ICON_PATHS.point;
}
