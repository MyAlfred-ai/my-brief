/**
 * Aide IA d'une réunion — l'état et la mécanique, côté écran.
 *
 * Trois moments :
 *   AVANT    rien à régler : une réunion démarre avec l'Aide IA allumée et tous
 *            ses domaines (décision du 2026-11-12). `loadAiHelp` ne dit que ce
 *            que le compte PEUT faire.
 *   PENDANT  dès que la réunion existe (`liveMeetingIdStore`), le store RELIT
 *            son réglage au serveur — qui le pose s'il n'existe pas encore —
 *            et l'adopte. Chaque phrase finalisée de la transcription est
 *            observée (`observeAiHelpTranscript`) : elle nourrit la prochaine
 *            LECTURE — un appel au modèle, cadencé (config/constants.js). Une
 *            demande adressée à l'IA (mot d'appel) est ÉCOUTÉE jusqu'au bout,
 *            lignes en cours comprises, et ne part qu'une fois la personne
 *            tue (utils/voiceRequest.js).
 *   APRÈS    les interventions restent sur la réunion, côté serveur ;
 *            `aiHelpItemsOf` les relit depuis l'historique.
 *
 * ── Pourquoi le store tient sa propre copie de la transcription ──────────────
 * Le direct vit dans une variable d'App.svelte (plafonné : on n'y ajoute rien).
 * Le store reçoit donc les lignes par le composant qui les affiche, et garde le
 * texte des lignes FINALISÉES, dans l'ordre. Une ligne est reconnue par son
 * identifiant, jamais par sa position : la déduplication d'écho retire des
 * éléments de la liste, et sa longueur peut décroître.
 *
 * Cet identifiant n'est PAS le segment de la détection de voix à lui seul :
 * deux phrases dites d'une traite partagent le même segment, donc le même
 * `itemId`, sur deux lignes (cf. utils/transcriptLive.js). Reconnues par lui
 * seul, la seconde écrasait la première dans cette copie, tour à tour, et
 * n'était jamais lue — ni pour un mot d'appel, ni pour une lecture. D'où
 * `aiHelpLineKey`, qui porte aussi l'horodatage de la ligne, et le rang des
 * lignes qui se ressembleraient encore.
 *
 * ── L'ordre du jour : un brouillon avant, la copie du serveur pendant ────────
 * Avant la réunion, `agenda` est un texte saisi sur l'accueil — un BROUILLON,
 * qui part avec le premier réglage. Pendant, la liste fait foi côté serveur :
 * l'IA y ajoute ce qu'elle entend, et l'écran n'envoie plus jamais le texte
 * entier (il effacerait ces points), seulement « ajoute ce point », « retire
 * celui-là ». Chaque réponse du serveur remplace la copie locale.
 *
 * ── Les gestes qu'on demande à l'IA ──────────────────────────────────────────
 * « Alfred, ajoute le tag Atlas », « note que… », « rappelle-moi dans dix
 * minutes… », « ferme » : le serveur vérifie le geste et dit quoi faire
 * (`actions`), ce store le fait là où vit l'état — le tag par stores/tags.js,
 * la note par `aiHelpNotes` (lue par le composant qui tient les notes de la
 * réunion : elles vivent dans App.svelte, plafonné), le rappel par un
 * minuteur. Un rappel est une intervention DATÉE, gardée avec la réunion :
 * l'écran la tait jusqu'à son heure, puis elle sonne — et une page rechargée
 * la retrouve. Un geste fait s'entend (`acknowledge`) : la personne qui l'a
 * demandé à voix haute ne regarde pas forcément l'écran.
 *
 * ── Le minuteur ──────────────────────────────────────────────────────────────
 * « Alfred, lance un minuteur de cinq minutes », « ajoute-lui deux minutes »,
 * « arrête le minuteur » : un compte à rebours VISIBLE, là où le rappel se
 * tait jusqu'à son heure. Le serveur le garde avec la réunion et rend ce qui
 * lui RESTE ; stores/aiHelpTimer.js en fait l'horloge de l'écran, et ce store
 * décide du reste : il l'arme quand une réponse ou la session le porte, joue
 * sa mélodie à zéro, et l'arrête par son bouton (`stopAiHelpTimer`).
 *
 * Deux réponses du serveur peuvent se croiser — une session relue AVANT qu'on
 * demande le minuteur, arrivée après. Chaque changement fait ici avance donc
 * un compteur (`timerRev`) : une session partie avant lui ne touche pas au
 * minuteur, elle effacerait celui qu'on vient de lancer.
 *
 * ── Les gestes sur la réunion elle-même ──────────────────────────────────────
 * « Alfred, mets en pause », « termine la réunion », « fais le compte rendu
 * avec le template Comité de pilotage », « remplace partout Market par
 * Marquet » : l'enregistrement, le compte rendu et la transcription vivent
 * dans App.svelte, plafonné. Le store ne fait donc que POSER le geste dans une
 * file, lue par un composant monté pendant la réunion et qui tient déjà les
 * fonctions qu'il faut :
 *   `aiHelpCommands`  pause, reprise, fin, compte rendu → AiHelpMeetingBridge
 *                     (dans MobileMeetingOverlays, qui reçoit d'App de quoi
 *                     mettre en pause, reprendre, enregistrer, résumer) ;
 *   `aiHelpEdits`     corrections de la transcription → AiHelpStage (dans
 *                     LiveTranscript, qui a les lignes et relaie déjà à App
 *                     l'événement `edit` de la correction à la main).
 * Pour que l'IA puisse nommer un template, le pont lui dit ceux que l'écran
 * propose (`setAiHelpTemplates`) : leur NOM part avec chaque question, et le
 * nom que le serveur rend est ramené ici à son identifiant.
 *
 * Trois partis pris :
 *   - « termine » range la réunion SANS compte rendu (« Enregistrer sans
 *     résumé ») : rien n'est perdu, le compte rendu reste à un clic. Sauf si on
 *     l'a commandé plus tôt — « à la fin, le compte rendu avec le template… » :
 *     c'est alors lui que « termine » rédige ;
 *   - « reprends » ne s'entend pas : en pause, le micro est coupé. Il se
 *     demande par écrit, au pupitre — ou par le bouton « Reprendre » ;
 *   - l'IA ne supprime jamais rien : ni réunion, ni prise de parole.
 *
 * ── Une seule fenêtre, une seule fermeture ───────────────────────────────────
 * L'IA n'occupe jamais qu'UNE fenêtre : la carte de sa dernière intervention,
 * ou la conversation. Et la fermer ferme tout (`closeAiHelpCards`) : les
 * autres interventions encore ouvertes sont rangées avec elle — elles restent
 * dans le fil de la conversation. Avant, chaque question laissait sa carte, et
 * il fallait les fermer une à une (signalé le 2026-11-12).
 *
 * Sa taille — fenêtre et texte — se règle sur trois crans (`aiHelpSize`), par
 * ses boutons ou à la voix ; elle est gardée sur l'appareil, pas sur le
 * compte : ce qui se lit bien sur un grand écran de salle ne vaut pas pour un
 * téléphone.
 *
 * ── Ce qui s'entend : quatre sons, une voix, un bouton muet ──────────────────
 * Les PRÉFÉRENCES du compte (Réglages → Aide IA, `preferences`) disent quels
 * sons jouent — alertes, idées, gestes faits, fin du minuteur — et si elle
 * lit à voix haute, avec quel moteur. Le bouton du son, pendant la réunion,
 * coupe TOUT pour CETTE réunion (`sound`) : rien ne part au serveur, la
 * suivante repart avec les préférences. Le store choisit quoi lire (`aiHelpSpeech`) ; le composant
 * qui parle (AiHelpVoice) en fait des phrases — il a les libellés — et
 * lib/aiHelp/voice.js les dit. Ce qu'elle vient de dire et que le micro
 * renvoie est reconnu (utils/speechEcho.js) : elle ne se relit pas.
 *
 * Un store ne parle pas à l'utilisateur : `notice` et `error` sont des slugs,
 * les libellés vivent dans config/uiText.js (`aiHelp.notices`, `aiHelp.errors`).
 */
