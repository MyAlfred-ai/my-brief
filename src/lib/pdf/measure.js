/**
 * Lecture de la mise en page du résumé, telle que le navigateur l'a calculée.
 *
 * Le PDF était une capture html2canvas : une image JPEG par page (4,3 Mo pour
 * six pages mesurés le 2026-09-17), sans une lettre de texte — une IA qui
 * lisait le fichier devait passer par l'OCR. Le HTML et la feuille de style
 * n'ont pas changé : le navigateur met toujours la page en forme, et ce module
 * RELÈVE ce qu'il a posé — la position de chaque mot, filets et fonds, puces —
 * pour que draw.js l'écrive en vrai texte.
 *
 * Relever plutôt que recalculer : aucune règle de mise en page (marges,
 * justification, retraits de listes) n'est réimplémentée ici, la feuille de
 * style reste la seule source. La condition est que le navigateur mesure avec
 * la police que le PDF embarque (cf. fonts.js) ; sinon chaque mot serait posé
 * à sa place, mais avec une largeur qui n'est pas la sienne.
 *
 * Unités : pixels CSS, relatifs au coin haut gauche du conteneur.
 */
import {
  applyTextTransform,
  clustersOf,
  isEmojiCluster,
  markerText,
  onWhite,
  parseRgb,
  stripIgnorable,
  wordsOf,
} from './text.js';

/** Résolution des grappes rendues en image (emoji), relative au pixel CSS. */
const IMAGE_SCALE = 3;
/** Marge autour d'une grappe rendue en image : un emoji déborde de sa boîte. */
const IMAGE_PAD_EM = 0.3;
const MONOSPACE = /\bmono|^monospace$|courier|menlo|monaco|consolas/i;
const SAFE_URL = /^(?:https?:|mailto:|tel:)/i;

/**
 * Prépare le conteneur avant la mesure. Deux retouches, invisibles à l'écran :
 *
 * - les puces et numéros de liste deviennent de vrais éléments. Le marqueur
 *   `::marker` n'existe pas dans le DOM, sa position ne se mesure pas ; posé
 *   en absolu juste avant l'élément (`right: 100%`), il occupe la place du
 *   marqueur natif sans rien décaler ;
 * - le texte passe en NFC : un « é » décomposé (lettre + accent combinant)
 *   s'extrait mal, et deux glyphes dessinent moins bien qu'un.
 *
 * @param {HTMLElement} container
 */
export function prepareForMeasure(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const nfc = node.data.normalize('NFC');
    if (nfc !== node.data) node.data = nfc;
  }

  for (const li of container.querySelectorAll('li')) {
    const style = getComputedStyle(li);
    if (style.display !== 'list-item') continue;
    const text = markerText(style.listStyleType, ordinalOf(li));
    if (!text) continue;

    const marker = document.createElement('span');
    marker.setAttribute('data-pdf-marker', '');
    marker.textContent = text;
    marker.style.whiteSpace = 'pre';
    if (style.listStylePosition !== 'inside') {
      marker.style.position = 'absolute';
      marker.style.right = '100%';
      marker.style.top = '0';
      if (style.position === 'static') li.style.position = 'relative';
    }
    li.style.listStyleType = 'none';
    li.insertBefore(marker, li.firstChild);
  }
}

/** Rang d'un `<li>` : `start`, `value` et `reversed` compris. */
function ordinalOf(li) {
  const list = li.parentElement;
  const items = list ? Array.from(list.children).filter((el) => el.tagName === 'LI') : [li];
  const reversed = list?.tagName === 'OL' && list.hasAttribute('reversed');
  const step = reversed ? -1 : 1;
  const startAttr = list?.tagName === 'OL' ? parseInt(list.getAttribute('start'), 10) : NaN;
  let n = Number.isFinite(startAttr) ? startAttr : reversed ? items.length : 1;
  for (const item of items) {
    const value = parseInt(item.getAttribute('value'), 10);
    if (Number.isFinite(value)) n = value;
    if (item === li) return n;
    n += step;
  }
  return n;
}

/**
 * Relève la mise en page du conteneur.
 *
 * @param {HTMLElement} container - déjà préparé (prepareForMeasure)
 * @param {{hasGlyph: (font: object, codePoint: number) => boolean,
 *          width: (font: object, text: string, sizePx: number) => number}} metrics
 *   - ce que la police du PDF sait dessiner, et à quelle largeur (cf. fonts.js)
 * @returns {{width: number, items: object[]}}
 */
