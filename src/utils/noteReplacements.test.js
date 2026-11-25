/**
 * Ce qu'on retient des remplacements écrits dans les notes. Ce que ces tests
 * protègent : un mot mal transcrit est retenu pour les réunions suivantes — et
 * une note qui PARLE de remplacer quelque chose ne devient jamais une règle qui
 * réécrit toutes les transcriptions à venir.
 */
import { describe, it, expect } from 'vitest';
import { learnableReplacements, soundAlike } from './noteReplacements.js';

const learned = (notes) => learnableReplacements(notes).map(({ from, to }) => `${from} → ${to}`);

describe('learnableReplacements — ce qui est retenu', () => {
  it('la consigne explicite d’un nom mal transcrit', () => {
    expect(learned('Remplace Alexe par Alex')).toEqual(['Alexe → Alex']);
    expect(learned('Remplacer Durend par Durand.')).toEqual(['Durend → Durand']);
    expect(learned('Replace Market with Marquet')).toEqual(['Market → Marquet']);
    expect(learned('corrige Klobex en Globex')).toEqual(['Klobex → Globex']);
  });

  it('la flèche, sous ses trois écritures', () => {
    expect(learned('Colinnet → Collinet\nSaufi -> Sophie\nFabrican => Fabrikam')).toEqual([
      'Colinnet → Collinet',
      'Saufi → Sophie',
      'Fabrican → Fabrikam',
    ]);
  });

  it('guillemets, puces et annonces ne font pas partie du mot', () => {
    expect(learned('- Remplace « Alexe » par « Alex » !')).toEqual(['Alexe → Alex']);
    expect(learned('• "Durend" → "Durand"')).toEqual(['Durend → Durand']);
    expect(learned('Remplace partout le nom Durend par Durand')).toEqual(['Durend → Durand']);
  });

  it('un sigle que la transcription écrit comme on le dit', () => {
    expect(learned('Remplace la dévé par l’ADV')).toEqual(['la dévé → l’ADV']);
    expect(learned('Remplace ADB par ADV')).toEqual(['ADB → ADV']);
  });

  it('plusieurs consignes, une seule fois chacune, dans l’ordre des notes', () => {
    expect(
      learned(
        'Point budget avec Sophie\nRemplace Alexe par Alex\nKlobex → Globex ; remplace alexe par Alex',
      ),
    ).toEqual(['Alexe → Alex', 'Klobex → Globex']);
  });

  it('plusieurs dizaines de consignes : toutes lues', () => {
    const notes = Array.from(
      { length: 60 },
      (_, i) =>
        `Remplace Durend${'abcdefghij'[i % 10]}${'klmnop'[i % 6]}${i} par Durand${'abcdefghij'[i % 10]}${'klmnop'[i % 6]}${i}`,
    ).join('\n');
    expect(learnableReplacements(notes)).toHaveLength(60);
  });
});

describe('learnableReplacements — ce qui ne vaut que pour la réunion', () => {
  it('une note qui parle de remplacer quelqu’un ou quelque chose', () => {
    for (const notes of [
      'Remplacer Paul par Marie sur le projet Atlas',
      'Remplacer Paul par Marie',
      'On remplace le fournisseur par un autre',
      'Remplacer Excel par un vrai outil',
      'changer le planning en fonction du budget',
      'corrige la transcription en direct',
    ]) {
      expect(learned(notes), notes).toEqual([]);
    }
  });

  it('une flèche qui n’est pas une correction', () => {
    for (const notes of ['Budget → validé', 'Livraison → 12 mars', 'Action → Camille']) {
      expect(learned(notes), notes).toEqual([]);
    }
  });

  it('deux mots qui ne se ressemblent pas à l’oreille', () => {
    expect(learned('Remplace Bob par Robert')).toEqual([]);
    expect(learned('Remplace Durand par Dupont')).toEqual([]);
  });

  it('un mot courant, un terme trop court', () => {
    expect(learned('Remplace sa par ça')).toEqual([]);
    expect(learned('Remplace et par est')).toEqual([]);
    expect(learned('Remplace Al par Hal')).toEqual([]);
    // Se prononce presque pareil — mais « cette » est dans une phrase sur deux.
    expect(learned('Remplace cette par sept')).toEqual([]);
  });

  it('deux textes qui ne diffèrent que par un nombre', () => {
    expect(learned('Remplace lot 12 par lot 2')).toEqual([]);
    expect(learned('Remplace le 12 mars par le 2 mars')).toEqual([]);
  });

  it('un passage entier, ou rien à remplacer', () => {
    expect(learned('Remplace on se voit mardi matin au bureau par on se voit mardi')).toEqual([]);
    expect(learned('Remplace Durand par Durand')).toEqual([]);
    expect(learned('')).toEqual([]);
    expect(learned(null)).toEqual([]);
  });

  it('un sigle défini n’est pas un remplacement', () => {
    expect(learned('SAL : système d’aide pour les lentilles')).toEqual([]);
  });
});

describe('soundAlike', () => {
  it('le même mot entendu de travers', () => {
    expect(soundAlike('Alexe', 'Alex')).toBe(true);
    expect(soundAlike('Klobex', 'Globex')).toBe(true);
    expect(soundAlike('adévé', 'ADV')).toBe(true);
  });

  it('un autre mot', () => {
    expect(soundAlike('Marc', 'Sophie')).toBe(false);
    expect(soundAlike('Budget', 'validé')).toBe(false);
  });
});
