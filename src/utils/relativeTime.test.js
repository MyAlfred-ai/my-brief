/**
 * Ancienneté de la dernière connexion (Administration → Utilisateurs).
 *
 * Ce qui casserait sans ces tests : une unité mal choisie aux frontières
 * (« il y a 0 heure », « il y a 24 heures » au lieu de « hier ») ; le style
 * court d'Intl qui rend « il y a 2 m. » en français ; une horloge de poste en
 * avance qui afficherait « dans 3 minutes » pour une connexion passée.
 */
import { describe, it, expect } from 'vitest';
import { formatSince, formatDateTime } from './relativeTime.js';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const MIN = 60 * 1000;
const H = 60 * MIN;
const D = 24 * H;
const at = (msAgo) => new Date(NOW - msAgo).toISOString();

describe('formatSince', () => {
  it('compte en minutes, jamais « 0 minute »', () => {
    expect(formatSince(at(20 * 1000), 'fr', NOW)).toBe('il y a 1 minute');
    expect(formatSince(at(5 * MIN), 'fr', NOW)).toBe('il y a 5 minutes');
  });

  it('passe aux heures dès la première heure, et à « hier » dès le premier jour', () => {
    expect(formatSince(at(59 * MIN), 'fr', NOW)).toBe('il y a 59 minutes');
    expect(formatSince(at(H), 'fr', NOW)).toBe('il y a 1 heure');
    expect(formatSince(at(23 * H), 'fr', NOW)).toBe('il y a 23 heures');
    expect(formatSince(at(D), 'fr', NOW)).toBe('hier');
    expect(formatSince(at(4 * D), 'fr', NOW)).toBe('il y a 4 jours');
  });

  it('semaines, mois, années — en toutes lettres', () => {
    expect(formatSince(at(7 * D), 'fr', NOW)).toBe('il y a 1 semaine');
    expect(formatSince(at(29 * D), 'fr', NOW)).toBe('il y a 4 semaines');
    expect(formatSince(at(30 * D), 'fr', NOW)).toBe('il y a 1 mois');
    expect(formatSince(at(130 * D), 'fr', NOW)).toBe('il y a 4 mois');
    expect(formatSince(at(400 * D), 'fr', NOW)).toBe('il y a 1 an');
  });

  it('en anglais', () => {
    expect(formatSince(at(3 * H), 'en', NOW)).toBe('3 hours ago');
    expect(formatSince(at(D), 'en', NOW)).toBe('yesterday');
    expect(formatSince(at(45 * D), 'en', NOW)).toBe('1 month ago');
  });

  it('une horloge en avance ne rend pas une date future', () => {
    expect(formatSince(new Date(NOW + 3 * MIN).toISOString(), 'fr', NOW)).toBe('il y a 1 minute');
  });

  it('rien pour une date absente ou illisible', () => {
    expect(formatSince(null, 'fr', NOW)).toBeNull();
    expect(formatSince('pas une date', 'fr', NOW)).toBeNull();
  });
});

describe('formatDateTime', () => {
  it('date et heure à la minute, sans les secondes', () => {
    const text = formatDateTime('2026-09-24T05:27:44', 'fr');
    expect(text).toContain('24/09/2026');
    expect(text).toContain('05:27');
    expect(text).not.toContain(':44');
  });

  it('rien pour une date absente', () => {
    expect(formatDateTime(null, 'fr')).toBeNull();
  });
});
