/**
 * Résolution d'une clé i18n en chemin pointé, avec substitution `{variable}`.
 *
 * Même règle que le `formatMessage` d'App.svelte, extraite pour les composants
 * qui affichent un message construit ailleurs — typiquement le résultat d'un
 * test d'action, qui renvoie une CLÉ et des variables plutôt qu'une phrase
 * (aucune chaîne affichable ne vient du serveur, cf. lib/errors.js).
 *
 * Chemin introuvable ⇒ on rend le chemin lui-même. C'est volontairement
 * visible : une clé manquante doit sauter aux yeux en recette, pas se traduire
 * par un espace vide en production.
 */
export function formatText(dict, path, replacements = {}) {
  const value = String(path)
    .split('.')
    .reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), dict);
  if (typeof value !== 'string') return path;
  return Object.entries(replacements).reduce(
    (text, [key, replacement]) => text.replace(`{${key}}`, replacement),
    value,
  );
}

/**
 * Remplit TOUTES les occurrences des `{clé}` d'un texte de uiText.js. Gabarit
 * absent ⇒ ''. La valeur est insérée telle quelle : une fonction de
 * remplacement, et non une chaîne, pour que `replaceAll` n'interprète pas les
 * `$&` ou `$1` d'un nom ou d'un libellé.
 *
 * @param {string|undefined} template
 * @param {Record<string, unknown>} [values]
 * @returns {string}
 */
export function fill(template, values = {}) {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, () => String(value)),
    String(template || ''),
  );
}
