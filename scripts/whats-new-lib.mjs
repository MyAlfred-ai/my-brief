/**
 * « Quoi de neuf ? » — de NOUVEAUTES.md, écrit à la main, au fichier publié.
 *
 * La popup affichait des SUJETS DE COMMIT, filtrés puis retouchés par SHA :
 * une ligne par commit, écrite pour des développeurs. Une même fonctionnalité
 * y tenait trois entrées, et dès que personne ne retouchait plus les textes,
 * « 320 px, overflow auto » arrivait sous les yeux des utilisateurs. Aucun
 * filtre ne sait faire ce qu'on attend d'une nouveauté : réunir cinq commits
 * en une phrase, et se taire quand rien ne change pour personne. D'où une
 * source rédigée (NOUVEAUTES.md, à la racine), sur le modèle de MIA.
 *
 * Trois règles portent la différence :
 *
 *  1. UNE ENTRÉE = UNE FONCTIONNALITÉ. Le commit qui complète une
 *     fonctionnalité déjà annoncée ENRICHIT son entrée au lieu d'en ajouter
 *     une. Le numéro de version, lui, avance à chaque commit : la liste ne
 *     bouge que lorsqu'un humain a quelque chose à dire.
 *  2. L'IDENTIFIANT EST ÉCRIT, STABLE À VIE. C'est lui qui date l'entrée
 *     (premier commit où il apparaît dans la source) et qui allume la
 *     pastille « non lu » : retoucher un texte ne rallume rien et ne fait
 *     pas remonter l'entrée devant celles de la veille.
 *  3. AUCUN « MAINTENANT ». Le hook post-commit amende le commit pour y
 *     glisser le fichier publié ; date et version viennent donc de
 *     l'historique git (la date d'auteur survit à l'amende), jamais de
 *     l'horloge — sinon chaque commit réécrirait la sortie du précédent.
 *
 * Ce module ne fait que des fonctions PURES (analyse, validation, datation,
 * mise en forme) : git et le disque vivent dans generate-whats-new.mjs.
 */

/** Source rédigée, relative à la racine du dépôt. */
export const SOURCE_PATH = 'NOUVEAUTES.md';

/** Entrées publiées : la popup en affiche dix, la source garde le reste. */
export const MAX_PUBLISHED = 10;

export const MAX_TITLE = 80;
export const MAX_BODY = 400;

/** Genre écrit dans la source → `kind` publié (lu par WhatsNewBadge). */
export const GENRES = { nouveaute: 'new', amelioration: 'improvement', correctif: 'fix' };

/**
 * Public → `audience` publiée. Il ne FILTRE rien : tout le monde voit toute la
 * liste, une nouveauté d'administration dit seulement à qui elle s'adresse.
 */
export const AUDIENCES = { tous: 'all', administrateurs: 'admins' };

const META_KEYS = ['id', 'genre', 'pour', 'date', 'version'];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,48}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VERSION_PATTERN = /^\d+(\.\d+)+$/;

// ─── Analyse ────────────────────────────────────────────────────────────────

/**
 * NOUVEAUTES.md → entrées, dans l'ordre du fichier (la plus récente en tête).
 *
 *     ## Titre
 *     <!-- id: slug | genre: nouveaute | pour: tous -->
 *
 *     Une à trois phrases.
 *
 *     ### en: English title        (facultatif)
 *
 *     English text.
 *
 * Tout ce qui précède le premier `## ` est le mode d'emploi du fichier. Les
 * blocs de code sont sautés : l'exemple du mode d'emploi n'est pas une entrée.
 *
 * @param {string} markdown
 * @returns {Array<{id:string, title:string, genre:string, pour:string, date:string, version:string, body:string, en:{title:string, body:string}|null}>}
 */
