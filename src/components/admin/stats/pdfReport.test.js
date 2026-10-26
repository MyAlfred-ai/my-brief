import { describe, it, expect } from 'vitest';
import { uiTextData } from '../../../config/uiText.js';
import { REPORT_SECTIONS, ROWS_PER_SLICE, buildStatsReport } from './pdfReport.js';

const t = uiTextData.fr.adminStats;
const NOW = new Date('2026-08-18T10:00:00.000Z');

const account = (i, over = {}) => ({
  email: `compte${i}@client.fr`,
  name: `Compte ${i}`,
  disabled: false,
  groups: [{ id: 'ventes', name: 'Ventes', color: 'teal' }],
  status: 'regular',
  meetings: 100 - i,
  durationSeconds: 3600,
  avgDurationSeconds: 1800,
  activeWeeks: 3,
  weeks: 4,
  summaries: 2,
  previousMeetings: 1,
  lastMeetingAt: '2026-08-17T09:00:00.000Z',
  ...over,
});

const stats = (over = {}) => ({
  range: {
    days: 30,
    granularity: 'day',
    from: '2026-07-19T10:00:00.000Z',
    to: '2026-08-18T10:00:00.000Z',
  },
  coverage: { meetingsInRange: 4, withDuration: 4, withTranscriptionSize: 4 },
  totals: {
    meetings: 12,
    meetingsInRange: 4,
    durationSeconds: 7200,
    avgDurationSeconds: 1800,
    medianDurationSeconds: 1500,
    activeAccounts: 2,
    enabledUsers: 4,
    withSummary: 3,
  },
  previous: {
    from: '2026-06-19T10:00:00.000Z',
    to: '2026-07-19T10:00:00.000Z',
    meetings: 2,
    durationSeconds: 3600,
    activeAccounts: 1,
    enabledUsers: 4,
  },
  adoption: { regular: 2, occasional: 0, dormant: 1, never: 1 },
  series: [
    { key: '2026-08-17', meetings: 1, durationSeconds: 1800 },
    { key: '2026-08-18', meetings: 3, durationSeconds: 5400 },
  ],
  weekdays: [0, 1, 2, 3, 4, 5, 6].map((index) => ({ index, meetings: index === 0 ? 4 : 0 })),
  durationBuckets: [{ id: 'lt30', count: 4 }],
  templates: [{ template: 'decision', meetings: 4, labels: { fr: 'Décisions', en: 'Decisions' } }],
  accounts: [account(1), account(2, { name: '<script>alert(1)</script>' })],
  filters: {
    applied: { days: 30, from: null, to: null, group: 'ventes', user: '', template: '' },
    options: { groups: [{ id: 'ventes', name: 'Ventes' }], users: [], templates: [] },
  },
  costs: null,
  ...over,
});

const build = (over = {}, sections = REPORT_SECTIONS) =>
  buildStatsReport({
    stats: stats(over),
    sections,
    texts: t,
    lang: 'fr',
    author: 'Alex',
    now: NOW,
  });

describe('rapport PDF des statistiques', () => {
  it('rappelle la période, le périmètre et l’auteur en tête', () => {
    const { html, filename, meta } = build();
    expect(html).toContain('30 jours · 19/07/2026 – 18/08/2026');
    expect(html).toContain('Groupe Ventes');
    expect(html).toContain('18/08/2026 par Alex');
    expect(filename).toBe('mybrief_statistiques_2026-08-18.pdf');
    expect(meta).toMatchObject({ author: 'Alex', language: 'fr', footerText: t.pdf.footer });
  });

  it('ne contient que les sections cochées', () => {
    const { html } = build({}, ['overview']);
    expect(html).toContain(t.pdf.sections.overview);
    expect(html).not.toContain(t.pdf.sections.users);
    expect(html).not.toContain('sr-plot');
  });

  it('échappe les noms : une balise dans un nom reste du texte', () => {
    const { html } = build();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('écrit les écarts à la période précédente, et dit laquelle', () => {
    const { html } = build({}, ['overview']);
    expect(html.replace(/\s+/g, ' ')).toContain('▲ +100 %');
    // Fenêtre glissante : la précédente finit à l'instant où commence l'actuelle.
    expect(html).toContain('du 19/06/2026 au 19/07/2026');
  });

  it('chaque graphique est un bloc insécable', () => {
    const { html } = build({}, ['meetings', 'durations', 'weekdays']);
    const sections = html.split('<section').slice(1);
    expect(sections).toHaveLength(2); // les deux répartitions partagent une rangée
    for (const section of sections) expect(section).toMatch(/^[^>]*data-pdf-keep/);
  });

  it('découpe le tableau par utilisateur en tranches, chacune avec son en-tête', () => {
    const accounts = Array.from({ length: ROWS_PER_SLICE + 5 }, (_, i) => account(i));
    const { html } = build({ accounts }, ['users']);
    expect(html.match(/<table class="sr-table sr-users">/g)).toHaveLength(2);
    expect(html.match(/<thead>/g)).toHaveLength(2);
    expect(html.match(/<tbody>/g)).toHaveLength(2);
    // Du plus au moins actif.
    expect(html.indexOf('Compte 0')).toBeLessThan(html.indexOf('Compte 1<'));
  });

  it('centré sur un compte : ni adoption, ni classement, ni tableau de l’équipe', () => {
    const { html } = build({
      filters: {
        applied: { days: 30, user: 'compte1@client.fr' },
        options: { users: [{ email: 'compte1@client.fr', name: 'Compte 1' }] },
      },
    });
    expect(html).not.toContain(t.pdf.sections.adoption.replace("'", '&#39;'));
    expect(html).not.toContain(t.pdf.sections.users);
    expect(html).not.toContain(t.pdf.sections.topUsers);
    expect(html).toContain('Compte 1');
  });
});
