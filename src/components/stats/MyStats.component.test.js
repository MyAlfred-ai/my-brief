/**
 * « Mes statistiques » : la jauge du crédit, la page d'un compte, et le crédit
 * de chaque compte (Administration → Crédit de temps).
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - la jauge change de couleur avec ce qui RESTE (vert, ambre, orange,
 *     rouge), écrit toujours le reste en clair, et son curseur suit le reste
 *     — à la recette, on l'a cru bloqué ;
 *   - la date d'épuisement ne s'annonce que si le serveur lève l'alerte (au-delà
 *     de 15 points d'avance sur le rythme régulier) ;
 *   - un compte sans limite garde sa page, sans jauge ;
 *   - « Mes statistiques » ne montre que sa propre consommation, même à un
 *     administrateur : la vue de l'équipe est dans l'administration ;
 *   - un administrateur y ouvre la page d'un collègue, par son adresse, et
 *     revient à la liste ;
 *   - la liste nomme l'état de chaque crédit, et son filtre de groupe cadre
 *     aussi les compteurs du haut.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tick } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';

const fetchMyStats = vi.fn();
const fetchTeamCredits = vi.fn();
const fetchAccountStats = vi.fn();
vi.mock('../../services/statsApi.js', () => ({
  fetchMyStats: (...args) => fetchMyStats(...args),
  fetchTeamCredits: (...args) => fetchTeamCredits(...args),
  fetchAccountStats: (...args) => fetchAccountStats(...args),
}));

const { default: CreditGauge } = await import('./CreditGauge.svelte');
const { default: PersonalStats } = await import('./PersonalStats.svelte');
const { default: TeamCredits } = await import('./TeamCredits.svelte');
const { default: StatsPanel } = await import('../StatsPanel.svelte');
const { default: CreditsTab } = await import('../admin/CreditsTab.svelte');
const { auth } = await import('../../stores/auth.js');
const { panelNav } = await import('../../stores/panels.js');

const t = uiTextData.fr.myStats;
const qt = uiTextData.fr.quota;

const OCTOBER = {
  start: '2026-09-30T22:00:00.000Z',
  end: '2026-10-31T23:00:00.000Z',
  timeZone: 'Europe/Paris',
};
const days = Array.from({ length: 31 }, (_, i) => ({
  date: `2026-10-${String(i + 1).padStart(2, '0')}`,
  usedSeconds: i < 12 ? 1760 : 0,
}));

const credit = (over = {}) => ({
  unlimited: false,
  limitMinutes: 600,
  usedSeconds: 352 * 60,
  usedMinutes: 352,
  monthSeconds: 352 * 60,
  remainingMinutes: 248,
  exhausted: false,
  exhaustedOn: null,
  deletedSeconds: 12 * 60,
  period: OCTOBER,
  group: { id: 'g-prod', name: 'Équipe produit', color: 'blue' },
  days,
  pace: {
    elapsedRatio: 0.37,
    expectedRemainingSeconds: 368 * 60,
    aheadRatio: 0.22,
    exhaustsAt: '2026-10-20T12:27:00.000Z',
    alert: true,
  },
  ...over,
});

const payload = (over = {}) => ({
  range: 'month',
  granularity: 'day',
  from: OCTOBER.start,
  to: '2026-10-12T10:00:00.000Z',
  coverage: { meetingsInRange: 9, withDuration: 9, withTranscriptionSize: 9 },
  totals: {
    meetings: 9,
    meetingsAllTime: 42,
    durationSeconds: 340 * 60,
    avgDurationSeconds: 38 * 60,
    medianDurationSeconds: 31 * 60,
    longestDurationSeconds: 78 * 60,
    summaries: 11,
    regenerated: 2,
  },
  series: [
    { key: '2026-10-01', meetings: 1, durationSeconds: 1680 },
    { key: '2026-10-02', meetings: 1, durationSeconds: 2820 },
  ],
  weekdays: [0, 1, 2, 3, 4, 5, 6].map((index) => ({ index, meetings: index === 0 ? 3 : 1 })),
  durationBuckets: [
    { id: 'lt15', count: 0 },
    { id: 'lt30', count: 4 },
    { id: 'lt60', count: 4 },
    { id: 'lt120', count: 1 },
    { id: 'gte120', count: 0 },
  ],
  templates: [
    { template: 'standard', meetings: 4, labels: null },
    { template: 'comite', meetings: 1, labels: { fr: 'Comité de pilotage', en: 'Steering' } },
    { template: 'inconnu', meetings: 1, labels: null },
  ],
  credit: credit(),
  ...over,
});

beforeEach(() => {
  fetchMyStats.mockReset();
  fetchTeamCredits.mockReset();
  fetchAccountStats.mockReset();
});

describe('CreditGauge', () => {
  const gauge = (remainingMinutes, paceRatio = null) =>
    render(CreditGauge, {
      props: {
        limitSeconds: 600 * 60,
        remainingSeconds: remainingMinutes * 60,
        paceRatio,
        quotaTexts: qt,
        texts: t,
        animate: false,
      },
    });

  it('se colore d après ce qui reste, et l écrit en clair', () => {
    const cases = [
      [400, 'cg-high'],
      [248, 'cg-mid'],
      [60, 'cg-low'],
    ];
    for (const [minutes, tone] of cases) {
      const { unmount } = gauge(minutes);
      expect(document.querySelector('.cg').getAttribute('class')).toContain(tone);
      unmount();
    }
    gauge(248);
    expect(screen.getByText('4 h 08')).toBeTruthy();
    expect(screen.getByText('restantes sur 10 h')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Il reste 4 h 08 sur 10 h' })).toBeTruthy();
  });

  it('le curseur suit ce qui reste : il recule quand on consomme', async () => {
    const { component } = gauge(300);
    const knobX = () => Number(document.querySelector('.cg-knob').getAttribute('cx'));
    // 300 min restantes sur 600 : la poignée est au sommet de l'arc.
    expect(knobX()).toBeCloseTo(120, 0);
    // 150 sur 600 : un quart de l'arc, à gauche — 120 + 92 × cos 210°.
    component.$set({ remainingSeconds: 150 * 60 });
    await tick();
    expect(knobX()).toBeCloseTo(40.33, 1);
    // Tout consommé : la poignée revient au départ de l'arc.
    component.$set({ remainingSeconds: 0 });
    await tick();
    expect(knobX()).toBeCloseTo(40.33, 1);
    expect(Number(document.querySelector('.cg-knob').getAttribute('cy'))).toBeCloseTo(164, 0);
  });

  it('épuisé : rouge, sans arc ni repère, et le dit', () => {
    gauge(0, 0.4);
    expect(document.querySelector('.cg').getAttribute('class')).toContain('cg-out');
    expect(screen.getByText(t.exhaustedBig)).toBeTruthy();
    expect(document.querySelector('.cg-fill')).toBeNull();
  });

  it('pose le repère du rythme régulier seulement quand il est connu', () => {
    const { unmount } = gauge(248);
    expect(document.querySelector('.cg-pace')).toBeNull();
    unmount();
    gauge(248, 0.61);
    expect(document.querySelector('.cg-pace')).toBeTruthy();
  });
});

describe('PersonalStats — sa propre page', () => {
  it('le crédit du mois, l alerte de rythme, et les chiffres de la période', async () => {
    fetchMyStats.mockResolvedValue({ ok: true, data: payload() });
    render(PersonalStats);
    expect(await screen.findByText('4 h 08')).toBeTruthy();
    expect(fetchMyStats).toHaveBeenCalledWith('month');
    expect(screen.getByText(/votre crédit sera épuisé vers le 20 octobre/)).toBeTruthy();
    expect(screen.getByText(/Quota du groupe Équipe produit : 10 h/)).toBeTruthy();
    // La réunion supprimée explique l'écart entre le temps et le crédit.
    expect(
      screen.getByText('+ 12 min de réunions supprimées, comptées dans le crédit'),
    ).toBeTruthy();
    expect(screen.getByText('Dont 2 régénérés')).toBeTruthy();
    expect(screen.getByText(t.chartCredit)).toBeTruthy();
    // Modèles : le libellé du serveur, celui du code, et l'absence de modèle.
    expect(screen.getByText('Comité de pilotage')).toBeTruthy();
    expect(screen.getByText('Standard')).toBeTruthy();
    expect(screen.getByText(t.templateUnknown)).toBeTruthy();
  });

  it('sans alerte du serveur, pas de date d épuisement', async () => {
    fetchMyStats.mockResolvedValue({
      ok: true,
      data: payload({
        credit: credit({ pace: { ...credit().pace, alert: false } }),
      }),
    });
    render(PersonalStats);
    await screen.findByText('4 h 08');
    expect(screen.queryByText(/sera épuisé vers le/)).toBeNull();
  });

  it('une autre période relit le serveur, le crédit reste celui du mois', async () => {
    fetchMyStats.mockResolvedValue({ ok: true, data: payload() });
    render(PersonalStats);
    await screen.findByText('4 h 08');
    fetchMyStats.mockResolvedValue({
      ok: true,
      data: payload({ range: '90', granularity: 'week' }),
    });
    await userEvent.click(screen.getByRole('button', { name: t.ranges['90'] }));
    expect(fetchMyStats).toHaveBeenLastCalledWith('90');
    expect(await screen.findByRole('heading', { name: t.chartTime })).toBeTruthy();
    expect(screen.getByText('4 h 08')).toBeTruthy();
  });

  it('un compte sans limite : la page, sans jauge', async () => {
    fetchMyStats.mockResolvedValue({
      ok: true,
      data: payload({
        credit: credit({ unlimited: true, limitMinutes: null, remainingMinutes: null, pace: null }),
      }),
    });
    render(PersonalStats);
    expect(await screen.findByText(t.unlimitedTitle)).toBeTruthy();
    expect(screen.getByText('5 h 52 enregistrées en octobre.')).toBeTruthy();
    expect(document.querySelector('.cg')).toBeNull();
    expect(screen.queryByText(t.chartCredit)).toBeNull();
  });

  it('un échec se dit, sans page blanche', async () => {
    fetchMyStats.mockResolvedValue({ ok: false, data: { error: 'network' } });
    render(PersonalStats);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(t.errors.unknown);
  });
});

describe('PersonalStats — la page d un collègue', () => {
  it('se lit par l adresse du compte, et ramène à l équipe', async () => {
    fetchAccountStats.mockResolvedValue({ ok: true, data: payload() });
    const onBack = vi.fn();
    render(PersonalStats, {
      props: { account: { email: 'camille@client.fr', name: 'Camille Roux' }, onBack },
    });
    expect(await screen.findByText('Statistiques de Camille Roux')).toBeTruthy();
    expect(fetchAccountStats).toHaveBeenCalledWith('camille@client.fr', 'month');
    expect(fetchMyStats).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: t.back }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('TeamCredits', () => {
  const team = () => ({
    period: OCTOBER,
    groups: [
      { id: 'default', name: 'Défaut', color: 'slate' },
      { id: 'g-sales', name: 'Commercial', color: 'blue' },
      { id: 'g-prod', name: 'Équipe produit', color: 'teal' },
    ],
    summary: { accounts: 4, limited: 3, exhausted: 1, atRisk: 1 },
    accounts: [
      {
        email: 'hugo@client.fr',
        name: 'Hugo Martin',
        groups: [{ id: 'g-sales', name: 'Commercial', color: 'blue' }],
        unlimited: false,
        limitMinutes: 480,
        usedSeconds: 480 * 60,
        remainingMinutes: 0,
        exhausted: true,
        exhaustedOn: '2026-10-09',
        pace: { alert: false, exhaustsAt: null },
        meetings: 14,
        lastMeetingAt: '2026-10-12T08:00:00.000Z',
      },
      {
        email: 'camille@client.fr',
        name: 'Camille Roux',
        groups: [{ id: 'g-prod', name: 'Équipe produit', color: 'teal' }],
        unlimited: false,
        limitMinutes: 600,
        usedSeconds: 352 * 60,
        remainingMinutes: 248,
        exhausted: false,
        exhaustedOn: null,
        pace: { alert: true, exhaustsAt: '2026-10-20T12:27:00.000Z' },
        meetings: 9,
        lastMeetingAt: '2026-10-12T08:00:00.000Z',
      },
      {
        email: 'sarah@client.fr',
        name: 'Sarah Lefèvre',
        groups: [{ id: 'g-prod', name: 'Équipe produit', color: 'teal' }],
        unlimited: false,
        limitMinutes: 600,
        usedSeconds: 96 * 60,
        remainingMinutes: 504,
        exhausted: false,
        exhaustedOn: null,
        pace: { alert: false, exhaustsAt: null },
        meetings: 4,
        lastMeetingAt: '2026-10-08T08:00:00.000Z',
      },
      {
        email: 'lucas@client.fr',
        name: 'Lucas Petit',
        groups: [{ id: 'default', name: 'Défaut', color: 'slate' }],
        unlimited: true,
        limitMinutes: null,
        usedSeconds: 19 * 3600 + 120,
        remainingMinutes: null,
        exhausted: false,
        exhaustedOn: null,
        pace: null,
        meetings: 31,
        lastMeetingAt: null,
      },
    ],
  });

  it('nomme l état de chaque crédit, et ouvre la page d un compte', async () => {
    fetchTeamCredits.mockResolvedValue({ ok: true, data: team() });
    const onOpen = vi.fn();
    render(TeamCredits, { props: { onOpen } });
    expect(await screen.findByText('Épuisé le 9 oct.')).toBeTruthy();
    expect(screen.getByText('Épuisé vers le 20 oct.')).toBeTruthy();
    expect(screen.getByText(t.paceOk)).toBeTruthy();
    expect(screen.getByText(t.paceNone)).toBeTruthy();
    expect(screen.getByText('4 h 08 sur 10 h')).toBeTruthy();
    expect(screen.getByText('Illimité · 19 h 02 ce mois')).toBeTruthy();
    expect(screen.getByText(t.never)).toBeTruthy();
    expect(document.querySelector('.tc-ring-out')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Camille Roux/ }));
    expect(onOpen).toHaveBeenCalledWith({ email: 'camille@client.fr', name: 'Camille Roux' });
  });

  it('le filtre de groupe cadre la liste et les compteurs', async () => {
    fetchTeamCredits.mockResolvedValue({ ok: true, data: team() });
    render(TeamCredits);
    await screen.findByText('Hugo Martin');
    await userEvent.click(screen.getByRole('button', { name: 'Équipe produit' }));
    expect(screen.queryByText('Hugo Martin')).toBeNull();
    expect(screen.getByText('Camille Roux')).toBeTruthy();
    expect(screen.getByText('2 sur 2')).toBeTruthy();
  });
});

describe('Mes statistiques : sa propre consommation, rien de l équipe', () => {
  it('même pour un administrateur : une seule section, aucune lecture de l équipe', async () => {
    auth.set({
      status: 'authenticated',
      user: { email: 'patron@client.fr', name: 'Patron', role: 'admin' },
      capabilities: {},
    });
    fetchMyStats.mockResolvedValue({ ok: true, data: payload() });
    render(StatsPanel);
    await screen.findByText('4 h 08');
    expect(get(panelNav).items.map((item) => item.id)).toEqual(['me']);
    expect(screen.queryByText(t.teamIntro)).toBeNull();
    expect(fetchTeamCredits).not.toHaveBeenCalled();
    expect(fetchAccountStats).not.toHaveBeenCalled();
  });
});

describe('Administration → Crédit de temps', () => {
  it('la liste, la page d un compte, et le retour à la liste', async () => {
    fetchTeamCredits.mockResolvedValue({
      ok: true,
      data: {
        period: OCTOBER,
        groups: [{ id: 'g-prod', name: 'Équipe produit', color: 'teal' }],
        summary: { accounts: 1, limited: 1, exhausted: 0, atRisk: 1 },
        accounts: [
          {
            email: 'camille@client.fr',
            name: 'Camille Roux',
            groups: [{ id: 'g-prod', name: 'Équipe produit', color: 'teal' }],
            unlimited: false,
            limitMinutes: 600,
            usedSeconds: 352 * 60,
            remainingMinutes: 248,
            exhausted: false,
            exhaustedOn: null,
            pace: { alert: true, exhaustsAt: '2026-10-20T12:27:00.000Z' },
            meetings: 9,
            lastMeetingAt: '2026-10-12T08:00:00.000Z',
          },
        ],
      },
    });
    fetchAccountStats.mockResolvedValue({ ok: true, data: payload() });
    render(CreditsTab);
    await userEvent.click(await screen.findByRole('button', { name: /Camille Roux/ }));
    expect(await screen.findByText('Statistiques de Camille Roux')).toBeTruthy();
    expect(fetchAccountStats).toHaveBeenCalledWith('camille@client.fr', 'month');
    await userEvent.click(screen.getByRole('button', { name: t.back }));
    expect(await screen.findByText(t.teamIntro)).toBeTruthy();
  });
});
