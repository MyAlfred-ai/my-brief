/**
 * Recherche ÉLARGIE dans myBrain pour une question de l'Aide IA.
 *
 * ── Pourquoi « elle trouve très peu » ──────────────────────────────────────
 * Jusqu'ici une question valait UN appel à `/contexte`, et — seulement s'il ne
 * rendait aucune fiche — UNE recherche par mots-clés dont on lisait les deux
 * premières fiches. Or, relu dans le code de myBrain le 2026-11-13 :
 *   - `/recherche` est un plein texte SQLite (FTS5) : chaque mot est cherché en
 *     PRÉFIXE, casse et accents pliés, et TOUS les mots doivent y être. Aucune
 *     tolérance aux fautes : « market » ne trouve pas Marquet, et un seul mot
 *     écorché dans une requête de trois mots ne rend rien du tout ;
 *   - `/contexte` épingle les fiches NOMMÉES dans la question par égalité
 *     stricte, puis complète par plein texte et voisinage sémantique : un nom
 *     mal transcrit n'épingle rien ;
 *   - `/fiche?nom=` tolère une lettre d'écart, mais sa réponse « introuvable »
 *     ne liste pas la fiche qu'il jugeait probable — ses candidats sont donc
 *     souvent vides là où il en avait une.
 * Une question dictée, dont le moteur a écorché un nom propre, tombait dans
 * les trois trous à la fois.
 *
 * ── Ce que fait ce module ──────────────────────────────────────────────────
 * Il reçoit les NOMS sur lesquels porte la question — avec leurs graphies
 * plausibles à l'oreille, préparées par le modèle (prompts.js,
 * `searchPlanPrompt`) — et des sujets. Pour chaque nom, en parallèle :
 *   1. la fiche qui porte ce nom (`/fiche?nom=`) et ses candidats ;
 *   2. le plein texte sur ce nom seul — jamais mêlé à d'autres mots, puisque
 *      tous devraient y être ;
 *   3. si aucun TITRE ne lui ressemble : le plein texte sur ses trois premières
 *      lettres. Le préfixe ignore la fin du mot, là où sont la plupart des
 *      fautes ; on ne garde que les fiches dont le titre SONNE comme le nom
 *      (soundsLike.js). C'est ce qui rapproche « Market » de Marquet.
 * Puis les sujets, en plein texte. Les fiches sont classées — une fiche
 * désignée par son nom passe devant une fiche qui le cite — et les meilleures
 * sont lues.
 *
 * Écarté : la route `/mcp` de myBrain, qui sait lister tous les noms de fiches
 * (le rapprochement se ferait alors entièrement ici). C'est un second
 * protocole à tenir, et deux mille noms à relire pour chaque question.
 *
 * Coût : 2 à 3 lectures par nom, 6 noms au plus, une par sujet — myBrain ne
 * limite ces routes que par adresse (300 par minute). Une lecture qui échoue
 * n'arrête rien : la recherche rend ce qu'elle a.
 */
import { plainLetters, soundsLike } from './soundsLike.js';

export const BRAIN_NAMES_MAX = 6;
export const BRAIN_TOPICS_MAX = 3;
/** Fiches lues en plus de ce que le contexte de myBrain a rendu. */
export const BRAIN_EXTRA_SHEETS = 4;
const PREFIX_LETTERS = 3;
const PREFIX_HITS = 20;
const NAME_HITS = 6;
const TOPIC_HITS = 5;

/** Ce que vaut une fiche trouvée, selon la façon dont elle l'a été. */
const SCORE = { named: 100, candidate: 60, titled: 60, sounded: 50, cited: 20, topic: 10 };

