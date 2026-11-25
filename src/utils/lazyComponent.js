/**
 * Composant chargé À LA DEMANDE : son code (et celui de ses dépendances) part
 * dans un fichier à part, téléchargé et analysé la première fois qu'on
 * l'affiche, plus au démarrage de l'application.
 *
 * Le store vaut `null` tant que le composant n'est pas là, puis le composant —
 * et le garde : rouvrir l'écran ne recharge rien, sans image vide au passage.
 * `preload()` déclenche le chargement sans rien afficher (pendant un temps
 * mort), et rend une promesse. Un échec (réseau coupé, fichier d'une version
 * retirée du serveur par un déploiement) passe `failed` à vrai et autorise
 * une nouvelle tentative à l'affichage suivant.
 *
 * @param {() => Promise<{default: any}>} load - `() => import('./X.svelte')`
 */
import { writable } from 'svelte/store';

export function lazyComponent(load) {
  const component = writable(null);
  const failed = writable(false);
  let pending = null;

  function preload() {
    if (!pending) {
      failed.set(false);
      pending = load().then(
        (module) => {
          component.set(module.default);
          return module.default;
        },
        (error) => {
          pending = null;
          failed.set(true);
          console.warn('[lazyComponent] chargement impossible :', error?.message || error);
          return null;
        },
      );
    }
    return pending;
  }

  return { subscribe: component.subscribe, failed, preload };
}