export function measureLayout(container, metrics) {
  const origin = container.getBoundingClientRect();
  const ctx = {
    container,
    origin,
    metrics,
    styles: new Map(),
    ascents: new Map(),
    colors: new Map(),
    images: new Map(),
    probe: null,
  };
  const items = [];
  try {
    collectBoxes(ctx, items);
    collectText(ctx, items);
    collectImages(ctx, items);
    collectKeeps(ctx, items);
  } finally {
    ctx.probe?.remove();
  }
  return { width: origin.width, items: mergeStrips(items) };
}

// ── Texte ────────────────────────────────────────────────────────────────────

function collectText(ctx, items) {
  const walker = document.createTreeWalker(ctx.container, NodeFilter.SHOW_TEXT);
  let previous = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!el || /^(?:SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
    const info = styleOf(el, ctx);
    if (!info.visible) continue;

    if (previous && /^\s/.test(node.data)) previous.spaceAfter = true;

    for (const word of wordsOf(node.data)) {
      const rects = liveRects(rangeOf(node, word.start, word.end));
      if (!rects.length) continue;
      const segments =
        rects.length === 1
          ? [{ start: word.start, end: word.end, rect: rects[0] }]
          : splitByLine(node, word.start, word.end);
      segments.forEach((segment, i) => {
        previous = emitSegment(node, segment, info, ctx, items);
        if (previous && i === segments.length - 1) previous.spaceAfter = word.spaceAfter;
      });
    }
  }
}

/**
 * Un mot coupé en fin de ligne (après un trait d'union, dans une URL) a
 * plusieurs rectangles : il est redécoupé en morceaux, un par ligne.
 */
function splitByLine(node, start, end) {
  const parts = [];
  for (const cluster of clustersOf(node.data.slice(start, end))) {
    const from = start + cluster.index;
    const to = from + cluster.text.length;
    const rect = liveRects(rangeOf(node, from, to))[0];
    if (!rect) continue;
    const last = parts[parts.length - 1];
    if (last && Math.abs(rect.top - last.rect.top) < rect.height / 2) {
      last.end = to;
      last.rect = unionRect(last.rect, rect);
    } else {
      parts.push({ start: from, end: to, rect });
    }
  }
  return parts;
}

/**
 * Écrit un morceau de mot : suites de grappes dessinables en texte, les autres
 * en image. Renvoie le dernier élément texte — celui qui recevra l'espace —
 * ou null si le morceau finit par une image.
 */
function emitSegment(node, segment, info, ctx, items) {
  const runs = [];
  for (const cluster of clustersOf(node.data.slice(segment.start, segment.end))) {
    const from = segment.start + cluster.index;
    const to = from + cluster.text.length;
    const emoji = isEmojiCluster(cluster.text);
    const text = emoji
      ? cluster.text
      : stripIgnorable(applyTextTransform(cluster.text, info.transform));
    if (!text) continue;
    const kind = !emoji && drawable(text, info.font, ctx.metrics) ? 'text' : 'image';
    const run = runs[runs.length - 1];
    if (run?.kind === kind) {
      run.end = to;
      run.text += text;
    } else {
      runs.push({ kind, start: from, end: to, text });
    }
  }

  let lastText = null;
  for (const run of runs) {
    const rect = runs.length === 1 ? segment.rect : liveRects(rangeOf(node, run.start, run.end))[0];
    if (!rect) continue;
    let kind = run.kind;
    let width = 0;
    if (kind === 'text') {
      width = ctx.metrics.width(info.font, run.text, info.sizePx);
      // Largeur mesurée ≠ largeur de la police embarquée : le navigateur a
      // pris une autre police pour au moins un glyphe (symbole qu'il préfère
      // en emoji, par exemple). L'image reproduit ce qu'il a affiché.
      if (Math.abs(rect.width - width) > 2 + width * 0.02) kind = 'image';
    }
    if (kind === 'image') {
      const text = applyTextTransform(node.data.slice(run.start, run.end), info.transform);
      const image = rasterize(text, info, rect, ctx);
      if (image) items.push(image);
      lastText = null;
      continue;
    }

    const top = rect.top - ctx.origin.top;
    const item = {
      kind: 'text',
      text: run.text,
      x: snappedLeft(rect, width) - ctx.origin.left,
      top,
      bottom: rect.bottom - ctx.origin.top,
      baseline: top + ascentOf(info, ctx),
      width,
      font: info.font,
      sizePx: info.sizePx,
      color: info.color,
      keepWithNext: info.heading,
      spaceAfter: false,
    };
    items.push(item);
    for (const line of info.decorations) items.push(decoration(item, line, info));
    if (info.href) {
      items.push({
        kind: 'link',
        url: info.href,
        x: item.x,
        top: item.top,
        bottom: item.bottom,
        width: item.width,
        owner: info.link,
        maxGap: info.sizePx,
      });
    }
    lastText = item;
  }
  return lastText;
}

