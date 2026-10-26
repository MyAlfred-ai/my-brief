/**
 * Catalogue de « Ma configuration » — les entrées LIEN.
 *
 * « Aide » ouvre la documentation en ligne depuis que l'aide intégrée a été
 * retirée ; « Déclarer un bug ou une idée » reprend le formulaire qui vivait en
 * bas de cette aide. Perdre l'un ou l'autre ne casserait aucun écran : seul ce
 * test le verrait.
 */
import { describe, it, expect } from 'vitest';
import { CONFIG_SECTIONS, visibleConfigSections } from './configSections.js';
import { DOCS_URL } from './constants.js';
import { uiTextData } from './uiText.js';

const byId = Object.fromEntries(CONFIG_SECTIONS.map((s) => [s.id, s]));

describe('configSections — entrées LIEN', () => {
  it('« Aide » ouvre la documentation en ligne', () => {
    expect(DOCS_URL).toBe('https://docs.myalfred.ai/my-brief/');
    expect(byId.help.href).toBe(DOCS_URL);
  });

  it('« Aide » suit la documentation de l’installation quand elle en a une', () => {
    const help = visibleConfigSections({ docsUrl: 'https://aide.example.test/' }).find(
      (s) => s.id === 'help',
    );
    expect(help.href).toBe('https://aide.example.test/');
    expect(visibleConfigSections({ docsUrl: '' }).find((s) => s.id === 'help').href).toBe(DOCS_URL);
  });

  it('« Déclarer un bug » ouvre le formulaire de l’installation', () => {
    const feedback = visibleConfigSections({ feedbackUrl: 'https://retours.example.test/f' }).find(
      (s) => s.id === 'feedback',
    );
    expect(feedback.href).toBe('https://retours.example.test/f');
  });

  it('« Déclarer un bug » disparaît quand l’installation n’a pas de formulaire', () => {
    expect(visibleConfigSections().map((s) => s.id)).not.toContain('feedback');
    expect(visibleConfigSections({ feedbackUrl: '' }).map((s) => s.id)).not.toContain('feedback');
  });

  it('les liens restent là dans l’app mobile, et sans compte à relier', () => {
    const ids = visibleConfigSections({
      native: true,
      connectable: false,
      feedbackUrl: 'https://retours.example.test/f',
    }).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['help', 'feedback']));
  });

  it('« MyBrain » n’apparaît que là où l’administration l’a branché', () => {
    expect(visibleConfigSections().map((s) => s.id)).not.toContain('mybrain');
    expect(visibleConfigSections({ myBrain: true }).map((s) => s.id)).toContain('mybrain');
    expect(byId.mybrain.group).toBe('groupActions');
  });

  it('chaque entrée a son libellé en français ET en anglais', () => {
    for (const lang of ['fr', 'en']) {
      for (const section of CONFIG_SECTIONS) {
        expect(section.label(uiTextData[lang]), `${lang} : ${section.id}`).toBeTruthy();
      }
    }
  });
});
