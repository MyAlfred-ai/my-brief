/**
 * Parité entre les DEUX copies du Pagimètre : src/lib/pageMeter.js (le
 * navigateur calcule la consigne donnée au modèle) et
 * services/api/lib/pageMeter.js (le serveur mesure le résultat et le fait
 * reprendre).
 *
 * La duplication est structurelle : le conteneur de l'API ne copie pas `src/`,
 * l'image web exclut `services/`. Une divergence ne serait pas cosmétique : le
 * navigateur demanderait 450 mots pour « 1 page » pendant que le serveur, avec
 * une autre règle, jugerait le résultat trop long et le ferait condenser — à
 * chaque génération, à nos frais, pour un résultat moins bon.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as client from './pageMeter.js';
import * as server from '../../services/api/lib/pageMeter.js';

const calibration = JSON.parse(
  readFileSync(new URL('./pageMeter.calibration.json', import.meta.url), 'utf8'),
);

const SAMPLES = [
  '',
  '<p>Une phrase.</p>',
  '<h3>📊 Budget</h3><ul><li><strong>Enveloppe :</strong> 1,2 M€</li><li>Écart de 9 %</li></ul>',
  '<ol><li>Un<ul><li>sous-point</li></ul></li><li>Deux</li></ol><p>Fin&nbsp;!</p>',
  '<h2>Titre</h2><p>Ligne<br>coupée</p><table><tr><td>cellule</td></tr></table>',
  ...calibration.map((c) => c.html),
];

describe('Pagimètre — client et serveur', () => {
  it('mêmes réglages', () => {
    for (const key of [
      'PAGE_STEPS',
      'MIN_PAGES',
      'MAX_PAGES',
      'WORDS_PER_PAGE',
      'MATERIAL_RATIO',
      'TOLERANCE',
    ]) {
      expect(server[key], key).toEqual(client[key]);
    }
  });

  it('même normalisation des longueurs reçues', () => {
    for (const v of [
      0,
      0.1,
      0.25,
      0.3,
      0.6,
      1,
      1.24,
      1.26,
      2.7,
      9.6,
      10,
      10.2,
      '1,5',
      '3',
      null,
      'x',
      {},
    ]) {
      expect(server.normalizePages(v), String(v)).toBe(client.normalizePages(v));
    }
  });

  it('même plafond de matière et même cible', () => {
    for (const words of [0, 50, 400, 1500, 4000, 8500, 20000, 100000]) {
      expect(server.materialCapPages(words)).toBe(client.materialCapPages(words));
      for (const pages of [0.25, 1, 3, 10]) {
        expect(server.effectivePages(pages, words)).toBe(client.effectivePages(pages, words));
      }
    }
  });

  it('même verdict', () => {
    for (const target of [0.25, 0.5, 1, 3, 10]) {
      for (const ratio of [0.5, 0.79, 0.81, 1, 1.19, 1.21, 2]) {
        expect(server.lengthVerdict(target * ratio, target)).toBe(
          client.lengthVerdict(target * ratio, target),
        );
      }
    }
  });

  it('même compte de mots et même estimation de la mise en page', () => {
    for (const html of SAMPLES) {
      expect(server.countWords(html)).toBe(client.countWords(html));
      expect(server.estimatePages(html)).toBe(client.estimatePages(html));
    }
  });

  it('même découpe entre les ancres', () => {
    const html =
      '<h1>CR</h1>\n<h2>S</h2>\n<p>corps</p>\n<h2>S</h2>\n<h2>Actions</h2>\n<ul><li>a</li></ul>';
    for (const anchors of [
      { before: '<h2>S</h2>', beforeCount: 1, after: '<h2>Actions</h2>' },
      { before: '<h2>S</h2>', beforeCount: 2, after: null },
      { before: null, after: '<h2>Actions</h2>' },
      { before: '<h2>Absent</h2>', after: null },
    ]) {
      expect(server.splitAtAnchors(html, anchors)).toEqual(client.splitAtAnchors(html, anchors));
    }
  });
});
