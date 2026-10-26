/**
 * Schémas de validation des corps de requête — JSON Schema natif Fastify.
 *
 * Fastify embarque déjà ajv : la validation déclarative ne coûte aucune
 * dépendance et c'est la façon idiomatique du framework. Pas de zod (style
 * étranger au dépôt) ni de valideur maison (du code à tester en plus).
 *
 * ⚠️ Volontairement AUCUN `schema.response` : la sérialisation stricte de
 * Fastify supprimerait silencieusement tout champ non déclaré, ce qui
 * transformerait le moindre oubli en bug invisible côté frontend.
 *
 * Pas de `format: 'email'` non plus : ajv-formats n'est pas installé, et un
 * mot-clé inconnu ferait échouer la compilation du schéma au démarrage.
 */
import { EMAIL_PATTERN } from '../../lib/auth/emailPattern.js';
import { MAX_RECIPIENTS_CEILING } from '../../lib/actions/recipients.js';
import { TEMPLATE_MAX } from '../../lib/actions/templating.js';
import { TAG_FOLDERS_MAX, TAG_RECIPIENTS_MAX } from '../../lib/repositories/userActions.js';
import { TRANSCRIPTION_MODELS } from '../../lib/transcriptionModels.js';
import { SUMMARY_MODELS } from '../../lib/summaryModels.js';
import { INFOGRAPHIC_IMAGE_MODELS } from '../../lib/infographicModels.js';
import {
  BRANDING_LOGO_MAX,
  BRANDING_TAGLINE_MAX,
  ORG_CONTEXT_MAX,
} from '../../lib/repositories/settings.js';
import { INFOGRAPHIC_STYLE_MAX } from '../../lib/prompts.js';
import { PERSONAL_RANGES } from '../../lib/personalStats.js';
import {
  CORRECTIONS_MAX,
  VARIANTS_MAX,
  TERM_MAX,
  REPLACEMENT_MAX,
} from '../../lib/transcriptCorrections.js';
import { GROUPS_MAX, QUOTA_MINUTES_MAX } from '../../lib/repositories/groups.js';
import {
  DETECTION_SENSITIVITIES,
  DETECTION_WINDOW_MIN,
  DETECTION_WINDOW_MAX,
  DETECTION_INTERVAL_MIN,
  DETECTION_INTERVAL_MAX,
  DETECTION_TRIGGER_WORDS_MAX,
  DETECTION_TRIGGER_WORD_MAX,
} from '../../lib/actionDetectionSettings.js';

const email = { type: 'string', minLength: 3, maxLength: 320, pattern: EMAIL_PATTERN };
// La borne haute doit correspondre à MAX_PASSWORD_LENGTH (lib/auth/password.js) :
// scrypt hache l'entrée entière, une saisie de plusieurs Mo serait un DoS gratuit.
const password = { type: 'string', minLength: 1, maxLength: 200 };

export const loginBody = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: { email, password },
};

export const forgotBody = {
  type: 'object',
  required: ['email'],
  additionalProperties: false,
  properties: { email, lang: { type: 'string', enum: ['fr', 'en'] } },
};

export const resetBody = {
  type: 'object',
  required: ['token', 'password'],
  additionalProperties: false,
  properties: { token: { type: 'string', minLength: 10, maxLength: 200 }, password },
};

export const changePasswordBody = {
  type: 'object',
  required: ['currentPassword', 'newPassword'],
  additionalProperties: false,
  properties: { currentPassword: password, newPassword: password },
};

/**
 * Groupes d'un compte. Une liste VIDE est acceptée : le serveur la lit comme
 * « le groupe par défaut » (cf. lib/repositories/groups.js) — c'est ce que le
 * formulaire envoie quand l'administrateur décoche tout.
 */
const groupIds = {
  type: 'array',
  maxItems: GROUPS_MAX,
  items: { type: 'string', maxLength: 64 },
};

