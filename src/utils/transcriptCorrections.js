/**
 * Corrections automatiques de la transcription : la liste « ce que la
 * transcription écrit → ce qu'il faut écrire », réglée par un administrateur
 * (Administration → Configuration) et appliquée aux réunions de TOUS les
 * comptes.
 *
 * Un remplacement déterministe, pas une consigne au modèle : le vocabulaire de
 * l'organisation guide déjà le résumé, la relecture par les notes
 * (transcriptRefine.js) corrige déjà ce que l'utilisateur dicte — mais un nom
 * que le moteur écorche À CHAQUE RÉUNION (« Klobex » pour « Globex ») restait
 * faux dans la transcription affichée, exportée et archivée. Ici
 * l'administrateur dit exactement quoi remplacer : rien à deviner, rien à
 * facturer, et le même texte donne toujours le même résultat.
 *
 * Ce que l'écran promet, et que ce module tient :
 *  - mots ENTIERS seulement : « Paul » ne touche pas « Paulette » ;
 *  - majuscules et accents indifférents : « klobex », « KLOBEX », « Klobèx » ;
 *  - une espace du terme accepte espaces et trait d'union, une apostrophe
 *    droite ou courbe (« la dévé », « la-dévé », « l’ADV ») ;
 *  - UN seul passage, terme le plus long d'abord : jamais de correction en
 *    chaîne (A → B puis B → C) ;
 *  - ce qui est déjà juste ne bouge pas : avec « Alfred » → « Alfred Dupont »,
 *    « Alfred Dupont » prononcé en entier ne devient pas « Alfred Dupont
 *    Dupont ». Appliquer deux fois donne le même texte ;
 *  - en début de phrase, la majuscule est gardée (« la dévé » → « l'ADV »
 *    donne « L'ADV » en tête de phrase) — sauf graphie de marque à majuscule
 *    intérieure (« iPhone » reste « iPhone »).
 *
 * Appliquées à la CLÔTURE d'une ligne (transcriptLive.js), jamais aux deltas :
 * un delta peut couper un mot (« Klobex » puis « ol »), corriger au fil des
 * deltas écrirait « Globexol ».
 */
import { diffWordFlags, REFINE_FLASH_MS } from './transcriptRefine.js';

/**
 * Plafonds — les mêmes côté serveur (services/api/lib/transcriptCorrections.js).
 * 50 lignes : de quoi couvrir les noms propres d'une organisation, pas de quoi
 * réécrire la langue. La modération est aussi une affaire de plafond.
 */
export const CORRECTIONS_MAX = 50;
export const VARIANTS_MAX = 10;
export const TERM_MAX = 60;
export const REPLACEMENT_MAX = 80;
/** Longueur maximale du champ « ce que la transcription écrit » (variantes et virgules). */
export const FROM_FIELD_MAX = 400;

/**
 * Clé de comparaison : minuscules, sans accents, espaces et traits d'union
 * réduits à une espace, apostrophes unifiées. Deux termes de même clé sont le
 * même terme pour la correspondance — donc un doublon dans la liste.
 *
 * @param {unknown} s
 * @returns {string}
 */