export function parseSource(markdown) {
  const entries = [];
  let current = null;
  let lines = [];
  let enLines = [];
  let inEnglish = false;
  let inFence = false;

  const close = () => {
    if (!current) return;
    current.body = cleanBody(lines);
    if (current.en) current.en.body = cleanBody(enLines);
    entries.push(current);
    current = null;
    lines = [];
    enLines = [];
    inEnglish = false;
  };

  for (const line of String(markdown || '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = /^##\s+(?!#)(.+?)\s*$/.exec(line);
    if (heading) {
      close();
      current = {
        id: '',
        title: heading[1],
        genre: 'nouveaute',
        pour: 'tous',
        date: '',
        version: '',
        body: '',
        en: null,
      };
      continue;
    }
    if (!current) continue;

    const meta = parseMeta(line);
    if (meta) {
      Object.assign(current, meta);
      continue;
    }

    const english = /^###\s+en\s*:\s*(.+?)\s*$/i.exec(line);
    if (english) {
      current.en = { title: english[1], body: '' };
      inEnglish = true;
      continue;
    }

    (inEnglish ? enLines : lines).push(line);
  }
  close();

  return entries;
}

/** `<!-- id: x | genre: y -->` → champs connus ; null pour toute autre ligne. */
function parseMeta(line) {
  const match = /^\s*<!--\s*(id\s*:.*?)\s*-->\s*$/i.exec(line);
  if (!match) return null;
  const fields = {};
  for (const part of match[1].split('|')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    if (META_KEYS.includes(key)) fields[key] = part.slice(colon + 1).trim();
  }
  return Object.keys(fields).length ? fields : null;
}

/**
 * Lignes brutes → prose : une ligne par paragraphe, paragraphes séparés par
 * une ligne vide (la popup les rend en `pre-line`). Un commentaire HTML sert à
 * l'outillage, jamais au lecteur.
 */
function cleanBody(lines) {
  return lines
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Ce qui casse en silence si personne ne regarde.
 *
 * `blocking` : l'entrée ne peut pas partir — sans identifiant unique la liste
 * keyée de la popup se désorganise, un genre inconnu n'a pas de pastille, une
 * entrée vide n'annonce rien. Le reste (longueur, traduction incomplète) part
 * quand même : bloquer une annonce pour trois mots de trop serait pire que de
 * la publier. Le test du dépôt, lui, refuse les deux.
 *
 * @returns {Array<{index:number, id:string, message:string, blocking:boolean}>}
 */
export function validateEntries(entries) {
  const errors = [];
  const seen = new Set();

  entries.forEach((entry, index) => {
    const ref = entry.title ? `« ${entry.title} »` : `entrée n° ${index + 1}`;
    const report = (message, blocking) =>
      errors.push({ index, id: entry.id, message: `${ref} : ${message}`, blocking });

    if (!entry.id) {
      report('identifiant manquant (<!-- id: … -->)', true);
    } else if (!ID_PATTERN.test(entry.id)) {
      report(`identifiant « ${entry.id} » invalide (minuscules, chiffres, tirets)`, true);
    } else if (seen.has(entry.id)) {
      report(`identifiant « ${entry.id} » déjà utilisé`, true);
    } else {
      seen.add(entry.id);
    }

    if (!entry.title.trim()) {
      report('titre vide', true);
    } else if (entry.title.length > MAX_TITLE) {
      report(`titre de plus de ${MAX_TITLE} caractères`, false);
    }

    if (!entry.body) {
      report("aucun texte — une nouveauté sans explication n'en est pas une", true);
    } else if (entry.body.length > MAX_BODY) {
      report(`texte de plus de ${MAX_BODY} caractères`, false);
    }

    if (!Object.hasOwn(GENRES, entry.genre)) {
      report(`genre « ${entry.genre} » inconnu (${Object.keys(GENRES).join(', ')})`, true);
    }
    if (!Object.hasOwn(AUDIENCES, entry.pour)) {
      report(`public « ${entry.pour} » inconnu (${Object.keys(AUDIENCES).join(', ')})`, true);
    }
    if (entry.date && !DATE_PATTERN.test(entry.date)) {
      report(`date « ${entry.date} » hors format AAAA-MM-JJ`, true);
    }
    if (entry.version && !VERSION_PATTERN.test(entry.version)) {
      report(`version « ${entry.version} » invalide`, true);
    }
    if (entry.en && (!entry.en.title || !entry.en.body)) {
      report('traduction anglaise incomplète (titre ET texte) — ignorée', false);
    }
  });

  return errors;
}

// ─── Datation ───────────────────────────────────────────────────────────────

/** Début de commit et séparateur de champs dans la sortie de BIRTH_LOG_ARGS
 *  (`%x1e` et `%x1f` du format git). */
export const COMMIT_MARK = '\x1e';
export const FIELD_SEP = '\x1f';

/**
 * Historique de la source, du plus ancien au plus récent, lignes AJOUTÉES
 * seulement : un seul processus git, quelle que soit la longueur de
 * l'historique (un `git show` par commit coûterait des secondes au hook).
 */
export const BIRTH_LOG_ARGS = [
  'log',
  '--reverse',
  '--date=short',
  '--format=%x1e%H%x1f%ad',
  '-p',
  '--unified=0',
  '--no-color',
  '--',
  SOURCE_PATH,
];

/**
 * Naissance de chaque identifiant : le premier commit, dans l'ordre du temps,
 * dont le diff AJOUTE sa ligne de métadonnées. Enrichir l'entrée plus tard ne
 * la re-date pas ; changer son identifiant, si.
 *
 * @param {string} raw sortie de `git <BIRTH_LOG_ARGS>`
 * @returns {Map<string, {sha:string, date:string}>}
 */
export function birthsFromLog(raw) {
  const births = new Map();
  for (const chunk of String(raw || '').split(COMMIT_MARK)) {
    const [header, ...patch] = chunk.split('\n');
    const [sha, date] = header.split(FIELD_SEP);
    if (!sha || !date) continue;
    for (const line of patch) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      const match = /<!--\s*id\s*:\s*([a-z0-9-]+)/i.exec(line);
      if (match && !births.has(match[1])) births.set(match[1], { sha, date: date.trim() });
    }
  }
  return births;
}

// ─── Publication ────────────────────────────────────────────────────────────

/**
 * Entrées publiables → contenu de src/whats-new.json. L'ordre du fichier fait
 * foi : trier ici sur la date ferait dériver la popup de ce que le rédacteur
 * voit dans sa source.
 *
 * `date` et `version` écrites à la main priment (entrées antérieures à la
 * source rédigée, toutes nées du même commit) ; sinon, celles du commit de
 * naissance. Une entrée pas encore commitée n'a ni l'une ni l'autre.
 *
 * @param {ReturnType<typeof parseSource>} entries
 * @param {Map<string, {sha:string, date:string}>} births
 * @param {(sha:string) => string|null} versionAt version applicative d'un commit
 */
export function buildPublished(entries, births = new Map(), versionAt = () => null) {
  const blocked = new Set(
    validateEntries(entries)
      .filter((error) => error.blocking)
      .map((error) => error.index),
  );

  return entries
    .filter((_, index) => !blocked.has(index))
    .slice(0, MAX_PUBLISHED)
    .map((entry) => {
      const birth = births.get(entry.id);
      const en = entry.en && entry.en.title && entry.en.body ? entry.en : null;
      return {
        id: entry.id,
        date: entry.date || birth?.date || '',
        version: entry.version || (birth ? versionAt(birth.sha) : '') || '',
        kind: GENRES[entry.genre],
        audience: AUDIENCES[entry.pour],
        title: entry.title,
        body: entry.body,
        ...(en ? { en: { title: en.title, body: en.body } } : {}),
      };
    });
}

/** Le fichier publié doit-il être réécrit ? (évite les diffs sans nouveauté) */
export function sameEntries(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
