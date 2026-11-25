/**
 * Catalogue de la recherche dans les réglages — ce qu'on peut y trouver, et
 * où ça mène. Le moteur (classement, accents, fautes de frappe) est dans
 * utils/settingsSearch.js ; le champ dans components/SettingsSearch.svelte.
 *
 * Deux sortes d'entrées :
 *   - les PAGES et leurs onglets, tirées des catalogues des deux colonnes
 *     (configSections.js, adminSections.js) : une page ajoutée là est
 *     trouvable sans rien écrire ici ;
 *   - les RÉGLAGES d'une page (SETTING_ENTRIES) : une carte, une tuile, une
 *     pastille. Leur titre est le libellé qu'affiche l'écran — c'est par lui
 *     que utils/revealSetting.js retrouve le réglage pour l'allumer.
 *
 * Les mots qu'on tape ne sont pas toujours ceux de l'écran (« micro » pour
 * « Réglages audio », « slogan » pour « Phrase d'accueil ») : chaque entrée
 * peut avoir ses synonymes dans `uiText.settingsSearch.keywords`, sous sa clé
 * (`config.audio`, `admin.branding.logo`…), en français ET en anglais.
 *
 * Un administrateur trouve aussi, depuis « Réglages », les réglages de
 * l'administration (et l'inverse) : on ne sait pas toujours si la langue ou
 * le modèle de compte rendu se règlent pour soi ou pour tous.
 *
 * AJOUTER UN RÉGLAGE : une ligne dans SETTING_ENTRIES, avec le libellé de son
 * titre à l'écran ; ses synonymes dans uiText.js, FR et EN.
 */
import { ADMIN_RUBRICS, ADMIN_SECTIONS } from './adminSections.js';
import {
  CONFIG_SECTIONS,
  visibleActionTabs,
  visibleAiTabs,
  visibleMeetingTabs,
} from './configSections.js';
import { normalizeSearchText } from '../utils/settingsSearch.js';

/**
 * @typedef {object} SettingEntry
 * @property {string} key          - `panneau.page[.onglet].réglage`, clé des synonymes
 * @property {'config'|'admin'} panel
 * @property {string} section      - identifiant de la page dans sa colonne
 * @property {string} [sub]        - onglet de la page (SubTabs)
 * @property {(t: object) => string} title - le titre du réglage À L'ÉCRAN
 * @property {(t: object) => string[]} [terms] - libellés de champs de la carte
 * @property {'password'|'systemAudio'|'browser'} [requires] - condition d'affichage de la carte
 */

