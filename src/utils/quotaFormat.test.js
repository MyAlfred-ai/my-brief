/**
 * Mise en mots du quota : durées selon les gabarits du dictionnaire, mois de
 * renouvellement dans la langue de l'interface.
 */
import { describe, it, expect } from 'vitest';
import { uiTextData } from '../config/uiText.js';
import { formatMinutes, monthLabel, periodMonths } from './quotaFormat.js';

const fr = uiTextData.fr.quota;
const en = uiTextData.en.quota;

describe('formatMinutes', () => {
  it('minutes seules, heures rondes, heures et minutes (minutes sur deux chiffres)', () => {
    expect(formatMinutes(45, fr)).toBe('45 min');
    expect(formatMinutes(120, fr)).toBe('2 h');
    expect(formatMinutes(75, fr)).toBe('1 h 15');
    expect(formatMinutes(65, fr)).toBe('1 h 05');
    expect(formatMinutes(0, fr)).toBe('0 min');
  });

  it('suit les gabarits anglais', () => {
    expect(formatMinutes(75, en)).toBe('1 h 15 min');
    expect(formatMinutes(120, en)).toBe('2 h');
  });

  it('rend vide ce qui n est pas une durée', () => {
    expect(formatMinutes(null, fr)).toBe('');
    expect(formatMinutes(undefined, fr)).toBe('');
    expect(formatMinutes(-3, fr)).toBe('');
    expect(formatMinutes(Number.NaN, fr)).toBe('');
  });
});

describe('monthLabel', () => {
  // Lu en UTC par défaut, jamais dans le fuseau du poste : à l'ouest, le
  // 1er octobre à 0 h UTC reculerait en septembre.
  const END = '2026-10-01T00:00:00.000Z';

  it('nomme le mois dans la langue de l interface, en UTC par défaut', () => {
    expect(monthLabel(END, 'fr')).toBe('octobre');
    expect(monthLabel(END, 'en')).toBe('October');
    expect(monthLabel('2026-09-01T00:00:00.000Z', 'fr', { capitalize: true })).toBe('Septembre');
  });

  it('dans le fuseau demandé', () => {
    // Le 30 septembre à 22 h UTC, c'est déjà le 1er octobre à Paris.
    expect(monthLabel('2026-09-30T22:00:00.000Z', 'fr', { timeZone: 'Europe/Paris' })).toBe(
      'octobre',
    );
  });

  it('rend vide sur une date absente ou illisible', () => {
    expect(monthLabel(null, 'fr')).toBe('');
    expect(monthLabel('pas-une-date', 'fr')).toBe('');
  });
});

describe('periodMonths', () => {
  it('nomme les mois d une période dans son fuseau, bornes UTC de minuit à Paris', () => {
    const period = {
      start: '2026-08-31T22:00:00.000Z',
      end: '2026-09-30T22:00:00.000Z',
      timeZone: 'Europe/Paris',
    };
    expect(periodMonths(period, 'fr')).toEqual({ current: 'Septembre', renewal: 'octobre' });
    expect(periodMonths(period, 'en')).toEqual({ current: 'September', renewal: 'October' });
  });

  it('sans fuseau — serveur d avant l heure de Paris —, lit ses bornes en UTC', () => {
    const period = { start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' };
    expect(periodMonths(period, 'fr')).toEqual({ current: 'Septembre', renewal: 'octobre' });
  });

  it('rend vide sans période', () => {
    expect(periodMonths(null, 'fr')).toEqual({ current: '', renewal: '' });
  });
});
