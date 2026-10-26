/**
 * « Tester » le son de l'ordinateur : écouter le périphérique choisi quelques
 * secondes, et dire si quelque chose y arrive.
 *
 * Le réglage d'un périphérique virtuel rate presque toujours au même endroit :
 * la sortie audio de l'ordinateur n'y est pas envoyée, et il reste muet. Sans
 * ce test, on le découvre après coup, quand la visio manque à la
 * transcription. Les dépendances du navigateur sont injectables : la mesure se
 * teste sans carte son.
 */

/** Durée d'écoute : le temps de lancer une vidéo ou une musique. */
export const PROBE_DURATION_MS = 6000;

/**
 * Crête au-delà de laquelle un son est « reçu » (≈ −40 dBFS). Un périphérique
 * virtuel muet rend des zéros, et le souffle d'un « Mixage stéréo » reste en
 * dessous.
 */
export const HEARD_THRESHOLD = 0.01;

/**
 * @param {object} input
 * @param {object} input.mediaDevices - navigator.mediaDevices
 * @param {MediaTrackConstraints} input.constraints - celles de l'enregistrement (buildSystemAudioConstraints)
 * @param {(level: number) => void} [input.onLevel] - niveau affichable, de 0 à 1, à chaque image
 * @param {number} [input.durationMs]
 * @param {() => AudioContext} [input.createContext]
 * @param {(tick: () => void) => void} [input.schedule]
 * @param {() => number} [input.now]
 * @returns {Promise<{heard: boolean, peak: number}>}
 * @throws l'erreur de getUserMedia (périphérique absent, accès refusé)
 */
export async function probeInputLevel({
  mediaDevices,
  constraints,
  onLevel = () => {},
  durationMs = PROBE_DURATION_MS,
  createContext = () => new (window.AudioContext || window.webkitAudioContext)(),
  schedule = (tick) => requestAnimationFrame(tick),
  now = () => performance.now(),
}) {
  const stream = await mediaDevices.getUserMedia({ audio: constraints });
  let context = null;
  try {
    context = createContext();
    if (context.state === 'suspended') await context.resume();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const started = now();
    let peak = 0;
    await new Promise((resolve) => {
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let frame = 0;
        for (const value of samples) frame = Math.max(frame, Math.abs(value));
        peak = Math.max(peak, frame);
        // Racine carrée : une voix à −20 dBFS remplit la jauge aux deux tiers,
        // au lieu d'un dixième en échelle linéaire.
        onLevel(Math.min(1, Math.sqrt(frame) * 1.2));
        if (now() - started >= durationMs) resolve();
        else schedule(tick);
      };
      schedule(tick);
    });
    return { heard: peak >= HEARD_THRESHOLD, peak };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    context?.close?.();
  }
}
