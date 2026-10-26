/**
 * Pagimètre — mesure et vérification de la longueur du ✨ Résumé IA, en pages.
 *
 * ⚠️ JUMEAU de src/lib/pageMeter.js (le navigateur s'en sert pour la consigne
 * donnée au modèle et pour l'affichage) : même code pour tout ce qui mesure. Le
 * conteneur de l'API ne copie pas `src/` (cf. Dockerfile), l'image web exclut
 * `services/` : aucun des deux ne peut importer l'autre. Le filet est
 * src/lib/pageMeter.parity.test.js — une retouche se fait des deux côtés.
 *
 * Le serveur s'en sert pour VÉRIFIER : il mesure le résumé que le modèle a
 * rendu, et le fait reprendre s'il s'écarte de la longueur demandée (cf.
 * lib/pageTarget.js). Ce qu'est une page, et pourquoi on estime la mise en page
 * plutôt que de compter des mots : voir l'en-tête du jumeau.
 */

// ── Réglage ─────────────────────────────────────────────────────────────────

/**
 * Positions du curseur. Pas serrés en bas (¼ → 1 page : là où l'on hésite),
 * larges en haut : un pas d'un quart de page ne se voit plus à 8 pages.
 */
export const PAGE_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10];
export const MIN_PAGES = PAGE_STEPS[0];
export const MAX_PAGES = PAGE_STEPS[PAGE_STEPS.length - 1];

/**
 * Mots par page demandés au modèle. Médiane du banc (454) : un modèle qui
 * structure plus en puces tombe à +18 %, un modèle qui rédige en prose dense à
 * −12 % — dans la tolérance, et la vérification rattrape le reste.
 */
export const WORDS_PER_PAGE = 450;

/**
 * Part maximale de la transcription qu'un résumé fidèle peut atteindre. Au-delà,
 * il n'y a plus rien de vrai à écrire : dix pages demandées pour dix minutes de
 * réunion, ce serait du délayage ou de l'invention. Une heure de réunion
 * (~8 500 mots dits) plafonne ainsi vers 8 pages.
 */
export const MATERIAL_RATIO = 0.45;

/**
 * Tolérance de la vérification : au-delà de ±20 % de la cible, le serveur
 * reprend le résumé. En dessous d'une demi-page, un plancher absolu (±0,05
 * page, deux lignes) évite de reprendre un quart de page pour une ligne.
 */
export const TOLERANCE = 0.2;
const TOLERANCE_FLOOR = 0.05;

/**
 * Position valide la plus proche, ou null (absent, pas un nombre, hors
 * bornes). Le serveur ne fait confiance à aucune autre valeur.
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizePages(value) {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < MIN_PAGES - 1e-9 || n > MAX_PAGES + 1e-9) return null;
  let best = PAGE_STEPS[0];
  for (const step of PAGE_STEPS) if (Math.abs(step - n) < Math.abs(best - n)) best = step;
  return best;
}

/** Rang d'une position sur le curseur (0 = ¼ de page). */
export function stepIndex(pages) {
  const i = PAGE_STEPS.indexOf(normalizePages(pages));
  return i === -1 ? PAGE_STEPS.indexOf(1) : i;
}

/** Plus grande position du curseur qui ne dépasse pas `pages`. */
export function stepAtOrBelow(pages) {
  let out = MIN_PAGES;
  for (const step of PAGE_STEPS) if (step <= pages + 1e-9) out = step;
  return out;
}

// ── Matière disponible ──────────────────────────────────────────────────────

/**
 * Mots d'un texte, balises HTML retirées.
 * @param {string} text
 */
export function countWords(text) {
  const plain = String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
  const words = plain.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-.,%€$]*/gu);
  return words ? words.length : 0;
}

/** Mots que représente une longueur en pages (consigne donnée au modèle). */
export const wordsForPages = (pages) => Math.round(pages * WORDS_PER_PAGE);

/**
 * Pages que la matière de la réunion permet d'écrire sans délayer.
 * Transcription inconnue (0 mot) : pas de plafond.
 * @param {number} transcriptWords
 */
