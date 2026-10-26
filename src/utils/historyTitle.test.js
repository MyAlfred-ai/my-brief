import { describe, it, expect } from 'vitest';
import {
  resolveHistoryTitle,
  historyItemDate,
  formatHistoryItemTitle,
  formatHistoryItemMeta,
} from './historyTitle.js';

describe('historyItemDate', () => {
  it("lit lastConnecion (faute de frappe d'origine) en priorité", () => {
    const d = historyItemDate({
      lastConnecion: '2026-02-06T10:00:00Z',
      now: '2026-08-04T10:00:00Z',
    });
    expect(d.toISOString().slice(0, 10)).toBe('2026-02-06');
  });

  it('retombe sur lastConnection puis now', () => {
    expect(
      historyItemDate({ lastConnection: '2026-02-06T10:00:00Z' }).toISOString().slice(0, 10),
    ).toBe('2026-02-06');
    expect(historyItemDate({ now: '2026-03-01T10:00:00Z' }).toISOString().slice(0, 10)).toBe(
      '2026-03-01',
    );
  });

  it('renvoie null sans date exploitable', () => {
    expect(historyItemDate({})).toBeNull();
    expect(historyItemDate({ now: 'pas une date' })).toBeNull();
    expect(historyItemDate(null)).toBeNull();
  });
});

describe('resolveHistoryTitle', () => {
  it('garde un vrai titre généré', () => {
    const item = { title: 'Démo MyBrief pour Globex', name: 'Mybrief MyAlfred' };
    expect(resolveHistoryTitle(item)).toBe('Démo MyBrief pour Globex');
  });

  it('rejette le titre replié sur le nom du compte, et date la réunion', () => {
    // Cas réel : réunion antérieure au nœud « Add title field » — le backend
    // a replié title sur d.name, donc toutes affichaient le nom du compte.
    // Horodatage SANS « Z » : lu en heure locale, donc l'attendu ne dépend pas
    // du fuseau de la machine qui exécute les tests.
    const item = {
      title: 'Mybrief MyAlfred',
      name: 'Mybrief MyAlfred',
      lastConnecion: '2026-02-06T09:30:00',
    };
    expect(resolveHistoryTitle(item)).toBe('Réunion 06-02-2026 09:30');
  });

  it("distingue deux réunions du MÊME jour par l'heure", () => {
    // Depuis que la réunion naît au démarrage de l'enregistrement, plusieurs
    // réunions non résumées du même jour cohabitent dans l'historique.
    const matin = resolveHistoryTitle({ lastConnecion: '2026-08-24T09:05:00' });
    const soir = resolveHistoryTitle({ lastConnecion: '2026-08-24T17:40:00' });
    expect(matin).toBe('Réunion 24-08-2026 09:05');
    expect(soir).toBe('Réunion 24-08-2026 17:40');
  });

  it('distingue deux anciennes réunions de dates différentes', () => {
    const a = {
      title: 'Mybrief MyAlfred',
      name: 'Mybrief MyAlfred',
      lastConnecion: '2026-02-06T09:00:00Z',
    };
    const b = {
      title: 'Mybrief MyAlfred',
      name: 'Mybrief MyAlfred',
      lastConnecion: '2026-03-11T09:00:00Z',
    };
    expect(resolveHistoryTitle(a)).not.toBe(resolveHistoryTitle(b));
  });

  it('rejette le repli backend « Réunion sans titre » et date la réunion', () => {
    // La génération IA du titre est en tâche de fond et peut échouer : le repli
    // ne dit rien de la réunion et rend toutes les lignes identiques.
    const item = { title: 'Réunion sans titre', lastConnecion: '2026-08-09T07:39:00' };
    expect(resolveHistoryTitle(item)).toBe('Réunion 09-08-2026 07:39');
  });

  it("garde le titre quand aucun nom de compte n'accompagne l'item", () => {
    expect(resolveHistoryTitle({ title: 'Mybrief MyAlfred' })).toBe('Mybrief MyAlfred');
  });

  it('repli générique sans titre ni date', () => {
    expect(resolveHistoryTitle({})).toBe('Réunion');
    expect(resolveHistoryTitle({ title: '   ', name: 'X' })).toBe('Réunion');
  });

  it('gère null et les chaînes brutes', () => {
    expect(resolveHistoryTitle(null)).toBe('Réunion');
    expect(resolveHistoryTitle('Réunion importée')).toBe('Réunion importée');
  });

  it('version anglaise', () => {
    expect(resolveHistoryTitle({}, 'en')).toBe('Meeting');
    expect(
      resolveHistoryTitle({ title: 'X', name: 'X', lastConnecion: '2026-02-06T09:00:00' }, 'en'),
    ).toBe('Meeting 06-02-2026 09:00');
  });
});

