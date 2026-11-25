/**
 * Garde de capture — tient l'enregistrement debout quand le téléphone le
 * malmène : changement d'application, écran verrouillé, appel téléphonique.
 *
 * ── Ce qu'il remplace ──────────────────────────────────────────────────────
 * App.svelte portait un écouteur de visibilité, un contrôle toutes les 10 s et
 * trois écouteurs de piste, avec quatre trous constatés à la relecture :
 *   1. un micro redemandé n'était rebranché QUE sur l'enregistrement audio —
 *      plus sur le processor qui alimente la transcription. La réunion
 *      continuait « en cours », muette, jusqu'à l'arrêt ;
 *   2. une piste restée MUETTE (`muted`) n'était jamais reprise : elle est
 *      encore `live`, le contrôle ne regardait que `readyState` ;
 *   3. le contexte audio n'était relancé que `suspended`. iOS le met
 *      `interrupted` pendant un appel — un état que ce test ignorait ;
 *   4. chaque contrôle en échec repoussait deux toasts, dont un persistant :
 *      un appel de cinq minutes en empilait soixante.
 *
 * ── Le signal ──────────────────────────────────────────────────────────────
 * Une capture saine, c'est : des TRAMES qui arrivent (`noteFrame`, appelé par
 * le processor du micro, ~12 fois par seconde), un contexte `running`, une
 * piste `live` et non muette. Les trames sont le signal qui ne ment pas : une
 * page gelée en arrière-plan, un contexte interrompu, un pilote parti n'en
 * rendent plus, quoi que disent les états. Les minuteurs, eux, sont ralentis
 * par le navigateur onglet caché — un minuteur en retard ne prouve rien.
 *
 * ── Ce qu'il fait ──────────────────────────────────────────────────────────
 * Tant que la capture est saine : rien. Dès qu'elle ne l'est plus, il note
 * l'instant, puis à chaque occasion (événement de piste, retour au premier
 * plan, vérification périodique, TOUCHER de l'utilisateur) il relance le
 * contexte et, si la piste est morte ou reste muette, redemande un micro que
 * l'appelant rebranche (`adoptMic`). Au rétablissement, il rend la durée du
 * trou : l'appelant l'écrit dans la transcription et renouvelle le canal de
 * transcription.
 *
 * Le toucher compte : iOS refuse parfois `AudioContext.resume()` hors d'un
 * geste. Tout appui sur l'écran pendant une interruption retente donc, dans le
 * geste même — au retour d'un appel, l'utilisateur touche forcément l'écran.
 *
 * Il ne parle pas à l'utilisateur et ne touche ni au graphe audio ni au
 * réseau : tout passe par les fonctions injectées, ce qui le rend testable
 * avec une horloge et des pistes factices.
 */
import {
  CAPTURE_STALL_MS,
  CAPTURE_CHECK_MS,
  CAPTURE_MUTE_GRACE_MS,
  CAPTURE_MIC_RETRY_MS,
  CAPTURE_MARKER_MIN_MS,
  CAPTURE_REFRESH_MIN_MS,
  CAPTURE_BLOCKED_NOTICE_MS,
} from '../../config/constants.js';

/**
 * @param {object} deps
 * @param {() => boolean} deps.isRecording
 * @param {() => boolean} [deps.isPaused] - réunion en pause : rien n'est
 *   enregistré, donc un trou n'y fait rien perdre — aucun marqueur
 * @param {() => (AudioContext|null|undefined)} deps.getAudioContext
 * @param {() => (MediaStream|null|undefined)} deps.getMicStream
 * @param {() => Promise<MediaStream>} deps.acquireMic - nouveau flux micro
 * @param {(stream: MediaStream) => void} deps.adoptMic - l'appelant rebranche
 *   ce flux partout où l'ancien l'était (enregistrement, transcription,
 *   détection de silence) et arrête l'ancien
 * @param {(info: {durationMs: number}) => void} [deps.onRecovered] - la capture
 *   est revenue après `durationMs` sans son, assez long pour être écrit dans
 *   la transcription (un trou d'une seconde ne remonte pas)
 * @param {(durationMs: number) => void} [deps.refreshLive] - interruption
 *   longue : renouveler le canal de transcription
 * @param {(blocked: boolean) => void} [deps.onBlocked] - l'interruption dure
 *   et rien ne la lève seul (true), puis elle est levée (false)
 * @param {(info: {hidden: boolean}) => void} [deps.persist] - la page passe en
 *   arrière-plan ou se ferme : écrire ce qui attend
 * @param {(online: boolean) => void} [deps.onNetwork] - le navigateur vient de
 *   perdre ou de retrouver le réseau
 * @param {Document} [deps.doc]
 * @param {Window} [deps.win]
 * @param {() => number} [deps.now]
 * @param {object} [deps.timing] - seuils (tests)
 */
