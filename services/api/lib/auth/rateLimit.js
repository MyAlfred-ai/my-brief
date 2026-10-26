/**
 * Limiteur de débit en mémoire — fenêtre glissante par clé.
 *
 * Pourquoi maison et pas @fastify/rate-limit : ce qui protège réellement contre
 * le bourrinage ciblé, c'est le compteur PAR COMPTE (5 essais sur cet email),
 * que le plugin ne couvre pas ; son store par défaut est de toute façon une Map
 * en mémoire mono-process, exactement ce qu'il y a ici. Les deux composes ne
 * lancent qu'une réplique d'`api`.
 *
 * Même mécanique que la Map d'OTT de services/mobile-auth/server.js.
 */

/**
 * @param {{windowMs: number, max: number, sweepMs?: number}} opts
 * @returns {{hit(key: string): {allowed: boolean, retryAfterSec: number}, reset(key: string): void, size(): number, stop(): void}}
 */
export function createRateLimiter({ windowMs, max, sweepMs = 60_000 }) {
  /** @type {Map<string, number[]>} clé -> horodatages des tentatives dans la fenêtre */
  const hits = new Map();

  function prune(key, now) {
    const stamps = hits.get(key);
    if (!stamps) return null;
    const kept = stamps.filter((t) => now - t < windowMs);
    if (kept.length === 0) {
      hits.delete(key);
      return null;
    }
    hits.set(key, kept);
    return kept;
  }

  // .unref() est indispensable : sans lui le timer garde la boucle d'événements
  // vivante et le process ne s'arrête plus (ni au SIGTERM, ni en fin de test).
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const key of [...hits.keys()]) prune(key, now);
  }, sweepMs);
  sweeper.unref?.();

  return {
    hit(key) {
      const now = Date.now();
      const stamps = prune(key, now) || [];
      if (stamps.length >= max) {
        const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - stamps[0])) / 1000));
        return { allowed: false, retryAfterSec };
      }
      stamps.push(now);
      hits.set(key, stamps);
      return { allowed: true, retryAfterSec: 0 };
    },
    /** Après une authentification réussie : on ne pénalise pas les essais passés. */
    reset(key) {
      hits.delete(key);
    },
    size() {
      return hits.size;
    },
    stop() {
      clearInterval(sweeper);
      hits.clear();
    },
  };
}
