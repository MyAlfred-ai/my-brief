/**
 * Catalogue des entrées de « Réglages » — source UNIQUE de la colonne de
 * navigation que rend [SettingsPanel](../components/SettingsPanel.svelte)
 * (sidebar sur ordinateur, déroulant PanelTabs sur mobile).
 *
 * « Réglages » est l'espace du COMPTE, comme dans MIA : ce qui regarde la
 * personne connectée, jamais l'organisation (qui a l'Administration). La
 * colonne se lit dans l'ordre où l'on s'en sert :
 *   - « Mon compte » — ce qu'on règle sur SOI, les quatre pages qu'il porte
 *     dans MIA, sous les mêmes noms ;
 *   - « Mes réunions » — ce qui joue PENDANT la réunion, puis ce qu'elle
 *     devient APRÈS. Ces écrans étaient rangés sous « Mon compte », où sept
 *     entrées mêlaient l'identité et le déroulé d'une réunion ; l'IA y était à
 *     trois endroits, et « actions » y avait deux sens (ce que l'IA repère en
 *     réunion, ce que devient la réunion ensuite) ;
 *   - « Ma bibliothèque » — ce qu'on tient ;
 *   - « Outils », en pied de colonne — deux gestes qui ne règlent rien.
 *
 * Trois sortes d'entrées :
 *   - les SECTIONS, qui ouvrent un écran du panneau ;
 *   - les LIENS (`href`), qui quittent l'app dans un nouvel onglet. « Aide »
 *     en est un : il ouvre la documentation en ligne. L'aide intégrée qu'il
 *     ouvrait auparavant récitait une copie de cette liste et avait fini par
 *     décrire un menu disparu ; la documentation publique (docs/user/) est
 *     désormais le seul mode d'emploi, et une seconde copie divergerait encore ;
 *   - les GESTES (`action`), qui remontent leur identifiant : « Se
 *     déconnecter » ferme le menu, à la place qu'il a dans MIA.
 * Une section SANS groupe (« Outils ») se range en pied de colonne, sous le
 * filet, avec les liens et les gestes.
 *
 * Trois pages regroupent plusieurs écrans en ONGLETS : « Préférences IA »
 * (AI_TABS), « Pendant la réunion » (MEETING_TABS) et « Après la réunion »
 * (ACTION_TABS). Chaque écran garde sa page à lui et son bouton Enregistrer,
 * sans que la colonne ne compte une entrée par écran. Empiler deux écrans sur
 * une page a été essayé pour « Préférences IA » : deux « Enregistrer » se
 * retrouvaient à l'écran, dont un en pied de page qui semblait valoir pour
 * les deux.
 *
 * « Aide IA » est le seul écran présent DEUX fois : sous « Pendant la
 * réunion », où il joue, et sous « Préférences IA », où on le cherche. C'est
 * le même écran (settings/AiHelpSection), le même libellé, la même icône —
 * l'orbe à la sonnette, dans la teinte de l'Aide IA, comme en réunion.
 *
 * Les IDENTIFIANTS `ai`, `actions`, `mail` n'ont pas bougé quand leurs pages
 * ont changé de nom ou de place : le diagnostic du compte range ses constats
 * sous eux (services/api/lib/configChecks.js). Les écrans qui ont changé
 * d'adresse gardent l'ancienne (movedConfigTarget) : un raccourci écrit avant
 * le déménagement aboutit au bon endroit.
 *
 * AJOUTER UNE SECTION : une ligne ici, son icône dans SettingsPanel, son écran
 * dans SettingsPanel, son entrée au catalogue de recherche
 * (config/settingsSearch.js), et la page du sujet dans docs/user/.
 */
import { DOCS_URL } from './constants.js';

/**
 * @typedef {object} ConfigSection
 * @property {string} id            - identifiant de section (hash, `panelNav.active`)
 * @property {string} [group]       - clé d'intertitre dans `uiText.config` ; absente : pied de colonne
 * @property {(t: object) => string} label - libellé, résolu depuis uiText
 * @property {'connectable'|'feedback'|'session'} [requires] - condition d'affichage, cf. visibleConfigSections()
 * @property {string} [href]        - entrée LIEN : s'ouvre dans un nouvel onglet, jamais sélectionnée
 * @property {string} [action]      - entrée GESTE : identifiant remonté au clic, jamais sélectionnée
 * @property {boolean} [danger]     - geste qui met fin à quelque chose (rouge)
 */

