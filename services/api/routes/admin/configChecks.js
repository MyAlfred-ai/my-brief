/**
 * Diagnostic de configuration de l'ORGANISATION — `GET /api/admin/config-checks`.
 *
 * Alimente les pastilles de l'administration : chaque constat nomme la section
 * où il se corrige. Réservé aux administrateurs, seuls à pouvoir corriger. La
 * logique, et le pourquoi des vérifications réelles, sont dans
 * lib/configChecks.js.
 */
import { requireAdmin } from '../../lib/rbac.js';
import { organizationChecks, createVerdictCache } from '../../lib/configChecks.js';

export default function adminConfigChecksRoutes(app) {
  const cache = createVerdictCache();

  app.get('/config-checks', async (req, reply) => {
    if (!requireAdmin(req, reply)) return undefined;
    return { issues: await organizationChecks(app, { cache }) };
  });
}
