/**
 * Préparation de la base au démarrage : index, migrations, compte admin de
 * bootstrap. Tout est idempotent — la fonction tourne à chaque boot.
 *
 * Remplace le bloc d'index qui vivait dans server.js.
 */
import { hashPassword } from './auth/password.js';
import { normalizeEmail, SERVED_ACCOUNT } from './repositories/users.js';
import { createGroupsRepo, DEFAULT_GROUP_ID, GROUPS_COLLECTION } from './repositories/groups.js';
import { createSettingsRepo } from './repositories/settings.js';
import { USER_ACTIONS_COLLECTION } from './repositories/userActions.js';
import { MAIL_LOG_COLLECTION, MAIL_LOG_TTL_SECONDS } from './actions/mailLog.js';
import { backfillOwnerEmails } from './ownerScope.js';
import { DELETED_USAGE_COLLECTION } from './quota.js';
import { INFOGRAPHICS_COLLECTION } from './infographic.js';
import { sanitizeDuration, durationFromSummary } from './meetingDuration.js';
import { legacyVersionOf, WITHOUT_VERSIONS } from './legacyVersion.js';

const noopLogger = { info() {}, warn() {}, error() {} };

/**
 * Index. Celui sur `user.emailLower` est UNIQUE mais PARTIEL : les documents
 * historiques qui n'ont pas encore de champ `emailLower` en sont exclus, donc
 * sa création ne peut pas échouer sur des doublons de casse préexistants. Le
 * backfill les révèle ensuite un par un, proprement.
 */
async function ensureIndexes(db, log) {
  try {
    await db.collection('resume').createIndex({ meetingId: 1 });
    await db.collection('resume').createIndex({ email: 1, now: -1 });
    await db.collection('userTemplates').createIndex({ email: 1, value: 1 });

    // Pendants sur `emailLower` : c'est la branche que `ownerFilter` interroge
    // en premier. Sans eux, l'historique deviendrait un balayage de collection.
    await db.collection('resume').createIndex({ emailLower: 1, now: -1 });
    await db.collection('userTemplates').createIndex({ emailLower: 1, value: 1 });
    await db.collection('userConfig').createIndex({ emailLower: 1 });

    // Envois à myBrain : la boucle de relance cherche toutes les dix minutes
    // les échecs dont l'heure est venue. PARTIEL — seules les réunions qui ont
    // un état d'envoi y figurent : sans lui, chaque passage balaierait toute la
    // collection, transcriptions comprises.
    await db
      .collection('resume')
      .createIndex(
        { 'myBrain.status': 1, 'myBrain.nextAttemptAt': 1 },
        { partialFilterExpression: { 'myBrain.status': { $exists: true } } },
      );

    // Tags : lecture par propriétaire triée sur `labelLower` (l'ordre du
    // sélecteur), et résolution d'un tag précis par son `id` — le chemin de
    // /tags/save et /tags/delete.
    await db.collection('userTags').createIndex({ emailLower: 1, labelLower: 1 });
    await db.collection('userTags').createIndex({ emailLower: 1, id: 1 });

    await db.collection('user').createIndex({ email: 1 });
    await db
      .collection('user')
      .createIndex(
        { emailLower: 1 },
        { unique: true, partialFilterExpression: { emailLower: { $type: 'string' } } },
      );
    // Groupes : l'appartenance vit sur le compte (index multikey — « les
    // membres du groupe X » est la lecture de l'écran d'administration), et le
    // catalogue se résout par `id`, l'identifiant que porte chaque compte.
    await db.collection('user').createIndex({ groupIds: 1 });
    await db.collection(GROUPS_COLLECTION).createIndex({ id: 1 }, { unique: true });

    await db.collection('authSession').createIndex({ tokenHash: 1 }, { unique: true });
    await db.collection('authSession').createIndex({ emailLower: 1 });
    await db.collection('authSession').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    await db.collection('authResetToken').createIndex({ tokenHash: 1 }, { unique: true });
    await db.collection('authResetToken').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    await db.collection('authOAuthState').createIndex({ state: 1 }, { unique: true });
    await db.collection('authOAuthState').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    await db.collection('appSettings').createIndex({ key: 1 }, { unique: true });

    // Connexions mail : `emailLower` est la clé de recherche (chaque
    // /mail/settings, chaque envoi) ET la clé d'unicité — l'upsert de
    // `setGoogle` n'était protégé d'aucune course sans cet index.
    await db.collection('userMailAccounts').createIndex({ emailLower: 1 }, { unique: true });

    // Comptes externes reliés : un document par (utilisateur, fournisseur).
    // L'unicité protège l'upsert de `connections.set` d'une double soumission
    // du callback OAuth.
    await db
      .collection('userConnections')
      .createIndex({ emailLower: 1, provider: 1 }, { unique: true });

    // Réglages d'actions par utilisateur : un document par compte, lu à CHAQUE
    // envoi et à chaque dépôt. Unique sans risque — la collection est neuve, il
    // n'y a aucun doublon préexistant à dédoublonner d'abord (contrairement à
    // userMailAccounts, cf. dedupeMailAccounts).
    await db.collection(USER_ACTIONS_COLLECTION).createIndex({ emailLower: 1 }, { unique: true });

    // Piste d'audit des envois : purge automatique par Mongo. C'est ce TTL qui
    // fait la différence entre une trace d'exploitation et un fichier de
    // destinataires conservé indéfiniment.
    await db
      .collection(MAIL_LOG_COLLECTION)
      .createIndex({ at: 1 }, { expireAfterSeconds: MAIL_LOG_TTL_SECONDS });
    await db.collection(MAIL_LOG_COLLECTION).createIndex({ emailLower: 1, at: -1 });

    // Minutes des réunions supprimées : chaque trace s'efface à la fin du mois
    // de sa réunion, quand elle cesse de compter (cf. lib/quota.js). C'est ce
    // TTL qui fait d'une réunion supprimée une réunion qui ne laisse RIEN, le
    // mois passé. Il borne aussi la collection à un mois de suppressions : la
    // lecture du quota la parcourt sans autre index.
    await db
      .collection(DELETED_USAGE_COLLECTION)
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // Infographies : interrogées par réunion (`ownerFilter(email, {meetingId})`),
    // à chaque sondage de l'écran tant que l'image se génère. Même index que
    // `resume.meetingId`, qui sert les deux branches du `$or`. Non unique : une
    // base peut déjà porter un doublon né d'une génération concurrente.
    await db.collection(INFOGRAPHICS_COLLECTION).createIndex({ meetingId: 1 });
  } catch (err) {
    // FAIL-FAST. L'ancien `warn` non bloquant laissait une production démarrer
    // sans index : /history dégénérait en balayage de collection et l'unicité
    // d'emailLower n'était plus garantie — silencieusement. Un crash-loop
    // Docker se voit ; une base non indexée, non.
    log.error(`[api] création d'index en échec — arrêt : ${err.message}`);
    throw err;
  }
}

