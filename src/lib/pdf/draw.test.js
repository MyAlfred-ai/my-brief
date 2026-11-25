/**
 * Le PDF texte, écrit par jsPDF avec les vraies polices embarquées — sans
 * navigateur : la mise en page relevée est ici fabriquée à la main.
 *
 * Garde-fous : que les sous-ensembles de DejaVu restent lisibles par jsPDF
 * (une régénération ratée ne se verrait qu'au premier PDF), que le texte parte
 * en TEXTE extractible et pas en image, et que le document reste léger.
 */
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { describe, expect, it, vi } from 'vitest';
import {
  contentHeightMm,
  drawLayout,
  gradientBands,
  PAGE,
  pdfBytes,
  textRuns,
  usedFontStyles,
} from './draw.js';
import { PDF_FONT_FACES, pdfFontMetrics, registerPdfFonts } from './fonts.js';

const FONT_FILES = {
  normal: 'DejaVuSansCondensed.ttf',
  bold: 'DejaVuSansCondensed-Bold.ttf',
  italic: 'DejaVuSansCondensed-Oblique.ttf',
  bolditalic: 'DejaVuSansCondensed-BoldOblique.ttf',
};

const fonts = PDF_FONT_FACES.map(({ style }) => {
  const bytes = readFileSync(new URL(`./fonts/${FONT_FILES[style]}`, import.meta.url));
  return { style, bytes: new Uint8Array(bytes), base64: bytes.toString('base64') };
});
const metrics = pdfFontMetrics(jsPDF, fonts);

const SANS = { family: 'sans', style: 'normal' };
const BOLD = { family: 'sans', style: 'bold' };
const ITALIC = { family: 'sans', style: 'italic' };
const SIZE = 14.667;

function newPdf(layout, { compress = false } = {}) {
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress });
  registerPdfFonts(pdf, fonts, usedFontStyles(layout));
  return pdf;
}

/**
 * Bande de 794 px (210 mm), une ligne par tranche de 23,5 px. `extra` élargit
 * chaque espace, comme la justification.
 */
function layoutOf(lines, { extra = () => 0 } = {}) {
  const items = [];
  lines.forEach((words, n) => {
    let x = 20;
    const top = 20 + n * 23.5;
    for (const [text, font] of words) {
      const width = metrics.width(font, text, SIZE);
      items.push({
        kind: 'text',
        text,
        x,
        top,
        bottom: top + 17,
        baseline: top + 14,
        width,
        font,
        sizePx: SIZE,
        color: [30, 41, 59],
        spaceAfter: true,
        offset: 0,
      });
      x += width + metrics.width(font, ' ', SIZE) + extra(n);
    }
  });
  return { width: 793.7, items };
}

describe('polices embarquées', () => {
  it('dessine le français, les flèches et les coches ; pas les emoji', () => {
    for (const ch of 'éèàçœ’«»€→≥✓•') expect(metrics.hasGlyph(SANS, ch.codePointAt(0))).toBe(true);
    expect(metrics.hasGlyph(SANS, '✅'.codePointAt(0))).toBe(false);
    expect(metrics.hasGlyph(SANS, '📝'.codePointAt(0))).toBe(false);
  });

  it('donne au mot la largeur que le navigateur mesure avec la même police', () => {
    // Relevé Chromium du 2026-09-17, 11 pt (14,667 px) : « Alex » 28,609 px,
    // « VILLECHALANE » 98,656 px.
    expect(metrics.width(SANS, 'Alex', 14.6667)).toBeCloseTo(28.61, 1);
    expect(metrics.width(SANS, 'VILLECHALANE', 14.6667)).toBeCloseTo(98.66, 1);
    expect(metrics.width(BOLD, 'Alex', SIZE)).toBeGreaterThan(metrics.width(SANS, 'Alex', SIZE));
  });

  it('Courier pour le code : jeu WinAnsi, 0,6 em par caractère', () => {
    const mono = { family: 'mono', style: 'normal' };
    expect(metrics.width(mono, 'abc', 10)).toBeCloseTo(18);
    expect(metrics.hasGlyph(mono, '→'.codePointAt(0))).toBe(false);
  });
});

