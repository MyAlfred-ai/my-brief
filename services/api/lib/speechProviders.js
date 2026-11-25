/**
 * Les fournisseurs de transcription TIERS, réunis : un client par fournisseur
 * (`app.speech.<fournisseur>`), la vérification d'une clé candidate, et le
 * nettoyage d'une clé collée.
 *
 * Tous tiennent le même contrat, celui que /tempkey, /record et l'écran
 * d'administration appellent sans savoir à qui ils parlent :
 *   - `realtimeClientSecret(model, {key?})` → `{client_secret: {value}}` : le
 *     jeton court que le navigateur présente à SON WebSocket ;
 *   - `transcribe({path, filename, mimetype, model, lang})` → `{text}`.
 * Une erreur amont est une UpstreamError (lib/openai.js), relayée telle quelle.
 *
 * Le client Mistral sait aussi RÉDIGER (`chat()`, même contrat que le client
 * OpenAI) : ses modèles de compte rendu passent par `app.speech.mistral`,
 * sur la même clé (cf. lib/summaryModels.js `summaryClient`).
 *
 * Ajouter un fournisseur : son client ici, ses modèles dans
 * lib/transcriptionModels.js, son dialecte dans src/lib/realtime/channel.js,
 * ses tarifs dans lib/costs/catalog.js, ses textes dans src/config/uiText.js.
 */
import { createMistralClient, verifyMistralKey } from './mistral.js';
import { createSpeechmaticsClient, verifySpeechmaticsKey } from './speechmatics.js';
import { createAssemblyAiClient, verifyAssemblyAiKey } from './assemblyai.js';

const CLIENTS = {
  mistral: createMistralClient,
  speechmatics: createSpeechmaticsClient,
  assemblyai: createAssemblyAiClient,
};

const VERIFIERS = {
  mistral: verifyMistralKey,
  speechmatics: verifySpeechmaticsKey,
  assemblyai: verifyAssemblyAiKey,
};

/**
 * @param {(provider: string) => Promise<string>} resolveKey - clé enregistrée,
 *   relue à chaque appel : une clé remplacée s'applique sans redémarrage
 * @returns {Record<string, ReturnType<typeof createMistralClient>>}
 */
export function createSpeechClients(resolveKey) {
  return Object.fromEntries(
    Object.entries(CLIENTS).map(([provider, create]) => [
      provider,
      create({ apiKey: () => resolveKey(provider) }),
    ]),
  );
}

/**
 * Vérifie une clé CANDIDATE auprès de son fournisseur, avant de l'enregistrer.
 * @param {string} provider
 * @param {string} key
 * @throws {import('./openai.js').UpstreamError} refus, statut et corps du fournisseur
 */
export function verifyProviderKey(provider, key) {
  return VERIFIERS[provider]({ apiKey: key });
}

/**
 * Nettoie une clé collée à la main, comme `normalizeApiKey` pour OpenAI.
 *
 * Ces clés n'ont pas de préfixe : on ne peut que reconnaître ce qu'elles ne
 * sont PAS. Une clé `sk-…` est celle d'OpenAI collée dans le mauvais champ —
 * la confusion la plus probable sur une carte qui les aligne toutes.
 *
 * @param {string} raw
 * @returns {{key: string, problem: string}} `problem` vaut '' si la clé est plausible
 */
export function normalizeProviderKey(raw) {
  const key = String(raw ?? '').replace(/\s+/g, '');
  if (!key) return { key: '', problem: '' };
  if (/^sk-/i.test(key)) return { key, problem: 'provider_key_looks_openai' };
  if (key.length < 20) return { key, problem: 'provider_key_malformed' };
  return { key, problem: '' };
}
