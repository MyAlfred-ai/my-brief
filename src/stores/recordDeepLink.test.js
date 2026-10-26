import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  RECORD_HASH,
  recordDeepLink,
  readRecordHash,
  consumeRecordDeepLink,
} from './recordDeepLink.js';

/** Fenêtre factice : ce que le store lit et ce qu'il écrit, rien de plus. */
function fakeWindow(hash, { pathname = '/', search = '' } = {}) {
  const calls = [];
  return {
    location: { hash, pathname, search },
    history: {
      replaceState: (state, title, url) => calls.push({ state, title, url }),
    },
    calls,
  };
}

beforeEach(() => consumeRecordDeepLink());

describe('readRecordHash', () => {
  it('#record : enregistre une demande et efface le hash sans hashchange', () => {
    const win = fakeWindow(RECORD_HASH, { search: '?x=1' });
    expect(readRecordHash(win)).toBe(true);
    expect(get(recordDeepLink)).toBe(1);
    // replaceState, pas `location.hash = ''` : aucun événement, et le `#` vide
    // n'est pas laissé dans la barre d'adresse.
    expect(win.calls).toEqual([{ state: null, title: '', url: '/?x=1' }]);
  });

  it('un autre hash (#config) est ignoré, sans toucher à l’URL', () => {
    const win = fakeWindow('#config');
    expect(readRecordHash(win)).toBe(false);
    expect(get(recordDeepLink)).toBe(0);
    expect(win.calls).toEqual([]);
  });

  it('deux demandes avant consommation s’additionnent, la consommation remet à zéro', () => {
    readRecordHash(fakeWindow(RECORD_HASH));
    readRecordHash(fakeWindow(RECORD_HASH));
    expect(get(recordDeepLink)).toBe(2);
    consumeRecordDeepLink();
    expect(get(recordDeepLink)).toBe(0);
  });
});