/** @type {SettingEntry[]} — les réglages d'une page, dans l'ordre des pages. */
export const SETTING_ENTRIES = [
  // ── Réglages › Mon profil ──
  {
    key: 'config.profile.identity',
    panel: 'config',
    section: 'profile',
    title: (t) => t.profile.identityTitle,
    terms: (t) => [t.profile.nameLabel, t.profile.emailLabel, t.account.groupsLabel],
  },
  {
    key: 'config.profile.language',
    panel: 'config',
    section: 'profile',
    title: (t) => t.profile.languageTitle,
    terms: (t) => [t.app.languageNames.fr, t.app.languageNames.en],
  },
  {
    key: 'config.profile.password',
    panel: 'config',
    section: 'profile',
    requires: 'password',
    title: (t) => t.profile.securityTitle,
    terms: (t) => [t.account.changePasswordTitle],
  },
  // ── Réglages › Pendant la réunion › Détection d'actions ──
  {
    key: 'config.meeting.detection.state',
    panel: 'config',
    section: 'meeting',
    sub: 'detection',
    title: (t) => t.configActionDetection.stateTitle,
    terms: (t) => [t.configActionDetection.enabledLabel],
  },
  {
    key: 'config.meeting.detection.what',
    panel: 'config',
    section: 'meeting',
    sub: 'detection',
    title: (t) => t.configActionDetection.whatTitle,
    terms: (t) => [
      t.configActionDetection.sensitivityLabel,
      t.configActionDetection.triggerWordsLabel,
      t.configActionDetection.allowUpdatesLabel,
    ],
  },
  {
    key: 'config.meeting.detection.pace',
    panel: 'config',
    section: 'meeting',
    sub: 'detection',
    title: (t) => t.configActionDetection.paceTitle,
    terms: (t) => [t.configActionDetection.windowLabel, t.configActionDetection.intervalLabel],
  },
  {
    key: 'config.meeting.detection.test',
    panel: 'config',
    section: 'meeting',
    sub: 'detection',
    title: (t) => t.configActionDetection.testTitle,
    terms: (t) => [t.configActionDetection.sampleLabel, t.configActionDetection.testRun],
  },
  // ── Réglages › Pendant la réunion › Mots remplacés ──
  {
    key: 'config.meeting.corrections.learn',
    panel: 'config',
    section: 'meeting',
    sub: 'corrections',
    title: (t) => t.configCorrections.learnTitle,
    terms: (t) => [t.configCorrections.learnLabel],
  },
  {
    key: 'config.meeting.corrections.list',
    panel: 'config',
    section: 'meeting',
    sub: 'corrections',
    title: (t) => t.configCorrections.card.title,
    terms: (t) => [t.adminTranscriptCorrections.fromHeader, t.adminTranscriptCorrections.toHeader],
  },
  // ── Réglages › Pendant la réunion › Aide IA ──
  // L'écran est aussi un onglet de « Préférences IA » : ses cartes ne sont
  // listées qu'une fois, là où l'Aide IA joue.
  {
    key: 'config.meeting.aiHelp.start',
    panel: 'config',
    section: 'meeting',
    sub: 'aiHelp',
    title: (t) => t.aiHelp.prefs.startTitle,
    terms: (t) => [t.aiHelp.prefs.startSwitch],
  },
  {
    key: 'config.meeting.aiHelp.sounds',
    panel: 'config',
    section: 'meeting',
    sub: 'aiHelp',
    title: (t) => t.aiHelp.prefs.soundsTitle,
    terms: (t) => Object.values(t.aiHelp.prefs.sounds).map((sound) => sound.label),
  },
  {
    key: 'config.meeting.aiHelp.voice',
    panel: 'config',
    section: 'meeting',
    sub: 'aiHelp',
    title: (t) => t.aiHelp.prefs.voiceTitle,
    terms: (t) => [
      t.aiHelp.prefs.voiceSwitch,
      t.aiHelp.prefs.engineLabel,
      ...Object.values(t.aiHelp.prefs.engines).map((engine) => engine.label),
    ],
  },
  // ── Réglages › Pendant la réunion › Micro et son ──
  {
    key: 'config.meeting.audio.mic',
    panel: 'config',
    section: 'meeting',
    sub: 'audio',
    title: (t) => t.config.audioSection,
    terms: (t) => [t.config.audioDeviceLabel, t.config.audioLabel],
  },
  {
    key: 'config.meeting.audio.system',
    panel: 'config',
    section: 'meeting',
    sub: 'audio',
    requires: 'systemAudio',
    title: (t) => t.config.systemAudioSection,
    terms: (t) => [
      t.config.systemAudioLabel,
      t.config.systemAudioDeviceLabel,
      t.config.systemAudioTest,
    ],
  },
  // ── Réglages › Après la réunion ──
  {
    key: 'config.actions.mail.send',
    panel: 'config',
    section: 'actions',
    sub: 'mail',
    title: (t) => t.configActions.mailCardTitle,
    terms: (t) => [t.configActions.recipientsTitle, t.configActions.subjectLabel],
  },
  {
    key: 'config.actions.mail.tagRecipients',
    panel: 'config',
    section: 'actions',
    sub: 'mail',
    title: (t) => t.configActions.tagRecipientsTitle,
  },
  {
    key: 'config.actions.mail.filename',
    panel: 'config',
    section: 'actions',
    sub: 'mail',
    title: (t) => t.configActions.filenameCardTitle,
    terms: (t) => [t.configActions.filenameLabel],
  },
  {
    key: 'config.actions.mail.afterSummary',
    panel: 'config',
    section: 'actions',
    sub: 'mail',
    title: (t) => t.configActions.afterSummaryTitle,
    terms: (t) => [t.configActions.afterSummaryToggle],
  },
  {
    key: 'config.actions.storage.folder',
    panel: 'config',
    section: 'actions',
    sub: 'storage',
    title: (t) => t.configActions.storageCardTitle,
    terms: (t) => [
      t.configActions.folderTitle,
      t.configActions.approvalLabel,
      t.configActions.tagSubfoldersLabel,
    ],
  },
  {
    key: 'config.actions.storage.tagFolders',
    panel: 'config',
    section: 'actions',
    sub: 'storage',
    title: (t) => t.configActions.tagFoldersTitle,
  },
  {
    key: 'config.actions.mybrain.send',
    panel: 'config',
    section: 'actions',
    sub: 'mybrain',
    title: (t) => t.configMyBrain.toggleTitle,
    terms: (t) => [t.configMyBrain.contentTitle],
  },
  {
    key: 'config.actions.mybrain.recent',
    panel: 'config',
    section: 'actions',
    sub: 'mybrain',
    title: (t) => t.configMyBrain.recentTitle,
  },
  // ── Réglages › Outils ──
  {
    key: 'config.tools.import',
    panel: 'config',
    section: 'tools',
    title: (t) => t.config.importSection,
    terms: (t) => [t.config.importCta],
  },
  {
    key: 'config.tools.extension',
    panel: 'config',
    section: 'tools',
    requires: 'browser',
    title: (t) => t.config.extensionSection,
  },

  // ── Administration › Tableau de bord ──
  {
    key: 'admin.dashboard.issues',
    panel: 'admin',
    section: 'dashboard',
    title: (t) => t.adminDashboard.issuesTitle,
  },
  {
    key: 'admin.dashboard.activity',
    panel: 'admin',
    section: 'dashboard',
    title: (t) => t.adminDashboard.activityTitle,
  },
  // ── Administration › Modèles IA › Clés API : une pastille par fournisseur ──
  {
    key: 'admin.ai.providers',
    panel: 'admin',
    section: 'ai',
    title: (t) => t.adminAi.providersTitle,
  },
  ...['openai', 'mistral', 'speechmatics', 'assemblyai'].map((provider) => ({
    key: `admin.ai.${provider}`,
    panel: /** @type {'admin'} */ ('admin'),
    section: 'ai',
    title: (t) => t.adminAi.providers[provider],
    terms: (t) => [
      provider === 'openai'
        ? t.adminAi.keyTitle
        : t.adminAi.providerKeyLabel.replace('{provider}', t.adminAi.providers[provider]),
    ],
  })),
  // ── Administration › Modèles IA › Modèles : une tuile par usage ──
  {
    key: 'admin.ai-models.summary',
    panel: 'admin',
    section: 'ai-models',
    title: (t) => t.adminAi.tileSummary,
    terms: (t) => [t.adminAi.summaryTitle, t.adminAi.summaryLabel],
  },
  {
    key: 'admin.ai-models.transcription',
    panel: 'admin',
    section: 'ai-models',
    title: (t) => t.adminAi.tileTranscription,
    terms: (t) => [t.adminAi.modelTitle, t.adminAi.modelLabel],
  },
  {
    key: 'admin.ai-models.infographic',
    panel: 'admin',
    section: 'ai-models',
    title: (t) => t.adminAi.tileInfographic,
    terms: (t) => [
      t.adminAi.infographicTitle,
      t.adminAi.infographicToggleLabel,
      t.adminAi.infographicTileSub,
    ],
  },
  // ── Administration › Capacités › Actions ──
  {
    key: 'admin.actions.preview',
    panel: 'admin',
    section: 'actions',
    title: (t) => t.adminActions.previewTitle,
  },
  {
    key: 'admin.actions.email',
    panel: 'admin',
    section: 'actions',
    title: (t) => t.adminActions.actionEmail,
    terms: (t) => [
      t.adminActions.maxRecipientsLabel,
      t.adminActions.allowSmtpExternalLabel,
      t.adminActions.subjectTemplateLabel,
      t.adminActions.tagRecipientsRuleTitle,
    ],
  },
  {
    key: 'admin.actions.storage',
    panel: 'admin',
    section: 'actions',
    title: (t) => t.adminActions.actionStorage,
    terms: (t) => [t.adminActions.folderLabel],
  },
  {
    key: 'admin.actions.download',
    panel: 'admin',
    section: 'actions',
    title: (t) => t.adminActions.actionDownload,
  },
  {
    key: 'admin.actions.account',
    panel: 'admin',
    section: 'actions',
    title: (t) => t.adminActions.providerCardTitle,
    terms: (t) => [
      t.adminActions.providerLabel,
      t.adminActions.providerGdrive,
      t.adminActions.providerSharepoint,
      t.adminActions.sharePointScopeLabel,
    ],
  },
  {
    key: 'admin.actions.naming',
    panel: 'admin',
    section: 'actions',
    title: (t) => t.adminActions.tileNaming,
    terms: (t) => [t.adminActions.filenameCardTitle, t.adminActions.filenameTemplateLabel],
  },
  // ── Administration › Capacités › Aide IA ──
  {
    key: 'admin.aihelp.access',
    panel: 'admin',
    section: 'aihelp',
    title: (t) => t.adminAiHelp.accessTitle,
  },
  {
    key: 'admin.aihelp.domains',
    panel: 'admin',
    section: 'aihelp',
    title: (t) => t.adminAiHelp.domainsTitle,
  },
  {
    key: 'admin.aihelp.wake',
    panel: 'admin',
    section: 'aihelp',
    title: (t) => t.adminAiHelp.wakeTitle,
  },
  {
    key: 'admin.aihelp.pace',
    panel: 'admin',
    section: 'aihelp',
    title: (t) => t.adminAiHelp.paceTitle,
  },
  {
    key: 'admin.aihelp.brain',
    panel: 'admin',
    section: 'aihelp',
    title: (t) => t.adminAiHelp.brainTitle,
  },
  {
    key: 'admin.aihelp.test',
    panel: 'admin',
    section: 'aihelp',
    title: (t) => t.adminAiHelp.testTitle,
  },
  // ── Administration › Capacités › MyBrain ──
  {
    key: 'admin.mybrain.connection',
    panel: 'admin',
    section: 'mybrain',
    title: (t) => t.adminMyBrain.connectionTitle,
    terms: (t) => [t.adminMyBrain.urlLabel, t.adminMyBrain.keyLabel],
  },
  {
    key: 'admin.mybrain.policy',
    panel: 'admin',
    section: 'mybrain',
    title: (t) => t.adminMyBrain.policyTitle,
  },
  {
    key: 'admin.mybrain.content',
    panel: 'admin',
    section: 'mybrain',
    title: (t) => t.adminMyBrain.contentTitle,
  },
  // ── Administration › Organisation › Entreprise ──
  {
    key: 'admin.company.context',
    panel: 'admin',
    section: 'company',
    title: (t) => t.adminBranding.tileContext,
    terms: (t) => [t.adminOrgContext.title, t.adminOrgContext.label],
  },
  {
    key: 'admin.company.corrections',
    panel: 'admin',
    section: 'company',
    title: (t) => t.adminBranding.tileCorrections,
    terms: (t) => [t.adminTranscriptCorrections.title],
  },
  // ── Administration › Organisation › Marque & apparence ──
  {
    key: 'admin.branding.logo',
    panel: 'admin',
    section: 'branding',
    title: (t) => t.adminBranding.tileLogo,
  },
  {
    key: 'admin.branding.tagline',
    panel: 'admin',
    section: 'branding',
    title: (t) => t.adminBranding.tileTagline,
  },
  {
    key: 'admin.branding.colors',
    panel: 'admin',
    section: 'branding',
    title: (t) => t.adminBranding.tileColors,
    terms: (t) => [
      t.adminBranding.colorTitle,
      t.adminBranding.colorLabel,
      t.adminBranding.colorSecondaryLabel,
    ],
  },
  // ── Administration › Organisation › Authentification ──
  {
    key: 'admin.auth.modes',
    panel: 'admin',
    section: 'auth',
    title: (t) => t.adminAuth.loginModesTitle,
    terms: (t) => [t.adminAuth.modeOffer],
  },
  {
    key: 'admin.auth.password',
    panel: 'admin',
    section: 'auth',
    title: (t) => t.adminAuth.modeNames.password,
  },
  {
    key: 'admin.auth.google',
    panel: 'admin',
    section: 'auth',
    title: (t) => t.adminAuth.modeNames.google,
    terms: (t) => [
      t.adminAuth.googleTitle,
      t.adminAuth.clientId,
      t.adminAuth.clientSecret,
      t.adminAuth.redirectUri,
    ],
  },
  {
    key: 'admin.auth.entra',
    panel: 'admin',
    section: 'auth',
    title: (t) => t.adminAuth.modeNames.entra,
    terms: (t) => [
      t.adminAuth.entraTitle,
      t.adminAuth.entraDiscovery,
      t.adminAuth.clientId,
      t.adminAuth.clientSecret,
    ],
  },
  {
    key: 'admin.auth.domains',
    panel: 'admin',
    section: 'auth',
    title: (t) => t.adminAuth.domainsTitle,
  },
];

