import { describe, it, expect } from 'vitest';
import { normalizeDomain, withDomain } from './allowedDomains.js';

describe('saisie des domaines autorisés (miroir client)', () => {
  it('nettoie les formes qu un administrateur colle', () => {
    expect(normalizeDomain(' @Client.FR ')).toBe('client.fr');
    expect(normalizeDomain('https://client.fr/accueil')).toBe('client.fr');
  });

  it('ajoute un domaine en gardant la liste triée', () => {
    expect(withDomain(['zeta.fr'], 'Alpha.fr')).toEqual(['alpha.fr', 'zeta.fr']);
  });

  it('rend la même liste pour un doublon, et null pour ce qui n est pas un domaine', () => {
    const domains = ['client.fr'];
    expect(withDomain(domains, '@CLIENT.fr')).toBe(domains);
    expect(withDomain(domains, 'intranet')).toBeNull();
    expect(withDomain(domains, '   ')).toBeNull();
  });
});
