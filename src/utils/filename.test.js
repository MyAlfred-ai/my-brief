/**
 * Noms de fichiers des documents exportés (src/utils/filename.js).
 *
 * Ces noms ne servent plus seulement au téléchargement : ce sont aussi ceux des
 * pièces jointes et des fichiers déposés sur le Drive de l'utilisateur. Un nom
 * mal formé y est visible durablement, et un caractère refusé par l'API du
 * fournisseur ferait échouer le dépôt.
 */
import { describe, it, expect } from 'vitest';
import { slugifyTitle, fileDatePart, documentFilename } from './filename.js';

describe('slugifyTitle', () => {
  it('réduit un titre libre à des caractères sûrs', () => {
    expect(slugifyTitle('Comité de direction — 8 août')).toBe('comite-de-direction-8-aout');
  });

  it('retire les accents plutôt que de les conserver', () => {
    // Les API de Drive les acceptent, mais leur normalisation Unicode diffère
    // d'une plateforme à l'autre : deux fichiers d'apparence identique
    // finiraient par cohabiter dans le même dossier.
    expect(slugifyTitle('Réunion créative')).toBe('reunion-creative');
  });

  it('ne laisse ni tiret en tête ni en fin', () => {
    expect(slugifyTitle('!!! Point hebdo !!!')).toBe('point-hebdo');
  });

  it('plafonne la longueur', () => {
    expect(slugifyTitle('a'.repeat(200))).toHaveLength(80);
  });

  it('retombe sur la valeur par défaut quand il ne reste rien', () => {
    expect(slugifyTitle('※※※', 'transcription')).toBe('transcription');
    expect(slugifyTitle('', 'transcription')).toBe('transcription');
    expect(slugifyTitle(null, 'transcription')).toBe('transcription');
  });
});

describe('fileDatePart', () => {
  it('formate en AAAA-MM-JJ', () => {
    expect(fileDatePart('2026-08-08T10:30:00.000Z')).toBe('2026-08-08');
  });

  it("utilise l'heure LOCALE, pas UTC", () => {
    // Une réunion de 23 h à Paris porterait la date du lendemain avec
    // toISOString(). On construit la date en local pour que le test dise la
    // même chose quel que soit le fuseau où il tourne.
    const tard = new Date(2026, 7, 8, 23, 30);
    expect(fileDatePart(tard)).toBe('2026-08-08');
  });

  it('retombe sur aujourd’hui pour une date illisible', () => {
    expect(fileDatePart('pas une date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fileDatePart(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('documentFilename', () => {
  it('place la date en tête pour que le tri alphabétique soit chronologique', () => {
    expect(
      documentFilename({ title: 'Comité du 8', date: '2026-08-08T09:00:00.000Z', ext: 'pdf' }),
    ).toBe('2026-08-08-comite-du-8.pdf');
  });

  it('accepte un titre vide', () => {
    expect(
      documentFilename({ date: '2026-08-08T09:00:00.000Z', ext: 'txt', fallback: 'transcription' }),
    ).toBe('2026-08-08-transcription.txt');
  });
});
