/**
 * Quota de minutes de réunion du compte courant : ce que l'écran affiche en
 * bas à gauche, et relit après chaque fin de réunion, au renouvellement du
 * 1er du mois, et avant de retenir « Démarrer » (src/stores/quota.js).
 *
 * La même forme part déjà avec /init (routes/core.js) : cette route ne sert
 * qu'aux rafraîchissements. La règle et le calcul vivent dans lib/quota.js ;
 * les portes qui REFUSENT sont dans routes/ai.js.
 */
import { requireEmail } from '../lib/identity.js';

export default function quotaRoutes(app) {
  app.get('/quota', async (req, reply) => {
    if (!requireEmail(req, reply)) return;
    return app.quota.statusFor(req.user);
  });
}