const wordsOf = (text) =>
  String(text || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Le titre d'une fiche désigne-t-il ce nom — tel quel, ou à l'oreille ?
 * @param {string} title
 * @param {string} name - le nom cherché, tel qu'entendu
 */
export function titleMatches(title, name) {
  const wanted = plainLetters(name);
  if (!wanted) return false;
  const whole = plainLetters(title);
  if (!whole) return false;
  if (whole === wanted || soundsLike(name, title)) return true;
  const titleWords = wordsOf(title);
  const nameWords = wordsOf(name);
  // Chaque mot du nom se retrouve, à l'oreille, dans un mot du titre :
  // « Market » ↔ « Marquet SAS », « projet arbre » ↔ « Projet AMBRE ».
  return (
    nameWords.length > 0 &&
    nameWords.every((heard) =>
      titleWords.some((word) => soundsLike(heard, word) || soundsLike(word, heard)),
    )
  );
}

/** Le mot le plus long d'un nom : celui qui le distingue (« Comité de PILOTAGE »). */
const mainWord = (name) =>
  wordsOf(name).reduce((best, word) => (word.length > best.length ? word : best), '');

/**
 * @param {object} deps
 * @param {(query: string, limit: number) => Promise<{path: string, title: string}[]>} deps.search
 * @param {(name: string) => Promise<{path: string, title: string, content: string}>} deps.sheetByName -
 *   lève une erreur portant `candidates` quand le nom ne désigne pas de fiche
 * @param {(path: string) => Promise<{path: string, title: string, content: string}>} deps.readSheet
 * @param {(err: Error) => boolean} deps.isBrainFailure - panne de myBrain : avalée
 * @param {string[]} deps.names - noms cherchés, graphies voisines comprises
 * @param {string[]} [deps.topics] - sujets, pour le plein texte
 * @param {Iterable<string>} [deps.known] - chemins que le contexte a déjà rendus
 * @param {number} [deps.max] - fiches à lire
 * @returns {Promise<{sheets: {path: string, title: string, content: string}[],
 *   matched: {heard: string, title: string}[]}>} `matched` : un nom entendu, et
 *   le titre de la fiche qu'il désigne quand ils ne s'écrivent pas pareil
 */
export async function searchBrain({
  search,
  sheetByName,
  readSheet,
  isBrainFailure,
  names = [],
  topics = [],
  known = [],
  max = BRAIN_EXTRA_SHEETS,
}) {
  /** chemin → { path, title, score, content?, heard? } */
  const found = new Map();
  const note = (hit, score, heard = '') => {
    if (!hit?.path) return;
    const entry = found.get(hit.path) || { path: hit.path, title: hit.title || '', score: 0 };
    entry.score += score;
    if (!entry.title && hit.title) entry.title = hit.title;
    if (hit.content) entry.content = hit.content;
    if (heard && !entry.heard) entry.heard = heard;
    found.set(hit.path, entry);
  };
  /** Une lecture qui échoue chez myBrain ne rend rien, sans arrêter les autres. */
  const quiet = async (work, fallback) => {
    try {
      return await work();
    } catch (err) {
      if (!isBrainFailure(err)) throw err;
      return typeof fallback === 'function' ? fallback(err) : fallback;
    }
  };

  const seen = new Set();
  const distinct = (list, limit) =>
    list
      .map((value) =>
        String(value || '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((value) => {
        const key = plainLetters(value);
        if (key.length < 2 || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);

  async function lookUp(name) {
    const [direct, hits] = await Promise.all([
      quiet(
        async () => ({ sheet: await sheetByName(name), candidates: [] }),
        (err) => ({ sheet: null, candidates: Array.isArray(err.candidates) ? err.candidates : [] }),
      ),
      quiet(() => search(name, NAME_HITS), []),
    ]);
    let titled = false;
    if (direct.sheet) {
      titled = true;
      note(direct.sheet, SCORE.named, name);
    }
    for (const candidate of direct.candidates) {
      if (!titleMatches(candidate.title, name)) continue;
      titled = true;
      note(candidate, SCORE.candidate, name);
    }
    hits.forEach((hit, rank) => {
      if (titleMatches(hit.title, name)) {
        titled = true;
        note(hit, SCORE.titled - rank, name);
      } else note(hit, SCORE.cited - rank);
    });
    if (titled) return;
    // Aucun titre ne ressemble au nom : il est sans doute mal écrit. Le
    // préfixe rattrape une faute en fin de mot — là où elles sont le plus souvent.
    const stem = plainLetters(mainWord(name));
    if (stem.length <= PREFIX_LETTERS) return;
    const near = await quiet(() => search(stem.slice(0, PREFIX_LETTERS), PREFIX_HITS), []);
    near.forEach((hit, rank) => {
      if (titleMatches(hit.title, name)) note(hit, SCORE.sounded - rank, name);
    });
  }

  await Promise.all([
    ...distinct(names, BRAIN_NAMES_MAX).map(lookUp),
    ...distinct(topics, BRAIN_TOPICS_MAX).map(async (topic) => {
      const hits = await quiet(() => search(topic, TOPIC_HITS), []);
      hits.forEach((hit, rank) => note(hit, SCORE.topic - rank));
    }),
  ]);

  const skip = new Set(known);
  const best = [...found.values()]
    .filter((entry) => !skip.has(entry.path))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  const read = await Promise.all(
    best.map((entry) =>
      entry.content
        ? entry
        : quiet(async () => ({ ...entry, ...(await readSheet(entry.path)) }), null),
    ),
  );
  const sheets = read
    .filter((sheet) => sheet && typeof sheet.content === 'string' && sheet.content.trim())
    .map((sheet) => ({ path: sheet.path, title: sheet.title, content: sheet.content }));
  const matched = read
    .filter((sheet) => sheet?.heard && plainLetters(sheet.heard) !== plainLetters(sheet.title))
    .map((sheet) => ({ heard: sheet.heard, title: sheet.title }));
  return { sheets, matched };
}
