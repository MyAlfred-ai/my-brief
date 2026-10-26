/**
 * Groupes de l'historique (sidebar).
 *
 * Ce qui casserait sans ces tests : un libellé de groupe repris du serveur, en
 * français quelle que soit la langue (« Cette semaine » dans l'interface
 * anglaise) ; une clé dérivée du libellé, qui rouvrirait tous les groupes
 * repliés au changement de langue ; des bornes qui divergent de celles du
 * serveur (jours glissants).
 */
import { describe, it, expect } from 'vitest';
import { historyGroupKey, historyGroupLabel, groupHistory } from './historyGroups.js';

const NOW = new Date(2026, 9, 13, 12, 0);
const D = 86_400_000;
const at = (msAgo) => ({ lastConnecion: new Date(NOW.getTime() - msAgo).toISOString() });
const FR = { groupThisWeek: 'Cette semaine', groupLastWeek: 'Semaine dernière' };
const EN = { groupThisWeek: 'This week', groupLastWeek: 'Last week' };

describe('historyGroupKey', () => {
  it('jours glissants : moins de 7 jours, puis moins de 14, puis le mois', () => {
    expect(historyGroupKey(at(6 * D), NOW)).toBe('this-week');
    expect(historyGroupKey(at(7 * D), NOW)).toBe('last-week');
    expect(historyGroupKey(at(13 * D), NOW)).toBe('last-week');
    expect(historyGroupKey({ lastConnecion: new Date(2026, 8, 2).toISOString() }, NOW)).toBe(
      '2026-09',
    );
  });

  it('sans date lisible, la réunion rejoint les récentes', () => {
    expect(historyGroupKey({}, NOW)).toBe('this-week');
    expect(historyGroupKey({ now: 'pas une date' }, NOW)).toBe('this-week');
  });
});

describe('historyGroupLabel', () => {
  it('dans la langue du lecteur', () => {
    expect(historyGroupLabel('this-week', 'en', EN)).toBe('This week');
    expect(historyGroupLabel('last-week', 'fr', FR)).toBe('Semaine dernière');
    expect(historyGroupLabel('2026-09', 'fr', FR)).toBe('septembre 2026');
    expect(historyGroupLabel('2026-09', 'en', EN)).toBe('September 2026');
  });
});

describe('groupHistory', () => {
  it("garde l'ordre d'arrivée et des clés indépendantes de la langue", () => {
    const items = [
      at(D),
      at(2 * D),
      at(8 * D),
      { lastConnecion: new Date(2026, 7, 20).toISOString() },
    ];
    const fr = groupHistory(items, 'fr', FR, NOW);
    const en = groupHistory(items, 'en', EN, NOW);
    expect(fr.map((g) => g.key)).toEqual(['this-week', 'last-week', '2026-08']);
    expect(en.map((g) => g.key)).toEqual(fr.map((g) => g.key));
    expect(en.map((g) => g.label)).toEqual(['This week', 'Last week', 'August 2026']);
    expect(fr[0].meetings).toHaveLength(2);
  });
});
