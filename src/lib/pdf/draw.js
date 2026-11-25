/**
 * Écriture du PDF à partir de la mise en page relevée (cf. measure.js).
 *
 * Géométrie inchangée depuis la version image : A4 portrait, marges de 15 mm,
 * 15 mm réservés au pied de page, et la bande de 210 mm de large mise en page
 * par le navigateur ramenée aux 180 mm utiles. Seule la nature du contenu
 * change : du texte, des filets et de rares images, au lieu d'une photo par
 * page.
 */
import { lineGroups, pageIndexOf, paginate, slicesOf } from './paginate.js';
import { pdfFontName } from './fonts.js';
import { colorAt } from './text.js';

export const PAGE = { width: 210, height: 297, margin: 15, footer: 15 };

const PT_PER_MM = 72 / 25.4;

/**
 * Écart toléré, en pixels CSS, entre la position d'un mot et celle qu'il
 * aurait collé au précédent (cf. textRuns). Un demi-pixel fait 0,1 mm sur la
 * page : invisible. Une ligne justifiée élargit ses espaces bien au-delà.
 */
const RUN_TOLERANCE_PX = 0.5;

/** Hauteur utile d'une page, en mm : ce qui reste entre marges et pied. */
export const contentHeightMm = () => PAGE.height - 2 * PAGE.margin - PAGE.footer;

/** Un élément est un atome — il ne se coupe pas — sauf fond et bordure verticale. */
const isAtom = (item) => !(item.kind === 'rect' && item.role === 'fill');

/**
 * Styles de la police embarquée qu'emploie la mise en page — les seuls à
 * déclarer au document (cf. registerPdfFonts).
 *
 * @param {{items: object[]}} layout
 * @returns {Set<string>}
 */
export const usedFontStyles = (layout) =>
  new Set(
    layout.items
      .filter((item) => item.kind === 'text' && item.font.family === 'sans')
      .map((item) => item.font.style),
  );

/**
 * Écrit toutes les pages du résumé dans `pdf`, pied de page compris.
 *
 * @param {import('jspdf').jsPDF} pdf - document vide, en mm, polices déclarées
 * @param {{width: number, items: object[]}} layout
 * @param {{footerText: string, metrics: {width: Function}, chrome?: PageChrome|null}} options
 *   - `chrome` : habillage à la marque (cf. drawPageFrame), absent = pied d'origine
 * @returns {number} nombre de pages
 */
export function drawLayout(pdf, layout, { footerText, metrics, chrome = null }) {
  const mmPerPx = (PAGE.width - 2 * PAGE.margin) / layout.width;
  const pageHeight = contentHeightMm() / mmPerPx;
  const pages = paginate(lineGroups(layout.items.filter(isAtom)), pageHeight);

  const layers = pages.map(() => ({ fills: [], marks: [], texts: [] }));
  for (const item of layout.items) {
    if (!isAtom(item)) {
      for (const slice of slicesOf(item, pages, pageHeight)) {
        layers[slice.page].fills.push({
          ...item,
          top: slice.top,
          bottom: slice.bottom,
          offset: pages[slice.page].start,
        });
      }
      continue;
    }
    const index = pageIndexOf(pages, item.top);
    const placed = { ...item, offset: pages[index].start };
    layers[index][item.kind === 'text' ? 'texts' : 'marks'].push(placed);
  }

  const x = (px) => PAGE.margin + px * mmPerPx;
  const y = (px, offset) => PAGE.margin + (px - offset) * mmPerPx;
  const mm = (px) => px * mmPerPx;

  layers.forEach((layer, index) => {
    if (index > 0) pdf.addPage();
    // Fonds, puis filets et images ; le texte en dernier, dans l'ordre du
    // document — celui qu'un outil d'extraction relit.
    for (const item of layer.fills) drawRect(pdf, item, x, y, mm);
    for (const item of layer.marks) {
      if (item.kind === 'rect') drawRect(pdf, item, x, y, mm);
      else if (item.kind === 'image') drawImage(pdf, item, x, y, mm);
      else if (item.kind === 'link') {
        pdf.link(x(item.x), y(item.top, item.offset), mm(item.width), mm(item.bottom - item.top), {
          url: item.url,
        });
      }
    }
    for (const run of textRuns(layer.texts, metrics)) drawText(pdf, run, x, y, mmPerPx);
    drawPageFrame(pdf, index + 1, pages.length, footerText, chrome);
  });

  return pages.length;
}