describe('formatHistoryItemTitle', () => {
  it('préfère le titre réel', () => {
    expect(formatHistoryItemTitle({ title: 'Point hebdo' }, 0, 'Réunion')).toBe('Point hebdo');
  });

  it('numérote à partir de 1, pas de 0', () => {
    // Un « Réunion #0 » en tête de liste serait le genre de détail qu'on ne
    // remarque qu'une fois chez le client.
    expect(formatHistoryItemTitle(null, 0, 'Réunion')).toBe('Réunion #1');
    expect(formatHistoryItemTitle({}, 4, 'Réunion')).toBe('Réunion #5');
  });

  it('rend une chaîne telle quelle', () => {
    expect(formatHistoryItemTitle('déjà un titre', 0, 'Réunion')).toBe('déjà un titre');
  });

  it('accepte les formes héritées que la modale rencontre encore', () => {
    expect(formatHistoryItemTitle({ filename: 'cr.txt' }, 0, 'Réunion')).toBe('cr.txt');
    expect(formatHistoryItemTitle({ label: 'étiquette' }, 0, 'Réunion')).toBe('étiquette');
  });

  it('prend le libellé injecté, sans connaître la langue', () => {
    // Le module reste pur : c'est l'appelant qui traduit.
    expect(formatHistoryItemTitle(null, 0, 'Meeting')).toBe('Meeting #1');
  });
});

describe('formatHistoryItemMeta', () => {
  it('formate la date selon la langue', () => {
    const fr = formatHistoryItemMeta({ now: '2026-03-12T09:30:00.000Z' }, 'fr');
    const en = formatHistoryItemMeta({ now: '2026-03-12T09:30:00.000Z' }, 'en');
    expect(fr).toBeTruthy();
    expect(en).toBeTruthy();
    expect(fr).not.toBe(en);
  });

  it('préfère `lastConnecion` — la faute de frappe historique du backend', () => {
    const meta = formatHistoryItemMeta(
      { lastConnecion: '2026-03-12T09:30:00.000Z', now: '2020-01-01T00:00:00.000Z' },
      'fr',
    );
    expect(meta).toContain('2026');
  });

  it('retombe sur la durée, puis sur rien', () => {
    expect(formatHistoryItemMeta({ duration: '45 min' }, 'fr')).toBe('45 min');
    expect(formatHistoryItemMeta({}, 'fr')).toBe('');
    expect(formatHistoryItemMeta(null, 'fr')).toBe('');
    expect(formatHistoryItemMeta('chaîne', 'fr')).toBe('');
  });

  it('ignore une date invalide au lieu de rendre « Invalid Date »', () => {
    expect(formatHistoryItemMeta({ now: 'pas-une-date' }, 'fr')).toBe('');
  });
});

describe('formatHistoryItemTitle — régression « undefined undefined »', () => {
  it('n’affiche jamais « undefined » quand email et template manquent', () => {
    // Le bug d'origine : `item.email + ' ' + item.template` au milieu d'une
    // chaîne de `||` produisait une chaîne truthy et court-circuitait tous les
    // replis suivants. La modale mobile affichait « undefined undefined ».
    expect(formatHistoryItemTitle({ id: 'm-1' }, 0, 'Réunion')).toBe('m-1');
    expect(formatHistoryItemTitle({}, 0, 'Réunion')).not.toContain('undefined');
  });

  it('garde le repli email + template quand les deux sont là', () => {
    expect(formatHistoryItemTitle({ email: 'a@b.fr', template: 'standard' }, 0, 'Réunion')).toBe(
      'a@b.fr standard',
    );
  });

  it('ignore un email sans template, et l’inverse', () => {
    expect(formatHistoryItemTitle({ email: 'a@b.fr', id: 'm-2' }, 0, 'Réunion')).toBe('m-2');
    expect(formatHistoryItemTitle({ template: 'standard', id: 'm-3' }, 0, 'Réunion')).toBe('m-3');
  });
});
