/**
 * Carte « Dépenses d'IA estimées » (onglet Statistiques).
 *
 * Ce qui se vérifie ici :
 *   - les trois chiffres de tête — par mois, une heure, la période — et d'où
 *     vient l'heure (mesurée, ou réunion type quand rien n'est enregistré) ;
 *   - la répartition a son jumeau tableau, comme toutes les figures de la page ;
 *   - un modèle sans tarif connu est SIGNALÉ, jamais compté pour zéro en silence ;
 *   - la comparaison montre le modèle en service et l'écart des autres ;
 *   - la provenance des tarifs et du taux de change est sous les chiffres ;
 *   - le français et l'anglais ont les mêmes libellés.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../../config/uiText.js';
import CostCard from './CostCard.svelte';

const texts = uiTextData.fr.adminStats;
const t = texts.costs;

const alternative = (model, monthlyEur, over = {}) => ({
  model,
  current: false,
  priced: true,
  tariff: { kind: 'text', inputMTok: 2.5, outputMTok: 15 },
  periodEur: monthlyEur,
  monthlyEur,
  unitEur: 0.08,
  ...over,
});

const costsFixture = (over = {}) => ({
  currency: 'EUR',
  spanDays: 30,
  periodEur: 28.53,
  monthlyEur: 28.94,
  perHourEur: 1.4267,
  perHourBasis: 'measured',
  perMeetingEur: 1.43,
  usage: {
    meetings: 20,
    audioSeconds: 72000,
    summaries: 20,
    infographics: 2,
    inferredDurations: 3,
    unmeasured: 0,
  },
  lines: [
    {
      id: 'transcription',
      unit: 'hour',
      count: 20,
      models: ['gpt-realtime-whisper'],
      periodEur: 17.94,
      monthlyEur: 18.2,
      unitEur: 0.8971,
      unpriced: [],
      share: 0.63,
      alternatives: [
        alternative('gpt-realtime-whisper', 18.2, {
          current: true,
          tariff: { kind: 'audio', audioMinute: 0.017 },
        }),
        alternative('gpt-4o-mini-transcribe', 3.21, {
          tariff: { kind: 'audio', audioMinute: 0.003 },
        }),
      ],
    },
    {
      id: 'summary',
      unit: 'summary',
      count: 20,
      models: ['gpt-5.4'],
      periodEur: 1.66,
      monthlyEur: 1.68,
      unitEur: 0.083,
      unpriced: [],
      share: 0.06,
      alternatives: [
        alternative('gpt-5.4', 1.68, { current: true }),
        alternative('gpt-5.4-mini', 0.5),
      ],
    },
    {
      id: 'infographic',
      unit: 'infographic',
      count: 2,
      models: ['gpt-5.4', 'gpt-image-2.5-flare'],
      periodEur: 0.42,
      monthlyEur: 0.43,
      unitEur: 0.2093,
      unpriced: [],
      share: 0.01,
      alternatives: [
        alternative('gpt-image-2.5-flare', 0.43, {
          current: true,
          tariff: { kind: 'image', inputMTok: 5, imageOutputMTok: 30, imageUsd: 0.165 },
        }),
      ],
    },
    {
      id: 'assistants',
      unit: 'hour',
      count: 20,
      models: ['gpt-5-mini', 'gpt-4o-mini'],
      periodEur: 8.51,
      monthlyEur: 8.63,
      unitEur: 0.4257,
      unpriced: [],
      share: 0.3,
      alternatives: [],
    },
  ],
  unpriced: [],
  assumptions: {
    charsPerToken: 4,
    speechCharsPerSecond: 13.9,
    measuredSpeechRate: true,
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
  ...over,
});

function renderCard(props = {}) {
  return render(CostCard, { costs: costsFixture(), texts, lang: 'fr', ...props });
}

/**
 * Valeur du chiffre de tête dont le libellé est `label`, espaces normalisées :
 * Intl sépare le montant du symbole par une espace insécable.
 */
