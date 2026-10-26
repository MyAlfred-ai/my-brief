/**
 * Catalogue des entrées de « Ma configuration » — source UNIQUE de la colonne
 * de navigation que rend [SettingsPanel](../components/SettingsPanel.svelte)
 * (sidebar sur ordinateur, déroulant PanelTabs sur mobile).
 *
 * Deux sortes d'entrées :
 *   - les SECTIONS, qui ouvrent un écran du panneau ;
 *   - les LIENS (`href`), qui quittent l'app dans un nouvel onglet. « Aide »
 *     en est un : il ouvre la documentation en ligne. L'aide intégrée qu'il
 *     ouvrait auparavant récitait une copie de cette liste et avait fini par
 *     décrire un menu disparu ; la documentation publique (docs/user/) est
 *     désormais le seul mode d'emploi, et une seconde copie divergerait encore.
 *     Les liens restent ici pour garder leur place dans la colonne.
 *
 * AJOUTER UNE SECTION : une ligne ici, son icône dans SettingsPanel, son écran
 * dans SettingsPanel, et la page du sujet dans docs/user/.
 */
import { DOCS_URL } from './constants.js';

/**
 * @typedef {object} ConfigSection
 * @property {string} id            - identifiant de section (hash, `panelNav.active`)
 * @property {string} group         - clé d'intertitre dans `uiText.config`
 * @property {(t: object) => string} label - libellé, résolu depuis uiText
 * @property {'connectable'|'browser'|'mybrain'|'feedback'} [requires] - condition d'affichage, cf. visibleConfigSections()
 * @property {string} [href]        - entrée LIEN : s'ouvre dans un nouvel onglet, jamais sélectionnée
 */

/** @type {ConfigSection[]} — dans l'ordre de la colonne. */
export const CONFIG_SECTIONS = [
  { id: 'audio', group: 'groupSettings', label: (t) => t.config.audioSection },
  { id: 'context', group: 'groupSettings', label: (t) => t.config.contextSection },
  // Ce que l'assistant repère PENDANT la réunion — un réglage de la réunion
  // elle-même, à sa place à côté du micro et du contexte, et non parmi les
  // actions, qui ne concernent que ce qu'on fait du compte rendu ensuite.
  { id: 'detection', group: 'groupSettings', label: (t) => t.config.detectionSection },
  // Une action = une page : « Envoi d'email » et « Entreposer » se réglaient
  // sur un même écran, l'un sous l'autre.
  { id: 'action-mail', group: 'groupActions', label: (t) => t.config.actionMailSection },
  { id: 'action-storage', group: 'groupActions', label: (t) => t.config.actionStorageSection },
  // Le compte relié sert aux DEUX actions : sa page est rangée avec elles.
  {
    id: 'mail',
    group: 'groupActions',
    label: (t) => t.config.mailSection,
    requires: 'connectable',
  },
  // Ce que deviennent les réunions une fois terminées, comme les actions : le
  // cerveau partagé de l'équipe les reçoit. Seulement là où l'administration a
  // branché myBrain — ailleurs, la page n'aurait rien à régler.
  {
    id: 'mybrain',
    group: 'groupActions',
    label: (t) => t.configMyBrain.sectionLabel,
    requires: 'mybrain',
  },
  { id: 'templates', group: 'groupLibrary', label: (t) => t.buttons.myTemplates },
  { id: 'tags', group: 'groupLibrary', label: (t) => t.buttons.myTags },
  { id: 'import', group: 'groupTools', label: (t) => t.config.importSection },
  // L'extension Chrome se lie à l'onglet ouvert : la page n'a de sens que dans
  // un navigateur d'ordinateur, jamais dans l'app mobile.
  {
    id: 'extension',
    group: 'groupTools',
    label: (t) => t.config.extensionSection,
    requires: 'browser',
  },
  // Liens, en fin de colonne. Le formulaire de remontées vivait en bas de
  // l'aide intégrée : sans cette entrée, il n'aurait plus eu aucun accès. Son
  // adresse est propre à l'installation (FEEDBACK_URL côté API) : elle est
  // posée par visibleConfigSections().
  { id: 'help', group: 'groupTools', label: (t) => t.buttons.help, href: DOCS_URL },
  { id: 'feedback', group: 'groupTools', label: (t) => t.buttons.feedback, requires: 'feedback' },
];

/**
 * Les entrées réellement affichables sur cette installation.
 *
 * @param {{connectable?: boolean, native?: boolean, myBrain?: boolean}} [ctx] -
 *   `connectable` : un fournisseur est proposé à la liaison (Google ou
 *   Microsoft). Sans lui, la page « Connexion » n'aurait aucun bouton. `native` :
 *   app Capacitor, où les sections réservées au navigateur (`requires:
 *   'browser'`) sont retirées. `myBrain` : l'administration a branché myBrain et
 *   ne l'a pas fermé (cf. stores/myBrain.js). `feedbackUrl` : formulaire de
 *   remontées de l'installation ; vide, « Déclarer un bug » est retiré.
 *   `docsUrl` : documentation de l'installation ; vide, celle de DOCS_URL.
 * @returns {ConfigSection[]}
 */
export function visibleConfigSections({
  connectable = false,
  native = false,
  myBrain = false,
  feedbackUrl = '',
  docsUrl = '',
} = {}) {
  const hrefs = { help: docsUrl || DOCS_URL, feedback: feedbackUrl };
  return CONFIG_SECTIONS.filter((s) => {
    if (s.requires === 'connectable') return connectable;
    if (s.requires === 'browser') return !native;
    if (s.requires === 'mybrain') return myBrain;
    if (s.requires === 'feedback') return !!feedbackUrl;
    return true;
  }).map((s) => (s.id in hrefs ? { ...s, href: hrefs[s.id] } : s));
}