/** @type {ConfigSection[]} — dans l'ordre de la colonne. */
export const CONFIG_SECTIONS = [
  // ── Mon compte : les pages de MIA, dans l'ordre de MIA ──
  // Qui je suis : identité, groupe, langue, mot de passe. C'était le menu
  // déroulant du nom ; c'est la page d'accueil des réglages.
  { id: 'profile', group: 'groupAccount', label: (t) => t.config.profileSection },
  // Ce que l'IA sait de moi (« Mon contexte ») et, pour un compte qui y a
  // droit, comment elle se tient à mes côtés (« Aide IA ») — AI_TABS.
  { id: 'ai', group: 'groupAccount', label: (t) => t.config.aiSection },
  // Le compte relié sert aux actions, mais c'est d'abord une affaire de
  // compte : il a sa page, avec le nom qu'elle porte dans MIA.
  {
    id: 'mail',
    group: 'groupAccount',
    label: (t) => t.config.mailSection,
    requires: 'connectable',
  },
  // « Mes statistiques », qui était un panneau à part : sa consommation est
  // une affaire de compte comme les autres.
  { id: 'usage', group: 'groupAccount', label: (t) => t.config.usageSection },

  // ── Mes réunions : pendant, puis après ──
  // Ce que myBrief entend, ce qu'il écrit, ce que l'IA repère et dit tant que
  // la réunion est en cours — MEETING_TABS.
  { id: 'meeting', group: 'groupMeetings', label: (t) => t.config.meetingSection },
  // Ce que deviennent mes réunions une fois terminées — un onglet par action
  // (ACTION_TABS). La page s'appelait « Actions », comme la « Détection
  // d'actions » qui n'a rien à voir ; son identifiant, lui, n'a pas bougé.
  { id: 'actions', group: 'groupMeetings', label: (t) => t.config.actionsSection },

  // ── Ma bibliothèque ──
  { id: 'templates', group: 'groupLibrary', label: (t) => t.buttons.myTemplates },
  { id: 'tags', group: 'groupLibrary', label: (t) => t.buttons.myTags },

  // ── Pied de colonne ──
  // « Importer un audio » et « Extension Chrome » ne règlent rien : un geste
  // et une installation. Ils partagent une page, hors des groupes de réglages.
  { id: 'tools', label: (t) => t.config.toolsSection },
  // Liens. Le formulaire de remontées vivait en bas de l'aide intégrée : sans
  // cette entrée, il n'aurait plus eu aucun accès. Son adresse est propre à
  // l'installation (FEEDBACK_URL côté API) : elle est posée par
  // visibleConfigSections().
  { id: 'help', label: (t) => t.buttons.help, href: DOCS_URL },
  { id: 'feedback', label: (t) => t.buttons.feedback, requires: 'feedback' },
  // La sortie ferme la colonne : c'est là qu'on la cherche une fois qu'il n'y
  // a plus de menu derrière le nom.
  {
    id: 'logout',
    label: (t) => t.buttons.logout,
    action: 'logout',
    danger: true,
    requires: 'session',
  },
];

/**
 * Les entrées réellement affichables sur cette installation.
 *
 * @param {{connectable?: boolean, feedbackUrl?: string, docsUrl?: string,
 *   signedIn?: boolean}} [ctx] -
 *   `connectable` : un fournisseur est proposé à la liaison (Google ou
 *   Microsoft). Sans lui, la page « Comptes connectés » n'aurait aucun bouton.
 *   `feedbackUrl` : formulaire de remontées de l'installation ; vide,
 *   « Déclarer un bug » est retiré. `docsUrl` : documentation de
 *   l'installation ; vide, celle de DOCS_URL. `signedIn` : une session nommée
 *   est ouverte ; sans elle, rien dont se déconnecter.
 * @returns {ConfigSection[]}
 */
export function visibleConfigSections({
  connectable = false,
  feedbackUrl = '',
  docsUrl = '',
  signedIn = false,
} = {}) {
  const hrefs = { help: docsUrl || DOCS_URL, feedback: feedbackUrl };
  return CONFIG_SECTIONS.filter((s) => {
    if (s.requires === 'connectable') return connectable;
    if (s.requires === 'feedback') return !!feedbackUrl;
    if (s.requires === 'session') return signedIn;
    return true;
  }).map((s) => (s.id in hrefs ? { ...s, href: hrefs[s.id] } : s));
}

