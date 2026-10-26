/**
 * Le « son de l'ordinateur » : second canal d'une réunion (`remote`, pastille
 * « Visio »), tout ce qui sort des haut-parleurs — la visio, une vidéo, une
 * application comme VLC.
 *
 * Trois chemins, choisis par `systemAudioPath` :
 *  - `share`  — Chrome et Edge sur ordinateur : la fenêtre de partage du
 *    navigateur (getDisplayMedia), un onglet ou « Tout l'écran » avec le son du
 *    système. Le chemin historique, inchangé ;
 *  - `device` — Firefox et Safari sur ordinateur, quand un périphérique a été
 *    choisi dans Ma configuration → Réglages audio. Leur partage d'écran ne
 *    transporte jamais de son (utils/browserAudioSupport.js) : seul un
 *    périphérique virtuel (BlackHole, VB-CABLE, Mixage stéréo, moniteur
 *    PulseAudio) peut présenter la sortie de l'ordinateur comme une entrée. Il
 *    s'ouvre comme un second micro ;
 *  - `none`   — téléphone, application native, ou Firefox et Safari sans
 *    périphérique choisi : le micro seul, comme avant.
 *
 * Deux entrées ouvertes ensemble, ça tient dans les deux navigateurs — VÉRIFIÉ
 * dans leurs sources (2026-10-01) : Firefox branche tout appareil au-delà du
 * premier en « non natif », avec correction de dérive d'horloge
 * (dom/media/DeviceInputTrack.h) ; Safari donne une unité audio à part à toute
 * entrée SANS annulation d'écho (CoreAudioCaptureSource.cpp,
 * `createNonVPIOUnit`). D'où `buildSystemAudioConstraints` : avec l'annulation
 * d'écho, Safari ferait migrer le micro hors de la sienne, et le micro
 * perdrait son annulation d'écho.
 *
 * CONTRAT : l'enregistrement du micro ne dépend JAMAIS du son de
 * l'ordinateur. Aucune exception ne sort d'ici : un échec rend `stream: null`
 * et le statut à afficher. Seul « Annuler » (`cancelled`) arrête le démarrage.
 *
 * Sorti d'App.svelte, plafonné, et testable sans navigateur : les
 * périphériques et la question « Quel type de réunion ? » sont injectés.
 */
import { buildSystemAudioConstraints } from '../../utils/audioConstraints.js';

/** Le temps laissé pour faire ses choix dans la fenêtre de partage. */
export const SHARE_TIMEOUT_MS = 90_000;

/**
 * @param {object} env
 * @param {boolean} env.shareAudio - le partage d'écran transporte le son (utils/browserAudioSupport.js)
 * @param {boolean} env.desktop - un ordinateur, ni téléphone ni application native
 * @param {{id: string}|null} env.device - le son de l'ordinateur choisi (stores/audioDevices.js)
 * @param {object} env.mediaDevices - navigator.mediaDevices
 * @returns {'share'|'device'|'none'}
 */
export function systemAudioPath({ shareAudio, desktop, device, mediaDevices }) {
  if (shareAudio && mediaDevices?.getDisplayMedia) return 'share';
  if (desktop && device?.id && mediaDevices?.getUserMedia) return 'device';
  return 'none';
}

/**
 * Le périphérique choisi, parmi ceux présents : par identifiant, puis par nom
 * — un identifiant renouvelé par le navigateur ne doit pas perdre le réglage.
 *
 * @param {Array<{kind: string, deviceId: string, label: string}>} devices
 * @param {{id: string, label?: string}} chosen
 */
export function findSystemDevice(devices, chosen) {
  const inputs = (devices || []).filter((device) => device.kind === 'audioinput');
  return (
    inputs.find((device) => device.deviceId === chosen.id) ||
    (chosen.label ? inputs.find((device) => device.label === chosen.label) : null) ||
    null
  );
}

