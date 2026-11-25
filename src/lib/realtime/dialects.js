/**
 * Dialectes Realtime — ce qui change d'un fournisseur de transcription à
 * l'autre SUR LE FIL : URL et jeton du socket, message d'ouverture, signal
 * « prêt », format de l'audio, nom des événements, fermeture. Le canal
 * (channel.js) n'en sait pas davantage : il ouvre, attend, bascule, envoie.
 *
 * Chaque dialecte TRADUIT ce qu'il reçoit dans la langue d'OpenAI Realtime —
 * `conversation.item.input_audio_transcription.delta` (`delta`, `item_id`) et
 * `.completed` (`transcript`, `item_id`), `{type: 'error', error}` — : la pile,
 * le superviseur et toute la mise en forme du direct (utils/transcriptLive.js)
 * ne savent pas qui transcrit. Un message sans équivalent passe TEL QUEL :
 * handleMessage l'ignore, mais le chien de garde y voit un canal vivant.
 *
 * Un dialecte est créé à CHAQUE ouverture de socket : Speechmatics compte ses
 * paquets d'audio, AssemblyAI suit ses tours de parole — un état qui
 * appartient à un socket, pas au canal.
 *
 * Protocoles tiers relevés dans la documentation de chaque fournisseur le
 * 2026-10-27, sans appel réel faute de clé de test
 * (documentations/TRANSCRIPTION.md §2).
 */

import { arrayBufferToBase64 } from './pcm.js';

/**
 * Repli si /tempkey ne dit pas quel modèle il a utilisé (serveur d'une version
 * antérieure) : le modèle historique, celui pour lequel l'app a été écrite.
 * Doit rester aligné sur services/api/lib/transcriptionModels.js.
 */
export const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-realtime-whisper';

/**
 * Temps laissé à un socket tiers REMPLACÉ pour rendre ses derniers mots,
 * après lui avoir dit que l'audio s'arrête : ces fournisseurs écrivent avec
 * un retard (de ~0,5 s à la fin d'un tour), et fermer net perdrait une fin de
 * phrase à chaque rotation.
 */
export const DRAIN_MS = 3000;

const DELTA = 'conversation.item.input_audio_transcription.delta';
const COMPLETED = 'conversation.item.input_audio_transcription.completed';

const json = (message) => JSON.stringify(message);

/** Fin d'audio annoncée, puis fermeture différée (cf. DRAIN_MS). */
function drainThenClose(ws, endMessage) {
  try {
    ws.send(json(endMessage));
  } catch (e) {}
  setTimeout(() => {
    try {
      ws.close(1000);
    } catch (e) {}
  }, DRAIN_MS);
}

// ── OpenAI ─────────────────────────────────────────────────────────────────

function openaiDialect({ model, secret, wsUrl }) {
  return {
    rate: 24000,
    url: wsUrl,
    protocols: ['realtime', `openai-insecure-api-key.${secret}`],
    // La session se configure dès l'ouverture.
    openMessage: (lang) => ({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: { model, language: lang },
            // VAD serveur explicite. prefix_padding_ms passe de 300 (défaut)
            // à 500 : c'est l'audio ré-inclus AVANT le seuil de détection —
            // à 300, les premiers mots d'une prise de parole après un
            // silence (changement d'interlocuteur en visio) partaient
            // tronqués. threshold et silence_duration_ms restent aux
            // défauts, écrits ici pour être visibles et réglables.
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 500,
              silence_duration_ms: 500,
            },
          },
        },
      },
    }),
    readyEvent: null,
    readyMessage: () => null,
    encode: (buffer) =>
      json({ type: 'input_audio_buffer.append', audio: arrayBufferToBase64(buffer) }),
    translate: (message) => message,
    retire: (ws) => ws.close(1000),
  };
}

// ── Mistral (Voxtral) ──────────────────────────────────────────────────────

const MISTRAL_REALTIME_URL = 'wss://api.mistral.ai/v1/audio/transcriptions/realtime';

/**
 *   - jeton `rt_…` en second sous-protocole, la seule voie d'un navigateur ;
 *   - attendre `session.created` avant d'envoyer quoi que ce soit ;
 *   - PCM 16 bits à 16 kHz, le format par défaut : si la configuration était
 *     refusée, l'audio resterait lisible ;
 *   - `transcription.text.delta` porte `text`, définitif, espaces et
 *     ponctuation compris. Pas de segment (`item_id`) ni de `completed` : la
 *     ligne se boucle à la ponctuation, comme sous gpt-realtime-whisper.
 *     `transcription.done` (texte ENTIER, après `input_audio.end`) n'est pas
 *     traduit : le verser doublerait tout ce que les deltas ont écrit.
 */
