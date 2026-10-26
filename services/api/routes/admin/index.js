/**
 * Routes d'administration — montées sous /api/admin.
 *
 * Même contrat d'erreur que /api/auth (vrais codes HTTP + slug stable), et même
 * normalisation des erreurs de validation ajv.
 */
import adminUsersRoutes from './users.js';
import adminGroupsRoutes from './groups.js';
import adminSettingsRoutes from './settings.js';
import adminStatsRoutes from './stats.js';
import adminMyBrainRoutes from './myBrain.js';
import adminConfigChecksRoutes from './configChecks.js';

export default function adminRoutes(app) {
  app.register(
    async (admin) => {
      // Erreurs normalisées par le handler racine (app.js / lib/errors.js).
      adminUsersRoutes(admin);
      adminGroupsRoutes(admin);
      adminSettingsRoutes(admin);
      adminStatsRoutes(admin);
      adminMyBrainRoutes(admin);
      adminConfigChecksRoutes(admin);
    },
    { prefix: '/admin' },
  );
}
