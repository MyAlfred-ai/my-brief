/**
 * Réglages modifiables depuis le panneau d'administration (collection
 * `appSettings`). Un document par domaine fonctionnel :
 *   - `key: 'auth'`    : fournisseurs d'identité et domaines autorisés ;
 *   - `key: 'ai'`      : clé OpenAI ;
 *   - `key: 'actions'` : actions proposées après chaque réunion et chaque résumé ;
 *   - `key: 'transcriptCorrections'` : corrections automatiques de la transcription.
 *
 * Ils vivent en base — et non dans l'environnement — pour qu'un administrateur
 * puisse brancher un fournisseur, ouvrir un domaine ou remplacer une clé sans
 * redéploiement. Aucun secret ne sort JAMAIS de l'API : les projections
 * publiques exposent seulement `hasSecret` / `hasKey`, et une mise à jour qui
 * ne contient pas le secret conserve l'ancienne valeur (on peut donc corriger
 * le clientId sans ressaisir le secret).
 *
 * Deux fournisseurs d'identité, même forme (cf. lib/auth/providers.js) :
 *   - `google` : identifiants créés dans Google Cloud Console ;
 *   - `entra`  : identifiants de l'app registration on-prem, repris tels quels
 *     de l'environnement du plugin Traefik. `discoveryUrl` en plus, l'annuaire
 *     dépendant du tenant.
 */
import { sanitizeDomainList } from '../auth/domains.js';
import { bool } from '../config.js';
import { DEFAULT_MAX_RECIPIENTS, MAX_RECIPIENTS_CEILING } from '../actions/recipients.js';
import { TEMPLATE_MAX } from '../actions/templating.js';
import {
  TRANSCRIPTION_MODELS,
  TRANSCRIPTION_RETIREMENT_DATE,
  describeTranscriptionModel,
  isTranscriptionModel,
  resolveTranscriptionModel,
} from '../transcriptionModels.js';
import { SUMMARY_MODELS, isSummaryModel, resolveSummaryModel } from '../summaryModels.js';
import {
  INFOGRAPHIC_IMAGE_MODELS,
  isInfographicImageModel,
  resolveInfographicImageModel,
} from '../infographicModels.js';
// Le plafond du style d'infographie vit avec le prompt qui le consomme (même
// parti pris que TEMPLATE_MAX) : ce dépôt ne fait que le faire respecter.
import { INFOGRAPHIC_STYLE_MAX } from '../prompts.js';
import { sanitizeTranscriptCorrections } from '../transcriptCorrections.js';

export const SETTINGS_COLLECTION = 'appSettings';
const AUTH_KEY = 'auth';
const AI_KEY = 'ai';
const ACTIONS_KEY = 'actions';
const BRANDING_KEY = 'branding';
const ORG_CONTEXT_KEY = 'orgContext';
const TRANSCRIPT_CORRECTIONS_KEY = 'transcriptCorrections';

const DEFAULTS = {
  key: AUTH_KEY,
  google: { enabled: false, clientId: '', clientSecret: '' },
  entra: { enabled: false, clientId: '', clientSecret: '', discoveryUrl: '' },
  /**
   * Modes de connexion sans fournisseur natif : le formulaire email/mot de
   * passe et le bouton du SSO historique (plugin Traefik). Activés par défaut
   * — c'est le comportement d'avant ce réglage, un document existant qui ne
   * porte pas ces champs ne change donc rien en déployant cette version.
   *
   * Le réglage s'ajoute au drapeau d'environnement, il ne le remplace pas :
   * un mode n'est servi que si l'environnement le déclare ET que ce réglage
   * l'affiche (cf. routes/auth/session.js). L'environnement reste le
   * coupe-circuit du déploiement.
   */
  passwordLogin: { enabled: true },
  legacySso: { enabled: true },
  allowedDomains: [],
};

const DEFAULTS_AI = {
  key: AI_KEY,
  apiKey: '',
  // '' = « aucun choix » : le service retombe sur l'environnement puis sur le
  // défaut intégré. Une installation existante ne change donc pas de modèle en
  // déployant cette version.
  transcriptionModel: '',
  // Idem pour le modèle qui RÉDIGE le compte rendu : '' = aucun choix, le
  // service retombe sur OPENAI_MODEL_SUMMARY puis sur DEFAULT_SUMMARY_MODEL.
  summaryModel: '',
  /**
   * Infographie de compte rendu (case « Générer une infographie » du panneau
   * de génération). Activée par défaut — la case reste DÉCOCHÉE à chaque
   * génération, donc aucune image (et aucun coût) tant que personne ne la
   * coche : proposer ne dépense rien. Les lectures testent `!== false` : un
   * document d'avant ce réglage vaut « activée ».
   */
  infographicEnabled: true,
  /**
   * Modèle qui DESSINE l'infographie. '' = aucun choix, le service retombe sur
   * OPENAI_MODEL_INFOGRAPHIC_IMAGE puis sur DEFAULT_INFOGRAPHIC_IMAGE_MODEL —
   * une installation existante passe donc au nouveau défaut en déployant cette
   * version, sans réglage à reprendre. C'est voulu : le palier 2.5 est annoncé
   * meilleur ET plus rapide que celui qu'il remplace, et le retour en arrière
   * tient en un menu déroulant.
   */
  infographicImageModel: '',
  /**
   * Style graphique imposé aux infographies de cette installation —
   * FACULTATIF, vide par défaut. Un texte libre (« violet, orange et rose ;
   * schémas clairs et professionnels ; nom de la société en haut à gauche »)
   * joint à la demande envoyée au réécrivain de prompt, où il PRIME sur les
   * choix esthétiques du modèle (cf. lib/prompts.js).
   *
   * Vide, le modèle choisit sa palette et sa maquette comme avant : c'était
   * l'arbitrage de 2026-09-01, et imposer NOTRE habillage par défaut avait été
   * explicitement rejeté. Ce champ inverse la décision uniquement quand
   * l'organisation, elle, a une charte à faire respecter.
   */
  infographicStyle: '',
  updatedAt: null,
  updatedBy: null,
};

