/**
 * Client des routes /api/connect — le compte externe (Google, Microsoft) que
 * l'utilisateur relie à myBrief pour qu'il agisse en son nom : envoyer un mail,
 * déposer un document.
 *
 * Transport et contrat { ok, status, data } : services/apiClient.js. Le flux
 * d'autorisation lui-même est une NAVIGATION (connectStartUrl), pas un fetch :
 * le fournisseur doit prendre la main sur la page.
 *
 * Le fournisseur n'est pas un paramètre : il est choisi par l'installation
 * (Administration → Actions) et le serveur le décide seul.
 */
import { baseUrl } from '../config/constants.js';
import { get, post } from './apiClient.js';

/**
 * État de la connexion du compte : interrupteurs admin, relais SMTP, et
 * `provider { id, label, available, connected, account, driveReady }`.
 */
export const fetchConnectStatus = () => get('/connect/status');

/** Révoque et supprime la connexion du compte. */
export const disconnectAccount = () => post('/connect/disconnect');

/** URL du départ du flux d'autorisation — à NAVIGUER, pas à fetch(). */
export const connectStartUrl = (ticket = '') =>
  ticket
    ? `${baseUrl}/connect/start?ticket=${encodeURIComponent(ticket)}`
    : `${baseUrl}/connect/start`;

/**
 * Billet d'entrée du flux pour l'app native.
 *
 * Dans la WebView, l'identité est un JWT porté en en-tête — et une NAVIGATION ne
 * porte pas d'en-tête. Cet appel, lui, est un `fetch` : il transporte donc
 * l'identité dans un billet à usage unique que la navigation pourra présenter.
 *
 * @returns {Promise<{ok: boolean, status: number, data: {ticket?: string}}>}
 */
export const createConnectTicket = () => post('/connect/mobile/ticket');
