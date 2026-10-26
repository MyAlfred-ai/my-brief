/**
 * Gabarits d'objet de mail et de nom de fichier — grammaire `{{clé}}`.
 *
 * Module PUR, et volontairement PAS une réutilisation d'`interpolateTemplate`
 * (src/config/templates.js) : celle-ci enchaîne des `.replace()` successifs,
 * donc RÉINTERPOLE — une valeur substituée qui contiendrait `{{date}}` serait à
 * son tour développée. Acceptable pour un prompt que l'utilisateur écrit pour
 * lui-même ; inacceptable pour un objet de mail alimenté par un titre de
 * réunion et envoyé à des tiers.
 *
 * Ici : une seule passe, allowlist stricte, valeurs assainies.
 */

/**
 * Variables admises. Liste FERMÉE, et SERVIE PAR L'API au frontend
 * (GET /api/actions/settings) : une seconde liste côté client divergerait au
 * premier ajout, exactement comme la palette des tags.
 */
export const ACTION_VARIABLES = [
  { key: 'titre', aliases: ['title'] },
  { key: 'date', aliases: [] },
  { key: 'type', aliases: ['kind'] },
  { key: 'compte', aliases: ['account'] },
];

export const SUBJECT_MAX = 200;
export const TEMPLATE_MAX = 200;

/** alias (et clé canonique) → clé canonique */
const CANON = new Map();
for (const { key, aliases } of ACTION_VARIABLES) {
  CANON.set(key, key);
  for (const alias of aliases) CANON.set(alias, key);
}

/**
 * Sans le drapeau `g`, `String.replace` ne remplacerait que la première
 * occurrence ; avec lui, `replace` reste une passe UNIQUE sur la source — le
 * texte de remplacement n'est jamais re-balayé. C'est exactement la propriété
 * qu'on cherche.
 */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** Retours à la ligne et caractères de contrôle, en échappements explicites. */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/** Marques diacritiques combinantes, laissées par la décomposition NFD. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Assainit une valeur avant substitution.
 *
 * Ce sont les VALEURS qu'on nettoie, pas le gabarit : c'est par elles qu'arrive
 * le contenu non maîtrisé (un titre de réunion dicté à la voix). Le retrait des
 * retours à la ligne est ce qui tue l'injection d'en-tête
 * (`Objet: X\r\nBcc: victime@…`). MailComposer encode déjà, et Graph met le
 * sujet dans du JSON — mais la défense en profondeur coûte une ligne.
 */
function sanitize(value) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Variables citées par un gabarit, connues et inconnues.
 *
 * Sert à REFUSER une saisie au moment de l'enregistrement plutôt qu'à la
 * découvrir au premier envoi : un `{{client}}` qui disparaît en silence de
 * l'objet d'un mail est un défaut qu'on ne remarque qu'une fois le mail parti.
 *
 * @returns {{known: string[], unknown: string[]}}
 */
export function listTemplateVariables(template) {
  const known = new Set();
  const unknown = new Set();
  for (const [, name] of String(template ?? '').matchAll(PLACEHOLDER_RE)) {
    const key = CANON.get(name.toLowerCase());
    if (key) known.add(key);
    else unknown.add(name);
  }
  return { known: [...known], unknown: [...unknown] };
}

/**
 * Développe un gabarit. Gabarit vide ⇒ chaîne vide : l'appelant retombe alors
 * sur sa valeur intégrée, il n'existe pas de gabarit « par défaut ».
 *
 * Une variable inconnue est RETIRÉE, pas laissée littérale — personne ne veut
 * lire `{{client}}` dans l'objet d'un mail arrivé chez un client.
 *
 * @param {string} template
 * @param {Record<string, string>} vars
 * @param {{max?: number}} [options]
 * @returns {string}
 */
export function renderActionTemplate(template, vars = {}, { max = SUBJECT_MAX } = {}) {
  const raw = String(template ?? '');
  if (!raw.trim()) return '';
  const rendered = raw.replace(PLACEHOLDER_RE, (_, name) => {
    const key = CANON.get(name.toLowerCase());
    return key ? sanitize(vars[key]) : '';
  });
  return sanitize(rendered).slice(0, max).trim();
}

/**
 * Réduit un fragment libre à un morceau de nom de fichier sûr.
 *
 * Règle identique à `slugifyTitle` de src/utils/filename.js. Le nom réel est
 * fabriqué côté navigateur (c'est lui qui produit les octets du PDF) ; le
 * serveur n'en fabrique un que pour le document factice du bouton « Tester ».
 * Les deux doivent produire le MÊME nom, sans quoi le test validerait une
 * convention que la vraie action n'applique pas.
 *
 * Le conteneur API ne copie que `server.js app.js lib routes` (cf. Dockerfile) :
 * il ne peut pas importer `src/`. La duplication est structurelle,
 * `src/utils/filenameTemplate.parity.test.js` en est le filet.
 */
export function slugifySegment(value, fallback = '') {
  return (
    String(value ?? '')
      .normalize('NFD')
      .replace(COMBINING_MARKS, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || fallback
  );
}

/**
 * Nom de fichier issu d'un gabarit, extension comprise.
 *
 * L'extension n'est JAMAIS gabaritable : elle est ajoutée après coup. Un
 * utilisateur qui écrirait `{{titre}}.exe` obtient `titre-exe.pdf`, ce qui est
 * exactement le résultat souhaité.
 *
 * Gabarit vide, ou ne laissant aucun caractère ⇒ `null` : l'appelant retombe
 * sur le nom intégré.
 *
 * @param {string} template
 * @param {Record<string, string>} vars
 * @param {{ext: string}} params
 * @returns {string|null}
 */
export function renderFilenameTemplate(template, vars = {}, { ext }) {
  const rendered = renderActionTemplate(template, vars, { max: TEMPLATE_MAX });
  const slug = slugifySegment(rendered);
  return slug ? `${slug}.${ext}` : null;
}