/**
 * Apparence de l'installation, réglable depuis l'administration : logo,
 * phrase d'accueil de la barre latérale, couleur primaire et couleur
 * secondaire (l'orange clair des dégradés et accents d'appoint). Champ vide =
 * valeur intégrée de l'application (logo importé, « Assistant au quotidien »,
 * orange #f38400, orange clair #ffaf00) — c'est ce qui permet de « revenir au
 * défaut » sans connaître ces valeurs côté serveur.
 *
 * Le logo est une data-URL image stockée en base : pas de fichier à servir ni
 * de volume à monter, et la sonde publique /api/auth/config le transporte
 * comme n'importe quel autre réglage. Le plafond borne le poids de cette
 * sonde, appelée à chaque démarrage de l'application.
 *
 * La phrase d'accueil a DEUX champs : `tagline` (français) et `taglineEn`,
 * affichée quand l'interface est en anglais. Une phrase de marque ne se
 * traduit pas automatiquement : sans `taglineEn`, l'interface anglaise
 * reprend `tagline` telle quelle (src/stores/branding.js).
 */
export const BRANDING_LOGO_MAX = 800_000; // data-URL ≈ image de 600 Ko
export const BRANDING_TAGLINE_MAX = 120;
export const BRANDING_LOGO_PATTERN = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/;
/** Le seul format accepté : celui que rend le sélecteur de couleur natif. */
export const BRANDING_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

const DEFAULTS_BRANDING = {
  key: BRANDING_KEY,
  logo: '',
  tagline: '',
  taglineEn: '',
  primaryColor: '',
  secondaryColor: '',
  updatedAt: null,
  updatedBy: null,
};

/**
 * Vocabulaire et contexte de l'organisation.
 *
 * Un texte, un seul : les noms de clients, de projets et les sigles maison que
 * le modèle n'a aucun moyen de deviner. Il est joint à CHAQUE génération de
 * résumé, avant le template — c'est un vocabulaire, pas une consigne de style.
 *
 * Il vit dans l'onglet « Configuration » de l'administration parce qu'il vaut
 * pour toute l'organisation, avec le reste de l'identité de l'installation
 * (logo, phrase, couleur). Le contexte PERSONNEL (poste, entreprise de
 * l'utilisateur) reste dans « Ma configuration » : ce sont deux textes, deux
 * portées, deux écrans.
 *
 * Même plafond que l'ancien contexte métier de la détection d'actions, dont il
 * reprend la valeur au démarrage (cf. lib/bootstrap.js).
 */
export const ORG_CONTEXT_MAX = 2000;

const DEFAULTS_ORG_CONTEXT = {
  key: ORG_CONTEXT_KEY,
  context: '',
  updatedAt: null,
  updatedBy: null,
};

/**
 * Corrections automatiques de la transcription (onglet Configuration, sous le
 * vocabulaire). Une liste `[{ from: string[], to: string }]` — le nettoyage et
 * les plafonds vivent dans lib/transcriptCorrections.js. Vide par défaut : une
 * installation qui n'y touche pas transcrit exactement comme avant.
 */
const DEFAULTS_TRANSCRIPT_CORRECTIONS = {
  key: TRANSCRIPT_CORRECTIONS_KEY,
  rules: [],
  updatedAt: null,
  updatedBy: null,
};

/**
 * Fournisseurs de comptes externes — un seul par installation.
 *
 * Le réglage a été renommé : il ne gouverne plus seulement l'entreposage mais
 * TOUTE la connexion (le même compte sert au mail et au Drive), et il désigne
 * désormais le fournisseur plutôt que le produit — `google` couvre Gmail ET
 * Drive, `microsoft` couvre Outlook ET OneDrive.
 */
export const CONNECTION_PROVIDERS = ['google', 'microsoft'];

/** Correspondance des valeurs historiques, encore en base chez les clients. */
const LEGACY_STORAGE_ALIASES = { gdrive: 'google', sharepoint: 'microsoft' };

/** Valeur legacy équivalente, écrite en miroir le temps de la transition. */
const LEGACY_OF = { google: 'gdrive', microsoft: 'sharepoint' };

/**
 * Fournisseur retenu, quelle que soit la génération du document.
 *
 * Aucune migration de données n'est nécessaire : une installation configurée
 * avant ce renommage est lue correctement dès le premier démarrage.
 *
 * @param {object|null} doc - document `actions` brut
 * @returns {'' | 'google' | 'microsoft'}
 */
export function connectionProviderOf(doc) {
  const chosen = doc?.connections?.provider;
  if (CONNECTION_PROVIDERS.includes(chosen)) return chosen;
  return LEGACY_STORAGE_ALIASES[doc?.storage?.provider] || '';
}

/**
 * `Sites.ReadWrite.All` est-il demandé à la liaison d'un compte Microsoft ?
 *
 * VRAI sauf refus explicite, et c'est le point important : un document `actions`
 * écrit avant ce réglage n'a pas le champ, et doit continuer à demander le
 * scope — sinon le déploiement retirerait SharePoint aux installations qui
 * l'utilisent, sans que personne ne l'ait demandé.
 *
 * @param {object|null} doc - document `actions` brut
 * @returns {boolean}
 */
export function connectionSharePointOf(doc) {
  return doc?.connections?.sharepoint !== false;
}

/**
 * Par défaut, TOUTES les actions sont proposées (c'est la promesse produit) —
 * mais le bouton « Envoyer par mail » n'apparaît que si un relais SMTP existe,
 * et « Entreposer » que si un fournisseur est choisi ici : un bouton affiché
 * qui échouerait au premier clic est pire qu'un bouton absent.
 */
