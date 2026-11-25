/**
 * Couleurs du PDF de résumé — celles de Marque & apparence.
 *
 * Le texte du compte rendu reste noir sur blanc : il s'imprime et se lit
 * partout. La marque habille seulement ses bords, en dégradé de la couleur
 * PRIMAIRE vers la SECONDAIRE : bande en tête de chaque page, barre sous le
 * titre, trait devant les intertitres, filet du pied (cf. utils/pdf.js et
 * draw.js). Aucune couleur de marque en dur : le réglage, ou les défauts que
 * déclare le store `branding`.
 */
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  HEX_COLOR_PATTERN,
} from '../../stores/branding.js';

const pick = (value, fallback) => {
  const v = String(value || '').trim();
  return (HEX_COLOR_PATTERN.test(v) ? v : fallback).toLowerCase();
};

/** `#rrggbb` → [r, g, b] */
export const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Les deux extrémités du dégradé, en hexadécimal (pour la feuille de style)
 * et en [r, g, b] (pour ce que draw.js peint lui-même).
 *
 * @param {{primaryColor?: string, secondaryColor?: string}} [brand] - le store `branding`
 */
export function pdfBrandColors({ primaryColor = '', secondaryColor = '' } = {}) {
  const from = pick(primaryColor, DEFAULT_PRIMARY_COLOR);
  const to = pick(secondaryColor, DEFAULT_SECONDARY_COLOR);
  return { from, to, fromRgb: hexToRgb(from), toRgb: hexToRgb(to) };
}
