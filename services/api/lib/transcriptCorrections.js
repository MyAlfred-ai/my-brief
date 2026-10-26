/**
 * Corrections automatiques de la transcription — la liste « ce que la
 * transcription écrit → ce qu'il faut écrire », réglée dans Administration →
 * Configuration et appliquée aux réunions de TOUS les comptes.
 *
 * Le serveur ne fait que la garder et la servir : la transcription en direct
 * ne passe jamais par lui (le navigateur parle à OpenAI), c'est donc le
 * navigateur qui applique (src/utils/transcriptCorrections.js). Ce module
 * garantit qu'il ne reçoit qu'une liste propre et bornée — mêmes plafonds,
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
 * @returns {Array<{from: string[], to: string}>}
 */
export function sanitizeTranscriptCorrections(raw) {
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
