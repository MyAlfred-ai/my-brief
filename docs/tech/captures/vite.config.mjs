// Vite pour les captures : la configuration locale du dépôt — identité OIDC simulée comprise —,
// branchée sur l'API jetable de lancer.sh plutôt que sur celle de la pile de dev.
import { mergeConfig } from 'vite';
import local from '../../../vite.config.local.js';
import { ADMINISTRATRICE, COOKIE } from './administratrice.mjs';

const api = `http://localhost:${process.env.CAPTURE_API_PORT ?? 3100}`;
const simulerIdentite = local.server.proxy['/api'].configure;
const basculeAdmin = new RegExp(`(^|;\\s*)${COOKIE}=1`);

export default mergeConfig(local, {
  server: {
    proxy: {
      '/api': {
        target: api,
        // Le navigateur qui porte le cookie de bascule (administratrice.mjs) entre sous l'identité
        // de l'administratrice fictive ; les autres restent Camille Martin. Les écouteurs passent
        // dans l'ordre : celui-ci corrige l'en-tête que vient de poser vite.config.local.js.
        configure(proxy, options) {
          simulerIdentite(proxy, options);
          proxy.on('proxyReq', (proxyReq, req) => {
            if (!proxyReq.getHeader('x-user-email') || !basculeAdmin.test(req.headers.cookie || '')) return;
            proxyReq.setHeader('x-user-email', ADMINISTRATRICE.email);
            proxyReq.setHeader('x-user-name', ADMINISTRATRICE.nom);
          });
        },
      },
      '/oauth2': { target: api },
    },
  },
});
