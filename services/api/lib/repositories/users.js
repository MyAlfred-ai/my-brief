/**
 * Accès à la collection `user` — le SEUL fichier qui connaît son schéma.
 *
 * ⚠️ L'email BRUT est la clé métier et ne doit JAMAIS être normalisé en casse :
 * `resume`, `userTemplates` et `userConfig` sont tous scopés sur l'email tel
 * qu'il arrive dans l'en-tête, et Entra émet un `preferred_username` en casse
 * mixte. Un toLowerCase() dans le chemin d'identité rendrait invisible tout
 * l'historique de ces comptes, silencieusement.
 *
 * `emailLower` est donc UNIQUEMENT la clé de recherche/unicité du document
 * `user` (connexion, unicité, écran d'administration).
 *
 * Schéma cible :
 *   { email, emailLower, name, role: 'user'|'admin', authProviders: [],
 *     passwordHash?, passwordAlgo?, passwordUpdatedAt?, mustChangePassword,
 *     disabled, groupIds: string[], picture?, createdAt, updatedAt,
 *     lastConnecion }
 *
 * `picture` : adresse HTTPS de la photo de profil, recopiée de l'IdP à chaque
 * connexion qui en publie une (cf. `pictureOf` dans lib/auth/providers.js).
 * Gardée sur le compte, pas sur la session : elle reste affichée après une
 * connexion par mot de passe.
 *
 * `groupIds` : les groupes du compte (cf. lib/repositories/groups.js — le
 * pourquoi de l'appartenance SUR le compte, et le groupe par défaut). Lu via
 * `normalizeGroupIds` partout : un document sans le champ, ou vidé, est dans
 * le groupe par défaut.
 *
 * `lastConnecion` conserve la faute de frappe historique (cf. routes/core.js).
 */
import { ownerPurgeFilter, OWNED_COLLECTIONS } from '../ownerScope.js';
import { DEFAULT_GROUP_ID, normalizeGroupIds } from './groups.js';
import { escapeRegExp } from '../text.js';

export const ROLES = ['user', 'admin'];

/**
 * Filtre des documents `user` qui SONT des comptes : ceux qui portent un
 * `emailLower` texte, la clé que servent la connexion, les sessions, /init et
 * toutes les routes d'administration (`findByEmailLower`).
 *
 * Un document sans `emailLower` n'est pas un compte, c'est un doublon inerte :
 * même adresse qu'un compte servi, écarté par l'index unique (cf.
 * `warnDuplicateEmails` dans lib/bootstrap.js). Il ne sert à rien, mais
 * l'administration le listait : la même personne apparaissait deux fois, et
 * les boutons de la ligne en trop agissaient sur le VRAI compte (ils le
 * désignent par son adresse). Le backfill du démarrage donne un `emailLower` à
 * tout document qui peut en recevoir un : ceux qui restent sans sont
 * exactement les doublons.
 *
 * Toute lecture qui COMPTE ou LISTE des comptes passe par ce filtre : liste
 * d'administration, effectifs des groupes, garde du dernier administrateur,
 * statistiques.
 */
export const SERVED_ACCOUNT = { emailLower: { $type: 'string' } };

// La liste des collections scopées et la règle d'appartenance vivent dans
// lib/ownerScope.js — un seul endroit, sinon la purge et les lectures divergent.
// L'import est CIRCULAIRE (ownerScope importe `normalizeEmail` d'ici) mais sûr :
// de part et d'autre, les liaisons ne sont utilisées qu'à l'appel, jamais à
// l'évaluation du module.

/** @param {string} email */
export function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/**
 * Projection publique — un seul point à auditer pour garantir que
 * `passwordHash` ne sort jamais de l'API.
 */
export function toPublicUser(doc) {
  if (!doc) return null;
  return {
    email: doc.email,
    name: doc.name || String(doc.email || '').split('@')[0],
    role: doc.role === 'admin' ? 'admin' : 'user',
    disabled: !!doc.disabled,
    hasPassword: !!doc.passwordHash,
    mustChangePassword: !!doc.mustChangePassword,
    authProviders: Array.isArray(doc.authProviders) ? doc.authProviders : [],
    groupIds: normalizeGroupIds(doc.groupIds),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
    lastConnecion: doc.lastConnecion || null,
  };
}

