/**
 * Jetons de réinitialisation de mot de passe (collection `authResetToken`).
 *
 * Même principe que les sessions : le jeton part par email en clair, seul son
 * SHA-256 est stocké. Une fuite de la base ne permet pas de forger un lien de
 * réinitialisation.
 */
import { randomBytes } from 'node:crypto';
import { hashToken } from './sessions.js';

export const RESET_COLLECTION = 'authResetToken';

const DEFAULT_TTL_MS = 30 * 60 * 1000;

/**
 * @param {object} db
 * @param {{ttlMs?: number}} [opts]
 */
export function createResetTokenStore(db, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const tokens = () => db.collection(RESET_COLLECTION);

  return {
    ttlMs,

    /** @returns {Promise<{token: string, expiresAt: Date}>} */
    async issue({ emailLower, ip = null }) {
      const token = randomBytes(32).toString('base64url');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);
      await tokens().insertOne({
        tokenHash: hashToken(token),
        emailLower,
        createdAt: now,
        expiresAt,
        usedAt: null,
        ip,
      });
      return { token, expiresAt };
    },

    /**
     * Consommation ATOMIQUE : le filtre exige `usedAt: null` et la mise à jour
     * le positionne dans la même opération. Deux requêtes concurrentes portant
     * le même lien ne peuvent pas réussir toutes les deux — un findOne suivi
     * d'un update laisserait cette fenêtre ouverte.
     *
     * Le contrôle applicatif d'`expiresAt` double l'index TTL, qui ne passe que
     * toutes les 60 s.
     *
     * @returns {Promise<{emailLower: string}|null>}
     */
    async consume(token) {
      if (!token) return null;
      const doc = await tokens().findOneAndUpdate(
        { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (!doc) return null;
      return { emailLower: doc.emailLower };
    },

    /** Après une réinitialisation réussie, ou un reset décidé par un admin. */
    async purgeFor(emailLower) {
      if (!emailLower) return;
      await tokens().deleteMany({ emailLower });
    },
  };
}