/**
 * Recoud en une chaîne les mots consécutifs qui tombent là où la police les
 * poserait d'elle-même : même style, même ligne, et le mot suivant à une
 * espace près. Une ligne alignée à gauche s'écrit ainsi d'un bloc ; une ligne
 * justifiée, dont le navigateur a élargi les espaces, garde un mot par
 * position. Moins d'opérateurs dans le PDF, et des phrases entières pour les
 * outils d'extraction.
 *
 * @param {object[]} texts - éléments texte d'une page, dans l'ordre du document
 * @param {{width: (font: object, text: string, sizePx: number) => number}} metrics
 */
export function textRuns(texts, metrics) {
  const runs = [];
  for (const item of texts) {
    const run = runs[runs.length - 1];
    const space = run?.spaceAfter ? metrics.width(item.font, ' ', item.sizePx) : 0;
    const joins =
      run &&
      run.offset === item.offset &&
      run.font.family === item.font.family &&
      run.font.style === item.font.style &&
      run.sizePx === item.sizePx &&
      String(run.color) === String(item.color) &&
      Math.abs(run.baseline - item.baseline) < 0.05 &&
      Math.abs(item.x - (run.end + space)) <= RUN_TOLERANCE_PX;
    if (joins) {
      run.text += (run.spaceAfter ? ' ' : '') + item.text;
      run.end += space + item.width;
      run.spaceAfter = item.spaceAfter;
    } else {
      runs.push({ ...item, end: item.x + item.width });
    }
  }
  return runs;
}

function drawRect(pdf, item, x, y, mm) {
  if (item.gradient) {
    drawGradientRect(pdf, {
      x: x(item.x),
      y: y(item.top, item.offset),
      width: mm(item.width),
      height: mm(item.bottom - item.top),
      // La boîte entière, sur la même page virtuelle que le morceau.
      ref: {
        x: x(item.span.x),
        y: y(item.span.top, item.offset),
        width: mm(item.span.width),
        height: mm(item.span.height),
      },
      ...item.gradient,
    });
    return;
  }
  if (!item.color) return; // couleur transparente
  pdf.setFillColor(...item.color);
  pdf.rect(x(item.x), y(item.top, item.offset), mm(item.width), mm(item.bottom - item.top), 'F');
}

/** Largeur visée d'une bande de dégradé, en mm : sous le pouvoir séparateur de l'œil à l'impression. */
const BAND_MM = 0.5;
/** Plafond de bandes par dégradé : au-delà, le fichier grossit sans que l'œil y gagne. */
const MAX_BANDS = 240;
/**
 * Chevauchement de deux bandes voisines : bord à bord, l'anticrénelage de
 * certains lecteurs (pdf.js, Aperçu) laisse passer un fil de fond entre elles.
 */
const BAND_OVERLAP_MM = 0.12;

/**
 * Bandes d'un dégradé le long d'un axe, en mm.
 *
 * Le dégradé est PEINT en aplats étroits plutôt que décrit par un motif de
 * dégradé du PDF : les aplats se lisent pareil partout (Acrobat, Aperçu,
 * pdf.js, poppler, impression), le motif de jsPDF passe par son API avancée,
 * en repère inversé, sans garantie dans le rendu de secours. Deux bandes
 * voisines de même couleur fusionnent : une marque à deux teintes proches ne
 * coûte que quelques aplats.
 *
 * @param {{start: number, length: number, refStart: number, refLength: number,
 *          stops: Array<{at: number, color: number[]}>}} span
 *   - le morceau à peindre, et la boîte entière à laquelle les couleurs se rapportent
 * @returns {Array<{from: number, size: number, color: number[]}>}
 */