/**
 * Identité renvoyée au frontend après connexion — même forme que /api/init,
 * pour que le store front n'ait qu'un seul format à connaître.
 *
 * `groups` : les groupes RÉSOLUS du compte (`app.groups.forUser`), nom et
 * couleur compris — l'utilisateur ne peut pas interroger les routes
 * d'administration pour traduire ses identifiants.
 */
export function toSessionUser(
  doc,
  {
    authMode = 'password',
    authProvider = 'password',
    groups = [],
    rights = { infographic: false },
  } = {},
) {
  if (!doc) return null;
  return {
    email: doc.email,
    name: doc.name || String(doc.email || '').split('@')[0],
    role: doc.role === 'admin' ? 'admin' : 'user',
    mustChangePassword: !!doc.mustChangePassword,
    authMode,
    // Par quoi la session courante a été ouverte — l'avatar en dépend
    // (cf. lib/auth/resolve.js, authProviderOf).
    authProvider,
    // Photo de l'avatar ; vide ⇒ initiales.
    picture: doc.picture || '',
    groups,
    // Ce que les groupes du compte lui permettent (cf. `rightsOf`,
    // lib/repositories/groups.js). Refusé par défaut : un appelant qui oublie
    // de le calculer masque une case, il n'en ouvre pas une.
    rights,
  };
}

