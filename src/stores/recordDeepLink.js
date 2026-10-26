/**
 * Deep-link `#record` — « ouvre MyBrief ET démarre une réunion ».
 *
 * Posé par l'extension Chrome (extension/), qui n'a que deux gestes possibles
 * sur l'application : ouvrir un onglet à une URL, ou changer l'URL d'un onglet
 * déjà ouvert. Le hash sert les deux cas — à froid il est lu au chargement, à
 * chaud il déclenche `hashchange` sans recharger la page (et sans perdre une
 * réunion en cours).
 *
 * Le hash est EFFACÉ dès qu'il est lu, sans événement (replaceState) : laissé
 * en place, un F5 ou un retour arrière redémarrerait une réunion. Le store ne
 * porte qu'un compteur de demandes non consommées ; App.svelte le lit et
 * décide (session connue ? réunion déjà en cours ?) — le store ne sait rien de
 * l'enregistrement.
 *
 * Le panneau ouvert (#config…) est fermé par le même hashchange : le lecteur
 * de hash des panneaux voit un hash vide et referme tout. C'est voulu : on
 * démarre une réunion pour la voir se transcrire, pas devant un écran de
 * réglages.
 */
import { writable } from 'svelte/store';

export const RECORD_HASH = '#record';

/** @type {import('svelte/store').Writable<number>} demandes non consommées (0 = rien) */
export const recordDeepLink = writable(0);

/**
 * Lit le hash courant ; s'il vaut `#record`, l'efface et enregistre une demande.
 *
 * @param {{location: {hash: string, pathname: string, search: string}, history: {replaceState: Function}}} [win]
 * @returns {boolean} une demande a été enregistrée
 */
export function readRecordHash(win = window) {
  if (win.location.hash !== RECORD_HASH) return false;
  win.history.replaceState(null, '', win.location.pathname + win.location.search);
  recordDeepLink.update((n) => n + 1);
  return true;
}

/** Remet le compteur à zéro — que la réunion ait démarré ou non. */
export function consumeRecordDeepLink() {
  recordDeepLink.set(0);
}

// Écouteur posé à l'import, AVANT celui des panneaux (App.svelte) : à l'ordre
// des écouteurs, le hash est déjà effacé quand les panneaux le relisent.
if (typeof window !== 'undefined') {
  readRecordHash();
  window.addEventListener('hashchange', () => readRecordHash());
}
