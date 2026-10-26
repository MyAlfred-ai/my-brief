/**
 * Historique des réunions — état + actions partagés (App, Sidebar, modales).
 *
 * Sorti d'App.svelte pour couper le prop drilling : la Sidebar lisait la
 * liste, la sélection et l'état de chargement via 3 props et renvoyait
 * renommage/suppression par 2 callbacks vers App.
 *
 * IDENTITÉ — une réunion se désigne par son `meetingId`, JAMAIS par sa position
 * dans la liste. Un index n'est pas une identité : la Sidebar indexait sa liste
 * FILTRÉE (recherche) pendant qu'App indexait la liste complète, si bien qu'une
 * recherche active faisait ouvrir — et supprimer — une autre réunion que celle
 * cliquée. Toute API de ce module prend donc un meetingId.
 *
 * Le FETCH de /history reste dans App.svelte (il passe par handleHttpError et
 * la récupération d'authentification, unifiées en Phase 8) : il écrit ici.
 *
 * Deux mémoires locales compensent le décalage backend :
 *   - titleOverrides : titres renommés, réappliqués après chaque refetch
 *     (le renommage backend est best-effort) ;
 *   - deletedIds : réunions supprimées localement, filtrées du refetch
 *     (une suppression backend en échec ne doit pas faire réapparaître la
 *     ligne au prochain chargement).
 */
import { writable, derived, get } from 'svelte/store';
import { post } from '../services/apiClient.js';
import { resolveHistoryTitle } from '../utils/historyTitle.js';

const TITLE_OVERRIDES_KEY = 'mybrief_title_overrides';
const DELETED_HISTORY_KEY = 'mybrief_deleted_history_ids';
const SELECTED_MEETING_KEY = 'mybrief_selected_meeting_id';
/** Ancienne clé : un INDEX, inexploitable comme identité — purgée au chargement. */
const LEGACY_SELECTED_INDEX_KEY = 'mybrief_selected_history_index';

/**
 * Identifiant d'une réunion, point de vérité unique.
 *
 * `meetingId` d'abord : c'est la clé que le backend attend sur /history/rename,
 * /history/delete, /versions/* et /transcription/update. Les autres champs sont
 * des reliquats n8n, gardés en repli pour les entrées déjà en localStorage.
 *
 * Cette fonction existe parce que trois chaînes de repli DIVERGENTES
 * cohabitaient (rename lisait `meetingId || id`, delete lisait
 * `id ?? _id ?? uuid ?? meetingId`, le refetch une troisième) : rien ne
 * garantissait que renommage et suppression visent le même document.
 */
export function meetingIdOf(item) {
  const id = item?.meetingId ?? item?.id ?? item?._id ?? item?.uuid ?? item?.sessionId;
  return id == null || id === '' ? null : String(id);
}

export const historyItems = writable([]);
export const isLoadingHistory = writable(true);
export const historyError = writable('');

/** Lecture synchrone au chargement : évite un flash du dock au refresh d'un résumé. */
export const selectedMeetingId = writable(
  (() => {
    try {
      localStorage.removeItem(LEGACY_SELECTED_INDEX_KEY);
      return localStorage.getItem(SELECTED_MEETING_KEY) || null;
    } catch {
      return null;
    }
  })(),
);

// Persistance à chaque changement — au store, pas dans un réactif d'App :
// l'état et sa persistance vivent au même endroit.
selectedMeetingId.subscribe((id) => {
  try {
    if (id) localStorage.setItem(SELECTED_MEETING_KEY, id);
    else localStorage.removeItem(SELECTED_MEETING_KEY);
  } catch {}
});

/**
 * La réunion ouverte, ou null tant qu'elle n'est pas dans la liste.
 *
 * À NE PAS confondre avec `selectedMeetingId` pour piloter l'affichage : au
 * boot, l'id est déjà lu du localStorage alors que /history n'a pas répondu —
 * cet objet vaut donc null pendant un instant. Les conditions de mise en page
 * (visibilité du dock) doivent lire l'ID ; les lectures de contenu (titre,
 * date, versions) doivent lire cet objet.
 */