import { writable, derived, get as read } from 'svelte/store';
import { currentLanguageStore } from '../store.js';
import { isPausedStore, liveMeetingIdStore } from './recording.js';
import { historyItems, meetingIdOf } from './history.js';
import { activePanel } from './panels.js';
import { tagMeeting } from './tags.js';
import * as api from '../services/aiHelpApi.js';
import { isDismissal, sizeRequest } from '../utils/wakeWord.js';
import { createVoiceRequestCollector } from '../utils/voiceRequest.js';
import { effectiveSpeakerLabels } from '../utils/transcriptAttribution.js';
import { playAck, playBell, playChime, playTimerMelody } from '../utils/chime.js';
import { aiHelpTimer, aiHelpTimerLeftMs, clearAiHelpTimer, runAiHelpTimer } from './aiHelpTimer.js';
import { aiHelpSpeaking, recentSpeech, stopSpeaking } from '../lib/aiHelp/voice.js';
import { isEchoOf } from '../utils/speechEcho.js';
import {
  AI_HELP_WATCH_MIN_LINES,
  AI_HELP_WATCH_DEBOUNCE_MS,
  AI_HELP_WATCH_MIN_INTERVAL_MS,
  AI_HELP_WATCH_BACKOFF_MS,
  AI_HELP_FRESH_MAX_CHARS,
  AI_HELP_BEFORE_MAX_CHARS,
  AI_HELP_ASK_TRANSCRIPT_MAX_CHARS,
  AI_HELP_SPEAK_MS,
  AI_HELP_TIMER_RING_MS,
  AI_HELP_TEMPLATES_MAX,
  AI_HELP_TEMPLATE_NAME_MAX,
} from '../config/constants.js';

/** Les domaines d'intervention, dans l'ordre de l'écran (miroir de lib/aiHelp/domains.js). */
export const AI_HELP_DOMAINS = ['project', 'qa', 'agenda', 'ideas'];
/** Ceux où l'IA intervient d'elle-même : sans aucun d'eux, aucune lecture ne part. */
const WATCHED_DOMAINS = ['project', 'agenda', 'ideas'];

const noDomains = () => ({ project: false, qa: false, agenda: false, ideas: false });

/**
 * Les préférences d'un compte qui n'a rien réglé (miroir de
 * services/api/lib/aiHelp/preferences.js) : tout allumé, les quatre sons, pas
 * de voix.
 */
export const defaultAiHelpPreferences = () => ({
  start: { enabled: true, domains: { project: true, qa: true, agenda: true, ideas: true } },
  sounds: { alerts: true, ideas: true, actions: true, timer: true },
  voice: {
    enabled: false,
    provider: 'browser',
    model: '',
    voice: '',
    read: { answers: true, alerts: true, ideas: false },
  },
});

/** Des préférences reçues, comblées champ par champ — jamais un trou dans la lecture. */
function preferencesFrom(raw) {
  const base = defaultAiHelpPreferences();
  if (!raw || typeof raw !== 'object') return base;
  return {
    start: {
      ...base.start,
      ...raw.start,
      domains: { ...base.start.domains, ...raw.start?.domains },
    },
    sounds: { ...base.sounds, ...raw.sounds },
    voice: { ...base.voice, ...raw.voice, read: { ...base.voice.read, ...raw.voice?.read } },
  };
}

function initialState() {
  return {
    loaded: false,
    // Ce que le compte peut faire (droits du groupe, réglages de l'installation).
    available: false,
    myBrain: false,
    // Pourquoi myBrain est lu, ou non (slug du serveur : `aiHelp.noBrainReasons`).
    myBrainReason: '',
    allowed: noDomains(),
    wakeWord: '',
    myBrainUrl: '',
    // Le réglage — celui des préférences, puis celui de la réunion.
    enabled: false,
    domains: noDomains(),
    // Le son de CETTE réunion : coupé d'un geste, jamais gardé (cf. en-tête).
    sound: true,
    // Réglages → Aide IA : démarrage, sons, voix.
    preferences: defaultAiHelpPreferences(),
    agenda: '',
    // La réunion en cours.
    meetingId: null,
    project: null,
    projectDeclined: false,
    candidates: [],
    agendaState: [],
    items: [],
    pending: [],
    speaking: false,
    notice: '',
    error: '',
  };
}

export const aiHelp = writable(initialState());

/**
 * Le pupitre — demander, régler, relire — est-il ouvert ? Un store et non un
 * état de composant : il s'ouvre depuis la pastille du dock (ordinateur) ou la
 * barre de réunion (téléphone), et s'affiche dans la zone de transcription.
 */
export const aiHelpDeskOpen = writable(false);

/**
 * Ce que le pupitre montre : la conversation (`chat`), ou ses réglages
 * (`settings`). Il s'ouvre toujours sur la conversation — sauf quand on vient
 * de « Corriger » sur la carte de l'ordre du jour, qui mène droit aux réglages.
 * @type {import('svelte/store').Writable<'chat'|'settings'>}
 */
export const aiHelpDeskView = writable('chat');
aiHelpDeskOpen.subscribe((open) => {
  if (!open) aiHelpDeskView.set('chat');
});

/** Les crans de taille de la fenêtre de l'IA : 0 (le plus petit, d'origine) à 2. */
export const AI_HELP_SIZE_MAX = 2;
/**
 * L'échelle du texte à chaque cran (`--ai-scale`) : la fenêtre de l'IA et son
 * minuteur la lisent — ce qui se voit de loin dans une salle vaut pour les deux.
 */
export const AI_HELP_SCALES = [1, 1.2, 1.45];
const SIZE_STORAGE_KEY = 'mybrief_ai_help_size';

function storedSize() {
  try {
    const value = Number(globalThis.localStorage?.getItem(SIZE_STORAGE_KEY));
    return Number.isInteger(value) && value >= 0 && value <= AI_HELP_SIZE_MAX ? value : 0;
  } catch {
    return 0;
  }
}

/** Le cran courant. @type {import('svelte/store').Writable<number>} */
export const aiHelpSize = writable(storedSize());

