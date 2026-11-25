/**
 * Catalogue de « Réglages » — la colonne, ses liens, son geste, ses onglets.
 *
 * « Aide » ouvre la documentation en ligne depuis que l'aide intégrée a été
 * retirée ; « Déclarer un bug ou une idée » reprend le formulaire qui vivait en
 * bas de cette aide. Perdre l'un ou l'autre ne casserait aucun écran : seul ce
 * test le verrait. De même pour l'ordre de la colonne, et pour les écrans qui
 * ont changé d'adresse : un raccourci écrit avant le déménagement retomberait
 * sur « Mon profil » sans un mot.
 */
import { describe, it, expect } from 'vitest';
import {
  ACTION_TABS,
  AI_TABS,
  CONFIG_SECTIONS,
  MEETING_TABS,
  movedConfigTarget,
  visibleActionTabs,
  visibleAiTabs,
  visibleConfigSections,
  visibleMeetingTabs,
} from './configSections.js';
import { DOCS_URL } from './constants.js';
import { uiTextData } from './uiText.js';

const byId = Object.fromEntries(CONFIG_SECTIONS.map((s) => [s.id, s]));
const ids = (list) => list.map((item) => item.id);

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
    expect(ids(visibleConfigSections())).not.toContain('feedback');
    expect(ids(visibleConfigSections({ feedbackUrl: '' }))).not.toContain('feedback');
  });

  it('les liens restent là sans compte à relier', () => {
    const shown = ids(
      visibleConfigSections({
        connectable: false,
        feedbackUrl: 'https://retours.example.test/f',
      }),
    );
    expect(shown).toEqual(expect.arrayContaining(['help', 'feedback']));
  });

  it('chaque entrée a son libellé en français ET en anglais', () => {
    for (const lang of ['fr', 'en']) {
      for (const section of CONFIG_SECTIONS) {
        expect(section.label(uiTextData[lang]), `${lang} : ${section.id}`).toBeTruthy();
      }
    }
  });
});

describe('configSections — la colonne des réglages', () => {
  it('« Mon compte » ouvre la colonne : les quatre pages de MIA, « Mon profil » en tête', () => {
    const sections = visibleConfigSections({ connectable: true, signedIn: true });
    expect(sections[0].id).toBe('profile');
    expect(ids(sections.filter((s) => s.group === 'groupAccount'))).toEqual([
      'profile',
      'ai',
      'mail',
      'usage',
    ]);
  });

  it('« Mes réunions » : pendant, puis après', () => {
    expect(ids(CONFIG_SECTIONS.filter((s) => s.group === 'groupMeetings'))).toEqual([
      'meeting',
      'actions',
    ]);
  });

  it('« Outils » ouvre le pied de colonne : une section sans groupe, avant les liens', () => {
    const shown = ids(
      visibleConfigSections({ signedIn: true, feedbackUrl: 'https://retours.example.test/f' }),
    );
    expect(shown.slice(shown.indexOf('tags') + 1)).toEqual(['tools', 'help', 'feedback', 'logout']);
    expect(byId.tools.group).toBeUndefined();
    expect(byId.tools.href).toBeUndefined();
    expect(byId.tools.action).toBeUndefined();
  });

  it('chaque intertitre a son libellé en français ET en anglais', () => {
    const groups = new Set(CONFIG_SECTIONS.map((s) => s.group).filter(Boolean));
    expect([...groups]).toEqual(['groupAccount', 'groupMeetings', 'groupLibrary']);
    for (const lang of ['fr', 'en']) {
      for (const group of groups) {
        expect(uiTextData[lang].config[group], `${lang} : ${group}`).toBeTruthy();
      }
    }
  });

  it('« Comptes connectés » n’apparaît que s’il y a un compte à relier', () => {
    expect(ids(visibleConfigSections())).not.toContain('mail');
    expect(ids(visibleConfigSections({ connectable: true }))).toContain('mail');
  });

  it('« Se déconnecter » ferme la colonne : un geste, pour une session ouverte seulement', () => {
    const sections = visibleConfigSections({ signedIn: true });
    const last = sections[sections.length - 1];
    expect(last).toMatchObject({ id: 'logout', action: 'logout', danger: true });
    // Ni lien ni section : pas d'adresse, pas d'intertitre.
    expect(last.href).toBeUndefined();
    expect(last.group).toBeUndefined();
    expect(ids(visibleConfigSections())).not.toContain('logout');
  });

  it('l’Aide IA n’est plus une entrée de la colonne : c’est un onglet', () => {
    expect(ids(CONFIG_SECTIONS)).not.toContain('aiHelp');
  });
});

