/**
 * Détection d'actions en réunion — les réglages de L'UTILISATEUR.
 *
 * Ce n'est plus un réglage d'installation : chaque compte décide de ce que la
 * détection cherche et à quel rythme (`GET /api/actions/detection`), et un
 * compte qui n'a rien réglé vit les valeurs intégrées ci-dessous — celles
 * d'avant tout écran de réglage.
 *
 * Deux consommateurs, et c'est la raison d'être du store :
 *   - l'écran de réglages (components/settings/ActionDetectionSection.svelte),
 *     qui les édite ;
 *   - l'ordonnanceur d'App.svelte, qui applique le RYTHME (`windowSize`,
 *     `minSentences`, `enabled`) : le navigateur est le seul à savoir combien de
 *     phrases ont été transcrites depuis la dernière analyse. Les autres
 *     réglages composent la consigne, côté serveur, et n'ont rien à faire ici —
 *     ils y sont quand même, parce que l'écran les édite dans le même geste.
 *
 * ── Pourquoi le chargement s'accroche à l'enregistrement ────────────────────
 * Il faut hydrater AVANT la première analyse, mais pas au démarrage de
 * l'application : cette route exige une identité, et l'appeler avant la
 * connexion produirait un 401 — donc l'écran de connexion, à chaque
 * rafraîchissement. `isRecordingStore` passe à vrai quand une réunion démarre,
 * c'est-à-dire quand on est forcément connecté et juste avant que le rythme
 * serve. App.svelte est à son plafond `max-lines` (cf. eslint.config.js) et ne
 * peut pas porter cet appel ; le store est de toute façon le bon endroit — un
 * seul point d'accès, hydraté une fois, réactualisé à chaque enregistrement.
 *
 * En échec, on garde les valeurs intégrées : une réunion doit démarrer même si
 * la route est indisponible, et ce repli EST le comportement d'origine.
 */
import { writable, get } from 'svelte/store';
import { fetchDetectionSettings } from '../services/actionsApi.js';
import { isRecordingStore } from './recording.js';

/** Valeurs intégrées — mêmes que le serveur (lib/actionDetectionSettings.js). */
export const DEFAULT_DETECTION = {
  enabled: true,
  sensitivity: 'balanced',
  triggerWords: ['action'],
  allowUpdates: true,
  windowSize: 8,
  minSentences: 1,
};

export const actionDetection = writable({ ...DEFAULT_DETECTION });

/** Vrai dès que la route a répondu — même en échec, cf. `ensure`. */
export const detectionLoaded = writable(false);

/** Applique une projection du serveur (chargement, ou retour d'enregistrement). */
export function applyDetectionSettings(settings) {
  actionDetection.set({ ...DEFAULT_DETECTION, ...(settings || {}) });
  detectionLoaded.set(true);
}

/** Recharge depuis l'API. Appelé au montage de l'écran, et à la première réunion. */
export async function refreshActionDetection() {
  const res = await fetchDetectionSettings();
  if (!res.ok) {
    // `loaded` quand même : sans ça, chaque réunion rejouerait la requête sur
    // un serveur qui vient de la refuser.
    detectionLoaded.set(true);
    return { ok: false, error: res.data?.error || 'network' };
  }
  applyDetectionSettings(res.data?.settings);
  return { ok: true };
}

/** Charge une seule fois, à la demande. */
export async function ensureActionDetection() {
  if (get(detectionLoaded)) return get(actionDetection);
  await refreshActionDetection();
  return get(actionDetection);
}

/**
 * Remet les valeurs intégrées. Appelé à la déconnexion : en mode mot de passe
 * la page ne se recharge pas, et le rythme du compte précédent ne doit pas
 * régir la réunion du suivant.
 */
export function resetActionDetection() {
  actionDetection.set({ ...DEFAULT_DETECTION });
  detectionLoaded.set(false);
}

// Hydratation au démarrage d'une réunion — cf. l'en-tête. Abonnement de module
// : il vit aussi longtemps que l'application, et ne déclenche rien tant
// qu'aucun enregistrement n'a commencé.
isRecordingStore.subscribe((active) => {
  if (active) ensureActionDetection();
});