function drawable(text, font, metrics) {
  for (const ch of text) {
    if (!metrics.hasGlyph(font, ch.codePointAt(0))) return false;
  }
  return true;
}

/**
 * Bord gauche d'un mot, corrigé de l'arrondi de WebKit.
 *
 * Chromium rend le rectangle exact d'une plage de texte. WebKit l'arrondit
 * parfois au pixel entier englobant (gauche vers le bas, droite vers le haut) :
 * mesuré le 2026-09-17, « et » à 14 px au lieu de 13,29. Reposé tel quel, le
 * mot recule jusqu'à un pixel et colle à la ponctuation qui le précède. La
 * largeur vraie étant connue (métriques de la police), la position vraie est
 * au milieu de l'intervalle compatible avec les deux arrondis.
 *
 * @param {{left: number, right: number, width: number}} rect
 * @param {number} width - largeur du mot dans la police embarquée
 */
export function snappedLeft(rect, width) {
  if (rect.width - width <= 0.25) return rect.left;
  const lo = Math.max(rect.left, rect.right - 1 - width);
  const hi = Math.min(rect.left + 1, rect.right - width);
  return lo <= hi ? (lo + hi) / 2 : rect.left;
}

// Position et épaisseur du trait, en em : `post` de DejaVu Sans
// (underlinePosition −130, underlineThickness 90, sur 2048).
const UNDERLINE_OFFSET_EM = 0.0635;
const LINE_THICKNESS_EM = 0.044;
const STRIKE_OFFSET_EM = 0.3;

function decoration(item, line, info) {
  const thickness = Math.max(1, info.sizePx * LINE_THICKNESS_EM);
  const top =
    line.kind === 'underline'
      ? item.baseline + Math.max(1, info.sizePx * UNDERLINE_OFFSET_EM)
      : line.kind === 'line-through'
        ? item.baseline - info.sizePx * STRIKE_OFFSET_EM
        : item.top;
  return {
    kind: 'rect',
    role: 'strip',
    x: item.x,
    top,
    bottom: top + thickness,
    width: item.width,
    color: line.color,
    owner: `${line.owner}:${line.kind}`,
    maxGap: info.sizePx,
  };
}

/**
 * Soulignés et liens sont relevés mot par mot ; le navigateur, lui, souligne
 * aussi les espaces entre les mots d'un même lien. Les morceaux d'un même
 * élément, sur une même ligne et séparés d'une espace au plus (justification
 * comprise : 1 em), sont recousus.
 */
function mergeStrips(items) {
  const out = [];
  const open = new Map();
  for (const item of items) {
    const strip = (item.kind === 'rect' && item.role === 'strip') || item.kind === 'link';
    if (!strip || item.owner === undefined) {
      out.push(item);
      continue;
    }
    const key = `${item.kind}|${item.owner}`;
    const last = open.get(key);
    const gap = last ? item.x - (last.x + last.width) : Infinity;
    if (last && Math.abs(last.top - item.top) < 0.5 && gap >= -0.5 && gap <= item.maxGap) {
      last.width = item.x + item.width - last.x;
    } else {
      const copy = { ...item };
      open.set(key, copy);
      out.push(copy);
    }
  }
  return out;
}

// ── Style ────────────────────────────────────────────────────────────────────

let ownerSeq = 0;

