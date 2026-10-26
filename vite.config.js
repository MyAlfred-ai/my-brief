import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
  plugins: [
    svelte(),
    // Icônes Solar (iconify) compilées en composants Svelte — bundlées, zéro réseau
    Icons({ compiler: 'svelte' }),
    VitePWA({
      // `prompt` (et PAS skipWaiting) : le nouveau SW attend notre feu vert.
      // main.js applique la mise à jour immédiatement (reload, comme avant)…
      // SAUF pendant un enregistrement — un reload détruirait la réunion en
      // cours. Dans ce cas la nouvelle version s'active au prochain chargement.
      registerType: 'prompt',
      // On enregistre le SW nous-mêmes via `virtual:pwa-register` dans main.js
      // (pour brancher le reload sur activation d'une nouvelle version).
      // `false` évite que le plugin injecte EN PLUS le script minimal
      // /registerSW.js (qui, lui, ne recharge jamais la page après update).
      injectRegister: false,
      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,svg}'],
        // Le bundle principal a dépassé les 2 Mio par défaut de workbox le
        // 09/09/2026 (2 100 751 octets) : au-delà, vite-plugin-pwa FAIT
        // ÉCHOUER le build, et la recette ne se déployait plus. 3 Mio le garde
        // précaché — donc l'app utilisable hors ligne — comme avant. Palliatif :
        // le vrai remède est de découper ce bundle, pas de remonter ce plafond.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: null,
        navigateFallbackDenylist: [/^\/api/, /^\/oauth2/, /^\/oauth2\/callback/, /^\/$/],
        runtimeCaching: [
          {
            // API applicative : toujours réseau, jamais de cache.
            // PAS oauth2 ici : le SW ne doit jamais intercepter le flow OIDC.
            urlPattern: /^https?:\/\/[^/]+\/api(\/|$)/,
            handler: 'NetworkOnly',
          },
          // PAS de handler pour les navigations. Le SW ne doit JAMAIS les
          // intercepter : le shell est protégé OIDC, donc sur session expirée une
          // navigation (ex. forceReauth -> location.replace('/?_reauth=...'))
          // reçoit un 302 vers Google. Si le SW l'intercepte (NetworkOnly), la
          // redirection top-level devient un fetch "depuis la frame" -> le
          // navigateur bloque le cross-origin ("Unsafe attempt to load URL ...
          // from frame") MAIS le 302 a déjà réécrit le cookie CSRF -> clobber ->
          // "Invalid state parameter (CSRF mismatch)" au callback suivant.
          // Le shell n'étant jamais précaché (globPatterns sans .html), laisser
          // les navigations passer nativement = toujours frais + 1 seule init OIDC.
        ],
      },
      manifest: {
        name: 'MyBrief by MyAlfred',
        short_name: 'MyBrief',
        description: 'Transcription et résumé intelligent de réunions',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFFEFC',
        theme_color: '#F38400',
        categories: ['productivity', 'business'],
        permissions: ['microphone', 'background-sync'],
        icons: [
          {
            src: 'android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        handle_links: 'preferred',
        launch_handler: {
          client_mode: 'auto',
        },
        prefer_related_applications: false,
      },
    }),
  ],
  base: '/',
});