describe('textRuns', () => {
  it('recoud une ligne alignée à gauche en une seule chaîne', () => {
    const { items } = layoutOf([
      [
        ['la', SANS],
        ['politique', SANS],
        ['de', SANS],
      ],
    ]);
    const runs = textRuns(items, metrics);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('la politique de');
    expect(runs[0].x).toBe(items[0].x);
  });

  it('garde un mot par position quand la justification élargit les espaces', () => {
    const { items } = layoutOf(
      [
        [
          ['axes', SANS],
          [':', SANS],
          ['la', SANS],
        ],
      ],
      { extra: () => 2 },
    );
    expect(textRuns(items, metrics).map((r) => r.text)).toEqual(['axes', ':', 'la']);
  });

  it('coupe au changement de style, de couleur ou de ligne', () => {
    const { items } = layoutOf([
      [
        ['cadré', SANS],
        ['la', BOLD],
      ],
      [['stratégie', SANS]],
    ]);
    expect(textRuns(items, metrics).map((r) => r.text)).toEqual(['cadré', 'la', 'stratégie']);
  });

  it('colle sans espace ce qui se touche (« sauvegarde, »)', () => {
    const word = { ...layoutOf([[['sauvegarde', SANS]]]).items[0], spaceAfter: false };
    const comma = {
      ...word,
      text: ',',
      x: word.x + word.width,
      width: metrics.width(SANS, ',', SIZE),
      spaceAfter: true,
    };
    const [run] = textRuns([word, comma], metrics);
    expect(run.text).toBe('sauvegarde,');
    expect(run.spaceAfter).toBe(true);
  });
});

describe('drawLayout', () => {
  it('écrit du texte extractible, sans image, et ne déclare que les styles employés', () => {
    const words = 'Alex et Lucas ont cadré la stratégie de stabilisation des VPS'.split(' ');
    const layout = layoutOf(
      Array.from({ length: 40 }, (_, n) =>
        words.map((w, i) => [w, i === 0 && n % 5 === 0 ? BOLD : SANS]),
      ),
      { extra: (n) => (n % 2 ? 1.5 : 0) },
    );
    const pdf = newPdf(layout);

    expect(drawLayout(pdf, layout, { footerText: 'Document généré par MyBrief', metrics })).toBe(1);

    const out = pdf.output();
    expect(out).toContain('/FontFile2');
    expect(out.match(/\/BaseFont \/DejaVuSansCondensed/g)).toHaveLength(2 * 2); // Type0 + CIDFont, × 2 styles
    // Table ToUnicode : ce qui permet à un lecteur de retrouver « A » sous le glyphe.
    expect(out).toContain('<0041>');
    expect(out).not.toContain('/Subtype /Image');
  });

  it('pagine sans couper de ligne et numérote chaque page', () => {
    const layout = layoutOf(Array.from({ length: 120 }, (_, n) => [[`ligne${n}`, SANS]]));
    const pdf = newPdf(layout);

    // Page utile : 252 mm, soit 1 111 px de bande. 46 lignes sur la première
    // (la 46e finit à 1 095 px), 47 sur la deuxième, le reste sur la troisième.
    expect(contentHeightMm() / ((PAGE.width - 2 * PAGE.margin) / layout.width)).toBeCloseTo(
      1111.2,
      0,
    );
    expect(drawLayout(pdf, layout, { footerText: 'pied', metrics })).toBe(3);
    expect(pdf.getNumberOfPages()).toBe(3);

    const out = pdf.output();
    expect(out).toContain('(1 / 3)');
    expect(out).toContain('(3 / 3)');
  });
});

describe('pdfBytes', () => {
  it('déclare la collection Identity, à longueur égale : les positions des objets restent justes', () => {
    const layout = layoutOf([[['Bonjour', SANS]]]);
    const pdf = newPdf(layout);
    drawLayout(pdf, layout, { footerText: 'pied', metrics });
    const raw = pdf.output();
    expect(raw).toContain('/Ordering (Identity-H)');

    const fixed = new TextDecoder('latin1').decode(pdfBytes(pdf));
    expect(fixed).not.toContain('/Ordering (Identity-H)');
    expect(fixed).toContain('/Ordering (Identity)');
    expect(fixed).toHaveLength(raw.length);
    // Chaque entrée de la table xref pointe toujours sur « n 0 obj ».
    const xref = fixed.slice(fixed.lastIndexOf('xref'));
    for (const [, offset] of xref.matchAll(/^(\d{10}) 00000 n/gm)) {
      expect(fixed.slice(Number(offset), Number(offset) + 12)).toMatch(/^\d+ 0 obj/);
    }
  });
});

describe('poids du document', () => {
  it('six pages de texte restent sous 100 Ko, polices comprises', () => {
    const sentence =
      'Lucas a présenté plusieurs modèles d’architecture : un VPS par client, offrant une isolation maximale → coût ≥ 5 €'.split(
        ' ',
      );
    const layout = layoutOf(
      Array.from({ length: 300 }, (_, n) =>
        sentence.map((w, i) => [w, i % 7 === 0 ? BOLD : n % 11 === 0 ? ITALIC : SANS]),
      ),
      { extra: (n) => (n % 3 ? 1.2 : 0) },
    );
    const pdf = newPdf(layout, { compress: true });

    expect(
      drawLayout(pdf, layout, { footerText: 'Document généré par MyBrief', metrics }),
    ).toBeGreaterThanOrEqual(6);
    expect(pdfBytes(pdf).byteLength).toBeLessThan(100 * 1024);
  });
});