export function materialCapPages(transcriptWords) {
  if (!(transcriptWords > 0)) return MAX_PAGES;
  const cap = (transcriptWords * MATERIAL_RATIO) / WORDS_PER_PAGE;
  return Math.min(MAX_PAGES, Math.max(MIN_PAGES, cap));
}

/** Longueur réellement visée : la demande, bornée par la matière. */
export function effectivePages(requested, transcriptWords) {
  const pages = normalizePages(requested);
  if (pages === null) return null;
  return Math.min(pages, materialCapPages(transcriptWords));
}

/**
 * Le résultat est-il à la bonne longueur ?
 * @returns {'ok'|'short'|'long'}
 */
export function lengthVerdict(measured, target) {
  const slack = Math.max(target * TOLERANCE, TOLERANCE_FLOOR);
  if (measured < target - slack) return 'short';
  if (measured > target + slack) return 'long';
  return 'ok';
}

// ── Estimation de la mise en page ───────────────────────────────────────────

/** Hauteur utile d'une page, en px CSS de la bande mise en page (252 mm). */
const PAGE_PX = 1111.2;
/** Largeur de texte : bande de 210 mm moins le padding de 20 px de chaque côté. */
const TEXT_PX = 753.7;
/** Retrait d'une liste (padding-left 25 px), puis 20 px par niveau imbriqué. */
const LIST_INDENT = [25, 20];
/** Marge d'une liste : 10 px au premier niveau, 4 px imbriquée. */
const LIST_MARGIN = [10, 4];
/** Interligne 1,6 de la feuille du PDF. */
const LINE_HEIGHT = 1.6;
/**
 * Le texte d'une ligne n'occupe pas tout son interligne : le demi-interligne
 * au-dessus de la première ligne et sous la dernière n'est pas du contenu.
 */
const HALF_LEADING_PX = 6.5;
/** Perte moyenne à chaque saut de page (fin de page, titre reporté). */
const BREAK_WASTE_PX = 8;

const BODY_PX = 14.667; // 11 pt
/** Tailles et marges de .pdf-content (src/utils/pdf.js), en px CSS. */
const STYLES = {
  h1: { size: 20, mt: 20, mb: 10, bold: true },
  h2: { size: 17.333, mt: 15, mb: 8, bold: true },
  h3: { size: 16, mt: 12, mb: 6, bold: true },
  // h4-h6 : non stylés par la feuille du PDF, donc taille du texte, en gras,
  // sans marge (la remise à zéro globale de style.css).
  h4: { size: BODY_PX, mt: 0, mb: 0, bold: true },
  p: { size: BODY_PX, mt: 8, mb: 8, bold: false },
  li: { size: BODY_PX, mt: 3, mb: 3, bold: false },
};

/**
 * Chasse de DejaVu Sans Condensed, en millièmes d'em, relevée dans les fichiers
 * de police du PDF (src/lib/pdf/fonts/) : ASCII imprimable puis les lettres
 * accentuées et la ponctuation typographique des comptes rendus. Une moyenne
 * par caractère faisait rater une ligne sur treize (texte à chiffres et « % ») ;
 * la table les fait toutes tomber juste.
 */
const GLYPHS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~' +
  'àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ«»’‘“”–—…€°';
