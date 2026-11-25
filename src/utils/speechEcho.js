/**
 * L'Aide IA s'entend-elle parler ? Quand elle lit à voix haute, le micro de
 * l'ordinateur l'entend aussi : sans précaution, sa phrase revient dans la
 * transcription, et l'IA la relit à la lecture suivante comme si quelqu'un de
 * la réunion l'avait dite — elle se répondrait à elle-même.
 *
 * L'annulation d'écho du navigateur (utils/audioConstraints.js) en retire
 * l'essentiel, au casque toujours, sur haut-parleurs souvent — pas toujours.
 * Ce qui en revient est reconnu ici, mot à mot : une ligne dont presque tous
 * les mots viennent d'une phrase qu'elle vient de dire est son écho.
 *
 * Écarté : taire le micro pendant qu'elle parle. Quelqu'un qui l'interrompt
 * serait perdu, et c'est précisément ce qu'on dit en lui coupant la parole qui
 * compte.
 */

/** En dessous, une ligne est trop courte pour qu'on la juge (« oui », « d'accord »). */
const MIN_WORDS = 3;
/** Part des mots de la ligne qui doivent venir de ce qu'elle a dit. */
const ECHO_SHARE = 0.7;

/** Les mots d'un texte, sans casse, accents ni ponctuation. */
export function wordsOf(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * @param {string} line - une ligne finalisée de la transcription
 * @param {string[]} spoken - ce que l'IA vient de dire
 * @returns {boolean}
 */
export function isEchoOf(line, spoken) {
  const words = wordsOf(line);
  if (words.length < MIN_WORDS || !spoken?.length) return false;
  return spoken.some((text) => {
    const said = new Set(wordsOf(text));
    if (!said.size) return false;
    const shared = words.filter((word) => said.has(word)).length;
    return shared / words.length >= ECHO_SHARE;
  });
}