function styleOf(el, ctx) {
  let info = ctx.styles.get(el);
  if (info) return info;
  const cs = getComputedStyle(el);
  const bold = (parseInt(cs.fontWeight, 10) || 400) >= 600;
  const italic = /italic|oblique/.test(cs.fontStyle);
  const link = el.closest('a[href]');
  const href = link && ctx.container.contains(link) && SAFE_URL.test(link.href) ? link.href : null;
  info = {
    visible: cs.visibility === 'visible',
    font: {
      family: MONOSPACE.test(firstFamily(cs.fontFamily)) ? 'mono' : 'sans',
      style: bold ? (italic ? 'bolditalic' : 'bold') : italic ? 'italic' : 'normal',
    },
    sizePx: parseFloat(cs.fontSize) || 16,
    cssFont: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`,
    cssColor: cs.color,
    color: colorOf(cs.color, ctx),
    transform: cs.textTransform,
    heading: !!el.closest('h1, h2, h3, h4, h5, h6'),
    decorations: decorationsOf(el, ctx),
    href,
    link: href ? ownerIdOf(link) : undefined,
  };
  ctx.styles.set(el, info);
  return info;
}

const firstFamily = (list) =>
  (list || '')
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '');

const ownerIds = new WeakMap();
function ownerIdOf(el) {
  if (!ownerIds.has(el)) ownerIds.set(el, ++ownerSeq);
  return ownerIds.get(el);
}

/**
 * `text-decoration` ne s'hérite pas, il se propage : un mot est souligné si un
 * de ses ancêtres l'est. Couleur et trait sont ceux de l'ancêtre qui décore.
 */
function decorationsOf(el, ctx) {
  const lines = [];
  for (let node = el; node; node = node.parentElement) {
    const cs = getComputedStyle(node);
    const kinds = cs.textDecorationLine || cs.textDecoration || '';
    for (const kind of ['underline', 'line-through', 'overline']) {
      if (kinds.includes(kind)) {
        lines.push({
          kind,
          color: colorOf(cs.textDecorationColor || cs.color, ctx),
          owner: ownerIdOf(node),
        });
      }
    }
    if (node === ctx.container) break;
  }
  return lines;
}

/**
 * Couleur calculée → [r, g, b] opaque sur blanc. `rgb()` se lit directement ;
 * toute autre syntaxe (oklch, color(srgb …) d'un color-mix) est confiée à un
 * canvas, qui la convertit en sRGB.
 */
function colorOf(value, ctx) {
  if (ctx.colors.has(value)) return ctx.colors.get(value);
  let rgba = parseRgb(value);
  if (!rgba) {
    try {
      const c2d = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      c2d.fillStyle = value;
      c2d.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = c2d.getImageData(0, 0, 1, 1).data;
      rgba = [r, g, b, a / 255];
    } catch {
      rgba = [0, 0, 0, 1];
    }
  }
  const color = rgba[3] === 0 ? null : onWhite(rgba);
  ctx.colors.set(value, color);
  return color;
}

/**
 * Distance du haut de la boîte de texte à la ligne de base, pour une police
 * donnée. Mesurée plutôt que tirée des métriques : Chromium arrondit ascendante
 * et descendante au pixel, WebKit non (17 px contre 17,07 pour la même police).
 */
function ascentOf(info, ctx) {
  let ascent = ctx.ascents.get(info.cssFont);
  if (ascent !== undefined) return ascent;
  if (!ctx.probe) {
    ctx.probe = document.createElement('div');
    ctx.probe.style.cssText =
      'position:fixed;left:-10000px;top:0;white-space:nowrap;visibility:hidden;pointer-events:none';
    ctx.probe.innerHTML =
      '<span>Hg</span><i style="display:inline-block;width:0;height:0;vertical-align:baseline"></i>';
    ctx.container.parentNode.appendChild(ctx.probe);
  }
  ctx.probe.style.font = info.cssFont;
  const text = ctx.probe.firstChild.firstChild;
  const top = rangeOf(text, 0, text.length).getBoundingClientRect().top;
  ascent = ctx.probe.lastChild.getBoundingClientRect().bottom - top;
  ctx.ascents.set(info.cssFont, ascent);
  return ascent;
}

// ── Images ───────────────────────────────────────────────────────────────────

/**
 * Grappe que la police embarquée ne dessine pas → image PNG transparente,
 * rendue par le canvas avec la même police CSS, donc le même repli (emoji
 * couleur compris) que l'écran. Une image par grappe, style et couleur :
 * jsPDF réutilise l'objet d'une occurrence à l'autre.
 */
function rasterize(text, info, rect, ctx) {
  const key = JSON.stringify([text, info.cssFont, info.cssColor]);
  let image = ctx.images.get(key);
  if (!image) {
    const pad = Math.ceil(info.sizePx * IMAGE_PAD_EM);
    const width = rect.width + 2 * pad;
    const height = rect.height + 2 * pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * IMAGE_SCALE);
    canvas.height = Math.ceil(height * IMAGE_SCALE);
    const c2d = canvas.getContext('2d');
    if (!c2d) return null;
    c2d.scale(IMAGE_SCALE, IMAGE_SCALE);
    c2d.font = info.cssFont;
    c2d.fillStyle = info.cssColor;
    c2d.textBaseline = 'alphabetic';
    c2d.fillText(text, pad, pad + ascentOf(info, ctx));
    image = {
      data: canvas.toDataURL('image/png'),
      alias: `mb-glyph-${ctx.images.size}`,
      pad,
      width,
      height,
    };
    ctx.images.set(key, image);
  }
  const top = rect.top - ctx.origin.top;
  return {
    kind: 'image',
    data: image.data,
    format: 'PNG',
    alias: image.alias,
    x: rect.left - ctx.origin.left - image.pad,
    y: top - image.pad,
    width: image.width,
    height: image.height,
    // Pour la pagination, la boîte du texte : la marge ne compte pas.
    top,
    bottom: rect.bottom - ctx.origin.top,
    keepWithNext: info.heading,
  };
}

/**
 * `<img>` du résumé (rare : collage dans l'éditeur). Redessinée au plus au
 * double de sa taille affichée ; une image d'une autre origine, que le canvas
 * refuse d'exporter, est ignorée plutôt que de faire échouer le document.
 */
function collectImages(ctx, items) {
  for (const img of ctx.container.querySelectorAll('img')) {
    if (!img.complete || !img.naturalWidth) continue;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    try {
      const scale = Math.min(2, img.naturalWidth / rect.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      const c2d = canvas.getContext('2d');
      c2d.fillStyle = '#ffffff';
      c2d.fillRect(0, 0, canvas.width, canvas.height);
      c2d.drawImage(img, 0, 0, canvas.width, canvas.height);
      const top = rect.top - ctx.origin.top;
      items.push({
        kind: 'image',
        data: canvas.toDataURL('image/jpeg', 0.85),
        format: 'JPEG',
        alias: null,
        x: rect.left - ctx.origin.left,
        y: top,
        width: rect.width,
        height: rect.height,
        top,
        bottom: rect.bottom - ctx.origin.top,
      });
    } catch {
      // canvas « tainted » : image d'une autre origine sans CORS.
    }
  }
}

// ── Fonds et bordures ────────────────────────────────────────────────────────

const SIDES = ['Top', 'Right', 'Bottom', 'Left'];

/**
 * Fonds et bordures de chaque élément. Un filet horizontal fin (bordure haute
 * ou basse, `<hr>`) est une « règle » : la pagination le traite comme une
 * ligne, qui ne se coupe pas. Un fond ou une bordure verticale se découpe
 * d'une page à l'autre.
 */
function collectBoxes(ctx, items) {
  const { container, origin } = ctx;
  for (const el of [container, ...container.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility !== 'visible') continue;
    const background = colorOf(cs.backgroundColor, ctx);
    const paintsBackground =
      background && !(el === container && background.every((c) => c === 255));
    const borders = SIDES.map((side) => ({
      side,
      width: parseFloat(cs[`border${side}Width`]) || 0,
      color: /^(?:none|hidden)$/.test(cs[`border${side}Style`])
        ? null
        : colorOf(cs[`border${side}Color`], ctx),
    })).filter((b) => b.width > 0 && b.color);
    if (!paintsBackground && !borders.length) continue;

    for (const r of el.getClientRects()) {
      const box = {
        x: r.left - origin.left,
        top: r.top - origin.top,
        width: r.width,
        height: r.height,
      };
      if (paintsBackground) items.push(fill(box, background, 'fill'));
      for (const { side, width, color } of borders) {
        if (side === 'Top') items.push(fill({ ...box, height: width }, color, 'rule'));
        if (side === 'Bottom')
          items.push(
            fill({ ...box, top: box.top + box.height - width, height: width }, color, 'rule'),
          );
        if (side === 'Left') items.push(fill({ ...box, width }, color, 'fill'));
        if (side === 'Right')
          items.push(fill({ ...box, x: box.x + box.width - width, width }, color, 'fill'));
      }
    }
  }
}

/**
 * Blocs insécables : un élément marqué `data-pdf-keep` (un graphique, une
 * rangée d'indicateurs) devient un atome invisible de sa hauteur. La
 * pagination regroupe en une seule « ligne » tout ce qu'il recouvre : la
 * coupe passe avant ou après lui, jamais au travers — un histogramme tranché
 * en deux pages ne se lit plus. Sans couleur, il ne s'écrit pas dans le PDF.
 * Plus haut qu'une page, il occupe la sienne et déborde : à réserver aux
 * blocs courts.
 */
function collectKeeps(ctx, items) {
  const { container, origin } = ctx;
  for (const el of container.querySelectorAll('[data-pdf-keep]')) {
    const r = el.getBoundingClientRect();
    if (r.height <= 0) continue;
    items.push(
      fill(
        { x: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height },
        null,
        'keep',
      ),
    );
  }
}

const fill = (box, color, role) => ({
  kind: 'rect',
  role,
  x: box.x,
  top: box.top,
  bottom: box.top + box.height,
  width: box.width,
  color,
});

// ── DOM ──────────────────────────────────────────────────────────────────────

function rangeOf(node, start, end) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

const liveRects = (range) =>
  Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);

const unionRect = (a, b) => {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(a.right, b.right);
  const bottom = Math.max(a.bottom, b.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};
