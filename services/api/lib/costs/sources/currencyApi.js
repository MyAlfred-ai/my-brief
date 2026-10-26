/**
 * Source de TAUX DE CHANGE de secours : le jeu de données public « currency-api »
 * (github.com/fawazahmed0/exchange-api), servi par le CDN jsDelivr.
 *
 * Pourquoi un secours : les serveurs sur site sortent souvent par un filtrage
 * qui laisse passer les CDN courants et pas le site de la BCE. Le taux est un
 * cours de marché quotidien, pas le taux de référence : la BCE reste donc
 * interrogée en premier (cf. sources/index.js), celui-ci ne sert que si elle
 * est injoignable.
 */

export const CURRENCY_API_URL =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json';

/**
 * @param {object} json - `{date: '2026-09-25', usd: {eur: 0.8795, …}}`
 * @returns {{usdToEur: number, date: string}}
 */
export function parseCurrencyApi(json) {
  const rate = Number(json?.usd?.eur);
  const date = typeof json?.date === 'string' ? json.date : '';
  if (!(rate > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('currency-api: réponse méconnaissable');
  }
  return { usdToEur: rate, date };
}

/** @param {{fetchImpl?: typeof fetch, url?: string, timeoutMs?: number}} [options] */
export function createCurrencyApiSource({
  fetchImpl = globalThis.fetch,
  url = CURRENCY_API_URL,
  timeoutMs = 10_000,
} = {}) {
  return {
    id: 'currency-api',
    async fetchRate() {
      const res = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`currency-api: HTTP ${res.status}`);
      return parseCurrencyApi(await res.json());
    },
  };
}
