/**
 * Écoute d'une demande dictée à l'Aide IA — attendre que la personne ait FINI.
 *
 * ── Le défaut corrigé ──────────────────────────────────────────────────────
 * La question partait dès que la ligne portant le mot d'appel était bouclée.
 * Or une ligne se boucle à la première ponctuation de fin de phrase, ou à la
 * première respiration (un segment de la détection de voix se ferme après
 * 500 ms de silence). « Alfred, j'ai une question. Est-ce que le budget du
 * lot 2 a été validé ? » envoyait « j'ai une question » ; « Alfred, tu peux me
 * dire… quelle est la date de livraison ? » envoyait « tu peux me dire ». L'IA
 * répondait à la moitié d'une phrase — et la suite, sans mot d'appel, n'était
 * lue par personne.
 *
 * À l'inverse, une demande dite sans ponctuation finale restait « en cours »
 * à l'écran jusqu'à dix secondes : rien ne partait tant que personne ne
 * reprenait la parole.
 *
 * ── Ce qui décide ──────────────────────────────────────────────────────────
 * Le SILENCE de celui qui parle, mesuré sur son texte : la demande est tout ce
 * qu'il dit après le mot d'appel — lignes bouclées et ligne en cours, du même
 * flux (micro ou visio) — et elle part quand ce texte n'a plus bougé depuis :
 *   - `quietMs` s'il a l'air fini (une question, une phrase complète) ;
 *   - `openMs` s'il a l'air en suspens : une amorce (« j'ai une question »,
 *     « tu peux me dire »), une virgule, un mot de liaison en dernier (« de »,
 *     « que », « et »), une hésitation, pas de ponctuation ;
 *   - `gestureMs` pour un geste (« ferme », « agrandis ») : il doit rester vif.
 * La parole d'un AUTRE flux ne compte pas : quelqu'un qui répond dans la visio
 * ne retarde ni ne coupe la demande.
 *
 * Un nouveau mot d'appel du même flux clôt la demande en cours et en ouvre une
 * autre. Un prénom lancé seul (« Alfred ? ») laisse `armedMs` pour commencer.
 *
 * ── Ce module ne fait rien d'autre ─────────────────────────────────────────
 * Il ne parle ni au serveur ni à l'écran : il rend la demande (`onRequest`) et
 * signale la ligne qui a appelé (`onCall`). Horloge et minuteurs injectés.
 */
import { matchWakeWord, isDismissal, sizeRequest, WAKE_QUESTION_MAX } from './wakeWord.js';
import {
  AI_HELP_ARMED_MS,
  AI_HELP_REQUEST_QUIET_MS,
  AI_HELP_REQUEST_OPEN_MS,
  AI_HELP_REQUEST_GESTURE_MS,
  AI_HELP_REQUEST_MAX_MS,
} from '../config/constants.js';

/** Un mot qui en appelle un autre : la phrase n'est pas finie. */
const TRAILING = new Set(
  (
    'et ou mais donc or ni car que qui quoi dont où ou de du des le la les un une au aux à a en ' +
    'dans sur sous pour par avec sans chez vers entre comme si quand comment pourquoi lequel ' +
    'laquelle quel quelle quels quelles ce cet cette ces mon ma mes ton ta tes son sa ses notre ' +
    'nos votre vos leur leurs est sont était concernant euh heu hum ben bah ' +
    'and or but the a an of to in on for with about that which what when where why how is are'
  ).split(' '),
);

/** Les mots qui posent la question — et qui peuvent aussi la finir. */
const ASKING = new Set(
  'quoi qui où quand comment pourquoi lequel laquelle what who where when why how which'.split(' '),
);