/**
 * Agrandit (`+1`) ou réduit (`-1`) la fenêtre de l'IA et son texte, d'un cran,
 * sans sortir des bornes. Gardé sur l'appareil ; un stockage refusé
 * (navigation privée) n'empêche rien, la taille vaut alors pour la session.
 * @param {number} delta
 */
export function resizeAiHelp(delta) {
  const next = Math.min(AI_HELP_SIZE_MAX, Math.max(0, read(aiHelpSize) + Math.sign(delta)));
  aiHelpSize.set(next);
  try {
    globalThis.localStorage?.setItem(SIZE_STORAGE_KEY, String(next));
  } catch {
    /* stockage indisponible : la taille tient jusqu'au rechargement */
  }
  return { ok: true, size: next };
}

/**
 * Les lignes de la transcription où le mot d'appel a DÉCLENCHÉ l'IA — une
 * question, ou un prénom lancé seul qui arme l'écoute. La transcription y écrit
 * le prénom dans la teinte de l'IA : on voit qu'elle a pris la phrase pour elle,
 * avant même que la réponse arrive. Un prénom cité au milieu d'une phrase, ou
 * dit quand les questions sont coupées, n'y entre pas — il n'a rien déclenché.
 * @type {import('svelte/store').Writable<Set<string>>} des `aiHelpLineKey`
 */
export const aiHelpCalledLines = writable(new Set());

/**
 * Ce qui désigne une ligne de la transcription, d'un rendu à l'autre : son
 * segment ET son horodatage de naissance, qu'elle garde de la ligne en cours à
 * la ligne bouclée. Le segment seul désignait deux lignes à la fois.
 */
export const aiHelpLineKey = (item) => {
  const born = `${item?.timestamp ?? ''}|${item?.time ?? ''}`;
  if (!item?.itemId) return born;
  return born === '|' ? item.itemId : `${item.itemId}|${born}`;
};

/**
 * Les dernières lignes que lit l'écoute des demandes : une demande tient en
 * trente secondes, pas en quarante lignes. Sans cette borne, chaque mot
 * transcrit recopiait toute la réunion.
 */
const VOICE_WINDOW_LINES = 40;

/** Le domaine est-il réellement en service : allumé, proposé, Aide IA allumée ? */
export const aiHelpDomainOn = (state, key) =>
  state.available && state.enabled && state.domains[key] === true && state.allowed[key] === true;

/**
 * L'état de l'orbe : éteinte, à l'écoute, en train de chercher, en train de
 * parler — une carte qui arrive, ou sa voix qui lit.
 */
export const aiHelpOrb = derived([aiHelp, aiHelpSpeaking], ([$s, $talking]) => {
  if (!$s.available || !$s.enabled) return 'off';
  if ($s.pending.length) return 'think';
  return $s.speaking || $talking ? 'speak' : 'listen';
});

/** Un rappel dont l'heure n'est pas venue : il existe, mais ne se montre pas. */
const isPending = (item) => item.kind === 'reminder' && Date.parse(item.dueAt) > Date.now();

/**
 * Les interventions encore ouvertes, de la plus ancienne à la plus récente —
 * sans les rappels à venir. Recalculé quand le store change : un rappel qui
 * sonne y touche (`ringReminder`), c'est ce qui le fait apparaître.
 */
export const aiHelpOpenItems = derived(aiHelp, ($s) =>
  $s.items.filter((item) => item.state === 'open' && !isPending(item)),
);

/**
 * Les notes que l'IA vient d'ajouter à la demande, en attente d'être écrites
 * dans les notes de la réunion. Lues et vidées (`takeAiHelpNotes`) par
 * MobileMeetingOverlays — monté tant qu'une réunion est ouverte, à l'ordinateur
 * comme au téléphone, et lié aux notes d'App.svelte.
 * @type {import('svelte/store').Writable<string[]>}
 */
export const aiHelpNotes = writable([]);

/** Rend les notes en attente, et vide la file. */
export function takeAiHelpNotes() {
  const waiting = read(aiHelpNotes);
  if (waiting.length) aiHelpNotes.set([]);
  return waiting;
}

/**
 * Les interventions à lire à voix haute, en attente du composant qui parle
 * (AiHelpVoice, monté avec la scène) : lui seul a les libellés — un rappel se
 * lit « C'est l'heure du rappel : … ». Lues et vidées par `takeAiHelpSpeech`.
 * @type {import('svelte/store').Writable<object[]>}
 */
export const aiHelpSpeech = writable([]);

/** Rend les interventions à lire, et vide la file. */
export function takeAiHelpSpeech() {
  const waiting = read(aiHelpSpeech);
  if (waiting.length) aiHelpSpeech.set([]);
  return waiting;
}

/**
 * Les gestes sur la réunion que l'IA vient de se voir demander, en attente
 * d'être faits : `{ type: 'meeting', do: 'pause' | 'resume' | 'end' }`,
 * `{ type: 'summary', template }` (terminer et rédiger tout de suite) ou
 * `{ type: 'template', template }` (retenir le template pour la fin). Lus et
 * vidés (`takeAiHelpCommands`) par AiHelpMeetingBridge.
 * @type {import('svelte/store').Writable<object[]>}
 */
export const aiHelpCommands = writable([]);

/** Rend les gestes en attente, et vide la file. */
export function takeAiHelpCommands() {
  const waiting = read(aiHelpCommands);
  if (waiting.length) aiHelpCommands.set([]);
  return waiting;
}

/**
 * Les corrections de la transcription demandées à l'IA, en attente d'être
 * faites : `{ find, with, all, skipKey }` (utils/transcriptReplace.js). Lues
 * et vidées (`takeAiHelpEdits`) par AiHelpStage, qui a les lignes sous la main.
 * @type {import('svelte/store').Writable<object[]>}
 */
export const aiHelpEdits = writable([]);

/** Rend les corrections en attente, et vide la file. */
export function takeAiHelpEdits() {
  const waiting = read(aiHelpEdits);
  if (waiting.length) aiHelpEdits.set([]);
  return waiting;
}

/**
 * Les interventions gardées avec une réunion de l'historique, dans la forme
 * que les cartes attendent.
 * @param {object|null} historyItem - un élément de `historyItems`
 */
export function aiHelpItemsOf(historyItem) {
  const raw = historyItem?.aiHelp;
  if (!raw || !Array.isArray(raw.items)) return [];
  const states = raw.states && typeof raw.states === 'object' ? raw.states : {};
  return raw.items
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => ({ ...item, state: states[item.id] || 'open' }));
}

// ── Mémoire de la réunion en cours (hors store : rien de tout cela ne s'affiche) ──

let seenLines = new Set();
let lines = [];
/** Où est chaque ligne retenue, et ce qu'on en a lu : clé → { at, text, who }. */
let lineOf = new Map();
let primed = false;
let watchedUpTo = 0;
let freshCount = 0;
let watchTimer = null;
let watchInFlight = false;
let nextWatchAt = 0;
let sessionSeq = 0;
let pendingSeq = 0;
let speakTimer = null;
let lastTagId;
/** Les rappels à venir : identifiant → minuteur. */
let reminderTimers = new Map();
/** L'ordre du jour saisi avant la réunion n'est pas encore parti au serveur. */
let agendaDraft = false;
/** Les templates de compte rendu que l'écran propose : `[{ id, label }]`. */
let templates = [];
/** Un compte rendu commandé pour la fin de la réunion : `{ template }`, ou null. */
let summaryOrder = null;
/** Avance à chaque changement du minuteur fait ici (cf. l'en-tête). */
let timerRev = 0;

