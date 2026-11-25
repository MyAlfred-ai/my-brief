/**
 * Catalogue de la recherche dans les réglages — ce qu'elle propose à qui, et
 * qu'on y trouve ce qu'on cherche, en français comme en anglais.
 *
 * Une entrée qui mène à une page absente de la colonne ramènerait sur la page
 * d'accueil du panneau ; une carte absente ne s'allumerait pas. D'où les
 * tests de visibilité : rien n'est proposé qu'on ne puisse ouvrir.
 */
import { describe, it, expect } from 'vitest';
import { SETTING_ENTRIES, buildSettingsIndex } from './settingsSearch.js';
import { ADMIN_SECTIONS } from './adminSections.js';
import {
  ACTION_TABS,
  AI_TABS,
  CONFIG_SECTIONS,
  MEETING_TABS,
  visibleConfigSections,
} from './configSections.js';
import { uiTextData } from './uiText.js';
import { prepareSearchIndex, searchSettings } from '../utils/settingsSearch.js';

const FULL = {
  configSections: visibleConfigSections({
    connectable: true,
    feedbackUrl: 'https://f.test/',
  }),
  admin: true,
  myBrain: true,
  aiHelp: true,
  browser: true,
  password: true,
  systemAudio: true,
};

const search = (lang, query, ctx = FULL, owner = 'config') =>
  searchSettings(prepareSearchIndex(buildSettingsIndex(uiTextData[lang], ctx)), query, {
    boost: (entry) => (entry.panel === owner ? 0.5 : 0),
  });
const first = (lang, query, ctx, owner) => search(lang, query, ctx, owner)[0];

