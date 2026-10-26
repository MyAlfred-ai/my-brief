// Stub SW pour nettoyer les Service Workers orphelins de l'ancienne version
// MyBrief servie à /mybrief/. Quand un navigateur avec PWA installée à scope
// /mybrief/ tente d'updater son SW, il fetch ce script et :
//   1. skipWaiting → prend immédiatement le contrôle
//   2. unregister → désinscrit le SW
//   3. vide tous les caches
//   4. redirige les onglets ouverts vers /
//
// Le résultat : la prochaine visite repart d'un état propre, avec le SW
// racine (scope /) qui prend le relais via vite-plugin-pwa.
//
// Garder ce fichier indéfiniment — il y aura toujours des PWA installées
// quelque part avec l'ancien scope tant que tous les users n'ont pas reload.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      // 1. Purge tous les caches du scope /mybrief/
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) { /* ignore */ }

    try {
      // 2. Désinscrit ce SW
      await self.registration.unregister();
    } catch (_) { /* ignore */ }

    try {
      // 3. Force les onglets contrôlés à recharger sur /
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        const url = new URL(client.url);
        if (url.pathname.startsWith('/mybrief')) {
          client.navigate('/');
        } else {
          client.navigate(url.pathname + url.search);
        }
      }
    } catch (_) { /* ignore */ }
  })());
});

// Pour les fetch que ce SW intercepterait pendant la fenêtre de vie courte,
// laisse passer au réseau sans intermédiaire.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
