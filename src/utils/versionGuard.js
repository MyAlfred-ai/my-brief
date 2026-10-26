/**
 * Garde de version : détecte qu'une nouvelle version de l'app vient d'être
 * chargée (la version embarquée dans le bundle diffère de celle mémorisée)
 * et purge alors les caches applicatifs hérités pour repartir propre.
 *
 * Ce qui est purgé au changement de version :
 *   - toutes les entrées Cache Storage NON gérées par le service worker
 *     workbox courant (ex. 'mybrief-v2' de l'ancien service worker, anciens
 *     runtime caches). Les précaches workbox ('workbox-precache…') sont
 *     laissés au SW : cleanupOutdatedCaches s'en charge à l'activation.
 *
 * Ce qui n'est PAS touché : le localStorage métier (réunions, transcriptions,
 * résumés en cours) — ce sont des données utilisateur, pas du cache.
 */

import appVersion from '../version.json';

const VERSION_KEY = 'mybrief_app_version';

export async function runVersionGuard() {
  const current = appVersion && appVersion.version;
  if (!current) return;

  let stored = null;
  try {
    stored = localStorage.getItem(VERSION_KEY);
  } catch (_) {
    /* ignore */
  }
  if (stored === current) return;

  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith('workbox-precache')).map((key) => caches.delete(key)),
      );
    } catch (_) {
      /* ignore */
    }
  }

  try {
    localStorage.setItem(VERSION_KEY, current);
  } catch (_) {
    /* ignore */
  }
  if (stored) {
    console.log(`[pwa] version ${stored} -> ${current} : caches applicatifs purgés`);
  }
}
