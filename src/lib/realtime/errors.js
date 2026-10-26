/**
 * Classification des messages `{type:'error'}` de l'API OpenAI Realtime.
 *
 * Pourquoi ce module : `handleMessage` ne connaissait que les deux types de
 * transcription, et TOUT le reste tombait dans son `default`. Les erreurs
 * Realtime — quota dépassé, rate limit, session invalide, `input_audio_buffer`
 * refusé — étaient donc avalées : ni log, ni toast, ni reconnexion, ni trace.
 * Un socket dont la session est morte reste `readyState === OPEN`, c'est-à-dire
 * invisible pour le health check : la seule alerte possible était ce message.
 *
 * Confidentialité : on ne regarde et on ne journalise QUE `type`, `code` et
 * `event_id`. Jamais `error.message`, qui peut citer le paramètre fautif —
 * donc potentiellement un fragment de contenu de réunion. Même règle que la
 * branche « transcription filtrée » de handleMessage.
 */
import { isCreditExhaustedText } from '../../utils/httpErrorHandler.js';

/**
 * Codes/types qui signifient « cette session Realtime est morte » : rouvrir un
 * socket avec une clé éphémère neuve est la bonne (et seule) réponse.
 */
const SESSION_DEAD =
  /session[_\s-]?(?:expired|invalid|not_found)|invalid[_\s-]?session|expired|invalid[_\s-]?api[_\s-]?key|invalid[_\s-]?client[_\s-]?secret|authentication|unauthorized|forbidden|invalid[_\s-]?token/i;

/**
 * Rate limit : reconnecter ne sert à rien (la nouvelle session serait limitée
 * pareil) mais l'utilisateur doit savoir pourquoi la transcription décroche.
 */
const RATE_LIMITED = /rate[_\s-]?limit/i;

/**
 * @typedef {Object} RealtimeErrorInfo
 * @property {string} code - code/type technique, sûr à journaliser
 * @property {boolean} isCredit - crédit / quota IA épuisé
 * @property {boolean} sessionInvalid - la session est morte → reconnecter
 * @property {boolean} fatal - l'utilisateur doit être averti (toast)
 * @property {string} eventId - `event_id` OpenAI, s'il est fourni
 */

/**
 * @param {object} message - message Realtime brut (`{type:'error', error:{…}}`)
 * @returns {RealtimeErrorInfo}
 */
export function classifyRealtimeError(message) {
  const err = (message && message.error) || {};
  const type = String(err.type || '');
  const code = String(err.code || type || 'unknown');
  // Un seul texte à inspecter, composé UNIQUEMENT de champs techniques.
  const probe = `${type} ${code}`;

  const isCredit = isCreditExhaustedText(probe);
  // Le crédit épuisé n'est PAS une session invalide : reconnecter brûlerait
  // des clés éphémères pour échouer à l'identique. On informe, on n'insiste pas.
  const sessionInvalid = !isCredit && SESSION_DEAD.test(probe);
  const rateLimited = RATE_LIMITED.test(probe);

  return {
    code,
    isCredit,
    sessionInvalid,
    fatal: isCredit || sessionInvalid || rateLimited,
    eventId: String(err.event_id || ''),
  };
}

/**
 * Clé i18n du toast à montrer pour une erreur fatale — trois cas distincts,
 * parce qu'ils n'appellent pas la même action de la part de l'utilisateur :
 *   - crédit épuisé   : rien à attendre, il faut recharger le compte ;
 *   - session morte   : on reconnecte, patienter suffit ;
 *   - rate limit      : le service bride, ni reconnexion ni action utile.
 * @param {RealtimeErrorInfo} info
 * @returns {string}
 */
export function realtimeErrorToastKey(info) {
  if (info.isCredit) return 'statuses.transcriptionCreditExhausted';
  if (info.sessionInvalid) return 'statuses.transcriptionInterrupted';
  return 'statuses.transcriptionLimited';
}