const DEFAULTS_ACTIONS = {
  key: ACTIONS_KEY,
  transcription: { email: true, storage: true, download: true },
  summary: { email: true, storage: true, download: true },
  connections: { provider: '', sharepoint: true },
  storage: { provider: '', folder: '' },
  mail: {
    /**
     * Le relais SMTP du serveur peut-il écrire à des destinataires autres que le
     * titulaire du compte ?
     *
     * Faux par défaut, et c'est le point important : déployer cette version ne
     * change RIEN à une installation existante. Écrire à un tiers depuis le
     * `no-reply` du serveur engage la réputation SPF/DMARC de l'exploitant pour
     * un contenu choisi par un seul utilisateur — lui seul sait si son relais
     * sort et si son domaine le couvre. Le compte relié (Gmail/Graph), lui,
     * n'est pas concerné : écrire à un tiers depuis sa propre boîte est son
     * fonctionnement normal.
     *
     * À faux, l'envoi PART quand même, mais au seul compte connecté, et la
     * réponse porte `degraded: 'smtp_recipients_dropped'`. On dégrade le
     * destinataire, jamais l'envoi : le repli SMTP existe précisément pour ne
     * pas perdre un envoi quand un jeton est révoqué entre deux clics.
     */
    allowSmtpExternal: false,
    maxRecipients: DEFAULT_MAX_RECIPIENTS,
    subjectTemplate: '',
  },
  naming: { filenameTemplate: '' },
  updatedAt: null,
  updatedBy: null,
};

/**
 * Indice d'une clé : 6 premiers caractères + 4 derniers. Assez pour reconnaître
 * « c'est bien celle-là » sans rien révéler d'utilisable — et surtout pour
 * repérer à l'œil une clé collée deux fois (`sk-sk-…`), la panne la plus
 * fréquente à la saisie.
 */
