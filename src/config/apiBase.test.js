import { describe, it, expect } from 'vitest';
import { resolveApiOrigin } from './apiBase.js';
import { apiOrigin, baseUrl } from './constants.js';

describe('resolveApiOrigin', () => {
  it('retourne une chaîne vide si la variable est absente/vide', () => {
    expect(resolveApiOrigin(undefined)).toBe('');
    expect(resolveApiOrigin(null)).toBe('');
    expect(resolveApiOrigin('')).toBe('');
    expect(resolveApiOrigin('   ')).toBe('');
  });

  it('retourne l’origine telle quelle', () => {
    expect(resolveApiOrigin('https://mybrief.example.test')).toBe(
      'https://mybrief.example.test',
    );
  });

  it('retire les slashs finaux', () => {
    expect(resolveApiOrigin('https://mybrief.example.test/')).toBe(
      'https://mybrief.example.test',
    );
    expect(resolveApiOrigin('https://mybrief.example.test//')).toBe(
      'https://mybrief.example.test',
    );
  });

  it('tolère un chemin /api passé par erreur', () => {
    expect(resolveApiOrigin('https://host.tld/api')).toBe('https://host.tld');
    expect(resolveApiOrigin('https://host.tld/api/')).toBe('https://host.tld');
  });
});

describe('constants — neutralité web (régression)', () => {
  // Sans VITE_API_BASE_URL (cas de tous les builds web), les URLs doivent
  // rester RELATIVES (même origine que le site, routées par Traefik).
  it('baseUrl reste /api quand la variable n’est pas définie', () => {
    expect(apiOrigin).toBe('');
    expect(baseUrl).toBe('/api');
  });
});