describe('configSections — onglets des pages', () => {
  it('« Après la réunion » : une action = un onglet ; « MyBrain » seulement là où il est branché', () => {
    expect(ids(visibleConfigSections({ signedIn: true }))).not.toContain('mybrain');
    expect(ids(visibleActionTabs())).toEqual(['mail', 'storage']);
    expect(ids(visibleActionTabs({ myBrain: true }))).toEqual(['mail', 'storage', 'mybrain']);
  });

  it('« Entreposer » porte les constats que le diagnostic range sous `action-storage`', () => {
    expect(ACTION_TABS.find((tab) => tab.id === 'storage').alertSection).toBe('action-storage');
  });

  it('« Pendant la réunion » : micro, mots remplacés, détection — et « Aide IA » pour qui y a droit', () => {
    expect(ids(visibleMeetingTabs())).toEqual(['audio', 'corrections', 'detection']);
    expect(ids(visibleMeetingTabs({ aiHelp: true }))).toEqual([
      'audio',
      'corrections',
      'detection',
      'aiHelp',
    ]);
  });

  it('« Préférences IA » : « Mon contexte » — et « Aide IA » pour qui y a droit', () => {
    expect(ids(visibleAiTabs())).toEqual(['context']);
    expect(ids(visibleAiTabs({ aiHelp: true }))).toEqual(['context', 'aiHelp']);
  });

  it('« Aide IA » est le MÊME onglet sous ses deux pages', () => {
    const under = (tabs) => tabs.find((tab) => tab.id === 'aiHelp');
    expect(under(AI_TABS)).toBe(under(MEETING_TABS));
  });

  it('chaque onglet a son libellé en français ET en anglais', () => {
    for (const lang of ['fr', 'en']) {
      for (const tab of [...ACTION_TABS, ...AI_TABS, ...MEETING_TABS]) {
        expect(tab.label(uiTextData[lang]), `${lang} : ${tab.id}`).toBeTruthy();
      }
    }
  });
});

describe('configSections — écrans qui ont changé d’adresse', () => {
  const tabsOf = { ai: AI_TABS, meeting: MEETING_TABS, actions: ACTION_TABS };
  const moves = [
    ['audio', '', 'meeting', 'audio'],
    ['aiHelp', '', 'meeting', 'aiHelp'],
    ['ai', 'detection', 'meeting', 'detection'],
    ['ai', 'corrections', 'meeting', 'corrections'],
    ['import', '', 'tools', ''],
    ['extension', '', 'tools', ''],
  ];

  it('une ancienne adresse mène à la place d’aujourd’hui', () => {
    for (const [section, sub, toSection, toSub] of moves) {
      expect(movedConfigTarget(section, sub), `${section}/${sub}`).toEqual({
        section: toSection,
        sub: toSub,
      });
    }
  });

  it('chaque destination existe : une page de la colonne, un onglet de cette page', () => {
    for (const [, , section, sub] of moves) {
      expect(byId[section], section).toBeTruthy();
      if (sub) expect(ids(tabsOf[section]), `${section}/${sub}`).toContain(sub);
      // Une destination n'est pas elle-même déplacée : pas de ricochet.
      expect(movedConfigTarget(section, sub)).toBeNull();
    }
  });

  it('une adresse d’aujourd’hui reste où elle est', () => {
    for (const section of CONFIG_SECTIONS) expect(movedConfigTarget(section.id)).toBeNull();
    for (const [section, tabs] of Object.entries(tabsOf)) {
      for (const tab of tabs) {
        expect(movedConfigTarget(section, tab.id), `${section}/${tab.id}`).toBeNull();
      }
    }
  });
});
