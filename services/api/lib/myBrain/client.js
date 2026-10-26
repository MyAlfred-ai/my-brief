/**
 * Client de l'API myBrain — la porte des APPLICATIONS (`/api/v1`, clé `mbk_…`).
 *
 * myBrain est le cerveau partagé de l'équipe : un wiki qui ingère des sources et
 * en tire des faits datés. myBrief s'y branche comme une application — une clé
 * émise par un administrateur de myBrain (Administration → Clés d'API), avec le
 * droit « nourrir » — et lui donne les réunions à lire. Deux appels suffisent :
 *
 *   GET  /api/v1          qui suis-je : l'application, ses droits (le test)
 *   POST /api/v1/nourrir  un texte à ingérer — 202 et un `job` ; TOUT part en
 *                         proposition dans la revue de myBrain, rien n'atteint
 *                         le cerveau sans un humain.
 *
 * Le contrat de myBrain est lu dans son code (web/src/lib/server/applications.ts)
 * et non deviné : erreurs en JSON `{ erreur }`, 120 000 caractères par texte,
 * 60 dépôts par heure et par clé, `pour` = l'adresse de la personne concernée.
 *
 * ── Trois choix ──────────────────────────────────────────────────────────────
 * 1. `redirect: 'manual'` : une redirection n'est JAMAIS suivie. Le jeton part
 *    dans un en-tête, et le suivre enverrait la clé à l'hôte que la réponse
 *    désigne. Une adresse saisie en http:// qui redirige vers https:// se
 *    corrige à l'écran (`mybrain_redirected`, avec l'adresse finale).
 * 2. Chaque échec dit si le dépôt a PU arriver (`ambiguous`) et si le relancer
 *    plus tard est sûr (`retryable`). Sûr : la connexion n'a jamais été
 *    établie (DNS, refus, certificat), ou myBrain a refusé avant de créer le
 *    job (429 — son plafond est compté avant l'ingestion —, 502/503/504 d'un
 *    service absent). Ambigu : la requête est partie et la réponse s'est perdue
 *    — délai dépassé, connexion coupée en route, 500 —, myBrain a pu créer le
 *    job. Le relancer doublerait la proposition dans la revue (même règle que
 *    lib/retry.js pour un envoi de mail).
 * 3. Aucune chaîne affichable ne sort d'ici : un slug stable, le statut, et le
 *    message de myBrain tel quel (`upstreamMessage`) pour l'administration,
 *    comme on relaie celui d'OpenAI. La clé n'apparaît dans aucune erreur.
 */

/** Plafond d'un appel : myBrain répond 202 dès que le dépôt est en file. */
export const MYBRAIN_TIMEOUT_MS = 15_000;

/**
 * Statuts où myBrain n'a rien pris, et où un nouvel essai plus tard est utile.
 * PAS 500 : c'est myBrain lui-même qui répond, et une erreur interne après la
 * création du job (sa trace d'audit, par exemple) reste possible.
 */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

/**
 * Causes réseau survenues AVANT l'envoi de la requête : la connexion n'a jamais
 * existé, rien n'a pu arriver. Tout le reste — `ECONNRESET`, `UND_ERR_SOCKET`,
 * une cause inconnue — est une connexion perdue en route : ambiguë.
 */
const CONNECT_PHASE_CAUSES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/**
 * Échec d'un appel à myBrain. `code` est le slug que l'écran traduit.
 */
export class MyBrainError extends Error {
  /**
   * @param {string} code
   * @param {{status?: number, upstreamMessage?: string, retryable?: boolean,
   *          ambiguous?: boolean, location?: string}} [details]
   */
  constructor(
    code,
    { status = 0, upstreamMessage = '', retryable = false, ambiguous = false, location = '' } = {},
  ) {
    super(code);
    this.name = 'MyBrainError';
    this.code = code;
    this.status = status;
    this.upstreamMessage = upstreamMessage;
    this.retryable = retryable;
    this.ambiguous = ambiguous;
    this.location = location;
  }

  /** Ce qu'une route d'administration peut joindre à sa réponse d'erreur. */
  details() {
    return {
      ...(this.status ? { upstreamStatus: this.status } : {}),
      ...(this.upstreamMessage ? { upstreamMessage: this.upstreamMessage } : {}),
      ...(this.location ? { location: this.location } : {}),
    };
  }
}