function figure(container, label) {
  const node = [...container.querySelectorAll('.co-figure')].find((el) =>
    el.textContent.includes(label),
  );
  return node?.querySelector('.co-figure-value')?.textContent.replace(/\s+/g, ' ').trim();
}

describe('CostCard', () => {
  it('annonce la dépense par mois, le coût d’une heure et le total de la période', () => {
    const { container } = renderCard();
    expect(figure(container, t.monthly)).toBe('29 €');
    expect(figure(container, t.perHour)).toBe('1,43 €');
    expect(figure(container, t.period)).toBe('28,53 €');
    // Trois durées déduites du texte entrent dans la moyenne : l'indice le dit.
    expect(screen.getByText('Moyenne sur 20 h 00 de réunion, dont 3 à durée déduite')).toBeTruthy();
    expect(screen.getByText('20 réunions · 1,43 € par réunion')).toBeTruthy();
  });

  it('sans heure enregistrée, le coût d’une heure est celui d’une réunion type', () => {
    renderCard({
      costs: costsFixture({
        perHourBasis: 'reference',
        periodEur: 0,
        monthlyEur: 0,
        usage: { ...costsFixture().usage, meetings: 0, audioSeconds: 0 },
      }),
    });
    expect(screen.getByText(t.perHourReference)).toBeTruthy();
    expect(screen.getByText(t.periodHintEmpty)).toBeTruthy();
  });

  it('répartit la dépense par poste, avec modèle, coût unitaire et part', () => {
    renderCard();
    const breakdown = screen.getByRole('group', { name: t.breakdownLabel });
    expect(within(breakdown).getByText(t.lines.transcription)).toBeTruthy();
    expect(within(breakdown).getByText('18,20 € / mois')).toBeTruthy();
    expect(
      within(breakdown).getByText("gpt-realtime-whisper · 0,90 € l'heure · 63 % des dépenses"),
    ).toBeTruthy();
    // 0,083 € et non « 0,08 € » : deux décimales effaceraient la différence entre modèles.
    expect(
      within(breakdown).getByText('gpt-5.4 · 0,083 € le compte rendu · 6 % des dépenses'),
    ).toBeTruthy();
  });

  it('a son jumeau tableau, avec les mêmes valeurs', async () => {
    const { container } = renderCard();
    await userEvent.click(screen.getByRole('button', { name: new RegExp(texts.showTable) }));
    const table = container.querySelector('.co-table');
    expect(within(table).getByText(t.colMonthly)).toBeTruthy();
    expect(within(table).getByText('gpt-5-mini, gpt-4o-mini')).toBeTruthy();
    expect(within(table).getByText('17,94 €')).toBeTruthy();
    expect(within(table).getAllByText('20 h 00').length).toBe(2);
  });

  it('signale un modèle sans tarif connu au lieu de le compter pour zéro', () => {
    const base = costsFixture();
    renderCard({
      costs: {
        ...base,
        unpriced: ['gpt-7-mystere'],
        lines: base.lines.map((line) =>
          line.id === 'summary'
            ? { ...line, models: ['gpt-7-mystere'], periodEur: 0, unpriced: ['gpt-7-mystere'] }
            : line,
        ),
      },
    });
    expect(screen.getByRole('note').textContent).toContain('gpt-7-mystere');
    expect(screen.getByText('Tarif inconnu pour gpt-7-mystere')).toBeTruthy();
  });

  it('compare les modèles proposés : le modèle en service et l’écart des autres', async () => {
    const { container } = renderCard();
    await userEvent.click(screen.getByText(t.compareTitle));
    const tables = [...container.querySelectorAll('.co-compare')];
    expect(tables.map((table) => table.querySelector('caption').textContent)).toEqual([
      t.lines.transcription,
      t.lines.summary,
      t.lines.infographic,
    ]);
    const transcription = tables[0];
    expect(within(transcription).getByText(t.current)).toBeTruthy();
    // Le tarif public reste en dollars, tel que le fournisseur le publie.
    expect(within(transcription).getByText('0,017 $ / min')).toBeTruthy();
    const cheaper = within(transcription).getByText('gpt-4o-mini-transcribe').closest('tr');
    expect(cheaper.textContent).toMatch(/[-−]\s?14,99\s€/);
    expect(within(tables[2]).getByText('0,165 $ / image')).toBeTruthy();
    expect(
      within(tables[1]).getAllByText('2,50 $ entrée · 15 $ sortie, par million de jetons').length,
    ).toBe(2);
  });

  it('dans un cadre étroit, chaque modèle se lit en fiche : les cellules se passent de l’en-tête', async () => {
    // Sur téléphone, l'en-tête du tableau est masqué à l'œil (requête de
    // conteneur, invisible en jsdom) : le coût par mois porte « / mois », l'écart
    // son intitulé, et le modèle en service n'affiche pas d'écart avec lui-même.
    // Les rôles explicites gardent la sémantique de tableau quand l'affichage change.
    const { container } = renderCard();
    await userEvent.click(screen.getByText(t.compareTitle));
    const table = container.querySelector('.co-compare');
    expect(table.getAttribute('role')).toBe('table');
    expect(table.parentElement.classList.contains('co-compare-wrap')).toBe(true);
    const [current, cheaper] = table.querySelectorAll('tbody tr');
    expect(current.getAttribute('role')).toBe('row');
    expect(current.querySelector('.co-monthly').dataset.suffix).toBe('/ mois');
    expect(current.querySelector('.co-delta').classList.contains('co-delta-none')).toBe(true);
    const delta = cheaper.querySelector('.co-delta');
    expect(delta.dataset.label).toBe(t.colDelta);
    expect(delta.classList.contains('co-delta-none')).toBe(false);
  });

  it('dit d’où viennent les tarifs et le taux de change, et les hypothèses', async () => {
    renderCard();
    expect(screen.getByText('Tarifs du 25/09/2026 (relevé intégré à myBrief)')).toBeTruthy();
    expect(screen.getByText('1 $ = 0,8795 € (taux intégré, 25/09/2026)')).toBeTruthy();
    await userEvent.click(screen.getByText(t.assumptionsTitle));
    expect(screen.getByText(/Réunions sans durée enregistrée.*: 3\./)).toBeTruthy();
    expect(screen.getByText(/environ 360 analyses par heure/)).toBeTruthy();
  });

  it('émet la demande d’actualisation, et se désactive pendant le relevé', async () => {
    const { component, rerender } = renderCard();
    let asked = 0;
    component.$on('refreshprices', () => (asked += 1));
    await userEvent.click(screen.getByRole('button', { name: t.pricesRefresh }));
    expect(asked).toBe(1);
    await rerender({ refreshing: true, notice: null });
    expect(screen.getByRole('button', { name: t.pricesRefreshing }).disabled).toBe(true);
  });

  it('annonce le résultat du relevé dans une zone d’état', async () => {
    const { rerender } = renderCard();
    expect(screen.getByRole('status').textContent).toBe('');
    await rerender({ notice: { tone: 'ok', text: t.refreshedAll } });
    expect(screen.getByRole('status').textContent).toBe(t.refreshedAll);
  });

  it('estimation indisponible : la carte le dit, sans chiffre inventé', () => {
    const { container } = renderCard({ costs: null });
    expect(screen.getByText(t.unavailable)).toBeTruthy();
    expect(container.querySelector('.co-figure')).toBeNull();
  });

  it('français et anglais portent les mêmes libellés', () => {
    const keys = (node, prefix = '') =>
      Object.entries(node).flatMap(([key, value]) =>
        value && typeof value === 'object' ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
      );
    expect(keys(uiTextData.en.adminStats.costs).sort()).toEqual(keys(t).sort());
  });
});
