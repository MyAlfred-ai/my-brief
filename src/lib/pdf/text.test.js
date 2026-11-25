import { describe, expect, it } from 'vitest';
import {
  applyTextTransform,
  clustersOf,
  colorAt,
  isEmojiCluster,
  isWinAnsi,
  markerText,
  onWhite,
  parseLinearGradient,
  parseRgb,
  stripIgnorable,
  wordsOf,
} from './text.js';

describe('clustersOf — un emoji ne se découpe jamais', () => {
  it.each([
    ['séquence ZWJ', '👩‍💻'],
    ['teinte de peau', '👍🏽'],
    ['drapeau', '🇫🇷'],
    ['touche', '1️⃣'],
    ['lettre + accent combinant', 'e\u{301}'],
  ])('%s', (_, cluster) => {
    expect(clustersOf(`a${cluster}b`).map((c) => c.text)).toEqual(['a', cluster, 'b']);
  });

  it('donne la position de chaque grappe dans la chaîne', () => {
    expect(clustersOf('✅ ok')).toEqual([
      { text: '✅', index: 0 },
      { text: ' ', index: 1 },
      { text: 'o', index: 2 },
      { text: 'k', index: 3 },
    ]);
  });
});

describe('isEmojiCluster — ce que le navigateur dessine en emoji', () => {
  it.each(['📝', '✅', '⚠️', '👩‍💻', '🇫🇷', '1️⃣', '©️'])('%s : emoji', (c) => {
    expect(isEmojiCluster(c)).toBe(true);
  });

  // Pictogrammes à présentation TEXTE par défaut : la police les dessine.
  it.each(['©', '™', '→', '↔', '✓', '⚠', 'é', '•'])('%s : texte', (c) => {
    expect(isEmojiCluster(c)).toBe(false);
  });
});

describe('stripIgnorable', () => {
  it('retire les invisibles qui tronqueraient le texte dans jsPDF', () => {
    expect(stripIgnorable('ré\u{AD}su\u{200B}mé\u{FEFF} ↔\u{FE0E}')).toBe('résumé ↔');
  });
});

describe('wordsOf', () => {
  it("découpe sur tout blanc, espaces insécables compris, et note l'espace qui suit", () => {
    expect(wordsOf('axes\u{A0}: la ')).toEqual([
      { start: 0, end: 4, spaceAfter: true },
      { start: 5, end: 6, spaceAfter: true },
      { start: 7, end: 9, spaceAfter: true },
    ]);
  });

  it("pas d'espace après le dernier mot collé à la fin du nœud", () => {
    expect(wordsOf('  sauvegarde')).toEqual([{ start: 2, end: 12, spaceAfter: false }]);
  });

  it('nœud blanc : aucun mot', () => {
    expect(wordsOf(' \n ')).toEqual([]);
  });
});

describe('markerText — puces et numéros comme le navigateur les écrit', () => {
  it.each([
    ['disc', 1, '• '],
    ['circle', 1, '◦ '],
    ['square', 1, '▪ '],
    ['decimal', 12, '12. '],
    ['decimal-leading-zero', 3, '03. '],
    ['lower-alpha', 28, 'ab. '],
    ['upper-latin', 2, 'B. '],
    ['lower-roman', 14, 'xiv. '],
    ['upper-roman', 1999, 'MCMXCIX. '],
    ['armenian', 4, '4. '],
  ])('%s n°%i → %j', (type, n, expected) => {
    expect(markerText(type, n)).toBe(expected);
  });

  it('none : pas de marqueur', () => {
    expect(markerText('none', 1)).toBeNull();
  });
});

describe('couleurs', () => {
  it('lit rgb() et rgba(), virgules ou barre oblique', () => {
    expect(parseRgb('rgb(99, 102, 241)')).toEqual([99, 102, 241, 1]);
    expect(parseRgb('rgba(0, 0, 0, 0)')).toEqual([0, 0, 0, 0]);
    expect(parseRgb('rgb(10 20 30 / 50%)')).toEqual([10, 20, 30, 0.5]);
  });

  it('renvoie null pour une autre syntaxe (confiée au canvas)', () => {
    expect(parseRgb('oklch(71% 0.176 59)')).toBeNull();
    expect(parseRgb('color(srgb 1 0.5 0)')).toBeNull();
  });

  it('pose une couleur translucide sur le blanc de la page', () => {
    expect(onWhite([0, 0, 0, 0.5])).toEqual([128, 128, 128]);
    expect(onWhite([30, 41, 59, 1])).toEqual([30, 41, 59]);
  });
});

