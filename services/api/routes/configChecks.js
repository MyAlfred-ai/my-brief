/**
 * Diagnostic de configuration du COMPTE — `GET /api/config-checks`.
 *
 * Ce que le titulaire peut corriger lui-même dans « Ma configuration » : son
 * compte relié, son dossier de dépôt, ses dossiers par tag. Le pendant
 * d'organisation vit sous /api/admin (routes/admin/configChecks.js). La logique,
 * et le pourquoi des vérifications réelles, sont dans lib/configChecks.js.
 *
 * Tout passe par le scope du demandeur (`ownerFilter`, `emailLower`) : aucun
 * paramètre ne désigne un autre compte.
 */
import { requireUser } from '../lib/rbac.js';
import { accountChecks, createVerdictCache } from '../lib/configChecks.js';

export default function configChecksRoutes(app) {
  const cache = createVerdictCache();

  app.get('/config-checks', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    return { issues: await accountChecks(app, user, { cache }) };
  });
}
