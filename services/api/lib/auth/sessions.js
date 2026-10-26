/**
 * Sessions natives — jetons opaques stockés en base (collection `authSession`).
 *
 * Pourquoi pas un JWT en cookie : le cahier des charges impose qu'un reset de
 * mot de passe par l'admin invalide immédiatement les sessions. Avec un JWT il
 * faudrait une liste de révocation, donc un store de toute façon — autant que
 * le store SOIT la session. Le coût est d'un findOne indexé par requête, sans
 * commune mesure avec les appels OpenAI des autres endpoints.
 *
 * Le jeton n'est stocké que HACHÉ (SHA-256) : une fuite de la base ne donne
 * aucune session utilisable. C'est le même raisonnement que pour les mots de
 * passe, en moins coûteux (le jeton fait déjà 256 bits d'entropie, il n'a pas
 * besoin d'un KDF lent).
 */
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COLLECTION = 'authSession';

/**
 * Valeurs admises pour `provider` — tout le reste retombe sur `password`. Une
 * chaîne libre finirait affichée telle quelle par le frontend.
 */
export const SESSION_PROVIDERS = new Set(['password', 'google', 'entra']);

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * L'expiration est glissante mais on ne réécrit pas le document à chaque
 * requête : tant qu'il reste plus d'une heure sur l'ancienne échéance, on ne
 * touche à rien. Sans ce garde-fou, chaque appel d'API deviendrait une écriture
 * Mongo.
 */
const TOUCH_THRESHOLD_MS = 60 * 60 * 1000;

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/**
 * @param {object} db
 * @param {{ttlMs?: number}} [opts]
 */
export function createSessionStore(db, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const sessions = () => db.collection(SESSION_COLLECTION);

  return {
    ttlMs,

    /**
     * @param {string} emailLower
     * @param {{ip?: string, userAgent?: string, provider?: string}} [meta]
     *   `provider` = par quoi CETTE session a été ouverte. Enregistré ici et
     *   non déduit du compte : un compte peut avoir plusieurs fournisseurs liés
     *   (`authProviders`), seul celui de la session en cours décrit la
     *   connexion réelle — c'est lui que l'avatar affiche.
     * @returns {Promise<{token: string, expiresAt: Date}>}
     */
    async create(emailLower, meta = {}) {
      const token = randomBytes(32).toString('base64url');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);
      await sessions().insertOne({
        tokenHash: hashToken(token),
        emailLower,
        createdAt: now,
        expiresAt,
        provider: SESSION_PROVIDERS.has(meta.provider) ? meta.provider : 'password',
        ip: meta.ip || null,
        userAgent: (meta.userAgent || '').slice(0, 200) || null,
      });
      return { token, expiresAt };
    },

    /**
     * ⚠️ Le filtre contrôle `expiresAt` en plus de l'index TTL : le moniteur TTL
     * de Mongo ne passe que toutes les 60 s, un document peut donc survivre à
     * sa propre expiration. S'en remettre à l'index seul prolongerait les
     * sessions d'une minute — et rendrait le test « session expirée » vert à
     * tort.
     * @returns {Promise<object|null>}
     */
    async resolve(token) {
      if (!token) return null;
      return sessions().findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
    },

    /** Prolonge la session si elle approche de son échéance. */
    async touch(session) {
      if (!session) return;
      const now = Date.now();
      const expiresAt =
        session.expiresAt instanceof Date ? session.expiresAt : new Date(session.expiresAt);
      if (expiresAt.getTime() - now > ttlMs - TOUCH_THRESHOLD_MS) return;
      await sessions().updateOne(
        { tokenHash: session.tokenHash },
        { $set: { expiresAt: new Date(now + ttlMs) } },
      );
    },

    async destroy(token) {
      if (!token) return;
      await sessions().deleteOne({ tokenHash: hashToken(token) });
    },

    /** Révocation globale : reset de mot de passe, désactivation, suppression. */
    async destroyAllFor(emailLower) {
      if (!emailLower) return;
      await sessions().deleteMany({ emailLower });
    },
  };
}
