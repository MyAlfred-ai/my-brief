/**
 * Télémétrie MINIMALE des coupures de transcription live.
 *
 * Pourquoi : la transcription ne passe pas par le backend (le navigateur parle
 * directement à OpenAI), donc AUCUNE panne de transcription ne laissait de
 * trace serveur. Sur l'incident du 26/08/2026, le conteneur API n'avait pas un
 * seul `warn`/`error` sur toute sa durée de vie : le diagnostic a dû être
 * reconstitué en croisant les horodatages de `/api/transcription/update` et de
 * `/api/ping`. Ce reporter existe pour que la prochaine coupure se lise
 * directement dans les logs.
 *
 * Charge utile : MÉTADONNÉES SEULEMENT — type d'évènement, meetingId, durée,
 * code d'erreur. Jamais de transcript, jamais de contenu de réunion (le
 * serveur refuse d'ailleurs tout champ hors schéma, cf.
 * services/api/routes/clientEvents.js).
 *
 * Tout est best-effort et silencieux : un échec de télémétrie ne doit RIEN
 * changer au déroulé d'une réunion.
 */
import { post } from '../../services/apiClient.js';

/** Types acceptés côté serveur — la liste doit rester alignée sur la route. */
export const CLIENT_EVENT_TYPES = Object.freeze({
  DROP: 'realtime_drop',
  RESTORED: 'realtime_restored',
  WATCHDOG: 'realtime_watchdog',
  ERROR: 'realtime_error',
});

/**
 * @param {Object} opts
 * @param {(body: object) => Promise<any>} [opts.send] - injectable (tests) ;
 *   par défaut POST /api/client-event
 * @param {() => string} [opts.getMeetingId] - réunion en cours (peut être vide :
 *   une coupure avant l'ouverture de la réunion reste intéressante)
 * @param {number} [opts.minIntervalMs] - anti-rafale côté client : un
 *   évènement du même type au plus tous les X ms. Le serveur borne aussi de
 *   son côté ; ce filtre-ci évite surtout d'ajouter du trafic pendant une
 *   panne réseau, moment où il est le moins utile.
 * @param {number} [opts.maxPerSession] - plafond dur sur la vie de l'onglet
 * @param {() => number} [opts.now]
 */
export function createClientEventReporter({
  send = (body) => post('/client-event', body),
  getMeetingId = () => '',
  minIntervalMs = 5_000,
  maxPerSession = 200,
  now = Date.now,
} = {}) {
  const lastByType = new Map();
  let sent = 0;

  return {
    /** Nombre d'envois réellement partis (tests, debug). */
    get sent() {
      return sent;
    },

    /**
     * @param {string} type - une valeur de CLIENT_EVENT_TYPES
     * @param {{channel?: string, durationMs?: number, code?: string, attempt?: number}} [details]
     */
    report(type, details = {}) {
      if (sent >= maxPerSession) return;
      const at = now();
      // Anti-rafale PAR TYPE : un `realtime_error` répété 50 fois en 2 s
      // (OpenAI renvoie parfois une erreur par frame refusée) ne doit pas
      // noyer le log, mais il ne doit pas non plus masquer le `restored`
      // qui suit — d'où la fenêtre par type et non globale.
      if (at - (lastByType.get(type) || 0) < minIntervalMs) return;
      lastByType.set(type, at);
      sent += 1;

      const body = { type, at: new Date(at).toISOString() };
      const meetingId = getMeetingId();
      if (meetingId) body.meetingId = String(meetingId).slice(0, 64);
      if (details.channel) body.channel = details.channel;
      if (Number.isFinite(details.durationMs)) body.durationMs = Math.round(details.durationMs);
      if (Number.isFinite(details.attempt)) body.attempt = details.attempt;
      if (details.code) body.code = String(details.code).slice(0, 120);

      try {
        // Volontairement sans await : la télémétrie ne retarde jamais une
        // reconnexion. Le .catch() est indispensable — un rejet non capturé
        // remonterait en « unhandled rejection » dans la console pendant une
        // panne réseau, soit exactement quand on veut du calme.
        Promise.resolve(send(body)).catch(() => {});
      } catch (_) {
        /* best-effort */
      }
    },
  };
}
