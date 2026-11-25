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
 * ── Un seul groupe par compte ───────────────────────────────────────────────
 * Un compte appartient à UN groupe, ni plus ni moins : ses règles sont celles
 * de ce groupe, sans arbitrage. Plusieurs groupes par compte ont existé (le
 * quota le plus généreux, des droits cumulés) : la règle se lisait mal — un
 * quota posé sur « Commerciaux » ne limitait personne tant que « Défaut »
 * restait illimité. Mettre un compte dans un groupe l'enlève donc du
 * précédent ; la reprise du démarrage (`pickGroupId`, lib/bootstrap.js) a
 * ramené chaque compte au groupe qui lui donnait déjà ses minutes.
 *
 * ── Le groupe « Défaut » ────────────────────────────────────────────────────
 * Un groupe est créé au démarrage (`id: 'default'`, cf. `ensureDefault`) et ne
 * se supprime pas. Tout compte d'utilisateur y entre à sa création — par
 * l'administration ou par une première connexion SSO — et un compte retiré de
 * son groupe, ou dont le groupe est supprimé, y retombe (`groupIdOf`).
 * Invariant : un compte appartient toujours à un groupe. Sans lui, une règle
 * par groupe (un quota) ne saurait pas quoi appliquer à un compte « sans
 * groupe », et l'administrateur devrait deviner ce que vaut le vide. Il se
 * renomme et se recolore librement : « Défaut » n'est qu'un nom de naissance.
 *
 * ── Le groupe « Admin » ─────────────────────────────────────────────────────
 * Le second groupe fixe (`id: 'admin'`, cf. `ensureAdmin`), illimité et avec
 * tous les droits à sa naissance : c'est là que va un compte qui DEVIENT
 * administrateur — créé avec ce rôle, promu depuis sa fiche ou par
 * `ADMIN_EMAILS` / `ADMIN_EMAIL_DOMAINS`. Un administrateur rétrogradé qui y
 * était revient dans le groupe par défaut (`groupAfterRoleChange`). C'est un
 * placement PAR DÉFAUT, pas une contrainte : l'administration peut ensuite
 * mettre un administrateur dans un autre groupe, ou un utilisateur dans
 * celui-ci. Il ne se supprime pas — la promotion n'aurait plus où envoyer —,
 * mais se renomme et se règle comme les autres. À sa création, les
 * administrateurs existants y ont été placés (cf. lib/bootstrap.js).
 *
 * ── Où vit l'appartenance ───────────────────────────────────────────────────
 * Sur le document `user` (`groupIds: [id]`), pas dans une collection de
 * liaison : le groupe d'un compte est lu à CHAQUE ouverture de l'app
 * (/init, /auth/session) et à chaque règle de quota, alors qu'on le modifie
 * rarement. Le champ reste un TABLEAU d'un seul identifiant, héritage des
 * groupes multiples : le renommer aurait demandé une reprise sur chaque base
 * et rendu destructeur un retour à l'image précédente, qui lit ce tableau.
 * Supprimer un groupe DOIT le retirer de tous les comptes
 * (`users.detachGroup`), sinon des identifiants morts s'accumulent — le
 * retrait est fait avant la suppression du document, pour qu'un échec laisse
 * un groupe vide plutôt que des membres fantômes.
 *
 * Les identifiants sont des UUID (jamais de `_id` vers le client, comme
 * partout dans l'API), sauf ceux des deux groupes fixes, reconnus partout
 * sans requête.
 *
 * ── Les règles par groupe ───────────────────────────────────────────────────
 * `meetingMinutesPerMonth` : le quota de minutes de réunion, par personne et
 * par mois civil, `null` pour « illimité » (cf. lib/quota.js, qui porte toute
 * la règle). Le groupe par défaut naît illimité : poser une limite est une
 * décision d'administration, jamais un effet de la mise à jour.
 *
 * `infographicAllowed` : le droit de générer une infographie de compte rendu,
 * celui du groupe du compte (`rightsOf`). L'interrupteur « Proposer
 * l'infographie » de la rubrique Modèles IA reste au-dessus : coupé, personne ne génère
 * d'image, quels que soient les groupes (cf. routes/meetings.js).
 *
 * Un nouveau groupe naît SANS le droit : il se donne explicitement. Les deux
 * groupes fixes naissent AVEC, et un groupe par défaut antérieur au champ le
 * lit comme accordé (`normalizeInfographicAllowed`) : sans quoi le déploiement
 * aurait retiré les infographies à tout le monde, en silence. Pour les
 * réserver à quelques personnes, l'administration retire le droit à « Défaut »
 * et le donne à leurs groupes, comme on limite « Défaut » pour un quota de
 * base.
 *
 * `aiHelpAllowed` : le droit d'activer l'Aide IA pendant une réunion (lib/aiHelp/).
 * `aiHelpMyBrainAllowed` : celui de la laisser LIRE myBrain — une lecture faite
 * au nom de l'application, donc la même pour tous les comptes du groupe ; c'est
 * ce droit qui décide de qui voit le wiki partagé à travers elle. Tous deux
 * naissent refusés partout, groupes fixes compris (`rightsOf`).
 *
 * Schéma :
 *   { id, name, nameLower, description, color, isDefault,
 *     meetingMinutesPerMonth, infographicAllowed, aiHelpAllowed,
 *     aiHelpMyBrainAllowed, createdAt, updatedAt, createdBy }
 */
import { randomUUID } from 'node:crypto';

export const GROUPS_COLLECTION = 'userGroups';

/** Identifiant du groupe de naissance de tout compte. */
export const DEFAULT_GROUP_ID = 'default';

/** Nom de naissance du groupe par défaut — renommable ensuite par l'administration. */
export const DEFAULT_GROUP_NAME = 'Défaut';

/** Identifiant du groupe où entre un compte qui devient administrateur. */
export const ADMIN_GROUP_ID = 'admin';

/** Nom de naissance du groupe des administrateurs — renommable lui aussi. */
export const ADMIN_GROUP_NAME = 'Admin';
const ADMIN_GROUP_FALLBACK_NAME = 'Administrateurs';

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
 * Les droits d'un compte, d'après son groupe (un seul, cf. l'en-tête ; la liste
 * est la forme que rendent `groupsOfUser` et ses appelants). Aucun groupe
 * résolu n'arrive que si le groupe par défaut n'existe pas encore (base neuve
 * avant le premier démarrage) : ses droits de naissance s'appliquent alors,
 * ceux que `ensureDefault` lui donnera.
 *
 * `aiHelp` (l'Aide IA d'une réunion) et `aiHelpMyBrain` (la laisser lire
 * myBrain) ne suivent PAS la règle de l'infographie : nés après les groupes,
 * ils n'ont rien à préserver. Absent = refusé, groupe par défaut compris —
 * déployer n'allume l'Aide IA chez personne. Le second ne vaut rien sans le
 * premier : une lecture de myBrain sans Aide IA n'a pas d'écran.
 * @param {Array<object>} groupDocs - documents `userGroups` du compte
 * @returns {{infographic: boolean, aiHelp: boolean, aiHelpMyBrain: boolean}}
 */
export function rightsOf(groupDocs) {
  const list = groupDocs || [];
  if (list.length === 0) return { infographic: true, aiHelp: false, aiHelpMyBrain: false };
  const aiHelp = list.some((doc) => doc?.aiHelpAllowed === true);
  return {
    infographic: list.some(normalizeInfographicAllowed),
    aiHelp,
    aiHelpMyBrain:
      aiHelp &&
      list.some((doc) => doc?.aiHelpAllowed === true && doc?.aiHelpMyBrainAllowed === true),
  };
}

/**
 * Le groupe d'un compte, tel qu'il s'applique : UN identifiant, jamais vide.
 * Un compte sans groupe est dans le groupe par défaut — c'est l'invariant que
 * lisent toutes les projections, quel que soit l'état du document. Un tableau
 * qui en porterait plusieurs (antérieur à la reprise du démarrage) est lu par
 * son premier : la reprise les a ramenés à un seul avant toute requête.
 * @param {unknown} ids - le champ `groupIds` d'un compte
 * @returns {string}
 */
export function groupIdOf(ids) {
  const list = Array.isArray(ids) ? ids : [];
  const first = list.map((id) => String(id || '').trim()).find(Boolean);
  return first || DEFAULT_GROUP_ID;
}

/**
 * Appartenance NORMALISÉE d'un compte, telle qu'elle s'écrit et se projette :
 * un tableau d'UN identifiant (cf. l'en-tête pour le tableau).
 * @param {unknown} ids
 * @returns {string[]}
 */
export function normalizeGroupIds(ids) {
  return [groupIdOf(ids)];
}

/**
 * Le groupe d'un compte qui CHANGE de rôle (cf. l'en-tête, « Admin ») : promu,
 * il entre dans le groupe des administrateurs ; rétrogradé, il quitte ce
 * groupe pour le groupe par défaut. Un rétrogradé que l'administration avait
 * mis dans un autre groupe y reste : ce choix-là n'était pas un effet du rôle.
 * @param {string} currentId - le groupe actuel du compte
 * @param {'user'|'admin'} role - le NOUVEAU rôle
 * @returns {string}
 */
export function groupAfterRoleChange(currentId, role) {
  if (role === 'admin') return ADMIN_GROUP_ID;
  return currentId === ADMIN_GROUP_ID ? DEFAULT_GROUP_ID : currentId;
}

/** Le groupe de naissance d'un compte selon son rôle, faute de choix explicite. */
export function groupForRole(role) {
  return role === 'admin' ? ADMIN_GROUP_ID : DEFAULT_GROUP_ID;
}

/**
 * Le groupe à garder pour un compte qui en avait plusieurs — la reprise du
 * passage à un seul groupe (lib/bootstrap.js). Celui qui lui donnait DÉJÀ ses
 * minutes, le plus généreux (« illimité » l'emportant) : la mise à jour ne
 * retire de minutes à personne. À quota égal, celui qui donne les
 * infographies, puis un autre que le groupe par défaut — y avoir été ajouté
 * était un choix —, puis l'ordre du catalogue.
 * @param {object[]} all - documents `userGroups`, dans l'ordre du catalogue
 * @param {unknown} ids - le champ `groupIds` du compte
 * @returns {string}
 */
export function pickGroupId(all, ids) {
  const wanted = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()));
  const rank = (g) => {
    const minutes = normalizeQuotaMinutes(g.meetingMinutesPerMonth);
    return [
      minutes === null ? Infinity : minutes,
      normalizeInfographicAllowed(g) ? 1 : 0,
      g.id === DEFAULT_GROUP_ID ? 0 : 1,
    ];
  };
  const better = (a, b) => {
    const k = a.findIndex((v, i) => v !== b[i]);
    return k !== -1 && a[k] > b[k];
  };
  let best = null;
  for (const group of all || []) {
    if (!wanted.has(group.id)) continue;
    const r = rank(group);
    if (!best || better(r, best.rank)) best = { id: group.id, rank: r };
  }
  return best ? best.id : groupIdOf(ids);
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
    // Le groupe où entrent les administrateurs : fixe, il ne se supprime pas.
    isAdmin: doc.id === ADMIN_GROUP_ID,
    meetingMinutesPerMonth: normalizeQuotaMinutes(doc.meetingMinutesPerMonth),
    infographicAllowed: normalizeInfographicAllowed(doc),
    aiHelpAllowed: doc.aiHelpAllowed === true,
    // Sans l'Aide IA, la lecture de myBrain n'a pas d'objet : affichée refusée.
    aiHelpMyBrainAllowed: doc.aiHelpAllowed === true && doc.aiHelpMyBrainAllowed === true,
    memberCount,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