/**
 * Supprime les connexions mail en doublon avant que l'index unique ne les
 * rencontre — sans quoi sa création échouerait et, `ensureIndexes` étant
 * fail-fast, mettrait l'API en crash-loop.
 *
 * Le doublon vient de l'upsert de `setGoogle`, qui n'était protégé d'aucune
 * course tant que l'index n'existait pas. On garde le document le plus récent :
 * c'est la connexion que l'utilisateur a autorisée en dernier, donc celle dont
 * le refresh token est vivant. Les autres sont supprimés sans révocation —
 * révoquer un jeton révoque le grant entier du compte Google, ce qui tuerait
 * précisément la connexion qu'on conserve.
 *
 * Contrairement aux comptes en doublon de casse (`warnDuplicateEmails`), il n'y
 * a rien à arbitrer ici : ce sont deux enregistrements du même consentement.
 */
export async function dedupeMailAccounts(db, log) {
  try {
    const dups = await db
      .collection('userMailAccounts')
      .aggregate([
        { $group: { _id: '$emailLower', count: { $sum: 1 }, ids: { $push: '$_id' } } },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();
    let removed = 0;
    for (const dup of dups) {
      // `_id` ObjectId est monotone : le plus grand est le plus récemment créé.
      const sorted = [...dup.ids].sort((a, b) => String(a).localeCompare(String(b)));
      const stale = sorted.slice(0, -1);
      const res = await db.collection('userMailAccounts').deleteMany({ _id: { $in: stale } });
      removed += res?.deletedCount || 0;
    }
    if (removed > 0) log.warn(`[api] ${removed} connexion(s) mail en doublon supprimée(s)`);
    return removed;
  } catch (err) {
    log.warn(`[api] déduplication des connexions mail impossible : ${err.message}`);
    return 0;
  }
}

/**
 * Scopes des connexions Gmail antérieures à la généralisation.
 *
 * Elles n'enregistraient pas ce qu'elles avaient obtenu : c'était forcément
 * ceci, le flux ne demandait rien d'autre. Le scope Drive en est absent À
 * DESSEIN — ces connexions continuent d'envoyer des mails sans que
 * l'utilisateur ait à re-consentir, et n'obtiendront le dépôt Drive qu'à leur
 * prochaine reconnexion. Prétendre le contraire produirait un bouton
 * « Entreposer » qui échouerait au premier clic.
 */
const LEGACY_GMAIL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];

/**
 * Reprend les connexions Gmail dans la collection généralisée `userConnections`.
 *
 * Copie et non renommage de collection : `renameCollection` exige un privilège
 * `dbAdmin` que rien ne garantit sur les bases clientes, alors qu'une copie ne
 * demande que les droits d'écriture ordinaires. L'ancienne collection est
 * laissée en place — filet de retour arrière tant que la bascule n'est pas
 * éprouvée en recette ; elle sera supprimée dans un second temps.
 *
 * Idempotent par la condition d'entrée : dès que `userConnections` contient
 * quelque chose, on ne touche plus à rien.
 *
 * @returns {Promise<number>} nombre de connexions reprises
 */
export async function migrateMailAccountsToConnections(db, log) {
  try {
    if ((await db.collection('userConnections').countDocuments({})) > 0) return 0;

    const legacy = await db.collection('userMailAccounts').find({}).toArray();
    const docs = legacy
      .filter((doc) => doc.emailLower && doc.refreshToken)
      .map((doc) => ({
        emailLower: doc.emailLower,
        provider: doc.provider || 'google',
        account: doc.account || '',
        refreshToken: doc.refreshToken,
        scopes: LEGACY_GMAIL_SCOPES,
        drive: null,
        createdAt: doc.createdAt || new Date().toISOString(),
        updatedAt: doc.updatedAt || new Date().toISOString(),
      }));
    if (!docs.length) return 0;

    await db.collection('userConnections').insertMany(docs);
    log.info(`[api] ${docs.length} connexion(s) mail reprise(s) dans userConnections`);
    return docs.length;
  } catch (err) {
    // Non bloquant : sans reprise, les utilisateurs concernés voient « non
    // connecté » et peuvent relier leur compte à nouveau. Faire tomber l'API
    // priverait tout le monde du service pour un incident qui n'en mérite pas
    // tant.
    log.warn(`[api] reprise des connexions mail impossible : ${err.message}`);
    return 0;
  }
}

/**
 * Reprend le « vocabulaire et contexte de l'organisation » là où il est
 * désormais réglé : l'onglet Configuration de l'administration.
 *
 * Il vivait dans les réglages de la détection d'actions, où il ne servait qu'au
 * prompt de détection. Il vaut pour toute génération de résumé, donc il change
 * d'écran — et une installation qui l'avait rempli ne doit pas le perdre en
 * déployant cette version, sans quoi ses sigles et ses noms de clients
 * disparaissent des comptes rendus sans un mot.
 *
 * Idempotent par la condition d'entrée : dès qu'un document `orgContext`
 * existe, on ne touche plus à rien — y compris s'il a été vidé exprès.
 *
 * @returns {Promise<boolean>} true si la reprise a eu lieu
 */
export async function migrateBusinessContextToOrgContext(db, log) {
  try {
    const settings = db.collection('appSettings');
    if (await settings.findOne({ key: 'orgContext' })) return false;
    const detection = await settings.findOne({ key: 'actionDetection' });
    const context = String(detection?.businessContext || '').trim();
    if (!context) return false;
    const now = new Date().toISOString();
    await settings.updateOne(
      { key: 'orgContext' },
      {
        $set: { context, updatedAt: now, updatedBy: detection?.updatedBy || null },
        $setOnInsert: { key: 'orgContext', createdAt: now },
      },
      { upsert: true },
    );
    log.info("[api] contexte de l'organisation repris depuis les réglages de détection");
    return true;
  } catch (err) {
    // Non bloquant : sans reprise, un administrateur ressaisit le texte dans
    // l'onglet Configuration. Faire tomber l'API pour un champ de confort priverait
    // tout le monde du service.
    log.warn(`[api] reprise du contexte d'organisation impossible : ${err.message}`);
    return false;
  }
}

/**
 * Supprime les comptes SANS ADRESSE : ni `email` ni `emailLower` exploitable.
 *
 * Héritage n8n : son /init remplaçait le document `user` désigné par l'en-tête
 * `x-user-email`, en upsert, et son nœud Mongo écrivait `null` pour tout champ
 * absent. Une requête arrivée sans l'en-tête laissait un compte
 * `{ email: null, name: null }`. Relevé en production (2026-09) : une
 * ligne « null » dans l'administration, impossible à modifier ou à supprimer —
 * ces routes désignent un compte par son adresse, que leur schéma exige valide.
 * Sans accès SSH à la machine du client, rien d'autre ne pouvait l'en retirer.
 *
 * Personne ne s'en est jamais servi, et rien ne le peut : connexion, session et
 * identité par en-têtes cherchent toutes une adresse non vide, et
 * `backfillEmailLower` le saute.
 *
 * Deux gardes :
 *   - SEUL le document `user` part, jamais `purgeUserData` : le filtre de purge
 *     d'une adresse nulle contient `{ email: null }`, qui retrouve dans chaque
 *     collection métier TOUT document dépourvu d'email ;
 *   - rien ne part si la collection ne compte aucun autre compte : `seedAdmin`
 *     la lirait vidée comme une base vierge, et y créerait le compte d'amorçage
 *     au mot de passe par défaut.
 *
 * Chaque suppression est journalisée avec son `_id`, pour la retrouver dans la
 * sauvegarde prise avant chaque déploiement.
 *
 * @returns {Promise<number>} nombre de comptes supprimés
 */
export async function removeAddresslessUsers(db, log) {
  try {
    const users = db.collection('user');
    // Tout compte doté d'une adresse reçoit `emailLower` au backfill : les
    // candidats sont parmi ceux qui n'en ont pas. L'adresse brute est revérifiée
    // ensuite — un compte historique pas encore backfillé en a une.
    const candidates = await users
      .find({ $or: [{ emailLower: { $exists: false } }, { emailLower: { $in: [null, ''] } }] })
      .project({ _id: 1, email: 1, emailLower: 1, role: 1 })
      .toArray();
    const orphans = candidates.filter(
      (doc) => !normalizeEmail(doc.email) && !normalizeEmail(doc.emailLower),
    );
    if (orphans.length === 0) return 0;

    if ((await users.countDocuments({})) <= orphans.length) {
      log.warn(
        `[api] ${orphans.length} compte(s) sans adresse CONSERVÉ(S) : la base ne contient aucun ` +
          "autre compte, et vidée elle serait prise pour une base vierge (compte d'amorçage).",
      );
      return 0;
    }

    let removed = 0;
    for (const doc of orphans) {
      const res = await users.deleteOne({ _id: doc._id });
      if (!res?.deletedCount) continue;
      removed += 1;
      log.warn(
        `[api] compte sans adresse supprimé (_id ${doc._id}, rôle ${doc.role ?? '(sans rôle)'}) — ` +
          "héritage n8n, inaccessible et impossible à gérer depuis l'administration",
      );
    }
    return removed;
  } catch (err) {
    // Non bloquant : un compte fantôme ne justifie pas de priver tout le monde
    // du service.
    log.warn(`[api] suppression des comptes sans adresse impossible : ${err.message}`);
    return 0;
  }
}

/**
 * Plusieurs comptes pour une même adresse : on ne tranche pas à leur place, on
 * les nomme dans les logs pour qu'un humain fusionne.
 *
 * DEUX situations distinctes, que ce message confondait — il annonçait
 * invariablement un « doublon de casse ». Relevé sur la recette : deux comptes
 * dont les adresses sont IDENTIQUES octet pour octet, signalés comme différant
 * par la casse. L'exploitant cherchait alors une différence de majuscules qui
 * n'existait pas, sur le message que son déploiement imprime à chaque
 * démarrage.
 *
 * On dit donc lequel des deux cas on a, et surtout LEQUEL DES DOCUMENTS SERT :
 * `backfillEmailLower` procède un par un pour qu'un doublon échoue seul (E11000
 * sur l'index unique partiel), si bien qu'un seul document reçoit `emailLower`.
 * C'est celui-là que `findByEmail` retrouve — les autres sont inertes, et le
 * resteront : l'index continuera de les rejeter à chaque démarrage. Leur rôle
 * est donc sans effet, ce qui explique qu'un compte affiché `user` puisse
 * cohabiter avec l'`admin` réellement en service.
 *
 * Les données métier ne sont PAS partagées entre ces documents : elles sont
 * rattachées par `emailLower` (cf. lib/ownerScope.js), que le doublon ne touche
 * pas. Un doublon ne coupe donc jamais un historique en deux.
 *
 * L'administration ne montre plus les documents inertes (`SERVED_ACCOUNT`,
 * lib/repositories/users.js) : ils y dédoublaient la personne, et leurs
 * boutons agissaient sur le compte servi. Supprimer le compte les emporte.
 * On ne les supprime toujours pas ICI : ils ne gênent plus rien, et un humain
 * peut encore vouloir y relire quelque chose avant de fusionner.
 */
export async function warnDuplicateEmails(db, log) {
  try {
    const dups = await db
      .collection('user')
      .aggregate([
        {
          $group: {
            _id: { $toLower: '$email' },
            count: { $sum: 1 },
            emails: { $push: '$email' },
            // Le document qui porte `emailLower` est celui que l'application
            // sert ; le compter distingue « à fusionner » de « déjà tranché ».
            servis: { $sum: { $cond: [{ $ifNull: ['$emailLower', false] }, 1, 0] } },
            roles: { $push: { $ifNull: ['$role', '(sans rôle)'] } },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();
    for (const dup of dups) {
      const memeCasse = new Set(dup.emails).size === 1;
      const nature = memeCasse
        ? `${dup.count} comptes à l'adresse EXACTEMENT identique`
        : `comptes en doublon de casse (${dup.emails.join(', ')})`;
      log.warn(
        `[api] ${nature} pour ${dup._id} — rôles ${dup.roles.join(', ')} ; ` +
          `${dup.servis} porte(nt) emailLower et sert/servent l'application, ` +
          `${dup.count - dup.servis} inerte(s) et le resteront (index unique). ` +
          `Les réunions sont rattachées par emailLower : aucune n'est perdue ni scindée. ` +
          `À fusionner manuellement — supprimer le ou les documents inertes.`,
      );
    }
    return dups.length;
  } catch (err) {
    log.warn(`[api] détection des doublons impossible (non bloquant) : ${err.message}`);
    return 0;
  }
}

/**
 * Groupe par défaut et appartenance des comptes existants.
 *
 * Deux gestes, dans cet ordre : créer le groupe « Défaut » s'il manque
 * (idempotent, un renommage survit au démarrage suivant), puis inscrire dedans
 * tout compte antérieur au champ `groupIds` — ou dont le tableau est vide.
 * Sans ce second geste, l'invariant « un compte est toujours dans au moins un
 * groupe » ne tiendrait qu'à la lecture (`normalizeGroupIds`) : la liste des
 * membres du groupe par défaut, qui interroge l'index, ne verrait pas les
 * comptes historiques, et l'écran annoncerait un effectif faux.
 *
 * Non bloquant : sans lui, l'administration voit des effectifs incomplets,
 * personne ne perd l'accès au service.
 *
 * @returns {Promise<{created: boolean, backfilled: number}>}
 */
export async function seedDefaultGroup(db, log) {
  try {
    const created = await createGroupsRepo(db).ensureDefault();
    if (created) log.info('[api] groupe par défaut créé');
    const res = await db.collection('user').updateMany(
      {
        $or: [{ groupIds: { $exists: false } }, { groupIds: null }, { groupIds: { $size: 0 } }],
      },
      { $set: { groupIds: [DEFAULT_GROUP_ID] } },
    );
    const backfilled = res?.modifiedCount || 0;
    if (backfilled > 0)
      log.info(`[api] ${backfilled} compte(s) inscrit(s) dans le groupe par défaut`);
    return { created, backfilled };
  } catch (err) {
    log.warn(`[api] groupe par défaut impossible à préparer : ${err.message}`);
    return { created: false, backfilled: 0 };
  }
}

/**
 * Documents `user` sans `emailLower` exploitable : absent, `null` (le nœud Mongo
 * de n8n écrivait `null` pour tout champ absent) ou vide. Les deux formes, parce
 * que Mongo compte un champ absent dans `{ $in: [null] }`, et pas le faux des
 * tests.
 */
const WITHOUT_EMAIL_LOWER = [
  { emailLower: { $exists: false } },
  { emailLower: { $in: [null, ''] } },
];

/**
 * Renseigne `emailLower` sur les documents historiques. Fait un par un et non
 * en updateMany : un doublon de casse doit faire échouer CE document-là (E11000
 * logué) sans bloquer les autres.
 *
 * `null` et vide comptent comme absents : un tel document restait sans clé,
 * donc introuvable à la connexion, et la première connexion SSO recréait un
 * compte à côté de lui.
 *
 * Une adresse déjà servie par un autre document n'est pas retentée : le
 * document est un doublon inerte (cf. `warnDuplicateEmails`, qui le signale),
 * et l'écriture échouerait sur l'index unique à chaque démarrage. Le filtre
 * d'écriture exige l'absence de clé : il vise le doublon, jamais le compte
 * servi de même adresse.
 */
export async function backfillEmailLower(db, log) {
  const users = db.collection('user');
  const legacy = await users
    .find({ $or: WITHOUT_EMAIL_LOWER })
    .project({ _id: 0, email: 1 })
    .toArray();
  let done = 0;
  for (const doc of legacy) {
    const emailLower = normalizeEmail(doc.email);
    if (!emailLower) continue;
    if (await users.findOne({ emailLower })) continue;
    try {
      await users.updateOne(
        { email: doc.email, $or: WITHOUT_EMAIL_LOWER },
        { $set: { emailLower } },
      );
      done += 1;
    } catch (err) {
      log.warn(`[api] backfill emailLower impossible pour ${doc.email} : ${err.message}`);
    }
  }
  if (done > 0) log.info(`[api] emailLower renseigné sur ${done} compte(s)`);
  return done;
}

/**
 * Renseigne `transcriptionChars` sur les réunions antérieures à sa persistance
 * (2026-08-18, cf. routes/meetings.js).
 *
 * Sans ce passage, l'écran Statistiques affiche « 0 » de texte transcrit sur
 * une base pleine de transcriptions : la donnée EST là, seul son compteur
 * manquait, et la longueur se recalcule exactement. La durée se rattrape elle
 * aussi, mais autrement — voir `backfillDurationsFromSummaries` juste après.
 *
 * Le calcul se fait DANS Mongo (`$strLenCP` en pipeline de mise à jour) : lire
 * les transcriptions pour les mesurer côté API ferait transiter plusieurs
 * centaines de Mo au démarrage, pour un entier par document.
 *
 * Idempotent par son filtre : seuls les documents sans le champ sont touchés,
 * donc le boot suivant ne fait rien.
 */
async function backfillTranscriptionSize(db, log) {
  try {
    const res = await db
      .collection('resume')
      .updateMany({ transcriptionChars: { $exists: false }, transcription: { $type: 'string' } }, [
        { $set: { transcriptionChars: { $strLenCP: '$transcription' } } },
      ]);
    const done = res?.modifiedCount || 0;
    if (done > 0) log.info(`[api] transcriptionChars calculé sur ${done} réunion(s)`);
    return done;
  } catch (err) {
    // Jamais bloquant : c'est un confort de statistiques, pas une contrainte
    // d'intégrité. Un serveur Mongo trop ancien pour les pipelines de mise à
    // jour (< 4.2) ne doit pas empêcher l'API de démarrer.
    log.warn(`[api] backfill transcriptionChars impossible : ${err.message}`);
    return 0;
  }
}

/**
 * Récupère la durée des réunions antérieures à sa persistance, en la relisant
 * DANS LE COMPTE-RENDU — les gabarits y impriment « Durée : 01:23:45 »
 * (cf. lib/meetingDuration.js).
 *
 * Ce n'est pas une estimation : c'est le chronomètre du jour de la réunion, qui
 * était passé au prompt et imprimé par le modèle. Sans ce passage, l'écran
 * Statistiques reste sans aucune durée jusqu'à ce que l'historique ait
 * entièrement tourné.
 *
 * Contrairement au backfill de `transcriptionChars`, celui-ci ne peut pas se
 * faire par pipeline : il demande une expression régulière tolérante que
 * `$regexFind` rendrait illisible. Il lit donc les résumés — d'où le PLAFOND par
 * démarrage : au pire quelques dizaines de Mo lus une fois, et la suite au boot
 * suivant. `meetingDurationSource` sert de marqueur : une réunion dont le
 * compte-rendu ne porte aucune durée est notée `unknown` et n'est plus relue.
 */
const DURATION_BACKFILL_MAX = 500;

async function backfillDurationsFromSummaries(db, log) {
  try {
    const pending = await db
      .collection('resume')
      .find({ meetingDurationSource: { $exists: false }, meetingId: { $type: 'string' } })
      .project({ _id: 0, meetingId: 1, resume: 1, meetingDuration: 1 })
      .limit(DURATION_BACKFILL_MAX)
      .toArray();
    if (pending.length === 0) return 0;

    let recovered = 0;
    for (const doc of pending) {
      // Une durée déjà en base (réunion récente) fait autorité : on ne la
      // remplace pas, on se contente de la marquer pour ne plus la relire.
      const known = sanitizeDuration(doc.meetingDuration);
      const found = known ?? durationFromSummary(doc.resume);
      const source = known ? 'timer' : found ? 'resume' : 'unknown';
      await db
        .collection('resume')
        .updateOne(
          { meetingId: doc.meetingId },
          { $set: { meetingDuration: found, meetingDurationSource: source } },
        );
      if (!known && found) recovered += 1;
    }

    if (recovered > 0)
      log.info(`[api] durée retrouvée dans le compte-rendu de ${recovered} réunion(s)`);
    if (pending.length === DURATION_BACKFILL_MAX)
      log.info('[api] durées : lot plafonné, la suite au prochain démarrage');
    return recovered;
  } catch (err) {
    // Confort de statistiques : jamais bloquant pour le démarrage.
    log.warn(`[api] récupération des durées impossible : ${err.message}`);
    return 0;
  }
}

/**
 * Inscrit leur version aux comptes rendus qui n'en ont pas — les réunions du
 * pipeline n8n, surtout (cf. lib/legacyVersion.js).
 *
 * `/resume` le fait déjà au moment critique, juste avant d'écraser un compte
 * rendu. Ce passage rattrape toutes les autres réunions : sans lui, leur
 * résumé ne se retouche pas (Mongo refuse l'écriture ciblée sur un tableau
 * `versions` absent), et une suppression viserait une version inconnue de la
 * base.
 *
 * Lit le compte rendu des SEULS documents concernés, plafonné par démarrage
 * comme les durées. Idempotent par son filtre : une réunion qui a une version
 * n'est plus relue. L'écriture exige le même compte rendu que celui lu :
 * deux documents au même `meetingId` ne s'échangent pas leur texte.
 */
const LEGACY_VERSION_BACKFILL_MAX = 500;

async function backfillLegacyVersions(db, log) {
  try {
    const pending = await db
      .collection('resume')
      .find({ meetingId: { $type: 'string' }, resume: { $regex: '\\S' }, $or: WITHOUT_VERSIONS })
      .project({ _id: 0, meetingId: 1, resume: 1, versions: 1, template: 1, now: 1 })
      .limit(LEGACY_VERSION_BACKFILL_MAX)
      .toArray();

    let done = 0;
    for (const doc of pending) {
      const version = legacyVersionOf(doc);
      if (!version) continue;
      const res = await db
        .collection('resume')
        .updateOne(
          { meetingId: doc.meetingId, resume: doc.resume, $or: WITHOUT_VERSIONS },
          { $set: { versions: [version] } },
        );
      done += res?.modifiedCount || 0;
    }

    if (done > 0) log.info(`[api] version d'origine inscrite sur ${done} compte(s) rendu(s)`);
    if (pending.length === LEGACY_VERSION_BACKFILL_MAX)
      log.info('[api] versions : lot plafonné, la suite au prochain démarrage');
    return done;
  } catch (err) {
    // Jamais bloquant : /resume inscrit la version de toute façon avant
    // d'écraser un compte rendu, la reprise reprendra au démarrage suivant.
    log.warn(`[api] reprise des versions de compte rendu impossible : ${err.message}`);
    return 0;
  }
}

/**
 * Reprend la règle historique « email @myalfred.ai ⇒ admin » (qui n'existait
 * que côté client, dans src/utils/userIdentity.js) et la fige UNE FOIS dans les
 * documents. Après ce passage, le rôle vit en base et seul un admin promeut.
 *
 * Le filtre exige `role` absent : la migration ne peut pas se rejouer, et une
 * rétrogradation décidée plus tard par un admin ne sera jamais annulée au boot
 * suivant.
 */
async function migrateRoles(db, log, legacyAdminDomain) {
  if (legacyAdminDomain) {
    const suffix = `@${String(legacyAdminDomain).replace(/^@/, '').toLowerCase()}`;
    const res = await db
      .collection('user')
      .updateMany(
        { role: { $exists: false }, emailLower: { $regex: `${suffix.replace(/[.]/g, '\\.')}$` } },
        { $set: { role: 'admin' } },
      );
    if (res?.modifiedCount)
      log.info(`[api] ${res.modifiedCount} compte(s) ${suffix} promu(s) admin (migration unique)`);
  }
  const res = await db
    .collection('user')
    .updateMany({ role: { $exists: false } }, { $set: { role: 'user' } });
  if (res?.modifiedCount) log.info(`[api] rôle « user » appliqué à ${res.modifiedCount} compte(s)`);
}

/**
 * Compte d'amorçage. Trois cas, dans cet ordre de priorité :
 *   - le compte a déjà un mot de passe → on ne touche à RIEN (ne jamais écraser
 *     un mot de passe que quelqu'un a changé) ;
 *   - le compte existe sans mot de passe (créé par OIDC) → on lui en pose un et
 *     on le passe admin ;
 *   - le compte n'existe pas → création complète.
 * Dans les deux derniers cas, `mustChangePassword` est vrai.
 */
const ADMIN_SEED_MIN_LENGTH = 12;

export async function seedAdmin(db, { email, password, enabled = true }, log = noopLogger) {
  if (!enabled) return { created: false, reason: 'disabled' };
  const emailLower = normalizeEmail(email);
  if (!emailLower) {
    // Base vierge sans email d'amorçage : l'installation démarrerait sans
    // aucun administrateur. On s'arrête net plutôt que d'en laisser une sans
    // accès à sa propre administration.
    if ((await db.collection('user').countDocuments({})) === 0) {
      throw new Error(
        "ADMIN_SEED_EMAIL est obligatoire pour créer le premier administrateur (ou ADMIN_SEED_ENABLED=false avec ADMIN_EMAILS).",
      );
    }
    return { created: false, reason: 'no_email' };
  }

  const existing = await db.collection('user').findOne({ emailLower });

  // ⚠️ Installation EXISTANTE (des comptes sont déjà en base) : ne jamais y
  // créer un compte d'amorçage. Sur une mise à jour de production, il
  // apparaîtrait avec le mot de passe par défaut connu de tous, et le premier
  // à le changer deviendrait administrateur. Le compte d'amorçage n'a de sens
  // que sur une base vierge.
  if (!existing) {
    const userCount = await db.collection('user').countDocuments({});
    if (userCount > 0) {
      log.warn(
        "[api] compte d'amorçage NON créé : la base contient déjà des comptes. " +
          'Pour désigner un administrateur, renseignez ADMIN_EMAILS (emails séparés par des virgules).',
      );
      return { created: false, reason: 'existing_installation' };
    }
  }
  if (existing?.passwordHash) {
    if (existing.mustChangePassword) {
      log.warn(
        `[api] compte admin de bootstrap ${emailLower} : mot de passe initial encore actif, à changer à la première connexion`,
      );
    }
    return { created: false, reason: 'already_set' };
  }

  // Mot de passe absent ou court : jamais posé. Sur une base vierge, on refuse
  // de démarrer ; sur un compte existant, on laisse le compte tel quel.
  if (String(password || '').length < ADMIN_SEED_MIN_LENGTH) {
    const message = `ADMIN_SEED_PASSWORD doit contenir au moins ${ADMIN_SEED_MIN_LENGTH} caractères.`;
    if (!existing) throw new Error(message);
    log.error(`[api] compte d'amorçage ${emailLower} non modifié : ${message}`);
    return { created: false, reason: 'weak_password' };
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  if (existing) {
    await db.collection('user').updateOne(
      { emailLower },
      {
        $set: {
          passwordHash,
          passwordAlgo: 'scrypt',
          passwordUpdatedAt: now,
          mustChangePassword: true,
          role: 'admin',
          disabled: false,
          authProviders: [...new Set([...(existing.authProviders || []), 'password'])],
          updatedAt: now,
        },
      },
    );
    log.warn(
      `[api] mot de passe d'amorçage posé sur le compte existant ${emailLower} — à changer à la première connexion`,
    );
    return { created: false, reason: 'password_added' };
  }

  await db.collection('user').insertOne({
    email,
    emailLower,
    name: String(email).split('@')[0],
    role: 'admin',
    authProviders: ['password'],
    passwordHash,
    passwordAlgo: 'scrypt',
    passwordUpdatedAt: now,
    mustChangePassword: true,
    disabled: false,
    groupIds: [DEFAULT_GROUP_ID],
    createdAt: now,
    updatedAt: now,
    lastConnecion: null,
  });
  log.warn(
    `[api] compte admin d'amorçage créé : ${emailLower} — mot de passe par défaut, à changer à la première connexion`,
  );
  return { created: true };
}

/**
 * Promotion des comptes d'un domaine administrateur (`ADMIN_EMAIL_DOMAINS`),
 * rejouée à CHAQUE démarrage.
 *
 * Comble le trou de `migrateRoles` : celle-ci ne promeut que les comptes sans
 * champ `role`, donc jamais un compte créé après la migration — qui naît
 * `role: 'user'` via /api/init. Sur un déploiement interne, l'exploitant se
 * retrouvait ainsi sans accès à sa propre administration, et sans autre issue
 * qu'un `ADMIN_EMAILS` posé en SSH.
 *
 * Ne crée aucun compte (contrairement à `ADMIN_EMAILS`) : un domaine désigne
 * des personnes, pas des adresses connues. Ne rétrograde personne non plus.
 *
 * @param {string[]} domains - domaines nus, déjà normalisés par lib/config.js
 */
async function promoteAdminDomains(db, log, domains) {
  if (!Array.isArray(domains) || domains.length === 0) return;
  for (const domain of domains) {
    // Suffixe ancré : `@client.fr$` ne doit pas matcher `@client.fr.attaquant.com`.
    const suffix = `@${domain}`.replace(/[.]/g, '\\.');
    try {
      const res = await db
        .collection('user')
        .updateMany(
          { role: { $ne: 'admin' }, emailLower: { $regex: `${suffix}$` } },
          { $set: { role: 'admin' } },
        );
      if (res?.modifiedCount) {
        log.info(
          `[api] ${res.modifiedCount} compte(s) @${domain} promu(s) administrateur (ADMIN_EMAIL_DOMAINS)`,
        );
      }
    } catch (err) {
      log.warn(`[api] promotion du domaine @${domain} impossible : ${err.message}`);
    }
  }
}

/**
 * Dernier filet : une installation sans le moindre administrateur ne peut plus
 * être administrée du tout, et rien à l'écran ne l'explique — le menu
 * d'administration est simplement absent. On le dit dans les journaux, avec les
 * deux moyens de s'en sortir.
 */
async function warnIfNoAdmin(db, log) {
  try {
    // Un doublon inerte au rôle `admin` n'administre rien (cf. SERVED_ACCOUNT).
    if ((await db.collection('user').countDocuments({ ...SERVED_ACCOUNT, role: 'admin' })) > 0)
      return;
    log.warn(
      "[api] AUCUN compte administrateur en base : l'administration est inaccessible. " +
        'Renseignez ADMIN_EMAILS (adresses, séparées par des virgules) ou ' +
        'ADMIN_EMAIL_DOMAINS (domaines) dans le .env, puis redémarrez.',
    );
  } catch (err) {
    log.warn(`[api] vérification des administrateurs impossible : ${err.message}`);
  }
}

/**
 * Promotion explicite d'administrateurs par email (`ADMIN_EMAILS`).
 *
 * C'est le moyen prévu pour désigner un administrateur sur une installation
 * existante — notamment quand l'authentification passe par un IdP (Entra) et
 * qu'aucun compte d'amorçage n'est créé. Idempotent, et le document est créé
 * s'il n'existe pas encore : on peut donc nommer l'administrateur AVANT sa
 * première connexion.
 *
 * Ne rétrograde personne : retirer un email de la liste ne retire pas le rôle.
 */
async function promoteAdmins(db, log, adminEmails) {
  if (!Array.isArray(adminEmails) || adminEmails.length === 0) return;
  const now = new Date().toISOString();

  for (const raw of adminEmails) {
    const email = String(raw).trim();
    const emailLower = normalizeEmail(email);
    if (!emailLower) continue;
    try {
      const existing = await db.collection('user').findOne({ emailLower });
      if (existing?.role === 'admin') continue;
      await db.collection('user').updateOne(
        { emailLower },
        {
          $set: { role: 'admin', updatedAt: now },
          $setOnInsert: {
            email,
            name: email.split('@')[0],
            authProviders: [],
            disabled: false,
            mustChangePassword: false,
            groupIds: [DEFAULT_GROUP_ID],
            createdAt: now,
            lastConnecion: null,
          },
        },
        { upsert: true },
      );
      log.info(`[api] ${emailLower} promu administrateur (ADMIN_EMAILS)`);
    } catch (err) {
      log.warn(`[api] promotion impossible pour ${emailLower} : ${err.message}`);
    }
  }
}

/**
 * @param {object} db
 * @param {{adminSeed: {email: string, password: string, enabled: boolean},
 *          legacyAdminDomain: string, adminEmails: string[],
 *          adminEmailDomains: string[]}} config
 * @param {{info: Function, warn: Function, error: Function}} [log]
 * @param {Record<string, string|undefined>} [env]
 */
export async function bootstrap(db, config, log = noopLogger, env = {}) {
  // AVANT ensureIndexes : l'index unique sur `userMailAccounts.emailLower`
  // échouerait sur un doublon préexistant, et ensureIndexes est fail-fast.
  await dedupeMailAccounts(db, log);
  await ensureIndexes(db, log);
  // Après les index : la reprise insère dans une collection qui doit déjà
  // porter sa contrainte d'unicité.
  await migrateMailAccountsToConnections(db, log);
  // Avant la détection des doublons : `$toLower` d'une adresse nulle vaut "",
  // deux comptes sans adresse y passeraient pour un doublon.
  await removeAddresslessUsers(db, log);
  await warnDuplicateEmails(db, log);
  await backfillEmailLower(db, log);
  // Même normalisation sur les documents métier : sans elle, un utilisateur
  // dont la casse d'email diffère entre son compte et ses réunions voit un
  // historique vide (cf. lib/ownerScope.js).
  await backfillOwnerEmails(db, log);
  // Confort de statistiques, jamais bloquants (cf. chaque fonction).
  await backfillTranscriptionSize(db, log);
  await backfillDurationsFromSummaries(db, log);
  // Avant l'écoute (server.js attend le bootstrap) : aucune retouche ni
  // régénération ne croise la reprise.
  await backfillLegacyVersions(db, log);
  await migrateRoles(db, log, config.legacyAdminDomain);
  // Réglage déplacé d'un écran à l'autre : la reprise doit précéder le premier
  // appel de l'administration, sinon l'onglet Configuration affiche un champ vide
  // et le premier enregistrement fige cette perte.
  await migrateBusinessContextToOrgContext(db, log);
  await seedAdmin(db, config.adminSeed, log);
  // Après le seed : sur une installation existante, ce sont les seuls moyens de
  // désigner un administrateur.
  await promoteAdmins(db, log, config.adminEmails);
  await promoteAdminDomains(db, log, config.adminEmailDomains);
  await warnIfNoAdmin(db, log);
  // Après les promotions : un compte qu'`ADMIN_EMAILS` vient de créer reçoit
  // son groupe ici même, pas au démarrage suivant.
  await seedDefaultGroup(db, log);

  // Réglages d'authentification : l'environnement ne sert que d'amorçage, la
  // suite se pilote depuis le panneau d'administration.
  const { seeded } = await createSettingsRepo(db).seedFromEnv(env);
  if (seeded) log.info("[api] réglages d'authentification initialisés depuis l'environnement");
}