/** Statut HTTP de myBrain → slug. */
function codeForStatus(status) {
  if (status === 400 || status === 422) return 'mybrain_rejected';
  if (status === 401) return 'mybrain_key_rejected';
  if (status === 403) return 'mybrain_right_missing';
  if (status === 404) return 'mybrain_not_found';
  // 409 : cerveau en vault v1, l'ingestion y est fermée. Un état de myBrain,
  // pas un incident : relancer ne changerait rien.
  if (status === 409) return 'mybrain_unavailable';
  if (status === 413) return 'mybrain_too_long';
  if (status === 429) return 'mybrain_rate_limited';
  return 'mybrain_error';
}

/** Une panne de fetch → l'erreur qui dit si le dépôt a pu arriver. */
function networkFailure(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new MyBrainError('mybrain_timeout', { ambiguous: true });
  }
  const cause = err?.cause?.code || err?.code || '';
  if (CONNECT_PHASE_CAUSES.has(cause)) {
    return new MyBrainError('mybrain_unreachable', { retryable: true });
  }
  return new MyBrainError('mybrain_connection_lost', { ambiguous: true });
}

/**
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number}} [options] - `fetchImpl`
 *   est injectable : aucun test ne doit sortir sur le réseau.
 */
export function createMyBrainClient({
  fetchImpl = globalThis.fetch,
  timeoutMs = MYBRAIN_TIMEOUT_MS,
} = {}) {
  /**
   * @returns {Promise<{ok: true, data: object|null}>} `data` null : réponse 2xx
   *   dont le corps n'a pas pu être lu — à l'appelant d'en juger.
   */
  async function call({ url, apiKey, path, body }) {
    let res;
    try {
      res = await fetchImpl(`${url}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'manual',
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw networkFailure(err);
    }

    if (res.status >= 300 && res.status < 400) {
      throw new MyBrainError('mybrain_redirected', {
        status: res.status,
        location: String(res.headers?.get?.('location') || '').slice(0, 500),
      });
    }

    let data = null;
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (data && (typeof data !== 'object' || Array.isArray(data))) data = null;

    if (!res.ok) {
      throw new MyBrainError(codeForStatus(res.status), {
        status: res.status,
        upstreamMessage: typeof data?.erreur === 'string' ? data.erreur.slice(0, 300) : '',
        retryable: RETRYABLE_STATUSES.has(res.status),
        ambiguous: res.status === 500,
      });
    }
    return { ok: true, data };
  }

  return {
    /**
     * Qui suis-je : l'application que la clé désigne et ses droits.
     * @returns {Promise<{application: string, droits: string[], api: string}>}
     */
    async whoami({ url, apiKey }) {
      const { data } = await call({ url, apiKey, path: '/api/v1' });
      // 2xx sans la forme attendue : l'adresse sert une page (le SPA d'un autre
      // site, un portail) — ce n'est pas un myBrain.
      if (typeof data?.application !== 'string' || !Array.isArray(data?.droits)) {
        throw new MyBrainError('mybrain_invalid_response');
      }
      return {
        application: data.application.slice(0, 120),
        droits: data.droits.map(String),
        api: typeof data.api === 'string' ? data.api : '',
      };
    },

    /**
     * Un dépôt : `{ titre, texte, pour }`. myBrain répond 202 avec le job.
     *
     * Un 2xx dont le corps est illisible (délai tombé pendant la lecture,
     * connexion coupée en plein corps) compte comme ACCEPTÉ : myBrain a dit oui,
     * seul l'identifiant du job manque. Le traiter en échec ferait redéposer ce
     * qui est déjà dans la revue. `pour` vaut alors `undefined` : inconnu, et non
     * « adresse sans compte ».
     *
     * @returns {Promise<{job: string, pour: string|null|undefined, avertissements: string[]}>}
     */
    async feed({ url, apiKey, deposit }) {
      const { data } = await call({ url, apiKey, path: '/api/v1/nourrir', body: deposit });
      if (!data) return { job: '', pour: undefined, avertissements: [] };
      return {
        job: typeof data.job === 'string' ? data.job : '',
        pour: typeof data.pour === 'string' ? data.pour : data.pour === null ? null : undefined,
        avertissements: Array.isArray(data.avertissements) ? data.avertissements.map(String) : [],
      };
    },
  };
}