export function gradientBands({ start, length, refStart, refLength, stops }) {
  if (!(length > 0)) return [];
  const count = Math.max(1, Math.min(MAX_BANDS, Math.ceil(length / BAND_MM)));
  const size = length / count;
  const bands = [];
  for (let i = 0; i < count; i++) {
    const mid = start + (i + 0.5) * size;
    const t = refLength > 0 ? Math.min(1, Math.max(0, (mid - refStart) / refLength)) : 0;
    const color = colorAt(stops, t);
    const last = bands[bands.length - 1];
    if (last && String(last.color) === String(color)) last.size += size;
    else bands.push({ from: start + i * size, size, color });
  }
  return bands;
}

/**
 * Rectangle en dégradé (mm), le long de `axis` : 'x' de gauche à droite,
 * 'y' de haut en bas.
 *
 * @param {import('jspdf').jsPDF} pdf
 * @param {{x: number, y: number, width: number, height: number, axis: 'x'|'y',
 *          stops: Array<{at: number, color: number[]}>,
 *          ref?: {x: number, y: number, width: number, height: number}}} rect
 */
export function drawGradientRect(pdf, { x, y, width, height, axis, stops, ref }) {
  const box = ref || { x, y, width, height };
  const horizontal = axis === 'x';
  const bands = gradientBands(
    horizontal
      ? { start: x, length: width, refStart: box.x, refLength: box.width, stops }
      : { start: y, length: height, refStart: box.y, refLength: box.height, stops },
  );
  const end = horizontal ? x + width : y + height;
  for (const band of bands) {
    // Le chevauchement déborde sur la bande suivante, jamais hors du rectangle.
    const size = Math.min(band.size + BAND_OVERLAP_MM, end - band.from);
    pdf.setFillColor(...band.color);
    if (horizontal) pdf.rect(band.from, y, size, height, 'F');
    else pdf.rect(x, band.from, width, size, 'F');
  }
}

function drawText(pdf, run, x, y, mmPerPx) {
  pdf.setFont(pdfFontName(run.font), run.font.style);
  pdf.setFontSize(run.sizePx * mmPerPx * PT_PER_MM);
  if (run.color) pdf.setTextColor(...run.color);
  // Texte de couleur transparente : écrit, mais invisible — comme à l'écran.
  const options = run.color ? {} : { renderingMode: 'invisible' };
  pdf.text(
    run.spaceAfter ? `${run.text} ` : run.text,
    x(run.x),
    y(run.baseline, run.offset),
    options,
  );
}

function drawImage(pdf, item, x, y, mm) {
  pdf.addImage(
    item.data,
    item.format,
    x(item.x),
    y(item.y, item.offset),
    mm(item.width),
    mm(item.height),
    item.alias || undefined,
    'SLOW',
  );
}

/**
 * @typedef {object} PageChrome - habillage à la marque d'une page
 * @property {number[]} from - [r, g, b] du début du dégradé (couleur primaire)
 * @property {number[]} to - [r, g, b] de sa fin (couleur secondaire)
 * @property {{data: string, width: number, height: number}|null} [logo]
 *   - logo de MyBrief en PNG (cf. logo.js) ; ses dimensions ne servent qu'au rapport
 */

/** Bande en dégradé en tête de chaque page, à fond perdu (mm). */
const BAND_HEIGHT = 2.4;
/** Hauteur du logo de MyBrief au pied (mm) : présent, sans rivaliser avec le contenu. */
const FOOT_LOGO = 6.5;
/** Gris du pied : lisible, en retrait du texte (slate-500). */
const FOOT_INK = [100, 116, 139];

/**
 * Cadre de chaque page. Avec un habillage : bande en dégradé de la marque en
 * tête, et au pied un filet du même dégradé, le logo de MyBrief, la mention et
 * le numéro de page. Le tout se loge dans les marges et la réserve du pied
 * (PAGE) : la zone de texte, que le Pagimètre rejoue, ne bouge pas d'un
 * millimètre. Sans habillage (rapport des statistiques), le pied d'origine.
 *
 * Partagé avec le rendu image de secours (cf. utils/pdf.js).
 *
 * @param {import('jspdf').jsPDF} pdf
 * @param {number} pageNum
 * @param {number} totalPages
 * @param {string} footerText
 * @param {PageChrome|null} [chrome]
 */