export const adminCreateBody = {
  type: 'object',
  required: ['email'],
  additionalProperties: false,
  properties: {
    email,
    name: { type: 'string', maxLength: 120 },
    role: { type: 'string', enum: ['user', 'admin'] },
    password,
    mustChangePassword: { type: 'boolean' },
    groupIds,
  },
};

export const adminUpdateBody = {
  type: 'object',
  required: ['email'],
  additionalProperties: false,
  properties: {
    email,
    name: { type: 'string', maxLength: 120 },
    role: { type: 'string', enum: ['user', 'admin'] },
    disabled: { type: 'boolean' },
    groupIds,
  },
};

/**
 * Groupes d'utilisateurs (routes/admin/groups.js). Les longueurs ici sont des
 * garde-fous de transport ; la règle métier (nom non vide, plafond, couleur de
 * la palette, unicité) est vérifiée ensuite pour renvoyer un slug précis.
 */
const groupId = { type: 'string', minLength: 1, maxLength: 64 };

/**
 * Quota de minutes de réunion, par personne et par mois : entier positif ou
 * nul, ou `null` pour « illimité » (cf. lib/quota.js). Absent d'une mise à jour
 * = inchangé ; le formulaire envoie `null` pour retirer la limite.
 */
const meetingMinutesPerMonth = {
  type: ['integer', 'null'],
  minimum: 0,
  maximum: QUOTA_MINUTES_MAX,
};

/** Droit de générer des infographies (cf. `rightsOf`, lib/repositories/groups.js). */
const infographicAllowed = { type: 'boolean' };

export const adminGroupCreateBody = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    color: { type: 'string', maxLength: 32 },
    meetingMinutesPerMonth,
    infographicAllowed,
  },
};

export const adminGroupUpdateBody = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: groupId,
    name: { type: 'string', maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    color: { type: 'string', maxLength: 32 },
    meetingMinutesPerMonth,
    infographicAllowed,
  },
};

export const adminGroupDeleteBody = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: groupId },
};

/** Entrées et sorties d'un groupe, par adresse — les deux listes peuvent se cumuler. */
export const adminGroupMembersBody = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: groupId,
    add: { type: 'array', maxItems: 500, items: email },
    remove: { type: 'array', maxItems: 500, items: email },
  },
};

export const adminResetBody = {
  type: 'object',
  required: ['email'],
  additionalProperties: false,
  properties: { email, password, mustChangePassword: { type: 'boolean' } },
};

export const adminDeleteBody = {
  type: 'object',
  required: ['email'],
  additionalProperties: false,
  properties: {
    email,
    /**
     * Purge des données métier (réunions, templates perso, configuration).
     * Explicite dans le corps : l'écran d'administration exige une confirmation
     * par saisie de l'email avant de la poser.
     */
    purgeData: { type: 'boolean' },
  },
};

/** Champs communs à tout fournisseur OIDC configurable. */
const providerProperties = {
  enabled: { type: 'boolean' },
  clientId: { type: 'string', maxLength: 400 },
  // Omis ou vide = conserver le secret existant : le frontend ne le
  // reçoit jamais, il ne peut donc pas le renvoyer.
  clientSecret: { type: 'string', maxLength: 400 },
};

export const adminSettingsBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    google: {
      type: 'object',
      additionalProperties: false,
      properties: { ...providerProperties },
    },
    entra: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...providerProperties,
        // Annuaire du tenant. Modifiable ici parce qu'il ne dépend d'aucune
        // déclaration côté Entra — contrairement à l'URI de redirection.
        discoveryUrl: { type: 'string', maxLength: 500 },
      },
    },
    // Modes sans fournisseur natif : seul l'affichage se règle ici, leurs
    // identifiants (s'ils en ont) vivent ailleurs.
    passwordLogin: {
      type: 'object',
      additionalProperties: false,
      properties: { enabled: { type: 'boolean' } },
    },
    legacySso: {
      type: 'object',
      additionalProperties: false,
      properties: { enabled: { type: 'boolean' } },
    },
    allowedDomains: {
      type: 'array',
      maxItems: 200,
      items: { type: 'string', maxLength: 253 },
    },
  },
};

