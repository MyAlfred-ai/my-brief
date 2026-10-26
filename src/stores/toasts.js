/**
 * Toasts globaux — n'importe quel composant peut notifier, sans prop drilling.
 *
 * Remplace le système local d'App.svelte (closure inaccessible aux enfants :
 * chaque panneau réimplémentait ses bannières d'erreur faute de pouvoir
 * toaster). Sémantique reprise à l'identique : pile plafonnée à 5, sortie
 * animée en deux temps (exiting → retrait 300 ms plus tard), auto-fermeture.
 *
 * Le store transporte des MESSAGES DÉJÀ TRADUITS : la résolution i18n
 * (clé → chaîne) reste chez l'appelant, qui connaît sa langue et ses
 * remplacements. Pour les erreurs API, `notifyApiError` fait le pont
 * slug → traduction via le dictionnaire fourni.
 */
import { writable } from 'svelte/store';

const MAX_TOASTS = 5;
const EXIT_ANIMATION_MS = 300;

/** @type {import('svelte/store').Writable<Array<{id:number, message:string, type:string, exiting:boolean}>>} */
export const toasts = writable([]);

let idCounter = 0;

/**
 * @param {string} message - texte final, déjà traduit
 * @param {'info'|'success'|'warning'|'error'} [type]
 * @param {number} [duration] - ms avant auto-fermeture, 0 = persistant
 * @returns {number} id (pour removeToast anticipé)
 */
export function showToast(message, type = 'info', duration = 4000) {
  const id = ++idCounter;
  toasts.update((list) => {
    const next = [...list, { id, message, type, exiting: false }];
    if (next.length > MAX_TOASTS) {
      // Retrait immédiat du plus ancien (pas d'animation : il est déjà noyé).
      next.shift();
    }
    return next;
  });
  if (duration > 0) setTimeout(() => removeToast(id), duration);
  return id;
}

/** Sortie animée : marque `exiting` puis retire après l'animation CSS. */
export function removeToast(id) {
  toasts.update((list) => list.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
  setTimeout(() => {
    toasts.update((list) => list.filter((t) => t.id !== id));
  }, EXIT_ANIMATION_MS);
}

/**
 * Pont erreurs API → toast : traduit le slug de { ok, status, data } (contrat
 * services/apiClient.js) via le dictionnaire de l'appelant.
 *
 * @param {{ok: boolean, status: number, data: {error?: string}}} result
 * @param {Record<string, string>} messages - slug → message traduit ;
 *   `unknown` sert de repli
 * @returns {boolean} true si un toast est parti (résultat en erreur)
 */
export function notifyApiError(result, messages = {}) {
  if (result?.ok) return false;
  const slug = result?.data?.error || 'unknown';
  showToast(messages[slug] || messages.unknown || slug, 'error');
  return true;
}
