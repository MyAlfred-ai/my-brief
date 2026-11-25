/**
 * Infographies en gabarits — ce que le navigateur calcule.
 *
 *   - les listes de gabarits et de pictogrammes sont celles du serveur, et
 *     chaque pictogramme qu'il peut demander est dessiné ;
 *   - les chiffres et les dates prennent le format de la langue de
 *     l'infographie, les graphiques reçoivent des rapports bornés ;
 *   - les couleurs viennent de l'Apparence, et un texte posé sur la couleur
 *     de marque reste lisible quelle qu'elle soit.
 */
import { describe, it, expect } from 'vitest';
import {
  INFOGRAPHIC_ICONS as SERVER_ICONS,
  INFOGRAPHIC_TEMPLATES as SERVER_TEMPLATES,
} from '../../../services/api/lib/infographicLayout.js';
import { INFOGRAPHIC_ICONS, INFOGRAPHIC_TEMPLATES, TEMPLATE_ICONS, templateOf } from './catalog.js';
import { ICON_PATHS, iconPaths } from './icons.js';
import {
  heroRatio,
  evolutionOf,
  formatDue,
  formatDuration,
  formatMeetingDate,
  formatNumber,
  formatQuantity,
  formatSignedPercent,
  kpiRatio,
  objectiveScale,
  topIdeas,
} from './format.js';
import { contrast, infographicPalette, inkVariant, paletteStyle, readableOn } from './palette.js';
import { DEFAULT_PRIMARY_COLOR } from '../../stores/branding.js';
import { uiTextData } from '../../config/uiText.js';

const NNBSP = '\u{202F}';

describe('catalogue — le même que le serveur', () => {
  it('six gabarits et la même liste FERMÉE de pictogrammes', () => {
    expect(INFOGRAPHIC_TEMPLATES).toEqual(SERVER_TEMPLATES);
    expect(INFOGRAPHIC_ICONS).toEqual(SERVER_ICONS);
  });

  it('chaque pictogramme demandable est dessiné, et chaque gabarit a le sien', () => {
    for (const name of INFOGRAPHIC_ICONS) expect(ICON_PATHS[name]?.length).toBeGreaterThan(0);
    for (const id of INFOGRAPHIC_TEMPLATES) expect(ICON_PATHS[TEMPLATE_ICONS[id]]).toBeTruthy();
    expect(iconPaths('licorne')).toBe(ICON_PATHS.point);
  });

  it('un gabarit inconnu (contenu d’une version future) s’affiche en synthèse', () => {
    expect(templateOf({ gabarit: 'poster' })).toBe('synthese');
    expect(templateOf({ gabarit: 'bilan' })).toBe('bilan');
    expect(templateOf(null)).toBe('synthese');
  });

  it('chaque gabarit a son nom imprimé, en français et en anglais', () => {
    for (const lang of ['fr', 'en']) {
      const sheet = uiTextData[lang].infographic.sheet;
      for (const id of INFOGRAPHIC_TEMPLATES) expect(sheet.templates[id]).toBeTruthy();
      expect(Object.keys(sheet).sort()).toEqual(
        Object.keys(uiTextData.fr.infographic.sheet).sort(),
      );
    }
  });
});

describe('format — nombres, dates, durées', () => {
  it('le format de la langue, et l’espace fine avant l’unité en français', () => {
    expect(formatNumber(1650, 'fr')).toBe(`1${NNBSP}650`);
    expect(formatNumber(1650, 'en')).toBe('1,650');
    expect(formatQuantity(1.32, 'M€', 'fr')).toBe(`1,32${NNBSP}M€`);
    expect(formatQuantity(72, '%', 'fr')).toBe(`72${NNBSP}%`);
    expect(formatQuantity(72, '%', 'en')).toBe('72%');
    expect(formatQuantity(42, '', 'fr')).toBe('42');
  });

  it('moins de décimales à mesure que le nombre grandit', () => {
    expect(formatNumber(3.14159, 'en')).toBe('3.14');
    expect(formatNumber(31.456, 'en')).toBe('31.5');
    expect(formatNumber(314.56, 'en')).toBe('315');
  });

  it('variation signée avec un vrai signe moins', () => {
    expect(formatSignedPercent(0.12, 'en')).toBe('+12%');
    expect(formatSignedPercent(-0.034, 'en')).toBe('\u{2212}3%');
    expect(formatSignedPercent(0, 'en')).toBe('0%');
  });

  it('date de réunion, durée, échéance', () => {
    expect(formatMeetingDate('2026-11-12T09:00:00.000Z', 'en')).toBe('12 Nov 2026');
    expect(formatMeetingDate('n’importe quoi', 'fr')).toBe('');
    expect(formatDuration(2700, 'fr')).toBe(`45${NNBSP}min`);
    expect(formatDuration(4500, 'fr')).toBe(`1${NNBSP}h${NNBSP}15`);
    expect(formatDuration(3600, 'en')).toBe(`1${NNBSP}h`);
    expect(formatDuration(null)).toBe('');
    expect(formatDue('2026-11-20', 'en')).toBe('20 Nov');
    expect(formatDue('fin du mois', 'fr')).toBe('fin du mois');
  });
});

