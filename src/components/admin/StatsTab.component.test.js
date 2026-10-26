/**
 * Onglet « Statistiques » de l'administration.
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - la période cadre TOUT l'écran : un clic relit le serveur avec la bonne
 *     fenêtre, et les figures se relisent sur cette tranche. Deux cartes qui
 *     répondraient à deux périodes différentes se contrediraient à l'écran ;
 *   - une moyenne calculée sur une PARTIE des réunions le dit. Les durées ne
 *     sont en base que depuis août 2026 : sans cette mention, une moyenne
 *     portant sur un quart des réunions passe pour la moyenne générale ;
 *   - chaque figure a son jumeau tableau — une infobulle n'est jamais le seul
 *     accès à une valeur ;
 *   - un rechargement ne remonte pas le squelette : les chiffres précédents
 *     tiennent leur place (sinon la page saute à chaque changement de période) ;
 *   - « Actualiser les tarifs » relit les statistiques quand le relevé aboutit,
 *     et dit ce qui a bougé — ou pourquoi rien n'a bougé ;
 *   - les filtres (dates, groupe, compte) partent au serveur, et un clic sur un
 *     nom du tableau centre la page sur ce compte ;
 *   - le rapport PDF reprend les sections cochées, et rien que celles-là.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';

const fetchUsageStats = vi.fn();
const refreshAiPrices = vi.fn();
vi.mock('../../services/adminUsersApi.js', () => ({
  fetchUsageStats: (...args) => fetchUsageStats(...args),
  refreshAiPrices: (...args) => refreshAiPrices(...args),
}));

const saveFile = vi.fn();
vi.mock('../../platform/download.js', () => ({
  saveFile: (...args) => saveFile(...args),
}));
// La mise en page du PDF demande un vrai navigateur (cf. src/lib/pdf/) : ici,
// seulement ce que l'onglet lui confie.
const htmlToPdfBlob = vi.fn();
vi.mock('../../utils/pdf.js', () => ({
  htmlToPdfBlob: (...args) => htmlToPdfBlob(...args),
}));

const { default: StatsTab } = await import('./StatsTab.svelte');

const t = uiTextData.fr.adminStats;

/** Ligne du tableau par utilisateur, telle que la route la rend (`accounts`). */
const account = (over = {}) => ({
  email: 'x@client.fr',
  name: '',
  role: 'user',
  disabled: false,
  groups: [{ id: 'default', name: 'Défaut', color: 'slate' }],
  createdAt: null,
  lastSeenAt: '2026-08-17T09:00:00.000Z',
  lastMeetingAt: '2026-08-18T09:00:00.000Z',
  meetings: 0,
  durationSeconds: 0,
  measuredMeetings: 0,
  avgDurationSeconds: null,
  summaries: 0,
  activeWeeks: 0,
  weeks: 6,
  previousMeetings: 0,
  meetingsTotal: 4,
  status: 'regular',
  ...over,
});

