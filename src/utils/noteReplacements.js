/**
 * Ce qu'on RETIENT des remplacements écrits dans les notes d'une réunion.
 *
 * « Remplace Alexe par Alex » corrigeait la réunion en cours (relecture des
 * dernières phrases, compte rendu) — et il fallait le réécrire à la suivante.
 * Ces remplacements sont maintenant versés dans les « Mots remplacés » du
 * compte (stores/transcriptCorrections.js), qui s'appliquent d'office à toutes
 * ses réunions.
 *
 * ── Pourquoi tout n'est pas retenu ──────────────────────────────────────────
 * Dans une réunion, une consigne mal lue est sans conséquence : elle ne
 * s'applique que si le modèle fait exactement ce remplacement
 * (parseNoteDirectives). Ici elle devient une règle qui réécrit un mot dans
 * TOUTES les réunions à venir. Or des notes disent aussi « Remplacer Paul par
 * Marie sur le projet », « Budget → validé », « changer le planning en
 * fonction du budget » : aucune n'est une correction de graphie.
 *
 * Le critère est donc celui d'un mot mal transcrit : les deux côtés SE
 * PRONONCENT presque pareil (« Alexe » / « Alex », « Klobex » / « Globex »,
 * « la dévé » / « l'ADV »). C'est le seuil que la relecture applique déjà à ce
 * que le modèle corrige de lui-même (REFINE_SIMILARITY_MIN). Un remplacement
 * qui ne se ressemble pas à l'oreille (« Remplace Bob par Robert ») reste une
 * consigne de la réunion ; pour l'avoir partout, on l'ajoute à la main dans
 * les réglages. Mieux vaut ne pas retenir une vraie correction que réécrire
 * « Paul » en « Marie » pendant six mois.
 *
 * S'y ajoutent les garde-fous de l'écran d'administration (un mot courant, un
 * terme de moins de trois lettres ne se retiennent pas) et deux de bon sens :
 * pas un passage entier, pas deux textes qui ne diffèrent que par un nombre
 * (« lot 12 » / « lot 2 » se prononcent « pareil » pour la clé phonétique).
 */
import {
  noteDirectivePairs,
  phoneticSimilarity,
  REFINE_SIMILARITY_MIN,
} from './transcriptRefine.js';
import { foldKey, isCommonWord, REPLACEMENT_MAX, TERM_MAX } from './transcriptCorrections.js';

/** Au-delà, ce n'est plus un mot mal transcrit mais un passage. */
export const LEARN_FROM_WORDS_MAX = 4;
export const LEARN_TO_WORDS_MAX = 5;
/** En deçà, une écriture se confond avec un vrai mot (« al », « va », « on »). */
export const LEARN_MIN_LETTERS = 3;

/** Guillemets, puces et ponctuation de bord qu'une consigne traîne avec elle. */
const EDGE = '\\s«»"“”‘’\'`:·•*–—\\-';
const TRIM_EDGES = new RegExp(`^[${EDGE}(\\[]+|[${EDGE})\\]!?…]+$`, 'gu');
/** « Remplace partout Alexe par Alex », « le mot Alexe » : ce qui annonce le terme. */
const LEAD_IN =
  /^(?:(?:partout|toujours|everywhere|always)\s+)?(?:(?:le|les|the)\s+(?:mots?|noms?|termes?|words?|names?|terms?)\s+)?/iu;

function cleanSide(value) {
  return String(value ?? '')
    .replace(TRIM_EDGES, '')
    .replace(/\s+/g, ' ')
    .replace(LEAD_IN, '')
    .replace(TRIM_EDGES, '');
}

const letterCount = (text) => (foldKey(text).match(/[\p{L}\p{N}]/gu) || []).length;
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;
const digitsOf = (text) => (text.match(/\d+/g) || []).join(' ');

/**
 * Nom des lettres, pour épeler un sigle comme on le dit : la transcription
 * écrit « la dévé » ce que les notes écrivent « l'ADV ».
 */
const LETTER_NAMES = {
  a: 'a',
  b: 'bé',
  c: 'cé',
  d: 'dé',
  e: 'e',
  f: 'èf',
  g: 'gé',
  h: 'ach',
  i: 'i',
  j: 'ji',
  k: 'ka',
  l: 'èl',
  m: 'èm',
  n: 'èn',
  o: 'o',
  p: 'pé',
  q: 'ku',
  r: 'èr',
  s: 'ès',
  t: 'té',
  u: 'u',
  v: 'vé',
  w: 'doublevé',
  x: 'iks',
  y: 'igrec',
  z: 'zèd',
};

/**
 * Les sigles d'un texte (« ADV », « A.D.V. ») épelés ; le reste tel quel. Le
 * bord gauche est capturé plutôt que regardé en arrière : WebKit n'a les
 * lookbehind que depuis iOS 16.4 (cf. transcriptCorrections.js).
 */
function spellOut(text) {
  return text.replace(
    /(^|[^\p{L}\p{N}])((?:\p{Lu}\.?){2,6})(?![\p{L}\p{N}])/gu,
    (match, before, sigle) =>
      before +
      [...sigle.replace(/\./g, '').toLowerCase()].map((ch) => LETTER_NAMES[ch] || ch).join(''),
  );
}

/** Les deux côtés peuvent-ils être le même mot, entendu de travers ? */
export function soundAlike(from, to) {
  const best = Math.max(
    phoneticSimilarity(from, to),
    phoneticSimilarity(spellOut(from), spellOut(to)),
  );
  return best >= REFINE_SIMILARITY_MIN;
}

/**
 * Les remplacements des notes qui valent d'être retenus pour les réunions
 * suivantes — une écriture fautive par entrée, dans l'ordre des notes, sans
 * doublon.
 *
 * @param {string} notes
 * @returns {Array<{from: string, to: string}>}
 */
export function learnableReplacements(notes) {
  const out = [];
  const seen = new Set();
  for (const pair of noteDirectivePairs(notes)) {
    const from = cleanSide(pair.from);
    const to = cleanSide(pair.to);
    const key = foldKey(from);
    if (!from || !to || from === to || seen.has(key)) continue;
    if (from.length > TERM_MAX || to.length > REPLACEMENT_MAX) continue;
    if (letterCount(from) < LEARN_MIN_LETTERS || isCommonWord(from)) continue;
    if (wordCount(from) > LEARN_FROM_WORDS_MAX || wordCount(to) > LEARN_TO_WORDS_MAX) continue;
    if (digitsOf(from) !== digitsOf(to)) continue;
    if (!soundAlike(from, to)) continue;
    seen.add(key);
    out.push({ from, to });
  }
  return out;
}
