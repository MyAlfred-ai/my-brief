/**
 * Mot d'appel de l'Aide IA — « Alfred, rappelle-moi la date de livraison ? ».
 *
 * La transcription en direct est du TEXTE : le mot d'appel s'y repère sans
 * écoute supplémentaire, sur chaque phrase finalisée. Une seule règle, pour
 * éviter les faux départs : le prénom doit OUVRIR une phrase (on s'adresse à
 * lui), éventuellement après une interjection (« dis », « ok »…). « J'en ai
 * parlé à Alfred hier » ne déclenche rien — c'est le compromis : on rate
 * « tu en penses quoi, Alfred ? », on ne répond jamais à une conversation qui
 * ne nous était pas destinée.
 *
 * La comparaison se fait À L'OREILLE (utils/soundsLike.js) : la transcription
 * écrit « alfred », « Alfréd », mais aussi « Alfrède », « Halfred », « Alfed »
 * ou « Al Fred » selon le moteur et le micro. L'égalité stricte ratait tous
 * ces appels — sans rien dire, ce qui se lisait « il ne m'écoute pas ». Un mot
 * d'appel de plusieurs mots est accepté (réglage de l'administration).
 *
 * Tout ce qui suit le mot d'appel dans le segment est la question — la phrase
 * qui l'ouvre et celles qui la précisent. Un prénom lancé seul (« Alfred ? »,
 * puis un silence) « arme » l'écoute : à l'appelant de prendre le segment
 * suivant pour question.
 *
 * Une exception à « ouvrir la phrase », depuis le 2026-11-13 : le prénom qui
 * la FERME après une virgule — « tu en penses quoi, Alfred ? ». C'est la
 * ponctuation d'une adresse ; la phrase qu'il ferme est la question. Sans la
 * virgule (« j'en ai parlé à Alfred »), rien : c'est là que se logeaient les
 * faux départs. « Merci Alfred » est reconnu aussi, pour ce qu'il est — un
 * congé.
 *
 * `wakeWordSpan` dit OÙ est ce prénom dans le texte : la transcription l'écrit
 * dans la teinte de l'IA quand il l'a déclenchée (stores/aiHelp.js). Les deux
 * fonctions partagent la même lecture (`findCall`) — un prénom coloré est un
 * prénom qui a été entendu, jamais l'inverse.
 */

import { soundsLike } from './soundsLike.js';

/**
 * Longueur au-delà de laquelle une question dictée est coupée — celle que
 * l'API accepte (ASK_QUESTION_MAX, lib/aiHelp/prompts.js). 600 : une demande
 * dictée en plusieurs phrases, que l'écoute rassemble (utils/voiceRequest.js).
 */
export const WAKE_QUESTION_MAX = 600;

/** Interjections qui peuvent précéder le prénom sans changer le sens. */
const LEAD_INS = new Set([
  'dis',
  'dis-moi',
  'dites',
  'dites-moi',
  'hey',
  'he',
  'eh',
  'ok',
  'okay',
  'bon',
  'alors',
  'et',
  'bonjour',
  'salut',
  'coucou',
  'hello',
  'hi',
]);

/** Ce qu'on dit en cherchant ses mots : pas encore une question. */
const HESITATIONS = new Set(['euh', 'heu', 'hum', 'hmm', 'ben', 'bah', 'bon', 'alors', 'donc']);

