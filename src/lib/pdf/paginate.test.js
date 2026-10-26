import { describe, expect, it } from 'vitest';
import { lineGroups, pageIndexOf, paginate, slicesOf } from './paginate.js';

/** Une ligne de texte de 17 px de haut, au pas de 23,5 px (interligne 1,6). */
const line = (n, extra = {}) => ({ top: 20 + n * 23.5, bottom: 37 + n * 23.5, ...extra });

describe('lineGroups', () => {
  it('rassemble les mots, soulignés et liens d’une même ligne', () => {
    const atoms = [
      { top: 20, bottom: 37 },
      { top: 20, bottom: 37 },
      { top: 34.9, bottom: 35.9 }, // soulignement, dans son mot
      { top: 43.5, bottom: 60.5 }, // ligne suivante
    ];
    expect(lineGroups(atoms)).toEqual([
      { top: 20, bottom: 37, keepWithNext: false },
      { top: 43.5, bottom: 60.5, keepWithNext: false },
    ]);
  });

  it('garde séparé un filet qui touche la ligne sans la chevaucher', () => {
    expect(
      lineGroups([
        { top: 0, bottom: 17 },
        { top: 17, bottom: 19 },
      ]),
    ).toHaveLength(2);
  });

  it('trie, ignore les atomes vides, propage « garder avec la suite »', () => {
    const groups = lineGroups([
      { top: 50, bottom: 60 },
      { top: 5, bottom: 5 },
      { top: 0, bottom: 10, keepWithNext: true },
    ]);
    expect(groups).toEqual([
      { top: 0, bottom: 10, keepWithNext: true },
      { top: 50, bottom: 60, keepWithNext: false },
    ]);
  });
});

describe('bloc insécable (data-pdf-keep)', () => {
  it('fond en une ligne tout ce qu’il recouvre : la coupe passe avant ou après', () => {
    // Un graphique de 120 px : titre, barres (fonds, hors atomes), graduations.
    const keep = { role: 'keep', top: 100, bottom: 220 };
    const lines = lineGroups([
      line(0),
      line(1),
      keep,
      { top: 100, bottom: 117, keepWithNext: true }, // titre du graphique
      { top: 200, bottom: 212 }, // graduations sous les barres
      { top: 240, bottom: 257 }, // paragraphe suivant
    ]);
    expect(lines.map(({ top, bottom }) => [top, bottom])).toEqual([
      [20, 37],
      [43.5, 60.5],
      [100, 220],
      [240, 257],
    ]);
    // Page de 150 px : le bloc ne tient plus sous les deux lignes, il part entier.
    const pages = paginate(lines, 150);
    expect(pages[1].start).toBe(100);
  });

  it('un titre DANS le bloc ne colle pas le bloc au suivant : les blocs se suivent sur la page', () => {
    // Trois sections titrées de 300 px, page de 1 000 px : trois par page,
    // pas une — le titre (garder avec la suite) ne doit pas enchaîner les blocs.
    const atoms = [0, 1, 2, 3].flatMap((n) => [
      { top: n * 300, bottom: n * 300 + 20, keepWithNext: true },
      { role: 'keep', top: n * 300, bottom: n * 300 + 290 },
      { top: n * 300 + 260, bottom: n * 300 + 280 },
    ]);
    const lines = lineGroups(atoms);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.keepWithNext === false)).toBe(true);
    expect(paginate(lines, 1000).map((p) => p.start)).toEqual([0, 900]);
  });
});

describe('paginate', () => {
  it('une seule page quand tout tient', () => {
    expect(paginate([line(0), line(1)], 1000)).toEqual([{ start: 0, end: Infinity }]);
  });

  it('coupe ENTRE deux lignes : la ligne qui déborde ouvre la page suivante', () => {
    const lines = Array.from({ length: 10 }, (_, i) => line(i));
    // Page de 100 px : les lignes 0 à 2 finissent à 84 px, la 3e à 107,5.
    const pages = paginate(lines, 100);
    expect(pages[0]).toEqual({ start: 0, end: lines[3].top });
    expect(pages[1].start).toBe(lines[3].top);
    for (const page of pages) {
      const onPage = lines.filter((l) => l.top >= page.start && l.top < page.end);
      expect(onPage.length).toBeGreaterThan(0);
      for (const l of onPage) expect(l.bottom - page.start).toBeLessThanOrEqual(100);
    }
  });

  it('un titre en bas de page part avec la ligne qui le suit', () => {
    const lines = [line(0), line(1), line(2, { keepWithNext: true }), line(3)];
    const pages = paginate(lines, 100);
    expect(pages.map((p) => p.start)).toEqual([0, lines[2].top]);
  });

  it('deux titres de suite partent ensemble', () => {
    const lines = [
      line(0),
      line(1, { keepWithNext: true }),
      line(2, { keepWithNext: true }),
      line(3),
    ];
    expect(paginate(lines, 100).map((p) => p.start)).toEqual([0, lines[1].top]);
  });

  it('ne vide jamais une page pour garder des titres ensemble', () => {
    const lines = [line(0, { keepWithNext: true }), line(1, { keepWithNext: true }), line(2)];
    // La ligne 2 déborde : seul le premier titre reste, plutôt qu'une page blanche.
    expect(paginate(lines, 80).map((p) => p.start)).toEqual([0, lines[1].top]);
  });

  it('une ligne plus haute qu’une page reste seule sur la sienne', () => {
    const lines = [line(0), { top: 50, bottom: 500 }, line(30)];
    expect(paginate(lines, 100).map((p) => p.start)).toEqual([0, 50, line(30).top]);
  });
});

describe('placement', () => {
  const pages = [
    { start: 0, end: 300 },
    { start: 300, end: 610 },
    { start: 610, end: Infinity },
  ];

  it('pageIndexOf : la page dont l’intervalle contient le sommet', () => {
    expect(pageIndexOf(pages, 0)).toBe(0);
    expect(pageIndexOf(pages, 299.9)).toBe(0);
    expect(pageIndexOf(pages, 300)).toBe(1);
    expect(pageIndexOf(pages, 5000)).toBe(2);
  });

  it('slicesOf : un fond coupé montre sa part sur chaque page, sans déborder', () => {
    expect(slicesOf({ top: 250, bottom: 700 }, pages, 280)).toEqual([
      { page: 0, top: 250, bottom: 280 },
      { page: 1, top: 300, bottom: 580 },
      { page: 2, top: 610, bottom: 700 },
    ]);
  });
});
