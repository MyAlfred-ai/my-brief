/**
 * Client OpenAI minimal — fetch natif Node 20, zéro dépendance.
 *
 * Trois opérations, celles qu'exécutaient les nodes n8n :
 *   - chat()                 : chat completions (résumé, titre, actions)
 *   - transcribe()           : transcription de fichier (import audio / segments hors ligne)
 *   - realtimeClientSecret() : jeton éphémère Realtime (transcription live)
 *
 * Relai des erreurs amont : le frontend inspecte le CORPS des non-2xx pour
 * distinguer « crédit épuisé » du reste (CREDIT_SIGNATURES dans
 * src/utils/httpErrorHandler.js) — on relaie donc le corps OpenAI VERBATIM.
 * Le statut est préservé pour 402/429/5xx ; les autres (401 clé invalide,
 * 400…) sont remappés en 502 : un 401 OpenAI relayé tel quel serait pris par
 * le frontend pour une session expirée -> boucle de ré-authentification.
 */

import { openAsBlob } from 'node:fs';
import { withRetry, isNetworkError } from './retry.js';
import { DEFAULT_TRANSCRIPTION_MODEL, FILE_TRANSCRIPTION_MODEL } from './transcriptionModels.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * Modèles qui acceptent `reasoning_effort` — les familles gpt-5 et gpt-6, hors
 * variante `-chat` qui ne raisonne pas et le refuse.
 *
 * Le garde-fou n'est PAS cosmétique : envoyer `verbosity` à gpt-4o-mini fait
 * répondre 400 « unrecognized request argument » à OpenAI, donc casse toute
 * génération sur une installation restée sur l'ancien modèle. On filtre ici
 * plutôt qu'aux appelants : ils demandent un COMPORTEMENT (« développe »,
 * « sois bref »), le client décide si le modèle sait l'entendre.
 *
 * gpt-6 n'y figure QUE pour `reasoning_effort` (relevé dans la documentation
 * OpenAI le 2026-10-14, `none` compris pour `gpt-6-luna`) : elle ne dit rien de
 * `verbosity` pour cette génération. On ne l'envoie donc pas — un compte rendu
 * imposé sur gpt-6 par `OPENAI_MODEL_SUMMARY` garde la verbosité par défaut
 * plutôt que de risquer un 400 à chaque génération.
 */
const REASONING_MODEL_RE = /^gpt-[56](?!-chat)/;
const VERBOSITY_MODEL_RE = /^gpt-5(?!-chat)/;

/**
 * Valeurs acceptées, RELEVÉES auprès d'OpenAI le 2026-09-02 (le message d'erreur
 * les énumère) et vérifiées une par une sur gpt-5.6-sol, gpt-5.4 et
 * gpt-5.4-mini.
 *
 * ⚠️ `minimal` N'EXISTE PLUS : c'était une valeur de la génération 5.0, et la
 * passer à un modèle 5.4/5.6 fait répondre 400 « Unsupported value ». Elle a
 * été écrite ici de bonne foi, et faisait échouer 100 % des appels concernés —
 * d'où ces listes, plutôt qu'une valeur devinée au prochain ajout.
 */
export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'];
export const VERBOSITY_LEVELS = ['low', 'medium', 'high'];

/**
 * Relançable : panne réseau, 429 (rate limit passager) et 5xx amont. Les
 * timeouts et les 4xx métier (401 clé, 402 crédit) ne le sont pas — cf.
 * lib/retry.js. Sûr parce que chat/transcribe/realtimeClientSecret sont
 * idempotents : rejouer une génération ne crée rien côté OpenAI.
 */
const retryOnUpstream = (err) =>
  err instanceof UpstreamError ? err.status === 429 || err.status >= 500 : isNetworkError(err);

/** Aucune clé configurée : cas normal d'une installation neuve, pas une panne. */
const NO_KEY_BODY = JSON.stringify({
  error: {
    message:
      "Aucune clé OpenAI n'est configurée. Un administrateur peut la renseigner " +
      'dans Administration → IA.',
    code: 'openai_key_missing',
  },
});

/** Erreur amont OpenAI — transporte statut + corps pour relai verbatim. */
export class UpstreamError extends Error {
  constructor(status, body, contentType = 'application/json') {
    super(`openai upstream ${status}`);
    this.name = 'UpstreamError';
    this.status = status;
    this.body = body;
    this.contentType = contentType;
  }
}

/**
 * Message d'erreur d'OpenAI, extrait du corps d'une UpstreamError. Sans lui,
 * l'écran n'afficherait qu'un « échec » muet là où l'amont dit précisément ce
 * qui ne va pas (clé révoquée, quota épuisé, organisation suspendue…).
 * @returns {string} '' quand le corps n'en porte pas
 */
export function upstreamMessage(err) {
  try {
    return JSON.parse(err.body)?.error?.message || '';
  } catch (_) {
    return '';
  }
}

/** Statut HTTP à renvoyer au frontend pour une erreur amont donnée. */
export function relayStatus(upstreamStatus) {
  if (upstreamStatus === 402 || upstreamStatus === 429 || upstreamStatus >= 500)
    return upstreamStatus;
  return 502;
}