function mistralDialect({ model, secret }) {
  return {
    rate: 16000,
    url: `${MISTRAL_REALTIME_URL}?model=${encodeURIComponent(model)}`,
    protocols: ['realtime', secret],
    openMessage: () => null,
    readyEvent: 'session.created',
    readyMessage: (lang) => ({
      type: 'session.update',
      session: {
        audio_format: { encoding: 'pcm_s16le', sample_rate: 16000 },
        language: lang,
        // Le point de départ que recommande Mistral : plus court, des mots plus
        // tôt mais moins justes ; plus long, l'inverse.
        target_streaming_delay_ms: 480,
      },
    }),
    encode: (buffer) => json({ type: 'input_audio.append', audio: arrayBufferToBase64(buffer) }),
    translate: (message) =>
      message?.type === 'transcription.text.delta' ? { type: DELTA, delta: message.text } : message,
    retire: (ws) => drainThenClose(ws, { type: 'input_audio.end' }),
  };
}

// ── Speechmatics ───────────────────────────────────────────────────────────

/** Hôte européen : résidence des données, comme les fichiers (lib/speechmatics.js). */
const SPEECHMATICS_REALTIME_URL = 'wss://eu.rt.speechmatics.com/v2';

/**
 * Retard maximal d'un mot définitif, en secondes (0,7 à 4 ; 4 par défaut).
 * Seuls les définitifs sont lus (pas d'`enable_partials` : un partiel se
 * RÉVISE, il ne s'ajoute pas) — à 1 s, le direct garde son rythme.
 */
const SPEECHMATICS_MAX_DELAY_S = 1;

/**
 * Texte d'un `AddTranscript`, recomposé depuis ses `results` : un mot par
 * élément, et la ponctuation collée selon `attaches_to` (`previous`, `next`,
 * `both`, `none`). Chaque segment continue le précédent : un espace le
 * précède, sauf au tout début du flux ou devant une ponctuation attachée.
 *
 * @param {object} message - `AddTranscript`
 * @param {{started: boolean, glueNext: boolean}} state - état du socket
 * @returns {string}
 */
export function speechmaticsText(message, state) {
  const results = Array.isArray(message?.results) ? message.results : null;
  if (!results) {
    const text = String(message?.metadata?.transcript || '').trim();
    if (!text) return '';
    const out = (state.started ? ' ' : '') + text;
    state.started = true;
    return out;
  }
  let out = '';
  for (const result of results) {
    const content = result?.alternatives?.[0]?.content;
    if (!content) continue;
    const attaches = result.attaches_to || 'none';
    const glued = state.glueNext || attaches === 'previous' || attaches === 'both';
    out += (state.started && !glued ? ' ' : '') + content;
    state.started = true;
    state.glueNext = attaches === 'next' || attaches === 'both';
  }
  return out;
}

/**
 *   - clé temporaire en `?jwt=` : un navigateur ne pose pas d'en-tête sur un
 *     WebSocket ;
 *   - `StartRecognition` à l'ouverture, audio seulement après
 *     `RecognitionStarted` ;
 *   - audio en trames BINAIRES (PCM 16 bits, 16 kHz), chacune accusée
 *     (`AudioAdded`, qui tient le chien de garde au courant) ; `EndOfStream`
 *     doit citer le numéro du dernier paquet ;
 *   - `AddTranscript` est définitif et s'ajoute : il devient un delta, sans
 *     segment — la ligne se boucle à la ponctuation, comme sous Voxtral ;
 *   - après une `Error`, le serveur ferme : le superviseur reconnecte.
 */
function speechmaticsDialect({ model, secret }) {
  const state = { seq: 0, started: false, glueNext: false };
  return {
    rate: 16000,
    url: `${SPEECHMATICS_REALTIME_URL}?jwt=${encodeURIComponent(secret)}`,
    protocols: undefined,
    openMessage: (lang) => ({
      message: 'StartRecognition',
      audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: 16000 },
      transcription_config: {
        language: lang,
        model: String(model).replace(/^speechmatics-/, ''),
        max_delay: SPEECHMATICS_MAX_DELAY_S,
        enable_partials: false,
      },
    }),
    readyEvent: 'RecognitionStarted',
    readyMessage: () => null,
    encode: (buffer) => {
      state.seq += 1;
      return buffer;
    },
    translate: (message) => {
      if (message?.message === 'AddTranscript') {
        const text = speechmaticsText(message, state);
        return text ? { type: DELTA, delta: text } : message;
      }
      if (message?.message === 'Error') {
        return { type: 'error', error: { type: message.type, code: message.type } };
      }
      return message;
    },
    retire: (ws) => drainThenClose(ws, { message: 'EndOfStream', last_seq_no: state.seq }),
  };
}