export function createUsersRepo(db) {
  const users = () => db.collection('user');

  return {
    normalizeEmail,
    toPublicUser,

    /** @returns {Promise<object|null>} le document COMPLET (passwordHash inclus) */
    async findByEmailLower(emailLower) {
      if (!emailLower) return null;
      return users().findOne({ emailLower });
    },

    /**
     * Recherche tolérante aux documents legacy : ceux créés avant la migration
     * n'ont pas encore d'`emailLower`, on retombe sur l'email brut.
     */
    async findByEmail(email) {
      const lower = normalizeEmail(email);
      return (await users().findOne({ emailLower: lower })) || (await users().findOne({ email }));
    },

    /**
     * @param {{q?: string, limit?: number, skip?: number, group?: string}} [opts]
     *   `group` : ne rendre que les membres de ce groupe (cf. groups.js).
     * @returns {Promise<{users: object[], total: number}>}
     */
    async list({ q = '', limit = 50, skip = 0, group = '' } = {}) {
      const term = String(q || '').trim();
      // Des comptes, pas des documents : un doublon inerte de la même adresse
      // n'a pas de ligne (cf. SERVED_ACCOUNT).
      const filter = { ...SERVED_ACCOUNT };
      // Échappement : un `q` du type « a.*b » ne doit pas devenir un motif.
      if (term) {
        filter.$or = [
          { emailLower: { $regex: escapeRegExp(term.toLowerCase()) } },
          { name: { $regex: escapeRegExp(term), $options: 'i' } },
        ];
      }
      // Égalité sur un tableau : Mongo retient le document dès qu'un élément
      // correspond. Les comptes antérieurs au champ sont couverts par le
      // backfill du démarrage (cf. lib/bootstrap.js, backfillUserGroups).
      if (group) filter.groupIds = String(group);
      const total = await users().countDocuments(filter);
      const docs = await users()
        .find(filter)
        .sort({ emailLower: 1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      return { users: docs.map(toPublicUser), total };
    },

    /**
     * Administrateurs actifs. Un doublon inerte au rôle `admin` ne compte pas :
     * il laisserait rétrograder le dernier administrateur réel.
     */
    async countAdmins() {
      return users().countDocuments({ ...SERVED_ACCOUNT, role: 'admin', disabled: { $ne: true } });
    },

    /**
     * Effectif de chaque groupe, calculé en JavaScript sur une projection
     * minimale — pas d'`$aggregate` : le faux Mongo des tests ne l'implémente
     * pas, et une installation compte des dizaines de comptes, pas des
     * millions. Un compte sans champ compte dans le groupe par défaut, comme le
     * veut `normalizeGroupIds`.
     * @returns {Promise<Map<string, number>>}
     */
    async groupMemberCounts() {
      const docs = await users().find(SERVED_ACCOUNT).project({ _id: 0, groupIds: 1 }).toArray();
      const counts = new Map();
      for (const doc of docs) {
        for (const id of normalizeGroupIds(doc.groupIds)) counts.set(id, (counts.get(id) || 0) + 1);
      }
      return counts;
    },

    /**
     * @param {{email: string, name?: string, role?: string, passwordHash?: string,
     *          mustChangePassword?: boolean, authProvider?: string, groupIds?: string[],
     *          picture?: string}} input
     */
    async create({
      email,
      name,
      role = 'user',
      passwordHash,
      mustChangePassword = false,
      authProvider = 'password',
      groupIds,
      picture,
    }) {
      const now = new Date().toISOString();
      const doc = {
        email: String(email).trim(),
        emailLower: normalizeEmail(email),
        name: name || String(email).split('@')[0],
        role: ROLES.includes(role) ? role : 'user',
        authProviders: [authProvider],
        disabled: false,
        mustChangePassword: !!mustChangePassword,
        // Jamais vide : sans choix explicite, le compte naît dans le groupe
        // par défaut (cf. lib/repositories/groups.js).
        groupIds: normalizeGroupIds(groupIds),
        createdAt: now,
        updatedAt: now,
        lastConnecion: null,
      };
      if (passwordHash) {
        doc.passwordHash = passwordHash;
        doc.passwordAlgo = 'scrypt';
        doc.passwordUpdatedAt = now;
      }
      if (picture) doc.picture = picture;
      await users().insertOne(doc);
      return doc;
    },

    /**
     * Photo de profil publiée par l'IdP. Une adresse vide n'efface rien : une
     * connexion par un fournisseur sans photo (Entra, mot de passe) ne doit
     * pas retirer celle qu'a donnée Google.
     */
    async setPicture(emailLower, picture) {
      if (!emailLower || !picture) return;
      await users().updateOne(
        { emailLower },
        { $set: { picture, updatedAt: new Date().toISOString() } },
      );
    },

    /** Champs modifiables par l'administration : nom, rôle, activation, groupes. */
    async update(emailLower, { name, role, disabled, groupIds }) {
      const $set = { updatedAt: new Date().toISOString() };
      if (name !== undefined) $set.name = String(name).trim();
      if (role !== undefined && ROLES.includes(role)) $set.role = role;
      if (disabled !== undefined) $set.disabled = !!disabled;
      if (groupIds !== undefined) $set.groupIds = normalizeGroupIds(groupIds);
      await users().updateOne({ emailLower }, { $set });
      return this.findByEmailLower(emailLower);
    },

    /**
     * Ajoute ou retire des comptes d'un groupe, par adresse. L'appartenance est
     * relue puis réécrite compte par compte : c'est ce qui applique l'invariant
     * « jamais sans groupe » — un compte retiré de son dernier groupe retombe
     * dans le groupe par défaut, au lieu de se retrouver avec un tableau vide.
     * @param {string} groupId
     * @param {{add?: string[], remove?: string[]}} changes - emailLower
     * @returns {Promise<{added: number, removed: number}>}
     */
    async changeGroupMembers(groupId, { add = [], remove = [] }) {
      const now = new Date().toISOString();
      let added = 0;
      let removed = 0;
      for (const emailLower of add) {
        const doc = await this.findByEmailLower(emailLower);
        if (!doc) continue;
        const current = normalizeGroupIds(doc.groupIds);
        if (current.includes(groupId)) continue;
        await users().updateOne(
          { emailLower },
          { $set: { groupIds: [...current, groupId], updatedAt: now } },
        );
        added += 1;
      }
      for (const emailLower of remove) {
        const doc = await this.findByEmailLower(emailLower);
        if (!doc) continue;
        const current = normalizeGroupIds(doc.groupIds);
        if (!current.includes(groupId)) continue;
        await users().updateOne(
          { emailLower },
          {
            $set: {
              groupIds: normalizeGroupIds(current.filter((id) => id !== groupId)),
              updatedAt: now,
            },
          },
        );
        removed += 1;
      }
      return { added, removed };
    },

    /**
     * Retire un groupe de TOUS les comptes — appelé avant sa suppression.
     * Deux écritures : le retrait, puis le retour au groupe par défaut des
     * comptes que le retrait a laissés sans groupe. L'ordre garantit qu'un
     * échec entre les deux laisse au pire un tableau vide, que
     * `normalizeGroupIds` lit déjà comme « par défaut ».
     * @returns {Promise<number>} nombre de comptes qui appartenaient au groupe
     */
    async detachGroup(groupId) {
      const now = new Date().toISOString();
      const res = await users().updateMany(
        { groupIds: groupId },
        { $pull: { groupIds: groupId }, $set: { updatedAt: now } },
      );
      await users().updateMany(
        { groupIds: { $size: 0 } },
        { $set: { groupIds: [DEFAULT_GROUP_ID], updatedAt: now } },
      );
      return res?.modifiedCount || 0;
    },

    async setPassword(emailLower, { passwordHash, mustChangePassword = false }) {
      const now = new Date().toISOString();
      await users().updateOne(
        { emailLower },
        {
          $set: {
            passwordHash,
            passwordAlgo: 'scrypt',
            passwordUpdatedAt: now,
            mustChangePassword: !!mustChangePassword,
            updatedAt: now,
          },
        },
      );
      // Le compte devient joignable par mot de passe même s'il était OIDC-only.
      const doc = await this.findByEmailLower(emailLower);
      if (doc && !(doc.authProviders || []).includes('password')) {
        await users().updateOne(
          { emailLower },
          { $set: { authProviders: [...(doc.authProviders || []), 'password'] } },
        );
      }
      return this.findByEmailLower(emailLower);
    },

    /**
     * Enregistre un moyen de connexion supplémentaire (informatif : sert à
     * afficher « SSO uniquement » dans l'administration). Idempotent.
     */
    async addAuthProvider(emailLower, provider) {
      const doc = await this.findByEmailLower(emailLower);
      if (!doc || (doc.authProviders || []).includes(provider)) return doc;
      await users().updateOne(
        { emailLower },
        {
          $set: {
            authProviders: [...(doc.authProviders || []), provider],
            updatedAt: new Date().toISOString(),
          },
        },
      );
      return this.findByEmailLower(emailLower);
    },

    /**
     * Supprime le compte ET les doublons inertes de la même adresse (casse et
     * espaces autour neutralisés). Sans eux, le backfill du démarrage suivant
     * donnerait son `emailLower` au doublon, qui deviendrait le compte : la
     * personne supprimée réapparaîtrait, avec des champs d'un autre temps.
     */
    async remove(emailLower) {
      await users().deleteMany({
        $or: [
          { emailLower },
          { email: { $regex: `^\\s*${escapeRegExp(emailLower)}\\s*$`, $options: 'i' } },
        ],
      });
    },

    /**
     * Purge des données métier d'un compte (réunions, templates perso, config).
     *
     * Passe par `ownerPurgeFilter`, plus large qu'`ownerFilter` : il retrouve
     * AUSSI les documents en casse mixte que le backfill n'a pas encore
     * atteints. Un filtre `{ email }` en égalité exacte en laisserait derrière
     * lui, et une purge silencieusement partielle est pire qu'une purge qui
     * échoue — elle est annoncée comme complète (cf. lib/ownerScope.js).
     * @returns {Promise<Record<string, number>>} nombre de documents supprimés par collection
     */
    async purgeUserData(email) {
      const deleted = {};
      for (const name of OWNED_COLLECTIONS) {
        const res = await db.collection(name).deleteMany(ownerPurgeFilter(email));
        deleted[name] = res?.deletedCount ?? 0;
      }
      return deleted;
    },
  };
}