/**
 * @typedef {object} SearchResultEntry
 * @property {string} key
 * @property {'config'|'admin'} panel
 * @property {string} section
 * @property {string} sub          - '' : la page s'ouvre sur son premier onglet
 * @property {string} title
 * @property {string[]} path       - où c'est : intertitre ou rubrique, page, onglet
 * @property {string[]} keywords
 * @property {string[]} terms
 * @property {string} [href]       - entrée LIEN (« Aide ») : s'ouvre dans un nouvel onglet
 * @property {string} reveal       - texte à retrouver sur l'écran ; '' pour une page
 */

/**
 * @typedef {object} SearchContext
 * @property {{id: string, href?: string, action?: string}[]} configSections -
 *   les entrées de « Réglages » affichées (colonne enregistrée, ou
 *   visibleConfigSections() quand on cherche depuis l'administration)
 * @property {boolean} [admin]       - les pages de l'administration sont ouvertes à ce compte
 * @property {boolean} [myBrain]     - l'onglet « MyBrain » de « Après la réunion » existe
 * @property {boolean} [aiHelp]      - le groupe du compte a droit à l'Aide IA (son onglet existe)
 * @property {boolean} [browser]     - navigateur d'ordinateur : le bloc « Extension Chrome » existe
 * @property {boolean} [password]    - le compte se connecte par mot de passe
 * @property {boolean} [systemAudio] - la carte « Son de l'ordinateur » existe (Firefox, Safari)
 */