describe('divers', () => {
  it('text-transform', () => {
    expect(applyTextTransform('résumé', 'uppercase')).toBe('RÉSUMÉ');
    expect(applyTextTransform('Résumé', 'none')).toBe('Résumé');
  });

  it('WinAnsi (Courier) : Latin-1 et les 27 caractères de 0x80–0x9F', () => {
    expect([...'aé€’œ—'].every((c) => isWinAnsi(c.codePointAt(0)))).toBe(true);
    expect([...'→≥ł'].some((c) => isWinAnsi(c.codePointAt(0)))).toBe(false);
  });
});

describe('parseLinearGradient — ce que getComputedStyle rend des dégradés de la feuille', () => {
  it('horizontal : 90deg ou to right ; vertical : 180deg, to bottom ou sans direction', () => {
    const stops = [
      { at: 0, color: [243, 132, 0] },
      { at: 1, color: [255, 175, 0] },
    ];
    const css = 'rgb(243, 132, 0), rgb(255, 175, 0)';
    expect(parseLinearGradient(`linear-gradient(90deg, ${css})`)).toEqual({ axis: 'x', stops });
    expect(parseLinearGradient(`linear-gradient(to right, ${css})`)).toEqual({ axis: 'x', stops });
    expect(parseLinearGradient(`linear-gradient(180deg, ${css})`)).toEqual({ axis: 'y', stops });
    expect(parseLinearGradient(`linear-gradient(to bottom, ${css})`)).toEqual({ axis: 'y', stops });
    expect(parseLinearGradient(`linear-gradient(${css})`)).toEqual({ axis: 'y', stops });
  });

  it('lit les positions, répartit celles qui manquent, pose le translucide sur le blanc', () => {
    const g = parseLinearGradient(
      'linear-gradient(90deg, rgb(0, 0, 0) 10%, rgba(0, 0, 255, 0.5), rgb(255, 0, 0) 90%)',
    );
    expect(g.stops.map((s) => s.at)).toEqual([0.1, 0.5, 0.9]);
    expect(g.stops[1].color).toEqual([128, 128, 255]);
  });

  it('ignore ce que le PDF ne sait pas peindre : oblique, image, couches multiples', () => {
    expect(parseLinearGradient('none')).toBeNull();
    expect(parseLinearGradient('linear-gradient(45deg, rgb(0, 0, 0), rgb(1, 1, 1))')).toBeNull();
    expect(parseLinearGradient('radial-gradient(rgb(0, 0, 0), rgb(1, 1, 1))')).toBeNull();
    expect(parseLinearGradient('linear-gradient(90deg, rgb(0, 0, 0))')).toBeNull();
    expect(
      parseLinearGradient('linear-gradient(90deg, rgb(0, 0, 0), rgb(1, 1, 1)), url("a.png")'),
    ).toBeNull();
    expect(
      parseLinearGradient('linear-gradient(90deg, oklch(0.7 0.1 50), rgb(1, 1, 1))'),
    ).toBeNull();
  });

  it('colorAt interpole entre les arrêts et borne aux extrémités', () => {
    const stops = [
      { at: 0.2, color: [0, 0, 0] },
      { at: 0.6, color: [200, 100, 0] },
      { at: 1, color: [200, 100, 200] },
    ];
    expect(colorAt(stops, 0)).toEqual([0, 0, 0]);
    expect(colorAt(stops, 0.4)).toEqual([100, 50, 0]);
    expect(colorAt(stops, 0.8)).toEqual([200, 100, 100]);
    expect(colorAt(stops, 1)).toEqual([200, 100, 200]);
  });
});
