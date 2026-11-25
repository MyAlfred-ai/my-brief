/**
 * « Ça se prononce pareil » — rapprocher un nom ENTENDU d'un nom VOULU.
 *
 * Copie serveur de src/utils/soundsLike.js (le front et l'API n'ont aucun
 * module en commun) : la raison d'être, les seuils et leurs limites y sont
 * écrits. Ici elle sert à retrouver le tag ou le template qu'on a voulu nommer
 * (engine.js) et la fiche de myBrain dont le nom a été écorché
 * (brainSearch.js). Un test de parité (src/utils/soundsLike.test.js) tient les
 * deux copies ensemble : toute retouche se fait des deux côtés.
 */

/** Lettres et chiffres seuls, casse et accents pliés. */
export function plainLetters(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Ce qui s'entend d'un mot français écrit, en première approximation.
 * @param {string} word
 * @returns {string}
 */
export function phoneticKey(word) {
  return (
    plainLetters(word)
      .replace(/ph/g, 'f')
      .replace(/qu/g, 'k')
      .replace(/q/g, 'k')
      .replace(/ck/g, 'k')
      .replace(/c(?=[eiy])/g, 's')
      .replace(/c/g, 'k')
      .replace(/eau/g, 'o')
      .replace(/au/g, 'o')
      .replace(/ai|ei|ay|ey/g, 'e')
      .replace(/ou/g, 'u')
      .replace(/y/g, 'i')
      .replace(/z/g, 's')
      .replace(/w/g, 'v')
      .replace(/x/g, 'ks')
      .replace(/h/g, '')
      .replace(/(.)\1+/g, '$1')
      // Finales muettes : « Alfrède », « Alfret », « Alfreds » sonnent « Alfred ».
      .replace(/[es]+$/, '')
      .replace(/[tdxp]$/, '')
      .replace(/e+$/, '')
  );
}

/**
 * Distance de Damerau-Levenshtein (une transposition compte pour un), arrêtée
 * dès qu'elle dépasse `max` — les mots comparés sont courts, mais la fonction
 * tourne sur chaque phrase de la transcription.
 * @returns {number} la distance, ou `max + 1` si elle le dépasse
 */
export function editDistance(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = null;
  let current = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(current[j] + 1, next[j - 1] + 1, current[j - 1] + cost);
      if (previous && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, previous[j - 2] + 1);
      }
      next.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    previous = current;
    current = next;
  }
  return current[b.length];
}

/**
 * Le mot entendu peut-il être le mot voulu, à l'oreille ?
 * @param {string} heard - tel que la transcription l'écrit
 * @param {string} wanted - le mot attendu (mot d'appel, nom d'un tag…)
 */
export function soundsLike(heard, wanted) {
  const a = plainLetters(heard);
  const b = plainLetters(wanted);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length < 4) return false;
  if (phoneticKey(a) === phoneticKey(b)) return true;
  const budget = b.length >= 9 ? 2 : b.length >= 5 ? 1 : 0;
  // Jamais un mot PLUS LONG que le voulu : une lettre de plus qui s'entend fait
  // un autre mot (« Alfredo » n'est pas « Alfred ») ; celles qui ne s'entendent
  // pas (« Alfrède », « Halfred ») sont déjà passées par la clé phonétique.
  return budget > 0 && a.length <= b.length && editDistance(a, b, budget) <= budget;
}

/**
 * Le nom d'une liste que désigne un nom entendu : le même, sinon celui qui
 * sonne pareil — à condition qu'il soit SEUL à le faire. Deux candidats, et on
 * ne choisit pas : mieux vaut « je ne trouve pas ce tag » qu'un tag posé au
 * hasard.
 * @param {string[]} names
 * @param {string} heard
 * @returns {string|null}
 */
export function closestName(names, heard) {
  const list = (names || []).filter((name) => typeof name === 'string' && name.trim());
  const wanted = plainLetters(heard);
  if (!wanted) return null;
  const exact = list.find((name) => plainLetters(name) === wanted);
  if (exact) return exact;
  const close = list.filter((name) => soundsLike(heard, name));
  return close.length === 1 ? close[0] : null;
}