export const selectedHistoryItem = derived([historyItems, selectedMeetingId], ([items, id]) =>
  id ? items.find((it) => meetingIdOf(it) === id) || null : null,
);

// ── Titres renommés (localStorage, survivent au refetch) ────────────────────

let titleOverrides = (() => {
  try {
    return JSON.parse(localStorage.getItem(TITLE_OVERRIDES_KEY) || '{}') || {};
  } catch {
    return {};
  }
})();

function persistTitleOverrides() {
  try {
    localStorage.setItem(TITLE_OVERRIDES_KEY, JSON.stringify(titleOverrides));
  } catch (e) {
    console.warn('persistTitleOverrides failed', e);
  }
}

/**
 * Applique les titres locaux + normalise le titre backend (qui replie `title`
 * sur `name` — le nom du COMPTE — pour les réunions sans titre généré, cf.
 * utils/historyTitle.js). À appeler une fois par refetch.
 */
export function applyTitleOverrides(items, lang) {
  if (!items || !items.length) return items;
  return items.map((it) => {
    const id = meetingIdOf(it);
    const override = id && titleOverrides[id];
    if (override) return { ...it, title: override };
    const resolved = resolveHistoryTitle(it, lang);
    return resolved === it.title ? it : { ...it, title: resolved };
  });
}

// ── Réunions supprimées localement ──────────────────────────────────────────

export function getDeletedHistoryIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DELETED_HISTORY_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function persistDeletedHistoryId(id) {
  if (!id) return;
  const ids = getDeletedHistoryIds();
  ids.add(String(id));
  localStorage.setItem(DELETED_HISTORY_KEY, JSON.stringify([...ids]));
}

// ── Actions ─────────────────────────────────────────────────────────────────

/**
 * Renomme localement (immédiat) + override persisté + backend best-effort
 * (échec silencieux : l'override local garde le titre à l'écran).
 */
export async function renameMeeting(meetingId, newTitle) {
  const trimmed = (newTitle || '').trim();
  if (!meetingId || !trimmed) return;
  historyItems.update((list) =>
    list.map((it) => (meetingIdOf(it) === meetingId ? { ...it, title: trimmed } : it)),
  );
  titleOverrides[meetingId] = trimmed;
  persistTitleOverrides();
  await post('/history/rename', { meetingId, title: trimmed });
}

/**
 * Supprime une réunion : mémoire locale (anti-réapparition), backend
 * best-effort, retrait de la liste, et désélection si c'était l'ouverte.
 */
export async function deleteMeeting(meetingId) {
  if (!meetingId) return;
  persistDeletedHistoryId(meetingId);
  await post('/history/delete', { meetingId });
  historyItems.update((list) => list.filter((it) => meetingIdOf(it) !== meetingId));
  selectedMeetingId.update((sel) => (sel === meetingId ? null : sel));
}

/**
 * Relit l'historique jusqu'à ce que la réunion y soit AVEC son titre définitif.
 *
 * S'arrêter à l'APPARITION du document ne suffit pas : /resume écrit la réunion
 * avant de répondre, mais avec le titre de repli — le vrai titre est généré
 * ensuite en tâche de fond (quelques secondes). Le premier tour trouvait donc
 * la réunion et rendait la main : la sidebar affichait « Réunion sans titre »
 * jusqu'au prochain rechargement complet de l'app.
 *
 * Le backend pose `titlePending` sur le document et le retire dans TOUS les cas
 * — titre généré comme génération en échec —, ce qui borne l'attente sans faire
 * dépendre la boucle du libellé de repli.
 *
 * @param {string} meetingId
 * @param {() => Promise<void>} refetch - recharge /history dans le store
 * @param {{maxAttempts?: number, intervalMs?: number}} [opts]
 */
export async function pollHistoryUntilMeetingReady(
  meetingId,
  refetch,
  { maxAttempts = 12, intervalMs = 1500 } = {},
) {
  if (!meetingId) {
    await refetch();
    return;
  }
  const target = String(meetingId);
  const isReady = (item) => meetingIdOf(item) === target && !item?.titlePending;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await refetch();
    const items = get(historyItems);
    if (Array.isArray(items) && items.some(isReady)) return;
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}
