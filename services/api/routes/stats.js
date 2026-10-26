/**
 * « Mes statistiques » du compte courant : son usage sur la période choisie et
 * son crédit de temps du mois (src/components/StatsPanel.svelte).
 *
 * Le calcul vit dans lib/personalStats.js, partagé avec la vue qu'un
 * administrateur ouvre sur le compte d'un collègue (routes/admin/stats.js).
 */
import { requireEmail } from '../lib/identity.js';
import { personalStats } from '../lib/personalStats.js';
import { personalStatsQuery } from './auth/schemas.js';

export default function statsRoutes(app) {
  app.get('/stats/me', { schema: { querystring: personalStatsQuery } }, async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    return personalStats(
      { db: app.db, quota: app.quota },
      { email, doc: req.user?.doc },
      req.query?.range || 'month',
    );
  });
}
