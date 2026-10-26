/**
 * @vitest-environment jsdom
 *
 * Mécanique des couleurs de marque — la partie que rien ne rattrape à l'œil nu.
 *
 * Ce qui casserait sans ces tests : une surcharge qui ne serait PAS retirée au
 * retour au défaut (l'installation resterait bloquée sur l'ancienne teinte
 * jusqu'au vidage du cache), une variable oubliée dans la liste de retrait, et
 * surtout la garantie qui fait tenir tout le système : les feuilles gardent
 * leurs valeurs par défaut, seule la surcharge sur <html> change — donc une
 * seule variable de sortie manquante = une zone de l'interface qui « ne change
 * pas de couleur » chez le premier client qui personnalise.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyBrandColors,
  brandingTagline,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  HEX_COLOR_PATTERN,
} from './branding.js';

const root = () => document.documentElement;
const inline = (name) => root().style.getPropertyValue(name);

beforeEach(() => {
  root().removeAttribute('style');
  document.head.innerHTML = '<meta name="theme-color" content="#f38400" />';
});

const themeColor = () => document.querySelector('meta[name="theme-color"]').getAttribute('content');

describe("phrase d'accueil", () => {
  it('en anglais, la phrase anglaise ; à défaut, la française telle quelle', () => {
    const both = { tagline: 'Assistant de réunion', taglineEn: 'Meeting assistant' };
    expect(brandingTagline(both, 'en')).toBe('Meeting assistant');
    expect(brandingTagline(both, 'fr')).toBe('Assistant de réunion');
    expect(brandingTagline({ tagline: 'Assistant de réunion', taglineEn: '' }, 'en')).toBe(
      'Assistant de réunion',
    );
  });

  it("rien de posé pour la langue : '' — l'appelant affiche la phrase intégrée", () => {
    expect(brandingTagline({ tagline: '', taglineEn: 'Meeting assistant' }, 'fr')).toBe('');
    expect(brandingTagline({}, 'en')).toBe('');
    expect(brandingTagline(undefined, 'fr')).toBe('');
  });
});

describe('couleur primaire', () => {
  it('surcharge toute la famille de marque, canaux compris', () => {
    applyBrandColors({ primaryColor: '#3366cc' });
    expect(inline('--brand-rgb')).toBe('51 102 204');
    expect(inline('--brand')).toBe('rgb(51 102 204)');
    // Déclinaisons dérivées par assombrissement : plus sombres, jamais vides.
    for (const name of ['--brand-strong', '--brand-text', '--brand-text-strong']) {
      expect(inline(name)).toMatch(/^rgb\(/);
    }
    // Les alias historiques de style.css doivent suivre, sinon les zones qui
    // les utilisent restent orange.
    expect(inline('--mb-orange')).toBe('rgb(51 102 204)');
    expect(inline('--mb-orange-10')).toContain('0.1');
    expect(themeColor()).toBe('#3366cc');
  });

  it('valeur vide ou invalide : la surcharge est RETIRÉE (retour au défaut des feuilles)', () => {
    applyBrandColors({ primaryColor: '#3366cc' });
    applyBrandColors({ primaryColor: '' });
    expect(inline('--brand-rgb')).toBe('');
    expect(inline('--brand')).toBe('');
    expect(inline('--mb-orange')).toBe('');
    expect(themeColor()).toBe(DEFAULT_PRIMARY_COLOR);

    applyBrandColors({ primaryColor: 'orange' });
    expect(inline('--brand-rgb')).toBe('');
  });
});

describe('couleur secondaire', () => {
  it('une seule variable à surcharger : tout le reste en dérive dans les feuilles', () => {
    applyBrandColors({ secondaryColor: '#00aa55' });
    expect(inline('--brand-secondary-rgb')).toBe('0 170 85');
    // --brand-secondary et --mb-amber sont définis en `var(...)` dans les
    // feuilles : les surcharger ici serait redondant et masquerait la source.
    expect(inline('--brand-secondary')).toBe('');
    expect(inline('--mb-amber')).toBe('');
  });

  it('vide ou invalide : surcharge retirée', () => {
    applyBrandColors({ secondaryColor: '#00aa55' });
    applyBrandColors({ secondaryColor: '' });
    expect(inline('--brand-secondary-rgb')).toBe('');
    applyBrandColors({ secondaryColor: 'vert' });
    expect(inline('--brand-secondary-rgb')).toBe('');
  });

  it('ne touche jamais la primaire, ni la barre d’onglets mobile', () => {
    applyBrandColors({ primaryColor: '#3366cc', secondaryColor: '#00aa55' });
    expect(inline('--brand-rgb')).toBe('51 102 204');
    expect(themeColor()).toBe('#3366cc'); // la meta suit la PRIMAIRE
    applyBrandColors({ primaryColor: '#3366cc', secondaryColor: '' });
    expect(inline('--brand-rgb')).toBe('51 102 204');
    expect(inline('--brand-secondary-rgb')).toBe('');
  });
});

describe('applyBrandColors', () => {
  it('les deux couleurs sont appliquées et retirées ENSEMBLE', () => {
    applyBrandColors({ primaryColor: '#3366cc', secondaryColor: '#00aa55' });
    // Retour complet au défaut : aucune moitié de thème ne doit survivre.
    applyBrandColors({});
    expect(root().getAttribute('style') || '').toBe('');
  });

  it('idempotente : appelée en réactif à chaque réponse de la sonde publique', () => {
    applyBrandColors({ primaryColor: '#3366cc', secondaryColor: '#00aa55' });
    const first = root().getAttribute('style');
    applyBrandColors({ primaryColor: '#3366cc', secondaryColor: '#00aa55' });
    expect(root().getAttribute('style')).toBe(first);
  });

  it('sans argument : ne jette pas (store vide au premier rendu)', () => {
    expect(() => applyBrandColors()).not.toThrow();
  });
});

describe('constantes', () => {
  it('les teintes intégrées sont des #rrggbb valides', () => {
    expect(HEX_COLOR_PATTERN.test(DEFAULT_PRIMARY_COLOR)).toBe(true);
    expect(HEX_COLOR_PATTERN.test(DEFAULT_SECONDARY_COLOR)).toBe(true);
  });
});
