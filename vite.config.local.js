import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
  plugins: [
    svelte(),
    Icons({ compiler: 'svelte' }),
    VitePWA({
      // Voir vite.config.js : prompt + pas de skipWaiting pour ne jamais
      // recharger pendant un enregistrement.
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api/, /^\/oauth2/],
        runtimeCaching: [
          {
            // PAS oauth2 : le SW ne doit jamais intercepter le callback OIDC
            // (302 -> no-response). Laisser /oauth2/* passer nativement.
            urlPattern: /^https?:\/\/[^/]+\/api\//,
            handler: 'NetworkOnly',
          },
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
        background_color: '#0f172a',
        theme_color: '#6366f1',
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
        launch_handler: { client_mode: 'focus-existing' },
        prefer_related_applications: false,
      },
    }),
  ],
  base: '/',
  server: {
    proxy: {
      // Dev full-stack sans Traefik : `node --watch services/api/server.js`
      // (port 3000) + mongo via compose.
      //
      // Le proxy REPRODUIT le routage Traefik de production, seul moyen de
      // tester la cohabitation des deux authentifications sans déployer :
      //   - requête portant un cookie mybrief_sess, ou visant /api/auth
      //     -> routeur natif : en-têtes d'identité EFFACÉS + marqueur
      //        x-mybrief-auth-path (= middleware `noident`) ;
      //   - sinon -> routeur OIDC : en-têtes d'identité injectés.
      //
      // Pour tester le chemin mot de passe alors qu'aucune session n'est encore
      // ouverte, deux leviers : DEV_FAKE_OIDC=0 au lancement (npm run
      // dev:local:password), ou, sans redémarrer, le cookie de bascule
      //   document.cookie = 'mybrief_dev_no_oidc=1; path=/'
      // qui coupe la simulation OIDC pour ce navigateur uniquement.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // X-Forwarded-* comme le ferait Traefik. Indispensable : changeOrigin
        // réécrit le Host en localhost:3000, et le contrôle d'origine des
        // routes d'authentification comparerait alors l'Origin du navigateur
        // (localhost:5173) à ce Host réécrit — 403 sur chaque connexion.
        // Donne aussi la vraie IP au rate-limit (Fastify trustProxy).
        xfwd: true,
        configure(proxy) {
          const fakeOidc = process.env.DEV_FAKE_OIDC !== '0';
          proxy.on('proxyReq', (proxyReq, req) => {
            const cookies = req.headers.cookie || '';
            const hasSession = /(^|;\s*)mybrief_sess=/.test(cookies);
            const optedOut = /(^|;\s*)mybrief_dev_no_oidc=1/.test(cookies);
            const isAuthRoute = (req.url || '').startsWith('/api/auth');
            if (hasSession || isAuthRoute || optedOut || !fakeOidc) {
              proxyReq.removeHeader('x-user-email');
              proxyReq.removeHeader('x-auth-request-user');
              proxyReq.removeHeader('x-user-name');
              proxyReq.setHeader('x-mybrief-auth-path', 'native');
            } else {
              proxyReq.setHeader('x-user-email', 'dev@myalfred.ai');
              proxyReq.setHeader('x-user-name', 'Dev Local');
            }
          });
        },
      },
      // Callback Entra — hérité du plugin, donc HORS de /api (cf.
      // services/api/routes/oauth2.js). Le routeur Traefik de production porte
      // le middleware `noident` : on reproduit ici son effet (identité par
      // en-tête effacée) pour que le dev ne soit pas plus permissif que la prod.
      '/oauth2': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        xfwd: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('x-user-email');
            proxyReq.removeHeader('x-auth-request-user');
            proxyReq.removeHeader('x-user-name');
            proxyReq.setHeader('x-mybrief-auth-path', 'native');
          });
        },
      },
    },
  },
});
