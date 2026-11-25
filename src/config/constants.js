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
// « Réglages », l'ouvre dans un nouvel onglet : elle remplace l'aide
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
// Pause au-delà de laquelle la reprise renouvelle le canal de transcription.
// En pause, rien ne passe sur le socket, dans un sens ni dans l'autre : au bout
// de quelques minutes, un NAT, un proxy d'entreprise ou le fournisseur a pu le
// couper sans que le navigateur le sache. Sans renouvellement, la parole de la
// reprise partait dans un socket mort jusqu'au chien de garde — 40 s perdues au
// meilleur cas. Sous une minute, le socket vient de servir : on le garde.
// Coût : une clé éphémère (rotation sans coupure, cf. channel.js).
export const REALTIME_PAUSE_REFRESH_MS = 60 * 1000;
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
// Enregistrement de la réunion (MediaRecorder), gardé en mémoire jusqu'à la fin
// puis proposé au téléchargement. Sans débit fixé, Chromium encode à 128 kb/s
// (mesuré : 58 Mo/h en RAM, 173 Mo pour 3 h). 48 kb/s Opus reste transparent
// pour la parole : 22 Mo/h. Les segments hors ligne, qui partent en
// transcription, tournent déjà à 32 kb/s (platform/offlineRecording.js).
export const RECORDING_AUDIO_BITS_PER_SECOND = 48000;
// Sauvegarde locale du direct (« Reprendre » après une coupure) : les phrases
// finalisées d'une rafale sont écrites en une fois. Jamais plus tard que la
// fermeture ou la mise en arrière-plan de la page (utils/session.js).
export const SESSION_SAVE_COALESCE_MS = 2000;
// Témoin « une réunion enregistre » (utils/liveSession.js), réécrit à ce rythme :
// un téléphone tue une PWA en arrière-plan sans prévenir la page, la reprise
// repart donc au pire de cet âge-là. 5 s : une écriture de quelques octets.
export const LIVE_SESSION_BEAT_MS = 5000;

// Garde de capture (lib/recording/captureGuard.js) — micro, contexte audio et
// page surveillés pendant l'enregistrement.
// Le processor du micro rend ~12 trames par seconde : au-delà de ce silence de
// TRAMES (pas de son), la capture est tenue pour arrêtée — page gelée en
// arrière-plan, contexte audio interrompu par un appel.
export const CAPTURE_STALL_MS = 4000;
// Vérification périodique : un état cassé sans événement (piste restée muette
// après un appel) est repris au plus tard à ce rythme.
export const CAPTURE_CHECK_MS = 3000;
// Une piste muette se rétablit le plus souvent seule (fin d'appel, retour au
// premier plan). Passé ce délai, écran visible, un nouveau micro est demandé.
export const CAPTURE_MUTE_GRACE_MS = 5000;
// Écart minimal entre deux demandes de micro : pendant un appel, chacune
// échoue — inutile d'insister à chaque vérification.
export const CAPTURE_MIC_RETRY_MS = 12000;
// En deçà, une interruption ne laisse ni marqueur dans la transcription ni
// message : un changement d'application d'une seconde n'a rien fait perdre.
export const CAPTURE_MARKER_MIN_MS = 8000;
// Au-delà, le canal de transcription est renouvelé au retour sans attendre le
// chien de garde (40 s) : un socket resté « ouvert » sous une page gelée est
// le plus souvent mort.
export const CAPTURE_REFRESH_MIN_MS = 15000;
// Interruption que rien ne débloque seul (iOS exige parfois un geste pour
// relancer l'audio) : l'utilisateur est prévenu, et son prochain toucher relance.
export const CAPTURE_BLOCKED_NOTICE_MS = 10000;

// Mise en page — largeurs de fenêtre, en px CSS. Les media queries ne lisent pas
// le JavaScript : style.css et Sidebar.svelte répètent ces valeurs en dur.
// Téléphone : une seule colonne, la barre latérale est un tiroir masqué.
export const PHONE_MAX_WIDTH = 768;
// Jusqu'ici (tablette en portrait, fenêtre étroite), la barre latérale est un
// rail d'icônes qui s'ouvre PAR-DESSUS la page au lieu de la pousser : à 820 px,
// barre (280) + colonne Actions/Notes (340) laissaient ~150 px au document.
export const SIDEBAR_DRAWER_MAX_WIDTH = 1100;

