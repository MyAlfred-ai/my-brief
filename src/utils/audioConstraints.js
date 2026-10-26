/**
 * Construit les contraintes `audio` pour getUserMedia en tenant compte du
 * microphone choisi par l'utilisateur (canal d'entrée sonore). Sans deviceId,
 * renvoie les contraintes par défaut (micro système).
 */
export function buildAudioConstraints(deviceId) {
  const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  return deviceId ? { ...base, deviceId: { exact: deviceId } } : base;
}

/**
 * Contraintes du « son de l'ordinateur » ouvert comme un micro (périphérique
 * virtuel : BlackHole, VB-CABLE, Mixage stéréo — cf. lib/audio/systemAudio.js).
 *
 * TOUS les traitements de la voix coupés, et pas par goût du signal brut :
 *   - l'annulation d'écho prend pour référence ce que le NAVIGATEUR joue. Une
 *     visio ouverte dans un onglet est précisément ce son-là : elle serait
 *     soustraite de l'entrée qui doit la capter ;
 *   - la réduction de bruit traite la musique et les ambiances d'un film comme
 *     du bruit, et rogne les voix qui passent dessus ;
 *   - le contrôle de gain remonte les silences en souffle.
 * L'appareil est imposé (`exact`) : sans lui, un périphérique débranché ferait
 * ouvrir le micro par défaut, et la réunion enregistrerait la voix deux fois.
 */
export function buildSystemAudioConstraints(deviceId) {
  return {
    deviceId: { exact: deviceId },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
}
