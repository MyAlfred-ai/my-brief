/**
 * Pagimètre — réglage, plafond, verdict, découpe, et surtout l'estimation de
 * la mise en page, tenue contre le VRAI moteur PDF.
 *
 * pageMeter.calibration.json : six résumés mesurés le 2026-09-30 dans Chromium
 * par le code du PDF de l'app (src/utils/pdf.js + src/lib/pdf/, pagination
 * comprise), de 0,12 à 2,4 pages. Si l'un de ces tests casse après une retouche
 * de la feuille du PDF, ce n'est pas l'estimation qu'il faut « arranger » : il
 * faut la recalibrer (banc décrit dans documentations/FONCTIONNALITES.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PAGE_STEPS,
  MIN_PAGES,
  MAX_PAGES,
  WORDS_PER_PAGE,
  normalizePages,
  stepIndex,
  stepAtOrBelow,
  countWords,
  wordsForPages,
  materialCapPages,
  effectivePages,
  lengthVerdict,
  estimatePages,
  splitAtAnchors,
  formatPages,
  tickLabel,
  roundToStep,
  readingMinutes,
} from './pageMeter.js';

const calibration = JSON.parse(
  readFileSync(new URL('./pageMeter.calibration.json', import.meta.url), 'utf8'),
);

const paragraph = (sentences) =>
  `<p>${Array.from({ length: sentences }, () => "L'équipe a passé en revue l'avancement du projet de refonte du portail client, lancé en juin.").join(' ')}</p>`;

describe('réglage : positions du curseur', () => {
  it('de ¼ de page à 10 pages, pas serrés en bas', () => {
    expect(MIN_PAGES).toBe(0.25);
    expect(MAX_PAGES).toBe(10);
    expect(PAGE_STEPS.slice(0, 4)).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('normalizePages : position la plus proche, null hors bornes ou invalide', () => {
    expect(normalizePages(1)).toBe(1);
    expect(normalizePages(1.2)).toBe(1);
    expect(normalizePages(1.3)).toBe(1.5);
    expect(normalizePages('2,5')).toBe(2.5);
    expect(normalizePages(0.25)).toBe(0.25);
    expect(normalizePages(10)).toBe(10);
    expect(normalizePages(0.1)).toBeNull();
    expect(normalizePages(11)).toBeNull();
    expect(normalizePages(null)).toBeNull();
    expect(normalizePages(undefined)).toBeNull();
    expect(normalizePages(NaN)).toBeNull();
    expect(normalizePages('beaucoup')).toBeNull();
    expect(normalizePages({ pages: 1 })).toBeNull();
  });

  it('stepIndex et stepAtOrBelow', () => {
    expect(stepIndex(0.25)).toBe(0);
    expect(stepIndex(1)).toBe(3);
    expect(stepIndex(10)).toBe(PAGE_STEPS.length - 1);
    expect(stepIndex(null)).toBe(3); // repli : 1 page
    expect(stepAtOrBelow(1.63)).toBe(1.5);
    expect(stepAtOrBelow(0.1)).toBe(0.25);
    expect(stepAtOrBelow(42)).toBe(10);
  });
});

describe('matière disponible : plafond de longueur', () => {
  it('countWords ignore balises et entités', () => {
    expect(countWords('<p>Bonjour <strong>le monde</strong>&nbsp;!</p>')).toBe(3);
    expect(countWords("L'équipe a validé 68 % du budget, soit 1,2 M€.")).toBe(9);
    expect(countWords('')).toBe(0);
  });

  it('wordsForPages suit WORDS_PER_PAGE', () => {
    expect(wordsForPages(1)).toBe(WORDS_PER_PAGE);
    expect(wordsForPages(0.25)).toBe(Math.round(WORDS_PER_PAGE / 4));
  });

  it('une heure de réunion (~8 500 mots) plafonne vers 8 pages ; dix minutes vers 1,5', () => {
    expect(materialCapPages(8500)).toBeCloseTo(8.5, 1);
    expect(materialCapPages(1500)).toBeCloseTo(1.5, 1);
    expect(materialCapPages(100)).toBe(MIN_PAGES);
    expect(materialCapPages(100000)).toBe(MAX_PAGES);
  });

  it('transcription inconnue : aucun plafond', () => {
    expect(materialCapPages(0)).toBe(MAX_PAGES);
    expect(materialCapPages(undefined)).toBe(MAX_PAGES);
  });

  it('effectivePages : la demande, bornée par la matière', () => {
    expect(effectivePages(3, 50000)).toBe(3);
    expect(effectivePages(3, 1500)).toBeCloseTo(1.5, 1);
    expect(effectivePages(99, 50000)).toBeNull();
  });
});

describe('verdict de longueur', () => {
  it('±20 % autour de la cible', () => {
    expect(lengthVerdict(1, 1)).toBe('ok');
    expect(lengthVerdict(1.19, 1)).toBe('ok');
    expect(lengthVerdict(0.81, 1)).toBe('ok');
    expect(lengthVerdict(1.25, 1)).toBe('long');
    expect(lengthVerdict(0.7, 1)).toBe('short');
    expect(lengthVerdict(12.5, 10)).toBe('long');
  });

  it('plancher absolu sous la demi-page : on ne reprend pas un quart de page pour une ligne', () => {
    expect(lengthVerdict(0.29, 0.25)).toBe('ok');
    expect(lengthVerdict(0.21, 0.25)).toBe('ok');
    expect(lengthVerdict(0.35, 0.25)).toBe('long');
    expect(lengthVerdict(0.15, 0.25)).toBe('short');
  });
});

describe('estimation de la mise en page', () => {
  it('rien à mesurer : 0', () => {
    expect(estimatePages('')).toBe(0);
    expect(estimatePages('<p>   </p>')).toBe(0);
  });

  it('tient le vrai moteur PDF à 3 % près, sur les six résumés mesurés', () => {
    for (const sample of calibration) {
      const est = estimatePages(sample.html);
      expect(Math.abs(est - sample.pages) / sample.pages, sample.id).toBeLessThan(0.03);
    }
  });

  it('la longueur croît avec le texte, page après page', () => {
    const one = estimatePages(paragraph(4));
    const two = estimatePages(paragraph(8));
    expect(two).toBeGreaterThan(one * 1.8);
    expect(estimatePages(paragraph(4).repeat(40))).toBeGreaterThan(3);
  });

  it('à mots égaux, des puces courtes remplissent plus de page qu’une prose dense', () => {
    const words = 'Relancer le client sur le devis.';
    const prose = `<p>${Array.from({ length: 30 }, () => words).join(' ')}</p>`;
    const bullets = `<ul>${Array.from({ length: 30 }, () => `<li>${words}</li>`).join('')}</ul>`;
    expect(countWords(prose)).toBe(countWords(bullets));
    expect(estimatePages(bullets)).toBeGreaterThan(estimatePages(prose) * 2);
  });

  it('robuste au HTML d’un modèle : entités, emoji, <br>, balises inconnues, commentaires', () => {
    const html =
      '<!-- note --><h3>📊 Budget &amp; planning</h3><p>Ligne&nbsp;un<br>ligne deux</p><table><tr><td>A</td></tr></table><ol><li><p>Point</p></li></ol>';
    const pages = estimatePages(html);
    expect(pages).toBeGreaterThan(0);
    expect(pages).toBeLessThan(0.3);
  });
});

describe('découpe du résumé entre ses ancres', () => {
  const doc = [
    '<h1>Compte rendu</h1>',
    '<h2>Synthèse</h2>',
    '<p>Corps du résumé.</p>',
    '<h2>Synthèse</h2>', // le résumé reprend une chaîne de la mise en forme
    '<ul><li>Point</li></ul>',
    '<h2>Actions à mener</h2>',
    '<ul><li>Relancer</li></ul>',
  ].join('\n');

  it('ancre de début à sa n-ième occurrence, ancre de fin par la fin', () => {
    const parts = splitAtAnchors(doc, {
      before: '<h2>Synthèse</h2>',
      beforeCount: 1,
      after: '<h2>Actions à mener</h2>',
    });
    expect(parts.head).toBe('<h1>Compte rendu</h1>\n<h2>Synthèse</h2>');
    expect(parts.body).toBe(
      '\n<p>Corps du résumé.</p>\n<h2>Synthèse</h2>\n<ul><li>Point</li></ul>\n',
    );
    expect(parts.tail).toBe('<h2>Actions à mener</h2>\n<ul><li>Relancer</li></ul>');
    expect(parts.head + parts.body + parts.tail).toBe(doc);
  });

  it('une ancre de fin répétée DANS le résumé ne le coupe pas', () => {
    const html = '<h2>S</h2>\n<ul><li>a</li></ul>\n<ul><li>b</li></ul>\n<ul>\n<li>statique</li>';
    const parts = splitAtAnchors(html, { before: '<h2>S</h2>', beforeCount: 1, after: '<ul>' });
    // `<ul>` est unique dans la fin du scaffold : c'est sa DERNIÈRE occurrence.
    expect(parts.body).toBe('\n<ul><li>a</li></ul>\n<ul><li>b</li></ul>\n');
  });

  it('sans ancre : le résumé ouvre ou ferme le document', () => {
    expect(
      splitAtAnchors('<p>x</p><h2>Fin</h2>', { before: null, after: '<h2>Fin</h2>' }).body,
    ).toBe('<p>x</p>');
    expect(
      splitAtAnchors('<h2>Début</h2><p>x</p>', { before: '<h2>Début</h2>', after: null }).body,
    ).toBe('<p>x</p>');
  });

  it('ancre introuvable (mise en forme retouchée par le modèle) : null', () => {
    expect(splitAtAnchors(doc, { before: '<h2>Résumé</h2>', after: null })).toBeNull();
    expect(splitAtAnchors(doc, { before: null, after: '<h2>Suites</h2>' })).toBeNull();
    expect(
      splitAtAnchors(doc, { before: '<h2>Synthèse</h2>', beforeCount: 3, after: null }),
    ).toBeNull();
  });
});

describe('affichage', () => {
  it('formatPages : français (singulier jusqu’à 2) et anglais', () => {
    expect(formatPages(0.25)).toBe('¼ de page');
    expect(formatPages(0.5)).toBe('½ page');
    expect(formatPages(0.75)).toBe('¾ de page');
    expect(formatPages(1)).toBe('1 page');
    expect(formatPages(1.5)).toBe('1,5 page');
    expect(formatPages(2)).toBe('2 pages');
    expect(formatPages(10)).toBe('10 pages');
    expect(formatPages(0.25, 'en')).toBe('¼ page');
    expect(formatPages(1, 'en')).toBe('1 page');
    expect(formatPages(1.5, 'en')).toBe('1.5 pages');
  });

  it('graduations, arrondi au pas, temps de lecture', () => {
    expect(PAGE_STEPS.map(tickLabel).slice(0, 4)).toEqual(['¼', '½', '¾', '1']);
    expect(roundToStep(1.08)).toBe(1);
    expect(roundToStep(1.3)).toBe(1.5);
    expect(roundToStep(0.05)).toBe(0.25);
    expect(roundToStep(11.4)).toBe(11);
    expect(roundToStep(0)).toBeNull();
    expect(readingMinutes(450)).toBe(2);
    expect(readingMinutes(60)).toBe(1);
  });
});

describe('la feuille du PDF que l’estimation rejoue', () => {
  // L'estimation reproduit la mise en page de src/utils/pdf.js. Retoucher une
  // de ces valeurs sans recalibrer fausserait toutes les longueurs.
  const pdf = readFileSync(new URL('../utils/pdf.js', import.meta.url), 'utf8');
  const draw = readFileSync(new URL('./pdf/draw.js', import.meta.url), 'utf8');

  /** Une règle de PDF_STYLES : du sélecteur à l'accolade qui la ferme (seule sur sa ligne). */
  const rule = (selector) => {
    const at = pdf.indexOf(`${selector} {`);
    if (at === -1) return '';
    return pdf.slice(at, pdf.indexOf('\n      }', at));
  };

  it('police, interligne, marges et retraits inchangés', () => {
    expect(rule('.pdf-container')).toMatch(
      /line-height: 1\.6;[\s\S]*padding: 20px;[\s\S]*font-size: 11pt;/,
    );
    expect(rule('.pdf-content h1')).toMatch(
      /font-size: 15pt;\s*margin-top: 20px;\s*margin-bottom: 10px;/,
    );
    expect(rule('.pdf-content h2')).toMatch(
      /font-size: 13pt;\s*margin-top: 15px;\s*margin-bottom: 8px;/,
    );
    expect(rule('.pdf-content h3')).toMatch(
      /font-size: 12pt;\s*margin-top: 12px;\s*margin-bottom: 6px;/,
    );
    expect(rule('.pdf-content p')).toMatch(/margin: 8px 0;/);
    expect(rule('.pdf-content ul, .pdf-content ol')).toMatch(
      /margin: 10px 0;\s*padding-left: 25px;/,
    );
    expect(pdf).toMatch(/\.pdf-content ol ol \{\s*margin: 4px 0;\s*padding-left: 20px;/);
    expect(rule('.pdf-content li')).toMatch(/margin: 3px 0;/);
    expect(pdf).toMatch(/tempDiv\.style\.width = '210mm';/);
    expect(draw).toMatch(/PAGE = \{ width: 210, height: 297, margin: 15, footer: 15 \}/);
  });
});