function forgetMeeting() {
  seenLines = new Set();
  lines = [];
  lineOf = new Map();
  summaryOrder = null;
  takeAiHelpCommands();
  takeAiHelpEdits();
  primed = false;
  watchedUpTo = 0;
  freshCount = 0;
  clearTimeout(watchTimer);
  watchTimer = null;
  nextWatchAt = 0;
  voiceRequests.reset();
  lastTagId = undefined;
  if (read(aiHelpCalledLines).size) aiHelpCalledLines.set(new Set());
  reminderTimers.forEach((timer) => clearTimeout(timer));
  reminderTimers = new Map();
  // Le minuteur appartient à la réunion : il ne sonne pas dans la suivante.
  applyTimer(null);
  takeAiHelpNotes();
  takeAiHelpSpeech();
  stopSpeaking();
}

const patch = (changes) => aiHelp.update((s) => ({ ...s, ...changes }));
const errorOf = (res) => res?.data?.error || 'network';

/**
 * Le réglage tel qu'il part au serveur. L'ordre du jour n'en fait partie que
 * tant qu'il est un brouillon : une fois la réunion lancée, le renvoyer
 * écraserait ce que l'IA a retenu depuis.
 */
function prefsOf(state) {
  return {
    enabled: state.enabled,
    domains: state.domains,
    ...(agendaDraft ? { agenda: state.agenda } : {}),
  };
}

