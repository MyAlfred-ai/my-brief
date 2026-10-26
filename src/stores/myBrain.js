/**
 * MyBrain, côté utilisateur — l'état de « Ma configuration → MyBrain ».
 *
 * Deux lecteurs, d'où le store : SettingsPanel, qui n'affiche l'entrée
 * « MyBrain » que si l'installation la propose, et la section elle-même
 * (components/settings/MyBrainSection.svelte), qui règle le choix et montre les
 * derniers envois. Un seul appel pour les deux : deux appels feraient deux
 * vérités possibles à l'écran (même raison que /connect/status, cf.
 * SettingsPanel).
 *
 * Un store ne parle pas à l'utilisateur : `{ ok, error }` avec le slug du
 * serveur, l'appelant choisit le texte dans config/uiText.js.
 *
 * Purgé à la déconnexion (stores/auth.js) : en mode mot de passe la page ne se
 * recharge pas, et les titres des réunions du compte précédent resteraient
 * affichables sous le suivant.
 */
import { writable } from 'svelte/store';
import {
  fetchMyBrainSettings,
  saveMyBrainSettings,
  retryMyBrainSend,
} from '../services/myBrainApi.js';

const EMPTY = {
  /** Vrai dès que la route a répondu — même en échec. */
  loaded: false,
  /** L'installation propose-t-elle myBrain (branché, et pas fermé) ? */
  available: false,
  /** 'off' | 'optin' | 'forced' — cf. services/api/lib/repositories/myBrainSettings.js */
  policy: 'off',
  /** Le choix du compte (lu seulement quand la politique est 'optin'). */
  enabled: false,
  /** Ce compte envoie-t-il ses réunions ? */
  active: false,
  /** La revue de myBrain, où attendent les réunions envoyées. */
  reviewUrl: '',
  recent: [],
};

export const myBrain = writable({ ...EMPTY });

function apply(data) {
  myBrain.set({
    ...EMPTY,
    ...(data || {}),
    recent: Array.isArray(data?.recent) ? data.recent : [],
    loaded: true,
  });
}

const failure = (res) => ({ ok: false, error: res.data?.error || 'network' });

/** Recharge depuis l'API. En échec, l'état précédent reste affiché. */
export async function refreshMyBrain() {
  const res = await fetchMyBrainSettings();
  if (!res.ok) {
    myBrain.update((state) => ({ ...state, loaded: true }));
    return failure(res);
  }
  apply(res.data);
  return { ok: true };
}

/** @param {boolean} enabled */
export async function setMyBrainEnabled(enabled) {
  const res = await saveMyBrainSettings(enabled);
  if (!res.ok) return failure(res);
  apply(res.data);
  return { ok: true };
}

/**
 * « Réessayer » l'envoi d'une réunion. Réussi ou non, l'état de la réunion a
 * bougé côté serveur (envoyée, ou nouvel échec) : la liste est relue.
 * @param {string} meetingId
 */
export async function retryMyBrain(meetingId) {
  const res = await retryMyBrainSend(meetingId);
  if (!res.ok) {
    await refreshMyBrain();
    return failure(res);
  }
  apply(res.data);
  return { ok: true };
}

export function resetMyBrain() {
  myBrain.set({ ...EMPTY });
}