/**
 * Toutes les entrées trouvables par CE compte, sur CET appareil, dans la
 * langue `t` — rien qui mène à une page ou à une carte absente : la page
 * retomberait sur sa page d'accueil, la carte ne s'allumerait pas.
 *
 * @param {object} t - textes de la langue courante (uiText)
 * @param {SearchContext} ctx
 * @returns {SearchResultEntry[]}
 */
export function buildSettingsIndex(t, ctx) {
  const keywordsOf = (key) =>
    (t.settingsSearch?.keywords?.[key] || '')
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean);
  const entry = (props) => ({
    sub: '',
    path: [],
    terms: [],
    reveal: '',
    ...props,
    keywords: keywordsOf(props.key),
  });

  const out = [];
  const visibleConfig = new Map((ctx.configSections || []).map((s) => [s.id, s]));
  const configById = new Map(CONFIG_SECTIONS.map((s) => [s.id, s]));
  const configPath = (id) => {
    const group = configById.get(id)?.group;
    return group ? [t.config[group]] : [];
  };
  const configLabel = (id) => configById.get(id).label(t);

  // ── Réglages : pages, liens, onglets ──
  for (const [id, shown] of visibleConfig) {
    const section = configById.get(id);
    // Un GESTE (« Se déconnecter ») n'est pas un réglage qu'on cherche.
    if (!section || shown.action) continue;
    out.push(
      entry({
        key: `config.${id}`,
        panel: 'config',
        section: id,
        title: section.label(t),
        path: configPath(id),
        ...(shown.href ? { href: shown.href } : {}),
      }),
    );
  }
  const tabsOf = {
    ai: visibleAiTabs({ aiHelp: ctx.aiHelp }),
    meeting: visibleMeetingTabs({ aiHelp: ctx.aiHelp }),
    actions: visibleActionTabs({ myBrain: ctx.myBrain }),
  };
  for (const [section, tabs] of Object.entries(tabsOf)) {
    if (!visibleConfig.has(section)) continue;
    for (const tab of tabs) {
      out.push(
        entry({
          key: `config.${section}.${tab.id}`,
          panel: 'config',
          section,
          sub: tab.id,
          title: tab.label(t),
          path: [...configPath(section), configLabel(section)],
        }),
      );
    }
  }

  // ── Administration : pages ──
  const adminById = new Map(ADMIN_SECTIONS.map((s) => [s.id, s]));
  const adminPath = (id) => {
    const rubric = adminById.get(id)?.rubric;
    return rubric ? [ADMIN_RUBRICS[rubric].label(t)] : [];
  };
  if (ctx.admin) {
    for (const section of ADMIN_SECTIONS) {
      out.push(
        entry({
          key: `admin.${section.id}`,
          panel: 'admin',
          section: section.id,
          title: section.label(t),
          path: adminPath(section.id),
        }),
      );
    }
  }

  // ── Les réglages d'une page ──
  for (const setting of SETTING_ENTRIES) {
    if (setting.panel === 'admin' && !ctx.admin) continue;
    if (setting.panel === 'config') {
      if (!visibleConfig.has(setting.section)) continue;
      if (setting.sub && !tabsOf[setting.section]?.some((tab) => tab.id === setting.sub)) continue;
      if (setting.requires && !ctx[setting.requires]) continue;
    }
    const title = setting.title(t);
    const page =
      setting.panel === 'config'
        ? [...configPath(setting.section), configLabel(setting.section)]
        : [...adminPath(setting.section), adminById.get(setting.section).label(t)];
    const tab = setting.sub ? tabsOf[setting.section]?.find((s) => s.id === setting.sub) : null;
    out.push(
      entry({
        key: setting.key,
        panel: setting.panel,
        section: setting.section,
        sub: setting.sub || '',
        title,
        path: tab ? [...page, tab.label(t)] : page,
        terms: (setting.terms?.(t) || []).filter(Boolean),
        reveal: title,
      }),
    );
  }

  // Une carte qui porte le nom de sa page ou de son onglet (« Entreposer »)
  // ne fait pas une seconde ligne au même titre : la page la reprend — ses
  // mots, et le titre à allumer.
  const merged = [];
  const byPlace = new Map();
  for (const item of out) {
    const place = [item.panel, item.section, item.sub, normalizeSearchText(item.title)].join('|');
    const first = byPlace.get(place);
    if (!first) {
      byPlace.set(place, item);
      merged.push(item);
      continue;
    }
    first.terms = [...first.terms, ...item.terms];
    first.keywords = [...first.keywords, ...item.keywords];
    first.reveal = first.reveal || item.reveal;
  }
  return merged;
}
