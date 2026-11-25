/**
 * « Ça se prononce pareil ». Ce que ces tests protègent : les écarts qu'une
 * transcription fait vraiment sont rattrapés, et un AUTRE mot ne l'est pas —
 * un mot d'appel qui se déclenche sur n'importe quoi ferait couper la fonction.
 */
import { describe, it, expect } from 'vitest';
import { soundsLike, phoneticKey, editDistance, closestName, plainLetters } from './soundsLike.js';
import * as server from '../../services/api/lib/aiHelp/soundsLike.js';

describe('soundsLike', () => {
  it('rattrape ce que la transcription écrit pour « Alfred »', () => {
    for (const heard of [
      'Alfred',
      'alfred',
      'Alfréd',
      'Alfrède',
      'Alfret',
      'Alfrette',
      'Alfreds',
      'Halfred',
      'Alfraid',
      'Alfed',
      'Elfred',
      'Aflred',
      'Al-Fred',
    ]) {
      expect(soundsLike(heard, 'Alfred'), heard).toBe(true);
    }
  });

  it('ne prend pas un autre mot pour lui', () => {
    for (const heard of ['Alfredo', 'Albert', 'Wilfried', 'Alfa', 'Fred', 'Alors', 'Offre', '']) {
      expect(soundsLike(heard, 'Alfred'), heard).toBe(false);
    }
  });

  it('un mot court ne tolère rien : « Max » n’est pas « mais »', () => {
    expect(soundsLike('mais', 'Max')).toBe(false);
    expect(soundsLike('Mac', 'Max')).toBe(false);
    expect(soundsLike('max', 'Max')).toBe(true);
    // Quatre lettres : la prononciation seule, pas une lettre d'écart.
    expect(soundsLike('Jades', 'Jade')).toBe(true);
    expect(soundsLike('Jude', 'Jade')).toBe(false);
  });

  it('les noms qu’on écorche en réunion', () => {
    expect(soundsLike('Market', 'Marquet')).toBe(true);
    expect(soundsLike('Ambr', 'Ambre')).toBe(true);
    expect(soundsLike('Fabricam', 'Fabrikam')).toBe(true);
    // Deux lettres d'écart sur un mot long.
    expect(soundsLike('Colinnet', 'Collinet')).toBe(true);
    // « Arbre » est un autre mot que « Ambre » : c'est la recherche qui le
    // rapproche (lib/aiHelp/brainSearch.js), pas la prononciation.
    expect(soundsLike('Arbre', 'Ambre')).toBe(true);
    expect(soundsLike('Fibre', 'Ambre')).toBe(false);
  });
});

describe('phoneticKey, editDistance', () => {
  it('réduit le français écrit à ce qui s’entend', () => {
    expect(phoneticKey('Philippe')).toBe(phoneticKey('Filip'));
    expect(phoneticKey('Bureau')).toBe(phoneticKey('Buro'));
    expect(phoneticKey('Quentin')).toBe(phoneticKey('Kentin'));
    expect(phoneticKey('Hélène')).toBe(phoneticKey('Elen'));
  });

  it('compte une transposition pour un, et s’arrête au-delà du plafond', () => {
    expect(editDistance('alfred', 'aflred')).toBe(1);
    expect(editDistance('alfred', 'alfred')).toBe(0);
    expect(editDistance('alfred', 'albert')).toBe(3);
    expect(editDistance('alfred', 'zzzzzz', 1)).toBe(2);
    expect(plainLetters('Élodie-Anne !')).toBe('elodieanne');
  });
});

describe('closestName — le tag, le template qu’on a voulu dire', () => {
  const tags = ['Atlas', 'Marquet', 'Comité de pilotage', 'Comité de direction'];

  it('le même nom, casse et accents à part', () => {
    expect(closestName(tags, 'atlas')).toBe('Atlas');
    expect(closestName(tags, 'comite de pilotage')).toBe('Comité de pilotage');
  });

  it('un nom écorché, s’il n’en désigne qu’un', () => {
    expect(closestName(tags, 'Market')).toBe('Marquet');
    expect(closestName(tags, 'Atlass')).toBe('Atlas');
  });

  it('rien plutôt qu’un nom pris au hasard', () => {
    expect(closestName(tags, 'Budget')).toBeNull();
    expect(closestName(['Lot 12', 'Lot 13'], 'Lot 14')).toBeNull();
    expect(closestName(['Marten', 'Martin'], 'Martyn')).toBeNull(); // deux candidats
    expect(closestName(tags, '')).toBeNull();
  });
});

describe('parité avec le serveur', () => {
  it('les deux copies rendent le même verdict', () => {
    const wanted = ['Alfred', 'Marquet', 'Ambre', 'Max', 'Comité de pilotage', 'Collinet'];
    const heard = [
      'Alfrède',
      'Alfredo',
      'Halfred',
      'Market',
      'Arbre',
      'mais',
      'comite de pilotage',
      'Colinnet',
      'Albert',
      '',
    ];
    for (const w of wanted) {
      for (const h of heard) {
        expect(server.soundsLike(h, w), `${h} / ${w}`).toBe(soundsLike(h, w));
      }
      expect(server.phoneticKey(w)).toBe(phoneticKey(w));
    }
    expect(server.closestName(wanted, 'Market')).toBe(closestName(wanted, 'Market'));
  });
});
