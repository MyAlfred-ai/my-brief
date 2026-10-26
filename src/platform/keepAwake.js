/**
 * Maintien de l'écran allumé, portable web + natif.
 *
 * Web : createWakeLockManager (Wake Lock API + vidéo NoSleep + canvas — les
 * trois couches restent nécessaires en navigateur/PWA, inchangées).
 * Natif : le plugin KeepAwake (@capacitor-community/keep-awake) suffit — plus
 * besoin des hacks. L'enregistrement écran verrouillé, lui, est assuré par
 * src/platform/backgroundRecording.js (FGS Android / mode audio iOS).
 *
 * Interface identique à createWakeLockManager : les méthodes sont des
 * fonctions détachables (App.svelte fait `activateWakeLock = mgr.activate`).
 */

import { isNative, nativePlugin } from './index.js';
import { createWakeLockManager } from '../utils/wakeLock.js';

/**
 * @param {() => boolean} getIsRecording
 * @returns {{ activate: () => Promise<void>, release: () => void, isActive: () => boolean, isSupported: () => boolean, destroy: () => void }}
 */
export function createPlatformWakeLock(getIsRecording) {
  if (!isNative) {
    return createWakeLockManager(getIsRecording);
  }

  let active = false;

  const activate = async () => {
    try {
      await nativePlugin('KeepAwake').keepAwake();
      active = true;
    } catch (e) {
      console.warn('KeepAwake natif indisponible:', (e && e.message) || e);
    }
  };

  const release = () => {
    if (!active) return;
    active = false;
    try {
      nativePlugin('KeepAwake')
        .allowSleep()
        .catch(() => {});
    } catch (_) {
      /* ignore */
    }
  };

  return {
    activate,
    release,
    isActive: () => active,
    isSupported: () => true,
    destroy: release,
  };
}
