/**
 * POST /client-event — la SEULE trace serveur d'une panne de transcription.
 *
 * Pourquoi cette route existe : la transcription live ne passe pas par ce
 * service. Le navigateur demande une clé éphémère à /tempkey puis ouvre un
 * WebSocket DIRECT vers OpenAI et y pousse le PCM lui-même. Conséquence :
 * jusqu'ici, une coupure de transcription ne laissait strictement aucune trace
 * ici — sur l'incident du 26/08/2026 (11 min 19 s sans une seule
 * transcription), le conteneur n'avait pas un seul `warn`/`error` sur toute sa
 * durée de vie, et le diagnostic a dû être reconstitué en croisant les
 * horodatages de /transcription/update et de /ping.
 *
 * Confidentialité : MÉTADONNÉES UNIQUEMENT, garanti DEUX fois.
 *   1. le schéma est fermé (`additionalProperties: false`) : Fastify retire
 *      tout champ hors schéma du corps avant le handler ;
 *   2. `buildEventLog` recompose la ligne de log à partir d'une liste blanche —
 *      un futur relâchement du schéma (ou un `additionalProperties` oublié sur
 *      une évolution) ne suffirait pas à faire entrer du texte de réunion dans
 *      les logs.
 * Aucun champ de texte libre n'est prévu : `code` est plafonné et ne reçoit
 * que des codes d'erreur techniques.
 *
 * Destination : les logs, pas une collection Mongo. C'est là que se lit un
 * incident (`docker logs api`), et cela n'ouvre pas de dette de rétention sur
 * des données d'usage. Un `warn` par évènement, avec un préfixe stable
 * (`client-event`) pour le grep.
 */

/** Types acceptés — alignés sur CLIENT_EVENT_TYPES (src/lib/realtime/telemetry.js). */
export const CLIENT_EVENT_TYPES = [
  'realtime_drop',
  'realtime_restored',
  'realtime_watchdog',
  'realtime_error',
];

/**
 * Plafond par utilisateur et par fenêtre. Un client sain envoie quelques
 * évènements par réunion ; 60/min laisse de la marge à une session vraiment
 * malade (reconnexions en série) tout en bornant le bruit qu'un client buggé
 * ou malveillant peut injecter dans les logs.
 */
export const CLIENT_EVENT_MAX_PER_WINDOW = 60;
export const CLIENT_EVENT_WINDOW_MS = 60 * 1000;

/**
 * Corps plafonné très bas : la charge utile légitime fait ~200 octets. Ce
 * plafond est la première barrière — il s'applique avant la validation de
 * schéma, donc avant tout parsing d'un gros corps.
 */
export const CLIENT_EVENT_BODY_LIMIT = 2 * 1024;

const bodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    type: { type: 'string', enum: CLIENT_EVENT_TYPES },
    // Identifiant technique de réunion (uuid côté client) : sert à recoller
    // l'évènement à une ligne d'historique, ne dit rien de son contenu.
    meetingId: { type: 'string', maxLength: 64 },
    at: { type: 'string', maxLength: 32 },
    // Durée de la coupure (ms). Borné : une valeur folle ne doit pas polluer
    // une lecture rapide des logs.
    durationMs: { type: 'integer', minimum: 0, maximum: 24 * 60 * 60 * 1000 },
    attempt: { type: 'integer', minimum: 0, maximum: 1000 },
    channel: { type: 'string', enum: ['mic', 'system'] },
    // Code/type d'erreur du fournisseur (`insufficient_quota`,
    // `session_expired`…). JAMAIS le message d'erreur : il peut citer le
    // paramètre fautif, donc un fragment de contenu de réunion.
    code: { type: 'string', maxLength: 120 },
  },
};

/**
 * Ligne de log d'un évènement — liste blanche explicite. Exporté pour être
 * testé pour lui-même : c'est le filet qui garantit qu'aucun contenu de réunion
 * n'atteint les logs, quoi qu'il arrive au schéma.
 * @param {object} body - corps validé
 * @param {string} email - utilisateur identifié, ou ''
 */
export function buildEventLog(body = {}, email = '') {
  const line = { event: body.type, user: email };
  for (const key of ['meetingId', 'at', 'durationMs', 'attempt', 'channel', 'code']) {
    if (body[key] !== undefined) line[key] = body[key];
  }
  return line;
}

export default function clientEventsRoutes(app) {
  // Compteur en mémoire, volontairement pas en base : perdre le compteur à un
  // redémarrage est sans conséquence, alors qu'un aller-retour Mongo par
  // évènement de télémétrie serait un coût absurde. Une clé par utilisateur.
  const windows = new Map();

  function overQuota(key, now) {
    const w = windows.get(key);
    if (!w || now - w.start >= CLIENT_EVENT_WINDOW_MS) {
      windows.set(key, { start: now, count: 1 });
      // Purge opportuniste : sans elle, la Map croît d'une entrée par
      // utilisateur vu depuis le démarrage et ne redescend jamais.
      if (windows.size > 5000) {
        for (const [k, v] of windows) {
          if (now - v.start >= CLIENT_EVENT_WINDOW_MS) windows.delete(k);
        }
      }
      return false;
    }
    w.count += 1;
    return w.count > CLIENT_EVENT_MAX_PER_WINDOW;
  }

  app.post(
    '/client-event',
    { bodyLimit: CLIENT_EVENT_BODY_LIMIT, schema: { body: bodySchema } },
    async (req, reply) => {
      // Identité facultative : une coupure vaut d'être tracée même si la
      // session vient de mourir (c'est justement un cas suspect). L'`authPlugin`
      // a déjà posé req.user quand il a pu.
      const email = req.user?.email || '';
      if (overQuota(email || req.ip, Date.now())) {
        return reply.code(429).send({ error: 'too_many_events' });
      }
      req.log.warn(buildEventLog(req.body, email), `client-event ${req.body.type}`);
      return reply.code(204).send();
    },
  );
}
