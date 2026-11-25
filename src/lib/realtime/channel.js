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
 *
 * Un DIALECTE par fournisseur (dialects.js), choisi à chaque rotation
 * d'après le modèle que /tempkey vient de renvoyer : OpenAI, Mistral,
 * Speechmatics, AssemblyAI. Ils ne diffèrent que sur le fil — URL, jeton,
 * ouverture, format de l'audio, nom des événements — et traduisent ce qu'ils
 * reçoivent dans la langue d'OpenAI : la pile, le superviseur et App.svelte
 * ne savent pas qui transcrit.
 */

import { createDialect } from './dialects.js';
import { float32ToPcm16 } from './pcm.js';

export { float32ToPcm16, arrayBufferToBase64 } from './pcm.js';

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
  // Dialecte du socket COURANT : l'audio part au format de celui qui l'écoute.
  let dialect = null;
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
      const previousDialect = dialect;
      closedByUs = false;
      const next = createDialect({ model: getModel(), secret, wsUrl });
      const language = lang || 'fr';

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('WebSocket connection timeout')),
          timeoutMs,
        );
        const ws = next.protocols
          ? new WebSocketImpl(next.url, next.protocols)
          : new WebSocketImpl(next.url);
        // Configuré = basculé : jusque-là, une erreur fait échouer la rotation.
        let configured = false;
        const send = (message) => message && ws.send(JSON.stringify(message));

        const configure = () => {
          clearTimeout(timeout);
          configured = true;
          send(next.readyMessage(language));
          // Bascule : l'audio part désormais sur le nouveau socket.
          current = ws;
          dialect = next;
          onSwitched();
          if (previousWs && previousWs !== ws) {
            try {
              previousDialect.retire(previousWs);
            } catch (e) {}
          }
          resolve();
        };

        ws.onopen = () => {
          send(next.openMessage(language));
          if (!next.readyEvent) configure();
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            // `type` chez OpenAI, Mistral et AssemblyAI ; `message` chez Speechmatics.
            const kind = message?.type ?? message?.message;
            if (!configured && next.readyEvent && kind === next.readyEvent) configure();
            const translated = next.translate(message);
            onMessage(translated);
            // Refus AVANT d'être prêt (clé, modèle, configuration) : la rotation
            // échoue tout de suite plutôt qu'au bout du délai d'ouverture.
            if (!configured && translated?.type === 'error') {
              clearTimeout(timeout);
              reject(new Error(`Realtime: refus à l'ouverture (${translated.error?.code || '?'})`));
            }
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
          if (!configured) {
            // Échec d'ouverture : l'ancien socket (s'il existe) reste en
            // service, l'appelant décide du retry.
            reject(error);
          }
        };
      });
    },

    /**
     * Envoie une frame audio float32 : rééchantillonnage naïf vers le débit du
     * dialecte (24 kHz OpenAI, 16 kHz les autres), PCM16, puis au format du
     * dialecte (JSON base64, ou trame binaire). No-op si le socket courant
     * n'est pas ouvert.
     * @param {Float32Array} float32
     * @param {number} sourceRate - sampleRate de l'AudioContext
     */
    sendAudioFrame(float32, sourceRate) {
      if (!this.isOpen()) return;
      const pcm16 = float32ToPcm16(float32);
      const ratio = sourceRate / dialect.rate;
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
      current.send(dialect.encode(audioData));
    },

    /**
     * Le socket courant est tenu pour perdu AVANT que le navigateur ne le
     * ferme : réseau annoncé absent (`offline`). Il peut rester `OPEN` des
     * dizaines de secondes en avalant l'audio ; l'abandonner tout de suite
     * fait partir la perte par le chemin habituel — reconnexion, et capture
     * du passage pour une transcription différée. No-op sans socket ouvert.
     */
    abandon() {
      if (!this.isOpen()) return;
      const ws = current;
      current = null; // son `onclose` ne signalera rien une seconde fois
      try {
        ws.close();
      } catch (e) {}
      onUnexpectedClose();
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
