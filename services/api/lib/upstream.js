/**
 * Requêtes vers un fournisseur TIERS (Mistral, Speechmatics, AssemblyAI) — ce que leurs clients partagent : la clé relue à chaque appel,
 * le refus net quand elle manque, les relances, et l'erreur amont relayée
 * verbatim (UpstreamError, la même que pour OpenAI : les routes la relaient
 * sans savoir qui a répondu).
 *
 * Le client OpenAI (lib/openai.js) garde son propre `request` : plus ancien,
 * et sa forme est figée par ses tests.
 */
import { withRetry, isNetworkError } from './retry.js';
import { UpstreamError } from './openai.js';

/** Même règle que le client OpenAI : panne réseau, 429 et 5xx. */
export const retryOnUpstream = (err) =>
  err instanceof UpstreamError ? err.status === 429 || err.status >= 500 : isNetworkError(err);

/**
 * Corps d'erreur « aucune clé » : même forme que les corps d'OpenAI, pour que
 * l'écran l'affiche comme les autres refus.
 * @param {string} label - nom de marque (« Speechmatics »)
 * @param {string} provider - identifiant (`speechmatics`)
 */
export function missingKeyBody(label, provider) {
  return JSON.stringify({
    error: {
      message:
        `Aucune clé ${label} n'est configurée. Un administrateur peut la renseigner ` +
        "dans Administration → IA, carte Fournisseurs d'IA.",
      code: 'provider_key_missing',
      provider,
    },
  });
}

/** Erreur amont synthétique (tâche refusée, délai dépassé) au format des autres. */
export function upstreamFailure(status, message, code) {
  return new UpstreamError(status, JSON.stringify({ error: { message, code } }));
}

/**
 * @param {Object} opts
 * @param {() => string|Promise<string>} opts.resolveKey - clé relue à chaque appel
 * @param {string} opts.baseUrl - préfixe des chemins relatifs
 * @param {(key: string) => object} [opts.authorize] - en-tête d'authentification
 * @param {string} opts.noKeyBody - corps du 503 quand aucune clé n'est configurée
 * @param {number} [opts.timeoutMs]
 * @param {Function} [opts.fetchImpl]
 * @returns {(path: string, init?: object,
 *   options?: {key?: string, as?: 'json'|'text', timeoutMs?: number}) => Promise<any>}
 *   `path` relatif à `baseUrl`, ou URL absolue (un fournisseur a plusieurs
 *   hôtes) ; `key` force une clé CANDIDATE (test de l'écran, jamais stockée) ;
 *   `timeoutMs` déborde le défaut pour un appel (un compte rendu long).
 */
export function createKeyedRequester({
  resolveKey,
  baseUrl,
  authorize = (key) => ({ Authorization: `Bearer ${key}` }),
  noKeyBody,
  timeoutMs = 120_000,
  fetchImpl = fetch,
}) {
  return async function request(
    path,
    init = {},
    { key: candidateKey, as = 'json', timeoutMs: perCallTimeoutMs } = {},
  ) {
    const key = candidateKey || (await resolveKey());
    // Hors du withRetry : ce 503 n'est pas une panne amont, le relancer serait absurde.
    if (!key) throw new UpstreamError(503, noKeyBody);
    const url = /^https?:\/\//.test(path) ? path : `${baseUrl}${path}`;
    return withRetry(
      async () => {
        const res = await fetchImpl(url, {
          ...init,
          headers: { ...authorize(key), ...(init.headers || {}) },
          signal: AbortSignal.timeout(perCallTimeoutMs ?? timeoutMs),
        });
        if (!res.ok) {
          throw new UpstreamError(
            res.status,
            await res.text(),
            res.headers.get('content-type') || 'application/json',
          );
        }
        return as === 'text' ? res.text() : res.json();
      },
      { retryOn: retryOnUpstream },
    );
  };
}

/** Attente entre deux interrogations d'une tâche de fichier ; injectable (tests). */
export const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