/** Même point, à la casse, aux accents et à la ponctuation près (miroir d'`agendaKey`, API). */
const pointKey = (label) =>
  String(label ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Les templates de compte rendu que l'écran propose en ce moment, dits par le
 * composant qui les tient (AiHelpMeetingBridge) : leur nom part avec chaque
 * question, pour que l'IA en commande un qui existe.
 * @param {Array<{id: string, label: string}>} list
 */
export function setAiHelpTemplates(list) {
  templates = (Array.isArray(list) ? list : [])
    .map((template) => ({
      id: String(template?.id || ''),
      label: String(template?.label || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, AI_HELP_TEMPLATE_NAME_MAX),
    }))
    .filter((template) => template.id && template.label)
    .slice(0, AI_HELP_TEMPLATES_MAX);
}

/** Le nom d'un template, tel que le serveur le rend → son identifiant ('' : inconnu). */
const templateIdOf = (name) =>
  templates.find((template) => pointKey(template.label) === pointKey(name))?.id || '';

/** L'ordre du jour reçu du serveur → ce que le store en garde. */
function agendaFrom(list) {
  if (!Array.isArray(list)) return {};
  return {
    agendaState: list,
    // Un brouillon pas encore parti ne se fait pas écraser par une liste vide.
    ...(agendaDraft ? {} : { agenda: list.map((point) => point.label).join('\n') }),
  };
}

/** Ce qui ne peut pas attendre : une contradiction, un rappel, la fin de réunion. */
const isUrgent = (item) =>
  item.kind === 'alert' || item.kind === 'reminder' || item.event === 'closing';

/** Cette intervention se lit-elle à voix haute, d'après les préférences ? */
function readsAloud(item, voice) {
  if (!voice.enabled) return false;
  if (isUrgent(item)) return voice.read.alerts;
  if (item.kind === 'idea') return voice.read.ideas;
  return item.kind === 'answer' && voice.read.answers && !!String(item.body || '').trim();
}

/**
 * L'orbe « parle » un instant. Si le son de la réunion est allumé, deux sortes
 * d'interventions s'entendent, chacune avec son son (utils/chime.js) — chacun
 * selon les préférences :
 *   - l'URGENT, en carillon : une contradiction, un rappel, et le rappel de
 *     fin de réunion — les gens se lèvent, une carte muette arriverait après
 *     eux ;
 *   - une IDÉE, d'un coup de sonnette : elle arrive sans qu'on l'ait demandée,
 *     au fil de la réunion — sans son, elle passait inaperçue sous la
 *     transcription (demande du 2026-11-13).
 * Un seul son par lecture : l'urgent couvre l'idée arrivée avec lui. Une
 * réponse ne sonne pas — on l'attend, les yeux sur l'écran ; si elle a fait
 * un geste, c'est `acknowledge` qui le dit. Puis ce qui doit être LU part à la
 * voix (`aiHelpSpeech`).
 */
function announce(items) {
  if (!items.length) return;
  const { sound, preferences } = read(aiHelp);
  if (sound) {
    const { sounds, voice } = preferences;
    if (items.some(isUrgent) && sounds.alerts) playChime();
    else if (items.some((item) => item.kind === 'idea') && sounds.ideas) playBell();
    const aloud = items.filter((item) => readsAloud(item, voice));
    if (aloud.length) aiHelpSpeech.update((waiting) => [...waiting, ...aloud]);
  }
  patch({ speaking: true });
  clearTimeout(speakTimer);
  speakTimer = setTimeout(() => patch({ speaking: false }), AI_HELP_SPEAK_MS);
}

/**
 * Un geste demandé est fait : un son bref et sobre, si le son est allumé —
 * « compris, c'est fait ». Seulement quand quelque chose a vraiment été fait :
 * un tag introuvable, un template inconnu ne sonnent pas, la réponse dit
 * pourquoi.
 */
function acknowledge() {
  const { sound, preferences } = read(aiHelp);
  if (sound && preferences.sounds.actions) playAck();
}

// ── Minuteur ────────────────────────────────────────────────────────────────

/** Sous cet écart avec ce que dit le serveur, le minuteur n'est pas recalé. */
const TIMER_DRIFT_MS = 2000;
/** À moins de ce reste, un minuteur que le serveur dit fini va sonner : on le laisse. */
const TIMER_ENDING_MS = 5000;

/**
 * Le décompte est à zéro : sa mélodie, si le son de la réunion est allumé et
 * que les préférences la gardent — et l'orbe « parle » le temps qu'elle joue.
 */
function ringTimer() {
  const { sound, preferences } = read(aiHelp);
  if (sound && preferences.sounds.timer) playTimerMelody();
  patch({ speaking: true });
  clearTimeout(speakTimer);
  speakTimer = setTimeout(() => patch({ speaking: false }), AI_HELP_TIMER_RING_MS);
}

/** Le minuteur change ICI — une réponse qui l'a touché, son bouton, la réunion qui se ferme. */
function applyTimer(timer) {
  timerRev += 1;
  if (timer) runAiHelpTimer(timer, ringTimer);
  else clearAiHelpTimer();
}

/**
 * Le minuteur tel que la SESSION le rend : une page rechargée le retrouve, un
 * autre onglet qui l'a arrêté l'arrête ici. Celui qui tourne déjà, à l'heure,
 * n'est pas relancé — il sauterait d'une seconde à chaque relecture.
 * @param {{remainingMs: number, seconds: number, label: string}|null|undefined} fromServer
 */
function adoptTimer(fromServer) {
  if (fromServer === undefined) return;
  const local = read(aiHelpTimer);
  const running = !!local && !local.done;
  const leftMs = aiHelpTimerLeftMs();
  if (fromServer) {
    const same =
      running &&
      local.label === String(fromServer.label || '') &&
      Math.abs(leftMs - fromServer.remainingMs) < TIMER_DRIFT_MS;
    if (!same) runAiHelpTimer(fromServer, ringTimer);
    // Le serveur n'en a plus : arrêté ailleurs. Sauf s'il touche à sa fin —
    // l'horloge d'ici a quelques dixièmes de retard, et l'effacer le ferait taire.
  } else if (running && leftMs > TIMER_ENDING_MS) clearAiHelpTimer();
}

/**
 * Le bouton du minuteur : l'arrêter, ou ranger celui qui vient de sonner.
 * Retiré de l'écran tout de suite, dit au serveur ensuite.
 */
export function stopAiHelpTimer() {
  const timer = read(aiHelpTimer);
  if (!timer) return { ok: true };
  applyTimer(null);
  // À zéro, le serveur ne le connaît déjà plus : rien à lui dire.
  return timer.done ? { ok: true } : syncSession({ timer: 'stop' });
}

/**
 * Ce que le serveur sait de la réunion, fondu dans ce que l'écran a déjà.
 * `timerFresh` faux : le minuteur a changé ici depuis que cette session est
 * partie — ce qu'elle en dit est périmé.
 */
function applySession(session, candidates = [], timerFresh = true) {
  aiHelp.update((s) => {
    const known = new Map(s.items.map((item) => [item.id, item]));
    const fromServer = session.items.map((item) => ({
      ...item,
      fresh: !!known.get(item.id)?.fresh,
    }));
    const serverIds = new Set(fromServer.map((item) => item.id));
    return {
      ...s,
      // Le réglage de la réunion fait foi : c'est le serveur qui l'a posé
      // (tout allumé au départ) et qui le garde d'un rechargement à l'autre.
      enabled: session.enabled === true,
      domains: { ...noDomains(), ...session.domains },
      project: session.project,
      projectDeclined: session.projectDeclined,
      ...agendaFrom(session.agendaState),
      candidates: session.project ? [] : candidates.length ? candidates : s.candidates,
      // Une intervention reçue pendant l'aller-retour n'est pas perdue.
      items: [...fromServer, ...s.items.filter((item) => !serverIds.has(item.id))],
    };
  });
  scheduleReminders();
  if (timerFresh) adoptTimer(session.timer);
}

/** L'heure d'un rappel est venue : il sonne, et prend la scène. */
function ringReminder(id) {
  reminderTimers.delete(id);
  const item = read(aiHelp).items.find((entry) => entry.id === id);
  if (!item || item.state !== 'open') return;
  // En FIN de liste : la scène montre la plus récente, et c'est à cet instant
  // qu'il le devient — pas à celui où on l'a demandé.
  aiHelp.update((s) => ({
    ...s,
    items: [
      ...s.items
        .filter((entry) => entry.id !== id)
        .map((entry) => (entry.fresh ? { ...entry, fresh: false } : entry)),
      { ...item, fresh: true },
    ],
  }));
  announce([item]);
}

/**
 * Arme un minuteur par rappel à venir. Appelé à chaque fois que la liste des
 * interventions arrive du serveur : un rappel posé avant un rechargement de
 * page sonne quand même. Un rappel dont l'heure est passée se montre sans
 * sonner — on ne sait pas depuis quand il attend.
 */
function scheduleReminders() {
  for (const item of read(aiHelp).items) {
    if (!isPending(item) || item.state !== 'open' || reminderTimers.has(item.id)) continue;
    reminderTimers.set(
      item.id,
      setTimeout(() => ringReminder(item.id), Date.parse(item.dueAt) - Date.now()),
    );
  }
}

async function syncSession(body) {
  const { meetingId } = read(aiHelp);
  if (!meetingId) return { ok: true };
  const seq = (sessionSeq += 1);
  const rev = timerRev;
  const res = await api.saveAiHelpSession({ meetingId, ...body });
  if (read(aiHelp).meetingId !== meetingId) return { ok: false, error: 'stale' };
  if (!res.ok) {
    // Le droit a été retiré entre-temps : l'Aide IA disparaît, sans bruit.
    if (errorOf(res) === 'ai_help_not_allowed') patch({ available: false, enabled: false });
    return { ok: false, error: errorOf(res) };
  }
  // Le brouillon est arrivé : le serveur tient désormais l'ordre du jour.
  if (body.agenda !== undefined) agendaDraft = false;
  // Deux réglages coup sur coup : seule la dernière réponse fait foi.
  if (seq === sessionSeq) applySession(res.data.session, res.data.candidates, rev === timerRev);
  return { ok: true };
}

// ── Chargement ──────────────────────────────────────────────────────────────

/** Ce que le compte peut faire, ses préférences, et ce avec quoi une réunion démarre. */
export async function loadAiHelp() {
  const res = await api.fetchAiHelp();
  if (!res.ok) {
    patch({ loaded: true, available: false });
    return { ok: false, error: errorOf(res) };
  }
  const data = res.data;
  aiHelp.update((s) => ({
    ...s,
    loaded: true,
    available: data.available === true,
    myBrain: data.myBrain === true,
    myBrainReason: data.myBrainReason || '',
    allowed: { ...noDomains(), ...data.domains },
    wakeWord: data.wakeWord || '',
    myBrainUrl: data.myBrainUrl || '',
    preferences: preferencesFrom(data.preferences),
    // En pleine réunion, le réglage courant prime : il vient du serveur
    // (`applySession`), et le son coupé le reste. Hors réunion, ce avec quoi
    // la prochaine démarrera — son allumé.
    ...(s.meetingId && s.loaded
      ? {}
      : {
          enabled: data.defaults?.enabled === true,
          domains: { ...noDomains(), ...data.defaults?.domains },
          sound: true,
        }),
  }));
  return { ok: true };
}

/**
 * Réglages → Aide IA : enregistre les préférences, et les applique aussitôt —
 * les sons et la voix de la réunion en cours suivent, son démarrage non.
 * @param {{start?: object, sounds?: object, voice?: object}} changes
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function saveAiHelpPreferences(changes) {
  const res = await api.saveAiHelpPreferences(changes);
  if (!res.ok) return { ok: false, error: errorOf(res) };
  const preferences = preferencesFrom(res.data.preferences);
  patch({ preferences });
  if (!preferences.voice.enabled) stopSpeaking();
  return { ok: true };
}

/**
 * Les moteurs de voix que l'installation propose, ESSAYÉS par le serveur.
 * @returns {Promise<{ok: boolean, providers?: object[], error?: string}>}
 */
export async function loadAiHelpVoices() {
  const res = await api.fetchAiHelpVoices();
  if (!res.ok) return { ok: false, error: errorOf(res) };
  return { ok: true, providers: Array.isArray(res.data.providers) ? res.data.providers : [] };
}

export function resetAiHelp() {
  forgetMeeting();
  agendaDraft = false;
  aiHelpDeskOpen.set(false);
  clearTimeout(speakTimer);
  aiHelp.set(initialState());
}

// ── Réglage : avant ou pendant, un geste chacun ─────────────────────────────

export function setAiHelpEnabled(enabled) {
  patch({ enabled: enabled === true, error: '' });
  const state = read(aiHelp);
  // En l'allumant en cours de réunion, tout le réglage part : la session
  // n'existe peut-être pas encore côté serveur.
  return syncSession(enabled ? prefsOf(state) : { enabled: false });
}

export function toggleAiHelpDomain(key) {
  const state = read(aiHelp);
  if (!AI_HELP_DOMAINS.includes(key) || !state.allowed[key]) return { ok: false };
  const domains = { ...state.domains, [key]: !state.domains[key] };
  patch({ domains });
  if (state.enabled) scheduleWatch();
  return state.enabled ? syncSession({ domains }) : { ok: true };
}

/**
 * Coupe ou rétablit le son de l'Aide IA pour CETTE réunion : ses sons et sa
 * voix. Rien ne part au serveur — les préférences se règlent dans Réglages →
 * Aide IA. Rétabli, un son bref le confirme : c'est aussi le geste qui
 * déverrouille l'audio d'une page où personne n'avait encore cliqué.
 */
export function setAiHelpSound(sound) {
  const on = sound !== false;
  patch({ sound: on });
  if (on) playAck();
  else {
    stopSpeaking();
    takeAiHelpSpeech();
  }
  return { ok: true };
}

/**
 * L'ordre du jour saisi sur l'accueil, AVANT la réunion : un brouillon local,
 * qui part avec le premier réglage de la réunion.
 */
export function setAiHelpAgenda(agenda) {
  agendaDraft = true;
  patch({ agenda: String(agenda ?? '') });
}

/** Pendant la réunion : un point de plus, affiché tout de suite. */
export function addAiHelpAgendaPoint(label) {
  const text = String(label ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const state = read(aiHelp);
  const key = pointKey(text);
  if (!key || !state.meetingId) return { ok: false };
  if (state.agendaState.some((point) => pointKey(point.label) === key)) return { ok: true };
  patch({ agendaState: [...state.agendaState, { label: text, state: 'todo', heard: false }] });
  return syncSession({ agendaAdd: text });
}

/** Pendant la réunion : un point de moins — l'IA ne le remettra pas d'elle-même. */
export function removeAiHelpAgendaPoint(label) {
  const state = read(aiHelp);
  if (!state.meetingId) return { ok: false };
  patch({ agendaState: state.agendaState.filter((point) => point.label !== label) });
  return syncSession({ agendaRemove: label });
}

// ── Projet ──────────────────────────────────────────────────────────────────

export const chooseAiHelpProject = (path) => syncSession({ projectPath: path });
export const declineAiHelpProject = () => {
  patch({ candidates: [] });
  return syncSession({ projectMode: 'none' });
};
export const forgetAiHelpProject = () => syncSession({ projectMode: 'auto' });

/** @returns {Promise<{ok: boolean, projects?: object[], error?: string}>} */
export async function searchAiHelpProjects(query) {
  const res = await api.searchAiHelpProjects(String(query || '').trim());
  if (!res.ok) return { ok: false, error: errorOf(res) };
  return { ok: true, projects: res.data.projects || [] };
}

// ── Interventions ───────────────────────────────────────────────────────────

/** « Compris », « Écarter », ou rouvrir — appliqué tout de suite, écrit ensuite. */
export async function setAiHelpItemState(id, state, meetingId = read(aiHelp).meetingId) {
  aiHelp.update((s) => ({
    ...s,
    items: s.items.map((item) => (item.id === id ? { ...item, state, fresh: false } : item)),
  }));
  if (!meetingId) return { ok: true };
  const res = await api.saveAiHelpItemState({ meetingId, itemId: id, state });
  return res.ok ? { ok: true } : { ok: false, error: errorOf(res) };
}

export const clearAiHelpNotice = () => patch({ notice: '', error: '' });

function addItems(items) {
  if (!items.length) return;
  aiHelp.update((s) => ({
    ...s,
    items: [
      ...s.items.map((item) => (item.fresh ? { ...item, fresh: false } : item)),
      ...items.map((item) => ({ ...item, fresh: true })),
    ],
  }));
  announce(items);
}

/**
 * Une question posée à l'IA — par écrit, ou reconnue à voix haute.
 * @param {string} question
 * @param {{voice?: boolean, seen?: boolean, lineKey?: string}} [options] -
 *   `seen` : la question vient du pupitre, où la réponse se lit dans le fil ;
 *   elle est donc rangée d'emblée, pour ne pas ressurgir sur la scène quand on
 *   referme. `lineKey` : la ligne de la transcription qui a porté la question
 *   — une correction demandée à voix haute ne la réécrit pas.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function askAiHelp(question, { voice = false, seen = false, lineKey = '' } = {}) {
  const text = String(question || '')
    .replace(/\s+/g, ' ')
    .trim();
  const state = read(aiHelp);
  // Pas de domaine requis : questions-réponses coupées, on lui demande encore
  // des gestes — c'est le serveur qui écarte une question (409).
  if (!text || !state.meetingId) return { ok: false };
  const { meetingId } = state;
  const key = `q${(pendingSeq += 1)}`;
  aiHelp.update((s) => ({
    ...s,
    error: '',
    // « Questions-réponses coupées » valait pour la question d'avant.
    ...(s.notice === 'questions_off' ? { notice: '' } : {}),
    pending: [...s.pending, { key, question: text, voice }],
  }));
  const res = await api.askAiHelp({
    meetingId,
    question: text,
    voice,
    transcript: lines.join('\n').slice(-AI_HELP_ASK_TRANSCRIPT_MAX_CHARS),
    language: read(currentLanguageStore),
    // De quoi vérifier un geste sur la réunion : les templates qu'on peut lui
    // nommer, et si elle est en pause (« reprends » n'a de sens que là).
    templates: templates.map((template) => template.label),
    paused: read(isPausedStore) === true,
  });
  aiHelp.update((s) => ({ ...s, pending: s.pending.filter((p) => p.key !== key) }));
  if (read(aiHelp).meetingId !== meetingId) return { ok: false, error: 'stale' };
  if (!res.ok) {
    const error = errorOf(res);
    // Une question à voix haute, réponses coupées : la carte « en attente »
    // s'efface, la scène doit dire pourquoi — le pupitre, lui, montre l'erreur.
    const questionsOff = error === 'ai_help_domain_off' && !seen;
    patch({ error, ...(questionsOff ? { notice: 'questions_off' } : {}) });
    return { ok: false, error };
  }
  // La réponse a touché à l'ordre du jour (points dictés, états relus).
  patch({
    ...agendaFrom(res.data.agenda),
    ...(res.data.notice ? { notice: res.data.notice } : {}),
  });
  // Les rappels posés entrent dans la liste sans s'annoncer : ils sonneront.
  const reminders = Array.isArray(res.data.reminders) ? res.data.reminders : [];
  if (reminders.length) {
    aiHelp.update((s) => ({ ...s, items: [...s.items, ...reminders] }));
    scheduleReminders();
  }
  if (res.data.item) {
    addItems([seen ? { ...res.data.item, state: 'dismissed' } : res.data.item]);
    // Écrit sans repasser par `setAiHelpItemState`, qui éteindrait `fresh` :
    // dans le fil aussi, la réponse s'écrit mot à mot.
    if (seen) {
      api.saveAiHelpItemState({ meetingId, itemId: res.data.item.id, state: 'dismissed' });
    }
  }
  let acted = reminders.length > 0;
  // Le minuteur : lancé, rallongé, arrêté — `timer` n'est là que s'il a bougé.
  if (res.data.timer !== undefined) {
    acted = acted || !!res.data.timer || !!read(aiHelpTimer);
    applyTimer(res.data.timer);
  }
  for (const action of Array.isArray(res.data.actions) ? res.data.actions : []) {
    acted = runAction(action, meetingId, lineKey) || acted;
  }
  if (acted) acknowledge();
  return { ok: true };
}

const MEETING_MOVES = ['pause', 'resume', 'end'];
const command = (entry) => aiHelpCommands.update((waiting) => [...waiting, entry]);

/**
 * Un geste que le serveur a vérifié : le faire là où vit l'état.
 * @returns {boolean} faux : rien n'a été fait (geste inconnu, template perdu)
 */
function runAction(action, meetingId, lineKey = '') {
  if (action?.type === 'tag' && action.tagId) tagMeeting(meetingId, action.tagId);
  else if (action?.type === 'note' && action.text) {
    aiHelpNotes.update((waiting) => [...waiting, String(action.text)]);
  } else if (action?.type === 'close') closeAiHelpCards();
  else if (action?.type === 'size') resizeAiHelp(action.direction === 'down' ? -1 : 1);
  else if (action?.type === 'meeting' && MEETING_MOVES.includes(action.do)) {
    // « Termine », après « à la fin, le compte rendu avec le template… » :
    // c'est ce compte rendu qu'on rédige, pas une réunion rangée sans lui.
    command(
      action.do === 'end' && summaryOrder
        ? { type: 'summary', template: summaryOrder.template }
        : { type: 'meeting', do: action.do },
    );
  } else if (action?.type === 'summary') {
    const template = action.template ? templateIdOf(action.template) : '';
    // Un nom que l'écran ne connaît plus (templates rechargés depuis la
    // question) : rien ne part — on ne termine pas une réunion à l'aveugle.
    if (action.template && !template) return false;
    if (action.when === 'end') {
      summaryOrder = { template };
      command({ type: 'template', template });
    } else command({ type: 'summary', template });
  } else if (action?.type === 'replace' && action.find) {
    aiHelpEdits.update((waiting) => [
      ...waiting,
      {
        find: String(action.find),
        with: String(action.with ?? ''),
        all: action.all === true,
        skipKey: lineKey,
      },
    ]);
  } else return false;
  return true;
}

/** « Demander » : ouvre la conversation — ou, déjà ouverte, ferme tout. */
export function toggleAiHelpDesk() {
  if (read(aiHelpDeskOpen)) closeAiHelpCards();
  else aiHelpDeskOpen.set(true);
}

/**
 * Fermer la fenêtre de l'IA — sa croix, « Compris », « Demander » une seconde
 * fois, ou « Alfred, ferme » : TOUT ce qui est ouvert se range, la
 * conversation aussi, et la transcription retrouve sa place — le minuteur
 * arrivé à zéro compris, celui qui décompte encore non. Une seule
 * fermeture, quel que soit le nombre d'interventions en attente ; elles
 * restent dans le fil de la conversation.
 */
export function closeAiHelpCards() {
  aiHelpDeskOpen.set(false);
  stopSpeaking();
  takeAiHelpSpeech();
  const open = read(aiHelpOpenItems);
  open.forEach((item) => setAiHelpItemState(item.id, 'dismissed'));
  // Un minuteur qui vient de sonner se range avec le reste ; celui qui tourne
  // reste — fermer la fenêtre de l'IA n'est pas l'arrêter.
  if (read(aiHelpTimer)?.done) applyTimer(null);
  patch({ candidates: [], notice: '' });
  return { ok: true, closed: open.length };
}

// ── Lecture au fil de la réunion ────────────────────────────────────────────

function wantsWatch(state) {
  if (!state.meetingId || !state.available || !state.enabled) return false;
  return WATCHED_DOMAINS.some((key) => aiHelpDomainOn(state, key));
}

function scheduleWatch() {
  if (watchInFlight || freshCount < AI_HELP_WATCH_MIN_LINES || !wantsWatch(read(aiHelp))) return;
  clearTimeout(watchTimer);
  const wait = Math.max(AI_HELP_WATCH_DEBOUNCE_MS, nextWatchAt - Date.now());
  watchTimer = setTimeout(runWatch, wait);
}

async function runWatch() {
  const state = read(aiHelp);
  if (watchInFlight || !wantsWatch(state)) return;
  const upTo = lines.length;
  const fresh = lines.slice(watchedUpTo, upTo).join('\n');
  if (!fresh) return;
  const { meetingId } = state;
  watchInFlight = true;
  freshCount = 0;
  const res = await api.watchAiHelp({
    meetingId,
    before: lines.slice(0, watchedUpTo).join('\n').slice(-AI_HELP_BEFORE_MAX_CHARS),
    fresh: fresh.slice(-AI_HELP_FRESH_MAX_CHARS),
    language: read(currentLanguageStore),
  });
  watchInFlight = false;
  if (read(aiHelp).meetingId !== meetingId) return;

  if (res.ok) {
    nextWatchAt = Date.now() + AI_HELP_WATCH_MIN_INTERVAL_MS;
    watchedUpTo = upTo;
    const data = res.data;
    aiHelp.update((s) => ({
      ...s,
      ...agendaFrom(data.agenda),
      project: data.project || s.project,
      candidates: data.project ? [] : data.candidates?.length ? data.candidates : s.candidates,
      notice: data.notice || s.notice,
    }));
    addItems(data.items || []);
  } else {
    // Le passage n'est pas marqué lu : il repartira avec le suivant.
    freshCount = AI_HELP_WATCH_MIN_LINES;
    nextWatchAt = Date.now() + AI_HELP_WATCH_BACKOFF_MS;
    const error = errorOf(res);
    if (error === 'ai_help_not_allowed') patch({ available: false, enabled: false });
    // Éteinte côté serveur (autre onglet, session perdue) : on la rallume telle qu'ici.
    else if (error === 'ai_help_off') syncSession(prefsOf(read(aiHelp)));
  }
  scheduleWatch();
}

/**
 * Les demandes dictées : écoutées jusqu'au silence de celui qui parle
 * (utils/voiceRequest.js), puis faites ici — un geste tout de suite, sans le
 * modèle (« Alfred, ferme », « Alfred, agrandis »), le reste en question.
 */
const voiceRequests = createVoiceRequestCollector({
  getWakeWord: () => read(aiHelp).wakeWord,
  onCall: (entry) => aiHelpCalledLines.update((called) => new Set(called).add(entry.displayKey)),
  onRequest: ({ question, lineKey }) => {
    const size = sizeRequest(question);
    if (isDismissal(question)) {
      closeAiHelpCards();
      acknowledge();
    } else if (size) {
      resizeAiHelp(size === 'up' ? 1 : -1);
      acknowledge();
    } else askAiHelp(question, { voice: true, lineKey });
  },
});

/** Une phrase vient d'être finalisée : elle nourrit la prochaine lecture. */
function onLine() {
  const state = read(aiHelp);
  if (!state.meetingId || !state.available || !state.enabled) return;
  freshCount += 1;
  scheduleWatch();
}

/**
 * La transcription du direct, telle que l'écran l'affiche. Appelée à chaque
 * changement de la liste : seules les lignes finalisées et jamais vues comptent.
 * Les lignes déjà là au premier passage (réunion reprise, Aide IA montée en
 * cours de route) servent de contexte, sans rien déclencher.
 *
 * L'appelant doit donc la rappeler DÈS que la réunion existe, même sans ligne
 * nouvelle (AiHelpStage le fait en lui passant l'identifiant de la réunion) :
 * sinon ce « premier passage » tombe sur la première phrase, qui est perdue.
 *
 * Une ligne déjà lue dont le texte ou l'intervenant a CHANGÉ — corrigée à la
 * main, par l'IA, ou une voix qu'on vient de nommer — est relue en place : la
 * question suivante lit la transcription telle qu'elle est à l'écran, et une
 * correction déjà faite ne se retrouve pas « à faire ». Elle ne déclenche rien.
 * @param {Array<{itemId?: string, timestamp?: number, time?: string, text?: string,
 *   isDelta?: boolean, source?: string, speaker?: string}>} items
 * @param {string} [selfName] - le nom du compte, étiquette du micro
 */
export function observeAiHelpTranscript(items, selfName = '') {
  if (!read(aiHelp).meetingId) return;
  const fresh = [];
  // Les mêmes noms qu'à l'écran et que dans le compte rendu : le micro porte
  // le nom du compte, la visio celui qu'on lui a posé. Sans eux le modèle
  // lisait « Intervenant » partout, et ne savait pas qui avait décidé quoi.
  const labels = effectiveSpeakerLabels(items || [], selfName);
  // Ce que l'écoute des demandes lit : toutes les lignes, en cours comprises.
  const entries = [];
  const ranks = new Map();
  const list = items || [];
  const windowFrom = list.length - VOICE_WINDOW_LINES;
  for (const [index, item] of list.entries()) {
    if (!item) continue;
    // Deux lignes du même segment nées dans la même seconde : le rang les sépare.
    const displayKey = aiHelpLineKey(item);
    const rank = ranks.get(displayKey) || 0;
    ranks.set(displayKey, rank + 1);
    const key = rank ? `${displayKey}#${rank}` : displayKey;
    if (index >= windowFrom) {
      entries.push({
        key,
        displayKey,
        text: String(item.text || ''),
        source: item.source || 'local',
        isDelta: item.isDelta === true,
      });
    }
    if (item.isDelta) continue;
    const who = labels[index] || '';
    const known = lineOf.get(key);
    if (known) {
      // Comparaison sur le texte brut : inchangé, c'est la même chaîne qu'au
      // passage précédent — rien n'est recalculé pour les lignes qui dorment.
      if (known.raw !== item.text || known.who !== who) {
        const text = String(item.text || '').trim();
        if (text) lines[known.at] = who ? `${who} : ${text}` : text;
        known.raw = item.text;
        known.who = who;
      }
      continue;
    }
    if (seenLines.has(key)) continue;
    seenLines.add(key);
    const text = String(item.text || '').trim();
    if (!text) continue;
    // Sa propre voix, revenue par le micro (ou par le son de l'ordinateur) :
    // ni lue, ni relue (utils/speechEcho.js).
    if (isEchoOf(text, recentSpeech())) continue;
    lineOf.set(key, { at: lines.length, raw: item.text, who });
    lines.push(who ? `${who} : ${text}` : text);
    fresh.push({ key, text });
  }
  const state = read(aiHelp);
  // Le prénom s'écoute dès qu'elle est allumée, questions-réponses ou non :
  // « Alfred, ajoute le tag… » est un geste, pas une question.
  voiceRequests.observe(entries, { active: state.available && state.enabled });
  if (!primed) {
    primed = true;
    watchedUpTo = lines.length;
    return;
  }
  fresh.forEach(onLine);
}

// ── Cycle de vie : la réunion qui s'ouvre, celle qui se ferme ───────────────

liveMeetingIdStore.subscribe((meetingId) => {
  const state = read(aiHelp);
  if (meetingId === state.meetingId) return;
  forgetMeeting();
  aiHelpDeskOpen.set(false);
  // On QUITTE une réunion : son ordre du jour ne suit pas à la suivante. On en
  // ouvre une : le brouillon saisi sur l'accueil, lui, doit survivre.
  const leaving = !!state.meetingId;
  if (leaving) agendaDraft = false;
  patch({
    ...(leaving ? { agenda: '' } : {}),
    meetingId: meetingId || null,
    project: null,
    projectDeclined: false,
    candidates: [],
    agendaState: [],
    items: [],
    pending: [],
    speaking: false,
    notice: '',
    error: '',
  });
  // Les droits sont relus à chaque réunion qui s'ouvre, et non crus sur la
  // mémoire de l'écran d'accueil : il a pu ne jamais être monté, ou l'être
  // avant que l'administration ne donne le droit.
  if (meetingId) refreshAccess();
});

/**
 * Relit ce que le compte peut faire puis, si une réunion tourne, RELIT son
 * réglage au serveur — sans rien lui imposer : une réunion neuve y reçoit son
 * réglage de départ, une réunion en cours garde ce qu'on y a coupé. Seul un
 * ordre du jour saisi avant la réunion part avec cette relecture.
 */
async function refreshAccess() {
  await loadAiHelp();
  const state = read(aiHelp);
  if (state.meetingId && state.available) {
    await syncSession(agendaDraft ? { agenda: state.agenda } : {});
  }
}

// Un panneau se ferme — l'Administration, peut-être, où un droit vient d'être
// donné. Sans cette relecture, la carte de l'accueil et la pastille du dock
// n'apparaissaient qu'après un rechargement de la page : l'administrateur qui
// venait d'ouvrir l'Aide IA à son groupe ne la voyait pas (vu en recette le
// 2026-11-12). Même parti pris que les pastilles de configuration, relues à
// chaque ouverture et fermeture de panneau.
let panelWasOpen = false;
activePanel.subscribe((panel) => {
  if (panelWasOpen && panel === null) refreshAccess();
  panelWasOpen = panel !== null;
});

// Le tag de la réunion change : le projet se reconnaît peut-être maintenant.
historyItems.subscribe((items) => {
  const state = read(aiHelp);
  if (!state.meetingId) return;
  const tagId = (items || []).find((item) => meetingIdOf(item) === state.meetingId)?.tagId || null;
  if (tagId === lastTagId) return;
  const first = lastTagId === undefined;
  lastTagId = tagId;
  if (!first && state.enabled && !state.project && aiHelpDomainOn(state, 'project'))
    syncSession({});
});
