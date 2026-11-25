/**
 * Recherche dans les réglages — le moteur, sans DOM ni store : une liste
 * d'entrées (config/settingsSearch.js la construit), une saisie, des
 * résultats classés.
 *
 * On cherche avec les mots qu'on a en tête, pas ceux de l'écran : « micro »
 * pour « Réglages audio », « couleur » pour « Marque & apparence »,
 * « clef openai » avec une faute de frappe. D'où :
 *   - accents, casse et ponctuation ignorés (« référence » = « reference ») ;
 *   - un mot tapé à moitié compte (« lang » trouve « Langue ») ;
 *   - une faute de frappe est tolérée à partir de quatre lettres — mais
 *     seulement pour un mot que rien ne contient tel quel : sinon « logo »
 *     ramenait « login », et « couleur » « couper » ;
 *   - les mots de liaison et les verbes de réglage (« changer la langue »,
 *     « où régler le micro ») ne comptent pas : ils ne disent pas QUOI.
 *
 * Classement : d'abord les entrées qui couvrent le plus de mots de la saisie
 * (une saisie de deux mots ne mêle pas des entrées qui n'en couvrent qu'un à
 * celles qui couvrent les deux), puis la QUALITÉ de chaque rencontre — le mot
 * exact avant le début de mot, avant la faute tolérée —, et à qualité égale,
 * le champ : titre, chemin, synonymes, libellés. « micro » trouve ainsi
 * « Audio » (synonyme exact) avant « Microsoft » (début de titre).
 *
 * Toutes les entrées passent à chaque frappe : une centaine, quelques
 * dizaines de mots chacune — le calcul tient sous la milliseconde, rien à
 * indexer de plus.
 */

/**
 * @typedef {object} SearchableEntry
 * @property {string} key       - identifiant unique (clé du {#each})
 * @property {string} title     - le titre de l'entrée, tel qu'à l'écran
 * @property {string[]} [path]  - le chemin pour y aller (rubrique, page, onglet)
 * @property {string[]} [keywords] - synonymes (uiText.settingsSearch.keywords)
 * @property {string[]} [terms] - libellés de l'écran (champs, interrupteurs)
 */

/** Poids d'un mot selon le champ où il est trouvé — départage à qualité égale. */
const FIELD_WEIGHTS = { title: 3, path: 2, keywords: 1.6, terms: 1.2 };

/** Qualité d'une rencontre : elle prime sur le champ (×10). */
const EXACT = 1;
const PREFIX = 0.8;
const INSIDE = 0.5;
const TYPO = 0.6;
const TYPO_PREFIX = 0.4;

/**
 * Mots qui ne disent pas QUOI : articles, prépositions, et les verbes avec
 * lesquels on cherche un réglage (« changer », « set »). Ignorés tant qu'il
 * reste un autre mot dans la saisie — « activer » seul reste cherché.
 */
const STOPWORDS = new Set(
  [
    // français
    'a au aux avec ce ces cet cette comment d de des du en et je la le les l mes mon ma',
    'ne ou par pas pour qu que qui sa se ses son sur ta te tes ton un une y',
    'changer modifier regler configurer parametrer definir mettre trouver est',
    // anglais
    'an and are can change configure do edit find for how i in is my of on set the to',
    'where which with',
  ]
    .join(' ')
    .split(' '),
);

/**
 * Forme comparable d'un texte : minuscules, sans accents ni ponctuation,
 * espaces simples.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeSearchText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Les mots d'une saisie, sans ceux qui ne disent pas QUOI — sauf s'il ne
 * reste qu'eux.
 *
 * @param {string} query
 * @returns {string[]}
 */
export function searchTokens(query) {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  const meaningful = words.filter((word) => !STOPWORDS.has(word));
  return [...new Set(meaningful.length ? meaningful : words)];
}

