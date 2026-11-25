/**
 * Corrections automatiques de la transcription — la liste « ce que la
 * transcription écrit → ce qu'il faut écrire ». Il y en a DEUX :
 *   - celle de l'organisation, réglée dans Administration → Configuration et
 *     appliquée aux réunions de TOUS les comptes (repositories/settings.js) ;
 *   - celle de chaque compte, « Mots remplacés » (Réglages → Pendant la réunion),
 *     qui ne vaut que pour ses réunions (repositories/userActions.js). Elle se
 *     remplit aussi toute seule : un remplacement écrit dans les notes d'une
 *     réunion (« Remplace Alexe par Alex ») y est versé par `learnCorrections`.
 *
 * Le serveur ne fait que les garder et les servir : la transcription en direct
 * ne passe jamais par lui (le navigateur parle à OpenAI), c'est donc le
 * navigateur qui applique (src/utils/transcriptCorrections.js). Ce module
 * garantit qu'il ne reçoit que des listes propres et bornées — mêmes plafonds,
 * même dédoublonnage que l'écran : ce qu'il affiche est ce qui s'applique.
 */

/**
 * 50 lignes, 10 variantes par ligne : de quoi couvrir les noms propres d'une
 * organisation, pas de quoi réécrire la langue. La modération que demande
 * l'écran est aussi tenue par ce plafond.
 */
export const CORRECTIONS_MAX = 50;
export const VARIANTS_MAX = 10;
export const TERM_MAX = 60;
export const REPLACEMENT_MAX = 80;

/**
 * Plafond de la liste d'un compte. Plus haut que celui de l'organisation :
 * elle se remplit d'elle-même, réunion après réunion, et ne touche que son
 * auteur. Pas plus haut : le moteur suivrait sans peine (mesures dans
 * src/utils/transcriptCorrections.js), c'est la liste qui ne se relirait
 * plus — et chaque ligne est un mot réécrit dans TOUTES les réunions à venir,
 * y compris là où il était juste. Au plafond, rien n'est évincé en silence :
 * le remplacement n'est pas retenu, et l'écran le dit.
 */
export const USER_CORRECTIONS_MAX = 100;

/** Clé de comparaison : casse, accents, espaces/traits d'union, apostrophes. */
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

const letterCount = (key) => (key.match(/[\p{L}\p{N}]/gu) || []).length;

/**
 * Liste reçue → liste sûre. Termes nettoyés et bornés ; une variante d'une
 * seule lettre, identique au mot juste ou déjà présente (casse et accents
 * confondus, sur toute la liste) est retirée ; une ligne sans variante ou sans
 * mot juste disparaît. Jamais d'erreur : l'écran a déjà dit ce qui n'allait
 * pas, et le schéma de la route refuse ce qui dépasse les plafonds.
 *
 * @param {unknown} raw
 * @param {number} [max] - plafond de lignes (celui de l'organisation par défaut)
 * @returns {Array<{from: string[], to: string}>}
 */
export function sanitizeTranscriptCorrections(raw, max = CORRECTIONS_MAX) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const rule of raw) {
    if (out.length >= max) break;
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

/**
 * « Mots remplacés » d'un compte, tels qu'ils sortent : la liste, et le choix
 * de la laisser se remplir depuis les notes. Seul un `false` EXPLICITE coupe
 * l'apprentissage — un compte sans document le vit allumé.
 *
 * @param {object|null|undefined} sub - sous-document `transcriptCorrections`
 * @returns {{rules: Array<{from: string[], to: string}>, learn: boolean}}
 */
export function readUserCorrections(sub) {
  return {
    rules: sanitizeTranscriptCorrections(sub?.rules, USER_CORRECTIONS_MAX),
    learn: sub?.learn !== false,
  };
}

/**
 * Verse des remplacements appris — écrits dans les notes d'une réunion — dans
 * la liste d'un compte. Ce que la fonction tient :
 *  - DÉJÀ PRÉSENT, rien ne bouge : la même écriture fautive mène déjà au même
 *    mot juste, chez le compte ou dans la liste de l'organisation (`shared`) ;
 *  - la même écriture fautive vers un AUTRE mot juste : la consigne la plus
 *    récente l'emporte, l'ancienne ligne perd cette variante (une écriture ne
 *    mène qu'à un mot) ;
 *  - la correction exactement inverse d'une ancienne (« Alex » → « Alexe »
 *    après « Alexe » → « Alex ») : l'ancienne tombe ;
 *  - un mot juste déjà connu accueille la nouvelle écriture comme VARIANTE de
 *    sa ligne — la liste ne s'allonge pas pour dire deux fois la même chose ;
 *  - au plafond, rien n'est évincé : le remplacement n'est pas retenu, et
 *    `full` le signale.
 *
 * @param {unknown} current - la liste du compte
 * @param {unknown} learned - `[{ from, to }]`, une écriture par entrée
 * @param {{max?: number, shared?: unknown}} [opts]
 * @returns {{rules: Array<{from: string[], to: string}>,
 *   added: Array<{from: string, to: string}>, full: boolean}}
 */
export function learnCorrections(
  current,
  learned,
  { max = USER_CORRECTIONS_MAX, shared = [] } = {},
) {
  let rules = sanitizeTranscriptCorrections(current, max);
  const sharedTargets = new Map();
  for (const rule of sanitizeTranscriptCorrections(shared)) {
    for (const term of rule.from) sharedTargets.set(foldKey(term), rule.to);
  }
  const added = [];
  let full = false;

  for (const pair of Array.isArray(learned) ? learned : []) {
    const from = cleanTerm(pair?.from, TERM_MAX);
    const to = cleanTerm(pair?.to, REPLACEMENT_MAX);
    const key = foldKey(from);
    if (!to || letterCount(key) < 2 || from === to) continue;

    const holder = rules.find((rule) => rule.from.some((term) => foldKey(term) === key));
    if (holder ? holder.to === to : sharedTargets.get(key) === to) continue;

    // L'écriture change de mot juste ; et la correction exactement INVERSE
    // (le mot juste d'aujourd'hui y était la faute, la faute le mot juste)
    // tombe — les deux ensemble s'annuleraient.
    const reverse = foldKey(to);
    const next = rules
      .map((rule) => {
        if (rule.to === to) return rule;
        const inverse = foldKey(rule.to) === key;
        return {
          to: rule.to,
          from: rule.from.filter((term) => {
            const termKey = foldKey(term);
            return termKey !== key && !(inverse && termKey === reverse);
          }),
        };
      })
      .filter((rule) => rule.from.length);
    const host = next.findIndex((rule) => rule.to === to && rule.from.length < VARIANTS_MAX);
    if (host === -1 && next.length >= max) {
      full = true;
      continue;
    }
    if (host === -1) next.push({ from: [from], to });
    else next[host] = { to, from: [...next[host].from, from] };
    rules = next;
    added.push({ from, to });
  }

  return { rules: sanitizeTranscriptCorrections(rules, max), added, full };
}
