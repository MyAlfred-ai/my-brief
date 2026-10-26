/**
 * Police du PDF de résumé : DejaVu Sans Condensed, embarquée.
 *
 * ── Pourquoi une police embarquée ──────────────────────────────────────────
 * Un PDF ne peut écrire du texte qu'avec une police qu'il contient (ou l'une
 * des 14 standard, limitées au jeu WinAnsi : ni « → », ni « ≥ », ni les noms
 * polonais). Les polices système du navigateur ne se lisent pas depuis une
 * page web. La police est donc livrée avec l'application, chargée par le
 * navigateur pour METTRE EN PAGE le résumé et par jsPDF pour l'ÉCRIRE : même
 * fichier des deux côtés, donc mêmes largeurs, donc chaque mot à sa place.
 *
 * ── Pourquoi celle-ci ───────────────────────────────────────────────────────
 * La feuille de style demande 'Segoe UI', Tahoma… : sur Mac, le PDF sortait
 * en Tahoma. DejaVu Sans Condensed en a le dessin et la chasse — mesuré le
 * 2026-09-17 sur un paragraphe de compte rendu : +2,4 % de largeur en romain,
 * +1,9 % en gras — donc les mêmes coupures de ligne, à peu de choses près.
 * Elle couvre aussi le latin étendu, le grec, le cyrillique, les flèches, les
 * opérateurs et les coches que les résumés IA emploient. Licence libre
 * (Bitstream Vera, domaine public pour DejaVu) : cf. fonts/LICENSE.
 *
 * ── Les fichiers ────────────────────────────────────────────────────────────
 * Sous-ensembles de DejaVu 2.37 (~200 Ko chacun au lieu de ~650), sans
 * hinting ni tables de positionnement (GPOS, GSUB, kern) : sans elles, le
 * navigateur ne crénelle pas et ne ligature pas — exactement comme jsPDF, qui
 * ne sait faire ni l'un ni l'autre. Régénération, depuis les TTF d'origine :
 *
 *   pyftsubset DejaVuSansCondensed.ttf --no-hinting --layout-features='' \
 *     --drop-tables+=GSUB,GPOS,GDEF,kern,DSIG,gasp,hdmx,VDMX,LTSH,FFTM,MATH \
 *     --name-IDs=0,1,2,3,4,5,6 --name-languages=0x0409 --no-glyph-names \
 *     --unicodes=U+0020-007E,U+00A0-024F,U+02B0-02FF,U+0300-036F,U+0370-03FF,\
 *   U+0400-04FF,U+1E00-1EFF,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2100-214F,\
 *   U+2150-218F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+2460-24FF,U+25A0-25FF,\
 *   U+2605-2606,U+260E-260F,U+2610-2613,U+2618-2622,U+263A-263C,U+2640-2642,\
 *   U+2660-2667,U+2690-2691,U+26A0-26A1,U+2700-27BF,U+27F0-27FF,U+2B00-2BFF,\
 *   U+FB00-FB06,U+FFFD
 *
 * (idem pour -Bold, -Oblique, -BoldOblique). Le PDF produit n'embarque, lui,
 * que les glyphes employés : jsPDF sous-échantillonne à l'écriture.
 */
import regularUrl from './fonts/DejaVuSansCondensed.ttf';
import boldUrl from './fonts/DejaVuSansCondensed-Bold.ttf';
import italicUrl from './fonts/DejaVuSansCondensed-Oblique.ttf';
import boldItalicUrl from './fonts/DejaVuSansCondensed-BoldOblique.ttf';
import { isWinAnsi } from './text.js';

/** Famille CSS de la mise en page du PDF (cf. utils/pdf.js). */
export const PDF_FONT_FAMILY = 'MyBrief PDF Sans';

/** Nom de la police dans le PDF — celui qu'affichent les propriétés du document. */
export const PDF_FONT_NAME = 'DejaVuSansCondensed';

