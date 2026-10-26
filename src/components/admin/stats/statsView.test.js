import { describe, it, expect } from 'vitest';
import { uiTextData } from '../../../config/uiText.js';
import {
  accountsCsv,
  adoptionItems,
  deltaOf,
  formatDelta,
  matchesQuery,
  pointsDeltaOf,
  rangeLabelOf,
  regularShareOf,
  scopePartsOf,
  sortAccounts,
  templateName,
} from './statsView.js';

const t = uiTextData.fr.adminStats;
const space = (text) => text.replace(/\s+/g, ' ');

const row = (over) => ({
  email: 'x@client.fr',
  name: '',
  groups: [],
  status: 'regular',
  meetings: 0,
  durationSeconds: 0,
  avgDurationSeconds: null,
  activeWeeks: 0,
  weeks: 4,
  summaries: 0,
  lastMeetingAt: null,
  lastSeenAt: null,
  previousMeetings: 0,
  meetingsTotal: 0,
  ...over,
});

describe('écarts à la période précédente', () => {
  it('une hausse, une baisse, une stabilité, une nouveauté', () => {
    expect(deltaOf(12, 10)).toEqual({ direction: 'up', ratio: 0.2 });
    expect(deltaOf(5, 10).direction).toBe('down');
    expect(deltaOf(10, 10)).toEqual({ direction: 'flat', ratio: 0 });
    expect(deltaOf(3, 0)).toEqual({ direction: 'new', ratio: null });
  });

  it('rien à dire sans période précédente, ni sur deux zéros', () => {
    expect(deltaOf(3, null)).toBeNull();
    expect(deltaOf(0, 0)).toBeNull();
  });

  it('s’écrit signé, en pourcentage ou en points', () => {
    expect(space(formatDelta(deltaOf(12, 10), 'fr', t))).toBe('+20 %');
    expect(formatDelta(deltaOf(5, 10), 'en', t)).toBe('-50%');
    expect(formatDelta(deltaOf(3, 0), 'fr', t)).toBe(t.deltaNew);
    expect(formatDelta(pointsDeltaOf(0.5, 0.42), 'fr', t)).toBe('+8 pt');
  });
});

describe('période et périmètre en mots', () => {
  it('une période glissante par son nom, une période choisie par ses dates', () => {
    expect(rangeLabelOf({ days: 90 }, t, 'fr')).toBe('90 jours');
    expect(rangeLabelOf({ days: null, from: '2026-09-01', to: '2026-09-30' }, t, 'fr')).toBe(
      'du 01/09/2026 au 30/09/2026',
    );
  });

  it('nomme chaque filtre posé, ou toute l’organisation', () => {
    const options = {
      groups: [{ id: 'ventes', name: 'Ventes' }],
      users: [{ email: 'Claire@client.fr', name: 'Claire Meunier' }],
      templates: [{ template: 'decision', labels: { fr: 'Décisions', en: 'Decisions' } }],
    };
    expect(scopePartsOf({}, options, t, 'fr')).toEqual([t.everyone]);
    expect(
      scopePartsOf(
        { group: 'ventes', user: 'claire@client.fr', template: 'decision' },
        options,
        t,
        'fr',
      ),
    ).toEqual(['Groupe Ventes', 'Claire Meunier', 'Template Décisions']);
    // Un groupe supprimé entre-temps se dit par son identifiant, il ne disparaît pas.
    expect(scopePartsOf({ group: 'disparu' }, options, t, 'fr')).toEqual(['Groupe disparu']);
  });

  it('un template se nomme comme l’organisation, puis comme le code, puis par sa valeur', () => {
    expect(templateName({ template: 'x', labels: { fr: 'Maison' } }, 'fr', '?')).toBe('Maison');
    expect(templateName({ template: 'standard' }, 'fr', '?')).not.toBe('standard');
    expect(templateName({ template: 'perso' }, 'fr', '?')).toBe('perso');
    expect(templateName({ template: 'inconnu' }, 'fr', 'Sans template')).toBe('Sans template');
  });
});

describe('tableau par utilisateur', () => {
  const rows = [
    row({ email: 'b@x.fr', name: 'Béatrice', meetings: 3, status: 'occasional' }),
    row({ email: 'a@x.fr', name: 'Arnaud', meetings: 3, status: 'regular' }),
    row({ email: 'c@x.fr', name: 'Chloé', meetings: 0, status: 'never' }),
  ];

  it('trie par réunions, puis par nom à égalité', () => {
    expect(sortAccounts(rows, 'meetings', 'desc').map((r) => r.name)).toEqual([
      'Arnaud',
      'Béatrice',
      'Chloé',
    ]);
  });

  it('trie le statut du plus au moins engagé', () => {
    expect(sortAccounts(rows, 'status', 'asc').map((r) => r.status)).toEqual([
      'regular',
      'occasional',
      'never',
    ]);
  });

  it('cherche sans égard aux accents ni à la casse, groupes compris', () => {
    const withGroup = row({ name: 'Zoé', groups: [{ id: 'g', name: 'Équipe Nord' }] });
    expect(matchesQuery(rows[0], 'beatrice')).toBe(true);
    expect(matchesQuery(withGroup, 'equipe')).toBe(true);
    expect(matchesQuery(rows[2], 'arnaud')).toBe(false);
  });

  it('répartit les statuts et dit la part des réguliers', () => {
    const adoption = { regular: 1, occasional: 2, dormant: 0, never: 1 };
    expect(adoptionItems(adoption).map((i) => i.count)).toEqual([1, 2, 0, 1]);
    expect(space(regularShareOf(adoption, 'fr'))).toBe('25 %');
    expect(regularShareOf({}, 'fr')).toBe('');
  });

  it('exporte un CSV lisible par un tableur : BOM, séparateur, minutes, dates ISO', () => {
    const csv = accountsCsv(
      [
        row({
          email: 'a@x.fr',
          name: 'Dupont; Jean',
          groups: [{ id: 'g', name: 'Ventes' }],
          meetings: 2,
          durationSeconds: 3600,
          avgDurationSeconds: 1800,
          activeWeeks: 2,
          lastMeetingAt: '2026-08-14T09:00:00.000Z',
          previousMeetings: null,
        }),
      ],
      t,
      'fr',
    );
    const [header, line] = csv.replace('\u{FEFF}', '').trim().split('\r\n');
    expect(csv.startsWith('\u{FEFF}')).toBe(true);
    expect(header.split(';')[0]).toBe(t.csv.name);
    // Un point-virgule dans un nom ne décale pas les colonnes.
    expect(line).toBe('"Dupont; Jean";a@x.fr;Ventes;Régulier;2;;60;30;2;4;0;2026-08-14;;0');
    expect(accountsCsv([row({})], t, 'en').split('\r\n')[0]).toContain(',');
  });
});
