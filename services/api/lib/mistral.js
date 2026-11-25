/**
 * Client Mistral minimal — la transcription Voxtral et la rédaction des
 * comptes rendus. Même contrat que les autres fournisseurs tiers
 * (lib/speechProviders.js), plus celui du client OpenAI pour rédiger :
 *   - realtimeClientSecret() : jeton `rt_…` du direct (POST /client/sessions) ;
 *   - transcribe()           : fichier (import audio, segments hors ligne) ;
 *   - chat()                 : compte rendu (POST /chat/completions), quand un
 *                              modèle Mistral est choisi (lib/summaryModels.js).
 *
 * Le jeton suit le contrat d'OpenAI : la clé ne quitte jamais le serveur, le
 * navigateur ouvre son WebSocket DIRECTEMENT chez Mistral avec un jeton court,
 * lié au modèle. Relevé dans la documentation de Mistral le 2026-10-27, sans
 * appel réel : aucune clé de test (cf. documentations/TRANSCRIPTION.md §2).
 */

import { openAsBlob } from 'node:fs';
import { UpstreamError } from './openai.js';
import { createKeyedRequester, missingKeyBody } from './upstream.js';

const DEFAULT_BASE_URL = 'https://api.mistral.ai/v1';

/**
 * Texte d'une réponse de chat. Une chaîne, d'ordinaire ; une LISTE de morceaux
 * quand le modèle raisonne (Medium 3.5, Small 4 et Large 4 le savent) : la
 * trace (`thinking`) précède la réponse (`text`). Relevé dans la documentation
 * de Mistral le 2026-10-29 — seule la réponse est gardée, jamais la trace, qui
 * finirait dans le compte rendu.
 * @param {unknown} content
 * @returns {string}
 */
export function chatText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((chunk) => chunk?.type === 'text' && typeof chunk.text === 'string')
    .map((chunk) => chunk.text)
    .join('');
}

/**
 * Vérifie une clé CANDIDATE avant de l'enregistrer : `/models`, gratuit, qui
 * distingue une clé refusée (401) d'un réseau coupé. Même raison que
 * `verifyOpenAiKey` : une clé fausse ne doit pas casser la transcription chez
 * l'utilisateur, loin de l'écran où elle a été collée.
 *
 * @param {{apiKey: string, baseUrl?: string, fetchImpl?: Function, timeoutMs?: number}} opts
 * @returns {Promise<{ok: true}>}
 * @throws {UpstreamError}
 */
export async function verifyMistralKey({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 15_000,
}) {
  const res = await fetchImpl(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new UpstreamError(
      res.status,
      await res.text(),
      res.headers.get('content-type') || 'application/json',
    );
  }
  return { ok: true };
}

/**
 * @param {Object} opts
 * @param {string|(() => string|Promise<string>)} opts.apiKey - clé, ou fonction
 *   qui la relit à CHAQUE appel (même raison que le client OpenAI : une clé
 *   remplacée dans l'administration s'applique sans redémarrage)
 * @param {string} [opts.baseUrl]
 * @param {number} [opts.timeoutMs]
 * @param {Function} [opts.fetchImpl] - injectable pour les tests
 */
