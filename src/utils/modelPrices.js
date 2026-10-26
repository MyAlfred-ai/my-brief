/**
 * Prix des modèles d'IA proposés à un choix (Administration → IA) : le niveau
 * en « € » qui les compare d'un coup d'œil, et l'ordre dans lequel les montrer.
 *
 * Le NIVEAU est relatif aux modèles comparés, et logarithmique : le moins cher
 * vaut « € », et chaque € de plus marque un prix environ DEUX FOIS plus élevé.
 * Une échelle linéaire écraserait tout sous le plus cher (0,16 € et 0,32 €
 * l'heure tomberaient au même niveau face à 0,90 €) ; un simple rang
 * exagérerait les petits écarts (0,24 € et 0,32 € l'heure, deux niveaux
 * d'écart). Le doublement se lit, et s'explique en une phrase à l'écran.
 *
 * Les montants viennent du serveur, en euros (lib/costs/estimate.js,
 * `referencePrices`) : rien n'est chiffré ici.
 */

/** Nombre de « € » de l'échelle. */
export const PRICE_LEVELS = 4;

/**
 * @param {Array<number|null|undefined>} amounts - un montant par modèle, `null` s'il est inconnu
 * @param {{levels?: number}} [options]
 * @returns {Array<number|null>} un niveau de 1 à `levels` par montant, `null` si inconnu
 */
export function priceTiers(amounts, { levels = PRICE_LEVELS } = {}) {
  const known = amounts.filter((amount) => Number.isFinite(amount) && amount > 0);
  const cheapest = known.length ? Math.min(...known) : null;
  return amounts.map((amount) => {
    if (!Number.isFinite(amount) || amount < 0) return null;
    // Gratuit, ou seul à avoir un prix : le bas de l'échelle.
    if (amount === 0 || cheapest === null) return 1;
    return Math.min(levels, 1 + Math.round(Math.log2(amount / cheapest)));
  });
}

/**
 * Les modèles proposés, du moins cher au plus cher, chacun avec son prix et
 * son niveau. Un modèle sans prix connu ferme la marche ; à prix égal, l'ordre
 * du serveur est gardé. Sans prix du tout (tarifs indisponibles), la liste
 * reste celle du serveur, telle quelle.
 *
 * @param {string[]} ids - les modèles proposés, dans l'ordre du serveur
 * @param {Array<{model: string, unitEur: number|null}>|null|undefined} prices
 * @returns {Array<{id: string, unitEur: number|null, tier: number|null}>}
 */
export function pricedChoices(ids, prices) {
  const byModel = new Map((prices || []).map((entry) => [entry.model, entry]));
  const choices = (ids || []).map((id, order) => {
    const unitEur = byModel.get(id)?.unitEur;
    return { id, order, unitEur: Number.isFinite(unitEur) ? unitEur : null };
  });
  const tiers = priceTiers(choices.map((choice) => choice.unitEur));
  return choices
    .map((choice, index) => ({ ...choice, tier: tiers[index] }))
    .sort((a, b) => (a.unitEur ?? Infinity) - (b.unitEur ?? Infinity) || a.order - b.order)
    .map(({ id, unitEur, tier }) => ({ id, unitEur, tier }));
}
