/**
 * Échappements et normalisations de texte partagés : une seule définition,
 * sinon les copies divergent (celle du courriel n'échappait pas les guillemets).
 */

/** Neutralise les métacaractères d'une chaîne insérée dans une expression régulière. */
export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Texte inséré dans du HTML, en contenu comme en valeur d'attribut entre
 * guillemets doubles. `null`/`undefined` donnent une chaîne vide.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Code langue plausible (fr, en, pt-BR…) — sinon repli fr. Il est écrit tel
 * quel dans une consigne au modèle : rien d'autre qu'un code n'y passe.
 */
export function normalizeLang(raw) {
  const lang = String(raw || '').trim();
  return /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/i.test(lang) ? lang : 'fr';
}
