import { describe, it, expect } from 'vitest';
import { transcriptEdits } from './transcriptReplace.js';
import { replacePassage } from './transcriptCorrections.js';

const line = (itemId, text, extra = {}) => ({ itemId, text, ...extra });
const keyOf = (item) => item.itemId;

const MEETING = [
  line('a', 'On livre chez Market le 12 mars.'),
  line('b', 'market a validé le devis, Paulette aussi.'),
  line('c', 'Paul rappelle Market demain.'),
  line('d', 'Alfred, remplace partout Market par Marquet.'),
  line('e', 'Et chez Wirk', { isDelta: true }),
];

describe('replacePassage — un passage, lu comme une correction automatique', () => {
  it('mot entier, casse et accents indifférents, majuscule de début de phrase gardée', () => {
    expect(replacePassage('Paul et Paulette, puis paul.', 'paul', 'Pol')).toEqual({
      text: 'Pol et Paulette, puis Pol.',
      count: 2,
    });
    expect(replacePassage('Le comité Élargi siège.', 'comite elargi', 'CODIR').text).toBe(
      'Le CODIR siège.',
    );
    expect(replacePassage('On voit la dévé. La dévé facture.', 'la dévé', "l'ADV").text).toBe(
      "On voit l'ADV. L'ADV facture.",
    );
  });

  it('une phrase entière se réécrit ; un passage absent, ou vide, ne change rien', () => {
    expect(
      replacePassage(
        'Hugo : la livraison est le 2 mars.',
        'la livraison est le 2 mars',
        'la livraison est le 12 mars',
      ),
    ).toEqual({ text: 'Hugo : la livraison est le 12 mars.', count: 1 });
    expect(replacePassage('Rien à voir.', 'Market', 'Marquet')).toEqual({
      text: 'Rien à voir.',
      count: 0,
    });
    expect(replacePassage('Rien à voir.', '  ', 'x').count).toBe(0);
  });

  it('un remplacement vide retire le passage', () => {
    expect(replacePassage('Budget de euh 120 000 euros.', 'euh', '').text).toBe(
      'Budget de  120 000 euros.',
    );
  });
});

describe('transcriptEdits — les lignes à réécrire', () => {
  it('« partout » : toutes les prises de parole, sauf la demande et la ligne en cours', () => {
    expect(
      transcriptEdits(
        MEETING,
        [{ find: 'Market', with: 'Marquet', all: true, skipKey: 'd' }],
        keyOf,
      ),
    ).toEqual([
      { index: 0, text: 'On livre chez Marquet le 12 mars.' },
      { index: 1, text: 'Marquet a validé le devis, Paulette aussi.' },
      { index: 2, text: 'Paul rappelle Marquet demain.' },
    ]);
  });

  it('sans « partout » : la plus récente seulement', () => {
    expect(
      transcriptEdits(MEETING, [{ find: 'market', with: 'Marquet', skipKey: 'd' }], keyOf),
    ).toEqual([{ index: 2, text: 'Paul rappelle Marquet demain.' }]);
  });

  it('une demande écrite ne désigne aucune ligne : la dernière phrase dite compte aussi', () => {
    expect(transcriptEdits(MEETING, [{ find: 'Market', with: 'Marquet' }], keyOf)).toEqual([
      { index: 3, text: 'Alfred, remplace partout Marquet par Marquet.' },
    ]);
  });

  it('une phrase adressée à l’IA plus tôt n’est pas réécrite non plus', () => {
    expect(
      transcriptEdits(
        MEETING,
        [{ find: 'Market', with: 'Marquet', all: true }],
        keyOf,
        new Set(['d']),
      ).map((change) => change.index),
    ).toEqual([0, 1, 2]);
  });

  it('deux corrections de suite : la seconde lit ce que la première a laissé, chaque ligne ne part qu’une fois', () => {
    expect(
      transcriptEdits(
        MEETING.slice(0, 3),
        [
          { find: 'Market', with: 'Marquet', all: true },
          { find: 'chez Marquet', with: 'à Lyon', all: true },
        ],
        keyOf,
      ),
    ).toEqual([
      { index: 0, text: 'On livre à Lyon le 12 mars.' },
      { index: 1, text: 'Marquet a validé le devis, Paulette aussi.' },
      { index: 2, text: 'Paul rappelle Marquet demain.' },
    ]);
  });

  it('retirer un passage resserre les espaces — mais ne vide jamais une prise de parole', () => {
    const items = [line('a', 'Budget de euh 120 000 euros.'), line('b', 'Euh.')];
    expect(transcriptEdits(items, [{ find: 'euh', with: '', all: true }], keyOf)).toEqual([
      { index: 0, text: 'Budget de 120 000 euros.' },
    ]);
  });

  it('rien à corriger, ou des entrées de travers : aucune ligne', () => {
    expect(transcriptEdits(MEETING, [{ find: 'Globex', with: 'Initech', all: true }])).toEqual([]);
    // Déjà écrit ainsi : rien à réécrire. Seule la casse diffère : elle est corrigée.
    expect(
      transcriptEdits(MEETING.slice(0, 1), [{ find: 'Market', with: 'Market', all: true }]),
    ).toEqual([]);
    expect(
      transcriptEdits(MEETING.slice(1, 2), [{ find: 'Market', with: 'Market', all: true }]),
    ).toEqual([{ index: 0, text: 'Market a validé le devis, Paulette aussi.' }]);
    expect(transcriptEdits(null, [{ find: 'a', with: 'b' }])).toEqual([]);
    expect(transcriptEdits(MEETING, null)).toEqual([]);
  });
});
