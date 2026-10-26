/**
 * Bouton retour d'Android — branchement natif.
 *
 * La décision (quoi fermer, ou passer en arrière-plan) est dans
 * utils/backNavigation.js, testée sans appareil ; ce module ne fait que la
 * brancher sur l'événement `backButton` du plugin App.
 *
 * Android seulement : iOS n'a pas de bouton retour, et sur le web (navigateur,
 * PWA) le retour appartient au navigateur. L'écouteur est posé une fois par
 * chargement de page : Capacitor retire tous les écouteurs au rechargement de
 * la WebView (`Bridge.reset()` dans `onPageStarted`), rien ne s'accumule.
 */
import { isNative, nativePlatform, nativePlugin } from './index.js';
import { resolveBackAction, performBackAction } from '../utils/backNavigation.js';

let installed = false;

export function installBackButton() {
  if (installed || !isNative || nativePlatform !== 'android') return;
  try {
    const app = nativePlugin('App');
    app.addListener('backButton', () => {
      performBackAction(resolveBackAction(document), {
        minimize: () => app.minimizeApp().catch(() => {}),
      });
    });
    installed = true;
  } catch (e) {
    // Plugin absent (build trop ancienne) : le comportement par défaut reste.
    console.warn('[retour] bouton retour Android non branché:', (e && e.message) || e);
  }
}
