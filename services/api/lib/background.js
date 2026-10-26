/**
 * Suivi des travaux post-réponse (ex. génération de titre après /resume).
 *
 * Remplace l'ancien slot unique `app.background.last` : deux requêtes
 * concurrentes s'y écrasaient mutuellement, et le drain d'arrêt n'attendait
 * que la dernière — un SIGTERM pendant deux /resume simultanés pouvait donc
 * perdre un titre en cours de génération.
 *
 * Chaque promesse suivie se retire du Set en se réglant (succès OU échec) :
 * l'ensemble reste borné par le nombre de travaux réellement en vol.
 * L'appelant reste responsable de son `.catch` — track() n'avale rien.
 */
export function createBackgroundTracker() {
  const pending = new Set();
  return {
    /**
     * @template T
     * @param {Promise<T>} promise
     * @returns {Promise<T>} la même promesse, pour chaînage
     */
    track(promise) {
      pending.add(promise);
      const drop = () => pending.delete(promise);
      promise.then(drop, drop);
      return promise;
    },
    /** Attend le règlement de TOUS les travaux en vol (jamais de rejet). */
    drain() {
      return Promise.allSettled([...pending]);
    },
    get size() {
      return pending.size;
    },
  };
}
