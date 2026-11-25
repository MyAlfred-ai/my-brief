/**
 * Catalogue des pages de l'Administration — source UNIQUE de la colonne que
 * rend [AdminPanel](../components/AdminPanel.svelte) (sidebar sur ordinateur,
 * déroulant PanelTabs sur mobile), et des pages que la recherche des réglages
 * sait ouvrir (config/settingsSearch.js).
 *
 * Il vivait dans AdminPanel, icônes comprises. La recherche en a besoin hors
 * du panneau : depuis « Réglages », un administrateur qui tape « logo » doit
 * trouver « Marque & apparence » sans savoir que c'est une affaire
 * d'organisation. Comme pour configSections.js, ne restent dans le panneau que
 * les icônes — des composants Svelte, qui n'ont rien à faire ici.
 *
 * Un TABLEAU DE BORD pour accueil, puis cinq RUBRIQUES repliables, celles de
 * MIA : Personnes, Modèles IA, Capacités, Coûts, Organisation. Les
 * identifiants des pages sont ceux sous lesquels le diagnostic du serveur
 * (lib/configChecks.js) range ses constats : `ai` est « Clés API », `branding`
 * « Marque & apparence », `company` « Entreprise ».
 *
 * AJOUTER UNE PAGE : une ligne ici, son icône et son écran dans AdminPanel, ses
 * réglages dans config/settingsSearch.js, et la page du sujet dans
 * docs/user/admin/.
 */

/**
 * Rubriques, dans l'ordre de la colonne — clé stable (le pli se mémorise
 * dessus, la langue change le libellé).
 *
 * @type {Record<string, {label: (t: object) => string}>}
 */
export const ADMIN_RUBRICS = {
  people: { label: (t) => t.adminPanel.groupPeople },
  models: { label: (t) => t.adminPanel.groupModels },
  capabilities: { label: (t) => t.adminPanel.groupCapabilities },
  costs: { label: (t) => t.adminPanel.groupCosts },
  organization: { label: (t) => t.adminPanel.groupOrganization },
};

/**
 * @typedef {object} AdminSection
 * @property {string} id       - identifiant de page (`panelNav.active`, constats du diagnostic)
 * @property {string} [rubric] - clé de ADMIN_RUBRICS ; absente : le tableau de bord, en tête
 * @property {(t: object) => string} label
 */

/** @type {AdminSection[]} — dans l'ordre de la colonne. */
export const ADMIN_SECTIONS = [
  // Hors rubrique, en tête : l'accueil de l'administration.
  { id: 'dashboard', label: (t) => t.adminDashboard.tabLabel },
  // Personnes — les comptes, puis les groupes : ce sont des ensembles de
  // comptes, et la fiche d'un compte y renvoie.
  { id: 'users', rubric: 'people', label: (t) => t.adminUsers.tabLabel },
  { id: 'groups', rubric: 'people', label: (t) => t.adminGroups.tabLabel },
  // Modèles IA — les clés des fournisseurs, puis les modèles qui
  // transcrivent, rédigent et dessinent (AiTab, deux vues).
  { id: 'ai', rubric: 'models', label: (t) => t.adminAi.tabLabel },
  { id: 'ai-models', rubric: 'models', label: (t) => t.adminAi.modelsTabLabel },
  // Capacités — ce que l'installation propose autour d'une réunion. L'Aide IA
  // d'une réunion, puis le cerveau partagé qu'elle peut consulter.
  { id: 'templates', rubric: 'capabilities', label: (t) => t.adminTemplates.tabLabel },
  { id: 'actions', rubric: 'capabilities', label: (t) => t.adminActions.tabLabel },
  { id: 'aihelp', rubric: 'capabilities', label: (t) => t.adminAiHelp.tabLabel },
  { id: 'mybrain', rubric: 'capabilities', label: (t) => t.adminMyBrain.tabLabel },
  // Coûts — le crédit de temps de chacun (fixé par les groupes), puis ce que
  // l'installation consomme et dépense.
  { id: 'credits', rubric: 'costs', label: (t) => t.myStats.creditsTabLabel },
  { id: 'stats', rubric: 'costs', label: (t) => t.adminStats.tabLabel },
  // Organisation — les mots de l'organisation, son apparence (BrandingTab,
  // deux vues), puis la façon dont on s'y connecte.
  { id: 'company', rubric: 'organization', label: (t) => t.adminBranding.companyTabLabel },
  { id: 'branding', rubric: 'organization', label: (t) => t.adminBranding.tabLabel },
  { id: 'auth', rubric: 'organization', label: (t) => t.adminAuth.tabLabel },
];
