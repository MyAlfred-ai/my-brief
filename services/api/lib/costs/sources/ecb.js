/**
 * Source de TAUX DE CHANGE : le taux de référence quotidien de la Banque
 * centrale européenne.
 *
 * Le taux officiel en zone euro — celui des banques et de la comptabilité —,
 * public, sans clé, publié chaque jour ouvré vers 16 h (heure de Francfort).
 * Le fichier donne des devises par euro (`USD rate='1.1370'`) : un dollar vaut
 * donc 1 / 1,1370 euro.
 *
 * Lu par expression régulière plutôt que par un analyseur XML : la structure
 * n'a pas bougé depuis 1999, et une dépendance de plus pour deux attributs ne
 * se justifie pas. Un fichier méconnaissable lève — le taux précédent reste
 * appliqué.
 */

export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

/**
 * @param {string} xml - eurofxref-daily.xml
 * @returns {{usdToEur: number, date: string}}
 */
export function parseEcbDaily(xml) {
  const text = String(xml || '');
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(text)?.[1];
  const eurUsd = Number(/currency=['"]USD['"]\s+rate=['"]([0-9.]+)['"]/.exec(text)?.[1]);
  if (!date || !(eurUsd > 0)) throw new Error('bce: fichier méconnaissable');
  return { usdToEur: 1 / eurUsd, date };
}

/** @param {{fetchImpl?: typeof fetch, url?: string, timeoutMs?: number}} [options] */
export function createEcbSource({
  fetchImpl = globalThis.fetch,
  url = ECB_DAILY_URL,
  timeoutMs = 10_000,
} = {}) {
  return {
    id: 'ecb',
    async fetchRate() {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`bce: HTTP ${res.status}`);
      return parseEcbDaily(await res.text());
    },
  };
}
