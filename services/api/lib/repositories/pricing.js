/**
 * Dernier relevé des tarifs d'IA — réglage d'ORGANISATION,
 * `appSettings{key:'pricing'}`.
 *
 * Ce document n'est écrit que par « Actualiser les tarifs » (Administration →
 * Statistiques) : les prix relevés en ligne, modèle par modèle, et le taux de
 * change. Il ne REMPLACE pas le catalogue livré avec l'application, il le
 * RECOUVRE — le plus récent des deux gagne, modèle par modèle (cf.
 * lib/costs/pricing.js). Le supprimer à la main ramène donc simplement l'écran
 * au relevé intégré, sans rien casser.
 *
 * Module à part, comme repositories/myBrainSettings.js : repositories/settings.js
 * n'avait pas à grossir d'un domaine qui ne partage rien avec les siens. Rien de
 * secret ici — des prix publics.
 */
import { SETTINGS_COLLECTION } from './settings.js';

export const PRICING_SETTINGS_KEY = 'pricing';

export function createPricingRepo(db) {
  const settings = () => db.collection(SETTINGS_COLLECTION);

  return {
    /** @returns {Promise<object|null>} le dernier relevé, ou `null` s'il n'y en a jamais eu */
    async get() {
      return settings().findOne({ key: PRICING_SETTINGS_KEY }, { projection: { _id: 0 } });
    },

    /**
     * Remplace le relevé. Les tarifs arrivent DÉJÀ fusionnés avec le précédent
     * et nettoyés (lib/costs/refresh.js) : ce dépôt ne fait qu'écrire.
     *
     * @param {{models: object, fx: object|null}} snapshot
     * @param {{actor?: string|null}} [context] - email de l'administrateur
     */
    async save({ models, fx }, { actor = null } = {}) {
      const now = new Date().toISOString();
      await settings().updateOne(
        { key: PRICING_SETTINGS_KEY },
        {
          $set: { models, fx, refreshedAt: now, refreshedBy: actor },
          $setOnInsert: { key: PRICING_SETTINGS_KEY, createdAt: now },
        },
        { upsert: true },
      );
      return this.get();
    },
  };
}