/**
 * Réglages IA. Les deux champs sont FACULTATIFS et ne se ressemblent pas :
 * absent = « ne touche pas », présent et vide = « efface, reviens au défaut ».
 * C'est ce qui permet de changer de modèle sans ressaisir la clé — et de
 * retirer la clé enregistrée pour revenir à celle du déploiement.
 *
 * Borne haute large sur la clé : les clés de projet dépassent déjà 160
 * caractères et OpenAI les a rallongées plusieurs fois.
 *
 * Le modèle est un `enum` fermé : OpenAI refuse tout autre identifiant à la
 * création de session, et l'échec se produirait chez l'utilisateur au premier
 * enregistrement, pas ici.
 */
export const adminAiSettingsBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    apiKey: { type: 'string', maxLength: 600 },
    transcriptionModel: { type: 'string', enum: ['', ...TRANSCRIPTION_MODELS] },
    // Modèle qui rédige le compte rendu. Liste FERMÉE alors que
    // /chat/completions accepterait n'importe quoi : une coquille ne
    // remonterait qu'à la génération, chez l'utilisateur (cf. summaryModels.js).
    summaryModel: { type: 'string', enum: ['', ...SUMMARY_MODELS] },
    // Infographie de compte rendu : proposer (ou non) la case « Générer une
    // infographie ». Booléen strict — absent = inchangé, comme les autres.
    infographicEnabled: { type: 'boolean' },
    // Charte graphique imposée aux infographies. Texte LIBRE : c'est une
    // consigne rédigée pour un modèle, aucune liste fermée ne la décrirait.
    // Vide = plus de style imposé, le modèle rechoisit sa palette.
    infographicStyle: { type: 'string', maxLength: INFOGRAPHIC_STYLE_MAX },
    // Modèle qui DESSINE l'infographie. Liste FERMÉE, comme la rédaction :
    // /images/generations accepterait la chaîne et n'échouerait qu'en tâche de
    // fond, chez l'utilisateur (cf. infographicModels.js).
    infographicImageModel: { type: 'string', enum: ['', ...INFOGRAPHIC_IMAGE_MODELS] },
  },
};

/**
 * Apparence de l'installation : logo (data-URL image), phrase d'accueil,
 * couleur primaire. Même contrat que les réglages IA : champ absent =
 * inchangé, champ présent mais vide = retour à la valeur intégrée.
 *
 * Le pattern du logo n'ancre que le préfixe : le corps base64 est borné par
 * `maxLength`, inutile (et coûteux) de le décrire caractère par caractère.
 */
export const adminBrandingSettingsBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    logo: {
      type: 'string',
      maxLength: BRANDING_LOGO_MAX,
      pattern: '^$|^data:image/(png|jpeg|jpg|webp|gif|svg\\+xml);base64,',
    },
    tagline: { type: 'string', maxLength: BRANDING_TAGLINE_MAX },
    taglineEn: { type: 'string', maxLength: BRANDING_TAGLINE_MAX },
    primaryColor: { type: 'string', pattern: '^$|^#[0-9a-fA-F]{6}$' },
    secondaryColor: { type: 'string', pattern: '^$|^#[0-9a-fA-F]{6}$' },
  },
};

/**
 * Vocabulaire et contexte de l'organisation (onglet Configuration).
 *
 * Un seul champ, même contrat que les autres réglages : absent = inchangé,
 * vide = plus aucun contexte joint aux résumés.
 */
export const adminOrgContextSettingsBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    context: { type: 'string', maxLength: ORG_CONTEXT_MAX },
  },
};

/**
 * Corrections automatiques de la transcription (onglet Configuration).
 *
 * La liste ENTIÈRE à chaque enregistrement ; absente = inchangée, vide = plus
 * aucune correction. Les plafonds sont refusés ici (400) plutôt que tronqués
 * en silence : l'écran les fait déjà respecter, un dépassement est un client
 * qui ne passe pas par lui. Le reste du nettoyage (espaces, doublons,
 * variante égale au mot juste) est fait sans erreur par
 * lib/transcriptCorrections.js.
 */
export const adminTranscriptCorrectionsBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rules: {
      type: 'array',
      maxItems: CORRECTIONS_MAX,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: {
          from: {
            type: 'array',
            maxItems: VARIANTS_MAX,
            items: { type: 'string', maxLength: TERM_MAX },
          },
          to: { type: 'string', maxLength: REPLACEMENT_MAX },
        },
      },
    },
  },
};

/**
 * Détection d'actions pendant la réunion — réglages d'un UTILISATEUR.
 *
 * Il n'y a plus de réglage d'installation : chaque compte décide de ce que la
 * détection cherche et à quel rythme, et un compte sans réglage vit les valeurs
 * intégrées.
 *
 * Contrat habituel : champ absent = inchangé, champ présent mais vide = retour
 * au défaut (`triggerWords: []` remet le seul mot « action »).
 *
 * Les bornes numériques sont posées ici ET re-appliquées à la lecture dans
 * lib/actionDetectionSettings.js : le schéma protège la saisie, la lecture
 * protège contre un document écrit autrement.
 */
export const userActionDetectionBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    enabled: { type: 'boolean' },
    sensitivity: { type: 'string', enum: ['', ...DETECTION_SENSITIVITIES] },
    triggerWords: {
      type: 'array',
      maxItems: DETECTION_TRIGGER_WORDS_MAX,
      items: { type: 'string', maxLength: DETECTION_TRIGGER_WORD_MAX },
    },
    allowUpdates: { type: 'boolean' },
    windowSize: { type: 'integer', minimum: DETECTION_WINDOW_MIN, maximum: DETECTION_WINDOW_MAX },
    minSentences: {
      type: 'integer',
      minimum: DETECTION_INTERVAL_MIN,
      maximum: DETECTION_INTERVAL_MAX,
    },
  },
};

/**
 * Corps du banc d'essai de la détection.
 *
 * `settings` porte les réglages AFFICHÉS à l'écran, enregistrés ou non : c'est
 * tout l'intérêt d'un banc d'essai — juger un changement avant de l'adopter.
 * L'essai n'a aucun effet de bord, contrairement à l'essai d'envoi de mail, qui
 * exige lui un enregistrement préalable parce qu'il produit un effet réel.
 *
 * Le vocabulaire de l'organisation n'y figure PAS : il vient du serveur, pas du
 * corps de la requête — un utilisateur juge SES réglages, il ne réécrit pas
 * ceux de l'organisation le temps d'un essai.
 */
export const userActionDetectionTestBody = {
  type: 'object',
  additionalProperties: false,
  required: ['content'],
  properties: {
    content: { type: 'string', maxLength: 20000 },
    // Code libre, normalisé par actionsPrompt (repli fr) : la borne suffit.
    language: { type: 'string', maxLength: 16 },
    settings: userActionDetectionBody,
  },
};

/**
 * Corps du test d'un modèle de transcription — celui qu'on s'apprête à choisir.
 * `null` accepté : sans corps, la route teste le modèle déjà enregistré (c'est
 * la forme qu'envoie le client quand il n'a rien à passer, cf. apiClient).
 */
export const adminTranscriptionTestBody = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: { model: { type: 'string', enum: TRANSCRIPTION_MODELS } },
};

/**
 * Test du modèle de RÉSUMÉ : un appel de chat minuscule sur le modèle choisi.
 * `model` absent = celui actuellement en vigueur, comme pour la transcription.
 */
export const adminSummaryModelTestBody = {
  // `null` accepté comme pour la transcription : c'est la forme qu'envoie le
  // client quand il n'a rien à passer (cf. apiClient).
  type: ['object', 'null'],
  additionalProperties: false,
  properties: { model: { type: 'string', enum: SUMMARY_MODELS } },
};

