/**
 * Catalogue des gabarits d'infographie et des pictogrammes que l'IA peut
 * demander.
 *
 * ⚠️ RECOPIE de services/api/lib/infographicLayout.js (le frontend n'importe
 * pas le code serveur) : catalog.test.js vérifie que les deux listes restent
 * identiques. Un pictogramme ajouté là-bas sans être dessiné ici
 * (icons.js) s'afficherait en simple point.
 */

/** Les six gabarits. */
export const INFOGRAPHIC_TEMPLATES = [
  'synthese',
  'decision',
  'feuille_de_route',
  'tableau_de_bord',
  'atelier',
  'bilan',
];

/** Pictogrammes que le modèle peut demander (liste fermée). */
export const INFOGRAPHIC_ICONS = [
  'document',
  'calendrier',
  'horloge',
  'euro',
  'graphique',
  'tendance',
  'cible',
  'equipe',
  'personne',
  'coche',
  'alerte',
  'drapeau',
  'fusee',
  'ampoule',
  'outil',
  'engrenage',
  'bouclier',
  'usine',
  'camion',
  'panier',
  'message',
  'loupe',
  'etoile',
  'coeur',
  'cadenas',
  'balance',
  'ordinateur',
  'feuille',
  'globe',
  'diplome',
];

/** Pictogramme de l'étiquette de chaque gabarit, en tête de page. */
export const TEMPLATE_ICONS = {
  synthese: 'document',
  decision: 'balance',
  feuille_de_route: 'drapeau',
  tableau_de_bord: 'graphique',
  atelier: 'ampoule',
  bilan: 'boucle',
};

/** Gabarit affiché, repli compris (un contenu d'une version future, par exemple). */
export function templateOf(layout) {
  return INFOGRAPHIC_TEMPLATES.includes(layout?.gabarit) ? layout.gabarit : 'synthese';
}
