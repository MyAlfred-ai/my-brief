// Vite pour les captures : la configuration locale du dépôt — identité OIDC simulée comprise —,
// branchée sur l'API jetable de lancer.sh plutôt que sur celle de la pile de dev.
import { mergeConfig } from 'vite';
import local from '../../../vite.config.local.js';

const api = `http://localhost:${process.env.CAPTURE_API_PORT ?? 3100}`;

export default mergeConfig(local, {
  server: { proxy: { '/api': { target: api }, '/oauth2': { target: api } } },
});
