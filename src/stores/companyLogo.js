/**
 * Logo de l'ENTREPRISE — l'en-tête des infographies.
 *
 * Il ne vient pas de la sonde publique (/api/auth/config), qui porte déjà le
 * logo de l'APPLICATION à chaque démarrage : il se lit à part, une fois par
 * session, la première fois qu'une infographie s'affiche
 * (GET /api/branding/company-logo). L'écran d'administration le remplace
 * directement après un enregistrement (`setCompanyLogo`).
 *
 * Un store ne parle pas à l'utilisateur : `logo` vide veut dire « non
 * renseigné », et c'est l'infographie qui pose alors le logo de l'application
 * à sa place.
 */
import { writable } from 'svelte/store';
import { get as apiGet } from '../services/apiClient.js';

/** `loaded` : la réponse est arrivée (un échec réseau laisse retenter). */
export const companyLogo = writable({ loaded: false, logo: '' });

let pending = null;

/** Lit le logo une fois par session ; les appels suivants ne refont rien. */
export function loadCompanyLogo() {
  if (pending) return pending;
  pending = apiGet('/branding/company-logo').then((res) => {
    if (res.ok) {
      companyLogo.set({ loaded: true, logo: String(res.data?.companyLogo || '') });
    } else {
      // Réessayer à la prochaine infographie plutôt que figer un échec.
      pending = null;
    }
  });
  return pending;
}

/** Après un enregistrement de l'administration : la valeur fraîche, sans relire. */
export function setCompanyLogo(logo) {
  pending = Promise.resolve();
  companyLogo.set({ loaded: true, logo: String(logo || '') });
}

/** Déconnexion : le compte suivant relira. */
export function resetCompanyLogo() {
  pending = null;
  companyLogo.set({ loaded: false, logo: '' });
}
