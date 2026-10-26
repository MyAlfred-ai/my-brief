/**
 * Infographie de compte rendu — état de l'image de la réunion AFFICHÉE.
 *
 * ── Pourquoi un store ──────────────────────────────────────────────────────
 * App.svelte est plafonné (`max-lines`) : toute la mécanique — lecture de
 * l'état, chargement de l'image, polling pendant la génération — vit ici, et
 * ResumeOverlays s'y abonne. App ne fournit que le `meetingId` affiché.
 *
 * ── Deux sources, une préséance ────────────────────────────────────────────
 * L'ÉTAT initial vient des documents d'historique (/history renvoie
 * `infographic.status` sur chaque réunion) ; l'IMAGE et l'état FRAIS viennent
 * de GET /infographic. L'historique ne fait qu'AMORCER : une fois qu'un cycle
 * est en cours (`stamp` identique), un instantané d'historique daté ne
 * rétrograde jamais l'état obtenu de la route dédiée — sinon un rechargement
 * de la liste ferait rejouer l'animation sur une image déjà affichée.
 * `stamp` (l'updatedAt écrit par le serveur à chaque changement d'état) est ce
 * qui distingue « instantané daté » de « nouvelle génération » : une
 * régénération cochée pose un nouvel updatedAt, et l'animation repart.
 *
 * ── Polling borné ──────────────────────────────────────────────────────────
 * Le serveur règle le drapeau dans TOUS les cas de sortie (ready/error, cf.
 * lib/infographic.js) : le poll se termine toujours. Le plafond ne couvre que
 * le serveur disparu en route.
 */
import { writable, get } from 'svelte/store';
import { get as apiGet, post as apiPost } from '../services/apiClient.js';

/** `status` : none | pending | loading | ready | error. */
const IDLE = { meetingId: null, status: 'none', dataUrl: '', stamp: '' };

export const infographicView = writable({ ...IDLE });

const POLL_MS = 4000;
const POLL_MAX = 90; // ~6 min — bien au-delà d'une génération réelle (1 à 3 min)

let pollTimer = null;
let pollAttempts = 0;

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  pollAttempts = 0;
}

async function fetchState(meetingId) {
  const res = await apiGet(`/infographic?meetingId=${encodeURIComponent(meetingId)}`);
  return res.ok ? res.data : null;
}

/** L'état demandé concerne-t-il toujours la réunion affichée ? */
function stillCurrent(id, status = null) {
  const cur = get(infographicView);
  return cur.meetingId === id && (status === null || cur.status === status);
}

function applyStatus(id, status, stamp) {
  stopPolling();
  if (status === 'ready') {
    infographicView.set({ meetingId: id, status: 'loading', dataUrl: '', stamp });
    loadImage(id);
  } else if (status === 'pending') {
    infographicView.set({ meetingId: id, status: 'pending', dataUrl: '', stamp });
    schedulePoll(id);
  } else {
    infographicView.set({ meetingId: id, status, dataUrl: '', stamp });
  }
}

async function loadImage(id) {
  const data = await fetchState(id);
  if (!stillCurrent(id, 'loading')) return;
  const stamp = data?.updatedAt || get(infographicView).stamp;
  if (data?.status === 'ready' && data.dataUrl) {
    infographicView.set({ meetingId: id, status: 'ready', dataUrl: data.dataUrl, stamp });
  } else if (data?.status === 'pending') {
    applyStatus(id, 'pending', stamp);
  } else if (data) {
    infographicView.set({ meetingId: id, status: data.status || 'none', dataUrl: '', stamp });
  } else {
    // Réseau muet : on retombe sur « rien » plutôt que de laisser un squelette
    // de chargement à demeure — la prochaine sélection retentera.
    infographicView.set({ meetingId: id, status: 'none', dataUrl: '', stamp });
  }
}