export function createMistralClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = 120_000,
  fetchImpl = fetch,
}) {
  const request = createKeyedRequester({
    resolveKey: typeof apiKey === 'function' ? apiKey : () => apiKey,
    baseUrl,
    noKeyBody: missingKeyBody('Mistral', 'mistral'),
    timeoutMs,
    fetchImpl,
  });

  return {
    /**
     * Jeton court du direct, lié à `model` : Mistral refuse un socket ouvert
     * avec un autre modèle que celui du jeton. La langue n'y figure pas, elle
     * part dans le `session.update` du navigateur.
     *
     * `key` force une clé CANDIDATE — le test de l'écran d'administration, qui
     * éprouve une clé collée mais pas encore enregistrée. Jamais stockée.
     *
     * @param {string} model
     * @param {{key?: string}} [options]
     * @returns {Promise<{client_secret: {value: string, expires_at: string}}>}
     */
    async realtimeClientSecret(model, { key } = {}) {
      return request(
        '/client/sessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purpose: 'realtime', model }),
        },
        { key },
      );
    },

    /**
     * Chat completion — même signature que celle du client OpenAI, pour que
     * /resume rédige sans savoir qui répond (lib/summaryModels.js).
     *
     * `verbosity` et `reasoningEffort` sont REÇUS mais jamais envoyés : Mistral
     * ne connaît pas le premier, Large 3 pas le second, et l'API refuse un
     * champ qu'elle ne connaît pas — une génération sur deux répondrait 422.
     * Le modèle garde son comportement par défaut.
     *
     * `key` force une clé CANDIDATE (le test de l'écran), jamais stockée.
     *
     * @param {{model: string, messages: Array<{role: string, content: string}>,
     *          verbosity?: string, reasoningEffort?: string, timeoutMs?: number,
     *          key?: string}} params
     * @returns {Promise<string>}
     */
    async chat({ model, messages, timeoutMs: perCallTimeoutMs, key }) {
      const data = await request(
        '/chat/completions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages }),
        },
        { key, timeoutMs: perCallTimeoutMs },
      );
      return chatText(data?.choices?.[0]?.message?.content);
    },

    /**
     * Synthèse vocale (Voxtral TTS) — la voix de l'Aide IA. Mistral rend du
     * JSON, l'audio en base64 dans `audio_data` (et non le binaire d'OpenAI) ;
     * il REFUSE tout champ inconnu (422 `extra_forbidden`, relevé sur
     * `speed`) : rien d'autre ne part que ce qu'il documente.
     *
     * @param {{model: string, voice: string, input: string, key?: string}} params
     * @returns {Promise<Buffer>} mp3
     */
    async speech({ model, voice, input, key }) {
      const data = await request(
        '/audio/speech',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input, voice_id: voice, response_format: 'mp3' }),
        },
        { key, timeoutMs: 60_000 },
      );
      const audio = typeof data?.audio_data === 'string' ? data.audio_data : '';
      if (!audio) throw new UpstreamError(502, JSON.stringify({ error: 'empty_audio' }));
      return Buffer.from(audio, 'base64');
    },

    /**
     * Les voix PRÉRÉGLÉES du compte Mistral (`type=preset`) : celles qu'on
     * peut proposer à tous. Les voix clonées d'un espace de travail n'y sont
     * pas — elles appartiennent à qui les a créées.
     *
     * @returns {Promise<Array<{id: string, label: string, languages: string[]}>>}
     */
    async voices({ key } = {}) {
      const data = await request('/audio/voices?type=preset&limit=100', { method: 'GET' }, { key });
      const items = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
          ? data.data
          : [];
      return items
        .map((voice) => ({
          id: String(voice?.slug || voice?.id || ''),
          label: String(voice?.name || voice?.slug || voice?.id || ''),
          languages: (Array.isArray(voice?.languages) ? voice.languages : [])
            .map((lang) => String(lang))
            .filter(Boolean),
        }))
        .filter((voice) => voice.id);
    },

    /**
     * Transcription d'un fichier — même signature que celle du client OpenAI,
     * même lecture par morceaux depuis le disque et même `redirect: 'error'`
     * (cf. lib/openai.js : sans lui, fetch garde chaque octet envoyé). Pas de
     * `language` : Voxtral la détecte, comme le fait déjà l'import OpenAI.
     *
     * @param {{path?: string, buffer?: Buffer, filename?: string, mimetype?: string,
     *          model: string}} params - `path` OU `buffer`
     * @returns {Promise<{text: string}>}
     */
    async transcribe({
      path,
      buffer,
      filename = 'audio.webm',
      mimetype = 'application/octet-stream',
      model,
    }) {
      const file = path
        ? await openAsBlob(path, { type: mimetype })
        : new Blob([buffer], { type: mimetype });
      const form = new FormData();
      form.append('file', file, filename);
      form.append('model', model);
      const data = await request('/audio/transcriptions', {
        method: 'POST',
        body: form,
        redirect: 'error',
      });
      return { text: data?.text ?? '' };
    },
  };
}
