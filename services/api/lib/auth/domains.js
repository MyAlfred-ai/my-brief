/**
 * Domaines email autorisés à se connecter.
 *
 * Deux usages, décidés ensemble :
 *   1. filtrer les connexions Google — un email hors liste est refusé même si
 *      le compte Google est parfaitement valide ;
 *   2. déclencher la création automatique du compte — sans elle, la liste ne
 *      servirait qu'à refuser et l'admin devrait créer chaque compte à la main
 *      avant la première connexion.
 *
 * ⚠️ Une liste VIDE n'autorise personne à se créer un compte. C'est
 * volontaire : « vide = tout le monde » ouvrirait l'application à n'importe
 * quel compte Google de la planète dès l'activation. Les comptes déjà présents
 * en base, eux, continuent de se connecter — la liste ne régit que la création.
 */

/**
 * Accepte `myalfred.ai`, `@myalfred.ai`, `MyAlfred.AI`, `https://myalfred.ai`.
 * @returns {string} domaine normalisé, ou '' si inexploitable
 */
export function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');
}

/** @returns {string} partie domaine de l'email, en minuscules */
export function domainOf(email) {
  const at = String(email || '').lastIndexOf('@');
  return at < 0
    ? ''
    : String(email)
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

/**
 * @param {string[]} values
 * @returns {string[]} liste normalisée, dédoublonnée, sans entrée vide
 */
export function sanitizeDomainList(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  for (const value of values) {
    const domain = normalizeDomain(value);
    // Un domaine sans point (« localhost », « intranet ») ne peut pas être la
    // partie droite d'une adresse email publique : on l'écarte plutôt que de
    // laisser une entrée qui ne matchera jamais.
    if (domain && domain.includes('.')) seen.add(domain);
  }
  return [...seen].sort();
}

/**
 * @param {string} email
 * @param {string[]} allowedDomains
 * @returns {boolean} faux si la liste est vide (aucune création automatique)
 */
export function isDomainAllowed(email, allowedDomains) {
  const domain = domainOf(email);
  if (!domain || !Array.isArray(allowedDomains) || allowedDomains.length === 0) return false;
  return allowedDomains.some((allowed) => normalizeDomain(allowed) === domain);
}
