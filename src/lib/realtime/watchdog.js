/**
 * Chien de garde « transcription muette » — le SEUL signal capable d'attraper
 * un socket zombie.
 *
 * Pourquoi il existe : le health check du superviseur interroge
 * `isSocketDead()`, qui ne teste que `readyState === CLOSED || CLOSING`
 * (channel.js). Un socket resté OUVERT mais qui ne renvoie plus rien passe
 * indéfiniment entre les mailles. C'est exactement ce qui s'est produit le
 * 26/08/2026 : 11 min 19 s sans une seule transcription, socket OPEN,
 * application vivante (les `/api/ping` ont continué), aucune tentative de
 * reconnexion — puis reprise spontanée. Rien dans le code ne pouvait le voir.
 *
 * Ce module ne reconnecte PAS lui-même : il appelle `onStale`, à qui l'appelant
 * fait déclencher `supervisor.reconnect(false)`. C'est délibéré — le
 * superviseur est single-flight et make-before-break, et l'en-tête de
 * supervisor.js documente un deadlock historique causé par un second
 * mécanisme de reconnexion concurrent.
 *
 * Deux pièges évités :
 *   1. une réunion réellement SILENCIEUSE ne doit pas reconnecter en boucle —
 *      d'où la condition « de l'audio non silencieux part effectivement » ;
 *   2. le premier mot après une longue pause de parole ne doit pas déclencher
 *      instantanément (le canal n'a pas encore eu le temps de répondre) —
 *      d'où la référence temporelle `max(dernier message, début de l'audio)` :
 *      on exige `staleMs` d'audio SANS réponse, pas `staleMs` de silence pur.
 */

/**
 * @param {Object} opts
 * @param {(info: {silentMs: number, unansweredMs: number, attempt: number}) => void} opts.onStale
 *   le canal ne répond plus alors que de l'audio part — déclencher la
 *   reconnexion via le superviseur.
 * @param {() => boolean} [opts.isEligible] - surveillance pertinente
 *   maintenant (enregistrement en cours ET pas en pause). Quand c'est faux, le
 *   compteur glisse : la pause n'accumule aucun retard.
 * @param {number} opts.staleMs - seuil de silence toléré (cf.
 *   REALTIME_SILENT_STREAM_MS)
 * @param {number} [opts.checkMs] - cadence de vérification
 * @param {number} [opts.maxBackoffFactor] - plafond du multiplicateur de
 *   backoff. Si la reconnexion ne ramène pas de transcription, les tentatives
 *   s'espacent (1×, 2×, 4×… du seuil) au lieu de partir en rafale ; le
 *   plafond évite d'abandonner tout à fait.
 * @param {number} [opts.silentLevel] - RMS en dessous duquel une frame est
 *   considérée silencieuse
 * @param {() => number} [opts.now]
 */
export function createSilenceWatchdog({
  onStale = () => {},
  isEligible = () => true,
  staleMs,
  checkMs = 5_000,
  maxBackoffFactor = 8,
  silentLevel = 0.01,
  now = Date.now,
} = {}) {
  let lastMessageAt = null; // dernier message reçu, quel qu'en soit le type
  let audioStartedAt = null; // 1re frame non silencieuse DEPUIS ce message
  let attempts = 0; // déclenchements consécutifs sans réponse (backoff)
  let timer = null;

  /** Seuil courant : s'élargit à chaque déclenchement resté sans réponse. */
  function threshold() {
    return staleMs * Math.min(2 ** attempts, maxBackoffFactor);
  }

  /** Repart d'une base propre sans prétendre que le canal a parlé. */
  function rearm() {
    lastMessageAt = now();
    audioStartedAt = null;
  }

  function tick() {
    // Pause / arrêt : le compteur glisse, aucun retard ne s'accumule.
    if (!isEligible()) {
      rearm();
      return;
    }
    if (lastMessageAt === null) {
      rearm();
      return;
    }
    // Aucun audio non silencieux depuis le dernier message : réunion muette,
    // le silence d'OpenAI est NORMAL. On ne réarme pas — dès qu'une parole
    // repart, le compte reprend depuis ce moment-là.
    if (audioStartedAt === null) return;

    const silentMs = now() - lastMessageAt;
    // Le compte utile part du plus TARDIF des deux : il faut `staleMs` d'audio
    // resté sans réponse, sinon le premier mot après un long blanc
    // déclencherait avant même qu'OpenAI ait pu répondre.
    const unansweredMs = now() - Math.max(lastMessageAt, audioStartedAt);
    if (unansweredMs < threshold()) return;

    attempts += 1;
    // Réarmement AVANT l'appel : le prochain déclenchement attendra un
    // nouveau seuil complet, donc une seule reconnexion par épisode.
    rearm();
    onStale({ silentMs, unansweredMs, attempt: attempts });
  }

  return {
    /** Déclenchements consécutifs restés sans réponse (tests, télémétrie). */
    get attempts() {
      return attempts;
    },
    /** De l'audio non silencieux part-il depuis le dernier message ? (tests) */
    get sawAudio() {
      return audioStartedAt !== null;
    },

    /**
     * Un message est arrivé d'OpenAI — n'importe lequel. Le canal répond :
     * compteur à zéro ET backoff annulé.
     */
    noteMessage() {
      lastMessageAt = now();
      audioStartedAt = null;
      attempts = 0;
    },

    /**
     * Nouveau socket (onSwitched) ou reprise après pause : le compteur repart
     * de zéro, mais le backoff est conservé — un socket tout neuf qui reste
     * muet ne doit pas relancer un cycle de rafales.
     */
    reset() {
      rearm();
    },

    /**
     * Une frame audio vient de partir sur le canal. `level` est le RMS déjà
     * calculé par le processor audio (aucun calcul supplémentaire ici : ce
     * chemin tourne ~12 fois par seconde).
     * @param {number} level - RMS 0..1 de la frame envoyée
     */
    noteAudioSent(level) {
      if (audioStartedAt === null && level > silentLevel) audioStartedAt = now();
    },

    start() {
      this.stop();
      rearm();
      attempts = 0;
      timer = setInterval(tick, checkMs);
    },

    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