export function createCaptureGuard({
  isRecording,
  isPaused = () => false,
  getAudioContext,
  getMicStream,
  acquireMic,
  adoptMic,
  onRecovered = () => {},
  refreshLive = () => {},
  onBlocked = () => {},
  persist = () => {},
  onNetwork = () => {},
  doc = typeof document !== 'undefined' ? document : null,
  win = typeof window !== 'undefined' ? window : null,
  now = Date.now,
  timing = {},
}) {
  const {
    stallMs = CAPTURE_STALL_MS,
    checkMs = CAPTURE_CHECK_MS,
    muteGraceMs = CAPTURE_MUTE_GRACE_MS,
    micRetryMs = CAPTURE_MIC_RETRY_MS,
    markerMinMs = CAPTURE_MARKER_MIN_MS,
    refreshMinMs = CAPTURE_REFRESH_MIN_MS,
    blockedNoticeMs = CAPTURE_BLOCKED_NOTICE_MS,
  } = timing;

  let active = false;
  let timer = null;
  let lastFrameAt = 0;
  /** Début du trou en cours (dernière trame reçue, ou instant du constat) ; null = sain. */
  let troubleSince = null;
  /** Début de ce que le trou a fait PERDRE : la reprise après pause le ramène à elle. */
  let lossSince = null;
  let mutedSince = null;
  let lastMicAttemptAt = -Infinity;
  let lastKickAt = -Infinity;
  let recovering = false;
  let blockedNotified = false;
  /** Pistes déjà écoutées : un flux adopté ne doit pas être écouté deux fois. */
  let watched = new WeakSet();

  const visible = () => !doc || doc.visibilityState !== 'hidden';

  function diagnose() {
    const ctx = getAudioContext();
    const tracks = getMicStream()?.getAudioTracks?.() ?? [];
    const ended = tracks.length === 0 || tracks.every((t) => t.readyState === 'ended');
    const muted = !ended && tracks.every((t) => t.readyState === 'ended' || t.muted);
    const ctxDown = !ctx || ctx.state !== 'running';
    const stalled = now() - lastFrameAt > stallMs;
    return {
      ctx,
      ended,
      muted,
      ctxDown,
      stalled,
      healthy: !(ended || muted || ctxDown || stalled),
    };
  }

  function beginTrouble(at) {
    troubleSince = at;
    lossSince = at;
  }

  function settle() {
    const durationMs = Math.max(0, now() - troubleSince);
    const lostMs = Math.max(0, now() - lossSince);
    troubleSince = null;
    lossSince = null;
    mutedSince = null;
    if (blockedNotified) {
      blockedNotified = false;
      onBlocked(false);
    }
    // En pause, rien ne s'enregistrait : écrire « interrompu pendant 15 min »
    // dans la transcription mentirait (PC en veille pendant une pause café).
    if (!isPaused() && lostMs >= markerMinMs) onRecovered({ durationMs: lostMs });
    // Le socket, lui, a vécu tout le trou, pause comprise : durée réelle.
    if (durationMs >= refreshMinMs) refreshLive(durationMs);
  }

  /** Nouveau flux micro, sans insister : un appel en cours fait échouer chaque demande. */
  async function reacquire({ onlyIfUnmuted }) {
    if (now() - lastMicAttemptAt < micRetryMs) return;
    lastMicAttemptAt = now();
    let stream;
    try {
      stream = await acquireMic();
    } catch (e) {
      return; // micro pris (appel) ou refusé : la prochaine occasion retentera
    }
    const tracks = stream?.getAudioTracks?.() ?? [];
    const usable = tracks.some((t) => t.readyState === 'live' && !(onlyIfUnmuted && t.muted));
    // Arrêt pendant la demande, ou flux muet lui aussi : on ne garde pas un
    // second flux qui n'apporte rien — l'ancien peut encore se rétablir seul.
    if (!active || !isRecording() || !usable) {
      stream?.getTracks?.().forEach((t) => t.stop());
      return;
    }
    adoptMic(stream);
    watchStream(stream);
  }

  /**
   * Constat + tentative de rétablissement. Synchrone jusqu'au premier appel
   * navigateur : appelé depuis un toucher, `resume()` part DANS le geste.
   */
  async function check() {
    if (!active || !isRecording()) return;
    const state = diagnose();
    if (state.healthy) {
      if (troubleSince !== null) settle();
      return;
    }
    if (troubleSince === null) {
      // Trames arrêtées : le trou a commencé à la dernière trame, pas au constat.
      beginTrouble(state.stalled && lastFrameAt ? lastFrameAt : now());
    }
    if (state.muted && mutedSince === null) mutedSince = now();
    if (!state.muted) mutedSince = null;

    if (!blockedNotified && visible() && now() - troubleSince >= blockedNoticeMs) {
      blockedNotified = true;
      onBlocked(true);
    }
    if (recovering) return;
    recovering = true;
    try {
      const { ctx } = state;
      if (ctx && state.ctxDown && ctx.state !== 'closed') {
        await ctx.resume().catch(() => {});
      } else if (
        ctx &&
        state.stalled &&
        !state.ended &&
        !state.muted &&
        visible() &&
        now() - troubleSince >= blockedNoticeMs &&
        now() - lastKickAt >= micRetryMs
      ) {
        // Contexte « running » qui ne rend plus de trames (vu sur WebKit après
        // une interruption) : un cycle suspend/resume le relance.
        lastKickAt = now();
        await ctx.suspend().catch(() => {});
        await ctx.resume().catch(() => {});
      }
      // Jamais de demande de micro écran caché : elle échoue (iOS) ou ne sert
      // à rien — la piste se rétablit d'elle-même, ou au retour.
      if (visible()) {
        if (state.ended) await reacquire({ onlyIfUnmuted: false });
        else if (state.muted && now() - mutedSince >= muteGraceMs) {
          await reacquire({ onlyIfUnmuted: true });
        }
      }
    } finally {
      recovering = false;
    }
    // Rétabli par ce passage (piste remplacée) : le dire sans attendre le
    // prochain contrôle. Un contexte relancé, lui, se confirme par ses trames.
    if (active && troubleSince !== null && diagnose().healthy) settle();
  }

  const onTrackEvent = () => void check();
  function watchStream(stream) {
    for (const track of stream?.getAudioTracks?.() ?? []) {
      if (watched.has(track)) continue;
      watched.add(track);
      for (const type of ['ended', 'mute', 'unmute']) track.addEventListener(type, onTrackEvent);
    }
  }

  const onVisibility = () => {
    if (!active) return;
    if (doc.visibilityState === 'hidden') persist({ hidden: true });
    else void check();
  };
  const onPageHide = () => active && persist({ hidden: true });
  const onPageShow = () => void check();
  // Pendant une interruption seulement : sinon ce toucher ne coûte qu'un test.
  const onGesture = () => {
    if (active && troubleSince !== null) void check();
  };
  const onOnline = () => active && isRecording() && onNetwork(true);
  const onOffline = () => active && isRecording() && onNetwork(false);

  const listeners = [
    [() => doc, 'visibilitychange', onVisibility],
    [() => doc, 'freeze', onPageHide], // Chrome : page gelée en arrière-plan
    [() => doc, 'resume', onPageShow],
    [() => win, 'pagehide', onPageHide],
    [() => win, 'pageshow', onPageShow],
    [() => win, 'online', onOnline],
    [() => win, 'offline', onOffline],
    [() => win, 'pointerdown', onGesture, { capture: true, passive: true }],
    [() => win, 'keydown', onGesture, { capture: true, passive: true }],
  ];

  return {
    /** Interruption en cours (tests, diagnostic). */
    get interrupted() {
      return troubleSince !== null;
    },

    /**
     * Une trame vient de sortir du processor du micro. Chemin chaud : une
     * soustraction ; le rétablissement après un gel se constate ici, à la
     * première trame, sans attendre un minuteur que le navigateur a ralenti.
     */
    noteFrame() {
      const t = now();
      const resumed = active && lastFrameAt > 0 && t - lastFrameAt > stallMs;
      if (resumed && troubleSince === null) beginTrouble(lastFrameAt);
      lastFrameAt = t;
      if (resumed) queueMicrotask(() => void check());
    },

    /** Écoute les pistes d'un flux micro (au démarrage, et après chaque remplacement). */
    watchStream,

    /** Constat immédiat (tests, diagnostic). */
    check,

    /**
     * Reprise après pause : un geste, donc une chance de relancer. Un trou
     * encore ouvert ne fait perdre qu'à partir d'ici — la pause n'enregistrait
     * rien, le marqueur ne la compte pas.
     */
    resumed() {
      if (troubleSince !== null) lossSince = now();
      return check();
    },

    start() {
      this.stop();
      active = true;
      lastFrameAt = now();
      troubleSince = null;
      lossSince = null;
      mutedSince = null;
      lastMicAttemptAt = -Infinity;
      lastKickAt = -Infinity;
      blockedNotified = false;
      watchStream(getMicStream());
      const ctx = getAudioContext();
      ctx?.addEventListener?.('statechange', onTrackEvent);
      for (const [target, type, handler, options] of listeners) {
        target()?.addEventListener(type, handler, options);
      }
      timer = setInterval(() => void check(), checkMs);
    },

    stop() {
      if (!active && timer === null) return;
      active = false;
      clearInterval(timer);
      timer = null;
      for (const [target, type, handler, options] of listeners) {
        target()?.removeEventListener(type, handler, options);
      }
      getAudioContext()?.removeEventListener?.('statechange', onTrackEvent);
      // Les pistes sont arrêtées par l'appelant ; leurs écouteurs partent avec elles.
      watched = new WeakSet();
      if (blockedNotified) onBlocked(false);
      blockedNotified = false;
      troubleSince = null;
      lossSince = null;
    },
  };
}
