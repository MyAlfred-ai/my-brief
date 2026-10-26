/**
 * Résolution des paramètres d'une action — l'endroit UNIQUE où se décide qui
 * reçoit quoi, où, et sous quel nom.
 *
 * Chaîne, pour chaque champ : réglage de l'UTILISATEUR s'il en a posé un,
 * sinon celui de l'ORGANISATION, sinon la valeur intégrée. Les INTERRUPTEURS
 * font exception : ils viennent de l'administration et d'elle seule —
 * l'administration est un plafond, pas un défaut.
 *
 * ── Pourquoi une fonction, et pas du code dans les handlers ────────────────
 * Le bouton « Tester » doit exercer EXACTEMENT la chaîne de l'action réelle.
 * Un test qui résout ses paramètres par un autre chemin ne valide que ce
 * chemin-là — et laisse passer précisément le défaut qu'on cherchait. Seul
 * lib/actions/execute.js appelle cette fonction ; les deux routes passent par
 * lui.
 *
 * ── La couche « tag » ──────────────────────────────────────────────────────
 * Elle est ICI, entre l'utilisateur et l'administration, à l'emplacement que
 * l'en-tête de routes/tags.js annonçait. Elle porte DEUX règles, et une seule
 * mécanique : le DOSSIER où le document se range (`resolveFolder`) et les
 * DESTINATAIRES à qui il part (`resolveRecipients`). Dans les deux cas la règle
 * du tag REMPLACE celle du compte — elle ne s'y ajoute pas.
 *
 * Le tag n'arrive JAMAIS par le corps de la requête — seulement par le
 * `meetingId`, relu en base sous le scope du demandeur. C'est la même règle que
 * pour les destinataires (cf. l'en-tête de routes/actions/execute.js) : une
 * destination prise dans le corps serait à une CSRF près d'être choisie par un
 * tiers, et la branche multipart n'a pas d'ajv pour la retirer.
 */
import { resolveRecipients } from './recipients.js';
import { renderActionTemplate, renderFilenameTemplate } from './templating.js';
import { ownerFilter } from '../ownerScope.js';
import { TAGS_COLLECTION } from '../../routes/tags.js';

/**
 * Extension par défaut de chaque type de document.
 *
 * C'est un INDICE pour le gabarit, pas une vérité : l'extension réellement
 * appliquée est celle du fichier transmis (cf. `renamed` dans execute.js), car
 * elle doit décrire les octets et non l'intention.
 */
const EXTENSION = { summary: 'pdf', transcription: 'txt' };

/** Réglages personnels réputés absents — cf. `ignorePersonal` ci-dessous. */
const EMPTY_PERSONAL = {
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
};

/**
 * Tag de la conversation visée, relu en base sous le scope du demandeur.
 *
 * `null` dans tous les cas où il n'y a rien à ranger : pas de `meetingId`, une
 * conversation qui n'est pas la sienne, une conversation sans tag, ou un tag
 * supprimé depuis. Un tag introuvable ne fait donc jamais échouer un dépôt — il
 * le renvoie simplement vers le dossier par défaut.
 *
 * @returns {Promise<{id: string, label: string}|null>}
 */
async function meetingTag(app, { email, meetingId }) {
  if (!meetingId) return null;
  const meeting = await app.db
    .collection('resume')
    .findOne(ownerFilter(email, { meetingId }), { projection: { _id: 0, tagId: 1 } });
  const tagId = meeting?.tagId;
  if (!tagId) return null;
  // Scopé lui aussi : un `tagId` recopié d'un autre compte ne doit pas donner
  // accès à la destination de quelqu'un d'autre.
  const tag = await app.db
    .collection(TAGS_COLLECTION)
    .findOne(ownerFilter(email, { id: tagId }), { projection: { _id: 0, id: 1, label: 1 } });
  return tag ? { id: tag.id, label: tag.label || '' } : null;
}

