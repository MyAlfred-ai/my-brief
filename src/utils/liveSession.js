/**
 * Témoin « une réunion enregistre » — ce qui permet de la REPRENDRE après une
 * fermeture que personne n'a vue venir.
 *
 * ── Pourquoi un battement, et pas `beforeunload` ───────────────────────────
 * Le témoin n'était écrit qu'à `beforeunload`. Sur téléphone, cet événement ne
 * part presque jamais : iOS et Android tuent une PWA en arrière-plan (mémoire,
 * balayage dans le sélecteur d'apps, appel qui dure) sans prévenir la page. La
 * réunion rouvrait alors comme « arrêtée » : pas de fenêtre « Réunion
 * interrompue », et un chronomètre reparti de sa dernière pause — donc des
 * horodatages faux pour tout ce qui suivait.
 *
 * Le témoin est maintenant réécrit toutes les `LIVE_SESSION_BEAT_MS` pendant
 * l'enregistrement, et à chaque passage en arrière-plan. Tuée sans préavis,
 * l'application retrouve au pire un état vieux d'un battement.
 *
 * ── Ce qu'il porte ─────────────────────────────────────────────────────────
 * `meetingId` est celui de la réunion qui ENREGISTRE (liveMeetingIdStore), pas
 * de celle qui est affichée : c'est lui qui fait reprendre la réunion dans SON
 * document au lieu d'en ouvrir un second (cf. stores/liveMeeting.js).
 * `savedAt` date le dernier battement : la reprise sait combien de temps a
 * manqué, et le dit dans la transcription.
 *
 * Le chronomètre garde sa clé historique (`mybrief_cumulative_recording_time`),
 * relue par App au démarrage d'un enregistrement.
 */
import { LIVE_SESSION_BEAT_MS } from '../config/constants.js';

const ACTIVE_KEY = 'mybrief_session_active';
const ELAPSED_KEY = 'mybrief_cumulative_recording_time';

const safeStorage = () => (typeof localStorage !== 'undefined' ? localStorage : null);

/**
 * @param {{state: 'recording'|'paused', elapsedS: number, meetingId?: string|null}} live
 * @param {{storage?: Storage|null, now?: () => number}} [env]
 */
export function writeLiveSession(
  { state, elapsedS, meetingId = null },
  { storage = safeStorage(), now = Date.now } = {},
) {
  if (!storage) return;
  const seconds = Math.max(0, Math.floor(Number(elapsedS) || 0));
  try {
    storage.setItem(
      ACTIVE_KEY,
      JSON.stringify({ state, elapsedS: seconds, meetingId: meetingId || null, savedAt: now() }),
    );
    storage.setItem(ELAPSED_KEY, String(seconds));
  } catch (e) {
    // Stockage plein ou refusé : la reprise sera moins précise, l'enregistrement continue.
  }
}

/**
 * Témoin laissé par une réunion qui n'a pas été arrêtée. Lit aussi l'ancien
 * format — la chaîne `recording` / `paused` écrite par `beforeunload`, sans
 * identifiant ni date : un onglet resté sur l'ancienne version a pu l'écrire.
 *
 * @param {{storage?: Storage|null}} [env]
 * @returns {{state: 'recording'|'paused', elapsedS: number, meetingId: string|null,
 *   savedAt: number|null}|null}
 */
