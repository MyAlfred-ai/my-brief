/**
 * Jeton Realtime au DÉMARRAGE d'une réunion : l'appel /tempkey d'App.svelte
 * et la lecture de sa réponse, sortis du composant plafonné (max-lines,
 * cf. eslint.config.js).
 *
 * Renvoie un VERDICT, jamais une exception : c'est App qui décide ensuite
 * selon la plateforme — sur le web on abandonne, dans l'app native on
 * enregistre quand même, hors ligne, et la transcription se fait en différé.
 *
 *   ok          : jeton et modèle de transcription (celui réglé en administration)
 *   auth        : session morte alors que le serveur répond → ré-authentifier
 *   quota       : plus de minutes de réunion ce mois-ci (409 quota_exhausted),
 *                 avec l'état à afficher — une règle de l'organisation, pas
 *                 une panne, natif compris
 *   ai_error    : IA inaccessible (crédit, clé, panne) ; le corps a été
 *                 inspecté pour distinguer « plus de crédit », et logué
 *   unreachable : aucune réponse (hors ligne, serveur injoignable)
 */
import { isOpaqueAuthRedirect, inspectAiServiceError } from './httpErrorHandler.js';

/**
 * @param {{lang: string, fetchRaw: (path: string) => Promise<Response|null>}} deps -
 *   `fetchRaw` : la réponse BRUTE (services/apiClient.js, `raw`) — le corps est
 *   inspecté verbatim, ce que le contrat {ok,status,data} ne rend pas
 * @returns {Promise<{kind: 'ok', secret: string, model: string}
 *   | {kind: 'auth'} | {kind: 'quota', quota: object|null}
 *   | {kind: 'ai_error', info: object|null} | {kind: 'unreachable', error: Error}>}
 */
export async function acquireStartTempKey({ lang, fetchRaw }) {
  const params = new URLSearchParams({ lang });
  let res;
  try {
    res = await fetchRaw(`/tempkey?${params}`);
  } catch (error) {
    return { kind: 'unreachable', error };
  }
  if (!res) return { kind: 'unreachable', error: new Error('tempkey injoignable') };
  // En mode manuel, une redirection donne un type 'opaqueredirect'.
  if (isOpaqueAuthRedirect(res)) return { kind: 'auth' };
  if (res.status === 409) {
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    if (body?.error === 'quota_exhausted') return { kind: 'quota', quota: body.quota || null };
  }
  if (!res.ok) return { kind: 'ai_error', info: await inspectAiServiceError(res, '/tempkey') };
  const data = await res.json();
  return { kind: 'ok', secret: data.value, model: data.transcriptionModel || '' };
}