export function drawPageFrame(pdf, pageNum, totalPages, footerText, chrome = null) {
  if (!chrome) {
    drawFooter(pdf, pageNum, totalPages, footerText);
    return;
  }
  const { width, height, margin, footer } = PAGE;
  const stops = [
    { at: 0, color: chrome.from },
    { at: 1, color: chrome.to },
  ];
  drawGradientRect(pdf, { x: 0, y: 0, width, height: BAND_HEIGHT, axis: 'x', stops });

  const ruleY = height - footer;
  drawGradientRect(pdf, {
    x: margin,
    y: ruleY,
    width: width - 2 * margin,
    height: 0.45,
    axis: 'x',
    stops,
  });

  const logoTop = ruleY + 3;
  const middle = logoTop + FOOT_LOGO / 2;
  let textX = margin;
  if (chrome.logo?.data) {
    const ratio =
      chrome.logo.width > 0 && chrome.logo.height > 0 ? chrome.logo.width / chrome.logo.height : 1;
    const logoWidth = FOOT_LOGO * ratio;
    // Alias fixe : jsPDF n'embarque l'image qu'une fois pour toutes les pages.
    pdf.addImage(
      chrome.logo.data,
      'PNG',
      margin,
      logoTop,
      logoWidth,
      FOOT_LOGO,
      'mybrief-logo',
      'SLOW',
    );
    textX += logoWidth + 2.5;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...FOOT_INK);
  // Ligne de base : la hauteur de capitale d'Helvetica (0,718 em) centrée sur le logo.
  const baseline = middle + (0.718 * 7.5) / PT_PER_MM / 2;
  pdf.text(footerText, textX, baseline);
  const pageLabel = `${pageNum} / ${totalPages}`;
  pdf.text(pageLabel, width - margin - pdf.getTextWidth(pageLabel), baseline);
}

/**
 * Pied de page d'origine : filet, mention de MyBrief, numéro. Identique à la
 * version image — partagé avec elle (cf. utils/pdf.js).
 */
export function drawFooter(pdf, pageNum, totalPages, footerText) {
  const { width, height, margin, footer } = PAGE;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(148, 163, 184);

  const textY = height - 10;
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.5);
  pdf.line(margin, height - footer, width - margin, height - footer);
  pdf.text(footerText, (width - pdf.getTextWidth(footerText)) / 2, textY);

  pdf.setFontSize(7);
  pdf.text(`${pageNum} / ${totalPages}`, width - margin - 15, textY);
}

const ORDERING_WRONG = '/Ordering (Identity-H)';
const ORDERING_RIGHT = '/Ordering (Identity)  ';

/**
 * Octets du document, corrigés d'un défaut de jsPDF 2.5.
 *
 * jsPDF déclare ses polices TrueType dans la collection « Adobe-Identity-H »,
 * qui n'existe pas : c'est l'encodage qui s'appelle Identity-H, la collection
 * est « Identity ». Acrobat et pdf.js passent outre ; poppler (pdftotext,
 * courant dans les chaînes d'extraction) le signale en erreur à chaque page.
 * Le remplacement garde la longueur exacte (deux espaces de bourrage) : la
 * table des positions des objets, en fin de fichier, reste juste.
 *
 * @param {import('jspdf').jsPDF} pdf
 * @returns {Uint8Array}
 */
export function pdfBytes(pdf) {
  const bytes = new Uint8Array(pdf.output('arraybuffer'));
  const wrong = Uint8Array.from(ORDERING_WRONG, (c) => c.charCodeAt(0));
  const right = Uint8Array.from(ORDERING_RIGHT, (c) => c.charCodeAt(0));
  for (
    let i = bytes.indexOf(wrong[0]);
    i !== -1 && i <= bytes.length - wrong.length;
    i = bytes.indexOf(wrong[0], i + 1)
  ) {
    if (wrong.every((b, k) => bytes[i + k] === b)) bytes.set(right, i);
  }
  return bytes;
}