/**
 * @typedef {object} ConfigTab
 * @property {string} id
 * @property {(t: object) => string} label
 * @property {'aiHelp'|'mybrain'} [requires] - l'onglet n'existe que pour qui y a droit
 * @property {string} [alertSection] - section sous laquelle le diagnostic du
 *   compte range ses constats (services/api/lib/configChecks.js)
 */

/** L'onglet « Aide IA », le même sous ses deux pages. */
const AI_HELP_TAB = {
  id: 'aiHelp',
  label: (t) => t.config.aiHelpSection,
  requires: /** @type {'aiHelp'} */ ('aiHelp'),
};

/**
 * Onglets de « Préférences IA » : ce que l'IA sait de moi, et comment elle se
 * tient à mes côtés. Sans droit à l'Aide IA, la page n'a qu'un écran — et pas
 * de rangée d'onglets.
 *
 * @type {ConfigTab[]}
 */
export const AI_TABS = [{ id: 'context', label: (t) => t.config.contextSection }, AI_HELP_TAB];

/**
 * Onglets de « Pendant la réunion », dans l'ordre où la réunion s'en sert : ce
 * qu'elle entend, ce qu'elle écrit, ce que l'IA y repère, ce que l'IA y dit.
 * Les « Mots remplacés » s'ajoutent à ceux de l'organisation (Administration →
 * Entreprise), sans les rouvrir.
 *
 * @type {ConfigTab[]}
 */
export const MEETING_TABS = [
  { id: 'audio', label: (t) => t.config.audioNav },
  { id: 'corrections', label: (t) => t.config.correctionsSection },
  { id: 'detection', label: (t) => t.config.detectionSection },
  AI_HELP_TAB,
];

/**
 * Onglets de « Après la réunion » : une action = un onglet. `alertSection`
 * donne la pastille de l'onglet, et, réunies, celle de l'entrée de la colonne.
 *
 * @type {ConfigTab[]}
 */
export const ACTION_TABS = [
  { id: 'mail', label: (t) => t.config.actionMailSection },
  {
    id: 'storage',
    label: (t) => t.config.actionStorageSection,
    alertSection: 'action-storage',
  },
  // Le cerveau partagé de l'équipe reçoit les réunions : seulement là où
  // l'administration a branché myBrain — ailleurs, l'onglet n'aurait rien à
  // régler.
  { id: 'mybrain', label: (t) => t.configMyBrain.sectionLabel, requires: 'mybrain' },
];

/** Les onglets d'une page que CE compte peut ouvrir. */
const allowed = (tabs, rights) => tabs.filter((tab) => !tab.requires || rights[tab.requires]);

/** @param {{aiHelp?: boolean}} [ctx] - `aiHelp` : le groupe du compte a droit à l'Aide IA. */
export function visibleAiTabs({ aiHelp = false } = {}) {
  return allowed(AI_TABS, { aiHelp });
}

/** @param {{aiHelp?: boolean}} [ctx] - `aiHelp` : le groupe du compte a droit à l'Aide IA. */
export function visibleMeetingTabs({ aiHelp = false } = {}) {
  return allowed(MEETING_TABS, { aiHelp });
}

/**
 * @param {{myBrain?: boolean}} [ctx] - `myBrain` : l'administration a branché
 *   myBrain et ne l'a pas fermé (cf. stores/myBrain.js).
 */
export function visibleActionTabs({ myBrain = false } = {}) {
  return allowed(ACTION_TABS, { mybrain: myBrain });
}

/**
 * Écrans qui ont changé d'adresse : « Audio » et « Aide IA » étaient des pages,
 * « Détection d'actions » et « Mots remplacés » des onglets de « Préférences
 * IA », « Importer un audio » et « Extension Chrome » deux pages. Clé :
 * `section`, ou `section/onglet`.
 */
const MOVED = {
  audio: ['meeting', 'audio'],
  aiHelp: ['meeting', 'aiHelp'],
  'ai/detection': ['meeting', 'detection'],
  'ai/corrections': ['meeting', 'corrections'],
  import: ['tools', ''],
  extension: ['tools', ''],
};

/**
 * La place d'aujourd'hui d'un écran désigné par son ancienne adresse — ou
 * `null` si l'adresse est toujours la bonne.
 *
 * @param {string} section
 * @param {string} [sub]
 * @returns {{section: string, sub: string}|null}
 */
export function movedConfigTarget(section, sub = '') {
  const to = MOVED[`${section}/${sub}`] || MOVED[section];
  return to ? { section: to[0], sub: to[1] } : null;
}