/**
 * Distance d'édition (insertion, suppression, substitution, inversion de deux
 * lettres voisines) — bornée : au-delà de `max`, on s'arrête.
 */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (prevPrev && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

/** Rencontre exacte, en début de mot ou dans le mot ; 0 sinon. */
function strictMatch(token, word) {
  if (word === token) return EXACT;
  if (word.startsWith(token)) return PREFIX;
  if (token.length >= 4 && word.includes(token)) return INSIDE;
  return 0;
}

/** Rencontre à une faute près (deux à partir de sept lettres) ; 0 sinon. */
function typoMatch(token, word) {
  if (token.length < 4) return 0;
  const tolerance = token.length >= 7 ? 2 : 1;
  if (editDistance(token, word, tolerance) <= tolerance) return TYPO;
  // Mot en cours de frappe, avec une faute : « micorph » pour « microphone ».
  if (
    token.length >= 5 &&
    word.length > token.length &&
    editDistance(token, word.slice(0, token.length), 1) <= 1
  ) {
    return TYPO_PREFIX;
  }
  return 0;
}

/** Mots d'une entrée, par champ, mis en forme une fois pour toutes. */
function prepare(entry) {
  const split = (texts) => [
    ...new Set(texts.flatMap((text) => normalizeSearchText(text).split(' ')).filter(Boolean)),
  ];
  return {
    entry,
    // Le titre sans ses mots vides : « Mes templates » répond à « templates »
    // comme « Templates ».
    titleKey: searchTokens(entry.title).join(' '),
    fields: {
      title: split([entry.title]),
      path: split(entry.path || []),
      keywords: split(entry.keywords || []),
      terms: split(entry.terms || []),
    },
  };
}

/** Meilleure rencontre d'un mot de la saisie dans l'entrée : qualité × 10 + champ. */
function tokenScore(token, prepared, match) {
  let best = 0;
  for (const [field, words] of Object.entries(prepared.fields)) {
    const weight = FIELD_WEIGHTS[field];
    for (const word of words) {
      const quality = match(token, word);
      if (quality) best = Math.max(best, quality * 10 + weight);
    }
  }
  return best;
}

/**
 * Prépare une liste d'entrées pour searchSettings() — à refaire quand la
 * liste ou la langue change, pas à chaque frappe.
 *
 * @template {SearchableEntry} T
 * @param {T[]} entries
 */
export function prepareSearchIndex(entries) {
  return entries.map(prepare);
}

/**
 * Les entrées qui répondent à `query`, les meilleures d'abord.
 *
 * @template {SearchableEntry} T
 * @param {ReturnType<typeof prepareSearchIndex>} index
 * @param {string} query
 * @param {{limit?: number, boost?: (entry: T) => number}} [options] - `boost` :
 *   points ajoutés à une entrée trouvée, pour départager — « Mes templates »
 *   avant les « Templates » de l'administration quand on cherche depuis
 *   « Réglages ».
 * @returns {T[]}
 */
export function searchSettings(index, query, { limit = 12, boost = () => 0 } = {}) {
  const tokens = searchTokens(query);
  if (!tokens.length) return [];
  const phrase = tokens.join(' ');

  // Les fautes ne sont tolérées que pour un mot que rien ne contient tel quel.
  const scores = index.map((prepared) => tokens.map((t) => tokenScore(t, prepared, strictMatch)));
  tokens.forEach((token, i) => {
    if (scores.some((row) => row[i] > 0)) return;
    index.forEach((prepared, e) => {
      scores[e][i] = tokenScore(token, prepared, typoMatch);
    });
  });

  const scored = [];
  index.forEach((prepared, order) => {
    const values = scores[order].filter((value) => value > 0);
    if (!values.length) return;
    let score = values.reduce((sum, value) => sum + value, 0);
    // La saisie entière est le titre, ou l'ouvre : « mot de passe »,
    // « mot de p ». Un début de mot seulement (« micro » → « Microsoft »)
    // compte à peine.
    const title = prepared.titleKey;
    if (title === phrase) score += 3;
    else if (title.startsWith(`${phrase} `)) score += 2;
    else if (title.startsWith(phrase)) score += 0.5;
    score += boost(prepared.entry);
    scored.push({
      entry: prepared.entry,
      covered: values.length,
      score,
      order,
      length: prepared.entry.title.length,
    });
  });
  if (!scored.length) return [];
  const bestCover = Math.max(...scored.map((s) => s.covered));
  return scored
    .filter((s) => s.covered === bestCover)
    .sort((a, b) => b.score - a.score || a.length - b.length || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.entry);
}
