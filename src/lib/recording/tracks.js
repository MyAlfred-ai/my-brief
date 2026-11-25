/**
 * Pistes audio coupées ou rouvertes d'un coup — la pause d'une réunion.
 *
 * Une piste coupée (`enabled = false`) rend du silence mais reste vivante : la
 * reprise n'a rien à redemander au navigateur, et le graphe audio (processor
 * du direct, détecteur de silence) continue de tourner — c'est lui qui tient
 * la garde de capture informée pendant la pause.
 */

/**
 * @param {Array<MediaStream|null|undefined>} streams - un flux absent est ignoré
 * @param {boolean} enabled
 */
export function setAudioEnabled(streams, enabled) {
  for (const stream of streams) {
    stream?.getAudioTracks().forEach((track) => (track.enabled = enabled));
  }
}
