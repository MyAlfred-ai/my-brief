/**
 * Comptes externes reliés par les utilisateurs (collection `userConnections`).
 *
 * Un document par couple (utilisateur, fournisseur) :
 *   { emailLower, provider, account, refreshToken, scopes[], drive, ... }
 *
 * `emailLower` est le compte myBrief ; `account` l'adresse du compte EXTERNE
 * autorisé, qui peut différer (on se connecte à myBrief avec son adresse
 * professionnelle et on relie une adresse Gmail personnelle).
 *
 * Le refresh token ne sort JAMAIS de l'API — les routes ne renvoient que
 * `{ connected, account }`.
 *
 * Il est CHIFFRÉ au repos quand `CONNECTIONS_ENC_KEY` est posée. L'objection
 * qui valait auparavant reste vraie — chiffrer avec une clé rangée dans la même
 * base ne protégerait de rien — et c'est exactement pourquoi cette clé vient de
 * l'environnement. Ce qu'on protège est la copie de base séparée de son
 * environnement : mongodump, archive de `backup.sh`, volume récupéré. Un
 * refresh token y vaut le pouvoir d'écrire depuis la boîte d'une personne,
 * indéfiniment et à son insu.
 *
 * Clé absente ⇒ stockage en clair, exactement comme avant. Connexions
 * existantes en clair ⇒ elles continuent de fonctionner et se re-scellent à
 * leur prochaine écriture : personne n'est forcé de se reconnecter.
 *
 * `scopes` est ce qui distingue une connexion capable de déposer sur le Drive
 * d'une connexion héritée de l'époque « Gmail seul » : les secondes continuent
 * d'envoyer des mails sans re-consentement, et n'obtiennent le Drive qu'à leur
 * prochaine reconnexion.
 */

const COLLECTION = 'userConnections';

/** Normalise la chaîne `scope` renvoyée par un token endpoint en tableau. */
export function parseScopes(scope) {
  if (Array.isArray(scope)) return scope.filter(Boolean);
  return String(scope || '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Lie un chiffré à SA ligne. Déplacer un document d'un compte à un autre — le
 * seul geste utile à qui sait écrire dans Mongo sans connaître la clé — casse
 * alors le déchiffrement au lieu d'offrir la boîte de la victime.
 */
const aadFor = (emailLower, provider) => `${provider}|${emailLower}`;

/**
 * Projection sortante. Le refresh token n'en fait jamais partie tel qu'il est
 * STOCKÉ : il en sort déchiffré, à l'usage des expéditeurs.
 *
 * Une enveloppe illisible (clé changée, document altéré ou déplacé) rend `null`
 * — soit exactement « pas de connexion ». C'est le bon comportement : les trois
 * causes appellent la même réponse, une reconnexion, et l'interface la propose
 * déjà pour une connexion absente.
 */
function toConnection(doc, secretBox) {
  if (!doc?.refreshToken) return null;
  const refreshToken = secretBox.open(doc.refreshToken, aadFor(doc.emailLower, doc.provider));
  if (!refreshToken) return null;
  return {
    provider: doc.provider || 'google',
    account: doc.account || '',
    refreshToken,
    scopes: Array.isArray(doc.scopes) ? doc.scopes : [],
    drive: doc.drive || null,
  };
}

/**
 * @param {object} db
 * @param {{enabled: boolean, seal: Function, open: Function}} [secretBox]
 *   Coffre inerte par défaut : le dépôt lit et écrit en clair, comportement
 *   historique. Injecté depuis app.js.
 */
export function createConnectionsRepo(
  db,
  secretBox = {
    enabled: false,
    seal: (v) => String(v),
    open: (v) => (typeof v === 'string' ? v : ''),
  },
) {
  const connections = () => db.collection(COLLECTION);

  return {
    /**
     * Connexion active d'un utilisateur.
     *
     * Un utilisateur n'en a qu'une en pratique — l'installation choisit son
     * fournisseur, l'interface ne propose qu'un bouton. Une bascule
     * d'installation (Google → Microsoft) peut en laisser deux le temps que les
     * utilisateurs se reconnectent : on retient alors la plus récente, celle
     * qui correspond au consentement le plus frais.
     *
     * @param {string} emailLower
     * @returns {Promise<{provider: string, account: string, refreshToken: string,
     *   scopes: string[], drive: object|null}|null>}
     */
    async get(emailLower) {
      const docs = await connections().find({ emailLower }).sort({ updatedAt: -1 }).toArray();
      for (const doc of docs) {
        const connection = toConnection(doc, secretBox);
        if (connection) return connection;
      }
      return null;
    },

    /** Connexion d'un fournisseur précis, `null` si l'utilisateur ne l'a pas reliée. */
    async getByProvider(emailLower, provider) {
      return toConnection(await connections().findOne({ emailLower, provider }), secretBox);
    },

    /**
     * Enregistre (ou remplace) la connexion d'un utilisateur chez un fournisseur.
     *
     * Le cache de dossier Drive n'est PAS conservé : les scopes viennent de
     * changer, et rien ne dit que le nouveau compte voit le même dossier.
     *
     * @param {string} emailLower
     * @param {{provider: string, account: string, refreshToken: string, scopes: string[]}} payload
     */
    async set(emailLower, { provider, account, refreshToken, scopes = [] }) {
      const now = new Date().toISOString();
      await connections().updateOne(
        { emailLower, provider },
        {
          $set: {
            account,
            refreshToken: secretBox.seal(refreshToken, aadFor(emailLower, provider)),
            scopes,
            drive: null,
            updatedAt: now,
          },
          $setOnInsert: { emailLower, provider, createdAt: now },
        },
        { upsert: true },
      );
    },

    /**
     * Mémorise le dossier de dépôt résolu chez le fournisseur, pour éviter de
     * le rechercher à chaque envoi. `folderPath` est conservé afin d'invalider
     * le cache si l'administrateur change le chemin cible.
     *
     * `driveId` en fait partie depuis SharePoint : le chemin « CR/2026 » désigne
     * deux dossiers différents dans deux bibliothèques, et réutiliser
     * l'identifiant de l'une pour l'autre déposerait au mauvais endroit. Vide
     * pour Google et pour le OneDrive personnel, qui n'ont qu'une racine.
     */
    async setDriveCache(emailLower, provider, { folderPath, folderId, driveId = '' }) {
      await connections().updateOne(
        { emailLower, provider },
        {
          $set: { drive: { folderPath, folderId, driveId, resolvedAt: new Date().toISOString() } },
        },
      );
    },

    /** Oublie le dossier mémorisé — appelé quand le fournisseur ne le trouve plus. */
    async clearDriveCache(emailLower, provider) {
      await connections().updateOne({ emailLower, provider }, { $set: { drive: null } });
    },

    /** @returns {Promise<boolean>} vrai si un document existait */
    async delete(emailLower, provider) {
      const res = await connections().deleteOne({ emailLower, provider });
      return (res?.deletedCount || 0) > 0;
    },

    /**
     * Toutes les connexions d'un utilisateur — utilisé à la suppression du
     * compte, pour révoquer chaque jeton avant d'effacer.
     */
    async listFor(emailLower) {
      const docs = await connections().find({ emailLower }).toArray();
      return docs.map((doc) => toConnection(doc, secretBox)).filter(Boolean);
    },

    /** @returns {Promise<number>} nombre de connexions supprimées */
    async deleteAllFor(emailLower) {
      const res = await connections().deleteMany({ emailLower });
      return res?.deletedCount || 0;
    },
  };
}