export function foldKey(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[\u{2018}\u{2019}\u{02BC}`´]/gu, "'")
    .replace(/[\s\u{2010}\u{2011}-]+/gu, ' ')
    .trim();
}

const cleanTerm = (value, max) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Lettres et chiffres d'une clé : un terme sans au moins deux n'est pas un mot. */
const letterCount = (key) => (key.match(/[\p{L}\p{N}]/gu) || []).length;

/**
 * Liste servie par l'API (ou saisie) → liste sûre : termes nettoyés et bornés,
 * variantes en double retirées (la première l'emporte, sur toute la liste),
 * variante identique au mot juste retirée, ligne sans variante ni mot juste
 * écartée. Même règle que le serveur : ce que l'écran montre est ce qui
 * s'applique.
 *
 * @param {unknown} raw
 * @returns {Array<{from: string[], to: string}>}
 */
export function normalizeRules(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const rule of raw) {
    if (out.length >= CORRECTIONS_MAX) break;
    const to = cleanTerm(rule?.to, REPLACEMENT_MAX);
    if (!to) continue;
    const from = [];
    const variants = Array.isArray(rule?.from) ? rule.from : [rule?.from];
    for (const variant of variants) {
      if (from.length >= VARIANTS_MAX) break;
      const term = cleanTerm(variant, TERM_MAX);
      const key = foldKey(term);
      if (letterCount(key) < 2 || term === to || seen.has(key)) continue;
      seen.add(key);
      from.push(term);
    }
    if (from.length) out.push({ from, to });
  }
  return out;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lettres de base → toutes leurs formes accentuées (la casse, c'est le drapeau `i`). */
const ACCENTED = {
  a: 'aàáâãäåā',
  c: 'cç',
  e: 'eèéêëē',
  i: 'iìíîïī',
  n: 'nñ',
  o: 'oòóôõöō',
  u: 'uùúûüū',
  y: 'yýÿ',
};

/** Motif d'un terme : accents, espaces et apostrophes indifférents. */
function termPattern(term) {
  let out = '';
  for (const ch of foldKey(term)) {
    if (ch === ' ') out += '[\\s\\u{2010}\\u{2011}-]+';
    else if (ch === "'") out += "['\\u{2018}\\u{2019}\\u{02BC}]";
    else if (ACCENTED[ch]) out += `[${ACCENTED[ch]}]`;
    else out += escapeRegExp(ch);
  }
  return out;
}

// Mot entier : ni lettre ni chiffre de part et d'autre. Le bord gauche est
// CAPTURÉ plutôt que regardé en arrière — WebKit n'a les lookbehind que
// depuis iOS 16.4, et l'application mobile tourne dans sa vue web.
const BEFORE = '(^|[^\\p{L}\\p{N}_])';
const AFTER = '(?=$|[^\\p{L}\\p{N}_])';

/** Début de phrase : rien avant, ou une ponctuation finale puis des espaces. */
const SENTENCE_START = /(^|[.!?…]\s+)["«“(\s]*$/u;

/**
 * Majuscule de début de phrase transmise au remplacement, quand la
 * transcription l'avait mise et que le mot juste commence en minuscules
 * (« l'ADV » → « L'ADV »). Une graphie à majuscule intérieure dans son premier
 * mot (« iPhone », « eBay ») est une marque : laissée telle quelle.
 */
function matchCase(to, found, before) {
  const first = found.charAt(0);
  if (first === first.toLowerCase() || !SENTENCE_START.test(before)) return to;
  const head = to.split(/[\s'’]/u)[0];
  if (head !== head.toLowerCase()) return to;
  return to.charAt(0).toUpperCase() + to.slice(1);
}

/**
 * Compile une liste de corrections. Le résultat s'applique autant de fois
 * qu'on veut, sans recompiler.
 *
 * @param {unknown} rules - liste brute (normalisée ici)
 * @returns {{size: number, apply: (text: string) => string,
 *   parts: (text: string) => Array<{text: string, changed: boolean}>}}
 *   `parts` découpe le texte corrigé en morceaux inchangés / remplacés — pour
 *   le banc d'essai de l'administration, qui surligne ce qui change.
 */
export function compileCorrections(rules) {
  const list = normalizeRules(rules);
  const alts = list
    .flatMap((rule) => rule.from.map((term) => ({ term, to: rule.to })))
    .sort((a, b) => foldKey(b.term).length - foldKey(a.term).length);

  if (!alts.length) {
    const asIs = (text) => String(text ?? '');
    return {
      size: 0,
      apply: asIs,
      parts: (text) => (asIs(text) ? [{ text: asIs(text), changed: false }] : []),
    };
  }

  const finder = new RegExp(
    `${BEFORE}(?:${alts.map((a) => `(${termPattern(a.term)})`).join('|')})${AFTER}`,
    'giu',
  );
  // Ce qui est déjà juste : chaque mot juste, tel qu'écrit, et avec sa
  // majuscule de début de phrase. Sensible à la casse et aux accents — c'est
  // la graphie exacte qui protège, « globex » reste à corriger en « Globex ».
  const targets = [...new Set(list.flatMap((r) => [r.to, matchCase(r.to, 'X', '')]))].sort(
    (a, b) => b.length - a.length,
  );
  const guard = new RegExp(`${BEFORE}(${targets.map(escapeRegExp).join('|')})${AFTER}`, 'gu');

  function parts(input) {
    const raw = String(input ?? '');
    if (!raw) return [];
    const text = raw.normalize('NFC');
    const kept = [];
    for (const m of text.matchAll(guard)) {
      const start = m.index + m[1].length;
      kept.push([start, start + m[2].length]);
    }
    const out = [];
    let cursor = 0;
    for (const m of text.matchAll(finder)) {
      const k = m.slice(2).findIndex((g) => g !== undefined);
      if (k === -1) continue;
      const found = m[k + 2];
      const start = m.index + m[1].length;
      const end = start + found.length;
      if (kept.some(([s, e]) => start < e && end > s)) continue;
      if (start > cursor) out.push({ text: text.slice(cursor, start), changed: false });
      out.push({ text: matchCase(alts[k].to, found, text.slice(0, start)), changed: true });
      cursor = end;
    }
    if (!out.length) return [{ text: raw, changed: false }];
    if (cursor < text.length) out.push({ text: text.slice(cursor), changed: false });
    return out;
  }

  return {
    size: alts.length,
    parts,
    apply: (text) =>
      parts(text)
        .map((p) => p.text)
        .join(''),
  };
}

// ── Écran d'administration : lignes éditables ────────────────────────────

/**
 * Mots si courants qu'une correction les toucherait dans presque chaque
 * phrase. Pas une interdiction — un avertissement : « ca » → « CA » peut être
 * voulu, mais il faut le vouloir en sachant que « ça » deviendra « CA ».
 */
const COMMON_WORDS = new Set(
  (
    'le la les un une des de du et ou mais donc or ni car que qui quoi dont on il elle ils ' +
    'elles je tu nous vous me te se ce ca cela ceci est es sont suis etre avoir ai as avons ' +
    'avez ont ete fait faire dit dire va vais vont aller pour par sur sous dans en avec sans ' +
    'chez entre vers plus moins tres bien bon bonne oui non pas ne si tout tous toute toutes ' +
    'meme aussi alors comme quand au aux son sa ses mon ma mes ton ta tes notre nos votre vos ' +
    'leur leurs cette ces cet quel quelle la ici deja encore peut peu apres avant puis fois ' +
    'chose rien merci ok okay voila euh hein ben bah the an and or but of to in on at for ' +
    'with is are was were be been it this that these those you he she we they me him her us ' +
    'them my your his its our their not no yes do does did have has had will would can ' +
    'could should so if then than as by from up out about there here what which who when ' +
    'where how all any some'
  ).split(' '),
);

/** Terme court : au plus trois lettres — un vrai mot, ou un sigle, s'y cache vite. */
const SHORT_LETTERS = 3;

/** Variantes saisies dans un champ : séparées par des virgules. */
export function splitVariants(value) {
  return String(value ?? '')
    .split(/[,;\n]/)
    .map((v) => v.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

let rowSeq = 0;
/** Identifiant de ligne pour le `{#each}` keyé de l'écran — jamais envoyé. */
export function newRowId() {
  rowSeq += 1;
  return `tc-${Date.now().toString(36)}-${rowSeq}`;
}

/** Liste enregistrée → lignes de l'écran (variantes jointes par des virgules). */
export function rulesToRows(rules) {
  return normalizeRules(rules).map((r) => ({ id: newRowId(), from: r.from.join(', '), to: r.to }));
}

/** Lignes de l'écran → liste à enregistrer (lignes vides ignorées). */
export function rowsToRules(rows) {
  return normalizeRules(
    (Array.isArray(rows) ? rows : []).map((row) => ({
      from: splitVariants(row?.from),
      to: row?.to,
    })),
  );
}

/**
 * Empreinte de ce qui est SAISI, pour « modifications non enregistrées » : les
 * lignes non vides, variantes découpées. Plus fine que la liste nettoyée — une
 * ligne commencée mais incomplète (mot juste manquant) compte comme une
 * modification, sans quoi l'écran la laisserait en plan sans rien signaler.
 *
 * @param {Array<{from: string, to: string}>} rows
 * @returns {string}
 */
export function rowsKey(rows) {
  return JSON.stringify(
    (Array.isArray(rows) ? rows : [])
      .map((row) => [splitVariants(row?.from), String(row?.to ?? '').trim()])
      .filter(([from, to]) => from.length || to),
  );
}

/**
 * Diagnostic de chaque ligne de l'écran : au plus UN message, l'erreur avant
 * l'avertissement. Une erreur bloque l'enregistrement ; un avertissement
 * informe et laisse faire. Une ligne entièrement vide n'a rien à dire (elle
 * est ignorée à l'enregistrement).
 *
 * Erreurs : `missingFrom`, `missingTo`, `tooShort` (une lettre), `termTooLong`,
 * `tooManyVariants`, `sameAsTarget`, `duplicate` (déjà corrigé plus haut).
 * Avertissements : `common` (mot courant), `short` (trois lettres au plus).
 *
 * @param {Array<{from: string, to: string}>} rows
 * @returns {Array<{level: 'error'|'warn', code: string, term: string}|null>}
 */
export function checkRows(rows) {
  const seen = new Map();
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const variants = splitVariants(row?.from);
    const to = String(row?.to ?? '').trim();
    if (!variants.length && !to) return null;
    if (!variants.length) return { level: 'error', code: 'missingFrom', term: '' };
    if (variants.length > VARIANTS_MAX) {
      return { level: 'error', code: 'tooManyVariants', term: String(VARIANTS_MAX) };
    }
    let warning = null;
    let error = null;
    for (const term of variants) {
      const key = foldKey(term);
      const letters = letterCount(key);
      if (letters < 2) error ||= { level: 'error', code: 'tooShort', term };
      else if (term.length > TERM_MAX) error ||= { level: 'error', code: 'termTooLong', term };
      else if (to && term === to) error ||= { level: 'error', code: 'sameAsTarget', term };
      else if (seen.has(key)) error ||= { level: 'error', code: 'duplicate', term };
      else if (COMMON_WORDS.has(key)) warning ||= { level: 'warn', code: 'common', term };
      else if (letters <= SHORT_LETTERS) warning ||= { level: 'warn', code: 'short', term };
      if (!seen.has(key)) seen.set(key, true);
    }
    if (error) return error;
    if (!to) return { level: 'error', code: 'missingTo', term: '' };
    return warning;
  });
}

// ── Transcription en direct : montrer la correction ──────────────────────

/**
 * Les mots corrigés s'allument un instant, comme ceux de la relecture par les
 * notes (même marqueur `refineFlash`, même animation, jamais persisté) : la
 * correction se voit au moment où elle a lieu, au lieu de changer le texte
 * dans le dos de la personne qui lit.
 *
 * Les lignes sont retrouvées par RÉFÉRENCE dans l'historique courant, et le
 * marqueur retiré par estampille : une ligne qui a bougé entre-temps (écho,
 * insertion) garde le bon surlignage.
 *
 * @param {Array<{line: object, original: string}>} corrected - cf. transcriptLive.js
 * @param {(up: (history: Array) => Array) => void} update
 * @param {number} [ms]
 */
export function flashCorrections(corrected, update, ms = REFINE_FLASH_MS) {
  if (!Array.isArray(corrected) || !corrected.length) return;
  const at = Date.now();
  const marks = new Map();
  for (const { line, original } of corrected) {
    const tokens = diffWordFlags(original, line?.text);
    if (tokens.some((t) => t.changed)) marks.set(line, tokens);
  }
  if (!marks.size) return;
  update((history) =>
    history.map((it) =>
      marks.has(it) ? { ...it, refineFlash: { at, tokens: marks.get(it) } } : it,
    ),
  );
  setTimeout(() => {
    update((history) =>
      history.map((it) => {
        if (it?.refineFlash?.at !== at) return it;
        const { refineFlash, ...rest } = it;
        return rest;
      }),
    );
  }, ms);
}
