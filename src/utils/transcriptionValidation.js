// Liste des transcriptions à filtrer
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

/**
 * Détecte si un texte correspond à un pattern de sous-titre YouTube
 * @param {string} text - Le texte à vérifier
 * @returns {boolean} - True si c'est un pattern de sous-titre YouTube
 */
export function isYouTubeSubtitlePattern(text) {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();

  // Patterns de sous-titres YouTube (commencent souvent par – ou —)
  const subtitlePatterns = [
    /^[–—]\s*Sous-titrage/i,
    /^Sous-titrage/i,
    /Sous-titrage\s+[FR|EN|Réalisé|par]/i,
    /^[–—]\s*[A-Z]/,
    /Réalisé\s+par/i,
    /par\s+[A-Z]/i,
  ];

  // Vérifier si le texte correspond à un pattern de sous-titre
  if (subtitlePatterns.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

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
