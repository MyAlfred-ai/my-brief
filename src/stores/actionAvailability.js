/**
 * Ce qui peut partir, et par où — les actions post-réunion OUVERTES sur ce
 * compte, telles que les voient les boutons.
 *
 * Deux sources :
 *   - l'administration (onglet « Actions »), servie par /api/auth/config dans
 *     `capabilities.actions` : interrupteurs par document, relais SMTP,
 *     fournisseur de dépôt ;
 *   - le compte relié de l'utilisateur (« Ma configuration » → Connexion) :
 *     s'il existe, « Envoyer par mail » est disponible même sans relais SMTP —
 *     le serveur choisit le transport à l'envoi (lib/actions/execute.js).
 *
 * Un bouton qui échouerait au clic n'apparaît pas : « Envoyer par mail » exige
 * un moyen d'envoi, « Déposer » un fournisseur choisi.
 *
 * Extrait d'App.svelte (plafonné par `max-lines`) le jour où un second
 * consommateur est arrivé : la fenêtre « Et maintenant ? » qui suit le premier
 * résumé (components/AfterSummaryDialog.svelte) propose les mêmes actions que
 * le menu « Partager », et doit en voir exactement la même liste.
 */
import { writable, derived } from 'svelte/store';
import { auth } from './auth.js';
import { fetchConnectStatus } from '../services/connectApi.js';
import { storageLabel } from '../utils/storageVocabulary.js';

/** Interrupteurs d'un document tant que /auth/config n'a rien dit. */
const CLOSED = { email: false, storage: false, download: true };

/** Un compte externe (Google, Microsoft) est relié à ce compte myBrief. */
export const mailAccountConnected = writable(false);

/** Relit l'état du compte relié — au démarrage, et au retour d'une liaison. */
export async function loadMailAccountStatus() {
  const res = await fetchConnectStatus();
  if (res.ok) mailAccountConnected.set(!!res.data.provider?.connected);
}

/**
 * @type {import('svelte/store').Readable<{
 *   transcription: {email: boolean, storage: boolean, download: boolean},
 *   summary: {email: boolean, storage: boolean, download: boolean},
 *   emailReady: boolean, storageProvider: string, storageLabel: string}>}
 */
export const actionAvailability = derived([auth, mailAccountConnected], ([$auth, connected]) => {
  const cfg = $auth.capabilities?.actions || {};
  const storageProvider = cfg.connections?.provider || '';
  return {
    transcription: cfg.transcription || CLOSED,
    summary: cfg.summary || CLOSED,
    // Relais SMTP du serveur OU compte relié : dans les deux cas l'envoi aboutira.
    emailReady: !!cfg.emailAvailable || connected,
    storageProvider,
    storageLabel: storageLabel(storageProvider),
  };
});