/** Projection vers l'UTILISATEUR (« Mon profil ») : le strict nécessaire pour se reconnaître. */
export function toUserGroup(doc) {
  return { id: doc.id, name: doc.name, color: toPublicGroup(doc).color };
}

/**
 * Le groupe d'un compte parmi le catalogue `all` (déjà lu), en liste d'UN
 * document — la forme qu'attendent `rightsOf`, `effectiveLimit` (lib/quota.js)
 * et « Mon profil ». Un identifiant mort (groupe supprimé) rend le groupe
 * par défaut, comme le veut l'invariant. Pure : la lecture du catalogue reste
 * à l'appelant, qui peut la faire une fois pour toute une liste de comptes
 * (cf. lib/teamCredits.js).
 * @param {object[]} all - documents `userGroups`
 * @param {object|null} doc - document `user`
 * @returns {object[]}
 */
export function groupsOfUser(all, doc) {
  const id = groupIdOf(doc?.groupIds);
  const mine = all.find((g) => g.id === id) || all.find((g) => g.id === DEFAULT_GROUP_ID);
  return mine ? [mine] : [];
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
     * Le DOCUMENT du groupe d'un compte, en liste d'un élément (cf.
     * `groupsOfUser`) : un identifiant mort rend le groupe par défaut.
     * @param {object|null} doc - document `user`
     * @returns {Promise<object[]>}
     */
    async docsForUser(doc) {
      return groupsOfUser(await this.list(), doc);
    },

    /**
     * Le groupe d'un compte, projeté pour l'utilisateur (« Mon profil »).
     * @param {object|null} doc - document `user`
     * @returns {Promise<Array<{id: string, name: string, color: string}>>}
     */
    async forUser(doc) {
      return (await this.docsForUser(doc)).map(toUserGroup);
    },

    /**
     * Les droits qu'un compte tient de son groupe (cf. `rightsOf`). SANS
     * l'interrupteur général de la rubrique Modèles IA : l'écran le lit à part, dans les
     * capacités de l'installation, et une porte serveur vérifie les deux.
     * @param {object|null} doc - document `user`
     * @returns {Promise<{infographic: boolean, aiHelp: boolean, aiHelpMyBrain: boolean}>}
     */
    async rightsForUser(doc) {
      return rightsOf(await this.docsForUser(doc));
    },

    /**
     * @param {{name: string, description?: string, color?: string,
     *   meetingMinutesPerMonth?: number|null, infographicAllowed?: boolean,
     *   aiHelpAllowed?: boolean, aiHelpMyBrainAllowed?: boolean,
     *   createdBy?: string}} input
     */
    async create({
      name,
      description = '',
      color = GROUP_COLORS[0],
      meetingMinutesPerMonth = null,
      infographicAllowed = false,
      aiHelpAllowed = false,
      aiHelpMyBrainAllowed = false,
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
        aiHelpAllowed: aiHelpAllowed === true,
        aiHelpMyBrainAllowed: aiHelpMyBrainAllowed === true,
        createdAt: now,
        updatedAt: now,
        createdBy,
      };
      await groups().insertOne(doc);
      return doc;
    },

    /**
     * Champs modifiables : nom, description, couleur, quota, droits — y compris
     * sur les deux groupes fixes. `meetingMinutesPerMonth: null` retire la
     * limite ; un champ absent ne bouge pas.
     */
    async update(
      id,
      {
        name,
        description,
        color,
        meetingMinutesPerMonth,
        infographicAllowed,
        aiHelpAllowed,
        aiHelpMyBrainAllowed,
      },
    ) {
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
      if (aiHelpAllowed !== undefined) $set.aiHelpAllowed = aiHelpAllowed === true;
      if (aiHelpMyBrainAllowed !== undefined)
        $set.aiHelpMyBrainAllowed = aiHelpMyBrainAllowed === true;
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

    /**
     * Crée le groupe des administrateurs s'il manque — illimité, avec tous les
     * droits. Même idempotence que `ensureDefault`. Le booléen rendu dit à la
     * reprise du démarrage d'y placer les administrateurs existants : UNE
     * fois, à la naissance du groupe, pas à chaque démarrage, qui défairait
     * les choix de l'administration.
     *
     * Une installation qui a déjà son propre groupe « Admin » garde le sien :
     * le nouveau naît « Administrateurs », deux cartes du même nom seraient
     * indiscernables.
     * @returns {Promise<boolean>} vrai si le groupe vient d'être créé
     */
    async ensureAdmin() {
      const now = new Date().toISOString();
      const taken = await groups().findOne({
        id: { $ne: ADMIN_GROUP_ID },
        nameLower: groupNameKey(ADMIN_GROUP_NAME),
      });
      const name = taken ? ADMIN_GROUP_FALLBACK_NAME : ADMIN_GROUP_NAME;
      const res = await groups().updateOne(
        { id: ADMIN_GROUP_ID },
        {
          $setOnInsert: {
            id: ADMIN_GROUP_ID,
            name,
            nameLower: groupNameKey(name),
            description: '',
            color: 'violet',
            isDefault: false,
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