/** Visibilité des trois actions d'un contexte (après réunion / après résumé). */
const actionToggles = {
  type: 'object',
  additionalProperties: false,
  properties: {
    email: { type: 'boolean' },
    storage: { type: 'boolean' },
    download: { type: 'boolean' },
  },
};

/**
 * Actions proposées après chaque réunion et chaque génération de résumé.
 *
 * `connections.provider` désigne le fournisseur du compte que les utilisateurs
 * relient — le même sert au mail et au dépôt. `''` = aucun : le bouton
 * « Entreposer » n'apparaît alors pas, même coché.
 *
 * `connections.sharepoint` ne concerne que Microsoft : à faux, la liaison ne
 * demande plus `Sites.ReadWrite.All`, pour les annuaires qui refusent ce droit.
 * Absent du corps = inchangé (cf. lib/repositories/settings.js).
 *
 * `storage.provider` est l'ancien nom du même réglage, avec les anciennes
 * valeurs. Il reste accepté pour qu'une administration servie depuis un cache
 * (ou un onglet resté ouvert pendant le déploiement) ne casse pas ;
 * lib/repositories/settings.js les convertit.
 */
export const adminActionsSettingsBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    transcription: actionToggles,
    summary: actionToggles,
    connections: {
      type: 'object',
      additionalProperties: false,
      properties: {
        provider: { type: 'string', enum: ['', 'google', 'microsoft'] },
        sharepoint: { type: 'boolean' },
      },
    },
    storage: {
      type: 'object',
      additionalProperties: false,
      properties: {
        provider: { type: 'string', enum: ['', 'gdrive', 'sharepoint'] },
        folder: { type: 'string', maxLength: 500 },
      },
    },
    /**
     * Politique d'envoi de l'organisation.
     *
     * `maxRecipients` est borné ici ET à la lecture (mailPolicy dans
     * lib/repositories/settings.js) : le schéma protège la saisie, la lecture
     * protège contre un document écrit autrement.
     */
    mail: {
      type: 'object',
      additionalProperties: false,
      properties: {
        allowSmtpExternal: { type: 'boolean' },
        maxRecipients: { type: 'integer', minimum: 0, maximum: MAX_RECIPIENTS_CEILING },
        subjectTemplate: { type: 'string', maxLength: TEMPLATE_MAX },
      },
    },
    naming: {
      type: 'object',
      additionalProperties: false,
      properties: { filenameTemplate: { type: 'string', maxLength: TEMPLATE_MAX } },
    },
  },
};

/**
 * Réglages d'actions d'un UTILISATEUR. Ni interrupteur ni fournisseur : ce sont
 * des réglages d'organisation, et l'administration est un plafond — un
 * utilisateur affine dans ses limites, il ne les rouvre pas.
 *
 * Les longueurs ici sont des garde-fous de TRANSPORT : la règle métier (adresse
 * valide, plafond de destinataires, variables connues) est vérifiée ensuite,
 * pour renvoyer un slug précis plutôt qu'un `invalid_body` générique.
 */
