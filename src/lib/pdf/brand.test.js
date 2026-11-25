/**
 * Couleurs et logos du PDF de résumé — fonctions pures. Le rendu lui-même
 * (logo redessiné par le canvas, dégradés relevés dans la mise en page) se
 * vérifie dans un vrai navigateur : jsdom ne décode pas d'image et ne met
 * rien en page.
 */
import { describe, expect, it } from 'vitest';
import { hexToRgb, pdfBrandColors } from './brand.js';
import { fitBox, logoForPdf } from './logo.js';
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR } from '../../stores/branding.js';

describe('pdfBrandColors', () => {
  it('prend les couleurs de Marque & apparence', () => {
    expect(pdfBrandColors({ primaryColor: '#1E6B57', secondaryColor: '#E3A72F' })).toEqual({
      from: '#1e6b57',
      to: '#e3a72f',
      fromRgb: [30, 107, 87],
      toRgb: [227, 167, 47],
    });
  });

  it('retombe sur les couleurs par défaut du store quand le réglage est vide ou invalide', () => {
    const colors = pdfBrandColors({ primaryColor: '', secondaryColor: 'orange' });
    expect(colors.from).toBe(DEFAULT_PRIMARY_COLOR);
    expect(colors.to).toBe(DEFAULT_SECONDARY_COLOR);
    expect(pdfBrandColors().fromRgb).toEqual(hexToRgb(DEFAULT_PRIMARY_COLOR));
  });
});

describe('fitBox — un logo garde ses proportions', () => {
  it('logo en longueur : borné par la largeur', () => {
    expect(fitBox({ width: 920, height: 240 }, { width: 220, height: 56 })).toEqual({
      width: 214.67,
      height: 56,
    });
    expect(fitBox({ width: 2000, height: 200 }, { width: 220, height: 56 })).toEqual({
      width: 220,
      height: 22,
    });
  });

  it('logo carré : borné par la hauteur ; sans dimension propre : toute la boîte', () => {
    expect(fitBox({ width: 300, height: 300 }, { width: 220, height: 56 })).toEqual({
      width: 56,
      height: 56,
    });
    expect(fitBox({ width: 0, height: 0 }, { width: 220, height: 56 })).toEqual({
      width: 220,
      height: 56,
    });
  });
});

describe('logoForPdf', () => {
  it('pas de logo renseigné : rien, sans erreur', async () => {
    expect(await logoForPdf('', { maxWidth: 220, maxHeight: 56 })).toBeNull();
  });
});
