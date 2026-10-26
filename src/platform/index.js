/**
 * Détection de plateforme — web (navigateur/PWA/desktop) vs app native Capacitor.
 *
 * AUCUNE dépendance npm : dans l'app native, le bridge Capacitor injecte
 * `window.Capacitor` (et les proxies `window.Capacitor.Plugins.<Nom>` pour tous
 * les plugins compilés dans l'app) AVANT le chargement du bundle. Sur le web,
 * `window.Capacitor` n'existe pas => isNative=false et tous les adaptateurs de
 * src/platform/ retombent sur le comportement web historique. Le bundle web ne
 * référence donc jamais un module Capacitor.
 */

export const isNative = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

/** 'ios' | 'android' | 'web' */
export const nativePlatform = isNative ? window.Capacitor.getPlatform() : 'web';

/**
 * Proxy d'un plugin natif enregistré par le bridge (app native uniquement).
 * @param {string} name - nom du plugin (ex: 'Filesystem', 'Share', 'KeepAwake')
 * @returns {object}
 */
export function nativePlugin(name) {
  const plugin = typeof window !== 'undefined' && window.Capacitor?.Plugins?.[name];
  if (!plugin) {
    throw new Error(`Plugin natif indisponible: ${name}`);
  }
  return plugin;
}
