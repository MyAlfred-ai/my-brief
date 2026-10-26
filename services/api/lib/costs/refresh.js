/**
 * « Actualiser les tarifs » : relever en ligne les prix des modèles et le taux
 * de change, et les fondre dans le dernier relevé.
 *
 * À la DEMANDE seulement, jamais à l'affichage : une page de statistiques ne
 * doit ni attendre un fichier de 3 Mo, ni dépendre d'un site tiers pour
 * s'afficher. Sans clic, l'écran applique le dernier relevé (cf. pricing.js).
 *
 * Un échec n'efface RIEN. Chaque source est essayée à part (cf. sources/index.js)
 * et ce qu'elle n'a pas pu fournir garde sa valeur précédente : des tarifs
 * frais avec un taux de change d'hier valent mieux que pas de tarifs frais du
 * tout. `updated` et `missing` disent à l'écran ce qui a réellement bougé.
 */
import { sanitizeFx, sanitizePrice } from './pricing.js';

/**
 * @param {object} input
 * @param {Array<{id: string, provider?: string}>} input.requests - modèles à tarifer
 * @param {{prices: Array<object>, fx: Array<object>}} input.sources - cf. sources/index.js
 * @param {object|null} [input.previous] - dernier relevé enregistré
 * @param {Date} [input.now]
 * @returns {Promise<{snapshot: {models: object, fx: object|null},
 *   updated: {prices: number, fx: boolean}, missing: string[],
 *   errors: Array<{source: string, message: string}>}>}
 */
export async function refreshPricing({ requests, sources, previous = null, now = new Date() }) {
  const checkedAt = now.toISOString();
  const models = {};
  const errors = [];

  let pending = [...new Map(requests.map((request) => [request.id, request])).values()];
  for (const source of sources.prices || []) {
    if (!pending.length) break;
    try {
      const found = (await source.fetchPrices(pending)) || {};
      for (const { id } of pending) {
        const price = sanitizePrice({ ...found[id], checkedAt, source: source.id });
        if (price) models[id] = price;
      }
      pending = pending.filter(({ id }) => !models[id]);
    } catch (err) {
      errors.push({ source: source.id, message: String(err?.message || err) });
    }
  }

  let fx = null;
  for (const source of sources.fx || []) {
    try {
      fx = sanitizeFx({ ...(await source.fetchRate()), fetchedAt: checkedAt, source: source.id });
      if (fx) break;
      errors.push({ source: source.id, message: 'taux hors bornes' });
    } catch (err) {
      errors.push({ source: source.id, message: String(err?.message || err) });
    }
  }

  return {
    snapshot: {
      models: { ...(previous?.models || {}), ...models },
      fx: fx || previous?.fx || null,
    },
    updated: { prices: Object.keys(models).length, fx: !!fx },
    missing: pending.map(({ id }) => id),
    errors,
  };
}
