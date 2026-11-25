/**
 * Client AssemblyAI minimal — la transcription, et rien d'autre. Même contrat
 * que les autres fournisseurs tiers (lib/speechProviders.js).
 *
 * Relevé dans la documentation d'AssemblyAI le 2026-10-27, sans appel réel
 * (aucune clé de test, cf. documentations/TRANSCRIPTION.md §2) :
 *   - authentification : la clé TELLE QUELLE dans `Authorization`, sans
 *     `Bearer` (contrairement aux autres) ;
 *   - direct : jeton TEMPORAIRE (GET streaming.assemblyai.com/v3/token,
 *     `expires_in_seconds` de 1 à 600 — la fenêtre pour OUVRIR le socket, pas
 *     la durée de la session, plafonnée à 3 h), passé en `?token=` par le
 *     navigateur. Non lié au modèle : `speech_model` part dans l'URL du socket ;
 *   - fichiers : envoi (POST /v2/upload), transcription (POST /v2/transcript),
 *     relecture jusqu'à `completed`.
 *
 * Hôtes « globaux » et non européens (streaming.eu / api.eu existent) : la
 * documentation ne publie le jeton que sur l'hôte global, et ne dit pas qu'un
 * jeton global ouvre un socket européen. Ne pas basculer sans l'avoir mesuré.
 */

import { openAsBlob } from 'node:fs';
import { createKeyedRequester, defaultSleep, missingKeyBody, upstreamFailure } from './upstream.js';

const TOKEN_URL = 'https://streaming.assemblyai.com/v3/token';
const API_BASE_URL = 'https://api.assemblyai.com/v2';

/** Fenêtre d'ouverture du socket : une minute, comme l'exemple de la documentation. */
const TOKEN_TTL_S = 60;

/** Pas de relecture d'une transcription de fichier. */
const POLL_MS = 3000;

/** Au-delà, l'import échoue plutôt que de tenir /record indéfiniment. */
const TRANSCRIPT_DEADLINE_MS = 10 * 60_000;

/**
 * Universal-2 en repli : il couvre 99 langues quand Universal-3.5 Pro (18) ne
 * reconnaît pas celle du fichier — l'ordre que donne la documentation.
 */
const FALLBACK_FILE_MODEL = 'universal-2';

const authorize = (key) => ({ Authorization: key });

async function mintToken(request, key) {
  const data = await request(`${TOKEN_URL}?expires_in_seconds=${TOKEN_TTL_S}`, {}, { key });
  return data?.token || '';
}

/**
 * Vérifie une clé CANDIDATE : en demander un jeton, ce qui ne coûte rien (401
 * si la clé est refusée).
 * @param {{apiKey: string, fetchImpl?: Function}} opts
 * @throws {import('./openai.js').UpstreamError}
 */
export async function verifyAssemblyAiKey({ apiKey, fetchImpl = fetch }) {
  const request = createKeyedRequester({
    resolveKey: () => apiKey,
    baseUrl: API_BASE_URL,
    authorize,
    noKeyBody: missingKeyBody('AssemblyAI', 'assemblyai'),
    timeoutMs: 15_000,
    fetchImpl,
  });
  await mintToken(request, apiKey);
  return { ok: true };
}

/**
 * @param {Object} opts
 * @param {string|(() => string|Promise<string>)} opts.apiKey - relue à chaque appel
 * @param {number} [opts.timeoutMs]
 * @param {Function} [opts.fetchImpl] - injectable pour les tests
 * @param {(ms: number) => Promise<void>} [opts.sleep] - injectable pour les tests
 * @param {() => number} [opts.now]
 */
export function createAssemblyAiClient({
  apiKey,
  timeoutMs = 120_000,
  fetchImpl = fetch,
  sleep = defaultSleep,
  now = Date.now,
}) {
  const request = createKeyedRequester({
    resolveKey: typeof apiKey === 'function' ? apiKey : () => apiKey,
    baseUrl: API_BASE_URL,
    authorize,
    noKeyBody: missingKeyBody('AssemblyAI', 'assemblyai'),
    timeoutMs,
    fetchImpl,
  });

  return {
    /**
     * Jeton temporaire du direct, sous l'enveloppe commune
     * (`client_secret.value`, cf. /tempkey). Le modèle n'y est pas lié.
     * @param {string} _model
     * @param {{key?: string}} [options] - clé candidate (test de l'écran)
     */
    async realtimeClientSecret(_model, { key } = {}) {
      const value = await mintToken(request, key);
      if (!value) throw upstreamFailure(502, 'AssemblyAI : jeton absent', 'no_token');
      return { client_secret: { value } };
    },

    /**
     * Transcription d'un fichier. Le fichier part en flux depuis le disque
     * (`redirect: 'error'`, cf. lib/openai.js), puis la transcription est
     * relue jusqu'à son terme. Langue détectée par AssemblyAI : l'import
     * OpenAI ne la donne pas non plus.
     *
     * @param {{path?: string, buffer?: Buffer, mimetype?: string, model: string}} params
     * @returns {Promise<{text: string}>}
     */
    async transcribe({ path, buffer, mimetype = 'application/octet-stream', model }) {
      const file = path
        ? await openAsBlob(path, { type: mimetype })
        : new Blob([buffer], { type: mimetype });
      const upload = await request('/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
        redirect: 'error',
      });
      if (!upload?.upload_url)
        throw upstreamFailure(502, 'AssemblyAI : envoi sans adresse', 'no_upload');
      let transcript = await request('/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: upload.upload_url,
          speech_models: [model, FALLBACK_FILE_MODEL],
          language_detection: true,
        }),
      });
      const id = transcript?.id;
      if (!id)
        throw upstreamFailure(502, 'AssemblyAI : transcription sans identifiant', 'no_transcript');
      const deadline = now() + TRANSCRIPT_DEADLINE_MS;
      for (;;) {
        if (transcript?.status === 'completed') return { text: transcript.text || '' };
        if (transcript?.status === 'error') {
          throw upstreamFailure(
            502,
            `AssemblyAI : ${transcript.error || 'échec'}`,
            'transcript_error',
          );
        }
        if (now() > deadline) {
          throw upstreamFailure(
            504,
            'AssemblyAI : transcription trop longue',
            'transcript_timeout',
          );
        }
        await sleep(POLL_MS);
        transcript = await request(`/transcript/${id}`);
      }
    },
  };
}
