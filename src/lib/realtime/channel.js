/**
 * Canal WebSocket OpenAI Realtime (transcription) — UNE implémentation pour
 * les deux flux (micro « local » et audio système « remote »), qui étaient
 * deux copies manuelles dans App.svelte (setupPeerConnection /
 * setupSystemTranscription) à maintenir en parallèle.
 *
 * Cœur du contrat : rotate() est MAKE-BEFORE-BREAK. L'ancien socket continue
 * de transcrire pendant que le nouveau se connecte et se configure ; la
 * bascule (le processor audio lit `current` à chaque frame) n'a lieu qu'une
 * fois le nouveau prêt, puis l'ancien est fermé proprement — ses dernières
 * transcriptions arrivent encore par son onmessage, aucune parole perdue.
 * En échec (timeout 10 s, erreur d'ouverture), l'ancien socket reste en
 * service et rotate() rejette : l'appelant décide du retry.
 *
 * Session OpenAI Realtime plafonnée à 60 min : la rotation préventive est
 * cadencée par le superviseur (supervisor.js), pas ici.
 */

/** PCM float32 [-1,1] → int16, format attendu par l'API Realtime. */
export function float32ToPcm16(float32Array) {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const TARGET_RATE = 24000;

/**
 * Repli si /tempkey ne dit pas quel modèle il a utilisé (serveur d'une version
 * antérieure) : le modèle historique, celui pour lequel l'app a été écrite.
 * Doit rester aligné sur services/api/lib/transcriptionModels.js.
 */
const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-realtime-whisper';

/**
 * @param {Object} opts
 * @param {string} opts.wsUrl - URL wss (…/realtime?intent=transcription)
 * @param {(message: object) => void} opts.onMessage - message Realtime parsé
 * @param {() => void} [opts.onSwitched] - le NOUVEAU socket vient de prendre
 *   la main (après make-before-break) — timestamps, état UI, offline…
 * @param {() => void} [opts.onUnexpectedClose] - le socket COURANT s'est fermé
 *   sans avoir été remplacé ni fermé par close() : perte réelle. Jamais appelé
 *   pour un socket remplacé par une rotation (guard `current !== ws`).
 * @param {number} [opts.timeoutMs] - délai d'ouverture avant rejet
 * @param {() => string} [opts.getModel] - modèle de transcription réglé en
 *   administration, lu à CHAQUE rotation : /tempkey vient de créer le jeton
 *   avec lui, le `session.update` doit reprendre le même sinon le réglage
 *   resterait sans effet. Lu au dernier moment plutôt que figé à la création :
 *   le canal est construit au chargement de l'app, le modèle n'arrive qu'au
 *   premier /tempkey.
 * @param {typeof WebSocket} [opts.WebSocketImpl] - injectable (tests)
 */
export function createRealtimeChannel({
  wsUrl,
  onMessage,
  onSwitched = () => {},
  onUnexpectedClose = () => {},
  timeoutMs = 10000,
  getModel = () => '',
  WebSocketImpl = globalThis.WebSocket,
}) {
  let current = null;
  let closedByUs = false;

  return {
    /** Socket courant ouvert et prêt à recevoir de l'audio. */
    isOpen() {
      return !!current && current.readyState === WebSocketImpl.OPEN;
    },

    /** Socket courant mort ou mourant (détection du health check). */
    isDeadOrDying() {
      return (
        !current ||
        current.readyState === WebSocketImpl.CLOSED ||
        current.readyState === WebSocketImpl.CLOSING
      );
    },

    /**
     * Make-before-break : connecte un nouveau socket avec `secret`, envoie la
     * configuration de session, bascule, ferme l'ancien. Rejette en échec —
     * l'ancien socket reste alors en service.
     *
     * @param {{secret: string, lang: string}} params
     */
    rotate({ secret, lang }) {
      const previousWs = current;
      closedByUs = false;

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('WebSocket connection timeout')),
          timeoutMs,
        );
        const ws = new WebSocketImpl(wsUrl, ['realtime', `openai-insecure-api-key.${secret}`]);
        let opened = false;

        ws.onopen = () => {
          clearTimeout(timeout);
          opened = true;
          ws.send(
            JSON.stringify({
              type: 'session.update',
              session: {
                type: 'transcription',
                audio: {
                  input: {
                    format: { type: 'audio/pcm', rate: TARGET_RATE },
                    transcription: {
                      model: getModel() || DEFAULT_TRANSCRIPTION_MODEL,
                      language: lang || 'fr',
                    },
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
          );
          // Bascule : l'audio part désormais sur le nouveau socket.
          current = ws;
          onSwitched();
          if (previousWs && previousWs !== ws) {
            try {
              previousWs.close(1000);
            } catch (e) {}
          }
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            onMessage(JSON.parse(event.data));
          } catch (e) {
            console.error('Erreur parsing message WebSocket:', e);
          }
        };

        ws.onclose = () => {
          // Socket remplacé (rotation) ou fermé par close() : rien à signaler.
          if (current !== ws || closedByUs) return;
          onUnexpectedClose();
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          if (!opened) {
            // Échec d'ouverture : l'ancien socket (s'il existe) reste en
            // service, l'appelant décide du retry.
            reject(error);
          }
        };
      });
    },

    /**
     * Envoie une frame audio float32 : rééchantillonnage naïf vers 24 kHz,
     * PCM16, base64. No-op si le socket courant n'est pas ouvert.
     * @param {Float32Array} float32
     * @param {number} sourceRate - sampleRate de l'AudioContext
     */
    sendAudioFrame(float32, sourceRate) {
      if (!this.isOpen()) return;
      const pcm16 = float32ToPcm16(float32);
      const ratio = sourceRate / TARGET_RATE;
      let audioData;
      if (ratio !== 1) {
        const downsampled = new Int16Array(Math.floor(pcm16.length / ratio));
        for (let i = 0; i < downsampled.length; i++) {
          downsampled[i] = pcm16[Math.floor(i * ratio)];
        }
        audioData = downsampled.buffer;
      } else {
        audioData = pcm16.buffer;
      }
      current.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: arrayBufferToBase64(audioData),
        }),
      );
    },

    /** Fermeture volontaire (stopRecording) — n'émet pas onUnexpectedClose. */
    close(code = 1000) {
      closedByUs = true;
      if (current) {
        try {
          current.close(code);
        } catch (e) {}
        current = null;
      }
    },
  };
}
