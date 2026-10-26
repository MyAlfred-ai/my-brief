/**
 * Constats du diagnostic → pastilles (utils/configAlerts.js).
 *
 * Ce qui casserait sans ces tests : une pastille orange posée sur une section
 * qui porte AUSSI une panne (la couleur doit être celle du plus grave) ; une
 * phrase vide ou un code brut affiché pour un constat que la page ne connaît
 * pas encore ; une bulle récapitulative qui énumère douze lignes.
 */
import { describe, it, expect } from 'vitest';
import { alertText, alertOf, alertsBySection, summaryAlert, mergeAlerts } from './configAlerts.js';

const TEXTS = {
  unknown: 'Un réglage est à revoir ici.',
  more: '+ {count} autre(s) point(s)',
  issues: {
    ai_key_missing: 'Aucune clé OpenAI.',
    tag_folder_missing: 'Tag « {tag} » : le dossier « {folder} » est introuvable.',
    branding_default: 'Identité par défaut.',
  },
};

describe('configAlerts', () => {
  it('le niveau le plus grave l’emporte, quel que soit l’ordre', () => {
    const issue = (level) => ({ level, code: 'ai_key_missing' });
    expect(alertOf([issue('tip'), issue('error'), issue('warning')], TEXTS).level).toBe('error');
    expect(alertOf([issue('tip'), issue('warning')], TEXTS).level).toBe('warning');
    expect(alertOf([], TEXTS)).toBeNull();
  });

  it('compose la phrase avec ses variables ; un code inconnu prend la phrase générique', () => {
    expect(
      alertText(
        { code: 'tag_folder_missing', vars: { tag: 'Acme', folder: 'Clients/Acme' } },
        TEXTS,
      ),
    ).toBe('Tag « Acme » : le dossier « Clients/Acme » est introuvable.');
    expect(alertText({ code: 'venu_du_futur' }, TEXTS)).toBe('Un réglage est à revoir ici.');
  });

  it('regroupe par section, les lignes les plus graves en tête', () => {
    const alerts = alertsBySection(
      [
        { section: 'branding', code: 'branding_default', level: 'tip' },
        { section: 'ai', code: 'ai_key_missing', level: 'error' },
        {
          section: 'tags',
          code: 'tag_folder_missing',
          level: 'warning',
          vars: { tag: 'A', folder: 'X' },
        },
      ],
      TEXTS,
    );
    expect(Object.keys(alerts).sort()).toEqual(['ai', 'branding', 'tags']);
    expect(alerts.ai).toEqual({
      level: 'error',
      items: [{ level: 'error', text: 'Aucune clé OpenAI.' }],
    });
    expect(alertOf([], TEXTS)).toBeNull();
  });

  it('le récapitulatif borne la bulle et compte le reste', () => {
    const issues = Array.from({ length: 6 }, () => ({ code: 'branding_default', level: 'tip' }));
    issues.push({ code: 'ai_key_missing', level: 'error' });
    const summary = summaryAlert(issues, TEXTS, { title: 'À régler', max: 4 });
    expect(summary.level).toBe('error');
    expect(summary.items).toHaveLength(4);
    expect(summary.items[0].text).toBe('Aucune clé OpenAI.');
    expect(summary.more).toBe('+ 3 autre(s) point(s)');
    expect(summary.title).toBe('À régler');
    expect(summaryAlert([], TEXTS)).toBeNull();
    expect(summaryAlert(issues.slice(0, 2), TEXTS).more).toBe('');
  });

  it('fusionne des pastilles déjà composées sans perdre leurs phrases', () => {
    const merged = mergeAlerts([
      { level: 'tip', items: [{ level: 'tip', text: 'conseil' }] },
      null,
      { level: 'error', items: [{ level: 'error', text: 'panne' }] },
    ]);
    expect(merged).toEqual({
      level: 'error',
      items: [
        { level: 'error', text: 'panne' },
        { level: 'tip', text: 'conseil' },
      ],
    });
    expect(mergeAlerts([null, undefined])).toBeNull();
  });
});