/**
 * @param {object} input
 * @param {'share'|'device'|'none'} input.path
 * @param {(context: {path: string, deviceLabel?: string}) => Promise<boolean|null>} input.askMeetingType
 *   « Quel type de réunion ? » : `true` visio, `false` présentiel, `null` annuler
 * @param {object} input.mediaDevices - navigator.mediaDevices
 * @param {{id: string, label: string}|null} [input.device] - chemin `device`
 * @param {MediaStream|null} [input.micStream] - le micro déjà ouvert
 * @param {number} [input.timeoutMs] - chemin `share`
 * @returns {Promise<{stream: MediaStream|null, status: string, cancelled?: boolean}>}
 *   `status` : clé de statut à afficher (`statuses.*`), '' quand le son est capté.
 */
export async function acquireSystemAudio({
  path,
  askMeetingType,
  mediaDevices,
  device = null,
  micStream = null,
  timeoutMs = SHARE_TIMEOUT_MS,
}) {
  if (path === 'share') return fromShare({ askMeetingType, mediaDevices, timeoutMs });
  if (path === 'device') return fromDevice({ askMeetingType, mediaDevices, device, micStream });
  return { stream: null, status: 'statuses.systemUnsupported' };
}

async function fromShare({ askMeetingType, mediaDevices, timeoutMs }) {
  // Présentiel ou visio ? Seule la visio ouvre la fenêtre de partage.
  const withVisio = await askMeetingType({ path: 'share' });
  if (withVisio === null) return { stream: null, status: '', cancelled: true };
  if (!withVisio) return { stream: null, status: 'statuses.systemDenied' };

  // Une image d'un pixel : Chrome n'ouvre pas de partage sans vidéo.
  const request = mediaDevices.getDisplayMedia({
    video: { width: 1, height: 1, frameRate: 1 },
    audio: true,
  });
  let timer;
  try {
    const media = await Promise.race([
      request,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
      }),
    ]);
    media.getVideoTracks().forEach((track) => track.stop());
    if (media.getAudioTracks().length > 0) return { stream: media, status: '' };
    // Partagé sans la case de l'audio, ou en mode « Fenêtre » : rien à écouter.
    media.getTracks().forEach((track) => track.stop());
    return { stream: null, status: 'statuses.noSystemAudio' };
  } catch (err) {
    console.warn("🖥️ Partage d'écran refusé, fermé ou trop long — micro seul :", err?.message);
    // Un partage accordé APRÈS le délai ne doit pas rester ouvert pour rien.
    request.then(
      (late) => late.getTracks().forEach((track) => track.stop()),
      () => {},
    );
    return { stream: null, status: 'statuses.systemDenied' };
  } finally {
    clearTimeout(timer);
  }
}

async function fromDevice({ askMeetingType, mediaDevices, device, micStream }) {
  let present = null;
  try {
    present = findSystemDevice(await mediaDevices.enumerateDevices(), device);
  } catch {
    present = null;
  }
  // Débranché ou désinstallé : le dire AVANT la question, plutôt que de
  // proposer une visio dont on sait déjà qu'elle sera muette.
  if (!present) return { stream: null, status: 'statuses.systemDeviceMissing' };

  // Le même appareil que le micro : chaque mot serait transcrit deux fois.
  const micDevice = micStream?.getAudioTracks?.()[0]?.getSettings?.().deviceId;
  if (micDevice && micDevice === present.deviceId) {
    return { stream: null, status: 'statuses.systemDeviceIsMic' };
  }

  const withVisio = await askMeetingType({
    path: 'device',
    deviceLabel: present.label || device.label,
  });
  if (withVisio === null) return { stream: null, status: '', cancelled: true };
  if (!withVisio) return { stream: null, status: 'statuses.systemDenied' };

  try {
    const stream = await mediaDevices.getUserMedia({
      audio: buildSystemAudioConstraints(present.deviceId),
    });
    if (stream.getAudioTracks().length > 0) return { stream, status: '' };
    stream.getTracks().forEach((track) => track.stop());
  } catch (err) {
    console.warn("🖥️ Son de l'ordinateur indisponible — micro seul :", err?.name || err);
  }
  return { stream: null, status: 'statuses.systemDeviceFailed' };
}
