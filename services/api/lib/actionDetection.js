/**
 * Chemin d'exécution UNIQUE de la détection d'actions.
 *
 * Deux appelants : la route utilisateur `POST /api/actions`, appelée en continu
 * pendant la réunion, et le banc d'essai de l'administration. Ils passent par
 * ici tous les deux, exprès — un banc d'essai qui referait le prompt à sa façon
 * validerait sa propre façon de le faire, pas ce que vivent les participants.
 * Seuls les RÉGLAGES diffèrent entre les deux appels : ceux de la base pour la
 * réunion, ceux affichés à l'écran pour l'essai. C'est précisément l'objet du
 * banc d'essai.
 */

import { actionsPrompt, parseActionsOutput } from './prompts.js';

/**
 * @param {object} params
 * @param {object} params.openai - client décoré sur l'app
 * @param {string} params.model - identifiant de modèle
 * @param {string} params.content - fenêtre de transcription
 * @param {Array} [params.actions] - actions déjà détectées, avec leur id
 * @param {Array} [params.dismissed] - actions supprimées par l'utilisateur
 * @param {string} [params.language] - langue de l'interface, celle du compte
 *   rendu (repli fr)
 * @param {object} [params.settings] - réglages du groupe `actionDetection`
 * @returns {Promise<{actions: Array, prompt: string}>} `prompt` sert au banc
 *   d'essai, qui montre à l'administrateur la consigne réellement envoyée.
 */
export async function runActionDetection({
  openai,
  model,
  content,
  actions,
  dismissed,
  language,
  settings = {},
}) {
  const prompt = actionsPrompt({ content, actions, dismissed, language, settings });
  const raw = await openai.chat({
    model,
    // EXPLICITE : c'est l'effort que gpt-5-mini appliquait par défaut, et que
    // gpt-6-luna applique aujourd'hui sans le dire — un défaut d'OpenAI qui
    // change ne doit pas changer la détection (cf. lib/config.js).
    reasoningEffort: 'medium',
    messages: [{ role: 'user', content: prompt }],
  });
  return { actions: parseActionsOutput(raw), prompt };
}
