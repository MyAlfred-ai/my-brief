/**
 * Enregistrement écran verrouillé / arrière-plan (app native uniquement).
 *
 * Android : un Foreground Service de type `microphone` (plugin
 * @capawesome-team/capacitor-android-foreground-service) empêche le système de
 * tuer le process et autorise la capture micro en arrière-plan (obligatoire
 * depuis Android 14). Il affiche la notification persistante réglementaire.
 *
 * iOS : rien à démarrer ici — UIBackgroundModes=audio (Info.plist) suffit :
 * tant que la session getUserMedia est active, la WebView continue de tourner
 * écran verrouillé (pattern standard des apps de réunion Capacitor).
 *
 * Web : no-op intégral (les hacks wakeLock.js restent le chemin web).
 *
 * Tous les appels sont best-effort : un échec du service ne doit JAMAIS
 * empêcher ou interrompre l'enregistrement lui-même.
 */

import { isNative, nativePlatform, nativePlugin } from './index.js';

const SERVICE_TYPE_MICROPHONE = 128; // enum ServiceType.Microphone du plugin

let serviceRunning = false;

/**
 * À appeler quand l'enregistrement démarre, PENDANT que l'app est au premier
 * plan (le démarrage d'un FGS microphone depuis l'arrière-plan est interdit).
 * @param {{ title?: string, body?: string }} [notif]
 */
export async function startBackgroundRecording(notif = {}) {
  if (!isNative || nativePlatform !== 'android' || serviceRunning) return;
  try {
    const fgs = nativePlugin('ForegroundService');
    // POST_NOTIFICATIONS (Android 13+) : best-effort — refusée, le service
    // tourne quand même, seule la notification est masquée.
    try {
      await fgs.requestPermissions();
    } catch (_) {
      /* ignore */
    }
    await fgs.startForegroundService({
      id: 1,
      title: notif.title || 'MyBrief',
      body: notif.body || 'Enregistrement en cours…',
      smallIcon: 'ic_stat_mybrief',
      serviceType: SERVICE_TYPE_MICROPHONE,
      silent: true,
    });
    serviceRunning = true;
    console.log('🎙️ Foreground service micro démarré');
  } catch (e) {
    console.warn(
      'Foreground service indisponible (enregistrement inchangé):',
      (e && e.message) || e,
    );
  }
}

/** À appeler à CHAQUE fin d'enregistrement (stop, erreur, unmount). Idempotent. */
export async function stopBackgroundRecording() {
  if (!isNative || nativePlatform !== 'android' || !serviceRunning) return;
  serviceRunning = false;
  try {
    await nativePlugin('ForegroundService').stopForegroundService();
    console.log('🎙️ Foreground service micro arrêté');
  } catch (e) {
    console.warn('Arrêt du foreground service:', (e && e.message) || e);
  }
}