/** Ce qu'on dit AVANT de demander : la demande elle-même suit. */
const PREAMBLES = [
  /^(?:j'ai|on a|j'aurais|j'avais) (?:juste )?(?:une|deux|quelques) (?:petites? |autres? )?questions?(?: pour toi)?$/,
  /^(?:une|deux) (?:petites? |autres? )?questions?$/,
  /^(?:est-ce que |est ce que )?(?:tu peux|tu pourrais|tu saurais|peux-tu|peux tu|pourrais-tu|pourrais tu|sais-tu|sais tu|vous pouvez|pouvez-vous)(?: (?:me|nous|m'|nous))?(?: (?:dire|redire|rappeler|aider|expliquer|donner|chercher|rechercher|retrouver|trouver|préciser|confirmer|regarder|vérifier))?$/,
  /^(?:dis|dites)[- ](?:moi|nous)$/,
  /^(?:s'il te pla[iî]t|s'il vous pla[iî]t|stp)$/,
  /^(?:j'aimerais|je voudrais|j'aurais voulu|je veux|on aimerait|on voudrait)(?: bien)?(?: savoir| que tu| te demander| comprendre)?$/,
  /^(?:regarde|cherche|recherche|vérifie)(?: (?:dans|sur) (?:my ?brain|le wiki|la base))?$/,
  /^(?:i have|i've got|quick) (?:a )?question$/,
  /^(?:can|could|would) you(?: please)?(?: (?:tell|remind|help|show|give) (?:me|us))?$/,
];

const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * La demande a-t-elle l'air finie ? Une heuristique, faite pour se tromper du
 * bon côté : dans le doute, « pas finie » — on attend un peu plus.
 * @param {string} text - ce qui suit le mot d'appel, tel que transcrit
 */
export function looksFinished(text) {
  const raw = normalize(text);
  if (!raw) return false;
  // Une virgule, des points de suspension, un tiret : la phrase reste ouverte.
  if (/(?:[,;:…-]|\.\.\.)$/.test(raw)) return false;
  const ended = /[.?!]$/.test(raw);
  const said = raw
    .replace(/[.?!…,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = said.split(' ').filter(Boolean);
  if (!words.length) return false;
  const last = words[words.length - 1];
  // « Tu en penses quoi ? », « on livre quand ? » : avec son point
  // d'interrogation, un mot interrogatif en dernier FERME la question.
  if (TRAILING.has(last) && !(/\?$/.test(raw) && ASKING.has(last))) return false;
  if (PREAMBLES.some((pattern) => pattern.test(said))) return false;
  // Sans ponctuation, il faut une phrase d'une certaine longueur pour trancher.
  return ended || words.length >= 6;
}

/** Rien de dit encore, ou une hésitation : le prénom seul, l'écoute « armée ». */
const isEmpty = (text) =>
  normalize(text)
    .replace(/[.?!…,;:-]+/g, ' ')
    .split(' ')
    .filter((word) => word && !['euh', 'heu', 'hum', 'hmm', 'ben', 'bah'].includes(word))
    .join('').length < 3;

/**
 * @param {object} deps
 * @param {() => string} deps.getWakeWord
 * @param {(request: {question: string, lineKey: string}) => void} deps.onRequest -
 *   la demande entière ; `lineKey` : la ligne qui portait le mot d'appel
 * @param {(entry: {key: string, displayKey?: string}) => void} [deps.onCall] -
 *   une ligne vient d'appeler l'IA (de quoi colorer le prénom)
 * @param {() => number} [deps.now]
 * @param {(fn: Function, ms: number) => any} [deps.setTimeoutFn]
 * @param {(id: any) => void} [deps.clearTimeoutFn]
 * @param {object} [deps.timing] - seuils (tests)
 */
export function createVoiceRequestCollector({
  getWakeWord,
  onRequest,
  onCall = () => {},
  now = Date.now,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutFn = (id) => clearTimeout(id),
  timing = {},
}) {
  const {
    quietMs = AI_HELP_REQUEST_QUIET_MS,
    openMs = AI_HELP_REQUEST_OPEN_MS,
    gestureMs = AI_HELP_REQUEST_GESTURE_MS,
    maxMs = AI_HELP_REQUEST_MAX_MS,
    armedMs = AI_HELP_ARMED_MS,
  } = timing;

  /** Lignes déjà jugées (sans appel, ou parties avec une demande) : jamais relues. */
  let handled = new Set();
  let primed = false;
  /** L'écoute en cours : { key, displayKey, source, startedAt, text, keys, timer }. */
  let listening = null;
  let latest = [];

  const call = (entry) => matchWakeWord(entry.text, getWakeWord());

  function stop() {
    if (listening?.timer != null) clearTimeoutFn(listening.timer);
    listening = null;
  }

  /** La demande telle qu'elle se lit maintenant, et où elle s'arrête. */
  function read(entries) {
    const at = entries.findIndex((entry) => entry.key === listening.key);
    if (at === -1) return null;
    const opening = call(entries[at]);
    if (!opening) return null;
    const parts = opening.kind === 'question' ? [opening.question] : [];
    const keys = [entries[at].key];
    let next = null;
    for (let i = at + 1; i < entries.length; i += 1) {
      const entry = entries[i];
      if (entry.source !== listening.source) continue;
      // Un nouvel appel : la demande d'avant est close, celle-ci commence.
      if (call(entry)) {
        next = entry;
        break;
      }
      parts.push(entry.text);
      keys.push(entry.key);
    }
    return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), keys, next };
  }

  function send(text, keys) {
    const { displayKey } = listening;
    keys.forEach((key) => handled.add(key));
    stop();
    if (!isEmpty(text))
      onRequest({ question: text.slice(0, WAKE_QUESTION_MAX), lineKey: displayKey });
  }

  /** Le texte n'a plus bougé : la demande part — ou l'écoute armée s'éteint. */
  function onQuiet() {
    if (!listening) return;
    listening.timer = null;
    const request = read(latest);
    if (!request) return stop();
    send(request.text, request.keys);
    // Une ligne arrivée pendant l'attente peut appeler à son tour.
    examine(latest);
  }

  function arm(text) {
    if (listening.timer != null) clearTimeoutFn(listening.timer);
    const sinceStart = now() - listening.startedAt;
    let wait;
    if (isEmpty(text)) wait = armedMs - sinceStart;
    else if (isDismissal(text) || sizeRequest(text)) wait = gestureMs;
    else wait = looksFinished(text) ? quietMs : openMs;
    // Jamais au-delà du plafond d'écoute : une personne qui enchaîne sans
    // s'arrêter n'aurait jamais sa réponse.
    wait = Math.max(0, Math.min(wait, maxMs - sinceStart));
    listening.timer = setTimeoutFn(onQuiet, wait);
  }

  function follow(entries) {
    const request = read(entries);
    // La ligne d'appel a disparu (écho retiré : sa jumelle de l'autre flux peut
    // appeler à sa place) ou ne l'est plus (texte révisé).
    if (!request) {
      stop();
      return examine(entries);
    }
    if (request.next || request.text.length >= WAKE_QUESTION_MAX) {
      send(request.text, request.keys);
      return examine(entries);
    }
    if (request.text === listening.text) return undefined;
    listening.text = request.text;
    listening.keys = request.keys;
    return arm(request.text);
  }

  /** Cherche, hors écoute, une ligne qui appelle — de la plus ancienne à la plus récente. */
  function examine(entries) {
    if (listening) return;
    for (const entry of entries) {
      if (handled.has(entry.key)) continue;
      if (call(entry)) {
        listening = {
          key: entry.key,
          displayKey: entry.displayKey || entry.key,
          source: entry.source,
          startedAt: now(),
          text: null,
          keys: [entry.key],
          timer: null,
        };
        onCall(entry);
        follow(entries);
        return;
      }
      // Une ligne en cours peut encore devenir un appel (« Al », puis « Alfred »).
      if (!entry.isDelta) handled.add(entry.key);
    }
  }

  return {
    /** Une demande est-elle en train d'être écoutée ? (tests, état d'écran) */
    get listening() {
      return listening !== null;
    },

    /**
     * La transcription telle qu'elle est à l'écran, à chaque changement.
     * @param {Array<{key: string, displayKey?: string, text: string, source?: string,
     *   isDelta?: boolean}>} entries - dans l'ordre de l'écran, lignes en cours comprises
     * @param {{active?: boolean}} [options] - `active` faux : les questions sont
     *   coupées — rien ne déclenche, et ce qui se dit entre-temps ne déclenchera
     *   pas plus tard
     */
    observe(entries, { active = true } = {}) {
      latest = (entries || []).filter((entry) => entry && entry.key && entry.text?.trim());
      if (!primed || !active || !getWakeWord()) {
        // Les lignes déjà là au premier passage sont du contexte, pas des appels.
        primed = true;
        stop();
        for (const entry of latest) if (!entry.isDelta) handled.add(entry.key);
        return;
      }
      if (listening) follow(latest);
      else examine(latest);
    },

    /** La réunion change : plus rien n'est retenu. */
    reset() {
      stop();
      handled = new Set();
      primed = false;
      latest = [];
    },
  };
}