describe('format — ce que dessinent les graphiques', () => {
  it('une part : un pourcentage, ou une valeur sur sa cible — borné à [0, 1]', () => {
    expect(kpiRatio({ valeur: 38, unite: '%', forme: 'part' })).toBeCloseTo(0.38);
    expect(kpiRatio({ valeur: 18, cible: 24, unite: '', forme: 'part' })).toBeCloseTo(0.75);
    expect(kpiRatio({ valeur: 130, unite: '%', forme: 'part' })).toBe(1);
    expect(kpiRatio({ valeur: 3, forme: 'valeur' })).toBeNull();
  });

  it('un objectif : valeur et cible sur la même règle, aucune au bord', () => {
    const s = objectiveScale({ valeur: 31.5, cible: 34 });
    expect(s.targetPos).toBeCloseTo(0.8);
    expect(s.valuePos).toBeLessThan(s.targetPos);
    expect(objectiveScale({ valeur: 0, cible: 0 }).max).toBe(1);
  });

  it('une évolution : écart et pourcentage depuis la valeur précédente', () => {
    expect(evolutionOf({ valeur: 4.82, precedent: 4.3 })).toMatchObject({ up: true });
    expect(evolutionOf({ valeur: 4.82, precedent: 4.3 }).pct).toBeCloseTo(0.121, 2);
    expect(evolutionOf({ valeur: 5, precedent: 0 }).pct).toBeNull();
    expect(evolutionOf({ valeur: 2, precedent: 3 }).up).toBe(false);
  });

  it('idées mises en avant : les retenues d’abord, puis les plus votées', () => {
    const top = topIdeas([
      {
        theme: 'A',
        idees: [
          { texte: 'a1', votes: 9, retenue: false },
          { texte: 'a2', votes: 1, retenue: true },
        ],
      },
      {
        theme: 'B',
        idees: [
          { texte: 'b1', votes: 5, retenue: false },
          { texte: 'b2', votes: null, retenue: false },
        ],
      },
    ]);
    expect(top.map((i) => i.texte)).toEqual(['a2', 'a1', 'b1']);
    expect(top[0].theme).toBe('A');
  });
});

describe('format — la valeur du bandeau en anneau', () => {
  it('une part lisible telle quelle : pourcentage ou fraction', () => {
    expect(heroRatio('94 %')).toBeCloseTo(0.94);
    expect(heroRatio('8/10')).toBeCloseTo(0.8);
    expect(heroRatio('3,5 / 5')).toBeCloseTo(0.7);
    expect(heroRatio('130 %')).toBe(1);
  });

  it('jamais une variation signée, une date ou un mot', () => {
    expect(heroRatio('+12 %')).toBeNull();
    expect(heroRatio('2 févr. 2027')).toBeNull();
    expect(heroRatio('TransAlpes')).toBeNull();
    expect(heroRatio('1/0')).toBeNull();
    expect(heroRatio('')).toBeNull();
  });
});

describe('palette — le bandeau reste lisible d’un bout à l’autre du dégradé', () => {
  it('quelle que soit la couleur de marque', () => {
    for (const primaryColor of ['#f38400', '#ffaf00', '#1e6b57', '#27408b', '#6b2d5c', '#dddddd']) {
      const pal = infographicPalette({ primaryColor });
      expect(contrast(pal.heroFrom, pal.onHero)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(pal.heroTo, pal.onHero)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('palette — les couleurs de l’Apparence', () => {
  it('sans réglage : les couleurs par défaut du store branding', () => {
    expect(infographicPalette({}).p).toBe(DEFAULT_PRIMARY_COLOR.toLowerCase());
    expect(infographicPalette({ primaryColor: 'rouge' }).p).toBe(
      DEFAULT_PRIMARY_COLOR.toLowerCase(),
    );
  });

  it('le texte posé sur la marque se lit, que la marque soit claire ou foncée', () => {
    for (const color of ['#f38400', '#ffaf00', '#1e6b57', '#27408b', '#ffffff', '#111111']) {
      const on = readableOn(color);
      expect(contrast(color, on)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('une couleur vive est assombrie juste assez pour servir de texte sur blanc', () => {
    expect(contrast(inkVariant('#ffaf00'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    // Une couleur déjà lisible ne bouge pas.
    expect(inkVariant('#27408b')).toBe('#27408b');
  });

  it('des valeurs littérales pour les <svg>, les mêmes en variables pour la feuille', () => {
    const pal = infographicPalette({ primaryColor: '#27408B', secondaryColor: '#EE6C4D' });
    expect(pal.p).toBe('#27408b');
    expect(pal.s).toBe('#ee6c4d');
    // Toutes littérales (les <svg> les reçoivent telles quelles), sauf les
    // ombres teintées, qui ne vont qu'au CSS.
    for (const [key, value] of Object.entries(pal)) {
      if (key.startsWith('shadow')) expect(value).toMatch(/^rgba\(/);
      else expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(paletteStyle(pal)).toContain('--ig-p:#27408b');
    expect(paletteStyle(pal)).toContain('--ig-on-p:');
  });
});