const fold = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Un mot réduit à ses lettres et chiffres (tirets et apostrophes gardés). */
const bare = (word) => fold(word).replace(/[^\p{L}\p{N}'’-]/gu, '');

/**
 * Combien de mots, à partir de `at`, forment le mot d'appel — 0 : aucun.
 * « Al Fred » : le moteur coupe parfois le prénom en deux.
 */
function callLength(solid, at, wanted) {
  if (wanted.every((w, k) => soundsLike(solid[at + k]?.bare || '', w))) return wanted.length;
  const whole = wanted.join('');
  for (let n = wanted.length + 1; n <= wanted.length + 2 && at + n <= solid.length; n += 1) {
    const glued = solid
      .slice(at, at + n)
      .map((word) => word.bare)
      .join('');
    if (soundsLike(glued, whole)) return n;
  }
  return 0;
}

/**
 * La première phrase du segment que le mot d'appel OUVRE — ou ferme, après
 * une virgule — et où il s'y trouve.
 *
 * @param {string} text
 * @param {string} wakeWord
 * @returns {{after: string, start: number, end: number} | null} `after` : ce
 *   qui est dit à l'IA — la suite de la phrase jusqu'à la fin du segment, ou,
 *   prénom en fin de phrase, la phrase qu'il ferme ; `start` / `end` : la place
 *   du prénom dans `text`, sans la ponctuation qui le touche (« Alfred, » →
 *   Alfred).
 */
function findCall(text, wakeWord) {
  const wanted = fold(wakeWord).split(/\s+/).map(bare).filter(Boolean);
  if (!wanted.length) return null;

  const sentences = [...String(text || '').matchAll(/[^.!?…\n]+[.!?…]*/g)];
  for (let i = 0; i < sentences.length; i += 1) {
    // Les mots qui en sont : une ponctuation isolée (« Alfred ? ») ne compte pas.
    const solid = [...sentences[i][0].matchAll(/\S+/g)]
      .map((match) => ({ match, bare: bare(match[0]) }))
      .filter((word) => word.bare);
    const span = (from, count) => {
      const first = solid[from].match;
      const last = solid[from + count - 1].match;
      const lead = first[0].length - first[0].replace(/^[^\p{L}\p{N}]+/u, '').length;
      const body = last[0].replace(/[^\p{L}\p{N}]+$/u, '').length;
      return {
        start: sentences[i].index + first.index + lead,
        end: sentences[i].index + last.index + body,
      };
    };
    const rest = sentences.slice(i + 1).map((sentence) => sentence[0]);

    let at = 0;
    while (at < solid.length && LEAD_INS.has(solid[at].bare)) at += 1;
    const opening = at < solid.length ? callLength(solid, at, wanted) : 0;
    if (opening) {
      const tail = sentences[i][0].slice(
        solid[at + opening - 1].match.index + solid[at + opening - 1].match[0].length,
      );
      return { after: [tail.trim(), ...rest].join(' '), ...span(at, opening) };
    }

    // « …, Alfred ? » — et « Merci Alfred » : le prénom ferme la phrase.
    for (let count = wanted.length; count <= wanted.length + 2; count += 1) {
      const from = solid.length - count;
      if (from < 1 || callLength(solid, from, wanted) !== count) continue;
      const before = sentences[i][0].slice(0, solid[from].match.index);
      const said = before.replace(/[\s,;:]+$/, '').trim();
      const addressed = /,\s*$/.test(before) && from >= 3;
      if (!addressed && !isDismissal(said)) break;
      const asks = /\?\s*$/.test(sentences[i][0]) ? ' ?' : '';
      return { after: [`${said}${asks}`, ...rest].join(' '), ...span(from, count) };
    }
  }
  return null;
}

/**
 * @param {string} text - un segment finalisé de la transcription
 * @param {string} wakeWord - le mot d'appel réglé (« Alfred »)
 * @returns {{kind: 'question', question: string} | {kind: 'armed'} | null}
 */
export function matchWakeWord(text, wakeWord) {
  const call = findCall(text, wakeWord);
  if (!call) return null;
  const rest = call.after
    .replace(/^[\s,;:!?.…-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Rien, ou une hésitation : « Alfred ? », « Alfred, euh… » — pas une question.
  const said = rest
    .split(' ')
    .map(bare)
    .filter((w) => w && !HESITATIONS.has(w))
    .join('');
  if (said.length < 3) return { kind: 'armed' };
  return { kind: 'question', question: rest.slice(0, WAKE_QUESTION_MAX) };
}

/** Ce qu'on dit à l'IA pour qu'elle se retire — un geste, pas une question. */
const DISMISSALS = [
  /^(?:ferme|fermer|fermez)(?:[\s-]+(?:toi|la|ça|ca|cette|ta|les|tes))?(?:[\s-]+(?:fenêtre|fenetre|fenêtres|carte|cartes|bulle))?$/,
  /^(?:masque|masquer|cache|cacher|range|ranger)(?:[\s-]+(?:toi|la|ça|ca|ta|les|tes))?(?:[\s-]+(?:fenêtre|fenetre|carte|cartes))?$/,
  /^(?:c'est bon|ça ira|ca ira|ok)?[\s,]*merci(?:\s+beaucoup)?$/,
  /^(?:close|hide|dismiss)(?:\s+(?:it|that|the window|the card))?$/,
  /^(?:thanks|thank you)$/,
];

/**
 * « Alfred, ferme », « Alfred, merci » : on lui demande de se retirer. Reconnu
 * ICI, sans appel au modèle : le geste doit être immédiat — attendre deux
 * secondes une carte qui dit « je ferme » serait l'inverse du service rendu.
 * Volontairement étroit : une phrase entière qui ne dit que cela. Tout le
 * reste (« ferme le dossier Atlas ») va au modèle, qui sait aussi fermer.
 * @param {string} question - ce qui suit le mot d'appel
 */
export function isDismissal(question) {
  const said = String(question || '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[.!?…,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return said.length > 0 && said.length <= 40 && DISMISSALS.some((pattern) => pattern.test(said));
}

/** Ce sur quoi porte « agrandis » : la fenêtre de l'IA, ou son texte. */
const SIZE_OBJECT =
  "(?:[\\s-]+(?:toi|la|le|ta|ton|ça|ca|cette|l'|un peu|encore))*(?:[\\s-]*(?:fenêtre|fenetre|carte|texte|taille|affichage|police|écriture|ecriture))?(?:\\s+(?:un peu|encore|s'il te plaît|stp))?";
const SIZE_UP = new RegExp(
  `^(?:(?:agrandis|agrandir|agrandissez|grossis|grossir|zoome|zoomer|augmente|augmenter)${SIZE_OBJECT}|(?:écris|ecris|affiche)?\\s*(?:en\\s+)?plus (?:grand|gros)|bigger|larger|zoom in|make it bigger)$`,
);
const SIZE_DOWN = new RegExp(
  `^(?:(?:réduis|reduis|réduire|reduire|réduisez|rétrécis|retrecis|rapetisse|diminue|diminuer|dézoome|dezoome)${SIZE_OBJECT}|(?:écris|ecris|affiche)?\\s*(?:en\\s+)?plus petit|smaller|zoom out|make it smaller)$`,
);

/**
 * « Alfred, agrandis », « Alfred, plus petit » : on règle la taille de sa
 * fenêtre et de son texte. Reconnu ici, comme `isDismissal` et pour la même
 * raison — le geste doit être immédiat. Étroit lui aussi : une phrase qui ne
 * dit que cela ; « agrandis le périmètre du lot 2 » va au modèle.
 * @param {string} question - ce qui suit le mot d'appel
 * @returns {'up' | 'down' | null}
 */
export function sizeRequest(question) {
  const said = String(question || '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[.!?…,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!said || said.length > 48) return null;
  if (SIZE_UP.test(said)) return 'up';
  return SIZE_DOWN.test(said) ? 'down' : null;
}

/**
 * Où le mot d'appel se trouve dans un segment qu'il ouvre — de quoi l'écrire
 * autrement que le reste de la phrase.
 * @param {string} text
 * @param {string} wakeWord
 * @returns {{start: number, end: number} | null} null : il n'ouvre aucune phrase
 */
export function wakeWordSpan(text, wakeWord) {
  const call = findCall(text, wakeWord);
  return call && call.end > call.start ? { start: call.start, end: call.end } : null;
}
