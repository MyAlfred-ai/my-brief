/**
 * Client des routes /api/auth — sans état, sans dépendance à Svelte.
 *
 * Transport et contrat { ok, status, data } : services/apiClient.js (client
 * HTTP unique du frontend). `data.error` est un slug stable (cf.
 * services/api/lib/errors.js) que l'UI traduit elle-même : le serveur ne
 * renvoie aucune chaîne affichable.
 */
import { get, post } from './apiClient.js';

/** Capacités du serveur : pilote l'affichage du bouton SSO et du lien de réinitialisation. */
export const fetchAuthConfig = () => get('/auth/config');

/** Sonde de démarrage — répond 200 même sans session, jamais 401. */
export const fetchSession = () => get('/auth/session');

export const login = (email, password) => post('/auth/login', { email, password });

export const logout = () => post('/auth/logout', {});

export const changePassword = (currentPassword, newPassword) =>
  post('/auth/change-password', { currentPassword, newPassword });

export const forgotPassword = (email, lang = 'fr') =>
  post('/auth/forgot-password', { email, lang });

export const resetPassword = (token, password) => post('/auth/reset-password', { token, password });