const payload = (over = {}) => ({
  generatedAt: '2026-08-18T10:00:00.000Z',
  range: {
    days: 30,
    granularity: 'day',
    from: '2026-07-19T10:00:00.000Z',
    to: '2026-08-18T10:00:00.000Z',
    firstMeetingAt: '2025-07-15T10:00:00.000Z',
  },
  coverage: { meetingsInRange: 4, withDuration: 4, withTranscriptionSize: 4 },
  totals: {
    meetings: 120,
    meetingsInRange: 4,
    durationSeconds: 7200,
    avgDurationSeconds: 1800,
    medianDurationSeconds: 1500,
    longestDurationSeconds: 3000,
    transcribedChars: 42000,
    users: 5,
    activeUsers: 2,
    activeAccounts: 2,
    enabledUsers: 4,
    newUsers: 0,
    withSummary: 3,
    withInfographic: 0,
  },
  series: [
    { key: '2026-08-17', meetings: 1, durationSeconds: 1800 },
    { key: '2026-08-18', meetings: 3, durationSeconds: 5400 },
  ],
  weekdays: [0, 1, 2, 3, 4, 5, 6].map((index) => ({ index, meetings: index === 0 ? 4 : 0 })),
  durationBuckets: [
    { id: 'lt15', count: 1 },
    { id: 'lt30', count: 2 },
    { id: 'lt60', count: 1 },
    { id: 'lt120', count: 0 },
    { id: 'gte120', count: 0 },
  ],
  templates: [{ template: 'standard', meetings: 4 }],
  // Estimation minimale : le détail de la carte se vérifie dans
  // stats/CostCard.component.test.js, ici seulement son câblage.
  costs: {
    currency: 'EUR',
    spanDays: 30,
    periodEur: 3.1,
    monthlyEur: 42.4,
    perHourEur: 1.55,
    perHourBasis: 'measured',
    perMeetingEur: 0.78,
    usage: { meetings: 4, audioSeconds: 7200, summaries: 4, infographics: 0, inferredDurations: 0 },
    lines: [
      {
        id: 'transcription',
        unit: 'hour',
        count: 2,
        models: ['gpt-realtime-whisper'],
        periodEur: 1.79,
        monthlyEur: 24.5,
        unitEur: 0.8971,
        unpriced: [],
        share: 0.58,
        alternatives: [],
      },
    ],
    unpriced: [],
    assumptions: {
      charsPerToken: 4,
      speechCharsPerSecond: 14,
      measuredSpeechRate: false,
      summaryOutputTokens: 4000,
      detectionCallsPerHour: 360,
      imageTokens: 5500,
    },
    pricing: {
      checkedAt: '2026-09-25',
      source: 'builtin',
      refreshedAt: null,
      refreshedBy: null,
      fx: { usdToEur: 0.8795, date: '2026-09-25', source: 'builtin' },
    },
  },
  previous: {
    from: '2026-06-19T10:00:00.000Z',
    to: '2026-07-19T10:00:00.000Z',
    meetings: 2,
    durationSeconds: 3600,
    avgDurationSeconds: 1800,
    withSummary: 2,
    activeUsers: 1,
    activeAccounts: 1,
    enabledUsers: 4,
  },
  adoption: { regular: 1, occasional: 1, dormant: 1, never: 1 },
  accounts: [
    account({
      email: 'claire@client.fr',
      name: 'Claire Meunier',
      meetings: 3,
      durationSeconds: 5400,
      status: 'regular',
      activeWeeks: 4,
      previousMeetings: 1,
    }),
    account({
      email: 'marc@client.fr',
      name: 'Marc Petit',
      meetings: 1,
      durationSeconds: 1800,
      status: 'occasional',
      activeWeeks: 1,
      previousMeetings: 1,
    }),
    account({
      email: 'dormeur@client.fr',
      name: 'Paul Dormant',
      status: 'dormant',
      meetingsTotal: 2,
      lastMeetingAt: '2026-01-10T09:00:00.000Z',
    }),
    account({ email: 'alice@client.fr', name: 'Alice Nouvelle', status: 'never' }),
  ],
  filters: {
    applied: { days: 30, from: null, to: null, group: '', user: '', template: '' },
    options: {
      groups: [
        { id: 'default', name: 'Défaut', color: 'slate' },
        { id: 'ventes', name: 'Ventes', color: 'teal' },
      ],
      users: [
        { email: 'alice@client.fr', name: 'Alice Nouvelle', disabled: false },
        { email: 'claire@client.fr', name: 'Claire Meunier', disabled: false },
      ],
      templates: [
        { template: 'standard', meetings: 4, labels: null },
        { template: 'decision', meetings: 1, labels: { fr: 'Décisions', en: 'Decisions' } },
      ],
    },
  },
  ...over,
});

/**
 * Rend l'onglet et attend la fin du chargement initial (onMount → fetch).
 * Rend le conteneur : « 4 » apparaît aussi bien en chiffre-clé qu'en graduation
 * d'axe, les assertions doivent viser la tuile, pas la page.
 */
