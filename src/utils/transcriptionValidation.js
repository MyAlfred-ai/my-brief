/**
 * Filtre anti-hallucinations de la transcription.
 *
 * Sur un silence ou un bruit, un modèle de transcription « entend » ce qu'il a
 * le plus lu en fin de vidéo : une mention de sous-titrage (« Sous-titres
 * réalisés par la communauté d'Amara.org ») ou une formule d'au revoir.
 * isValidTranscription() les écarte, avec les hésitations et la ponctuation
 * seule. Deux appelants : chaque phrase finalisée du direct, et le texte ENTIER
 * d'une coupure hors ligne rattrapée (plusieurs phrases d'un coup).
 *
 * Une phrase écartée n'est ni affichée, ni lue par la détection d'actions ou
 * l'Aide IA, et rien ne le signale. D'où l'invariant : une mention de
 * sous-titrage se reconnaît à sa FORME — « Sous-titrage » / « Sous-titres » en
 * tête de phrase, suivi d'un crédit — ou à la signature d'un site, jamais à un
 * mot courant pris seul. Les anciens motifs « par + lettre », « réalisé par » et
 * « tiret en tête » écartaient « On commence par le budget. » et, avec elle,
 * toute coupure hors ligne où quelqu'un disait « par ».
 * transcriptionValidation.test.js garde les deux versants.
 */

// Transcriptions écartées telles quelles (égalité stricte, espaces de bord exclus)
export const listToDelete = [
  "Sous-titres réalisés para la communauté d'Amara.org",
  '– Sous-titrage par Lune –',
  '❤️ par SousTitreur.com',
  'Abonnez vous',
  'Abonnez-vous !',
  '— Sous-titrage Société Radio-Canada —',
  'Hmm',
  "Qu'est-ce que c'est que ce truc ?",
  '?',
  "Néanmoins, il n'y a pas eu de conséquences.",
  'Au revoir.',
  "Le scheme j'ai l'impression. Mimi ? L",
  "sous-titres réalisés par la communauté d'Amara.org",
  '– Sous-titrage FR –',
  'Au revoir, à bientôt.',
  'Merci. Merci à vous.',
  'À bientôt !',
  "J'avoue.",
  'Allez, allez, allez.',
  "– Sous-titrage Réalisé par Le Crayon d'oreille –",
  'Sous-titrage FR',
  "Sous-titrage Réalisé par Le Crayon d'oreille",
];

// Signature d'un site de sous-titrage : jamais dite en réunion.
const CREDIT_SITES = /amara\.org|sous-?titreur\.com/i;

// Le mot seul, cadre de tirets compris : « Sous-titrage », « – Sous-titres – ».
const BARE_CREDIT = /^[\s–—-]*sous[-\s]?titr(?:ages?|es?)[^\p{L}\p{N}]*$/iu;

// Le mot, où qu'il soit : sa place et sa suite décident (hasSubtitleCredit).
const SUBTITLE_WORD = /sous[-\s]?titr(?:ages?|es?)(?![a-zà-ÿ])/gi;

// Ce qui précède le mot quand il ouvre une phrase : rien ou une fin de phrase,
// puis d'éventuels tirets de cadre (« – Sous-titrage FR – »).
const OPENS_SENTENCE = /(?:^|[.!?…\n])[\s–—-]*$/;

/**
 * La suite d'un « Sous-titrage » de tête est-elle un crédit ? Oui si elle
 * NOMME (deux-points, nom propre, code : « FR », « ST' 501 », « Société
 * Radio-Canada ») ou si elle ATTRIBUE (« par » dans les quatre premiers mots :
 * « réalisés par », « en français par »). « Sous-titrage des vidéos, on en est
 * où ? » ne fait ni l'un ni l'autre.
 * @param {string} tail - La fin de la phrase, après le mot
 * @returns {boolean}
 */
function isCreditTail(tail) {
  if (/^\s*:/.test(tail) || /^[\s–—-]+\p{Lu}/u.test(tail)) return true;
  const firstWords = tail
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 4);
  return firstWords.includes('par');
}

/**
 * Le texte porte-t-il une mention de sous-titrage ? Le mot doit ouvrir une
 * phrase — ou porter la majuscule, pour une mention collée sans ponctuation à
 * ce qui précède (« À demain Sous-titrage FR ») — et être suivi d'un crédit.
 * « Le sous-titrage en direct est géré par l'IA » n'en est donc pas une.
 * @param {string} text - Le texte, espaces de bord retirés
 * @returns {boolean}
 */
function hasSubtitleCredit(text) {
  if (CREDIT_SITES.test(text) || BARE_CREDIT.test(text)) return true;
  for (const match of text.matchAll(SUBTITLE_WORD)) {
    const opensSentence =
      match[0].startsWith('S') || OPENS_SENTENCE.test(text.slice(0, match.index));
    const tail = text.slice(match.index + match[0].length).split(/[.!?…\n]/)[0];
    if (opensSentence && isCreditTail(tail)) return true;
  }
  return false;
}

/**
 * Détecte une hallucination de fin de vidéo : mention de sous-titrage ou
 * formule d'au revoir.
 * @param {string} text - Le texte à vérifier
 * @returns {boolean} - True si c'est une hallucination de ce genre
 */
export function isYouTubeSubtitlePattern(text) {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();

  if (hasSubtitleCredit(trimmed)) return true;

  // Phrases de fin de vidéo YouTube communes
  const endPhrases = [
    /^Au revoir[,\s]*à bientôt/i,
    /^Merci[,\s]*Merci à vous/i,
    /^À bientôt\s*!/i,
    /^J'avoue\.?$/i,
    /^Allez[,\s]*allez[,\s]*allez/i,
  ];

  if (endPhrases.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  return false;
}

/**
 * Valide une transcription avant de l'ajouter
 * @param {string} text - Le texte à valider
 * @returns {boolean} - True si la transcription est valide
 */
export function isValidTranscription(text) {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();

  // 1. Vérifier la liste noire exacte
  if (listToDelete.includes(trimmed)) return false;

  // 2. Vérifier les patterns de sous-titres YouTube
  if (isYouTubeSubtitlePattern(trimmed)) return false;

  // 3. Filtrer les transcriptions trop courtes (moins de 3 caractères)
  if (trimmed.length < 3) return false;

  // 4. Filtrer les transcriptions qui ne contiennent que des caractères non-alphanumériques
  const hasAlphanumeric = /[a-zA-Z0-9À-ÿ]/.test(trimmed);
  if (!hasAlphanumeric) return false;

  // 5. Filtrer les sons hésitants communs
  const hesitationPatterns = [
    /^[hH]+[mM]+$/,
    /^[eE]+[uU]+[hH]+$/,
    /^[aA]+[hH]+$/,
    /^[eE]+[rR]+$/,
    /^[uU]+[mM]+$/,
    /^[eE]+[hH]+$/,
    /^\?+$/,
    /^\.+$/,
    /^,+$/,
  ];

  if (hesitationPatterns.some((pattern) => pattern.test(trimmed))) {
    return false;
  }

  // 6. Filtrer les transcriptions qui ne contiennent que des ponctuations
  const onlyPunctuation = /^[^\w\sÀ-ÿ]+$/.test(trimmed);
  if (onlyPunctuation) return false;

  return true;
}
