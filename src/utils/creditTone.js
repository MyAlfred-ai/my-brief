/**
 * Ton d'un crédit de temps d'après ce qui RESTE : `high` (vert), `mid`
 * (ambre), `low` (orange), `out` (rouge, épuisé). Le compteur de la colonne de
 * gauche, la jauge de « Mes statistiques » et les anneaux de l'onglet
 * « Crédit de temps » de l'administration le lisent ici, pour que les trois disent la même chose du même
 * crédit. Les couleurs sont les jetons `--credit-*` (styles/tokens.css).
 */
import { CREDIT_TONE_HIGH, CREDIT_TONE_LOW } from '../config/constants.js';

/**
 * @param {number} remainingSeconds
 * @param {number} limitSeconds
 * @returns {'high'|'mid'|'low'|'out'}
 */
export function creditTone(remainingSeconds, limitSeconds) {
  // « Épuisé » = moins d'une minute pleine : la règle du serveur (lib/quota.js).
  if (!(limitSeconds > 0) || remainingSeconds < 60) return 'out';
  const ratio = remainingSeconds / limitSeconds;
  if (ratio >= CREDIT_TONE_HIGH) return 'high';
  if (ratio >= CREDIT_TONE_LOW) return 'mid';
  return 'low';
}

/** Les quatre zones de la jauge, de vide à plein : [début, fin, ton]. */
export const CREDIT_ZONES = [
  [0, CREDIT_TONE_LOW, 'low'],
  [CREDIT_TONE_LOW, CREDIT_TONE_HIGH, 'mid'],
  [CREDIT_TONE_HIGH, 1, 'high'],
];
