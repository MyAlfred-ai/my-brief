/**
 * Ce que ce navigateur sait capter, au-delà du micro.
 *
 * Le PARTAGE D'ÉCRAN ne transporte du son que dans Chrome et Edge, sur
 * ordinateur : le son d'un onglet partout, celui de tout le système avec
 * « Tout l'écran » sur Windows. Firefox et Safari partagent l'image, JAMAIS le
 * son, sur aucun système (données de compatibilité MDN relues le 2026-10-01 :
 * « audio capture » non pris en charge). Aucun navigateur mobile non plus
 * (pointeur tactile, cf. utils/orientation.js), ni l'application native : sa
 * WebView n'a pas de getDisplayMedia, et son UA trompe (WKWebView se présente
 * comme Safari) — `native` court-circuite donc l'UA.
 *
 * Détection par l'UA, faute de mieux : getDisplayMedia EXISTE dans Firefox et
 * Safari, il y rend seulement une piste vidéo. Tester sa présence ouvrirait une
 * fenêtre de partage qui ne peut rien donner.
 *
 * Là où le partage est muet, le son de l'ordinateur passe par un périphérique
 * virtuel choisi dans Ma configuration → Réglages audio
 * (cf. lib/audio/systemAudio.js).
 */
import { isNative } from '../platform/index.js';

/**
 * @param {{userAgent?: string, coarsePointer?: boolean, native?: boolean}} env
 * @returns {{desktop: boolean, shareAudio: boolean}} `desktop` : un ordinateur,
 *   où le son de l'ordinateur a un sens ; `shareAudio` : son partage d'écran
 *   transporte le son.
 */
export function audioCaptureSupport({ userAgent = '', coarsePointer = false, native = false }) {
  const ua = String(userAgent);
  // Un iPad récent se présente comme un Mac : c'est son pointeur tactile
  // (`coarsePointer`) qui le range parmi les appareils mobiles.
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isFirefox = /firefox/i.test(ua);
  const desktop = !native && !coarsePointer;
  return { desktop, shareAudio: desktop && !isFirefox && !isSafari && !isIOS };
}

/** Le même diagnostic, pour le navigateur qui exécute l'application. */
export function currentAudioCaptureSupport() {
  return audioCaptureSupport({
    userAgent: navigator.userAgent,
    coarsePointer: !!window.matchMedia?.('(pointer: coarse)')?.matches,
    native: isNative,
  });
}