/**
 * Répond à la requête en relayant une UpstreamError ; relance les autres.
 * Utilitaire partagé par toutes les routes qui appellent OpenAI.
 */
export function replyUpstreamError(reply, err) {
  if (err instanceof UpstreamError) {
    reply.code(relayStatus(err.status)).header('content-type', err.contentType).send(err.body);
    return;
  }
  throw err;
}

/**
 * Refus d'un audio trop LONG pour le modèle de fichier — pas trop lourd : les
 * 25 Mo sont tenus par /record, mais gpt-4o-transcribe plafonnait à ~1 400-
 * 1 500 s quand whisper-1 n'avait aucune limite de durée. Celle de
 * gpt-transcribe n'est pas documentée : on reconnaît le message relevé sous
 * gpt-4o-transcribe (« audio duration 1800.024 seconds is longer than 1500
 * seconds which is the maximum for this model »), seule trace connue, pour
 * dire à l'utilisateur de couper son fichier au lieu de lui citer OpenAI.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isAudioTooLong(err) {
  return (
    err instanceof UpstreamError &&
    err.status === 400 &&
    /longer than [\d.]+ seconds/i.test(String(err.body))
  );
}

/**
 * Nettoie une clé saisie à la main et signale les fautes de collage courantes.
 *
 * Les espaces et retours à la ligne viennent d'un copier-coller depuis un mail
 * ou un terminal ; le préfixe doublé (`sk-sk-…`) vient d'une clé recollée
 * par-dessus un champ qui contenait déjà `sk-`. Les deux produisent une clé
 * refusée par OpenAI avec un message générique — autant les nommer ici.
 *
 * On ne « répare » PAS la clé au passage : retirer silencieusement un préfixe
 * en trop reviendrait à deviner un secret. On refuse en disant quoi corriger.
 *
 * @param {string} raw
 * @returns {{key: string, problem: string}} `problem` vaut '' si la clé est plausible
 */
export function normalizeApiKey(raw) {
  const key = String(raw ?? '').replace(/\s+/g, '');
  if (!key) return { key: '', problem: '' };
  if (/^sk-sk-/i.test(key)) return { key, problem: 'openai_key_doubled_prefix' };
  if (!/^sk-/i.test(key) || key.length < 20) return { key, problem: 'openai_key_malformed' };
  return { key, problem: '' };
}

/**
 * Vérifie une clé CANDIDATE auprès d'OpenAI avant de l'enregistrer.
 *
 * `/models` est la sonde la moins chère : rien de facturé, aucun modèle à
 * choisir, et elle distingue une clé invalide (401) d'un réseau coupé.
 * Enregistrer sans vérifier laisserait une clé fausse casser toute
 * l'application — la panne se manifesterait au premier enregistrement d'un
 * utilisateur, loin de l'écran où l'erreur a été commise.
 *
 * @param {{apiKey: string, baseUrl?: string, fetchImpl?: Function, timeoutMs?: number}} opts
 * @returns {Promise<{ok: true}>}
 * @throws {UpstreamError} statut et corps OpenAI, pour relai verbatim
 */
