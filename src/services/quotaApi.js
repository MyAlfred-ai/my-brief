/**
 * Client de GET /api/quota : les minutes de réunion restantes du compte.
 * Transport et contrat { ok, status, data } : services/apiClient.js.
 * La même forme arrive déjà avec /api/init ; cette route sert aux relectures.
 */
import { get } from './apiClient.js';

export const fetchQuota = () => get('/quota');
