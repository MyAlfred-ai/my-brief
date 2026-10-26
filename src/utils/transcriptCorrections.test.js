/**
 * Corrections automatiques de la transcription : ce que l'écran
 * d'administration promet (mots entiers, casse et accents indifférents, aucune
 * correction en chaîne, ce qui est juste ne bouge pas) et les diagnostics qui
 * retiennent l'administrateur d'une correction trop large.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  compileCorrections,
  normalizeRules,
  checkRows,
  rowsToRules,
  rulesToRows,
  rowsKey,
  splitVariants,
  flashCorrections,
  foldKey,
  CORRECTIONS_MAX,
  VARIANTS_MAX,
} from './transcriptCorrections.js';

const fix = (rules, text) => compileCorrections(rules).apply(text);

describe('compileCorrections — correspondance', () => {
  const rules = [
    { from: ['Klobex', 'Clobex'], to: 'Globex' },
    { from: ['my alfred'], to: 'MyAlfred' },
  ];

  it('remplace chaque variante, mot entier', () => {
    expect(fix(rules, 'On a revu Klobex hier, puis Clobex.')).toBe(
      'On a revu Globex hier, puis Globex.',
    );
  });

  it('ignore majuscules et accents', () => {
    expect(fix(rules, 'KLOBEX et klobèx')).toBe('Globex et Globex');
  });

  it("ne touche jamais l'intérieur d'un mot", () => {
    const paul = [{ from: ['Paul'], to: 'Pol' }];
    expect(fix(paul, 'Paulette et Saint-Paulin ont vu Paul.')).toBe(
      'Paulette et Saint-Paulin ont vu Pol.',
    );
  });

  it("accepte espaces multiples et trait d'union entre les mots du terme", () => {
    expect(fix(rules, 'Chez my  alfred et my-alfred.')).toBe('Chez MyAlfred et MyAlfred.');
  });

  it('apostrophe droite ou courbe', () => {
    const adv = [{ from: ["l'adévé"], to: "l'ADV" }];
    expect(fix(adv, 'Voir l’adévé demain.')).toBe("Voir l'ADV demain.");
  });

  it('garde la majuscule de début de phrase', () => {
    const adv = [{ from: ['la dévé'], to: "l'ADV" }];
    expect(fix(adv, 'La dévé valide. Puis la dévé signe.')).toBe("L'ADV valide. Puis l'ADV signe.");
  });

  it('respecte une graphie de marque à majuscule intérieure', () => {
    const phone = [{ from: ['aille phone'], to: 'iPhone' }];
    expect(fix(phone, 'Aille phone en panne.')).toBe('iPhone en panne.');
  });

  it("le terme le plus long l'emporte, en un seul passage", () => {
    const r = [
      { from: ['alfred'], to: 'Alfred' },
      { from: ['my alfred ai'], to: 'MyAlfred AI' },
    ];
    expect(fix(r, 'Chez my alfred ai, alfred dirige.')).toBe('Chez MyAlfred AI, Alfred dirige.');
  });

  it('jamais de correction en chaîne', () => {
    const r = [
      { from: ['aa bb'], to: 'cc dd' },
      { from: ['cc dd'], to: 'ee ff' },
    ];
    expect(fix(r, 'aa bb')).toBe('cc dd');
  });

  it('ce qui est déjà juste ne bouge pas (idempotence)', () => {
    const r = [{ from: ['Alfred'], to: 'Alfred Dupont' }];
    expect(fix(r, 'Alfred Dupont arrive.')).toBe('Alfred Dupont arrive.');
    expect(fix(r, 'Alfred arrive.')).toBe('Alfred Dupont arrive.');
    const once = fix(rules, 'Klobex, my alfred, Clobex.');
    expect(fix(rules, once)).toBe(once);
  });

  it('corrige la casse quand le mot juste ne diffère que par elle', () => {
    expect(fix([{ from: ['globex'], to: 'Globex' }], 'chez globex')).toBe('chez Globex');
  });

  it('sans correction, le texte est rendu tel quel', () => {
    const c = compileCorrections([]);
    expect(c.size).toBe(0);
    expect(c.apply('Bonjour.')).toBe('Bonjour.');
    expect(fix(rules, 'Rien à voir.')).toBe('Rien à voir.');
  });

  it('parts() signale ce qui a changé, pour le banc d’essai', () => {
    expect(compileCorrections(rules).parts('Voir Klobex.')).toEqual([
      { text: 'Voir ', changed: false },
      { text: 'Globex', changed: true },
      { text: '.', changed: false },
    ]);
  });
});

describe('normalizeRules', () => {
  it('nettoie, dédoublonne sur toute la liste et écarte les lignes vides', () => {
    expect(
      normalizeRules([
        { from: ['  Klobex ', 'klobèx', ''], to: ' Globex ' },
        { from: ['KLOBEX'], to: 'Autre' },
        { from: ['x'], to: 'Y' },
        { from: ['Globex'], to: 'Globex' },
        { from: ['seul'], to: '' },
        null,
      ]),
    ).toEqual([{ from: ['Klobex'], to: 'Globex' }]);
  });

  it('borne le nombre de lignes et de variantes', () => {
    const many = Array.from({ length: CORRECTIONS_MAX + 5 }, (_, i) => ({
      from: Array.from({ length: VARIANTS_MAX + 3 }, (_, j) => `terme${i}x${j}`),
      to: `Juste${i}`,
    }));
    const out = normalizeRules(many);
    expect(out).toHaveLength(CORRECTIONS_MAX);
    expect(out[0].from).toHaveLength(VARIANTS_MAX);
  });

  it('refuse une entrée qui n’est pas une liste', () => {
    expect(normalizeRules(null)).toEqual([]);
    expect(normalizeRules('Klobex')).toEqual([]);
  });
});

describe('lignes de l’écran', () => {
  it('variantes séparées par des virgules, aller-retour stable', () => {
    expect(splitVariants(' Klobex ,Clobex,, ')).toEqual(['Klobex', 'Clobex']);
    const rows = rulesToRows([{ from: ['Klobex', 'Clobex'], to: 'Globex' }]);
    expect(rows[0]).toMatchObject({ from: 'Klobex, Clobex', to: 'Globex' });
    expect(rows[0].id).toBeTruthy();
    expect(rowsToRules([...rows, { id: 'vide', from: '', to: '' }])).toEqual([
      { from: ['Klobex', 'Clobex'], to: 'Globex' },
    ]);
  });

  it('rowsKey : une ligne commencée compte, une ligne vide non', () => {
    const saved = rulesToRows([{ from: ['Klobex', 'Clobex'], to: 'Globex' }]);
    const key = rowsKey(saved);
    expect(rowsKey([...saved, { id: 'v', from: ' ', to: '' }])).toBe(key);
    expect(rowsKey([{ id: 'a', from: 'Klobex ,Clobex', to: ' Globex' }])).toBe(key);
    expect(rowsKey([...saved, { id: 'n', from: 'Durant', to: '' }])).not.toBe(key);
  });

  it('checkRows : erreurs bloquantes, avertissements, ligne vide muette', () => {
    const verdicts = checkRows([
      { from: '', to: '' },
      { from: '', to: 'Globex' },
      { from: 'Klobex', to: '' },
      { from: 'x', to: 'Y' },
      { from: 'Globex', to: 'Globex' },
      { from: 'Klobex, Paul', to: 'Globex' },
      { from: 'le', to: 'LE' },
      { from: 'ca', to: 'CA' },
      { from: 'adv', to: 'ADV' },
      { from: 'Durant', to: 'Durand' },
    ]);
    expect(verdicts.map((v) => v && `${v.level}:${v.code}`)).toEqual([
      null,
      'error:missingFrom',
      'error:missingTo',
      'error:tooShort',
      'error:sameAsTarget',
      'error:duplicate',
      'warn:common',
      'warn:common',
      'warn:short',
      null,
    ]);
    expect(verdicts[5].term).toBe('Klobex');
  });

  it('checkRows : trop de variantes', () => {
    const from = Array.from({ length: VARIANTS_MAX + 1 }, (_, i) => `mot${i}`).join(', ');
    expect(checkRows([{ from, to: 'Juste' }])[0]).toMatchObject({ code: 'tooManyVariants' });
  });

  it('foldKey unifie casse, accents, espaces et apostrophes', () => {
    expect(foldKey('  L’Ad-vé  ')).toBe("l'ad ve");
  });
});

describe('flashCorrections', () => {
  afterEach(() => vi.useRealTimers());

  it('allume les mots corrigés de la ligne visée, puis retire le marqueur', () => {
    vi.useFakeTimers();
    const line = { text: 'Chez Globex demain.' };
    const other = { text: 'Autre ligne.' };
    let history = [other, line];
    const update = (up) => (history = up(history));
    flashCorrections([{ line, original: 'Chez Klobex demain.' }], update, 100);
    expect(history[0]).toBe(other);
    expect(history[1].refineFlash.tokens.filter((t) => t.changed).map((t) => t.word)).toEqual([
      'Globex',
    ]);
    vi.advanceTimersByTime(100);
    expect(history[1].refineFlash).toBeUndefined();
    expect(history[1].text).toBe('Chez Globex demain.');
  });

  it('ne fait rien sans correction', () => {
    const update = vi.fn();
    flashCorrections([], update);
    flashCorrections(undefined, update);
    expect(update).not.toHaveBeenCalled();
  });
});
