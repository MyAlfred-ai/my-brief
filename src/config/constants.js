/**
 * Constantes de l'application
 */

// URLs
// apiOrigin = '' sur le web (URLs relatives, comportement historique) ;
// origine absolue sur les builds mobiles Capacitor (cf. src/config/apiBase.js).
import { resolveApiOrigin } from './apiBase.js';
export const apiOrigin = resolveApiOrigin(import.meta.env.VITE_API_BASE_URL);
export const baseUrl = `${apiOrigin}/api`;
// ⚠️ Base du endpoint Realtime, SANS suffixe. Ne pas y ajouter `/calls`.
// App.svelte en tire l'URL du WebSocket (`wss://…/v1/realtime`). `/calls` est
// le chemin WebRTC, abandonné (code supprimé) : un patch de prod qui l'ajoutait
// ici a cassé la transcription le 2026-08-03. Si WebRTC revient, lui donner sa
// propre constante.
export const aiBaseUrl = 'https://api.openai.com/v1/realtime';

// Documentation utilisateur — docs/user/, publiée en ligne. « Aide », dans
// « Ma configuration », l'ouvre dans un nouvel onglet : elle remplace l'aide
// intégrée, qui en tenait une seconde copie et finissait par la contredire.
export const DOCS_URL = 'https://docs.myalfred.ai/my-brief/';

// Extension Chrome (dossier extension/, page « Extension Chrome » de « Ma
// configuration »). Tant que la fiche du Chrome Web Store n'existe pas, l'URL
// reste vide et la page propose le .zip produit par scripts/build-extension.mjs
// (servi depuis public/, cf. .gitignore) avec les étapes du chargement manuel.
// Renseigner l'URL du store fait basculer la page sur « Ajouter à Chrome ».
export const EXTENSION_STORE_URL = '';
export const EXTENSION_ZIP_PATH = '/mybrief-extension.zip';

// Intervalles de temps
// Rotation préventive du WebSocket Realtime. OpenAI coupe une session Realtime
// au plus tard à 60 min, et des fermetures serveur ont été observées dès ~45 min :
// à 50 min la rotation arrivait parfois APRÈS la coupure (toasts « Connexion
// perdue » en pleine réunion). 25 min garde une marge large ; la rotation est
// make-before-break (nouveau socket ouvert avant de fermer l'ancien) et
// silencieuse, donc sa fréquence est invisible pour l'utilisateur.
export const RECONNECT_INTERVAL_MS = 25 * 60 * 1000; // 25 minutes
// Chien de garde « transcription muette » : délai sans AUCUN message reçu
// d'OpenAI sur le canal micro (deltas, `completed`, `session.updated`,
// `speech_started`… n'importe quel type prouve que le canal répond) au-delà
// duquel le socket est tenu pour ZOMBIE. Incident du 26/08/2026 : un socket
// resté `readyState === OPEN` a cessé d'émettre pendant 11 min 19 s en pleine
// réunion — ni fermeture, ni erreur, donc rien que le health check (qui ne
// teste que readyState) pouvait voir, et aucune reconnexion n'est partie.
// 40 s : sur un canal SAIN, l'écart entre deux messages reste de l'ordre de
// 10-15 s au pire (fin de phrase + latence de finalisation du `completed`),
// et un `speech_started` arrive dans la seconde qui suit une prise de parole.
// 40 s laisse donc plus du double de marge, tout en tenant le critère
// « reconnexion en moins d'une minute » (40 s + une cadence de 5 s).
export const REALTIME_SILENT_STREAM_MS = 40 * 1000;
// Cadence de vérification du chien de garde. Sous-multiple franc du seuil : la
// détection tombe au pire 5 s après l'échéance, et un tick coûte deux
// comparaisons (aucun travail par frame audio).
export const REALTIME_SILENCE_CHECK_MS = 5 * 1000;
// Plafond absolu : arrêt PROPRE (sauvegarde + toast persistant), jamais silencieux.
export const MAX_RECORDING_DURATION_MS = 8 * 60 * 60 * 1000; // 8 heures
// Transcription du direct poussée en base pendant l'enregistrement. La réunion
// est ouverte dès le démarrage (/history/start) : sans ces envois, un onglet
// fermé en pleine réunion laisserait une ligne d'historique vide. 20 s est un
// compromis — assez rare pour rester marginal en trafic, assez fréquent pour
// qu'une fermeture brutale ne coûte qu'une poignée de phrases. L'envoi est
// sauté quand rien n'a changé.
export const LIVE_TRANSCRIPT_SAVE_MS = 20 * 1000;
// Notes et actions modifiées : écriture en base après ce délai de calme
// (stores/notesActionsSave.js). Même délai que l'autosave du résumé et de la
// transcription éditée — une frappe continue ne part qu'une fois arrêtée.
export const NOTES_ACTIONS_SAVE_MS = 1500;
// Invite « Poursuivre / Arrêter » : première à 3 h de durée TOTALE d'enregistrement
// (cumul + session courante), puis toutes les heures. L'enregistrement CONTINUE
// pendant que l'invite est ouverte ; sans réponse dans le délai (ou si fermée),
// arrêt propre avec le flux de sauvegarde normal.
export const CONTINUE_PROMPT_AFTER_MS = 3 * 60 * 60 * 1000; // 3 heures
export const CONTINUE_PROMPT_INTERVAL_MS = 60 * 60 * 1000; // puis toutes les heures
export const CONTINUE_PROMPT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min sans réponse → arrêt + sauvegarde

// Audio
export const SILENCE_THRESHOLD_MS = 1000;
export const KEEP_ALIVE_INTERVAL_MS = 500;
export const KEEP_ALIVE_VOLUME = 0.002;
export const AUDIO_ACTIVITY_THRESHOLD = 0.015;

// Mise en page — largeurs de fenêtre, en px CSS. Les media queries ne lisent pas
// le JavaScript : style.css et Sidebar.svelte répètent ces valeurs en dur.
// Téléphone : une seule colonne, la barre latérale est un tiroir masqué.
export const PHONE_MAX_WIDTH = 768;
// Jusqu'ici (tablette en portrait, fenêtre étroite), la barre latérale est un
// rail d'icônes qui s'ouvre PAR-DESSUS la page au lieu de la pousser : à 820 px,
// barre (280) + colonne Actions/Notes (340) laissaient ~150 px au document.
export const SIDEBAR_DRAWER_MAX_WIDTH = 1100;

// Crédit de temps (anneau de l'avatar, « Ce mois-ci », « Mes statistiques ») :
// la couleur suit la part du crédit qui RESTE — au moins la moitié : vert ; au
// moins un cinquième : ambre ; en dessous : orange ; épuisé (moins d'une
// minute) : rouge. Le cinquième est l'ancien seuil unique du compteur, qui ne
// distinguait que « normal », « bas » et « épuisé ».
export const CREDIT_TONE_HIGH = 0.5;
export const CREDIT_TONE_LOW = 0.2;