describe('catalogue — complet dans les deux langues', () => {
  it('chaque réglage a son titre en français ET en anglais', () => {
    for (const lang of ['fr', 'en']) {
      for (const entry of SETTING_ENTRIES) {
        expect(entry.title(uiTextData[lang]), `${lang} : ${entry.key}`).toBeTruthy();
        for (const term of entry.terms?.(uiTextData[lang]) || []) {
          expect(term, `${lang} : ${entry.key}`).toBeTruthy();
        }
      }
    }
  });

  it('chaque réglage vise une page (et un onglet) qui existe', () => {
    const configIds = new Set(CONFIG_SECTIONS.map((s) => s.id));
    const adminIds = new Set(ADMIN_SECTIONS.map((s) => s.id));
    const tabs = { ai: AI_TABS, meeting: MEETING_TABS, actions: ACTION_TABS };
    for (const entry of SETTING_ENTRIES) {
      const ids = entry.panel === 'config' ? configIds : adminIds;
      expect(ids.has(entry.section), entry.key).toBe(true);
      if (entry.sub) {
        expect(
          tabs[entry.section]?.map((t) => t.id),
          entry.key,
        ).toContain(entry.sub);
      }
    }
  });

  it('les clés sont uniques', () => {
    const keys = buildSettingsIndex(uiTextData.fr, FULL).map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('les synonymes existent dans les deux langues, et chacun sert une entrée', () => {
    const fr = Object.keys(uiTextData.fr.settingsSearch.keywords).sort();
    const en = Object.keys(uiTextData.en.settingsSearch.keywords).sort();
    expect(en).toEqual(fr);
    // Une carte fondue dans son onglet garde sa clé au catalogue.
    const keys = new Set([
      ...buildSettingsIndex(uiTextData.fr, FULL).map((e) => e.key),
      ...SETTING_ENTRIES.map((e) => e.key),
    ]);
    for (const key of fr) expect(keys.has(key), key).toBe(true);
  });

  it('une carte qui porte le nom de son onglet ne fait pas une seconde ligne', () => {
    const storage = buildSettingsIndex(uiTextData.fr, FULL).filter(
      (e) => e.section === 'actions' && e.sub === 'storage' && e.title === 'Entreposer',
    );
    expect(storage).toHaveLength(1);
    // …mais l'onglet reprend la carte : son titre à allumer, ses libellés.
    expect(storage[0].reveal).toBe('Entreposer');
    expect(storage[0].terms).toContain('Dossier de dépôt');
  });
});

describe('catalogue — rien qu’on ne puisse ouvrir', () => {
  const index = (ctx) => buildSettingsIndex(uiTextData.fr, { ...FULL, ...ctx });

  it('un compte non administrateur ne voit aucune page d’administration', () => {
    expect(index({ admin: false }).some((e) => e.panel === 'admin')).toBe(false);
  });

  it('un administrateur trouve aussi l’administration depuis « Réglages »', () => {
    expect(first('fr', 'logo')).toMatchObject({ panel: 'admin', section: 'branding' });
  });

  it('« Comptes connectés » n’est proposé que s’il est dans la colonne', () => {
    const shown = visibleConfigSections({ connectable: false });
    expect(index({ configSections: shown }).some((e) => e.section === 'mail')).toBe(false);
    expect(index({}).some((e) => e.section === 'mail')).toBe(true);
  });

  it('l’onglet MyBrain et ses cartes suivent le branchement de myBrain', () => {
    const mine = (e) => e.panel === 'config' && e.sub === 'mybrain';
    expect(index({ myBrain: false }).some(mine)).toBe(false);
    expect(index({ myBrain: true }).some(mine)).toBe(true);
  });

  it('l’onglet « Aide IA » et ses cartes suivent le droit du groupe', () => {
    const mine = (e) => e.panel === 'config' && e.sub === 'aiHelp';
    expect(index({ aiHelp: false }).some(mine)).toBe(false);
    expect(index({ aiHelp: true }).some(mine)).toBe(true);
  });

  it('« Aide IA » se trouve sous ses DEUX pages, ses cartes une seule fois', () => {
    const found = index({ aiHelp: true }).filter((e) => e.panel === 'config' && e.sub === 'aiHelp');
    const tabs = found.filter((e) => e.title === 'Aide IA');
    expect(tabs.map((e) => e.section).sort()).toEqual(['ai', 'meeting']);
    expect(tabs.map((e) => e.path.join(' › ')).sort()).toEqual([
      'Mes réunions › Pendant la réunion',
      'Mon compte › Préférences IA',
    ]);
    // Les cartes mènent là où l'Aide IA joue : « Pendant la réunion ».
    const cards = found.filter((e) => e.title !== 'Aide IA');
    expect(cards).toHaveLength(3);
    expect(cards.every((e) => e.section === 'meeting')).toBe(true);
  });

  it('« Extension Chrome » n’existe que dans un navigateur d’ordinateur', () => {
    const has = (ctx) => index(ctx).some((e) => e.key === 'config.tools.extension');
    expect(has({ browser: false })).toBe(false);
    expect(has({ browser: true })).toBe(true);
    // « Importer un audio », lui, reste : l'app mobile importe aussi.
    expect(index({ browser: false }).some((e) => e.key === 'config.tools.import')).toBe(true);
  });

  it('la carte « Mot de passe » n’existe que pour un compte à mot de passe', () => {
    const has = (ctx) => index(ctx).some((e) => e.key === 'config.profile.password');
    expect(has({ password: false })).toBe(false);
    expect(has({ password: true })).toBe(true);
  });

  it('« Son de l’ordinateur » n’existe que là où la carte s’affiche', () => {
    const has = (ctx) => index(ctx).some((e) => e.key === 'config.meeting.audio.system');
    expect(has({ systemAudio: false })).toBe(false);
    expect(has({ systemAudio: true })).toBe(true);
  });

  it('« Se déconnecter » n’est pas un réglage ; « Aide » est un lien', () => {
    const all = index({ configSections: visibleConfigSections({ signedIn: true }) });
    expect(all.some((e) => e.section === 'logout')).toBe(false);
    expect(all.find((e) => e.key === 'config.help').href).toMatch(/^https:/);
  });
});

describe('on trouve ce qu’on cherche', () => {
  const cases = {
    fr: [
      ['micro', 'config', 'meeting'],
      ['changer la langue', 'config', 'profile'],
      ['mot de passe', 'config', 'profile'],
      ['dossier de dépôt', 'config', 'actions'],
      ['détection', 'config', 'meeting'],
      ['mon contexte', 'config', 'ai'],
      ['quota', 'config', 'usage'],
      ['extension chrome', 'config', 'tools'],
      ['importer un audio', 'config', 'tools'],
      ['lire à voix haute', 'config', 'meeting'],
      ['slogan', 'admin', 'branding'],
      ['couleur', 'admin', 'branding'],
      ['clef openai', 'admin', 'ai'],
      ['sso', 'admin', 'auth'],
      ['vocabulaire', 'admin', 'company'],
      ['smtp', 'admin', 'actions'],
    ],
    en: [
      ['microphone', 'config', 'meeting'],
      ['change language', 'config', 'profile'],
      ['password', 'config', 'profile'],
      ['folder', 'config', 'actions'],
      ['logo', 'admin', 'branding'],
      ['api key', 'admin', 'ai'],
      ['sso', 'admin', 'auth'],
    ],
  };
  for (const [lang, list] of Object.entries(cases)) {
    for (const [query, panel, section] of list) {
      it(`[${lang}] « ${query} » → ${panel} › ${section}`, () => {
        expect(first(lang, query)).toMatchObject({ panel, section });
      });
    }
  }

  it('un réglage d’onglet ouvre le bon onglet, et dit où il est', () => {
    const hit = first('fr', 'mots déclencheurs');
    expect(hit).toMatchObject({ section: 'meeting', sub: 'detection' });
    expect(hit.path).toEqual(['Mes réunions', 'Pendant la réunion', "Détection d'actions"]);
    expect(hit.reveal).toBe("Ce que l'assistant cherche");
  });

  it('« sonnette » mène à l’Aide IA, sous l’une ou l’autre de ses pages', () => {
    expect(first('fr', 'sonnette')).toMatchObject({ panel: 'config', sub: 'aiHelp' });
    expect(first('fr', 'aide ia')).toMatchObject({ panel: 'config', sub: 'aiHelp' });
  });

  it('un ancien nom de page retrouve la page renommée', () => {
    // « audio » est aussi dans le titre « Importer un audio », qui passe devant :
    // l'ancien nom de « Micro et son » le ramène quand même.
    expect(search('fr', 'audio').some((e) => e.section === 'meeting' && e.sub === 'audio')).toBe(
      true,
    );
    // « actions » est dans le titre « Détection d'actions », qui passe devant.
    expect(
      search('fr', 'actions', { ...FULL, admin: false }).some(
        (e) => e.section === 'actions' && e.title === 'Après la réunion',
      ),
    ).toBe(true);
  });

  it('à égalité, le panneau ouvert d’abord', () => {
    expect(first('fr', 'templates', FULL, 'config').panel).toBe('config');
    expect(first('fr', 'templates', FULL, 'admin').panel).toBe('admin');
  });
});