/**
 * Une destination existe dès qu'elle nomme un chemin OU une bibliothèque.
 *
 * ⚠️ Ne tester que le chemin est le bug qui a fait déposer dans « Mon Drive »
 * des documents destinés à un Drive partagé : choisir la RACINE d'un Drive
 * partagé rend `folder: ''` avec un `driveId` renseigné, et la destination
 * était alors jetée sans un mot — l'écran comme le message de confirmation
 * affichaient le chemin de repli, qui existait bel et bien, ailleurs.
 *
 * Le chemin vide reste géré en aval par `folderSegments`, qui retombe sur le
 * dossier intégré plutôt que de déverser à la racine d'un Drive d'équipe.
 */
export const hasDestination = (storage) => !!(storage?.folder || storage?.driveId);

/**
 * Destination effective : tag, puis utilisateur, puis administration.
 *
 * Deux façons pour un tag de porter un dossier, et elles se cumulent mal — donc
 * elles sont ordonnées :
 *
 *   1. une destination EXPLICITE, choisie dans la fenêtre de navigation. Elle
 *      peut viser une autre bibliothèque (un site SharePoint dédié au client),
 *      d'où le `driveId` qui l'accompagne ;
 *   2. à défaut, et si l'utilisateur l'a demandé, un SOUS-DOSSIER au nom du tag
 *      sous le dossier de base — « un dossier par tag » sans avoir à en régler
 *      un par un.
 *
 * Sans tag, ou sans aucune des deux, la chaîne d'avant s'applique à
 * l'identique : réglage personnel, sinon organisation, sinon dossier intégré.
 */
