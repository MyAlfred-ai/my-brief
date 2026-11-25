/**
 * Détection de silence pendant l'enregistrement → souffle keep-alive
 * (utils/audioKeepAlive.js) : sans lui, un flux muet est mis en veille par
 * certains navigateurs et pilotes, et le premier mot après un long silence est
 * avalé.
 *
 * Mesure inchangée depuis App.svelte : sur le MIX micro + son de l'ordinateur,
 * le plus fort de la moyenne du spectre et du RMS temporel, comparé à
 * AUDIO_ACTIVITY_THRESHOLD ; au-delà de SILENCE_THRESHOLD_MS sans activité,
 * une bouffée toutes les KEEP_ALIVE_INTERVAL_MS, jusqu'au retour du son.
 *
 * Ce qui a changé : le RYTHME. App.svelte échantillonnait dans une boucle
 * requestAnimationFrame — 60 à 120 fois par seconde pour un seuil d'une
 * seconde, et plus du tout quand l'onglet est caché (rAF suspendu), c'est-à-
 * dire quand l'utilisateur est dans l'onglet de sa visio. `sample()` est
 * désormais appelé par le processor audio du micro, qui tourne au rythme de
 * l'audio (~12 fois par seconde), onglet caché compris.
 *
 * L'analyser est aussi celui que lit l'onde sonore (AudioWave).
 */
import {
  AUDIO_ACTIVITY_THRESHOLD,
  KEEP_ALIVE_INTERVAL_MS,
  SILENCE_THRESHOLD_MS,
} from '../../config/constants.js';

/**
 * @param {Object} opts
 * @param {AudioContext} opts.audioContext
 * @param {(AudioNode|null|undefined)[]} opts.sources - micro, son de l'ordinateur (absents ignorés)
 * @param {() => void} opts.onKeepAlive - injecter une bouffée (appelé pendant le silence)
 * @param {number} [opts.threshold]
 * @param {number} [opts.silenceMs]
 * @param {number} [opts.keepAliveMs]
 * @param {() => number} [opts.now]
 * @param {typeof setInterval} [opts.setIntervalFn]
 * @param {typeof clearInterval} [opts.clearIntervalFn]
 * @returns {{ analyser: AnalyserNode, addSource: (source: AudioNode) => void,
 *   sample: () => void, stop: () => void }}
 */
export function createSilenceDetector({
  audioContext,
  sources,
  onKeepAlive,
  threshold = AUDIO_ACTIVITY_THRESHOLD,
  silenceMs = SILENCE_THRESHOLD_MS,
  keepAliveMs = KEEP_ALIVE_INTERVAL_MS,
  now = Date.now,
  setIntervalFn = (fn, ms) => setInterval(fn, ms),
  clearIntervalFn = (id) => clearInterval(id),
}) {
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.3;

  // Les sources rejoignent l'analyser en parallèle de leur destination
  // d'enregistrement (une source Web Audio peut alimenter plusieurs nœuds).
  const mixer = audioContext.createGain();
  mixer.gain.value = 1.0;
  for (const source of sources) if (source) source.connect(mixer);
  mixer.connect(analyser);

  const frequencies = new Uint8Array(analyser.frequencyBinCount);
  const waveform = new Uint8Array(analyser.frequencyBinCount);
  let lastActivity = now();
  let keepAliveTimer = null;
  let stopped = false;

  function stopKeepAlive() {
    if (keepAliveTimer === null) return;
    clearIntervalFn(keepAliveTimer);
    keepAliveTimer = null;
  }

  /** Niveau 0..1 : le plus fort du spectre moyen et du RMS (plus sensible à la voix). */
  function level() {
    analyser.getByteFrequencyData(frequencies);
    analyser.getByteTimeDomainData(waveform);
    let sum = 0;
    for (let i = 0; i < frequencies.length; i++) sum += frequencies[i];
    let sumSquares = 0;
    for (let i = 0; i < waveform.length; i++) {
      const normalized = (waveform[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    return Math.max(sum / frequencies.length / 255, Math.sqrt(sumSquares / waveform.length));
  }

  return {
    analyser,

    /**
     * Micro remplacé en cours de réunion (piste perdue après un appel, cf.
     * lib/recording/captureGuard.js) : la nouvelle source rejoint le mix, sans
     * quoi l'onde resterait plate et le keep-alive tournerait en continu.
     * @param {AudioNode} source
     */
    addSource(source) {
      if (!stopped && source) source.connect(mixer);
    },

    sample() {
      if (stopped) return;
      if (level() > threshold) {
        lastActivity = now();
        stopKeepAlive();
      } else if (now() - lastActivity > silenceMs && keepAliveTimer === null) {
        keepAliveTimer = setIntervalFn(onKeepAlive, keepAliveMs);
      }
    },

    stop() {
      stopped = true;
      stopKeepAlive();
      try {
        mixer.disconnect();
      } catch (e) {
        // déjà déconnecté (contexte fermé)
      }
    },
  };
}