export function readLiveSession({ storage = safeStorage() } = {}) {
  if (!storage) return null;
  let raw;
  let elapsed;
  try {
    raw = storage.getItem(ACTIVE_KEY);
    elapsed = parseInt(storage.getItem(ELAPSED_KEY) || '0', 10) || 0;
  } catch (e) {
    return null;
  }
  if (!raw) return null;
  if (raw === 'recording' || raw === 'paused') {
    return { state: raw, elapsedS: elapsed, meetingId: null, savedAt: null };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      state: parsed.state === 'paused' ? 'paused' : 'recording',
      elapsedS: Number.isFinite(parsed.elapsedS) ? parsed.elapsedS : elapsed,
      meetingId: typeof parsed.meetingId === 'string' && parsed.meetingId ? parsed.meetingId : null,
      savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : null,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Chronomètre gardé de la dernière réunion enregistrée ici, en secondes : il
 * survit à l'arrêt et au rechargement, jusqu'à « Nouvelle réunion ».
 * @param {{storage?: Storage|null}} [env]
 */
export function readRecordingClock({ storage = safeStorage() } = {}) {
  try {
    return Math.max(0, parseInt(storage?.getItem(ELAPSED_KEY) || '0', 10) || 0);
  } catch (e) {
    return 0;
  }
}

/**
 * Pose le chronomètre d'où repartira le prochain enregistrement — relu par
 * App au démarrage. Sert à reprendre une réunion TERMINÉE (utils/meetingResume.js) :
 * sans lui, la reprise d'une réunion rouverte depuis l'historique repartait du
 * chronomètre de la DERNIÈRE réunion enregistrée sur ce poste. Le témoin, lui,
 * n'est pas écrit : rien n'enregistre encore, et un micro refusé laisserait
 * une fausse « Réunion interrompue » au prochain lancement.
 * @param {number} seconds
 * @param {{storage?: Storage|null}} [env]
 */
export function seedRecordingClock(seconds, { storage = safeStorage() } = {}) {
  try {
    storage?.setItem(ELAPSED_KEY, String(Math.max(0, Math.floor(Number(seconds) || 0))));
  } catch (e) {
    // Stockage refusé : le chronomètre en mémoire fait foi jusqu'au rechargement.
  }
}

/** La réunion est arrêtée (ou reprise ailleurs) : plus rien à proposer au prochain lancement. */
export function clearLiveSession({ storage = safeStorage() } = {}) {
  try {
    storage?.removeItem(ACTIVE_KEY);
  } catch (e) {
    // rien à retirer
  }
}

/**
 * Une ligne « en cours » (isDelta) restaurée n'est plus en cours de rien : le
 * flux qui l'écrivait est mort avec la page. Laissée telle quelle, elle reste
 * en italique en bas de l'écran et manque au texte complet — donc au compte
 * rendu si la réunion n'est pas reprise. Elle est bouclée ici ; une ligne vide
 * est retirée.
 *
 * Un marqueur « passage hors ligne » restauré promet une transcription qui ne
 * viendra plus : l'audio de la coupure est parti avec la page (mémoire sur le
 * web, file d'envoi dans l'app native). Il prend le texte `lostGapText`, et
 * un identifiant qu'aucune capture future ne résoudra — la suivante renumérote
 * ses coupures, et aurait écrit son texte à la place de ce marqueur-ci.
 *
 * @param {Array<{isDelta?: boolean, text?: string, offlineGapId?: string}>} history
 * @param {string} [lostGapText] - texte des marqueurs devenus sans suite
 * @returns {{history: Array, added: string[]}} `added` : textes bouclés ici, à
 *   ajouter au texte complet (qui ne porte que les lignes finales)
 */
export function settleRestoredHistory(history, lostGapText = '') {
  if (!Array.isArray(history)) return { history: [], added: [] };
  const pendingGap = (line) => /^gap-/.test(line?.offlineGapId || '');
  if (!history.some((line) => line?.isDelta || pendingGap(line))) return { history, added: [] };
  const settled = [];
  const added = [];
  for (const line of history) {
    if (pendingGap(line)) {
      settled.push({
        ...line,
        offlineGapId: `lost-${line.offlineGapId}`,
        ...(lostGapText ? { text: lostGapText } : {}),
      });
      continue;
    }
    if (!line?.isDelta) {
      settled.push(line);
      continue;
    }
    const text = (line.text || '').trim();
    if (!text) continue;
    // `lastDeltaAt` ne décrit que le direct (cf. utils/transcriptLive.js).
    const { lastDeltaAt, ...rest } = line;
    settled.push({ ...rest, text, isDelta: false });
    added.push(text);
  }
  return { history: settled, added };
}

/**
 * Battement du témoin pendant l'enregistrement.
 *
 * @param {object} deps
 * @param {() => ({state: 'recording'|'paused', elapsedS: number, meetingId?: string|null}|null)} deps.read
 *   état courant, relu à chaque battement ; `null` = rien n'enregistre
 * @param {number} [deps.intervalMs]
 * @param {Storage|null} [deps.storage]
 * @param {() => number} [deps.now]
 */
export function createLiveSessionKeeper({
  read,
  intervalMs = LIVE_SESSION_BEAT_MS,
  storage = safeStorage(),
  now = Date.now,
}) {
  let timer = null;

  function beat() {
    const live = read();
    if (live) writeLiveSession(live, { storage, now });
  }

  return {
    /** Écrit tout de suite — pause, reprise, passage en arrière-plan. */
    beat,
    start() {
      clearInterval(timer);
      beat();
      timer = setInterval(beat, intervalMs);
    },
    /** Arrêt voulu de l'enregistrement : le témoin tombe avec lui. */
    stop() {
      clearInterval(timer);
      timer = null;
      clearLiveSession({ storage });
    },
  };
}
