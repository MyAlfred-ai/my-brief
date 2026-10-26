/**
 * Sources en ligne de l'actualisation des tarifs, dans leur ordre d'essai.
 *
 * Deux contrats, volontairement minuscules — c'est tout ce qu'une nouvelle
 * source doit savoir faire pour entrer ici :
 *
 *   source de tarifs  { id, fetchPrices([{id, provider}]) → {modèle: tarif en $} }
 *   source de change  { id, fetchRate() → {usdToEur, date} }
 *
 * Les tarifs sont demandés à chaque source À TOUR DE RÔLE, pour les seuls
 * modèles que les précédentes n'ont pas trouvés : un fournisseur absent de
 * LiteLLM s'ajoute avec sa propre source, derrière, sans toucher aux autres.
 * Le change s'arrête à la première source qui répond.
 */
import { createLiteLlmSource } from './litellm.js';
import { createEcbSource } from './ecb.js';
import { createCurrencyApiSource } from './currencyApi.js';

/**
 * @param {{fetchImpl?: typeof fetch}} [options]
 * @returns {{prices: Array<object>, fx: Array<object>}}
 */
export function createPriceSources({ fetchImpl = globalThis.fetch } = {}) {
  return {
    prices: [createLiteLlmSource({ fetchImpl })],
    fx: [createEcbSource({ fetchImpl }), createCurrencyApiSource({ fetchImpl })],
  };
}
