/**
 * Durée d'une réunion : validation, et récupération dans le compte-rendu.
 *
 * Ce qui se vérifie ici : la durée relue dans le HTML est bien celle du
 * chronomètre — pas un horaire quelconque attrapé au passage. Le motif exige le
 * mot « Durée » devant le nombre, et c'est cette exigence qui sépare une mesure
 * d'une invention. Un faux positif ici se propagerait en silence dans toutes les
 * moyennes de l'écran Statistiques.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeDuration, durationFromSummary } from '../lib/meetingDuration.js';

describe('sanitizeDuration', () => {
  it('accepte une durée plausible', () => {
    expect(sanitizeDuration(1800)).toBe(1800);
    expect(sanitizeDuration('900')).toBe(900);
    expect(sanitizeDuration(1799.6)).toBe(1800);
  });

  it('rejette l’absence, le zéro et l’aberrant — `null`, jamais 0', () => {
    // 0 et null ne veulent pas dire la même chose : « réunion de 0 s » n'existe
    // pas, « durée inconnue » si. Les moyennes doivent pouvoir les distinguer.
    for (const value of [undefined, null, 0, -5, 'abc', NaN, 86401, Infinity]) {
      expect(sanitizeDuration(value)).toBeNull();
    }
  });
});

describe('durationFromSummary', () => {
  it('lit la durée imprimée par les gabarits', () => {
    // Forme produite par les scaffolds (src/config/templates.js).
    const html = '<p><em>Auteur : Alex Dupont — Durée : 01:23:45</em></p>';
    expect(durationFromSummary(html)).toBe(5025);
  });

  it('traverse la ponctuation et les balises intercalées par le modèle', () => {
    expect(durationFromSummary('<strong>Durée</strong> : <em>00:42:10</em>')).toBe(2530);
    expect(durationFromSummary('<h2>Durée de la réunion</h2><p>00:05:00</p>')).toBe(300);
    expect(durationFromSummary('Duree de la reunion : 02:00:00')).toBe(7200);
    expect(durationFromSummary('<p>Duration: 00:15:30</p>')).toBe(930);
  });

  it('ignore un horaire qui n’est pas une durée', () => {
    // Sans le mot devant, « rendez-vous à 14:30:00 » serait pris pour 14 h de
    // réunion — et personne ne verrait l'erreur dans une moyenne.
    expect(durationFromSummary('<p>Rendez-vous fixé à 14:30:00 en salle B.</p>')).toBeNull();
    expect(durationFromSummary('<p>Le vol de 08:15:00 est confirmé.</p>')).toBeNull();
  });

  it('ne saute pas jusqu’à un nombre lointain', () => {
    const html = `<p>Durée</p>${'<p>paragraphe sans chiffre</p>'.repeat(6)}<p>01:00:00</p>`;
    expect(durationFromSummary(html)).toBeNull();
  });

  it('rend `null` quand la durée était inconnue à la génération', () => {
    // C'est le repli littéral posé par les gabarits.
    expect(durationFromSummary('<p><em>Auteur : Alex — Durée : inconnue</em></p>')).toBeNull();
  });

  it('rend `null` sur une entrée vide ou non textuelle', () => {
    for (const value of ['', null, undefined, 42, {}]) {
      expect(durationFromSummary(value)).toBeNull();
    }
  });

  it('refuse une durée aberrante même bien formée', () => {
    // 99:00:00 dépasse le plafond de 24 h : un chronomètre laissé tourner.
    expect(durationFromSummary('Durée : 99:00:00')).toBeNull();
  });
});