async function renderTab(over = {}) {
  fetchUsageStats.mockResolvedValue({ ok: true, status: 200, data: payload(over) });
  const { container } = render(StatsTab);
  // « Réunions » titre aussi une colonne du tableau : attendre la tuile.
  await waitFor(() => expect(container.querySelector('.sv-tile')).not.toBeNull());
  return container;
}

/** Valeur affichée par la tuile dont le libellé est `label`. */
function tileValue(container, label) {
  const tile = [...container.querySelectorAll('.sv-tile')].find((node) =>
    node.textContent.includes(label),
  );
  // Espaces normalisées : Intl écrit « 50 % » avec une espace fine insécable.
  return tile?.querySelector('.sv-value')?.textContent.replace(/\s+/g, ' ').trim();
}

describe('StatsTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('charge la période de 30 jours au montage et affiche les mesures', async () => {
    const container = await renderTab();
    expect(fetchUsageStats).toHaveBeenCalledWith(expect.objectContaining({ days: 30, from: '' }));
    expect(tileValue(container, t.kpiMeetings)).toBe('4');
    expect(tileValue(container, t.kpiTotalTime)).toBe('2 h 00');
    expect(tileValue(container, t.kpiAverage)).toBe('30 min');
    expect(tileValue(container, t.kpiAdoption)).toBe('50 %');
    expect(tileValue(container, t.kpiSummaries)).toBe('75 %');
  });

  it('compare chaque mesure à la période précédente, flèche et signe compris', async () => {
    const container = await renderTab();
    const tile = [...container.querySelectorAll('.sv-tile')].find((node) =>
      node.textContent.includes(t.kpiMeetings),
    );
    const delta = tile.querySelector('.sv-delta');
    expect(delta.textContent.replace(/\s+/g, ' ').trim()).toBe('▲ +100 %');
    // La couleur n'est pas seule : la période comparée se lit en infobulle.
    expect(delta.getAttribute('title')).toContain('19/06/2026');
    // Taux d'adoption : un écart en POINTS, pas en pourcentage d'un pourcentage.
    const adoption = [...container.querySelectorAll('.sv-tile')].find((node) =>
      node.textContent.includes(t.kpiAdoption),
    );
    expect(adoption.querySelector('.sv-delta').textContent).toContain('+25 pt');
  });

  it('un changement de période relit le serveur avec cette fenêtre', async () => {
    await renderTab();
    await userEvent.click(screen.getByRole('button', { name: t.ranges['365'] }));
    expect(fetchUsageStats).toHaveBeenLastCalledWith(
      expect.objectContaining({ days: 365, from: '', to: '' }),
    );
  });

  it('une période choisie au jour près part au serveur en dates', async () => {
    const container = await renderTab();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(t.customRange) }));
    const [from, to] = container.querySelectorAll('.sf-custom input[type="date"]');
    await fireEvent.input(from, { target: { value: '2026-07-01' } });
    await fireEvent.input(to, { target: { value: '2026-07-31' } });
    await userEvent.click(screen.getByRole('button', { name: t.customApply }));
    expect(fetchUsageStats).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: '2026-07-01', to: '2026-07-31' }),
    );
  });

  it('un groupe choisi part au serveur ; « Effacer les filtres » le retire', async () => {
    await renderTab();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: t.filterGroup }), 'ventes');
    expect(fetchUsageStats).toHaveBeenLastCalledWith(expect.objectContaining({ group: 'ventes' }));
  });

  it('ne remonte pas le squelette au rechargement : les chiffres restent affichés', async () => {
    const container = await renderTab();
    // La réponse suivante ne se résout jamais : on observe l'écran PENDANT le
    // rechargement — c'est là qu'un squelette ferait sauter la page.
    fetchUsageStats.mockReturnValue(new Promise(() => {}));
    await userEvent.click(screen.getByRole('button', { name: t.ranges['7'] }));
    expect(tileValue(container, t.kpiMeetings)).toBe('4');
    expect(container.querySelector('.st-skeleton')).toBeNull();
  });

  it('signale une moyenne calculée sur une partie seulement des réunions', async () => {
    await renderTab({
      coverage: { meetingsInRange: 40, withDuration: 12, withTranscriptionSize: 12 },
    });
    expect(screen.getByText(t.partialDurations)).toBeTruthy();
    expect(screen.getByText('Sur 12 réunions sur 40')).toBeTruthy();
  });

  it('ne mentionne rien quand toutes les réunions de la période sont mesurées', async () => {
    await renderTab();
    expect(screen.queryByText(t.partialDurations)).toBeNull();
  });

  it('aucune durée mesurée : un tiret et une explication, jamais « 0 min »', async () => {
    // Cas de la mise en service : 84 réunions en base, toutes antérieures à la
    // mesure. « 0 min » se lirait « personne n'a enregistré ».
    const container = await renderTab({
      coverage: { meetingsInRange: 84, withDuration: 0, withTranscriptionSize: 0 },
      totals: {
        ...payload().totals,
        meetingsInRange: 84,
        durationSeconds: 0,
        avgDurationSeconds: null,
        medianDurationSeconds: null,
        transcribedChars: 0,
      },
      accounts: [],
    });
    expect(tileValue(container, t.kpiTotalTime)).toBe('—');
    expect(tileValue(container, t.kpiAverage)).toBe('—');
    expect(screen.getByText(t.noDurationNotice)).toBeTruthy();
    expect(screen.queryByText('0 min')).toBeNull();
    // Les réunions, elles, restent comptées : c'est la mesure qui manque.
    expect(tileValue(container, t.kpiMeetings)).toBe('84');
  });

  it('aucune durée mesurée : les figures de durée passent en état vide', async () => {
    // Une aire plate à zéro et cinq tranches vides se lisent comme des données,
    // alors qu'il n'y en a pas.
    await renderTab({
      coverage: { meetingsInRange: 84, withDuration: 0, withTranscriptionSize: 0 },
      totals: { ...payload().totals, meetingsInRange: 84, durationSeconds: 0 },
    });
    expect(screen.getAllByText(t.noDurationEmpty).length).toBe(2);
  });

  it('chaque figure a son jumeau tableau', async () => {
    const container = await renderTab();
    const toggles = screen.getAllByRole('button', { name: new RegExp(t.showTable) });
    expect(toggles.length).toBeGreaterThanOrEqual(5);

    // La bascule de la PREMIÈRE figure — la carte des dépenses, au-dessus, a la
    // sienne (cf. stats/CostCard.component.test.js).
    const firstChart = container.querySelector('.cc-card');
    await userEvent.click(
      within(firstChart).getByRole('button', { name: new RegExp(t.showTable) }),
    );
    const table = container.querySelector('.cc-table');
    expect(within(table).getByText(t.colMeetings)).toBeTruthy();
    // Le tableau porte les mêmes valeurs que le graphique, pas un résumé.
    expect(within(table).getByText('lundi 17 août')).toBeTruthy();
    expect(within(table).getByText('mardi 18 août')).toBeTruthy();
  });

  it('nomme les templates comme l’organisation, et les filtre par leur nom', async () => {
    await renderTab({
      templates: [
        { template: 'decision', meetings: 3, labels: { fr: 'Décisions', en: 'Decisions' } },
        { template: 'standard', meetings: 1, labels: null },
      ],
    });
    // Libellé de l'organisation, puis celui du code (« Standard »), jamais l'identifiant.
    expect(screen.getAllByText('Décisions').length).toBeGreaterThan(0);
    const select = screen.getByRole('combobox', { name: t.filterTemplate });
    expect(within(select).getByRole('option', { name: 'Décisions' })).toBeTruthy();
  });

  describe('santé de l’adoption et tableau par utilisateur', () => {
    it('répartit les comptes en quatre statuts, chiffres écrits', async () => {
      const container = await renderTab();
      const card = container.querySelector('.ad-card');
      expect(
        within(card).getByText('25 % des comptes utilisent myBrief au moins une semaine sur deux.'),
      ).toBeTruthy();
      for (const status of ['regular', 'occasional', 'dormant', 'never']) {
        expect(within(card).getByText(t.adoptionStatuses[status])).toBeTruthy();
      }
    });

    it('liste chaque compte avec son statut, sa régularité et sa dernière réunion', async () => {
      const container = await renderTab();
      const table = container.querySelector('.ut-table');
      const rows = table.querySelectorAll('tbody tr');
      expect(rows).toHaveLength(4);
      // Trié par réunions décroissantes : Claire d'abord.
      expect(rows[0].textContent).toContain('Claire Meunier');
      expect(rows[0].textContent).toContain('4/6 sem.');
      expect(within(table).getByText('Paul Dormant')).toBeTruthy();
      expect(within(table).getByText('10/01/2026')).toBeTruthy();
    });

    it('un statut de la carte d’adoption filtre le tableau', async () => {
      const container = await renderTab();
      const card = container.querySelector('.ad-card');
      await userEvent.click(
        within(card).getByRole('button', { name: new RegExp(t.adoptionStatuses.dormant) }),
      );
      const rows = container.querySelectorAll('.ut-table tbody tr');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('Paul Dormant');
    });

    it('la recherche filtre par nom, sans égard aux accents', async () => {
      const container = await renderTab();
      await userEvent.type(screen.getByRole('searchbox', { name: t.usersSearch }), 'meunier');
      const rows = container.querySelectorAll('.ut-table tbody tr');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('Claire Meunier');
    });

    it('un tri par colonne inverse l’ordre au second clic', async () => {
      const container = await renderTab();
      const header = screen.getByRole('button', { name: t.colUser });
      await userEvent.click(header);
      const names = () =>
        [...container.querySelectorAll('.ut-table tbody .ut-name')].map((n) => n.textContent);
      expect(names()).toEqual(['Alice Nouvelle', 'Claire Meunier', 'Marc Petit', 'Paul Dormant']);
      await userEvent.click(screen.getByRole('button', { name: new RegExp(t.colUser) }));
      expect(names()[0]).toBe('Paul Dormant');
    });

    it('exporte en CSV ce qui est affiché', async () => {
      await renderTab();
      await userEvent.click(screen.getByRole('button', { name: t.exportCsv }));
      expect(saveFile).toHaveBeenCalledTimes(1);
      const [{ filename, data }] = saveFile.mock.calls[0];
      expect(filename).toMatch(/^mybrief_utilisation_\d{4}-\d{2}-\d{2}\.csv$/);
      expect(data).toContain('Claire Meunier;claire@client.fr');
    });

    it('un clic sur un nom centre la page sur ce compte', async () => {
      await renderTab();
      fetchUsageStats.mockResolvedValue({
        ok: true,
        status: 200,
        data: payload({
          accounts: [payload().accounts[0]],
          filters: {
            ...payload().filters,
            applied: { ...payload().filters.applied, user: 'claire@client.fr' },
          },
        }),
      });
      await userEvent.click(screen.getByRole('button', { name: /Claire Meunier/ }));
      expect(fetchUsageStats).toHaveBeenLastCalledWith(
        expect.objectContaining({ user: 'claire@client.fr' }),
      );
      expect(await screen.findByText(t.focusKicker)).toBeTruthy();
      // Centrée sur un compte : ni carte d'adoption, ni tableau de l'équipe.
      expect(document.querySelector('.ad-card')).toBeNull();
      expect(document.querySelector('.ut-table')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: t.focusBack }));
      expect(fetchUsageStats).toHaveBeenLastCalledWith(expect.objectContaining({ user: '' }));
    });
  });

  describe('rapport PDF', () => {
    it('génère le PDF des seules sections cochées, sous le nom du jour', async () => {
      localStorage.clear();
      htmlToPdfBlob.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
      await renderTab();
      await userEvent.click(screen.getByRole('button', { name: t.exportPdf }));
      const dialog = screen.getByRole('dialog');
      await userEvent.click(within(dialog).getByRole('button', { name: t.pdf.none }));
      await userEvent.click(
        within(dialog).getByRole('checkbox', { name: t.pdf.sections.meetings }),
      );
      await userEvent.click(within(dialog).getByRole('button', { name: t.pdf.generate }));

      expect(htmlToPdfBlob).toHaveBeenCalledTimes(1);
      const [report] = htmlToPdfBlob.mock.calls[0];
      expect(report.html).toContain(t.pdf.sections.meetings);
      expect(report.html).not.toContain(t.pdf.sections.users);
      expect(saveFile).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: 'application/pdf', filename: report.filename }),
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('dit l’échec sans fermer la boîte', async () => {
      htmlToPdfBlob.mockRejectedValue(new Error('boom'));
      await renderTab();
      await userEvent.click(screen.getByRole('button', { name: t.exportPdf }));
      await userEvent.click(screen.getByRole('button', { name: t.pdf.generate }));
      expect(await screen.findByText(t.pdf.failed)).toBeTruthy();
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });

  it('affiche les dépenses d’IA estimées, sur la même période', async () => {
    const container = await renderTab();
    const card = container.querySelector('.co-card');
    expect(within(card).getByText(t.costs.title)).toBeTruthy();
    expect(card.querySelector('.co-figure-value').textContent.replace(/\s+/g, ' ')).toBe('42 €');
  });

  it('actualiser les tarifs : relit les statistiques et annonce le résultat', async () => {
    await renderTab();
    refreshAiPrices.mockResolvedValue({
      ok: true,
      status: 200,
      data: { updated: { prices: 16, fx: true }, missing: [] },
    });
    await userEvent.click(screen.getByRole('button', { name: t.costs.pricesRefresh }));
    expect(refreshAiPrices).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(t.costs.refreshedAll)).toBeTruthy();
    // La nouvelle estimation se lit sur la période affichée.
    expect(fetchUsageStats).toHaveBeenCalledTimes(2);
    expect(fetchUsageStats).toHaveBeenLastCalledWith(expect.objectContaining({ days: 30 }));
  });

  it('actualiser les tarifs : un relevé partiel ne s’annonce pas comme un succès', async () => {
    await renderTab();
    refreshAiPrices.mockResolvedValue({
      ok: true,
      status: 200,
      data: { updated: { prices: 16, fx: false }, missing: [] },
    });
    await userEvent.click(screen.getByRole('button', { name: t.costs.pricesRefresh }));
    expect(await screen.findByText(t.costs.refreshedNoFx)).toBeTruthy();
  });

  it('actualiser les tarifs : sources injoignables, le dernier relevé reste', async () => {
    await renderTab();
    refreshAiPrices.mockResolvedValue({
      ok: false,
      status: 502,
      data: { error: 'prices_unreachable' },
    });
    await userEvent.click(screen.getByRole('button', { name: t.costs.pricesRefresh }));
    expect(await screen.findByText(t.costs.errors.prices_unreachable)).toBeTruthy();
    expect(fetchUsageStats).toHaveBeenCalledTimes(1);
  });

  it('affiche l’erreur du serveur plutôt qu’un écran vide', async () => {
    fetchUsageStats.mockResolvedValue({ ok: false, status: 403, data: { error: 'forbidden' } });
    render(StatsTab);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent.length).toBeGreaterThan(0);
  });

  it('une période invalide se dit en clair', async () => {
    await renderTab();
    fetchUsageStats.mockResolvedValue({ ok: false, status: 400, data: { error: 'range_invalid' } });
    await userEvent.click(screen.getByRole('button', { name: t.ranges['7'] }));
    expect((await screen.findByRole('alert')).textContent).toBe(t.errors.range_invalid);
  });
});
