/**
 * Pile Realtime complète — les deux canaux (micro « local », audio système
 * « remote »), leurs superviseurs, le chien de garde « transcription muette »
 * et la télémétrie des coupures, assemblés en UN objet.
 *
 * Pourquoi ce module plutôt que du câblage dans App.svelte : App.svelte est
 * sous cliquet ESLint (max-lines) et l'assemblage de ces cinq briques est
 * précisément la logique à tester avec du temps et un WebSocket injectés —
 * impossible depuis un composant Svelte. App.svelte ne garde que ce qui touche
 * l'AudioContext (les ScriptProcessorNode) et l'état d'écran.
 *
 * Trois défauts que cet assemblage corrige, tous constatés sur l'incident du
 * 26/08/2026 (11 min 19 s sans une seule transcription, socket OPEN) :
 *   1. rien ne surveillait « temps écoulé depuis le dernier message reçu » —
 *      le health check du superviseur ne teste que `readyState` (watchdog.js) ;
 *   2. les messages `{type:'error'}` d'OpenAI tombaient dans le `default` de
 *      handleMessage : ni log, ni toast, ni reconnexion (errors.js) ;
 *   3. le canal audio système n'avait AUCUN superviseur — ni rotation
 *      préventive, ni health check — alors qu'OpenAI coupe une session
 *      Realtime au plus tard à 60 min.
 *
 * Règle d'or conservée : UN SEUL chemin de reconnexion, celui du superviseur
 * (single-flight, make-before-break). Le chien de garde et le traitement des
 * erreurs ne font qu'appeler `reconnect()` — l'en-tête de supervisor.js
 * documente un deadlock historique causé par un mécanisme concurrent.
 */
import { createRealtimeChannel } from './channel.js';
import { createRealtimeSupervisor } from './supervisor.js';
import { createSilenceWatchdog } from './watchdog.js';
import { classifyRealtimeError, realtimeErrorToastKey } from './errors.js';
import { createClientEventReporter, CLIENT_EVENT_TYPES } from './telemetry.js';

/**
 * Health check du canal système, plus lent que celui du micro (10 s). Ce flux
 * est best-effort et sa relance coûte un /tempkey : à 10 s, une IA
 * indisponible aurait fait trois appels par minute pour rien. 30 s suffit —
 * une coupure système ne fait perdre que l'étiquetage « visio » de quelques
 * phrases, jamais la transcription du micro.
 */
const SYSTEM_HEALTH_CHECK_MS = 30_000;

/**
 * @param {Object} deps
 * @param {string} deps.wsUrl - URL wss (…/realtime?intent=transcription)
 * @param {() => string} deps.getLang - langue courante
 * @param {() => string} deps.getModel - modèle de transcription courant
 * @param {(info: {secret: string, model: string, primary: boolean}) => void}
 *   deps.onTempKey - une clé éphémère vient d'arriver. `primary` distingue le
 *   canal micro du canal système : App.svelte ne retient comme `clientSecret`
 *   (réutilisé comme `sessionId` à la génération du résumé) que celle du micro.
 * @param {(lang: string) => Promise<{ok: boolean, status: number, data: object}>}
 *   deps.fetchTempKey - GET /tempkey (contrat apiClient)
 * @param {() => boolean} deps.isRecording
 * @param {() => boolean} deps.isPaused
 * @param {(message: object, source: 'local'|'remote') => void} deps.onMessage
 * @param {(state: string) => void} deps.onConnectionState - pastille UI
 * @param {(up: boolean) => string|undefined} [deps.onLiveStateChange] - capture
 *   hors ligne : le live vient de (re)venir / de tomber ; retourne l'id du gap
 *   ouvert le cas échéant
 * @param {(gapId: string) => void} [deps.onGapMarker]
 * @param {() => void} [deps.onSystemReady] - le canal système vient de
 *   (re)basculer : créer le ScriptProcessorNode s'il n'existe pas encore
 * @param {(key: string, level: string, ms: number) => void} deps.showToast
 * @param {() => string} [deps.getMeetingId] - pour la télémétrie
 * @param {number} deps.rotationMs - RECONNECT_INTERVAL_MS
 * @param {number} deps.staleMs - REALTIME_SILENT_STREAM_MS
 * @param {number} deps.silenceCheckMs - REALTIME_SILENCE_CHECK_MS
 * @param {object} [deps.reporter] - télémétrie injectable (tests)
 * @param {() => number} [deps.now]
 * @param {typeof WebSocket} [deps.WebSocketImpl]
 */
