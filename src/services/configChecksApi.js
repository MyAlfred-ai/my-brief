/**
 * Diagnostic de configuration — ce qui reste à régler, section par section.
 * Transport et contrat { ok, status, data } : services/apiClient.js. La réponse
 * est `{ issues: [{ section, code, level, vars? }] }`, des codes que l'écran
 * traduit (config/uiText.js → configChecks) ; le pourquoi est dans
 * services/api/lib/configChecks.js.
 */
import { get } from './apiClient.js';

/** Le compte : compte relié, dossier de dépôt, dossiers par tag. */
export const fetchAccountChecks = () => get('/config-checks');

/** L'organisation — administrateurs seulement. */
export const fetchOrganizationChecks = () => get('/admin/config-checks');