// ── AssemblyAI ─────────────────────────────────────────────────────────────

const ASSEMBLYAI_REALTIME_URL = 'wss://streaming.assemblyai.com/v3/ws';

/**
 * Un `Turn` d'AssemblyAI, traduit. Chaque `Turn` porte la transcription
 * ENTIÈRE du tour en cours : sous Universal-3.6 Pro elle est RÉVISÉE d'un
 * message à l'autre (« ne pas ajouter, remplacer »), sous Universal-Streaming
 * elle ne fait que grandir. Le direct, lui, n'ajoute que des deltas :
 *   - tour en cours → les MOTS au-delà de ceux déjà écrits, en delta du segment
 *     `aai-<turn_order>` (une révision des premiers mots attend le final) ;
 *   - tour fini et mis en forme (`end_of_turn` + `turn_is_formatted`) →
 *     `completed` du même segment : il REMPLACE les lignes du tour, comme le
 *     `completed` de gpt-transcribe (utils/transcriptLive.js).
 *
 * @param {object} message - `Turn`
 * @param {Map<number, number>} written - mots déjà écrits, par tour
 * @returns {object} message traduit, ou le `Turn` tel quel s'il n'apporte rien
 */
export function assemblyAiTurn(message, written) {
  const turn = message.turn_order;
  const itemId = `aai-${turn}`;
  const transcript = String(message.transcript || '');
  if (message.end_of_turn && message.turn_is_formatted) {
    written.delete(turn);
    return { type: COMPLETED, item_id: itemId, transcript };
  }
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const done = written.get(turn) || 0;
  if (words.length <= done) return message;
  written.set(turn, words.length);
  return { type: DELTA, item_id: itemId, delta: (done ? ' ' : '') + words.slice(done).join(' ') };
}

/**
 *   - jeton temporaire en `?token=`, avec la configuration : tout passe par
 *     l'URL, rien n'est envoyé à l'ouverture ;
 *   - `Begin` confirme la session ; audio en trames BINAIRES (PCM 16 bits,
 *     16 kHz, de 50 à 1 000 ms — un tampon du processeur fait ~85 ms) ;
 *   - `format_turns` : sous Universal-Streaming, le final mis en forme
 *     (ponctuation, casse) suit le final brut. Universal-3.6 Pro met toujours
 *     en forme ; le paramètre lui est sans objet ;
 *   - `Terminate` clôt proprement ; les erreurs ferment le socket.
 */
function assemblyAiDialect({ model, secret }) {
  const written = new Map();
  const params = new URLSearchParams({
    speech_model: model,
    encoding: 'pcm_s16le',
    sample_rate: '16000',
    format_turns: 'true',
    token: secret,
  });
  return {
    rate: 16000,
    url: `${ASSEMBLYAI_REALTIME_URL}?${params}`,
    protocols: undefined,
    openMessage: () => null,
    readyEvent: 'Begin',
    readyMessage: () => null,
    encode: (buffer) => buffer,
    translate: (message) => {
      if (message?.type === 'Turn') return assemblyAiTurn(message, written);
      if (message && !message.type && message.error) {
        return { type: 'error', error: { code: 'assemblyai_error' } };
      }
      return message;
    },
    retire: (ws) => drainThenClose(ws, { type: 'Terminate' }),
  };
}

/**
 * Dialecte d'un modèle, déduit de son PRÉFIXE — aligné sur
 * TRANSCRIPTION_PROVIDERS (services/api/lib/transcriptionModels.js), ce qu'un
 * test de l'API vérifie.
 * @param {string} model
 * @returns {'openai'|'mistral'|'speechmatics'|'assemblyai'}
 */
export function dialectProvider(model) {
  const id = String(model || '');
  if (id.startsWith('voxtral-')) return 'mistral';
  if (id.startsWith('speechmatics-')) return 'speechmatics';
  if (id.startsWith('universal-')) return 'assemblyai';
  return 'openai';
}

const FACTORIES = {
  openai: openaiDialect,
  mistral: mistralDialect,
  speechmatics: speechmaticsDialect,
  assemblyai: assemblyAiDialect,
};

/**
 * Le dialecte d'UN socket.
 * @param {{model: string, secret: string, wsUrl: string}} params - `wsUrl` :
 *   l'URL Realtime d'OpenAI (aiBaseUrl), les autres fournisseurs ont la leur
 */
export function createDialect({ model, secret, wsUrl }) {
  const id = model || DEFAULT_TRANSCRIPTION_MODEL;
  return FACTORIES[dialectProvider(id)]({ model: id, secret, wsUrl });
}