// Crédit de temps (anneau de l'avatar, « Ce mois-ci », « Usage & crédits ») :
// la couleur suit la part du crédit qui RESTE — au moins la moitié : vert ; au
// moins un cinquième : ambre ; en dessous : orange ; épuisé (moins d'une
// minute) : rouge. Le cinquième est l'ancien seuil unique du compteur, qui ne
// distinguait que « normal », « bas » et « épuisé ».
export const CREDIT_TONE_HIGH = 0.5;
export const CREDIT_TONE_LOW = 0.2;

// Aide IA d'une réunion (stores/aiHelp.js). Une LECTURE est un appel au modèle :
// elle attend au moins deux phrases finalisées, laisse retomber la rafale, et ne
// repart pas avant vingt secondes — au plus 180 lectures par heure, sous le
// plafond du serveur (240, lib/config.js). Plus court, l'IA commenterait des
// demi-phrases ; plus long, une contradiction serait signalée quand la réunion
// est déjà passée à autre chose.
export const AI_HELP_WATCH_MIN_LINES = 2;
export const AI_HELP_WATCH_DEBOUNCE_MS = 1500;
export const AI_HELP_WATCH_MIN_INTERVAL_MS = 20 * 1000;
// Après un plafond atteint ou une panne du modèle : une minute de silence.
export const AI_HELP_WATCH_BACKOFF_MS = 60 * 1000;
// Ce qui part avec une lecture ou une question, en caractères : la FIN du texte.
export const AI_HELP_FRESH_MAX_CHARS = 6000;
export const AI_HELP_BEFORE_MAX_CHARS = 10000;
export const AI_HELP_ASK_TRANSCRIPT_MAX_CHARS = 48000;
// « Alfred ? » lancé seul : la phrase suivante est la question, si elle vient vite.
export const AI_HELP_ARMED_MS = 12 * 1000;
// Demande DICTÉE à l'IA (utils/voiceRequest.js) : elle ne part qu'une fois la
// personne tue — temps écoulé depuis le dernier mot transcrit de sa demande.
// Avant, elle partait à la première ligne bouclée : l'IA répondait à la moitié
// d'une phrase (signalé le 2026-11-13, « il coupe trop tôt »).
// 2,5 s quand la demande a l'air finie : une respiration en milieu de phrase
// fait 1 à 2 s, et la transcription suit la voix avec une demi-seconde de retard.
export const AI_HELP_REQUEST_QUIET_MS = 2500;
// 4 s quand elle a l'air en suspens (« j'ai une question », une virgule, un
// mot de liaison en dernier, pas de ponctuation) : la suite arrive.
export const AI_HELP_REQUEST_OPEN_MS = 4000;
// Un geste (« ferme », « agrandis ») reste vif : juste le temps de voir si la
// phrase continue (« ferme le dossier Atlas » n'en est pas un).
export const AI_HELP_REQUEST_GESTURE_MS = 900;
// Plafond d'écoute : au-delà, la demande part telle qu'elle est.
export const AI_HELP_REQUEST_MAX_MS = 30 * 1000;
// L'orbe « parle » ce temps-là après une intervention.
export const AI_HELP_SPEAK_MS = 2600;
// Minuteur demandé à l'IA (stores/aiHelpTimer.js). L'horloge est relue quatre
// fois par seconde : l'affichage ne saute jamais une seconde, et la fin tombe à
// un quart de seconde près — sans se fier à un `setTimeout` long, qu'un poste
// mis en veille ou un onglet ralenti fait sonner en retard.
export const AI_HELP_TIMER_TICK_MS = 250;
// Arrivé à zéro, il reste affiché « Temps écoulé » une minute, puis s'efface
// seul : assez pour qui revient de pause, sans rien laisser traîner à l'écran.
export const AI_HELP_TIMER_DONE_MS = 60 * 1000;
// L'orbe « parle » le temps de la mélodie de fin (utils/chime.js).
export const AI_HELP_TIMER_RING_MS = 4000;
// Les templates de compte rendu nommés à l'IA avec une question, pour qu'elle
// puisse en commander un : mêmes bornes que l'API (lib/aiHelp/prompts.js).
export const AI_HELP_TEMPLATES_MAX = 60;
export const AI_HELP_TEMPLATE_NAME_MAX = 120;
