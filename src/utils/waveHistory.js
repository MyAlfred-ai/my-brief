/**
 * Historique du signal pour l'onde sonore (components/AudioWave.svelte) — les
 * calculs purs, testables sans Web Audio ni DOM.
 *
 * Un niveau par pas de temps (STEP_MS), poussé à droite ; les anciens glissent
 * vers la gauche, comme un mémo vocal. Le niveau vient de la forme d'onde (RMS
 * des échantillons temporels), pas du spectre : c'est l'énergie de la voix
 * qu'on veut voir monter et descendre — un silence se lit, une prise de parole
 * aussi.
 *
 * Auto-gain : le RMS d'un micro de portable posé sur la table vit vers 0,03,
 * celui d'un casque vers 0,3. Un pic glissant (décroissance lente, plancher)
 * normalise, si bien que les deux donnent une onde pleine ; le plancher
 * empêche d'amplifier le silence jusqu'à en faire une onde. Noise gate : sous
 * un petit seuil, zéro — le bruit de fond doit rester plat. Courbe en racine :
 * les petites variations de la voix restent visibles.
 */

/** Durée d'une barre : 70 ms — ~6 s d'historique dans la pastille du dock. */
export const STEP_MS = 70;
/** Barres gardées : plus que n'en montre la plus large des pastilles. */
export const CAPACITY = 200;

/**
 * RMS d'une forme d'onde en octets (getByteTimeDomainData : 128 = silence).
 * @param {Uint8Array | number[]} bytes
 * @returns {number} 0 (silence) à 1 (saturation)
 */
export function rmsOfBytes(bytes) {
  if (!bytes.length) return 0;
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    const v = (bytes[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / bytes.length);
}

/**
 * Suit le pic glissant et rend un niveau 0..1 normalisé, gaté, perceptuel.
 * @param {{gate?: number, floor?: number, decay?: number}} [opts]
 */
export function createLevelTracker({ gate = 0.008, floor = 0.06, decay = 0.997 } = {}) {
  let peak = floor;
  return {
    /** @param {number} rms @returns {number} niveau 0..1 */
    next(rms) {
      peak = Math.max(peak * decay, rms, floor);
      const gated = Math.max(0, rms - gate);
      return Math.min(1, Math.pow(gated / peak, 0.75));
    },
    get peak() {
      return peak;
    },
  };
}

/**
 * Tampon des dernières barres, identifiées de façon croissante : un `{#each}`
 * keyé garde ses nœuds, seule la barre neuve naît et la plus vieille meurt.
 * @param {number} [capacity]
 */
export function createHistory(capacity = CAPACITY) {
  /** @type {{id: number, v: number}[]} */
  let items = [];
  let nextId = 0;
  return {
    /** @param {number} v niveau 0..1 @returns {{id: number, v: number}[]} */
    push(v) {
      items = [...items, { id: nextId++, v }];
      if (items.length > capacity) items = items.slice(items.length - capacity);
      return items;
    },
    get items() {
      return items;
    },
    /** Nouvelle réunion : trace vide, identifiants toujours uniques. */
    reset() {
      items = [];
      return items;
    },
  };
}