describe('dégradés peints en bandes', () => {
  const stops = [
    { at: 0, color: [0, 0, 0] },
    { at: 1, color: [250, 100, 0] },
  ];

  it('couvrent le segment exactement, de la première couleur à la dernière', () => {
    const bands = gradientBands({ start: 0, length: 210, refStart: 0, refLength: 210, stops });
    expect(bands.length).toBeGreaterThan(100);
    expect(bands[0].from).toBe(0);
    expect(bands.reduce((sum, b) => sum + b.size, 0)).toBeCloseTo(210, 6);
    expect(bands[0].color[0]).toBeLessThan(5);
    expect(bands[bands.length - 1].color[0]).toBeGreaterThan(245);
  });

  it('une marque à une seule teinte ne coûte qu’un aplat', () => {
    const flat = [
      { at: 0, color: [9, 9, 9] },
      { at: 1, color: [9, 9, 9] },
    ];
    expect(
      gradientBands({ start: 5, length: 100, refStart: 5, refLength: 100, stops: flat }),
    ).toEqual([{ from: 5, size: 100, color: [9, 9, 9] }]);
  });

  it('un morceau coupé par un saut de page garde sa part du dégradé', () => {
    const second = gradientBands({ start: 50, length: 50, refStart: 0, refLength: 100, stops });
    expect(second[0].color[0]).toBeGreaterThan(120);
    expect(second[0].color[0]).toBeLessThan(130);
  });
});

// PNG 1 × 1 avec transparence : le logo de MyBrief, en miniature.
const LOGO_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('habillage à la marque', () => {
  const chrome = {
    from: [30, 107, 87],
    to: [227, 167, 47],
    logo: { data: LOGO_PNG, width: 26, height: 26 },
  };

  /** Couleurs de remplissage employées, page par page. */
  function fillsByPage(pdf) {
    const pages = {};
    const setFill = pdf.setFillColor.bind(pdf);
    vi.spyOn(pdf, 'setFillColor').mockImplementation((...rgb) => {
      const page = pdf.getCurrentPageInfo().pageNumber;
      (pages[page] ||= []).push(rgb.join(','));
      return setFill(...rgb);
    });
    return pages;
  }

  it('bande et filet de la marque à chaque page, logo de MyBrief embarqué une seule fois', () => {
    const layout = layoutOf(Array.from({ length: 120 }, (_, n) => [[`ligne${n}`, SANS]]));
    const pdf = newPdf(layout);
    const fills = fillsByPage(pdf);

    expect(
      drawLayout(pdf, layout, { footerText: 'Document généré par MyBrief', metrics, chrome }),
    ).toBe(3);

    for (const page of [1, 2, 3]) {
      expect(fills[page]).toContain(chrome.from.join(','));
      expect(fills[page]).toContain(chrome.to.join(','));
    }
    const out = pdf.output();
    expect(out.match(/\/Subtype \/Image/g)).toHaveLength(2); // le PNG et son masque de transparence
    expect(out.match(/\/I\d+ Do/g)).toHaveLength(3); // posé sur chacune des trois pages
    expect(out).toContain('(3 / 3)');
    expect(out).toContain('Document g');
  });

  it('un fond en dégradé coupé entre deux pages reprend là où il s’arrêtait', () => {
    const lines = layoutOf(Array.from({ length: 60 }, (_, n) => [[`ligne${n}`, SANS]]));
    // Bande verticale noire → rouge sur toute la hauteur des 60 lignes.
    const span = { x: 2, top: 20, width: 4, height: 60 * 23.5 };
    const gradient = {
      axis: 'y',
      stops: [
        { at: 0, color: [0, 0, 0] },
        { at: 1, color: [250, 0, 0] },
      ],
    };
    const layout = {
      ...lines,
      items: [
        {
          kind: 'rect',
          role: 'fill',
          x: 2,
          top: 20,
          bottom: 20 + span.height,
          width: 4,
          color: [0, 0, 0],
          gradient,
          span,
        },
        ...lines.items,
      ],
    };
    const pdf = newPdf(layout);
    const fills = fillsByPage(pdf);
    drawLayout(pdf, layout, { footerText: 'pied', metrics });

    const red = (page) => fills[page].map((c) => Number(c.split(',')[0]));
    // Page 1 : du noir jusqu'aux trois quarts environ ; page 2 : la suite, jusqu'au rouge.
    expect(red(1)[0]).toBeLessThan(10);
    expect(Math.max(...red(1))).toBeLessThan(220);
    expect(red(2)[0]).toBeGreaterThan(150);
    expect(Math.max(...red(2))).toBeGreaterThan(240);
  });

  it('sans habillage (rapport des statistiques) : le pied d’origine, sans image ni bande', () => {
    const layout = layoutOf([[['Bonjour', SANS]]]);
    const pdf = newPdf(layout);
    const fills = fillsByPage(pdf);
    drawLayout(pdf, layout, { footerText: 'pied', metrics });
    expect(pdf.output()).not.toContain('/Subtype /Image');
    expect(fills[1] || []).toEqual([]);
  });
});
