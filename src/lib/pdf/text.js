/**
 * Découpe du texte pour le PDF vectoriel du résumé — fonctions pures.
 *
 * Le PDF écrit chaque mot à la position que le navigateur lui a donnée
 * (cf. measure.js). Ce module décide de QUOI écrire : les mots d'un nœud
 * texte, les grappes qu'ils contiennent, et parmi elles celles que la police
 * embarquée ne sait pas dessiner.
 *
 * ── Pourquoi une grappe peut devenir une image ─────────────────────────────
 * jsPDF n'écrit que les glyphes de la police embarquée, et un caractère absent
 * ne s'efface pas en silence : `pdfEscape16` TRONQUE la chaîne au premier
 * glyphe manquant. Un emoji — les prompts en demandent en tête des titres —
 * ou une écriture hors du sous-ensemble de la police passe donc en petite
 * image, rendue par le navigateur avec sa propre police de repli : le rendu
 * reste celui de l'écran, seul le texte de cette grappe n'est pas extractible.
 */

// Grappe dessinée en emoji par le navigateur, quelle que soit la police
// demandée : présentation emoji par défaut, sélecteur U+FE0F, modificateur de
// teinte, drapeau (indicateurs régionaux), touche (U+20E3) ou séquence ZWJ.
// `Extended_Pictographic` seul ne suffit pas : ©, ™ ou ↔ en font partie et
// s'affichent en texte.
const EMOJI =
  /\p{Emoji_Presentation}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u{20E3}|\u{FE0F}|\p{Extended_Pictographic}\u{200D}/u;

// Invisibles sans glyphe : trait d'union conditionnel, espaces et liants de
// largeur nulle, marques et contrôles de direction, sélecteurs de variante.
// Ailleurs que dans un emoji, ils ne dessinent rien — mais jsPDF les
// traduirait en glyphe 0 et couperait le mot.
const IGNORABLE =
  /[\u{AD}\u{34F}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{FE00}-\u{FE0F}\u{FEFF}]/gu;

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

const JOINS_PREVIOUS =
  /^(?:\p{M}|\p{Emoji_Modifier}|[\u{200D}\u{FE0E}\u{FE0F}\u{20E3}]|[\u{E0020}-\u{E007F}])$/u;
const REGIONAL = /^\p{Regional_Indicator}$/u;

/**
 * Grappes (« caractères perçus ») d'une chaîne, avec leur position.
 *
 * `Intl.Segmenter` quand il existe ; sinon une approximation qui rattache
 * marques combinantes, sélecteurs, ZWJ et teintes à la grappe précédente, et
 * apparie les indicateurs régionaux — assez pour ne pas découper un emoji.
 *
 * @param {string} str
 * @returns {Array<{text: string, index: number}>}
 */
export function clustersOf(str) {
  if (segmenter)
    return Array.from(segmenter.segment(str), (s) => ({ text: s.segment, index: s.index }));
  const out = [];
  let index = 0;
  for (const ch of str) {
    const prev = out[out.length - 1];
    const glue =
      prev &&
      (JOINS_PREVIOUS.test(ch) ||
        prev.text.endsWith('\u{200D}') ||
        (REGIONAL.test(ch) && REGIONAL.test(prev.text)));
    if (glue) prev.text += ch;
    else out.push({ text: ch, index });
    index += ch.length;
  }
  return out;
}

/** @param {string} cluster */
export const isEmojiCluster = (cluster) => EMOJI.test(cluster);

/** @param {string} str */
export const stripIgnorable = (str) => str.replace(IGNORABLE, '');

/**
 * Mots d'un nœud texte : suites sans blanc, et le blanc qui les suit.
 *
 * L'espace n'est jamais dessiné — le navigateur a déjà placé le mot suivant,
 * justification comprise — mais il est ÉCRIT à la fin du mot : sans lui, un
 * outil d'extraction recolle « deuxmots ». Un blanc en tête de nœud revient au
 * dernier mot du nœud précédent (cf. measure.js).
 *
 * @param {string} data
 * @returns {Array<{start: number, end: number, spaceAfter: boolean}>}
 */
export function wordsOf(data) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(data))) {
    const end = m.index + m[0].length;
    out.push({ start: m.index, end, spaceAfter: end < data.length });
  }
  return out;
}

/**
 * `text-transform` appliqué comme le fait l'affichage : le DOM garde la casse
 * d'origine, le PDF doit porter celle qu'on voit.
 */
export function applyTextTransform(text, transform) {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') return text.replace(/^\p{L}/u, (c) => c.toUpperCase());
  return text;
}

// WinAnsi (Courier, police standard du PDF) : Latin-1 imprimable et les 27
// caractères de la plage 0x80–0x9F. Tout le reste passe en image.
const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/** @param {number} cp - point de code */
export const isWinAnsi = (cp) =>
  (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.has(cp);

const toAlpha = (n, base) => {
  let out = '';
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) {
    out = String.fromCharCode(base + ((v - 1) % 26)) + out;
  }
  return out || String(n);
};

