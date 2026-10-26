/**
 * Portée « données d'un utilisateur » sur les collections métier (`resume`,
 * `userTemplates`, `userConfig`).
 *
 * ── Le problème que ce module résout ────────────────────────────────────────
 * Les comptes sont identifiés par `emailLower` (normalisé) depuis la migration,
 * mais les documents métier étaient filtrés par `{ email }` — égalité EXACTE,
 * donc sensible à la casse. Or l'email porté par la requête n'a pas toujours la
 * même casse que celui inscrit dans les documents :
 *
 *   - chemin OIDC : l'email vient de l'en-tête, dans la casse de l'annuaire
 *     (Entra renvoie couramment `Prenom.Nom@societe.fr`) ;
 *   - session native : l'email vient du document `user`, dans la casse qui y a
 *     été enregistrée — pas forcément la même.
 *
 * Un utilisateur qui change de chemin de connexion voyait alors son historique
 * VIDE : la requête ne trouvait rien, l'API répondait 200 avec une liste vide,
 * et rien n'apparaissait dans la console. Les documents n'étaient pas perdus,
 * simplement invisibles. Pire, un renommage ou une suppression manquaient leur
 * cible en silence.
 *
 * ── La règle, désormais unique ──────────────────────────────────────────────
 * Toute lecture et toute écriture scopées par utilisateur passent par
 * `ownerFilter`, et tout document inséré porte `ownerFields`. C'est le seul
 * endroit à relire pour savoir comment un document appartient à quelqu'un —
 * la duplication de `{ email }` sur une douzaine d'appels est exactement ce qui
 * a permis à la règle de diverger.
 */
import { normalizeEmail } from './repositories/users.js';
import { escapeRegExp } from './text.js';

/**
 * Filtre Mongo des documents d'un utilisateur.
 *
 * La branche `email` brut n'est pas redondante : elle couvre les documents
 * qu'un backfill n'a pas encore atteints (premier démarrage après mise à jour,
 * ou déploiement progressif où une ancienne instance écrit encore sans
 * `emailLower`). Les deux champs sont indexés, l'union d'index reste efficace.
 *
 * @param {string} email - email de l'utilisateur courant (casse quelconque)
 * @param {object} [extra] - critères additionnels (ex. `{meetingId}`), en ET
 * @returns {object} filtre Mongo
 */
export function ownerFilter(email, extra = {}) {
  return {
    ...extra,
    $or: [{ emailLower: normalizeEmail(email) }, { email }],
  };
}

/**
 * Filtre de SUPPRESSION définitive d'un compte — volontairement plus large que
 * `ownerFilter`.
 *
 * `ownerFilter` ne retrouve un document en casse mixte que si `emailLower` y a
 * été renseigné, donc que si `backfillOwnerEmails` est passé. C'est un compromis
 * assumé sur les chemins chauds : la lecture de l'historique doit rester servie
 * par un index, et le backfill s'exécute au démarrage.
 *
 * Pour une purge, ce compromis n'est pas tenable. Elle est déclenchée derrière
 * une confirmation par saisie de l'email et annoncée comme complète : en
 * laisser une partie derrière elle serait un défaut d'un autre ordre que
 * l'historique invisible. On accepte donc ici la branche insensible à la casse
 * sur l'email BRUT — un balayage de collection, sans conséquence sur une
 * opération d'administration rare, alors qu'il serait inacceptable sur
 * /api/history.
 *
 * @param {string} email
 * @returns {object} filtre Mongo
 */
export function ownerPurgeFilter(email) {
  return {
    $or: [
      { emailLower: normalizeEmail(email) },
      { email },
      { email: { $regex: `^${escapeRegExp(email)}$`, $options: 'i' } },
    ],
  };
}

/**
 * Champs d'appartenance à écrire sur un document métier.
 *
 * `email` est conservé dans sa casse d'origine : il est affiché et exporté, et
 * les documents historiques le portent déjà. `emailLower` est ce sur quoi on
 * cherche.
 *
 * @param {string} email
 * @returns {{email: string, emailLower: string}}
 */
export function ownerFields(email) {
  return { email, emailLower: normalizeEmail(email) };
}

/**
 * Collections métier scopées par utilisateur — source du backfill ET de la
 * purge de compte. Toute nouvelle collection par utilisateur doit y figurer :
 * l'oublier laisse des données derrière une suppression annoncée complète.
 */
export const OWNED_COLLECTIONS = [
  'resume',
  'userTemplates',
  'userConfig',
  'userTags',
  // Connexions à des comptes externes : un refresh token, donc un accès vivant
  // au compte Google/Microsoft de l'utilisateur. Les oublier ici laissait cet
  // accès derrière une suppression annoncée complète. La révocation CHEZ le
  // fournisseur, elle, se fait en amont dans routes/admin/users.js — supprimer
  // le document ne la déclenche pas.
  'userConnections',
  // Collection héritée, conservée le temps que la reprise vers
  // `userConnections` soit éprouvée (cf. lib/bootstrap.js). Plus aucun code
  // n'y écrit ; elle reste ici pour qu'une purge n'en laisse pas de reste.
  'userMailAccounts',
  // Réglages d'actions par utilisateur : destinataires, dossier, gabarits.
  'userActionSettings',
  // Piste d'audit des envois. La faire figurer ici est une tension assumée :
  // elle porte des adresses de TIERS, mais le dépôt promet une suppression de
  // compte complète, et cette promesse-là prime. Conséquence à connaître —
  // supprimer un compte efface aussi sa piste d'audit.
  'actionMailLog',
  // Minutes des réunions supprimées, gardées pour le quota jusqu'à la fin de
  // leur mois (cf. lib/quota.js, DELETED_USAGE_COLLECTION). Elles partent avec
  // le compte, comme ses réunions : un compte purgé puis recréé dans le mois
  // repart de zéro — c'est un geste d'administrateur.
  'deletedMeetingUsage',
  // Infographies des réunions (cf. lib/infographic.js) : une image de
  // plusieurs Mo par réunion, qui dit ce qui s'y est dit. Absente d'ici, elle
  // survivait à la suppression du compte.
  'infographics',
];

/**
 * Renseigne `emailLower` sur les documents métier qui ne l'ont pas encore.
 * Idempotent (le filtre exclut ceux déjà traités), et par collection pour
 * qu'un échec sur l'une n'empêche pas les autres.
 *
 * @param {object} db
 * @param {{info: Function, warn: Function}} log
 * @returns {Promise<number>} nombre de documents complétés
 */
export async function backfillOwnerEmails(db, log) {
  let total = 0;
  for (const name of OWNED_COLLECTIONS) {
    try {
      const legacy = await db
        .collection(name)
        .find({ emailLower: { $exists: false } })
        .project({ _id: 0, email: 1 })
        .toArray();
      // Un seul updateMany par casse rencontrée : le nombre de casses
      // distinctes est petit (une poignée), alors que les documents peuvent se
      // compter en milliers.
      const emails = [...new Set(legacy.map((d) => d.email).filter(Boolean))];
      for (const email of emails) {
        const res = await db
          .collection(name)
          .updateMany(
            { email, emailLower: { $exists: false } },
            { $set: { emailLower: normalizeEmail(email) } },
          );
        total += res?.modifiedCount || 0;
      }
    } catch (err) {
      log.warn(`[api] backfill emailLower impossible sur ${name} : ${err.message}`);
    }
  }
  if (total > 0) log.info(`[api] emailLower renseigné sur ${total} document(s) métier`);
  return total;
}
