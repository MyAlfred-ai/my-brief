/**
 * Tableau de bord de l'administration : les constats du diagnostic en
 * phrases, chacun avec le chemin de la page où il se corrige, puis l'activité
 * récente.
 *
 * Ce qui casserait sans ces tests : un constat grave noyé sous un conseil
 * (l'ordre), un lien qui n'ouvrirait pas la bonne page — la pastille de la
 * colonne et la ligne du tableau de bord doivent mener au même endroit —, un
 * constat perdu parce que l'écran ne connaît pas encore sa page, et une carte
 * d'activité en échec qui emporterait les points à régler avec elle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';

const fetchUsageStats = vi.fn();
vi.mock('../../services/adminUsersApi.js', () => ({
  fetchUsageStats: (...args) => fetchUsageStats(...args),
}));

const { default: DashboardTab } = await import('./DashboardTab.svelte');
const { configChecks } = await import('../../stores/configChecks.js');
const { panelNav, selectPanelSection } = await import('../../stores/panels.js');

const t = uiTextData.fr.adminDashboard;
const checks = uiTextData.fr.configChecks.issues;

const PAGES = [
  { id: 'dashboard', label: 'Tableau de bord', group: '' },
  { id: 'ai', label: 'Clés API', group: 'Modèles IA' },
  { id: 'actions', label: 'Actions', group: 'Capacités' },
  { id: 'stats', label: 'Consommation', group: 'Coûts' },
  { id: 'company', label: 'Entreprise', group: 'Organisation' },
];
const TOTALS = {
  meetingsInRange: 42,
  durationSeconds: 3 * 3600 + 5 * 60,
  activeAccounts: 7,
  enabledUsers: 12,
};

const issuesList = () => screen.getByRole('region', { name: t.issuesTitle });
const rows = () => within(issuesList()).getAllByRole('listitem');

beforeEach(() => {
  vi.clearAllMocks();
  selectPanelSection('dashboard');
  fetchUsageStats.mockResolvedValue({ ok: true, data: { totals: TOTALS } });
  configChecks.set({ loaded: true, account: [], organization: [] });
});

describe('DashboardTab — points à régler', () => {
  it('du plus grave au plus léger, la gravité écrite, et le chemin de la page', async () => {
    configChecks.set({
      loaded: true,
      account: [],
      organization: [
        { section: 'company', code: 'org_context_empty', level: 'tip' },
        { section: 'ai', code: 'ai_key_missing', level: 'error' },
        { section: 'actions', code: 'storage_provider_missing', level: 'warning' },
      ],
    });
    render(DashboardTab, { props: { pages: PAGES } });

    const [first, second, third] = rows();
    expect(within(first).getByText(t.levels.error)).toBeTruthy();
    expect(within(first).getByText(checks.ai_key_missing)).toBeTruthy();
    expect(within(first).getByRole('button', { name: 'Modèles IA › Clés API' })).toBeTruthy();
    expect(within(second).getByText(t.levels.warning)).toBeTruthy();
    expect(within(second).getByRole('button', { name: 'Capacités › Actions' })).toBeTruthy();
    expect(within(third).getByText(t.levels.tip)).toBeTruthy();
    expect(within(third).getByRole('button', { name: 'Organisation › Entreprise' })).toBeTruthy();
  });

  it('le lien d’un constat ouvre SA page', async () => {
    configChecks.set({
      loaded: true,
      account: [],
      organization: [{ section: 'ai', code: 'ai_key_missing', level: 'error' }],
    });
    render(DashboardTab, { props: { pages: PAGES } });

    await userEvent.click(screen.getByRole('button', { name: 'Modèles IA › Clés API' }));
    expect(get(panelNav).active).toBe('ai');
  });

  it('un constat dont la page est inconnue reste listé, sans lien', () => {
    configChecks.set({
      loaded: true,
      account: [],
      organization: [{ section: 'inconnue', code: 'ai_key_missing', level: 'error' }],
    });
    render(DashboardTab, { props: { pages: PAGES } });

    const [row] = rows();
    expect(within(row).getByText(checks.ai_key_missing)).toBeTruthy();
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('rien à régler : la page le dit, plutôt que de rester vide', () => {
    render(DashboardTab, { props: { pages: PAGES } });
    expect(within(issuesList()).getByText(t.issuesEmpty)).toBeTruthy();
    expect(within(issuesList()).queryByRole('listitem')).toBeNull();
  });

  it('tant que le diagnostic n’est pas lu, ni liste ni « rien à régler »', () => {
    configChecks.set({ loaded: false, account: [], organization: [] });
    render(DashboardTab, { props: { pages: PAGES } });
    expect(screen.queryByText(t.issuesEmpty)).toBeNull();
    expect(within(issuesList()).queryByRole('listitem')).toBeNull();
  });
});

describe('DashboardTab — activité', () => {
  it('trois chiffres sur 30 jours, et le lien vers « Consommation »', async () => {
    render(DashboardTab, { props: { pages: PAGES } });

    const activity = screen.getByRole('region', { name: t.activityTitle });
    expect(await within(activity).findByText('42')).toBeTruthy();
    expect(within(activity).getByText('3 h 05')).toBeTruthy();
    expect(within(activity).getByText('7 sur 12')).toBeTruthy();
    expect(fetchUsageStats).toHaveBeenCalledWith({ days: 30 });

    await userEvent.click(within(activity).getByRole('button', { name: t.activityLink }));
    expect(get(panelNav).active).toBe('stats');
  });

  it('en échec, la carte le dit — les points à régler restent lisibles', async () => {
    fetchUsageStats.mockResolvedValue({ ok: false, status: 500, data: { error: 'boom' } });
    configChecks.set({
      loaded: true,
      account: [],
      organization: [{ section: 'ai', code: 'ai_key_missing', level: 'error' }],
    });
    render(DashboardTab, { props: { pages: PAGES } });

    expect(await screen.findByText(t.activityError)).toBeTruthy();
    expect(rows()).toHaveLength(1);
  });
});