function resolveFolder({ personal, admin, tag }) {
  const personalSet = hasDestination(personal.storage);
  const base = {
    // Le chemin et la bibliothèque forment UN couple : prendre le chemin de
    // l'administration en gardant la bibliothèque de l'utilisateur déposerait
    // le dossier de l'organisation dans le Drive partagé de la personne.
    path: personalSet ? personal.storage.folder : admin.storage.folder,
    driveId: personalSet ? personal.storage.driveId || '' : '',
    driveName: personalSet ? personal.storage.driveName || '' : '',
    source: personalSet ? 'user' : admin.storage.folder ? 'admin' : 'default',
  };
  if (!tag) return base;

  const mapped = (personal.storage.tagFolders || []).find((entry) => entry.tagId === tag.id);
  if (hasDestination(mapped)) {
    return {
      path: mapped.folder || '',
      driveId: mapped.driveId || '',
      driveName: mapped.driveName || '',
      source: 'tag',
    };
  }

  if (personal.storage.tagSubfolders && tag.label) {
    // Le libellé devient un segment de chemin : un « / » y créerait un niveau
    // fantôme, on le neutralise plutôt que de refuser le dépôt.
    const segment = tag.label.replace(/\//g, '-').trim();
    if (segment) {
      return { ...base, path: base.path ? `${base.path}/${segment}` : segment, source: 'tag' };
    }
  }

  return base;
}

/** Libellé de la variable `{{type}}`, dans la langue du document. */
const TYPE_LABEL = {
  fr: { summary: 'Résumé', transcription: 'Transcription' },
  en: { summary: 'Summary', transcription: 'Transcript' },
};

/**
 * Date du jour au format `AAAA-MM-JJ`, en heure LOCALE.
 *
 * Pas `toISOString()`, qui bascule en UTC : un envoi à 23 h à Paris porterait la
 * date du lendemain — même raison que `fileDatePart` côté client.
 */
export function todayPart(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Variables offertes aux gabarits pour un document donné.
 *
 * @param {{document: object, account: string}} params
 */
export function templateVars({ document, account }) {
  const lang = TYPE_LABEL[document.lang] ? document.lang : 'fr';
  return {
    titre: document.title || '',
    date: todayPart(),
    type: TYPE_LABEL[lang][document.kind] || '',
    compte: account || '',
  };
}

/**
 * Contexte complet d'une action.
 *
 * Chaque champ porte sa `source` : c'est ce qui rend le diagnostic du bouton
 * « Tester » lisible (« ce dossier vient de tes réglages », « cet objet vient de
 * l'organisation ») au lieu d'un simple oui/non.
 *
 * `ignorePersonal` n'existe que pour le bouton « Tester » d'un administrateur :
 * « ce que voit un utilisateur qui n'a rien réglé ». C'est un DRAPEAU sur cette
 * fonction, et surtout pas un second chemin de résolution — le jour où la
 * chaîne change, elle change pour les deux.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{user: object, document: object, ignorePersonal?: boolean}} params
 * @returns {Promise<{
 *   toggles: {email: boolean, storage: boolean, download: boolean},
 *   recipients: {to: string[], cc: string[], source: 'tag'|'user'|'account'},
 *   subject: {value: string, source: 'user'|'admin'|'builtin'},
 *   filename: {value: string|null, source: 'user'|'admin'|'builtin'},
 *   folder: {path: string, source: 'user'|'admin'|'default'},
 *   policy: {maxRecipients: number, allowSmtpExternal: boolean},
 *   provider: string,
 * }>}
 */
export async function resolveActionContext(app, { user, document, ignorePersonal = false }) {
  const admin = await app.settings.getActions();
  const policy = {
    maxRecipients: admin.mail.maxRecipients,
    allowSmtpExternal: admin.mail.allowSmtpExternal,
  };
  const personal = ignorePersonal
    ? EMPTY_PERSONAL
    : await app.userActions.get(user.email, { maxRecipients: policy.maxRecipients });

  const vars = templateVars({ document, account: user.email });

  const subjectTemplate = personal.mail.subjectTemplate || admin.mail.subjectTemplate;
  const subjectSource = personal.mail.subjectTemplate
    ? 'user'
    : admin.mail.subjectTemplate
      ? 'admin'
      : 'builtin';

  const filenameTemplate = personal.naming.filenameTemplate || admin.naming.filenameTemplate;
  const filenameSource = personal.naming.filenameTemplate
    ? 'user'
    : admin.naming.filenameTemplate
      ? 'admin'
      : 'builtin';

  const tag = ignorePersonal
    ? null
    : await meetingTag(app, { email: user.email, meetingId: document.meetingId });
  const folder = resolveFolder({ personal, admin, tag });

  return {
    toggles: admin[document.kind] || { email: false, storage: false, download: false },
    recipients: resolveRecipients({
      stored: personal.mail.recipients,
      // Liste du tag, s'il en porte une. Absente ⇒ `undefined`, et la couche
      // suivante s'applique — un tag sans destinataires ne prive personne.
      tagStored: tag
        ? (personal.mail.tagRecipients || []).find((entry) => entry.tagId === tag.id)?.recipients
        : null,
      account: user.email,
      max: policy.maxRecipients,
    }),
    // Chaîne vide ⇒ buildDocumentEmail garde son objet intégré. C'est ce qui
    // rend le déploiement inerte tant que personne n'a écrit de gabarit.
    subject: { value: renderActionTemplate(subjectTemplate, vars), source: subjectSource },
    filename: {
      value: renderFilenameTemplate(filenameTemplate, vars, {
        ext: EXTENSION[document.kind] || 'txt',
      }),
      source: filenameSource,
    },
    folder,
    /** Le tag qui a décidé du dossier — affiché dans l'écran d'approbation. */
    tag,
    /**
     * L'approbation est un réglage PERSONNEL : elle n'a de sens que pour qui
     * range dans un espace partagé. `ignorePersonal` (bouton « Tester » d'un
     * administrateur) la met donc à faux, comme tout le reste du personnel.
     */
    requireApproval: !!personal.storage.requireApproval,
    policy,
    provider: admin.connections.provider,
  };
}