function schedulePoll(id) {
  pollTimer = setTimeout(async () => {
    pollAttempts += 1;
    const data = await fetchState(id);
    if (!stillCurrent(id, 'pending')) return;
    const stamp = data?.updatedAt || get(infographicView).stamp;
    if (data?.status === 'ready' && data.dataUrl) {
      stopPolling();
      infographicView.set({ meetingId: id, status: 'ready', dataUrl: data.dataUrl, stamp });
      return;
    }
    if (data?.status === 'error' || data?.status === 'none') {
      stopPolling();
      infographicView.set({ meetingId: id, status: data.status, dataUrl: '', stamp });
      return;
    }
    if (pollAttempts >= POLL_MAX) {
      stopPolling();
      infographicView.set({ meetingId: id, status: 'error', dataUrl: '', stamp });
      return;
    }
    // `pending` encore, ou réseau muet (data null) : on continue, le plafond borne.
    schedulePoll(id);
  }, POLL_MS);
}

/**
 * Point d'entrée UNIQUE, appelé de façon réactive par ResumeOverlays avec la
 * réunion affichée et la liste d'historique courante. Idempotent : rappelé
 * avec le même état, il ne refait rien.
 *
 * @param {string|null} meetingId - réunion affichée (live ou archive)
 * @param {Array} items - contenu du store d'historique
 */
export function syncInfographic(meetingId, items) {
  const id = meetingId == null || meetingId === '' ? null : String(meetingId);
  const current = get(infographicView);
  if (!id) {
    if (current.meetingId !== null) resetInfographic();
    return;
  }
  const item = Array.isArray(items) ? items.find((it) => String(it?.meetingId ?? '') === id) : null;
  const status = item?.infographic?.status || 'none';
  const stamp = item?.infographic?.updatedAt || '';
  // Même réunion : l'historique ne peut qu'AVANCER le cycle, jamais le
  // rembobiner — les stamps sont des ISO comparables. `>=` et non `===` :
  // après une régénération ou une suppression lancées d'ici (stamp local plus
  // récent que le document), un instantané d'historique PÉRIMÉ rétrograderait
  // l'état — animation tuée, ancienne image rechargée.
  if (current.meetingId === id && current.stamp >= stamp) return;
  applyStatus(id, status, stamp);
}

/**
 * Régénère l'infographie SEULE (POST /infographic/regenerate) : le serveur
 * repart des matériaux stockés de la réunion, le résumé n'est pas touché.
 * Les textes de l'image suivent la langue SÉLECTIONNÉE maintenant, pas celle
 * du résumé — passée par l'appelant : importer store.js ici (localStorage lu
 * à l'import) casserait les tests node des stores qui importent celui-ci.
 * En succès, l'animation repart ici même — sans attendre l'historique.
 * @param {string} meetingId
 * @param {string} [language] - langue de l'interface (repli serveur : celle
 *   de la réunion)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function regenerateInfographic(meetingId, language) {
  const id = String(meetingId || '');
  if (!id) return { ok: false, error: 'meeting_id_required' };
  const res = await apiPost('/infographic/regenerate', { meetingId: id, language });
  if (!res.ok) return { ok: false, error: res.data?.error || 'network' };
  applyStatus(id, 'pending', res.data?.updatedAt || new Date().toISOString());
  return { ok: true };
}

/**
 * Supprime l'infographie SEULE (POST /infographic/delete) — la réunion reste.
 * Le stamp local est CONSERVÉ : les instantanés d'historique qui datent
 * d'avant la suppression portent l'ancien stamp et sont ainsi ignorés — sans
 * ça, chacun ressusciterait l'image supprimée le temps d'un aller-retour.
 * @param {string} meetingId
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function deleteInfographic(meetingId) {
  const id = String(meetingId || '');
  if (!id) return { ok: false, error: 'meeting_id_required' };
  const res = await apiPost('/infographic/delete', { meetingId: id });
  if (!res.ok) return { ok: false, error: res.data?.error || 'network' };
  const current = get(infographicView);
  stopPolling();
  infographicView.set({
    meetingId: id,
    status: 'none',
    dataUrl: '',
    stamp: current.meetingId === id ? current.stamp : '',
  });
  return { ok: true };
}

/** Purge totale — déconnexion, ou plus aucune réunion affichée. */
export function resetInfographic() {
  stopPolling();
  infographicView.set({ ...IDLE });
}
