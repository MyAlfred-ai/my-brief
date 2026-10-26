/**
 * Groupes d'utilisateurs — accès à la collection `userGroups`, le SEUL fichier
 * qui connaît son schéma.
 *
 * ── Ce qu'est un groupe ─────────────────────────────────────────────────────
 * Un ensemble de comptes défini par l'administration : « Commerciaux »,
 * « Direction », « Stagiaires ». Il porte des règles : un quota de minutes de
 * réunion, et des droits (générer des infographies). Le modèle est posé pour
 * que les règles suivantes s'y accrochent sans le refaire.
 *
 * ── Le groupe « Défaut » ────────────────────────────────────────────────────
 * Un groupe est créé au démarrage (`id: 'default'`, cf. `ensureDefault`) et ne
 * se supprime pas. TOUT compte y entre à sa création — par l'administration,
 * par une première connexion SSO, ou par le compte d'amorçage — et un compte
 * qui perd son dernier groupe y retombe (`normalizeGroupIds`). Invariant :
 * un compte appartient toujours à AU MOINS un groupe. Sans lui, une règle par
 * groupe (un quota) ne saurait pas quoi appliquer à un compte « sans groupe »,
 * et l'administrateur devrait deviner ce que vaut le vide. Il se renomme et se
 * recolore librement : « Défaut » n'est qu'un nom de naissance.
 *
 * ── Où vit l'appartenance ───────────────────────────────────────────────────
 * Sur le document `user` (`groupIds: string[]`), pas dans une collection de
 * liaison : les groupes d'un compte sont lus à CHAQUE ouverture de l'app
 * (/init, /auth/session) et le seront à chaque règle de quota, alors qu'on les
 * modifie rarement. Un tableau de quelques identifiants sur le compte est
 * indexable (index multikey) et se lit sans jointure. Corollaire : supprimer un
 * groupe DOIT le retirer de tous les comptes (`users.detachGroup`), sinon des
 * identifiants morts s'accumulent — le retrait est fait avant la suppression du
 * document, pour qu'un échec laisse un groupe vide plutôt que des membres
 * fantômes.
 *
 * Les identifiants sont des UUID (jamais de `_id` vers le client, comme
 * partout dans l'API), sauf celui du groupe par défaut, fixe pour être
 * reconnu partout sans requête.
 *
 * ── Les règles par groupe ───────────────────────────────────────────────────
 * `meetingMinutesPerMonth` : le quota de minutes de réunion, par personne et
 * par mois civil, `null` pour « illimité ». Un compte hérite du plus généreux
 * de ses groupes (cf. lib/quota.js, qui porte toute la règle). Le groupe par
 * défaut naît illimité : poser une limite est une décision d'administration,
 * jamais un effet de la mise à jour.
 *
 * `infographicAllowed` : le droit de générer une infographie de compte rendu.
 * Les droits sont CUMULATIFS, comme le quota : un compte l'a dès qu'UN de ses
 * groupes le lui donne (`rightsOf`). L'interrupteur « Proposer l'infographie »
 * de l'onglet IA reste au-dessus : coupé, personne ne génère d'image, quels que
 * soient les groupes (cf. routes/meetings.js).
 *
 * Un nouveau groupe naît SANS le droit : il se donne explicitement. Le groupe
 * par défaut naît AVEC, et un groupe par défaut antérieur au champ le lit
 * comme accordé (`normalizeInfographicAllowed`) : sans quoi le déploiement
 * aurait retiré les infographies à tout le monde, en silence. Pour les
 * réserver à quelques personnes, l'administration retire le droit à « Défaut »
 * et le donne à leurs groupes, comme on limite « Défaut » pour un quota de
 * base.
 *
 * Schéma :
 *   { id, name, nameLower, description, color, isDefault,
 *     meetingMinutesPerMonth, infographicAllowed, createdAt, updatedAt,
 *     createdBy }
 */
import { randomUUID } from 'node:crypto';

export const GROUPS_COLLECTION = 'userGroups';

/** Identifiant du groupe de naissance de tout compte. */
export const DEFAULT_GROUP_ID = 'default';

/** Nom de naissance du groupe par défaut — renommable ensuite par l'administration. */
export const DEFAULT_GROUP_NAME = 'Défaut';

/**
 * Palette FERMÉE, la même que celle des tags (routes/tags.js) : le frontend
 * rend chaque slug par un jeton de `tokens.css`, une couleur hors liste
 * s'afficherait transparente. Le serveur revalide — une liste envoyée au client
 * n'est pas un contrôle.
 */
