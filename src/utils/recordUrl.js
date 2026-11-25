/**
 * URL de POST /api/record, avec la langue de l'interface (`lang`) : celle du
 * direct. Speechmatics la demande pour transcrire un fichier ; les autres
 * fournisseurs la détectent et ignorent le paramètre.
 *
 * Lue dans `localStorage` (`mybrief_language`, écrit par App.svelte à chaque
 * changement de langue, lu par store.js au démarrage) plutôt que dans le
 * store : importer store.js ici le chargerait dans les tests node, où
 * `localStorage` n'existe pas.
 *
 * @param {string} base - origine de l'API (`…/api`)
 * @param {Record<string, string>} [params] - autres paramètres (`source`)
 */
export function recordUrl(base, params = {}) {
  let lang = 'fr';
  try {
    lang = globalThis.localStorage?.getItem('mybrief_language') || 'fr';
  } catch (_) {}
  return `${base}/record?${new URLSearchParams({ ...params, lang })}`;
}