export function keyHint(key) {
  const value = String(key || '');
  if (!value) return '';
  if (value.length <= 12) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/**
 * Projection sûre — un seul point à auditer pour garantir que le secret ne fuit pas.
 *
 * `envEnabled` porte le drapeau d'environnement du mode (PASSWORD_LOGIN_ENABLED,
 * OIDC_ENABLED) : l'écran d'administration doit pouvoir dire « masqué par le
 * déploiement » — et ne proposer le SSO historique que là où il est déclaré —
 * sans deviner l'environnement du serveur.
 *
 * @param {object|null} doc - document `auth` complet
 * @param {{passwordLoginEnv?: boolean, legacySsoEnv?: boolean}} [context] - drapeaux d'environnement
 */
export function toPublicSettings(doc, { passwordLoginEnv = true, legacySsoEnv = true } = {}) {
  const google = doc?.google || {};
  const entra = doc?.entra || {};
  return {
    google: {
      enabled: !!google.enabled,
      clientId: google.clientId || '',
      hasSecret: !!google.clientSecret,
    },
    entra: {
      enabled: !!entra.enabled,
      clientId: entra.clientId || '',
      hasSecret: !!entra.clientSecret,
      discoveryUrl: entra.discoveryUrl || '',
    },
    // `!== false` et non `!!` : un document d'avant ces réglages ne porte pas
    // le champ, et son absence doit valoir « affiché » (défaut historique).
    passwordLogin: {
      enabled: doc?.passwordLogin?.enabled !== false,
      envEnabled: !!passwordLoginEnv,
    },
    legacySso: {
      enabled: doc?.legacySso?.enabled !== false,
      envEnabled: !!legacySsoEnv,
    },
    allowedDomains: Array.isArray(doc?.allowedDomains) ? doc.allowedDomains : [],
    updatedAt: doc?.updatedAt || null,
  };
}

/**
 * Projection sûre de la clé OpenAI. La clé elle-même ne sort jamais : seulement
 * son existence, sa provenance et son indice.
 *
 * `source` distingue les deux origines, et c'est ce qui rend l'écran
 * d'administration lisible : `env` = clé du fichier `.env` du déploiement (elle
 * disparaîtra derrière celle-ci dès qu'on en enregistre une), `settings` = clé
 * saisie ici, qui a la priorité.
 *
 * Le modèle de transcription suit la même logique de provenance, et la liste
 * des choix possibles est servie AVEC : l'écran d'administration ne peut donc
 * pas proposer un modèle que l'API refusera (cf. lib/transcriptionModels.js).
 *
 * @param {object|null} doc - document `ai` complet
 * @param {{envKey?: string, envModel?: string}} [context] - valeurs de l'environnement, pour la provenance
 */
export function toPublicAiSettings(
  doc,
  { envKey = '', envModel = '', envSummaryModel = '', envInfographicImageModel = '' } = {},
) {
  const stored = doc?.apiKey || '';
  const effective = stored || envKey || '';
  const transcription = describeTranscriptionModel(doc?.transcriptionModel || '', envModel);
  const storedSummary = doc?.summaryModel || '';
  const envSummary = String(envSummaryModel || '').trim();
  const storedImage = doc?.infographicImageModel || '';
  const envImage = String(envInfographicImageModel || '').trim();
  return {
    hasKey: !!effective,
    source: stored ? 'settings' : envKey ? 'env' : 'none',
    hint: keyHint(effective),
    transcriptionModel: transcription.model,
    transcriptionModelSource: transcription.source,
    // Choix (ou variable d'environnement) resté sur un modèle qu'OpenAI
    // retire : déjà remplacé à la résolution, l'écran le DIT plutôt que de
    // montrer un autre modèle en service sans explication.
    transcriptionModelRetired: transcription.retiredFrom
      ? { from: transcription.retiredFrom, date: TRANSCRIPTION_RETIREMENT_DATE }
      : null,
    transcriptionModels: TRANSCRIPTION_MODELS,
    summaryModel: resolveSummaryModel(storedSummary, envSummary),
    summaryModelSource: isSummaryModel(storedSummary) ? 'settings' : envSummary ? 'env' : 'default',
    // Servie AVEC la valeur, comme pour la transcription : l'écran ne peut pas
    // proposer un modèle que l'enregistrement refuserait.
    summaryModels: SUMMARY_MODELS,
    // Un modèle imposé par le déploiement et INCONNU de la liste (porte de
    // sortie de l'administrateur système) doit rester affichable : l'écran
    // ajoute cette valeur à son menu plutôt que de la remplacer en silence.
    summaryModelOffList: !!envSummary && !isSummaryModel(envSummary) && !storedSummary,
    // `!== false` : un document d'avant ce réglage ne porte pas le champ, et
    // son absence vaut « activée » (défaut du réglage).
    infographicEnabled: doc?.infographicEnabled !== false,
    // Texte libre, servi TEL QUEL à l'administration : contrairement à la clé,
    // il n'y a rien de secret à masquer, et l'écran doit pouvoir le rééditer.
    infographicStyle: String(doc?.infographicStyle || '').slice(0, INFOGRAPHIC_STYLE_MAX),
    // Modèle d'IMAGE : même trio valeur / provenance / liste que la rédaction,
    // et pour la même raison — l'écran ne doit pas pouvoir proposer un modèle
    // que l'enregistrement refuserait.
    infographicImageModel: resolveInfographicImageModel(storedImage, envImage),
    infographicImageModelSource: isInfographicImageModel(storedImage)
      ? 'settings'
      : envImage
        ? 'env'
        : 'default',
    infographicImageModels: INFOGRAPHIC_IMAGE_MODELS,
    // Un palier imposé par le déploiement et hors liste (`sunburst`, une
    // génération plus récente) doit rester AFFICHABLE : sans ce drapeau,
    // l'écran montrerait la première option de sa liste et mentirait sur le
    // modèle qui dessine réellement.
    infographicImageModelOffList: !!envImage && !isInfographicImageModel(envImage) && !storedImage,
    updatedAt: doc?.updatedAt || null,
    updatedBy: doc?.updatedBy || null,
  };
}

/**
 * Politique d'envoi, normalisée à la lecture.
 *
 * Le plafond de destinataires est borné par `MAX_RECIPIENTS_CEILING` ici et
 * non seulement à l'écriture : une valeur posée directement en base, ou par une
 * version antérieure du schéma, ne doit pas pouvoir le dépasser au moment de
 * l'envoi.
 */
function mailPolicy(doc) {
  const raw = Number(doc?.mail?.maxRecipients);
  const max = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_RECIPIENTS;
  return {
    allowSmtpExternal: !!doc?.mail?.allowSmtpExternal,
    maxRecipients: Math.min(max, MAX_RECIPIENTS_CEILING),
    subjectTemplate: doc?.mail?.subjectTemplate || '',
  };
}

/**
 * Projection publique des actions. Servie à TOUT compte (via /api/auth/config) :
 * elle pilote l'affichage des boutons, rien de plus. Le dossier cible reste
 * réservé à l'administration (`withFolder`) — un chemin interne n'a rien à
 * faire dans une réponse publique.
 *
 * `emailAvailable` vient du mailer, pas du document : cocher « Envoyer par
 * mail » sans relais SMTP ne doit produire aucun bouton.
 *
 * @param {object|null} doc - document `actions` complet
 * @param {{mailerEnabled?: boolean, withFolder?: boolean}} [context]
 */
export function toPublicActionsSettings(doc, { mailerEnabled = false, withFolder = false } = {}) {
  const toggles = (section) => ({
    email: section?.email !== false,
    storage: section?.storage !== false,
    download: section?.download !== false,
  });
  const provider = connectionProviderOf(doc);
  return {
    transcription: toggles(doc?.transcription),
    summary: toggles(doc?.summary),
    // `sharepoint` n'est servi qu'à l'administration : il ne gouverne aucun
    // bouton de l'écran principal, et /api/auth/config est une sonde publique.
    connections: { provider, ...(withFolder ? { sharepoint: connectionSharePointOf(doc) } : {}) },
    storage: {
      // Nom historique conservé dans la projection : le frontend d'une version
      // antérieure lit encore `storage.provider` pour afficher le bouton.
      provider: LEGACY_OF[provider] || '',
      ...(withFolder ? { folder: doc?.storage?.folder || '' } : {}),
    },
    emailAvailable: !!mailerEnabled,
    updatedAt: doc?.updatedAt || null,
    // Politique d'envoi et gabarits d'organisation : RÉSERVÉS à l'administration,
    // au même titre que le dossier cible. L'écran de réglages d'un utilisateur
    // reçoit ce dont il a besoin (plafond, gabarits effectifs) de sa propre
    // route — /api/auth/config est une sonde publique, servie avant même qu'on
    // sache qui demande.
    ...(withFolder
      ? {
          mail: mailPolicy(doc),
          naming: { filenameTemplate: doc?.naming?.filenameTemplate || '' },
          updatedBy: doc?.updatedBy || null,
        }
      : {}),
  };
}

/**
 * Projection publique de l'apparence. Servie à TOUT LE MONDE via
 * /api/auth/config — avant même l'écran de connexion, qui porte le logo et la
 * couleur. Rien de secret dedans, mais `updatedBy` est un email
 * d'administrateur : il reste réservé à l'écran d'administration (`withMeta`),
 * une sonde publique n'a pas à divulguer qui administre l'installation.
 *
 * @param {object|null} doc - document `branding` complet
 * @param {{withMeta?: boolean}} [context]
 */
export function toPublicBrandingSettings(doc, { withMeta = false } = {}) {
  return {
    logo: doc?.logo || '',
    tagline: doc?.tagline || '',
    taglineEn: doc?.taglineEn || '',
    primaryColor: doc?.primaryColor || '',
    secondaryColor: doc?.secondaryColor || '',
    ...(withMeta ? { updatedAt: doc?.updatedAt || null, updatedBy: doc?.updatedBy || null } : {}),
  };
}

/**
 * Projection du contexte d'organisation.
 *
 * Servie à tout compte AUTHENTIFIÉ (avec les templates transverses, cf.
 * routes/templates.js) : le prompt de résumé est assemblé par le navigateur,
 * ce texte doit donc y descendre. Il ne passe JAMAIS par /api/auth/config, qui
 * est publique — c'est du vocabulaire d'organisation, pas une capacité de
 * l'installation.
 *
 * `updatedBy` est un email d'administrateur : réservé à l'écran
 * d'administration (`withMeta`), comme pour l'apparence.
 *
 * @param {object|null} doc - document `orgContext` complet
 * @param {{withMeta?: boolean}} [context]
 */
export function toPublicOrgContextSettings(doc, { withMeta = false } = {}) {
  return {
    context: String(doc?.context || '').slice(0, ORG_CONTEXT_MAX),
    ...(withMeta ? { updatedAt: doc?.updatedAt || null, updatedBy: doc?.updatedBy || null } : {}),
  };
}

/**
 * Projection des corrections automatiques. Servie à tout compte authentifié
 * AVEC les templates (le navigateur applique les corrections au direct, qui
 * ne passe jamais par l'API) — jamais par la sonde publique /api/auth/config :
 * ce sont des noms de clients et de produits.
 *
 * Re-nettoyée à la lecture : un document écrit hors de la route (base
 * restaurée, script) ne peut pas faire tourner une liste hors plafonds chez
 * tous les utilisateurs. `updatedBy` est réservé à l'administration.
 *
 * @param {object|null} doc - document `transcriptCorrections` complet
 * @param {{withMeta?: boolean}} [context]
 */
export function toPublicTranscriptCorrections(doc, { withMeta = false } = {}) {
  return {
    rules: sanitizeTranscriptCorrections(doc?.rules),
    ...(withMeta ? { updatedAt: doc?.updatedAt || null, updatedBy: doc?.updatedBy || null } : {}),
  };
}

/**
 * Fusionne un patch de fournisseur sur l'existant.
 * Secret absent ou vide = « ne pas toucher » : le frontend ne le reçoit jamais,
 * il ne peut donc pas le renvoyer tel quel dans un formulaire.
 */
function mergeProvider(current, patch, { withDiscovery = false } = {}) {
  const next = { ...current };
  if (!patch) return next;
  if (patch.enabled !== undefined) next.enabled = !!patch.enabled;
  if (patch.clientId !== undefined) next.clientId = String(patch.clientId).trim();
  if (patch.clientSecret) next.clientSecret = String(patch.clientSecret).trim();
  if (withDiscovery && patch.discoveryUrl !== undefined) {
    next.discoveryUrl = String(patch.discoveryUrl).trim();
  }
  return next;
}

/** Interrupteur simple : champ absent = inchangé. */
function mergeToggle(current, patch) {
  return { enabled: patch?.enabled === undefined ? current.enabled : !!patch.enabled };
}

/**
 * État `auth` complet après application d'un patch — PURE, rien n'est écrit.
 *
 * Exportée parce que la route d'administration doit juger l'état d'ARRIVÉE
 * avant d'écrire (refuser un enregistrement qui ne laisserait plus aucun mode
 * de connexion affiché, cf. routes/admin/settings.js) : recopier la fusion
 * là-bas la ferait diverger de celle-ci au premier champ ajouté.
 *
 * @param {object} current - document complet (secrets inclus), cf. get()
 * @param {{google?: object, entra?: object, passwordLogin?: object, legacySso?: object, allowedDomains?: string[]}} patch
 */
export function mergeAuthSettings(current, patch = {}) {
  return {
    google: mergeProvider(current.google, patch.google),
    entra: mergeProvider(current.entra, patch.entra, { withDiscovery: true }),
    passwordLogin: mergeToggle(current.passwordLogin, patch.passwordLogin),
    legacySso: mergeToggle(current.legacySso, patch.legacySso),
    allowedDomains:
      patch.allowedDomains === undefined
        ? current.allowedDomains
        : sanitizeDomainList(patch.allowedDomains),
  };
}

/**
 * Le déploiement on-prem passe des variables GÉNÉRIQUES (`CLIENT_ID`,
 * `CLIENT_SECRET`, `OIDC_DISCOVERY_URL`) au plugin Traefik — et sur la stack
 * myalfred, ces mêmes variables portent des identifiants GOOGLE. On ne peut donc
 * pas les amorcer en « entra » sans regarder de quel annuaire il s'agit.
 */
function isEntraAuthority(url) {
  return /(^|\/\/)login\.microsoftonline\.(com|us)\//i.test(String(url || ''));
}

export function createSettingsRepo(db) {
  const settings = () => db.collection(SETTINGS_COLLECTION);

  return {
    toPublicSettings,
    toPublicAiSettings,
    toPublicActionsSettings,
    toPublicBrandingSettings,
    toPublicOrgContextSettings,
    toPublicTranscriptCorrections,

    /** @returns {Promise<object>} le document COMPLET (secrets inclus) — usage serveur uniquement */
    async get() {
      const doc = await settings().findOne({ key: AUTH_KEY });
      return {
        ...DEFAULTS,
        ...(doc || {}),
        google: { ...DEFAULTS.google, ...(doc?.google || {}) },
        entra: { ...DEFAULTS.entra, ...(doc?.entra || {}) },
        passwordLogin: { ...DEFAULTS.passwordLogin, ...(doc?.passwordLogin || {}) },
        legacySso: { ...DEFAULTS.legacySso, ...(doc?.legacySso || {}) },
        allowedDomains: Array.isArray(doc?.allowedDomains) ? doc.allowedDomains : [],
      };
    },

    /**
     * @param {{google?: object, entra?: object, passwordLogin?: object, legacySso?: object, allowedDomains?: string[]}} patch
     */
    async update(patch = {}) {
      const current = await this.get();

      const next = {
        ...mergeAuthSettings(current, patch),
        updatedAt: new Date().toISOString(),
      };

      await settings().updateOne(
        { key: AUTH_KEY },
        { $set: next, $setOnInsert: { key: AUTH_KEY, createdAt: next.updatedAt } },
        { upsert: true },
      );
      return this.get();
    },

    // ── Clé OpenAI ──────────────────────────────────────────────────────────

    /** @returns {Promise<object>} le document `ai` COMPLET (clé incluse) — usage serveur uniquement */
    async getAi() {
      const doc = await settings().findOne({ key: AI_KEY });
      return { ...DEFAULTS_AI, ...(doc || {}) };
    },

    /**
     * Clé effectivement utilisée pour appeler OpenAI.
     *
     * La clé saisie dans l'administration PRIME sur celle de l'environnement :
     * c'est ce qui permet de réparer un déploiement dont le `.env` porte une
     * clé fausse ou expirée sans accès SSH. L'environnement reste l'amorçage
     * d'une installation neuve.
     *
     * @param {string} [envKey] - valeur de OPENAI_API_KEY
     * @returns {Promise<string>} la clé, ou '' si aucune n'est configurée
     */
    async resolveOpenAiKey(envKey = '') {
      const doc = await this.getAi();
      return doc.apiKey || envKey || '';
    },

    /**
     * Modèle de transcription live effectivement utilisé : administration,
     * sinon environnement, sinon défaut intégré.
     *
     * @param {string} [envModel] - valeur de OPENAI_MODEL_TRANSCRIPTION
     * @returns {Promise<string>}
     */
    async resolveTranscriptionModel(envModel = '') {
      const doc = await this.getAi();
      return resolveTranscriptionModel(doc.transcriptionModel, envModel);
    },

    /**
     * Modèle qui RÉDIGE le compte rendu : administration, sinon environnement,
     * sinon défaut intégré. Relu à chaque génération, sans cache — même parti
     * pris que la clé : un modèle changé s'applique au compte rendu suivant,
     * sans redémarrage.
     *
     * @param {string} [envModel] - valeur de OPENAI_MODEL_SUMMARY
     * @returns {Promise<string>}
     */
    async resolveSummaryModel(envModel = '') {
      const doc = await this.getAi();
      return resolveSummaryModel(doc.summaryModel, envModel);
    },

    /**
     * L'infographie de compte rendu est-elle proposée sur cette installation ?
     * Relu à CHAQUE génération, sans cache — même parti pris que la clé : un
     * réglage coupé s'applique à la réunion en cours, sans redémarrage.
     * @returns {Promise<boolean>}
     */
    async infographicEnabled() {
      return (await this.getAi()).infographicEnabled !== false;
    },

    /**
     * Style graphique imposé aux infographies — '' quand l'organisation n'en
     * impose aucun (le modèle choisit alors sa palette, comportement d'avant
     * ce réglage). Relu à CHAQUE génération, sans cache : une charte corrigée
     * s'applique à l'image suivante, sans redémarrage.
     * @returns {Promise<string>}
     */
    async infographicStyle() {
      return String((await this.getAi()).infographicStyle || '').trim();
    },

    /**
     * Modèle qui DESSINE l'infographie : administration, sinon environnement,
     * sinon défaut intégré. Relu à CHAQUE image, sans cache — même parti pris
     * que la clé et le modèle de rédaction : un modèle changé s'applique à
     * l'infographie suivante, sans redémarrage.
     *
     * @param {string} [envModel] - valeur de OPENAI_MODEL_INFOGRAPHIC_IMAGE
     * @returns {Promise<string>}
     */
    async resolveInfographicImageModel(envModel = '') {
      const doc = await this.getAi();
      return resolveInfographicImageModel(doc.infographicImageModel, envModel);
    },

    /**
     * Enregistre la clé et/ou le modèle de transcription.
     *
     * Un champ ABSENT n'est pas touché — c'est ce qui permet à l'écran de
     * changer de modèle sans ressaisir la clé, et réciproquement. Un champ
     * présent mais VIDE, lui, efface : `apiKey: ''` fait retomber le service
     * sur la clé de l'environnement, `transcriptionModel: ''` sur le modèle par
     * défaut. C'est le seul moyen d'annuler une saisie sans accès au serveur.
     *
     * Un modèle inconnu est refusé ici AUSSI (le schéma de route le filtre
     * déjà) : ce dépôt est appelé par les tests et par le futur écran, il ne
     * peut pas dépendre d'une validation qui vit ailleurs.
     *
     * @param {{apiKey?: string, transcriptionModel?: string, summaryModel?: string,
     *          infographicEnabled?: boolean, infographicStyle?: string,
     *          infographicImageModel?: string}} patch
     * @param {{actor?: string}} [context] - email de l'administrateur, pour la traçabilité
     */
    async updateAi(
      {
        apiKey,
        transcriptionModel,
        summaryModel,
        infographicEnabled,
        infographicStyle,
        infographicImageModel,
      },
      { actor = null } = {},
    ) {
      const next = {
        updatedAt: new Date().toISOString(),
        updatedBy: actor,
      };
      if (apiKey !== undefined) next.apiKey = String(apiKey).trim();
      if (infographicEnabled !== undefined) next.infographicEnabled = !!infographicEnabled;
      // Champ vide = « plus de style imposé », comme la clé et les modèles :
      // c'est le seul moyen de revenir au libre choix du modèle depuis l'écran.
      if (infographicStyle !== undefined) {
        next.infographicStyle = String(infographicStyle).trim().slice(0, INFOGRAPHIC_STYLE_MAX);
      }
      if (transcriptionModel !== undefined) {
        const model = String(transcriptionModel).trim();
        if (model && !isTranscriptionModel(model)) {
          throw new Error(`modèle de transcription inconnu: ${model}`);
        }
        next.transcriptionModel = model;
      }
      // Refusé ici AUSSI, comme la transcription : ce dépôt est appelé par les
      // tests et par l'écran, il ne peut pas dépendre d'une validation qui vit
      // dans le schéma de route. Une coquille enregistrée ferait échouer TOUS
      // les comptes rendus de l'installation.
      if (summaryModel !== undefined) {
        const model = String(summaryModel).trim();
        if (model && !isSummaryModel(model)) {
          throw new Error(`modèle de résumé inconnu: ${model}`);
        }
        next.summaryModel = model;
      }
      // Même garde-fou pour le modèle d'IMAGE, et un symptôme pire encore : la
      // génération se fait en TÂCHE DE FOND, une coquille ne produirait qu'un
      // `infographic.status = 'error'` chez l'utilisateur, sans message.
      if (infographicImageModel !== undefined) {
        const model = String(infographicImageModel).trim();
        if (model && !isInfographicImageModel(model)) {
          throw new Error(`modèle d'infographie inconnu: ${model}`);
        }
        next.infographicImageModel = model;
      }
      await settings().updateOne(
        { key: AI_KEY },
        { $set: next, $setOnInsert: { key: AI_KEY, createdAt: next.updatedAt } },
        { upsert: true },
      );
      return this.getAi();
    },

    // ── Actions après réunion / résumé ─────────────────────────────────────

    /** @returns {Promise<object>} le document `actions` COMPLET — usage serveur uniquement */
    async getActions() {
      const doc = await settings().findOne({ key: ACTIONS_KEY });
      return {
        ...DEFAULTS_ACTIONS,
        ...(doc || {}),
        transcription: { ...DEFAULTS_ACTIONS.transcription, ...(doc?.transcription || {}) },
        summary: { ...DEFAULTS_ACTIONS.summary, ...(doc?.summary || {}) },
        // Normalisé à la lecture : les installations configurées avant le
        // renommage exposent le bon fournisseur sans migration de données, et
        // celles antérieures au réglage SharePoint le demandent toujours.
        connections: {
          provider: connectionProviderOf(doc),
          sharepoint: connectionSharePointOf(doc),
        },
        storage: { ...DEFAULTS_ACTIONS.storage, ...(doc?.storage || {}) },
        // Idem pour la politique d'envoi : un document antérieur aux
        // destinataires paramétrables rend les défauts, sans migration.
        mail: mailPolicy(doc),
        naming: { filenameTemplate: doc?.naming?.filenameTemplate || '' },
      };
    },

    /**
     * Chaque section est fusionnée champ par champ : un patch qui ne touche que
     * `summary.email` ne doit pas réinitialiser le reste.
     *
     * @param {{transcription?: object, summary?: object, storage?: object}} patch
     * @param {{actor?: string}} [context] - email de l'administrateur, pour la traçabilité
     */
    async updateActions(patch = {}, { actor = null } = {}) {
      const current = await this.getActions();

      const mergeToggles = (base, p) => ({
        email: p?.email === undefined ? base.email : !!p.email,
        storage: p?.storage === undefined ? base.storage : !!p.storage,
        download: p?.download === undefined ? base.download : !!p.download,
      });

      // Le fournisseur peut arriver sous son nom actuel (`connections.provider`)
      // ou sous son nom historique (`storage.provider`, valeurs gdrive /
      // sharepoint) : l'administration d'une version antérieure reste servie.
      const patched = patch.connections?.provider ?? patch.storage?.provider;
      const provider =
        patched === undefined
          ? current.connections.provider
          : CONNECTION_PROVIDERS.includes(patched)
            ? patched
            : LEGACY_STORAGE_ALIASES[patched] || '';

      // Absent du patch = inchangé. Un écran d'une version antérieure enregistre
      // `connections: { provider }` sans ce champ : il ne doit pas retirer
      // SharePoint à une installation qui l'avait coupé, ni l'inverse.
      const sharepoint =
        patch.connections?.sharepoint === undefined
          ? current.connections.sharepoint
          : !!patch.connections.sharepoint;

      const next = {
        transcription: mergeToggles(current.transcription, patch.transcription),
        summary: mergeToggles(current.summary, patch.summary),
        connections: { provider, sharepoint },
        storage: {
          // Miroir de la valeur historique : un retour arrière du code relit un
          // document cohérent. À retirer une fois la bascule éprouvée.
          provider: LEGACY_OF[provider] || '',
          folder:
            patch.storage?.folder === undefined
              ? current.storage.folder
              : String(patch.storage.folder).trim(),
        },
        // ⚠️ Chaque champ doit être relayé EXPLICITEMENT : un champ accepté par
        // le schéma mais oublié ici serait silencieusement ignoré, et
        // l'interface annoncerait « Enregistré » sans que rien ne change.
        mail: mailPolicy({
          mail: {
            allowSmtpExternal:
              patch.mail?.allowSmtpExternal === undefined
                ? current.mail.allowSmtpExternal
                : !!patch.mail.allowSmtpExternal,
            maxRecipients:
              patch.mail?.maxRecipients === undefined
                ? current.mail.maxRecipients
                : patch.mail.maxRecipients,
            subjectTemplate:
              patch.mail?.subjectTemplate === undefined
                ? current.mail.subjectTemplate
                : String(patch.mail.subjectTemplate).trim().slice(0, TEMPLATE_MAX),
          },
        }),
        naming: {
          filenameTemplate:
            patch.naming?.filenameTemplate === undefined
              ? current.naming.filenameTemplate
              : String(patch.naming.filenameTemplate).trim().slice(0, TEMPLATE_MAX),
        },
        updatedAt: new Date().toISOString(),
        updatedBy: actor,
      };

      await settings().updateOne(
        { key: ACTIONS_KEY },
        { $set: next, $setOnInsert: { key: ACTIONS_KEY, createdAt: next.updatedAt } },
        { upsert: true },
      );
      return this.getActions();
    },

    // ── Apparence (logo, phrase d'accueil, couleur primaire) ───────────────

    /** @returns {Promise<object>} le document `branding` COMPLET */
    async getBranding() {
      const doc = await settings().findOne({ key: BRANDING_KEY });
      return { ...DEFAULTS_BRANDING, ...(doc || {}) };
    },

    /**
     * Même contrat que `updateAi` : champ ABSENT = inchangé, champ présent
     * mais VIDE = retour à la valeur intégrée. Revalidé ici en plus du schéma
     * de route, pour les mêmes raisons (tests, appels futurs).
     *
     * @param {{logo?: string, tagline?: string, taglineEn?: string, primaryColor?: string, secondaryColor?: string}} patch
     * @param {{actor?: string}} [context] - email de l'administrateur, pour la traçabilité
     */
    async updateBranding(
      { logo, tagline, taglineEn, primaryColor, secondaryColor },
      { actor = null } = {},
    ) {
      const next = {
        updatedAt: new Date().toISOString(),
        updatedBy: actor,
      };
      if (logo !== undefined) {
        const value = String(logo).trim();
        if (value && !BRANDING_LOGO_PATTERN.test(value)) {
          throw new Error('logo invalide : data-URL image attendue');
        }
        if (value.length > BRANDING_LOGO_MAX) {
          throw new Error('logo trop lourd');
        }
        next.logo = value;
      }
      for (const [field, raw] of [
        ['tagline', tagline],
        ['taglineEn', taglineEn],
      ]) {
        if (raw !== undefined) next[field] = String(raw).trim().slice(0, BRANDING_TAGLINE_MAX);
      }
      // Les deux couleurs suivent la même règle : normalisées en minuscules
      // (le sélecteur natif rend parfois du #12ABEF) et refusées si le format
      // n'est pas #rrggbb — une valeur libre finirait injectée telle quelle
      // dans un style inline côté navigateur.
      for (const [field, raw] of [
        ['primaryColor', primaryColor],
        ['secondaryColor', secondaryColor],
      ]) {
        if (raw === undefined) continue;
        const value = String(raw).trim().toLowerCase();
        if (value && !BRANDING_COLOR_PATTERN.test(value)) {
          throw new Error(`couleur invalide (${field}): ${value}`);
        }
        next[field] = value;
      }
      await settings().updateOne(
        { key: BRANDING_KEY },
        { $set: next, $setOnInsert: { key: BRANDING_KEY, createdAt: next.updatedAt } },
        { upsert: true },
      );
      return this.getBranding();
    },

    // ── Contexte de l'organisation (onglet Configuration) ──────────────────

    /** @returns {Promise<object>} le document `orgContext` COMPLET */
    async getOrgContext() {
      const doc = await settings().findOne({ key: ORG_CONTEXT_KEY });
      return { ...DEFAULTS_ORG_CONTEXT, ...(doc || {}), ...toPublicOrgContextSettings(doc) };
    },

    /**
     * Le texte seul, pour les chemins qui composent un prompt (détection en
     * réunion, banc d'essai). Évite de recopier `(await getOrgContext()).context`
     * à chaque appelant, et dit par son nom ce qui est attendu.
     *
     * @returns {Promise<string>}
     */
    async orgContextText() {
      return (await this.getOrgContext()).context;
    },

    /**
     * Même contrat que `updateBranding` : champ ABSENT = inchangé, champ
     * présent mais VIDE = retour au comportement d'origine (aucun contexte
     * joint aux résumés). Borné ici en plus du schéma de route — ce dépôt est
     * appelé directement par les tests et par la reprise de bootstrap.
     *
     * @param {{context?: string}} patch
     * @param {{actor?: string}} [context] - email de l'administrateur, pour la traçabilité
     */
    async updateOrgContext({ context } = {}, { actor = null } = {}) {
      const next = { updatedAt: new Date().toISOString(), updatedBy: actor };
      if (context !== undefined) {
        next.context = String(context).trim().slice(0, ORG_CONTEXT_MAX);
      }
      await settings().updateOne(
        { key: ORG_CONTEXT_KEY },
        { $set: next, $setOnInsert: { key: ORG_CONTEXT_KEY, createdAt: next.updatedAt } },
        { upsert: true },
      );
      return this.getOrgContext();
    },

    // ── Corrections automatiques de la transcription (onglet Configuration) ─

    /** @returns {Promise<object>} le document `transcriptCorrections` COMPLET */
    async getTranscriptCorrections() {
      const doc = await settings().findOne({ key: TRANSCRIPT_CORRECTIONS_KEY });
      return {
        ...DEFAULTS_TRANSCRIPT_CORRECTIONS,
        ...(doc || {}),
        ...toPublicTranscriptCorrections(doc),
      };
    },

    /**
     * Remplace la liste ENTIÈRE (c'est une liste éditée d'un bloc à l'écran) ;
     * champ absent = inchangé, liste vide = plus aucune correction. Nettoyée
     * ici en plus du schéma de route : ce dépôt est appelé directement par les
     * tests.
     *
     * @param {{rules?: Array}} patch
     * @param {{actor?: string}} [context] - email de l'administrateur, pour la traçabilité
     */
    async updateTranscriptCorrections({ rules } = {}, { actor = null } = {}) {
      const next = { updatedAt: new Date().toISOString(), updatedBy: actor };
      if (rules !== undefined) next.rules = sanitizeTranscriptCorrections(rules);
      await settings().updateOne(
        { key: TRANSCRIPT_CORRECTIONS_KEY },
        {
          $set: next,
          $setOnInsert: { key: TRANSCRIPT_CORRECTIONS_KEY, createdAt: next.updatedAt },
        },
        { upsert: true },
      );
      return this.getTranscriptCorrections();
    },

    /**
     * Valeurs initiales depuis l'environnement. N'écrase JAMAIS un réglage déjà
     * saisi : l'amorçage se fait champ par champ, pas « tout ou rien », sinon
     * un fournisseur ajouté plus tard ne pourrait plus être amorcé sur une
     * installation dont le document existe déjà.
     *
     * Entra est amorcé DÉSACTIVÉ par défaut (`ENTRA_LOGIN_ENABLED`) : déployer
     * cette version sur une installation qui tourne encore avec le plugin
     * Traefik ne doit rien changer de visible. L'activation est le geste
     * explicite de la bascule.
     */
    async seedFromEnv(env = {}) {
      const current = await this.get();
      const patch = {};

      if (!current.google.clientId && !current.google.clientSecret) {
        const clientId = (env.GOOGLE_CLIENT_ID || '').trim();
        const clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim();
        if (clientId || clientSecret) {
          patch.google = { enabled: !!(clientId && clientSecret), clientId, clientSecret };
        }
      }

      if (!current.entra.clientId && !current.entra.clientSecret) {
        // Variables du plugin Traefik, reprises telles quelles : la bascule ne
        // demande aucune modification du .env de production.
        const discoveryUrl = (
          env.OIDC_DISCOVERY_URL ||
          (env.PROVIDER_URL
            ? `${String(env.PROVIDER_URL).replace(/\/+$/, '')}/.well-known/openid-configuration`
            : '')
        ).trim();
        const clientId = (env.ENTRA_CLIENT_ID || env.CLIENT_ID || '').trim();
        const clientSecret = (env.ENTRA_CLIENT_SECRET || env.CLIENT_SECRET || '').trim();
        if (isEntraAuthority(discoveryUrl) && (clientId || clientSecret)) {
          patch.entra = {
            enabled: bool(env.ENTRA_LOGIN_ENABLED, false) && !!(clientId && clientSecret),
            clientId,
            clientSecret,
            discoveryUrl,
          };
        }
      }

      if (current.allowedDomains.length === 0) {
        const domains = sanitizeDomainList(String(env.ALLOWED_EMAIL_DOMAINS || '').split(','));
        if (domains.length > 0) patch.allowedDomains = domains;
      }

      if (Object.keys(patch).length === 0) return { seeded: false };
      await this.update(patch);
      return { seeded: true, providers: Object.keys(patch) };
    },
  };
}
