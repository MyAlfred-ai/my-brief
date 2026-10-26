/**
 * Réglages d'actions PAR UTILISATEUR (collection `userActionSettings`).
 *
 * Un document par compte, qui affine les valeurs d'organisation posées dans
 * l'administration : destinataires du mail, dossier de dépôt, gabarits d'objet
 * et de nom de fichier. Les INTERRUPTEURS (activer/désactiver un bouton) ne sont
 * PAS ici : l'administration est un plafond, pas un défaut — un utilisateur ne
 * doit pas pouvoir rouvrir ce qu'elle a fermé.
 *
 * Le sous-document `detection` s'y ajoute, et il obéit à une autre règle : la
 * détection d'actions n'a PLUS de réglage d'installation (l'écran
 * d'administration a été déposé). Chaque compte règle la sienne, et un compte
 * sans document vit les valeurs intégrées — il n'y a rien au-dessus de lui.
 * Même collection parce que c'est le même objet : « les réglages de ce
 * compte », un seul document, un seul index, une seule contrainte d'unicité.
 *
 * Le sous-document `afterSummary` (`{ offer }`) est une préférence d'écran :
 * la fenêtre « Et maintenant ? » qui suit le PREMIER résumé d'une réunion
 * (components/AfterSummaryDialog.svelte). Vraie par défaut — la fenêtre est
 * le chemin le plus court vers le tag, le mail et le dépôt —, éteinte par
 * « Ne plus me proposer ». Sur le compte et non dans le navigateur : le choix
 * suit l'utilisateur d'un poste à l'autre, téléphone compris.
 *
 * Le sous-document `myBrain` (`{ enabled }`) suit la règle des actions : il
 * n'est lu que si l'administration laisse le choix à chacun — quand elle
 * impose l'envoi, ou le ferme, il ne compte pas (cf. lib/myBrain/feed.js).
 *
 * ── Pourquoi une collection, et pas un champ de plus sur `userConfig` ───────
 * `userConfig` est réécrit à zéro à chaque sauvegarde (`deleteMany` puis
 * `insertOne`, cf. routes/templates.js) : tout champ ajouté y serait effacé au
 * premier enregistrement du texte de contexte. Et ces réglages sont lus sur le
 * chemin CHAUD — à chaque envoi et à chaque dépôt — donc ils méritent leur index
 * et leur projection publique.
 *
 * ── Deux pièges dont ce fichier dépend ─────────────────────────────────────
 * 1. On n'upserte JAMAIS sur `ownerFilter()` : il renvoie un `$or`, dont Mongo
 *    ne dérive aucune égalité, et le document créé n'aurait ni `email` ni
 *    `emailLower`. Le filtre d'écriture est `{ emailLower }`, l'appartenance
 *    arrive par `$setOnInsert: ownerFields(email)` — même contournement que
 *    repositories/connections.js.
 * 2. Le sous-objet ne s'appelle pas `email` mais `mail` : `ownerFields()` écrit
 *    `email` comme CHAÎNE, et un `$set` sur `email.recipients` lèverait une
 *    erreur Mongo.
 */
import { ownerFilter, ownerFields } from '../ownerScope.js';
import { normalizeEmail } from './users.js';
import { normalizeActionDetection, mergeActionDetectionPatch } from '../actionDetectionSettings.js';
import {
  normalizeRecipients,
  DEFAULT_MAX_RECIPIENTS,
  MAX_RECIPIENTS_CEILING,
} from '../actions/recipients.js';
import { TEMPLATE_MAX } from '../actions/templating.js';

export const USER_ACTIONS_COLLECTION = 'userActionSettings';

/**
 * Tout vide par défaut : une valeur vide signifie « je n'ai rien décidé, prends
 * celle de l'organisation ». C'est ce qui rend le déploiement inerte — aucun
 * document n'existe, donc tous les replis rendent le comportement d'avant.
 */
const DEFAULTS = {
  mail: { recipients: [], subjectTemplate: '', tagRecipients: [] },
  storage: {
    folder: '',
    driveId: '',
    driveName: '',
    requireApproval: false,
    tagSubfolders: false,
    tagFolders: [],
  },
  naming: { filenameTemplate: '' },
  afterSummary: { offer: true },
};

/**
 * Fenêtre « Et maintenant ? » : seul un `false` EXPLICITE l'éteint. Un compte
 * sans document, ou écrit avant l'existence du réglage, la voit.
 */
const offerAfterSummary = (doc) => doc?.afterSummary?.offer !== false;

/** Chemin de dossier : borné, et jamais absolu (le fournisseur part de la racine du compte). */
export const FOLDER_MAX = 500;

