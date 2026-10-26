/**
 * Relance avec backoff exponentiel + jitter, pour appels IDEMPOTENTS
 * uniquement (relire, régénérer, rafraîchir un token). Jamais pour un envoi
 * dont l'échec est ambigu — un gmailSend timeout a peut-être DÉJÀ envoyé,
 * le relancer doublerait le mail.
 *
 * Le timeout par tentative reste porté par l'appelant (AbortSignal.timeout
 * dans les clients OpenAI/Gmail) : withRetry n'ajoute pas le sien.
 */

/** Attente réutilisable — injectable pour les tests à fake timers. */
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Erreur transitoire « évidente » : réseau coupé (fetch rejette en TypeError),
 * DNS, connexion refusée. Les TimeoutError en sont EXCLUS volontairement :
 * relancer un appel qui vient de consommer son timeout entier (120 s pour un
 * chat) double la latence perçue pour un gain incertain.
 */
export function isNetworkError(err) {
  if (!err) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return false;
  // undici enveloppe les pannes réseau dans TypeError('fetch failed').
  return err instanceof TypeError || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
}

/**
 * @template T
 * @param {() => Promise<T>} fn - l'appel à (re)jouer
 * @param {Object} [opts]
 * @param {number} [opts.attempts=3] - nombre TOTAL de tentatives
 * @param {number} [opts.baseMs=500] - délai avant la 2e tentative
 * @param {number} [opts.maxMs=8000] - plafond du délai entre tentatives
 * @param {(err: Error) => boolean} [opts.retryOn=isNetworkError] - décide si
 *   l'erreur mérite une relance ; tout le reste est relancé immédiatement
 * @param {(ms: number) => Promise<void>} [opts.sleep] - injectable (tests)
 * @param {() => number} [opts.random] - injectable (tests) — jitter [0,1)
 * @returns {Promise<T>}
 */
export async function withRetry(
  fn,
  {
    attempts = 3,
    baseMs = 500,
    maxMs = 8000,
    retryOn = isNetworkError,
    sleep = defaultSleep,
    random = Math.random,
  } = {},
) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !retryOn(err)) throw err;
      // Backoff exponentiel plein-jitter : évite que N clients en panne
      // simultanée re-frappent l'amont au même instant.
      const cap = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      await sleep(Math.floor(cap * (0.5 + random() * 0.5)));
    }
  }
  throw lastErr;
}
