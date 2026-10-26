/**
 * Superviseur du canal Realtime micro — LA machine à états de reconnexion.
 *
 * Remplace trois mécanismes non coordonnés d'App.svelte qui se partageaient
 * deux booléens (`isReconnecting`, `isRecording`) :
 *   - le retry aveugle setTimeout 5 s de reconnectPeerConnection ;
 *   - la rotation préventive (setInterval 60 s comparant lastConnectionTime,
 *     session OpenAI plafonnée à 60 min → rotation à RECONNECT_INTERVAL_MS) ;
 *   - le health check WebSocket (setInterval 10 s) qui pouvait déclencher une
 *     reconnexion CONCURRENTE de la précédente — l'historique du repo contient
 *     un deadlock où `isReconnecting` restait vrai pour toujours et plus
 *     aucune rotation ne partait.
 *
 * Ici : UNE seule reconnexion en vol (single-flight strict), un seul
 * échéancier, et stop() remet tout à zéro quoi qu'il arrive.
 *
 * États : idle → connecting → open → (rotating | backing-off) → …
 *   - `rotating`    : rotation planifiée, l'ancien socket tient (silencieux) ;
 *   - `backing-off` : échec de connexion, retry programmé (5 s, comportement
 *     historique conservé pour l'extraction — le backoff exponentiel est un
 *     changement séparé et identifiable).
 *
 * Le superviseur ne touche NI au WebSocket ni à l'UI : il orchestre des
 * callbacks (connect = tempkey + channel.rotate ; onUnplannedDrop /
 * onRestored = toasts ; onState = pastille de connexion).
 */

/**
 * @param {Object} opts
 * @param {(info: {planned: boolean}) => Promise<void>} opts.connect - obtient
 *   une clé éphémère et fait tourner le canal (channel.rotate). Throw = échec.
 * @param {() => boolean} opts.isActive - l'enregistrement tourne encore
 *   (toute activité s'arrête quand c'est faux)
 * @param {() => boolean} opts.isPausedNow - enregistrement en pause (la
 *   rotation préventive ne tourne pas pendant une pause — comportement
 *   historique de checkDuration)
 * @param {() => boolean} opts.isSocketAlive - le socket courant est encore
 *   utilisable (échec de rotation ≠ perte : l'ancien tient)
 * @param {() => boolean} opts.isSocketDead - health check : socket fermé/mourant
 * @param {(state: string) => void} [opts.onState] - 'connecting' | 'connected'
 *   | 'reconnecting' | 'disconnected' (vocabulaire de la pastille UI existante)
 * @param {() => void} [opts.onUnplannedDrop] - perte réelle détectée (toast
 *   « Connexion perdue » — une seule fois jusqu'au rétablissement)
 * @param {() => void} [opts.onRestored] - reconnexion réussie après une perte
 *   réelle (toast « rétablie »)
 * @param {number} [opts.rotationMs] - âge du socket déclenchant la rotation
 * @param {number} [opts.rotationCheckMs] - cadence de vérification
 * @param {number} [opts.healthCheckMs] - cadence du health check socket
 * @param {number} [opts.retryDelayMs] - délai avant retry après échec
 * @param {() => number} [opts.now]
 */
export function createRealtimeSupervisor({
  connect,
  isActive,
  isPausedNow = () => false,
  isSocketAlive,
  isSocketDead,
  onState = () => {},
  onUnplannedDrop = () => {},
  onRestored = () => {},
  rotationMs,
  rotationCheckMs = 60_000,
  healthCheckMs = 10_000,
  retryDelayMs = 5_000,
  now = Date.now,
} = {}) {
  let state = 'idle';
  let reconnectInFlight = false;
  let dropNotified = false; // toast « perdue » déjà montré, « rétablie » dû
  let connectedAt = null;
  let rotationTimer = null;
  let healthTimer = null;
  let retryTimer = null;

  function setState(next) {
    state = next;
  }

  /**
   * (Re)connexion single-flight.
   * @param {boolean} planned - true = rotation préventive (ancien socket
   *   vivant, aucun toast) ; false = perte réelle (toasts perdue/rétablie).
   */
  async function reconnect(planned = false) {
    if (reconnectInFlight || !isActive()) return;
    reconnectInFlight = true;
    setState(planned ? 'rotating' : 'backing-off');
    onState('reconnecting');
    if (!planned && !dropNotified) {
      dropNotified = true;
      onUnplannedDrop();
    }

    try {
      await connect({ planned });
      setState('open');
      onState('connected');
      if (dropNotified) {
        dropNotified = false;
        onRestored();
      }
      reconnectInFlight = false;
    } catch (err) {
      // Rotation ratée mais ancien socket encore en service = toujours
      // « connecté » pour l'UI ; sinon « déconnecté ».
      const stillAlive = isSocketAlive();
      setState('backing-off');
      onState(stillAlive ? 'connected' : 'disconnected');
      reconnectInFlight = false;
      // Retry silencieux : tant que l'ancien socket tient on reste en mode
      // planifié (pas de toast) ; s'il tombe entre-temps, onUnexpectedClose
      // relancera en mode non-planifié.
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (isActive() && !reconnectInFlight) {
          reconnect(planned && stillAlive);
        }
      }, retryDelayMs);
    }
  }

  return {
    /** État interne (tests, debug). */
    get state() {
      return state;
    },
    isReconnecting: () => reconnectInFlight,

    /** À appeler quand le canal a basculé sur un nouveau socket (onSwitched). */
    noteConnected() {
      connectedAt = now();
      if (!reconnectInFlight) setState('open');
    },

    /**
     * L'appelant a DÉJÀ signalé la coupure à l'utilisateur (ex. démarrage
     * hors ligne : toast dédié) : pas de second « Connexion perdue », mais
     * « rétablie » partira bien au premier succès.
     */
    noteDropNotified() {
      dropNotified = true;
    },

    /**
     * Démarre les deux échéanciers. Hooks fournis ici et non au constructeur :
     *   - onPeriodicCheck : tourne à chaque tick de rotation AVANT la décision
     *     de rotation ; retourner false court-circuite le tick (comportement
     *     historique : le plafond 8 h d'enregistrement arrête tout ici) ;
     *   - onRotationDue : la rotation vient de partir — l'appelant entraîne
     *     aussi le flux système (best-effort).
     * @param {{onPeriodicCheck?: () => boolean|void, onRotationDue?: () => void}} [hooks]
     */
    start({ onPeriodicCheck = () => true, onRotationDue = () => {} } = {}) {
      this.stopTimers();
      rotationTimer = setInterval(() => {
        if (!isActive() || isPausedNow()) return;
        if (onPeriodicCheck() === false) return;
        if (connectedAt && now() - connectedAt >= rotationMs) {
          reconnect(true);
          onRotationDue();
        }
      }, rotationCheckMs);
      healthTimer = setInterval(() => {
        if (!isActive()) return;
        if (!reconnectInFlight && isSocketDead()) {
          reconnect(false);
        }
      }, healthCheckMs);
    },

    reconnect,

    /** Coupe échéanciers + retry en attente (sans toucher à l'état courant). */
    stopTimers() {
      clearInterval(rotationTimer);
      clearInterval(healthTimer);
      clearTimeout(retryTimer);
      rotationTimer = healthTimer = retryTimer = null;
    },

    /** Arrêt complet (stopRecording) : tout est nettoyé, plus aucun réveil. */
    stop() {
      this.stopTimers();
      reconnectInFlight = false;
      dropNotified = false;
      connectedAt = null;
      setState('idle');
    },
  };
}