export const userActionsSettingsBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mail: {
      type: 'object',
      additionalProperties: false,
      properties: {
        recipients: {
          type: 'array',
          maxItems: MAX_RECIPIENTS_CEILING,
          items: { type: 'string', maxLength: 320 },
        },
        subjectTemplate: { type: 'string', maxLength: TEMPLATE_MAX },
        // Destinataires propres à un tag. Ils REMPLACENT la liste ci-dessus
        // quand la conversation porte ce tag (cf. lib/actions/recipients.js).
        tagRecipients: {
          type: 'array',
          maxItems: TAG_RECIPIENTS_MAX,
          items: {
            type: 'object',
            required: ['tagId'],
            additionalProperties: false,
            properties: {
              tagId: { type: 'string', maxLength: 64 },
              recipients: {
                type: 'array',
                maxItems: MAX_RECIPIENTS_CEILING,
                items: { type: 'string', maxLength: 320 },
              },
            },
          },
        },
      },
    },
    storage: {
      type: 'object',
      additionalProperties: false,
      properties: {
        folder: { type: 'string', maxLength: 500 },
        // Bibliothèque OneDrive/SharePoint. Vide = le drive par défaut du
        // compte, seul cas qui existait avant SharePoint.
        driveId: { type: 'string', maxLength: 300 },
        driveName: { type: 'string', maxLength: 200 },
        requireApproval: { type: 'boolean' },
        tagSubfolders: { type: 'boolean' },
        tagFolders: {
          type: 'array',
          maxItems: TAG_FOLDERS_MAX,
          items: {
            type: 'object',
            required: ['tagId'],
            additionalProperties: false,
            properties: {
              tagId: { type: 'string', maxLength: 64 },
              folder: { type: 'string', maxLength: 500 },
              driveId: { type: 'string', maxLength: 300 },
              driveName: { type: 'string', maxLength: 200 },
            },
          },
        },
      },
    },
    naming: {
      type: 'object',
      additionalProperties: false,
      properties: { filenameTemplate: { type: 'string', maxLength: TEMPLATE_MAX } },
    },
    // Fenêtre « Et maintenant ? » après le premier résumé : une préférence
    // d'écran, pas une destination — elle ne décide de rien à l'envoi.
    afterSummary: {
      type: 'object',
      additionalProperties: false,
      properties: { offer: { type: 'boolean' } },
    },
  },
};

/**
 * Corps du bouton « Tester ». `scope: 'admin'` n'exerce que les valeurs
 * d'organisation, en ignorant la surcharge personnelle du demandeur — réservé
 * aux administrateurs.
 */
export const actionTestBody = {
  type: 'object',
  required: ['target'],
  additionalProperties: false,
  properties: {
    target: { type: 'string', enum: ['email', 'storage'] },
    kind: { type: 'string', enum: ['transcription', 'summary'] },
    lang: { type: 'string', enum: ['fr', 'en'] },
    scope: { type: 'string', enum: ['user', 'admin'] },
  },
};

export const adminListQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    q: { type: 'string', maxLength: 120 },
    limit: { type: 'integer', minimum: 1, maximum: 200 },
    skip: { type: 'integer', minimum: 0 },
    // Membres d'un seul groupe (écran des groupes, filtre de la liste).
    group: { type: 'string', maxLength: 64 },
  },
};

/**
 * Fenêtre de l'écran Statistiques. `enum` fermé plutôt qu'un intervalle : ces
 * cinq valeurs sont les boutons de l'écran (0 = depuis toujours), et une période
 * arbitraire n'ouvrirait qu'un scan plus large sans usage.
 */
export const adminStatsQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    days: { type: 'integer', enum: [7, 30, 90, 365, 0] },
    // Période choisie, jours entiers inclus — les deux ensemble (cf. statsWindow).
    from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    // Filtres : comparés en mémoire, jamais passés à Mongo.
    group: { type: 'string', maxLength: 64 },
    user: { type: 'string', maxLength: 320 },
    template: { type: 'string', maxLength: 120 },
  },
};

/**
 * Période de « Mes statistiques » : le mois du crédit, trois mois, douze mois,
 * depuis toujours — les quatre boutons de l'écran (cf. lib/personalStats.js).
 */
const personalRange = { type: 'string', enum: PERSONAL_RANGES };

export const personalStatsQuery = {
  type: 'object',
  additionalProperties: false,
  properties: { range: personalRange },
};

/**
 * Le compte d'un collègue, ouvert depuis Administration → Crédit de temps.
 * Dans le CORPS, comme les autres routes d'administration qui désignent un
 * compte : une adresse dans l'URL finirait dans les journaux d'accès.
 */
export const adminAccountStatsBody = {
  type: 'object',
  additionalProperties: false,
  required: ['email'],
  properties: {
    email: { type: 'string', minLength: 3, maxLength: 254 },
    range: personalRange,
  },
};
