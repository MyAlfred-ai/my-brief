/**
 * Nom de fichier d'un document exporté : `AAAA-MM-JJ-titre-en-slug.ext`.
 *
 * La date d'abord, pour que le tri alphabétique d'un dossier soit aussi le tri
 * chronologique — c'est ce qui rend un dossier de comptes rendus lisible, que
 * l'utilisateur les télécharge ou que myBrief les dépose sur son Drive.
 *
 * Extrait d'App.svelte, où la même règle servait au seul export de
 * transcription : le mail et le dépôt produisent désormais les mêmes noms.
 */

/**
 * Réduit un titre libre à un fragment de nom de fichier sûr.
 *
 * Les accents sont décomposés puis retirés (`é` → `e`) plutôt que remplacés :
 * les systèmes de fichiers et les API de Drive les acceptent, mais leur
 * normalisation diffère d'une plateforme à l'autre et deux fichiers d'apparence
 * identique finissent par cohabiter.
 *
 * @param {string} title
 * @param {string} [fallback] - utilisé si le titre ne laisse aucun caractère
 * @returns {string}
 */
export function slugifyTitle(title, fallback = 'document') {
  return (
    String(title || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || fallback
  );
}

/**
 * Partie date au format AAAA-MM-JJ, en heure LOCALE.
 *
 * Pas `toISOString()`, qui bascule en UTC : une réunion de 23 h à Paris
 * porterait la date du lendemain.
 *
 * @param {Date|string|number} [source] - date de la réunion ; aujourd'hui par défaut
 * @returns {string}
 */
export function fileDatePart(source) {
  const parsed = source instanceof Date ? source : new Date(source ?? Date.now());
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Nom complet d'un document exporté.
 *
 * @param {{title?: string, date?: Date|string|number, ext: string, fallback?: string}} params
 * @returns {string}
 */
export function documentFilename({ title, date, ext, fallback = 'document' }) {
  return `${fileDatePart(date)}-${slugifyTitle(title, fallback)}.${ext}`;
}

/**
 * Variables admises dans un gabarit — nom de fichier, et objet du brouillon de
 * mail (« Rédiger dans ma messagerie », que le serveur ne voit jamais).
 *
 * ⚠️ Réplique de `ACTION_VARIABLES` / `renderActionTemplate` de
 * services/api/lib/actions/templating.js. La duplication est STRUCTURELLE : le
 * conteneur de l'API ne copie que `server.js app.js lib routes` (cf. son
 * Dockerfile), il ne peut pas importer `src/`. Et le nom réel est fabriqué ici,
 * puisque c'est le navigateur qui produit les octets du PDF.
 *
 * `src/utils/filenameTemplate.parity.test.js` fait passer la même table de cas
 * dans les deux implémentations : c'est le filet de cette duplication.
 */
const TEMPLATE_ALIASES = {
  titre: 'titre',
  title: 'titre',
  date: 'date',
  type: 'type',
  kind: 'type',
  compte: 'compte',
  account: 'compte',
};

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/** Libellé de la variable `{{type}}`, dans la langue du document — comme `TYPE_LABEL` (resolve.js). */
export const DOCUMENT_TYPE_LABEL = {
  fr: { summary: 'Résumé', transcription: 'Transcription' },
  en: { summary: 'Summary', transcription: 'Transcript' },
};

function sanitizeValue(value) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Une seule passe : le texte substitué n'est jamais re-balayé, donc une valeur
 * contenant `{{date}}` n'est pas développée à son tour. Une variable inconnue
 * est retirée.
 */
const expand = (template, vars) =>
  template.replace(PLACEHOLDER_RE, (_, name) => {
    const key = TEMPLATE_ALIASES[name.toLowerCase()];
    return key ? sanitizeValue(vars[key]) : '';
  });

/**
 * Nom de fichier issu d'un gabarit, extension comprise. L'extension n'est
 * JAMAIS gabaritable — elle est ajoutée après.
 *
 * @param {string} template
 * @param {{titre?: string, date?: string, type?: string, compte?: string}} vars
 * @param {{ext: string}} params
 * @returns {string|null} null si le gabarit est vide ou ne laisse aucun caractère
 */
export function renderFilenameTemplate(template, vars = {}, { ext }) {
  const raw = String(template ?? '');
  if (!raw.trim()) return null;
  const slug = slugifyTitle(sanitizeValue(expand(raw, vars)).slice(0, 200), '');
  return slug ? `${slug}.${ext}` : null;
}

/**
 * Objet de mail issu d'un gabarit — réplique de `renderActionTemplate`.
 *
 * @param {string} template
 * @param {{titre?: string, date?: string, type?: string, compte?: string}} vars
 * @returns {string} vide si le gabarit est vide ou ne laisse rien : l'appelant
 *   retombe sur l'objet intégré
 */
export function renderSubjectTemplate(template, vars = {}) {
  const raw = String(template ?? '');
  if (!raw.trim()) return '';
  return sanitizeValue(expand(raw, vars)).slice(0, 200).trim();
}