const REGULAR = [
  286, 360, 414, 754, 572, 855, 702, 247, 351, 351, 450, 754, 286, 325, 286, 303, 572, 572, 572,
  572, 572, 572, 572, 572, 572, 572, 303, 303, 754, 754, 754, 478, 900, 615, 617, 628, 693, 568,
  518, 697, 677, 265, 265, 590, 501, 776, 673, 708, 542, 708, 625, 571, 549, 659, 615, 890, 616,
  549, 616, 351, 303, 351, 754, 450, 450, 551, 571, 495, 571, 554, 316, 571, 570, 250, 250, 521,
  250, 876, 570, 550, 571, 571, 370, 469, 353, 570, 532, 736, 532, 532, 472, 572, 303, 572, 754,
  551, 551, 551, 495, 554, 554, 554, 554, 250, 250, 550, 550, 570, 570, 570, 532, 920, 883, 615,
  615, 615, 628, 568, 568, 568, 568, 265, 265, 708, 708, 659, 659, 659, 549, 962, 876, 550, 550,
  286, 286, 466, 466, 450, 900, 900, 572, 450,
];
const BOLD = [
  313, 410, 469, 754, 626, 901, 785, 275, 411, 411, 470, 754, 342, 374, 342, 329, 626, 626, 626,
  626, 626, 626, 626, 626, 626, 626, 360, 360, 754, 754, 754, 522, 900, 696, 686, 660, 747, 615,
  615, 738, 753, 334, 334, 697, 573, 896, 753, 765, 659, 765, 693, 648, 614, 730, 696, 993, 694,
  651, 652, 411, 329, 411, 754, 450, 450, 607, 644, 533, 644, 610, 391, 644, 641, 308, 308, 598,
  308, 938, 641, 618, 644, 644, 444, 536, 430, 641, 586, 831, 580, 586, 523, 641, 329, 641, 754,
  607, 607, 607, 533, 610, 610, 610, 610, 308, 308, 618, 618, 641, 641, 641, 586, 984, 943, 696,
  696, 696, 660, 615, 615, 615, 615, 334, 334, 765, 765, 730, 730, 730, 651, 1050, 976, 581, 581,
  342, 342, 591, 591, 450, 900, 900, 626, 450,
];
const WIDTHS = {
  regular: new Map([...GLYPHS].map((c, i) => [c, REGULAR[i] / 1000])),
  bold: new Map([...GLYPHS].map((c, i) => [c, BOLD[i] / 1000])),
};
/** Glyphe absent de la table (autre alphabet, symbole) : une lettre moyenne. */
const FALLBACK = { regular: 0.55, bold: 0.6 };
/** Un emoji est dessiné en image, un peu plus large qu'une capitale. */
const EMOJI_EM = 1.25;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const INVISIBLE_RE = /[\u{FE0E}\u{FE0F}\u{200B}-\u{200D}\u{2060}]/u;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/**
 * Découpe le HTML en blocs de texte : `{tag, depth, runs: [{text, bold}]}`.
 * Analyse volontairement sommaire — le HTML d'un résumé est celui d'un modèle
 * de langue (titres, paragraphes, listes, gras), jamais une page arbitraire.
 */
function parseBlocks(html) {
  const src = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, '');
  const blocks = [];
  let current = null;
  let depth = 0;
  let bold = 0;
  const open = (tag) => {
    current = { tag, depth, runs: [] };
    blocks.push(current);
  };
  const re = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>|([^<]+)/gi;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[3] !== undefined) {
      const text = decodeEntities(m[3]);
      if (!current) {
        if (!text.trim()) continue;
        open('p');
      }
      current.runs.push({ text, bold: bold > 0 || STYLES[current.tag].bold });
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      depth = closing ? Math.max(0, depth - 1) : depth + 1;
      current = null;
    } else if (/^h[1-6]$/.test(tag)) {
      if (closing) current = null;
      else open(/^h[456]$/.test(tag) ? 'h4' : tag);
    } else if (/^(p|li|div|blockquote|tr|pre|table)$/.test(tag)) {
      if (closing) current = null;
      else open(tag === 'li' ? 'li' : 'p');
    } else if (tag === 'br') {
      if (current) current.runs.push({ text: '\n', bold: false });
    } else if (tag === 'strong' || tag === 'b') {
      bold = Math.max(0, bold + (closing ? -1 : 1));
    }
  }
  return blocks.filter((b) => b.runs.some((r) => r.text.trim()));
}

function wordWidth(word, weight, sizePx) {
  let em = 0;
  for (const ch of word) {
    if (INVISIBLE_RE.test(ch)) continue;
    em += EMOJI_RE.test(ch) ? EMOJI_EM : (WIDTHS[weight].get(ch) ?? FALLBACK[weight]);
  }
  return em * sizePx;
}

