/**
 * Substitution des `{clé}` des textes de uiText.js.
 *
 * Ce qui casserait sans ces tests : `fill` remplace une vingtaine de copies
 * locales qui toutes remplaçaient CHAQUE occurrence et rendaient '' pour un
 * gabarit absent ; une régression se verrait dans autant d'écrans à la fois.
 * `formatText`, lui, ne remplace que la première occurrence (règle historique
 * de formatMessage).
 */
import { describe, it, expect } from 'vitest';
import { fill, formatText } from './i18nFormat.js';

describe('fill', () => {
  it('remplace toutes les occurrences de chaque clé', () => {
    expect(fill('{n} sur {n} — {who}', { n: 3, who: 'Alex' })).toBe('3 sur 3 — Alex');
  });

  it('laisse en place une clé sans valeur, et rend "" pour un gabarit absent', () => {
    expect(fill('Bonjour {name}', {})).toBe('Bonjour {name}');
    expect(fill(undefined, { n: 1 })).toBe('');
    expect(fill('Sans variable')).toBe('Sans variable');
  });

  it('insère la valeur telle quelle, `$&` et `$1` compris', () => {
    expect(fill('Compte : {name}', { name: 'Prix $& et $1' })).toBe('Compte : Prix $& et $1');
  });
});

describe('formatText', () => {
  const dict = { a: { b: 'De {x} à {x}' } };

  it('résout un chemin pointé et ne remplace que la première occurrence', () => {
    expect(formatText(dict, 'a.b', { x: 1 })).toBe('De 1 à {x}');
  });

  it('rend le chemin lui-même quand la clé manque', () => {
    expect(formatText(dict, 'a.zz')).toBe('a.zz');
  });
});