export async function verifyOpenAiKey({
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
 * @param {string|(() => string|Promise<string>)} opts.apiKey - clé OpenAI, ou
 *   fonction qui la résout à CHAQUE appel (serveur uniquement, jamais côté
 *   client). La forme fonction est ce qui permet à un administrateur de
 *   remplacer la clé depuis l'interface sans redémarrer le service : une valeur
 *   figée au démarrage resterait celle du `.env` jusqu'au prochain déploiement.
 *   Le coût est un `findOne` indexé par appel OpenAI — négligeable devant les
 *   100 ms à 2 min d'un appel amont, et sans invalidation de cache à écrire.
 * @param {string} [opts.baseUrl]
 * @param {number} [opts.timeoutMs]
 * @param {Function} [opts.fetchImpl] - injectable pour les tests
 */
export function createOpenAiClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
}) {
  const resolveKey = typeof apiKey === 'function' ? apiKey : () => apiKey;

  async function request(path, init, { timeoutMs: perCallTimeoutMs } = {}) {
    const key = await resolveKey();
    // Installation neuve sans clé : on ne part PAS appeler OpenAI avec un
    // `Bearer ` vide, dont la réponse 401 serait indiscernable d'une clé
    // révoquée. Le message dit où la renseigner. Hors du withRetry : ce 503
    // synthétique n'est pas une panne amont, le relancer serait absurde.
    if (!key) throw new UpstreamError(503, NO_KEY_BODY);

    return withRetry(
      async () => {
        const res = await fetchImpl(`${baseUrl}${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${key}`, ...(init.headers || {}) },
          signal: AbortSignal.timeout(perCallTimeoutMs ?? timeoutMs),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new UpstreamError(
            res.status,
            body,
            res.headers.get('content-type') || 'application/json',
          );
        }
        return res.json();
      },
      { retryOn: retryOnUpstream },
    );
  }

  return {
    /**
     * Chat completion — renvoie le contenu texte du premier choix.
     *
     * `verbosity` et `reasoningEffort` sont le SEUL levier d'API sur le volume
     * et la profondeur de la sortie, et ils manquaient : sans eux la famille
     * gpt-5 répond en « medium/medium », c'est-à-dire nettement plus court que
     * ce que rend l'application ChatGPT sur le même prompt (elle demande une
     * réponse développée). Ils sont ignorés hors famille qui les connaît — cf.
     * REASONING_MODEL_RE. Toujours pas de `temperature` : gpt-5 ne l'accepte
     * pas, et les autres usages s'en passaient déjà.
     *
     * `timeoutMs` déborde le défaut par appel : un résumé de réunion longue
     * avec raisonnement dépasse couramment les 2 minutes, là où le titre ou la
     * relecture de phrases répondent en quelques secondes.
     *
     * @param {{model: string, messages: Array<{role: string, content: string}>,
     *          verbosity?: 'low'|'medium'|'high',
     *          reasoningEffort?: 'none'|'low'|'medium'|'high'|'xhigh',
     *          timeoutMs?: number}} params
     * @returns {Promise<string>}
     */
    async chat({ model, messages, verbosity, reasoningEffort, timeoutMs: perCallTimeoutMs }) {
      const name = String(model || '');
      const tuning = {
        ...(verbosity && VERBOSITY_MODEL_RE.test(name) ? { verbosity } : {}),
        ...(reasoningEffort && REASONING_MODEL_RE.test(name)
          ? { reasoning_effort: reasoningEffort }
          : {}),
      };
      const data = await request(
        '/chat/completions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, ...tuning }),
        },
        { timeoutMs: perCallTimeoutMs },
      );
      return data?.choices?.[0]?.message?.content ?? '';
    },

    /**
     * Transcription d'un fichier audio (FILE_TRANSCRIPTION_MODEL).
     *
     * `path` est la forme de /record : le Blob est adossé au fichier
     * (fs.openAsBlob), fetch le lit par morceaux au moment de l'envoi au lieu
     * d'en garder une copie en mémoire. Il le RElit à chaque tentative de
     * withRetry : un FormData n'est pas consommé par un envoi, contrairement à
     * un flux. Le fichier doit donc survivre jusqu'au retour de cet appel.
     * `buffer` reste accepté pour un audio déjà en mémoire.
     *
     * `redirect: 'error'` n'est PAS décoratif : pour pouvoir rejouer le corps
     * sur une redirection 307/308, fetch (undici) en GARDE chaque octet envoyé
     * jusqu'à la réponse. Mesuré sous Node 20 le 2026-10-13 sur 16 Mo : 16 Mo
     * retenus pendant toute l'attente de Whisper (des dizaines de secondes),
     * en `follow` comme en `manual` ; 0,1 Mo avec `error`. OpenAI ne redirige
     * pas : une `baseUrl` qui redirige (proxy mal saisi) échoue en erreur
     * réseau au lieu d'être suivie.
     *
     * @param {{path?: string, buffer?: Buffer, filename?: string, mimetype?: string,
     *          model?: string}} params - `path` OU `buffer`
     * @returns {Promise<{text: string}>}
     */
    async transcribe({
      path,
      buffer,
      filename = 'audio.webm',
      mimetype = 'application/octet-stream',
      model = FILE_TRANSCRIPTION_MODEL,
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

    /**
     * Génération d'une image (infographie de compte rendu).
     *
     * gpt-image-1 ne renvoie que du base64 (`b64_json`), jamais d'URL — c'est
     * ce qu'on veut : l'image est stockée en base, pas rechargée chez OpenAI.
     * Timeout dédié : une image en 1024×1536 dépasse couramment les 2 minutes
     * du timeout par défaut, sans que les autres opérations n'aient à attendre
     * aussi longtemps.
     *
     * @param {{model: string, prompt: string, size?: string}} params
     * @returns {Promise<{b64: string}>} base64 de l'image PNG, '' si absent
     */
    async generateImage({ model, prompt, size = '1024x1536' }) {
      const data = await request(
        '/images/generations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, size }),
        },
        { timeoutMs: Math.max(timeoutMs, 300_000) },
      );
      return { b64: data?.data?.[0]?.b64_json ?? '' };
    },

    /**
     * Jeton éphémère pour une session Realtime de transcription.
     * La langue est paramétrable (fix : n8n codait "fr" en dur alors que le
     * frontend envoie déjà ?lang=). Le modèle vient de l'administration
     * (lib/transcriptionModels.js) — OpenAI refuse ici tout identifiant hors
     * de sa liste, ce qui fait de cet appel un vrai test de validité.
     * Renvoie le corps OpenAI complet — le frontend lit `.value` (App.svelte)
     * ou `.client_secret.value` (peerConnection.js), l'appelant ajoute l'alias
     * manquant.
     * @param {string} lang - code langue (ex. 'fr', 'en')
     * @param {string} model - modèle de transcription
     * @returns {Promise<Object>}
     */
    async realtimeClientSecret(lang, model = DEFAULT_TRANSCRIPTION_MODEL) {
      return request('/realtime/client_secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: {
            type: 'transcription',
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
                transcription: { model, language: lang },
              },
            },
          },
        }),
      });
    },
  };
}