/** Les quatre styles, au sens de jsPDF (`normal`, `bold`, `italic`, `bolditalic`). */
export const PDF_FONT_FACES = [
  { style: 'normal', weight: '400', cssStyle: 'normal', url: regularUrl },
  { style: 'bold', weight: '700', cssStyle: 'normal', url: boldUrl },
  { style: 'italic', weight: '400', cssStyle: 'italic', url: italicUrl },
  { style: 'bolditalic', weight: '700', cssStyle: 'italic', url: boldItalicUrl },
];

let loading = null;

/**
 * Charge les quatre fichiers, une fois par session : déclarés au navigateur
 * (FontFace) pour la mise en page, gardés en octets et en base64 pour jsPDF.
 *
 * Un échec n'est pas mémorisé : le prochain PDF retente (réseau revenu).
 *
 * @returns {Promise<Array<{style: string, bytes: Uint8Array, base64: string}>>}
 */
export function loadPdfFonts() {
  if (!loading) {
    loading = Promise.all(PDF_FONT_FACES.map(loadFace)).catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

async function loadFace(face) {
  const response = await fetch(face.url);
  if (!response.ok) throw new Error(`pdf_font_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const fontFace = new FontFace(PDF_FONT_FAMILY, bytes.slice().buffer, {
    weight: face.weight,
    style: face.cssStyle,
  });
  await fontFace.load();
  document.fonts.add(fontFace);
  return { style: face.style, bytes, base64: toBase64(bytes) };
}

/** @param {Uint8Array} bytes */
export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Déclare les polices dans un document jsPDF — seulement les styles employés :
 * jsPDF écrit toute police déclarée, même sans un glyphe, et chacune pèse
 * ~7 Ko (tables de glyphes et de chasses).
 *
 * @param {import('jspdf').jsPDF} pdf
 * @param {Array<{style: string, base64: string}>} fonts
 * @param {Set<string>} [styles] - styles à déclarer ; tous par défaut
 */
export function registerPdfFonts(pdf, fonts, styles) {
  for (const { style, base64 } of fonts) {
    if (styles && !styles.has(style)) continue;
    const file = `${PDF_FONT_NAME}-${style}.ttf`;
    pdf.addFileToVFS(file, base64);
    pdf.addFont(file, PDF_FONT_NAME, style);
  }
}

/** Nom jsPDF de la police d'un texte : la nôtre, ou Courier pour le code. */
export const pdfFontName = (font) => (font.family === 'mono' ? 'courier' : PDF_FONT_NAME);

/**
 * Ce que le PDF sait dessiner, et à quelle largeur — lu dans les fichiers de
 * police par l'analyseur TrueType de jsPDF, celui-là même qui les écrira. Le
 * texte à chasse fixe (`<code>`, `<pre>`) part en Courier, police standard :
 * jeu WinAnsi, 0,6 em par caractère.
 *
 * @param {typeof import('jspdf').jsPDF} jsPDF - la classe (pour `API.TTFFont`)
 * @param {Array<{style: string, bytes: Uint8Array}>} fonts
 * @returns {{hasGlyph: (font: object, codePoint: number) => boolean,
 *            width: (font: object, text: string, sizePx: number) => number}}
 */
export function pdfFontMetrics(jsPDF, fonts) {
  const ttf = new Map(fonts.map(({ style, bytes }) => [style, jsPDF.API.TTFFont.open(bytes)]));
  return {
    hasGlyph(font, codePoint) {
      if (font.family === 'mono') return isWinAnsi(codePoint);
      // Au-delà du plan de base, jsPDF ne sait pas écrire (codes UTF-16).
      return codePoint <= 0xffff && ttf.get(font.style).characterToGlyph(codePoint) > 0;
    },
    width(font, text, sizePx) {
      if (font.family === 'mono') return 0.6 * sizePx * [...text].length;
      const metadata = ttf.get(font.style);
      let units = 0;
      for (let i = 0; i < text.length; i++) {
        units += metadata.widthOfGlyph(metadata.characterToGlyph(text.charCodeAt(i)));
      }
      return (units / 1000) * sizePx;
    },
  };
}
