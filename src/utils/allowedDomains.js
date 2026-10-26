/**
 * Saisie des domaines autorisés (Administration → Authentification).
 *
 * Miroir client de services/api/lib/auth/domains.js, qui fait autorité : le
 * serveur renormalise et dédoublonne tout ce qu'il reçoit. Ici, il s'agit
 * seulement de ne pas afficher un doublon évident, et de savoir si une saisie
 * est un domaine.
 */

/** Accepte `exemple.fr`, `@exemple.fr`, `Exemple.FR`, `https://exemple.fr/…`. */
export function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');
}

/**
 * Liste après ajout d'une saisie.
 * @param {string[]} domains
 * @param {string} value - saisie brute
 * @returns {string[]|null} `null` si la saisie n'est pas un domaine ; la MÊME
 *   liste s'il y figure déjà ; sinon une nouvelle liste, triée
 */
export function withDomain(domains, value) {
  const domain = normalizeDomain(value);
  // Sans point, ce n'est pas la partie droite d'une adresse : le serveur l'écarterait.
  if (!domain.includes('.')) return null;
  if (domains.includes(domain)) return domains;
  return [...domains, domain].sort();
}