/**
 * Au-delà, la liste de destinations par tag devient illisible — et le plafond
 * de tags par utilisateur est de toute façon plus bas (USER_TAGS_MAX = 20).
 */
export const TAG_FOLDERS_MAX = 40;

/**
 * Même plafond que les destinations, et pour la même raison : il borne le
 * document, jamais l'usage — `USER_TAGS_MAX` (20) le rend de toute façon
 * inatteignable.
 */
export const TAG_RECIPIENTS_MAX = 40;

function cleanFolder(value) {
  return String(value ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .slice(0, FOLDER_MAX);
}

/** Identifiant de bibliothèque (OneDrive/SharePoint). Vide = drive par défaut du compte. */
function cleanDriveId(value) {
  return String(value ?? '')
    .trim()
    .slice(0, 300);
}

/**
 * Destinations par tag : `{ tagId, folder, driveId, driveName }`.
 *
 * Le tag est référencé par son ID et non par son libellé : renommer « Acme » en
 * « Acme SA » ne doit pas détacher silencieusement sa destination. Les tags
 * eux-mêmes vivent dans `userTags` (cf. routes/tags.js) ; on ne recopie pas
 * leur libellé ici, qui divergerait au premier renommage.
 *
 * Un `folder` vide est CONSERVÉ : c'est une ligne que l'utilisateur a ouverte
 * dans l'écran mais n'a pas encore remplie, et la faire disparaître à
 * l'enregistrement serait déroutant.
 */
function cleanTagFolders(list) {
  if (!Array.isArray(list)) return [];
  const byTag = new Map();
  for (const entry of list) {
    const tagId = String(entry?.tagId ?? '')
      .trim()
      .slice(0, 64);
    if (!tagId) continue;
    byTag.set(tagId, {
      tagId,
      folder: cleanFolder(entry?.folder),
      driveId: cleanDriveId(entry?.driveId),
      driveName: String(entry?.driveName ?? '')
        .trim()
        .slice(0, 200),
    });
  }
  return [...byTag.values()].slice(0, TAG_FOLDERS_MAX);
}

/**
 * Destinataires par tag : `{ tagId, recipients: string[] }`.
 *
 * Le tag est référencé par son ID, pour la même raison que les destinations :
 * renommer « Acme » en « Acme SA » ne doit pas détacher silencieusement sa
 * liste d'adresses.
 *
 * ⚠️ Différence assumée avec `cleanTagFolders` : une liste VIDE est jetée, là
 * où un dossier vide est conservé. Un dossier vide est une ligne que
 * l'utilisateur a ouverte dans l'écran et n'a pas encore remplie ; une liste
 * d'adresses vide n'est pas une saisie en cours, c'est l'état « ce tag n'a pas
 * de destinataires à lui » — que l'absence d'entrée représente déjà, et que
 * `resolveRecipients` traite à l'identique.
 *
 * Les adresses sont re-normalisées ici : un document écrit par une version
 * antérieure du plafond, ou modifié directement en base, ne doit pas pouvoir le
 * contourner au moment de l'envoi.
 */
function cleanTagRecipients(list, { max = MAX_RECIPIENTS_CEILING } = {}) {
  if (!Array.isArray(list)) return [];
  const byTag = new Map();
  for (const entry of list) {
    const tagId = String(entry?.tagId ?? '')
      .trim()
      .slice(0, 64);
    if (!tagId) continue;
    const { recipients } = normalizeRecipients(entry?.recipients, { max });
    if (!recipients.length) continue;
    byTag.set(tagId, { tagId, recipients });
  }
  return [...byTag.values()].slice(0, TAG_RECIPIENTS_MAX);
}

function cleanTemplate(value) {
  return String(value ?? '')
    .trim()
    .slice(0, TEMPLATE_MAX);
}

/**
 * Projection sortante. Pas de secret ici — mais un seul point à relire pour
 * savoir ce qui sort, comme pour repositories/settings.js.
 */
export function toPublicUserActions(doc) {
  return {
    mail: {
      recipients: Array.isArray(doc?.mail?.recipients) ? doc.mail.recipients : [],
      subjectTemplate: doc?.mail?.subjectTemplate || '',
      tagRecipients: cleanTagRecipients(doc?.mail?.tagRecipients),
    },
    storage: {
      folder: doc?.storage?.folder || '',
      driveId: doc?.storage?.driveId || '',
      driveName: doc?.storage?.driveName || '',
      requireApproval: !!doc?.storage?.requireApproval,
      tagSubfolders: !!doc?.storage?.tagSubfolders,
      tagFolders: cleanTagFolders(doc?.storage?.tagFolders),
    },
    naming: { filenameTemplate: doc?.naming?.filenameTemplate || '' },
    afterSummary: { offer: offerAfterSummary(doc) },
    updatedAt: doc?.updatedAt || null,
  };
}

export function createUserActionsRepo(db) {
  const collection = () => db.collection(USER_ACTIONS_COLLECTION);

  return {
    toPublicUserActions,

    /**
     * Réglages d'un utilisateur, défauts compris.
     *
     * La lecture passe par `ownerFilter` (et non par `{emailLower}` seul) pour
     * couvrir un document qu'un backfill n'aurait pas encore atteint.
     *
     * Les destinataires sont RE-NORMALISÉS à la lecture : un document écrit par
     * une version antérieure du plafond, ou modifié directement en base, ne doit
     * pas pouvoir le contourner au moment de l'envoi.
     *
     * @param {string} email
     * @param {{maxRecipients?: number}} [policy]
     */
    async get(email, { maxRecipients = DEFAULT_MAX_RECIPIENTS } = {}) {
      const doc = await collection().findOne(ownerFilter(email));
      const { recipients } = normalizeRecipients(doc?.mail?.recipients, { max: maxRecipients });
      return {
        mail: {
          recipients,
          subjectTemplate:
            cleanTemplate(doc?.mail?.subjectTemplate) || DEFAULTS.mail.subjectTemplate,
          tagRecipients: cleanTagRecipients(doc?.mail?.tagRecipients, { max: maxRecipients }),
        },
        storage: {
          folder: cleanFolder(doc?.storage?.folder),
          driveId: cleanDriveId(doc?.storage?.driveId),
          driveName: String(doc?.storage?.driveName || ''),
          // Défaut FAUX, et c'est délibéré : le dépôt part déjà d'un clic
          // explicite de l'utilisateur sur « Déposer ». Poser une seconde
          // confirmation d'office ajouterait un geste à un chemin déjà
          // volontaire. L'approbation existe pour qui range dans un espace
          // PARTAGÉ, où l'on veut relire la destination avant qu'un collègue ne
          // découvre le document — c'est à lui de l'activer.
          requireApproval: !!doc?.storage?.requireApproval,
          tagSubfolders: !!doc?.storage?.tagSubfolders,
          tagFolders: cleanTagFolders(doc?.storage?.tagFolders),
        },
        naming: { filenameTemplate: cleanTemplate(doc?.naming?.filenameTemplate) },
        afterSummary: { offer: offerAfterSummary(doc) },
        updatedAt: doc?.updatedAt || null,
      };
    },

    /**
     * Fusionne un patch. Champ par champ : un patch qui ne touche que le dossier
     * ne doit pas vider la liste des destinataires.
     *
     * Les destinataires arrivent DÉJÀ normalisés (la route les a validés et a
     * nommé ce qu'elle refusait) — on ne les re-valide pas ici, on les stocke.
     *
     * @param {string} email
     * @param {{mail?: object, storage?: object, naming?: object,
     *   afterSummary?: {offer?: boolean}}} patch
     */
    async update(email, patch = {}) {
      const current = await this.get(email, { maxRecipients: MAX_RECIPIENTS_CEILING });

      const next = {
        mail: {
          recipients: Array.isArray(patch.mail?.recipients)
            ? patch.mail.recipients
            : current.mail.recipients,
          subjectTemplate:
            patch.mail?.subjectTemplate === undefined
              ? current.mail.subjectTemplate
              : cleanTemplate(patch.mail.subjectTemplate),
          // Même règle que `tagFolders` : un patch partiel reste partiel.
          // Régler le dossier d'un tag ne doit pas effacer ses destinataires.
          tagRecipients:
            patch.mail?.tagRecipients === undefined
              ? current.mail.tagRecipients
              : cleanTagRecipients(patch.mail.tagRecipients),
        },
        storage: {
          folder:
            patch.storage?.folder === undefined
              ? current.storage.folder
              : cleanFolder(patch.storage.folder),
          // La bibliothèque suit le dossier : choisir un dossier dans une AUTRE
          // bibliothèque sans mettre à jour `driveId` déposerait dans un chemin
          // homonyme de l'ancienne. Les deux arrivent donc ensemble depuis la
          // fenêtre de navigation.
          driveId:
            patch.storage?.driveId === undefined
              ? current.storage.driveId
              : cleanDriveId(patch.storage.driveId),
          driveName:
            patch.storage?.driveName === undefined
              ? current.storage.driveName
              : String(patch.storage.driveName).trim().slice(0, 200),
          requireApproval:
            patch.storage?.requireApproval === undefined
              ? current.storage.requireApproval
              : !!patch.storage.requireApproval,
          tagSubfolders:
            patch.storage?.tagSubfolders === undefined
              ? current.storage.tagSubfolders
              : !!patch.storage.tagSubfolders,
          tagFolders:
            patch.storage?.tagFolders === undefined
              ? current.storage.tagFolders
              : cleanTagFolders(patch.storage.tagFolders),
        },
        naming: {
          filenameTemplate:
            patch.naming?.filenameTemplate === undefined
              ? current.naming.filenameTemplate
              : cleanTemplate(patch.naming.filenameTemplate),
        },
        afterSummary: {
          offer:
            patch.afterSummary?.offer === undefined
              ? current.afterSummary.offer
              : patch.afterSummary.offer === true,
        },
        updatedAt: new Date().toISOString(),
      };

      await collection().updateOne(
        // Égalité, PAS `ownerFilter` : un `$or` ne fournit rien à l'upsert.
        { emailLower: normalizeEmail(email) },
        { $set: next, $setOnInsert: { ...ownerFields(email), createdAt: next.updatedAt } },
        { upsert: true },
      );
      return this.get(email, { maxRecipients: MAX_RECIPIENTS_CEILING });
    },

    // ── Détection d'actions en réunion ─────────────────────────────────────

    /**
     * Réglages de détection d'un compte, défauts compris.
     *
     * Lu sur le chemin CHAUD : une fois par analyse, donc plusieurs fois par
     * minute pendant une réunion. C'est l'index unique sur `emailLower` qui
     * rend cette lecture soutenable — et la raison pour laquelle ces réglages
     * ne sont pas allés grossir `userConfig`, réécrit à zéro à chaque
     * sauvegarde (cf. l'en-tête de ce fichier).
     *
     * Relu à CHAQUE appel, sans cache : même parti pris que la clé OpenAI. Un
     * réglage changé s'applique à la réunion en cours, sans redémarrage.
     *
     * @param {string} email
     */
    async getDetection(email) {
      const doc = await collection().findOne(ownerFilter(email));
      return normalizeActionDetection(doc?.detection);
    },

    /**
     * Fusionne un patch de détection. Champ absent = inchangé.
     *
     * @param {string} email
     * @param {object} patch
     */
    async updateDetection(email, patch = {}) {
      const detection = mergeActionDetectionPatch(await this.getDetection(email), patch);
      const updatedAt = new Date().toISOString();
      await collection().updateOne(
        // Égalité, PAS `ownerFilter` : un `$or` ne fournit rien à l'upsert.
        { emailLower: normalizeEmail(email) },
        {
          $set: { detection, updatedAt },
          $setOnInsert: { ...ownerFields(email), createdAt: updatedAt },
        },
        { upsert: true },
      );
      return detection;
    },

    // ── Envoi des réunions à myBrain ───────────────────────────────────────

    /**
     * Le choix du compte : envoyer ses réunions à myBrain, ou non. FAUX par
     * défaut, et c'est délibéré : une transcription de réunion n'entre dans le
     * cerveau partagé que par un geste de son auteur — ou parce que
     * l'administration l'impose (cf. lib/myBrain/feed.js), auquel cas ce
     * réglage n'est pas lu.
     *
     * `enabledSince` : le moment où le compte a ALLUMÉ l'envoi. Seules partent
     * les réunions commencées après — l'activer ne fait pas partir le passé.
     *
     * @param {string} email
     * @returns {Promise<{enabled: boolean, enabledSince: string|null}>}
     */
    async getMyBrain(email) {
      const doc = await collection().findOne(ownerFilter(email));
      const enabled = doc?.myBrain?.enabled === true;
      return {
        enabled,
        enabledSince: enabled ? doc.myBrain.enabledAt || doc.myBrain.updatedAt || null : null,
      };
    },

    /**
     * `enabledAt` n'est reposé qu'au passage de « non » à « oui » : réenregistrer
     * un « oui » ne décale pas le point de départ.
     *
     * @param {string} email
     * @param {{enabled: boolean}} patch
     */
    async updateMyBrain(email, { enabled }) {
      const updatedAt = new Date().toISOString();
      const turnedOn = enabled === true && !(await this.getMyBrain(email)).enabled;
      await collection().updateOne(
        // Égalité, PAS `ownerFilter` : un `$or` ne fournit rien à l'upsert.
        { emailLower: normalizeEmail(email) },
        {
          $set: {
            'myBrain.enabled': enabled === true,
            'myBrain.updatedAt': updatedAt,
            ...(turnedOn ? { 'myBrain.enabledAt': updatedAt } : {}),
            updatedAt,
          },
          $setOnInsert: { ...ownerFields(email), createdAt: updatedAt },
        },
        { upsert: true },
      );
      return this.getMyBrain(email);
    },
  };
}
