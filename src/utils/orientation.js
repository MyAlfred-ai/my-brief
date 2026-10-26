/**
 * Verrouillage de l'orientation en portrait sur mobile.
 *
 * - PWA installée (Android / Chrome) : `screen.orientation.lock('portrait')`
 *   fonctionne en display-mode standalone/fullscreen → verrou matériel réel.
 * - Navigateur classique (iOS Safari, Chrome mobile en onglet) : le lock est
 *   refusé par le navigateur ; le fallback est l'overlay CSS
 *   `.rotate-overlay` (style.css) qui masque l'app en paysage et invite
 *   l'utilisateur à repasser en portrait.
 *
 * Les échecs sont silencieux : sur desktop ou navigateur non compatible,
 * l'app fonctionne normalement.
 */

function isMobileLike() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

async function tryLock() {
  if (typeof screen === 'undefined') return false;
  const orientation = screen.orientation;
  if (!orientation || typeof orientation.lock !== 'function') return false;
  try {
    await orientation.lock('portrait');
    return true;
  } catch (e) {
    // NotSupportedError (iOS), SecurityError (pas en standalone/fullscreen)…
    // → fallback overlay CSS, rien à faire ici.
    return false;
  }
}

/**
 * Tente de verrouiller l'orientation portrait sur mobile, et re-tente
 * automatiquement quand l'app (re)passe au premier plan — le lock peut être
 * relâché par le navigateur quand l'onglet est mis en arrière-plan.
 *
 * @returns {() => void} cleanup — retire les listeners.
 */
export function lockPortraitOrientation() {
  if (!isMobileLike()) return () => {};

  tryLock();

  const onVisible = () => {
    if (document.visibilityState === 'visible') tryLock();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
  };
}
