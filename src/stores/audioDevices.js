/**
 * Périphériques audio choisis dans « Ma configuration → Réglages audio », PAR
 * APPAREIL (localStorage) : un identifiant de périphérique n'a aucun sens d'une
 * machine à l'autre, il ne suit donc pas le compte.
 *
 *  - `mic`    : le micro, canal « local ». '' = celui du système ;
 *  - `system` : le « son de l'ordinateur », canal « remote » — un périphérique
 *               virtuel qui présente la sortie audio comme une entrée, seul
 *               chemin dans Firefox et Safari (cf. lib/audio/systemAudio.js).
 *               `{id, label}`, ou `null` quand il n'y en a pas.
 *
 * Le NOM du son de l'ordinateur est gardé avec son identifiant : un
 * identifiant renouvelé par le navigateur ferait perdre le réglage sans un
 * mot, le nom (« BlackHole 2ch ») permet de le retrouver.
 *
 * Sorti d'App.svelte, plafonné : le panneau des réglages lit et écrit ici
 * directement, au lieu de recevoir la valeur et son rappel en props.
 */
import { writable } from 'svelte/store';

export const MIC_STORAGE_KEY = 'mybrief_audio_input_device';
export const SYSTEM_STORAGE_KEY = 'mybrief_system_audio_device';

// Stockage indisponible (navigation privée, données bloquées) : le choix vaut
// pour la session, l'enregistrement ne doit jamais en dépendre.
function read(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function write(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* le choix reste en mémoire pour la session */
  }
}

function readSystem() {
  try {
    const saved = JSON.parse(read(SYSTEM_STORAGE_KEY) || 'null');
    return saved && typeof saved.id === 'string' && saved.id
      ? { id: saved.id, label: String(saved.label || '') }
      : null;
  } catch {
    return null;
  }
}

/** @type {import('svelte/store').Writable<{mic: string, system: {id: string, label: string}|null}>} */
export const audioDevices = writable({ mic: read(MIC_STORAGE_KEY), system: readSystem() });

/** @param {string} deviceId - '' : le micro du système */
export function chooseMicrophone(deviceId) {
  const mic = deviceId || '';
  write(MIC_STORAGE_KEY, mic);
  audioDevices.update((current) => ({ ...current, mic }));
}

/** @param {{deviceId: string, label?: string}|null} device - `null` : plus de son de l'ordinateur */
export function chooseSystemAudio(device) {
  const system = device?.deviceId
    ? { id: device.deviceId, label: String(device.label || '') }
    : null;
  write(SYSTEM_STORAGE_KEY, system ? JSON.stringify(system) : '');
  audioDevices.update((current) => ({ ...current, system }));
}
