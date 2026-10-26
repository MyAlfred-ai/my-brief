/**
 * Signal keep-alive audio : un souffle de bruit blanc quasi inaudible injecté
 * dans le flux capté quand la salle est silencieuse.
 *
 * Sans lui, un flux entièrement muet est traité comme inactif par certains
 * navigateurs et pilotes audio : la piste se met en veille, et le premier mot
 * prononcé après un long silence est avalé.
 *
 * Sorti d'App.svelte (plafonné par `max-lines`) : ce code ne connaît rien de
 * l'application — un contexte audio, une destination, un gain.
 */
import { KEEP_ALIVE_VOLUME } from '../config/constants.js';

/**
 * 100 ms de bruit blanc à volume `KEEP_ALIVE_VOLUME`.
 * @param {AudioContext} audioContext
 * @returns {AudioBuffer|null}
 */
function createKeepAliveBuffer(audioContext) {
  if (!audioContext) return null;
  const bufferSize = audioContext.sampleRate * 0.1;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * KEEP_ALIVE_VOLUME;
  }
  return buffer;
}

/**
 * Injecte une bouffée de keep-alive et RENVOIE le nœud de gain à conserver :
 * il est créé au premier appel puis réutilisé, l'appelant le garde pour pouvoir
 * le déconnecter à l'arrêt.
 *
 * @param {AudioContext} audioContext
 * @param {AudioNode} destination
 * @param {GainNode|null} gainNode - nœud déjà créé, ou null au premier appel
 * @returns {GainNode|null} le nœud à mémoriser (inchangé si rien n'a été fait)
 */
export function injectKeepAliveSignal(audioContext, destination, gainNode) {
  if (!audioContext || !destination) return gainNode;
  try {
    const buffer = createKeepAliveBuffer(audioContext);
    if (!buffer) return gainNode;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    let gain = gainNode;
    if (!gain) {
      gain = audioContext.createGain();
      gain.gain.value = KEEP_ALIVE_VOLUME;
    }
    source.connect(gain);
    gain.connect(destination);

    source.start();
    source.onended = () => {
      try {
        source.disconnect();
      } catch {}
    };
    return gain;
  } catch (error) {
    console.error("Erreur lors de l'injection du signal keep-alive:", error);
    return gainNode;
  }
}