const ROMAN = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];
const toRoman = (n) => {
  if (n <= 0 || n >= 4000) return String(n);
  let out = '';
  let v = n;
  for (const [value, digits] of ROMAN) {
    for (; v >= value; v -= value) out += digits;
  }
  return out;
};

/**
 * Texte du marqueur d'un élément de liste, tel que le navigateur l'écrit :
 * symbole ou numéro, suivi de son espace.
 *
 * @param {string} type - `list-style-type` calculé
 * @param {number} ordinal - rang de l'élément (listes numérotées)
 * @returns {string|null} null pour `none`
 */
export function markerText(type, ordinal) {
  switch (type) {
    case 'none':
      return null;
    case 'disc':
      return '• ';
    case 'circle':
      return '◦ ';
    case 'square':
      return '▪ ';
    case 'decimal-leading-zero':
      return `${ordinal >= 0 && ordinal < 10 ? '0' : ''}${ordinal}. `;
    case 'lower-alpha':
    case 'lower-latin':
      return `${toAlpha(ordinal, 97)}. `;
    case 'upper-alpha':
    case 'upper-latin':
      return `${toAlpha(ordinal, 65)}. `;
    case 'lower-roman':
      return `${toRoman(ordinal)}. `;
    case 'upper-roman':
      return `${toRoman(ordinal).toUpperCase()}. `;
    default:
      return `${ordinal}. `;
  }
}

/**
 * Couleur CSS calculée → [r, g, b, a] (0–255, alpha 0–1), ou null si la
 * syntaxe n'est pas `rgb()`/`rgba()`. `getComputedStyle` rend ces deux formes
 * pour les couleurs sRGB ; les autres (oklch, color(srgb …) d'un color-mix)
 * passent par le repli canvas de measure.js.
 *
 * @param {string} value
 * @returns {number[]|null}
 */
export function parseRgb(value) {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
    String(value || '').trim(),
  );
  if (!m) return null;
  let alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (m[4]?.endsWith('%')) alpha /= 100;
  return [+m[1], +m[2], +m[3], alpha];
}

/** Couleur translucide posée sur le blanc de la page → couleur opaque. */
export const onWhite = ([r, g, b, a = 1]) =>
  [r, g, b].map((c) => Math.round(c * a + 255 * (1 - a)));

/** Arguments de premier niveau d'une fonction CSS : les virgules hors parenthèses. */
function splitArgs(body) {
  const out = [''];
  let depth = 0;
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth < 0) return null;
    if (ch === ',' && depth === 0) out.push('');
    else out[out.length - 1] += ch;
  }
  return depth === 0 ? out.map((s) => s.trim()) : null;
}

const GRADIENT_AXES = { 'to right': 'x', '90deg': 'x', 'to bottom': 'y', '180deg': 'y' };

/**
 * `background-image` calculé → dégradé linéaire horizontal ou vertical, ou
 * null. Le PDF le peint en bandes fines (cf. draw.js) : seuls les deux axes
 * qu'emploie la feuille du PDF sont lus, et des arrêts `rgb()`/`rgba()` —
 * la forme que rend `getComputedStyle`. Tout le reste (angle oblique, image,
 * plusieurs couches) est ignoré : la décoration manque, le texte reste.
 *
 * @param {string} value
 * @returns {{axis: 'x'|'y', stops: Array<{at: number, color: number[]}>}|null}
 */
export function parseLinearGradient(value) {
  const m = /^linear-gradient\((.*)\)$/i.exec(String(value || '').trim());
  const args = m && splitArgs(m[1]);
  if (!args) return null;
  let axis = 'y';
  if (!/^rgba?\(/i.test(args[0])) {
    axis = GRADIENT_AXES[args.shift().toLowerCase().replace(/\s+/g, ' ')];
    if (!axis) return null;
  }
  const stops = [];
  for (const arg of args) {
    const stop = /^(rgba?\([^)]*\))(?:\s+(-?[\d.]+)%)?$/i.exec(arg);
    const color = stop && parseRgb(stop[1]);
    if (!color) return null;
    stops.push({ at: stop[2] === undefined ? null : Number(stop[2]) / 100, color: onWhite(color) });
  }
  if (stops.length < 2) return null;
  // Positions absentes : réparties entre leurs voisines connues, comme en CSS.
  stops[0].at ??= 0;
  stops[stops.length - 1].at ??= 1;
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].at !== null) continue;
    let j = i;
    while (stops[j].at === null) j++;
    const from = stops[i - 1].at;
    stops[i].at = from + (stops[j].at - from) / (j - i + 1);
  }
  return { axis, stops };
}

/**
 * Couleur du dégradé à la position `t` (0 → premier arrêt, 1 → dernier).
 *
 * @param {Array<{at: number, color: number[]}>} stops
 * @param {number} t
 * @returns {number[]} [r, g, b]
 */
export function colorAt(stops, t) {
  if (t <= stops[0].at) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (t <= b.at) {
      const k = b.at > a.at ? (t - a.at) / (b.at - a.at) : 1;
      return a.color.map((c, n) => Math.round(c + (b.color[n] - c) * k));
    }
  }
  return stops[stops.length - 1].color;
}