/** Lignes d'un bloc : retour à la ligne glouton, comme le navigateur (sans césure). */
function lineCount(block) {
  const style = STYLES[block.tag];
  const indent = block.depth > 0 ? LIST_INDENT[0] + LIST_INDENT[1] * (block.depth - 1) : 0;
  const width = TEXT_PX - indent;
  let lines = 1;
  let x = 0;
  for (const run of block.runs) {
    const weight = run.bold ? 'bold' : 'regular';
    const space = (weight === 'bold' ? 0.313 : 0.286) * style.size;
    for (const part of run.text.split(/(\n)/)) {
      if (part === '\n') {
        lines++;
        x = 0;
        continue;
      }
      for (const word of part.split(/\s+/)) {
        if (!word) continue;
        const w = wordWidth(word, weight, style.size);
        const next = x === 0 ? w : x + space + w;
        if (next > width && x > 0) {
          lines++;
          x = w;
        } else {
          x = next;
        }
      }
    }
  }
  return lines;
}

/**
 * Pages qu'occupe un fragment HTML dans le PDF exporté — le fragment seul,
 * sans l'en-tête du PDF ni le reste du compte rendu.
 * @param {string} html
 * @returns {number}
 */
export function estimatePages(html) {
  const blocks = parseBlocks(html);
  if (!blocks.length) return 0;
  let height = -HALF_LEADING_PX;
  let prevBottom = 0;
  let prevDepth = 0;
  blocks.forEach((block, i) => {
    const style = STYLES[block.tag];
    let top = style.mt;
    let bottom = prevBottom;
    // Entrée dans une liste : sa marge fusionne avec celle du premier item ;
    // sortie : celle de la liste fusionne avec la marge du bloc suivant.
    if (block.depth > prevDepth) top = Math.max(top, LIST_MARGIN[Math.min(block.depth, 2) - 1]);
    if (block.depth < prevDepth) bottom = Math.max(bottom, LIST_MARGIN[Math.min(prevDepth, 2) - 1]);
    if (i > 0) height += Math.max(bottom, top);
    height += lineCount(block) * style.size * LINE_HEIGHT;
    prevBottom = style.mb;
    prevDepth = block.depth;
  });
  height = Math.max(0, height);
  return (height + Math.floor(height / PAGE_PX) * BREAK_WASTE_PX) / PAGE_PX;
}

// ── Découpe du compte rendu ─────────────────────────────────────────────────

/**
 * Isole le résumé principal dans le compte rendu rendu par le modèle, entre
 * les deux lignes de la mise en forme qui l'encadrent — recopiées mot pour mot
 * par le modèle, comme tout le scaffold. Le résumé lui-même peut contenir les
 * mêmes chaînes (`</ul>`, un titre repris) ; d'où deux règles qui ne le
 * regardent jamais :
 *   - `before` est la ligne qui précède le résumé, présente `beforeCount` fois
 *     avant lui dans la mise en forme : c'est sa n-ième occurrence qui compte,
 *     tout ce qui la précède est de la mise en forme recopiée ;
 *   - `after` est la ligne qui le suit, UNIQUE dans la fin de la mise en forme
 *     (cf. pageMeterAnchors, src/config/templates.js) : c'est sa DERNIÈRE
 *     occurrence, toute copie dans le résumé venant avant elle.
 * Ancre absente (null) : le résumé ouvre ou ferme le compte rendu. null en
 * retour quand une ancre est introuvable — le modèle a retouché la mise en
 * forme : ni mesure ni reprise, plutôt que de réécrire autre chose que le
 * résumé.
 *
 * @param {string} html
 * @param {{before?: string|null, beforeCount?: number, after?: string|null}} anchors
 * @returns {{head: string, body: string, tail: string}|null}
 */
export function splitAtAnchors(html, anchors) {
  const text = String(html || '');
  const before = anchors?.before || '';
  const after = anchors?.after || '';
  let start = 0;
  if (before) {
    const count = Math.max(1, Math.floor(anchors?.beforeCount) || 1);
    let at = -1;
    for (let i = 0; i < count; i++) {
      at = text.indexOf(before, at + 1);
      if (at === -1) return null;
    }
    start = at + before.length;
  }
  let end = text.length;
  if (after) {
    const at = text.lastIndexOf(after);
    if (at < start) return null;
    end = at;
  }
  return { head: text.slice(0, start), body: text.slice(start, end), tail: text.slice(end) };
}
