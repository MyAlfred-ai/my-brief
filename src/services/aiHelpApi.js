/**
 * Aide IA d'une réunion — transport seul (cf. apiClient.js pour le contrat
 * `{ ok, status, data }`). La logique vit dans stores/aiHelp.js.
 */
import { get, post, raw } from './apiClient.js';

/** Ce que le compte peut faire, ses préférences, et ce avec quoi une réunion démarre. */
export const fetchAiHelp = () => get('/ai-help');

/**
 * Réglages → Aide IA : démarrage, sons, voix. Tout champ est facultatif.
 * @param {{start?: object, sounds?: object, voice?: object}} body
 */
export const saveAiHelpPreferences = (body) => post('/ai-help/preferences', body);

/** Les moteurs de voix que l'installation propose — chacun essayé par le serveur. */
export const fetchAiHelpVoices = () => get('/ai-help/voices');

/**
 * Dire un texte avec la voix d'OpenAI ou de Mistral. Le seul appel de l'Aide
 * IA qui rende du BINAIRE (mp3) : il passe par `raw`, et se ramène ici au
 * contrat `{ ok, status, data | error }` — `data` est l'audio.
 * @param {{text: string, provider: string, model: string, voice: string,
 *   language?: string, meetingId?: string}} body
 * @returns {Promise<{ok: boolean, status: number, data?: ArrayBuffer, error?: string}>}
 */
export async function speakAiHelp(body) {
  const res = await raw('/ai-help/speech', { method: 'POST', body });
  if (!res) return { ok: false, status: 0, error: 'network' };
  if (!res.ok) {
    let error = 'voice_failed';
    try {
      const parsed = await res.json();
      if (typeof parsed?.error === 'string') error = parsed.error;
    } catch {
      // Corps illisible : l'échec suffit.
    }
    return { ok: false, status: res.status, error };
  }
  return { ok: true, status: res.status, data: await res.arrayBuffer() };
}

/**
 * Le réglage d'une réunion. Tout champ hors `meetingId` est facultatif : un
 * corps réduit à l'identifiant RELIT la session (projet reconnu d'après le tag).
 * @param {{meetingId: string, enabled?: boolean, domains?: object, agenda?: string,
 *   sound?: boolean, projectPath?: string, projectMode?: 'auto'|'none'}} body
 */
export const saveAiHelpSession = (body) => post('/ai-help/session', body);

/** Une lecture du passage qui vient d'être dit. */
export const watchAiHelp = (body) => post('/ai-help/watch', body);

/** Une question posée à l'IA. */
export const askAiHelp = (body) => post('/ai-help/ask', body);

/** @param {{meetingId: string, itemId: string, state: 'open'|'acknowledged'|'dismissed'}} body */
export const saveAiHelpItemState = (body) => post('/ai-help/item', body);

/** Fiches de projet de myBrain dont le nom ou le contenu répond à `query`. */
export const searchAiHelpProjects = (query) =>
  get(`/ai-help/projects?q=${encodeURIComponent(query)}`);

/** Relie un tag à la fiche d'un projet ; `path` vide le délie. */
export const saveAiHelpTagProject = (tagId, path = '') =>
  post('/ai-help/tag-project', path ? { tagId, path } : { tagId });

// ── Administration → Aide IA ───────────────────────────────────────────────

export const fetchAiHelpAdminSettings = () => get('/admin/settings/ai-help');

/** @param {{domains?: object, wakeWord?: string, pace?: 'quiet'|'normal'|'busy'}} patch */
export const saveAiHelpAdminSettings = (patch) => post('/admin/settings/ai-help', patch);

/** « Tester la lecture » : ce que myBrain rend à myBrief pour une question. */
export const testAiHelpReading = (question) => post('/admin/settings/ai-help/test', { question });