export function createRealtimeStack({
  wsUrl,
  getLang = () => 'fr',
  getModel = () => '',
  onTempKey = () => {},
  fetchTempKey,
  isRecording = () => false,
  isPaused = () => false,
  onMessage = () => {},
  onConnectionState = () => {},
  onLiveStateChange = () => undefined,
  onGapMarker = () => {},
  onSystemReady = () => {},
  showToast = () => {},
  getMeetingId = () => '',
  rotationMs,
  staleMs,
  silenceCheckMs,
  reporter,
  now = Date.now,
  WebSocketImpl,
} = {}) {
  const telemetry = reporter || createClientEventReporter({ getMeetingId, now });
  // Instant de la dernière coupure NON planifiée, pour mesurer sa durée à la
  // reprise : c'est la métrique qui manquait le plus au diagnostic.
  let droppedAt = null;
  // Le flux système a-t-il déjà été rattaché ? Tant que non, son superviseur
  // reste inerte : sans ce garde, son health check verrait un socket « mort »
  // (jamais ouvert) et demanderait un /tempkey toutes les 30 s sur toutes les
  // réunions sans audio système — c'est-à-dire la majorité.
  let systemAttached = false;

  const channelOpts = { wsUrl, getModel, ...(WebSocketImpl ? { WebSocketImpl } : {}) };

  const micChannel = createRealtimeChannel({
    ...channelOpts,
    onMessage: (m) => {
      // AVANT tout traitement : n'importe quel message prouve que le canal
      // répond (`session.updated`, `speech_started`, un delta…). C'est le seul
      // signal qui aurait attrapé le socket zombie.
      micWatchdog.noteMessage();
      onMessage(m, 'local');
    },
    onSwitched: () => {
      micSupervisor.noteConnected();
      // Socket neuf : le compte du chien de garde repart de zéro, sinon le
      // retard accumulé par l'ancien socket déclencherait aussitôt.
      micWatchdog.reset();
      onConnectionState('connected');
      onLiveStateChange(true);
    },
    onUnexpectedClose: () => {
      onConnectionState('disconnected');
      const offlineGapId = onLiveStateChange(false);
      if (offlineGapId) onGapMarker(offlineGapId);
      micSupervisor.reconnect(false);
    },
  });

  const sysChannel = createRealtimeChannel({
    ...channelOpts,
    onMessage: (m) => onMessage(m, 'remote'),
    onSwitched: () => {
      sysSupervisor.noteConnected();
      onSystemReady();
    },
    onUnexpectedClose: () => {
      // Best-effort, couplage historique conservé : pas de relance pendant une
      // reconnexion micro en vol (deux /tempkey simultanés sur une IA qui
      // rame retarderaient le flux qui compte vraiment).
      if (isRecording() && !micSupervisor.isReconnecting()) sysSupervisor.reconnect(false);
    },
  });

  /**
   * Clé éphémère + rotation d'un canal. Le modèle est relu à chaque fois :
   * /tempkey vient de créer le jeton avec lui et le `session.update` doit
   * reprendre le même (cf. channel.js).
   */
  async function connectChannel(channel, primary) {
    const res = await fetchTempKey(getLang());
    // Session OIDC morte/expirée : ne JAMAIS forceReauth ici — on est en plein
    // enregistrement (reload = réunion perdue). Le throw part vers le retry
    // silencieux du superviseur ; la session peut se rétablir côté serveur.
    if (res?.data?.error === 'auth_redirect') {
      throw new Error('tempkey: redirection auth (session OIDC) pendant la rotation');
    }
    if (!res?.ok) throw new Error(`Response status: ${res?.status}`);
    const secret = res.data.value;
    onTempKey({ secret, model: res.data.transcriptionModel || getModel(), primary });
    await channel.rotate({ secret, lang: getLang() || 'fr' });
  }

  /**
   * Connexion du flux système : ne rejette JAMAIS. Le superviseur du micro
   * doit pouvoir compter sur ses propres échecs ; celui du système, non — un
   * throw ici le mettrait en backoff 5 s et ferait marteler /tempkey pour un
   * flux dont l'absence ne coûte que l'étiquetage « visio ». Les nouvelles
   * tentatives viennent donc du health check (30 s) et du tick de rotation.
   */
  async function connectSystemQuietly() {
    try {
      await connectChannel(sysChannel, false);
    } catch (e) {
      console.warn('Transcription audio système indisponible (best-effort):', e?.message || e);
    }
  }

  const micSupervisor = createRealtimeSupervisor({
    connect: () => connectChannel(micChannel, true),
    isActive: isRecording,
    isPausedNow: isPaused,
    isSocketAlive: () => micChannel.isOpen(),
    isSocketDead: () => micChannel.isDeadOrDying(),
    onState: onConnectionState,
    onUnplannedDrop: () => {
      droppedAt = now();
      showToast('statuses.connectionLost', 'warning', 3000);
      telemetry.report(CLIENT_EVENT_TYPES.DROP, { channel: 'mic' });
    },
    onRestored: () => {
      showToast('statuses.connectionRestored', 'success', 3000);
      telemetry.report(CLIENT_EVENT_TYPES.RESTORED, {
        channel: 'mic',
        durationMs: droppedAt ? now() - droppedAt : undefined,
      });
      droppedAt = null;
    },
    rotationMs,
    now,
  });

  const sysSupervisor = createRealtimeSupervisor({
    connect: connectSystemQuietly,
    // Inerte tant qu'aucun audio système n'a été rattaché (cf. systemAttached).
    isActive: () => isRecording() && systemAttached,
    isPausedNow: isPaused,
    isSocketAlive: () => sysChannel.isOpen(),
    isSocketDead: () => sysChannel.isDeadOrDying(),
    // Aucun toast pour ce canal : l'utilisateur ne doit pas être alerté deux
    // fois pour une même réunion, et le micro est le flux qui compte.
    rotationMs,
    healthCheckMs: SYSTEM_HEALTH_CHECK_MS,
    now,
  });

  const micWatchdog = createSilenceWatchdog({
    staleMs,
    checkMs: silenceCheckMs,
    // Surveillance pertinente seulement si le socket est OUVERT : un socket
    // fermé (ou jamais ouvert — démarrage hors ligne) relève du health check
    // et de onUnexpectedClose, qui ont déjà leur propre chemin.
    isEligible: () => isRecording() && !isPaused() && micChannel.isOpen(),
    now,
    onStale: ({ silentMs, attempt }) => {
      console.warn(
        `⏱️ Transcription muette depuis ${Math.round(silentMs / 1000)} s (socket ouvert) — reconnexion forcée (tentative ${attempt})`,
      );
      telemetry.report(CLIENT_EVENT_TYPES.WATCHDOG, {
        channel: 'mic',
        durationMs: silentMs,
        attempt,
      });
      showToast('statuses.transcriptionInterrupted', 'warning', 4000);
      // L'utilisateur vient d'être informé : pas de second « Connexion perdue »
      // par-dessus, mais « rétablie » partira bien au premier succès.
      micSupervisor.noteDropNotified();
      droppedAt = now();
      micSupervisor.reconnect(false);
    },
  });

  return {
    /**
     * Première connexion du micro avec une clé déjà obtenue par l'écran de
     * démarrage (il inspecte le corps de /tempkey pour distinguer « crédit IA
     * épuisé »). Rejette comme channel.rotate.
     */
    rotateMic(secret) {
      return micChannel.rotate({ secret, lang: getLang() || 'fr' });
    },

    isReconnecting: () => micSupervisor.isReconnecting(),
    reconnectMic: (planned = false) => micSupervisor.reconnect(planned),
    noteDropNotified: () => micSupervisor.noteDropNotified(),

    /**
     * Traite un message `{type:'error'}` de l'API Realtime. Jamais avalé :
     * log technique (type/code uniquement — jamais `error.message`, qui peut
     * citer un fragment de contenu de réunion), télémétrie, toast si
     * l'utilisateur doit savoir, reconnexion si la session est morte.
     * @param {object} message
     * @param {'local'|'remote'} source
     */
    reportError(message, source = 'local') {
      const info = classifyRealtimeError(message);
      const channel = source === 'remote' ? 'system' : 'mic';
      const label = `[realtime:${channel}] erreur OpenAI ${info.code}${info.eventId ? ` (${info.eventId})` : ''}`;
      if (info.fatal) console.error(label);
      else console.warn(label);
      telemetry.report(CLIENT_EVENT_TYPES.ERROR, { channel, code: info.code });

      if (source === 'remote') {
        // Flux best-effort : aucun toast (l'utilisateur ne doit pas être
        // alerté deux fois), mais la session morte se rattrape quand même.
        if (info.sessionInvalid) sysSupervisor.reconnect(false);
        return;
      }
      if (info.fatal) showToast(realtimeErrorToastKey(info), 'warning', 6000);
      if (info.sessionInvalid) {
        micSupervisor.noteDropNotified();
        droppedAt = now();
        micSupervisor.reconnect(false);
      }
    },

    /**
     * Frame micro : envoi + alimentation du chien de garde. `level` est le RMS
     * déjà calculé par le processor (aucun recalcul : ce chemin tourne une
     * douzaine de fois par seconde).
     */
    sendMicAudio(float32, sourceRate, level) {
      micChannel.sendAudioFrame(float32, sourceRate);
      micWatchdog.noteAudioSent(level);
    },

    sendSystemAudio(float32, sourceRate) {
      sysChannel.sendAudioFrame(float32, sourceRate);
    },

    /**
     * Rattache le flux audio système : connecte le canal puis met SON
     * superviseur en marche (rotation préventive + health check propres).
     * Best-effort de bout en bout — ne rejette pas.
     */
    async attachSystem() {
      systemAttached = true;
      await connectSystemQuietly();
      sysSupervisor.start();
    },

    /** Reprise après pause : le compte du chien de garde repart de zéro. */
    noteResumed() {
      micWatchdog.reset();
    },

    /**
     * Démarre superviseur micro + chien de garde. `onPeriodicCheck` reste le
     * hook du plafond 8 h (cf. supervisor.js) : App.svelte seule connaît la
     * durée cumulée.
     */
    start({ onPeriodicCheck } = {}) {
      micSupervisor.start({
        ...(onPeriodicCheck ? { onPeriodicCheck } : {}),
        // Plus d'entraînement du flux système par la rotation micro : il a
        // désormais son propre superviseur, et double-tourner ne ferait que
        // consommer des clés éphémères.
      });
      micWatchdog.start();
      if (systemAttached) sysSupervisor.start();
    },

    /** Arrêt complet (stopRecording) : plus aucun réveil, aucun état résiduel. */
    stop() {
      micWatchdog.stop();
      micSupervisor.stop();
      sysSupervisor.stop();
      systemAttached = false;
      droppedAt = null;
    },

    /** Ferme les deux sockets sans émettre onUnexpectedClose. */
    close() {
      micChannel.close();
      sysChannel.close();
    },
  };
}
