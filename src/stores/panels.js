/**
 * Panneau plein écran actif — « Ma configuration », Administration, « Mes
 * statistiques ».
 *
 * Remplace trois booléens `showConfig`/`showUserTemplates`/`showAdmin`
 * d'App.svelte dont l'exclusion mutuelle était réécrite à la main dans chaque
 * branche du menu (les trois panneaux sont `flex: 1` du même layout : ouverts
 * ensemble ils se partageraient la largeur). Une seule valeur rend l'exclusion
 * STRUCTURELLE : ouvrir l'un ferme l'autre, il n'y a plus rien à maintenir.
 *
 * Le hash reste la source de vérité au chargement et au retour arrière
 * (deep-links #config / #my-templates / #my-tags / #admin / #my-stats, callback OAuth Gmail
 * qui revient sur #config) : App.svelte écoute hashchange et appelle
 * syncFromHash.
 * Les effets de bord de fermeture (recharger templates/statut mail) restent
 * dans App.svelte — le store ne connaît que la navigation.
 */
import { writable } from 'svelte/store';

/** @typedef {'config'|'admin'|'stats'} PanelName */

export const PANEL_HASHES = {
  config: '#config',
  admin: '#admin',
  stats: '#my-stats',
};

/**
 * Anciens panneaux devenus des SECTIONS de « Ma configuration » — les réglages
 * de l'utilisateur tiennent désormais dans un seul panneau, dont la colonne de
 * gauche porte toute la navigation. Leurs hash restent valables : ils sont dans
 * des favoris, dans la documentation, et rien ne justifie de les casser.
 */
export const SECTION_HASHES = {
  '#my-templates': 'templates',
  '#my-tags': 'tags',
};

/** @param {string} hash @returns {PanelName|null} */
export function panelFromHash(hash) {
  if (SECTION_HASHES[hash]) return 'config';
  const entry = Object.entries(PANEL_HASHES).find(([, h]) => h === hash);
  return entry ? /** @type {PanelName} */ (entry[0]) : null;
}

/** @type {import('svelte/store').Writable<PanelName|null>} */
export const activePanel = writable(null);

/**
 * Ouvre `name` (et ferme l'éventuel autre panneau — une seule valeur).
 * `section` préselectionne une entrée de sa colonne de gauche : c'est ce qui
 * permet à « Mes tags » ou « Importer un audio » d'ouvrir le panneau
 * DIRECTEMENT sur le bon écran, sans étape intermédiaire.
 */
export function openPanel(name, section = '') {
  if (!PANEL_HASHES[name]) return;
  activePanel.set(name);
  if (section) selectPanelSection(section);
  window.location.hash = PANEL_HASHES[name];
}

/**
 * Ferme le panneau actif et nettoie le hash correspondant — le hash étant
 * relu au chargement et à chaque hashchange, le laisser rouvrirait le
 * panneau au premier retour arrière du navigateur.
 */
export function closePanel() {
  activePanel.set(null);
  if (panelFromHash(window.location.hash)) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/**
 * Aligne le store sur le hash courant (chargement initial, hashchange). Un
 * hash d'ancien panneau (#my-tags…) ouvre la configuration SUR sa section :
 * sans ça le lien aboutirait au panneau, mais pas à l'écran attendu.
 */
export function syncFromHash() {
  const hash = window.location.hash;
  activePanel.set(panelFromHash(hash));
  if (SECTION_HASHES[hash]) selectPanelSection(SECTION_HASHES[hash]);
}

// ── Navigation de sections du panneau ouvert ─────────────────────────────────
//
// Les sections (« Réglages audio », « Mes tags », « Aide », …) s'affichent
// dans la SIDEBAR, à la place de l'historique — plus dans une barre d'onglets
// en haut du panneau. Le panneau reste le seul à connaître sa liste (elle
// dépend de ses plafonds et de la langue) : il l'ENREGISTRE ici, la sidebar ne
// fait que la rendre et remonter la sélection.
//
// `group` porte l'intertitre sous lequel l'entrée se range. Il est répété sur
// chaque entrée plutôt que porté par une liste de groupes : la sidebar ouvre
// un intertitre quand la valeur CHANGE, ce qui garde l'ordre des entrées comme
// seule source de vérité — impossible d'avoir un groupe vide ou orphelin.
//
// `href` fait d'une entrée un LIEN (« Aide ») : rendu en `<a>` qui s'ouvre dans
// un nouvel onglet, hors de la liste d'onglets, et jamais sélectionné.

const EMPTY_NAV = { owner: null, title: '', items: [], active: '' };

/**
 * @type {import('svelte/store').Writable<{
 *   owner: PanelName|null,
 *   title: string,
 *   items: { id: string, label: string, icon: any, group?: string, href?: string }[],
 *   active: string,
 * }>}
 */
export const panelNav = writable(EMPTY_NAV);

/**
 * Déclare (ou met à jour) les sections du panneau `owner`.
 *
 * La section active survit à un ré-enregistrement du MÊME panneau : la liste
 * est ré-enregistrée quand un plafond arrive du serveur ou que la langue
 * change, et repartir à la première section à chaque rafraîchissement ferait
 * sauter l'écran sous l'utilisateur.
 *
 * Elle survit aussi à une nav VIDE (owner `null`) : c'est le cas d'un
 * `openPanel('config', 'tags')` ou d'un deep-link `#my-tags`, où la section est
 * choisie AVANT que le panneau ne soit monté. La perdre là renverrait tout
 * raccourci vers la première section.
 *
 * En revanche un changement de panneau (config → admin) repart sur la section
 * par défaut du nouveau : ses identifiants n'ont rien à voir.
 */
export function registerPanelNav(owner, { title, items, active }) {
  panelNav.update((nav) => {
    const keep = nav.active && (nav.owner === owner || nav.owner === null) ? nav.active : active;
    return { owner, title, items, active: keep };
  });
}

/** Sélectionne une section du panneau ouvert (sidebar, deep-link). */
export function selectPanelSection(id) {
  panelNav.update((nav) => ({ ...nav, active: id }));
}

/**
 * Retire la nav de `owner` — et de lui seul. Au passage config → admin,
 * Svelte MONTE le nouveau panneau avant de démonter l'ancien (ordre des blocs
 * {#if} du layout) : un clear inconditionnel effacerait la nav que l'autre
 * vient d'enregistrer.
 */
export function clearPanelNav(owner) {
  panelNav.update((nav) => (nav.owner === owner ? EMPTY_NAV : nav));
}
