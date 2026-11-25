/**
 * Client Speechmatics minimal — la transcription, et rien d'autre. Même
 * contrat que les autres fournisseurs tiers (lib/speechProviders.js).
 *
 * Relevé dans la documentation de Speechmatics le 2026-10-27, sans appel réel
 * (aucune clé de test, cf. documentations/TRANSCRIPTION.md §2) :
 *   - direct : clé TEMPORAIRE `type=rt` (POST mp.speechmatics.com/v1/api_keys,
 *     `{ttl}` de 60 à 86 400 s), que le navigateur passe en `?jwt=` — la seule
 *     voie d'un navigateur, qui ne pose pas d'en-tête sur un WebSocket. Elle
 *     n'est liée ni à une région ni à un modèle : le modèle part dans le
 *     `StartRecognition` du navigateur ;
 *   - fichiers : une TÂCHE (POST /v2/jobs, multipart `config` + `data_file`),
 *     sur l'hôte européen, attendue par `?wait=` puis relue jusqu'à `done`.
 *     Hôte UE choisi pour la résidence des données, comme le direct
 *     (eu.rt.speechmatics.com, cf. src/lib/realtime/channel.js).
 */

import { openAsBlob } from 'node:fs';
import { createKeyedRequester, defaultSleep, missingKeyBody, upstreamFailure } from './upstream.js';

const KEYS_URL = 'https://mp.speechmatics.com/v1/api_keys?type=rt';
const BATCH_BASE_URL = 'https://eu1.asr.api.speechmatics.com/v2';

/**
 * Durée de vie de la clé temporaire : la plus courte admise. Elle ne sert qu'à
 * OUVRIR le socket ; la documentation conseille la plus courte possible.
 */
const RT_KEY_TTL_S = 60;

/** Attente bloquante demandée au serveur à chaque relecture d'une tâche. */
const JOB_WAIT_S = 30;

/** Au-delà, l'import échoue plutôt que de tenir /record indéfiniment. */
const JOB_DEADLINE_MS = 10 * 60_000;

/** États d'échec définitif d'une tâche. */
const JOB_FAILED = new Set(['rejected', 'deleted', 'expired']);

/**
 * Langue d'un fichier : celle de l'interface, la même que le direct. Melia 1
 * la prend comme un indice et passe seul d'une langue à l'autre ; Enhanced
 * transcrit dans cette langue.
 */
const DEFAULT_LANGUAGE = 'fr';

async function mintRealtimeKey(request, key) {
  const data = await request(
    KEYS_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: RT_KEY_TTL_S }),
    },
    { key },
  );
  return data?.key_value || '';
}

/**
 * Vérifie une clé CANDIDATE : en demander une clé temporaire, ce qui ne coûte
 * rien et prouve que la clé ouvre le direct (401 si elle est refusée).
 * @param {{apiKey: string, fetchImpl?: Function}} opts
 * @throws {import('./openai.js').UpstreamError}
 */
export async function verifySpeechmaticsKey({ apiKey, fetchImpl = fetch }) {
  const request = createKeyedRequester({
    resolveKey: () => apiKey,
    baseUrl: BATCH_BASE_URL,
    noKeyBody: missingKeyBody('Speechmatics', 'speechmatics'),
    timeoutMs: 15_000,
    fetchImpl,
  });
  await mintRealtimeKey(request, apiKey);
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
export function createSpeechmaticsClient({
  apiKey,
  timeoutMs = 120_000,
  fetchImpl = fetch,
  sleep = defaultSleep,
  now = Date.now,
}) {
  const request = createKeyedRequester({
    resolveKey: typeof apiKey === 'function' ? apiKey : () => apiKey,
    baseUrl: BATCH_BASE_URL,
    noKeyBody: missingKeyBody('Speechmatics', 'speechmatics'),
    // `?wait=` tient la requête ouverte : le délai doit le couvrir largement.
    timeoutMs: Math.max(timeoutMs, (JOB_WAIT_S + 60) * 1000),
    fetchImpl,
  });

  return {
    /**
     * Clé temporaire du direct, sous l'enveloppe commune
     * (`client_secret.value`, cf. /tempkey). Le modèle n'y est pas lié.
     * @param {string} _model
     * @param {{key?: string}} [options] - clé candidate (test de l'écran)
     */
    async realtimeClientSecret(_model, { key } = {}) {
      const value = await mintRealtimeKey(request, key);
      if (!value) throw upstreamFailure(502, 'Speechmatics : clé temporaire absente', 'no_key');
      return { client_secret: { value } };
    },

    /**
     * Transcription d'un fichier : une tâche, attendue côté serveur
     * (`wait`), relue tant qu'elle n'est pas finie. Le texte vient embarqué
     * (`format=txt`) ; à défaut — l'embarquement est « au mieux » — il est
     * relu sur /transcript.
     *
     * @param {{path?: string, buffer?: Buffer, filename?: string, mimetype?: string,
     *          model: string, lang?: string}} params - `model` : `melia-1`, `enhanced`
     * @returns {Promise<{text: string}>}
     */
    async transcribe({
      path,
      buffer,
      filename = 'audio.webm',
      mimetype = 'application/octet-stream',
      model,
      lang,
    }) {
      const file = path
        ? await openAsBlob(path, { type: mimetype })
        : new Blob([buffer], { type: mimetype });
      const form = new FormData();
      form.append('data_file', file, filename);
      form.append(
        'config',
        JSON.stringify({
          type: 'transcription',
          transcription_config: { model, language: lang || DEFAULT_LANGUAGE },
        }),
      );
      let job = await request(`/jobs/?wait=${JOB_WAIT_S}&format=txt`, {
        method: 'POST',
        body: form,
        redirect: 'error',
      });
      const id = job?.id;
      if (!id) throw upstreamFailure(502, 'Speechmatics : tâche sans identifiant', 'no_job');
      const deadline = now() + JOB_DEADLINE_MS;
      for (;;) {
        // Deux formes de réponse : à plat (`{id, status, txt}`, avec `wait`)
        // ou enveloppée (`{job: {status}}`) — on lit les deux.
        const status = job?.status ?? job?.job?.status;
        if (status === 'done') {
          if (typeof job.txt === 'string') return { text: job.txt };
          const text = await request(`/jobs/${id}/transcript?format=txt`, {}, { as: 'text' });
          return { text: String(text || '') };
        }
        if (JOB_FAILED.has(status)) {
          throw upstreamFailure(502, `Speechmatics : tâche ${status}`, `job_${status}`);
        }
        if (now() > deadline) {
          throw upstreamFailure(504, 'Speechmatics : transcription trop longue', 'job_timeout');
        }
        await sleep(1000);
        job = await request(`/jobs/${id}?wait=${JOB_WAIT_S}&format=txt`);
      }
    },
  };
}