export const GROUP_COLORS = ['slate', 'red', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'];

export const GROUP_NAME_MAX = 40;
export const GROUP_DESCRIPTION_MAX = 200;

/**
 * Plafond de groupes par installation. Assez haut pour une organisation par
 * service ; assez bas pour qu'une liste de cases à cocher reste lisible dans la
 * fiche d'un compte.
 */
export const GROUPS_MAX = 50;

/**
 * Borne haute d'un quota : au-delà, autant choisir « illimité ». 100 000 min
 * font plus de 1 600 heures par mois, soit plus que le mois lui-même.
 */
export const QUOTA_MINUTES_MAX = 100000;

/**
 * Quota EXPLOITABLE d'un groupe : un entier positif ou nul, sinon `null`
 * (illimité). Une valeur écrite autrement (chaîne, négatif, décimal) est lue
 * comme « pas de limite » plutôt que comme une limite fantaisiste.
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeQuotaMinutes(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 0 || value > QUOTA_MINUTES_MAX) return null;
  return value;
}

/**
 * Droit aux infographies d'un groupe, tel qu'il s'applique. Un booléen écrit
 * fait foi. Absent, le groupe date d'avant ce droit : le groupe par défaut le
 * lit comme accordé, les autres comme refusé (cf. l'en-tête du fichier). Pas
 * de reprise en base au démarrage : la lecture suffit, et un « non » posé par
 * l'administration, lui, est écrit.
 * @param {object|null} doc - document `userGroups`
 * @returns {boolean}
 */
export function normalizeInfographicAllowed(doc) {
  if (typeof doc?.infographicAllowed === 'boolean') return doc.infographicAllowed;
  return doc?.id === DEFAULT_GROUP_ID;
}

/**
 * Les droits d'un compte, d'après ses groupes : CUMULATIFS, un seul groupe qui
 * accorde suffit. Aucun groupe résolu n'arrive que si le groupe par défaut
 * n'existe pas encore (base neuve avant le premier démarrage) : ses droits de
 * naissance s'appliquent alors, ceux que `ensureDefault` lui donnera.
 * @param {Array<object>} groupDocs - documents `userGroups` du compte
 * @returns {{infographic: boolean}}
 */
export function rightsOf(groupDocs) {
  const list = groupDocs || [];
  if (list.length === 0) return { infographic: true };
  return { infographic: list.some(normalizeInfographicAllowed) };
}

/**
 * Appartenance NORMALISÉE d'un compte : identifiants dédoublonnés, jamais vide.
 * Un compte sans groupe est dans le groupe par défaut — c'est l'invariant que
 * lisent toutes les projections, quel que soit l'état du document.
 * @param {unknown} ids
 * @returns {string[]}
 */
export function normalizeGroupIds(ids) {
  const list = Array.isArray(ids) ? ids : [];
  const clean = [...new Set(list.map((id) => String(id || '').trim()).filter(Boolean))];
  return clean.length ? clean : [DEFAULT_GROUP_ID];
}

/** Clé d'unicité des noms : casse et espaces neutralisés. */
export function groupNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Projection vers l'administration. `memberCount` est calculé par l'appelant
 * (il vit sur la collection `user`, pas ici).
 */
export function toPublicGroup(doc, memberCount = 0) {
  if (!doc) return null;
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description || '',
    color: GROUP_COLORS.includes(doc.color) ? doc.color : GROUP_COLORS[0],
    isDefault: !!doc.isDefault,
    meetingMinutesPerMonth: normalizeQuotaMinutes(doc.meetingMinutesPerMonth),
    infographicAllowed: normalizeInfographicAllowed(doc),
    memberCount,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

/** Projection vers l'UTILISATEUR (menu de compte) : le strict nécessaire pour se reconnaître. */
export function toUserGroup(doc) {
  return { id: doc.id, name: doc.name, color: toPublicGroup(doc).color };
}

/**
 * Les groupes d'un compte parmi le catalogue `all` (déjà lu), dans l'ordre du
 * catalogue. Un identifiant mort est ignoré ; un compte dont tous les
 * identifiants sont morts est rendu dans le groupe par défaut, comme le veut
 * l'invariant. Pure : la lecture du catalogue reste à l'appelant, qui peut la
 * faire une fois pour toute une liste de comptes (cf. lib/teamCredits.js).
 * @param {object[]} all - documents `userGroups`
 * @param {object|null} doc - document `user`
 * @returns {object[]}
 */
export function groupsOfUser(all, doc) {
  const wanted = new Set(normalizeGroupIds(doc?.groupIds));
  const mine = all.filter((g) => wanted.has(g.id));
  return mine.length ? mine : all.filter((g) => g.id === DEFAULT_GROUP_ID);
}

export function createGroupsRepo(db) {
  const groups = () => db.collection(GROUPS_COLLECTION);

  return {
    /** Tous les groupes, le groupe par défaut en tête puis par nom. */
    async list() {
      return groups().find({}).sort({ isDefault: -1, nameLower: 1 }).toArray();
    },

    async findById(id) {
      if (!id) return null;
      return groups().findOne({ id: String(id) });
    },

    async count() {
      return groups().countDocuments({});
    },

    /**
     * Identifiants inconnus parmi ceux fournis — pour refuser une appartenance
     * vers un groupe supprimé entre-temps plutôt que de l'enregistrer en silence.
     * @param {string[]} ids
     * @returns {Promise<string[]>}
     */
    async unknownIds(ids) {
      const wanted = normalizeGroupIds(ids);
      const known = await groups()
        .find({ id: { $in: wanted } })
        .project({ _id: 0, id: 1 })
        .toArray();
      const found = new Set(known.map((g) => g.id));
      return wanted.filter((id) => !found.has(id));
    },

    /**
     * Les DOCUMENTS des groupes d'un compte, dans l'ordre du catalogue (par
     * défaut en tête, puis par nom) — pas dans l'ordre d'inscription, qui ne
     * veut rien dire à l'écran. Un identifiant mort (groupe supprimé) est
     * ignoré ; un compte dont tous les identifiants sont morts est rendu dans
     * le groupe par défaut, comme le veut l'invariant.
     * @param {object|null} doc - document `user`
     * @returns {Promise<object[]>}
     */
    async docsForUser(doc) {
      return groupsOfUser(await this.list(), doc);
    },

    /**
     * Les groupes d'un compte, projetés pour l'utilisateur (menu de compte).
     * @param {object|null} doc - document `user`
     * @returns {Promise<Array<{id: string, name: string, color: string}>>}
     */
    async forUser(doc) {
      return (await this.docsForUser(doc)).map(toUserGroup);
    },

    /**
     * Les droits qu'un compte tient de ses groupes (cf. `rightsOf`). SANS
     * l'interrupteur général de l'onglet IA : l'écran le lit à part, dans les
     * capacités de l'installation, et une porte serveur vérifie les deux.
     * @param {object|null} doc - document `user`
     * @returns {Promise<{infographic: boolean}>}
     */
    async rightsForUser(doc) {
      return rightsOf(await this.docsForUser(doc));
    },

    /**
     * @param {{name: string, description?: string, color?: string,
     *   meetingMinutesPerMonth?: number|null, infographicAllowed?: boolean,
     *   createdBy?: string}} input
     */
    async create({
      name,
      description = '',
      color = GROUP_COLORS[0],
      meetingMinutesPerMonth = null,
      infographicAllowed = false,
      createdBy = null,
    }) {
      const now = new Date().toISOString();
      const doc = {
        id: randomUUID(),
        name: String(name).trim().replace(/\s+/g, ' '),
        nameLower: groupNameKey(name),
        description: String(description || '').trim(),
        color: GROUP_COLORS.includes(color) ? color : GROUP_COLORS[0],
        isDefault: false,
        meetingMinutesPerMonth: normalizeQuotaMinutes(meetingMinutesPerMonth),
        // Un droit se donne explicitement : sans case cochée, pas de droit.
        infographicAllowed: infographicAllowed === true,
        createdAt: now,
        updatedAt: now,
        createdBy,
      };
      await groups().insertOne(doc);
      return doc;
    },

    /**
     * Champs modifiables : nom, description, couleur, quota, droits — y compris
     * sur le groupe par défaut. `meetingMinutesPerMonth: null` retire la
     * limite ; un champ absent ne bouge pas.
     */
    async update(id, { name, description, color, meetingMinutesPerMonth, infographicAllowed }) {
      const $set = { updatedAt: new Date().toISOString() };
      if (name !== undefined) {
        $set.name = String(name).trim().replace(/\s+/g, ' ');
        $set.nameLower = groupNameKey(name);
      }
      if (description !== undefined) $set.description = String(description || '').trim();
      if (color !== undefined && GROUP_COLORS.includes(color)) $set.color = color;
      if (meetingMinutesPerMonth !== undefined)
        $set.meetingMinutesPerMonth = normalizeQuotaMinutes(meetingMinutesPerMonth);
      if (infographicAllowed !== undefined) $set.infographicAllowed = infographicAllowed === true;
      await groups().updateOne({ id }, { $set });
      return this.findById(id);
    },

    async remove(id) {
      await groups().deleteOne({ id });
    },

    /**
     * Crée le groupe par défaut s'il manque. Idempotent : `$setOnInsert` seul,
     * un renommage fait par l'administration survit au démarrage suivant.
     * @returns {Promise<boolean>} vrai si le groupe vient d'être créé
     */
    async ensureDefault() {
      const now = new Date().toISOString();
      const res = await groups().updateOne(
        { id: DEFAULT_GROUP_ID },
        {
          $setOnInsert: {
            id: DEFAULT_GROUP_ID,
            name: DEFAULT_GROUP_NAME,
            nameLower: groupNameKey(DEFAULT_GROUP_NAME),
            description: '',
            color: GROUP_COLORS[0],
            isDefault: true,
            meetingMinutesPerMonth: null,
            infographicAllowed: true,
            createdAt: now,
            updatedAt: now,
            createdBy: null,
          },
        },
        { upsert: true },
      );
      return !!res?.upsertedCount;
    },
  };
}
