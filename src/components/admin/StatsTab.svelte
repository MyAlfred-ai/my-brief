<script>
  /**
   * Onglet « Statistiques » du panneau d'administration — l'usage réel de
   * l'installation, lu comme un responsable le lit : l'outil est-il adopté,
   * par qui, à quel rythme, et pour quel coût ?
   *
   * Autonome, comme les autres onglets : son chargement, ses erreurs et ses
   * appels API lui appartiennent, AdminPanel se contente de le monter.
   *
   * FILTRES (stats/StatsFilters) : période glissante ou choisie, groupe,
   * compte, template. Ils cadrent TOUTE la page — le serveur filtre avant de
   * compter, les chiffres ne se contredisent jamais d'une carte à l'autre — et
   * le rapport PDF les reprend en en-tête. Filtrer sur un compte centre la page
   * sur lui (stats/UserFocus) : c'est la vue « par utilisateur ».
   *
   * DEUX HONNÊTETÉS auxquelles il ne faut pas toucher :
   *
   * 1. Les durées ne sont persistées que depuis 2026-08 (cf. routes/meetings.js).
   *    Les réunions antérieures n'ont PAS une durée de zéro, elles n'ont pas de
   *    durée : elles sortent des moyennes et l'écran affiche sur combien de
   *    réunions la moyenne est calculée. Sans cette mention, une moyenne fondue
   *    dans des zéros passerait pour une mesure.
   * 2. Chaque figure a son jumeau tableau (bouton « Données » de la carte). Une
   *    infobulle n'est jamais le seul accès à une valeur.
   *
   * Palette : deux séries seulement — orange de marque pour les réunions, teal
   * pour le temps — plus une rampe ORDONNÉE d'orange pour les tranches de durée,
   * et l'échelle « tout va bien → à traiter » des statuts d'adoption
   * (`--adopt-*`), toujours accompagnée de son nombre.
   *
   * Les DÉPENSES D'IA (stats/CostCard) arrivent dans la même réponse que
   * l'usage, sur le même périmètre. Seule l'actualisation des tarifs a son
   * propre appel — un relevé en ligne, à la demande — puis relit les
   * statistiques.
   */
  import { onMount, tick } from 'svelte';
  import IconCalendar from '~icons/solar/calendar-linear';
  import IconClock from '~icons/solar/clock-circle-linear';
  import IconChart from '~icons/solar/chart-square-linear';
  import IconUsers from '~icons/solar/users-group-rounded-linear';
  import IconDocument from '~icons/solar/document-text-linear';
  import IconGraph from '~icons/solar/graph-up-linear';

  import ChartCard from './stats/ChartCard.svelte';
  import ColumnChart from './stats/ColumnChart.svelte';
  import AreaChart from './stats/AreaChart.svelte';
  import BarList from './stats/BarList.svelte';
  import StatTile from './stats/StatTile.svelte';
  import CostCard from './stats/CostCard.svelte';
  import StatsFilters from './stats/StatsFilters.svelte';
  import AdoptionCard from './stats/AdoptionCard.svelte';
  import UsageTable from './stats/UsageTable.svelte';
  import UserFocus from './stats/UserFocus.svelte';
  import ExportDialog from './stats/ExportDialog.svelte';
  import { REPORT_SECTIONS, buildStatsReport } from './stats/pdfReport.js';
  import {
    formatCount,
    formatDuration,
    formatHours,
    formatBucket,
    formatBucketLong,
    formatDate,
    formatPercent,
    niceScale,
  } from './stats/format.js';
  import {
    accountName,
    adoptionRate,
    deltaOf,
    formatDelta,
    pointsDeltaOf,
    rangeDatesOf,
    rangeLabelOf,
    scopePartsOf,
    sortAccounts,
    templateName,
  } from './stats/statsView.js';
  import { fetchUsageStats, refreshAiPrices } from '../../services/adminUsersApi.js';
  import { htmlToPdfBlob } from '../../utils/pdf.js';
  import { saveFile } from '../../platform/download.js';
  import { showToast } from '../../stores/toasts.js';
  import { auth } from '../../stores/auth.js';
  import { uiText, currentLanguageStore } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { refreshConfigChecks } from '../../stores/configChecks.js';

  let stats = null;
  /** Filtres demandés — `applied` (réponse) dit ceux que le serveur a réellement appliqués. */
  let filters = { days: 30, from: '', to: '', group: '', user: '', template: '' };
  let loading = true;
  let refreshing = false;
  let errorMessage = '';
  let pricesRefreshing = false;
  /** Résultat de la dernière actualisation des tarifs : `{tone, text}`. */
  let pricesNotice = null;
  /** Statut affiché par le tableau par utilisateur ('' = tous). */
  let usersStatus = '';
  let exportOpen = false;
  let exporting = false;
  let exportError = '';
  /** Dernière requête partie : une réponse plus ancienne, arrivée après, est ignorée. */
  let requestSeq = 0;

  $: texts = $uiText.adminStats;
  $: userTexts = $uiText.adminUsers;
  $: lang = $currentLanguageStore;

  onMount(() => load(filters));

  /**
   * Un rechargement ne remonte PAS le squelette : la page garde son rendu
   * précédent en retrait le temps de la réponse. Un squelette à chaque clic de
   * filtre ferait sauter la page à chaque fois.
   */
  async function load(next) {
    filters = next;
    errorMessage = '';
    if (stats) refreshing = true;
    else loading = true;
    const seq = ++requestSeq;
    const res = await fetchUsageStats(next);
    if (seq !== requestSeq) return;
    loading = false;
    refreshing = false;
    if (!res.ok) {
      errorMessage = texts.errors[res.data?.error] || userTexts.errors.unknown;
      return;
    }
    stats = res.data;
  }

  /**
   * « Actualiser les tarifs » : relevé en ligne côté serveur, puis relecture
   * des statistiques — c'est elle qui rapporte l'estimation aux nouveaux prix.
   * Un relevé partiel se dit : les tarifs sans le taux de change, ou l'inverse,
   * ne s'annoncent pas comme un succès complet.
   */
  async function refreshPrices() {
    const costTexts = texts.costs;
    pricesRefreshing = true;
    pricesNotice = null;
    const res = await refreshAiPrices();
    pricesRefreshing = false;
    if (!res.ok) {
      pricesNotice = {
        tone: 'error',
        text: costTexts.errors[res.data?.error] || userTexts.errors.unknown,
      };
      return;
    }
    const { updated = {}, missing = [] } = res.data || {};
    // Les pastilles de configuration disent peut-être autre chose, maintenant.
    refreshConfigChecks();
    const base =
      updated.prices && updated.fx
        ? costTexts.refreshedAll
        : updated.prices
          ? costTexts.refreshedNoFx
          : costTexts.refreshedFxOnly;
    pricesNotice = {
      tone: updated.prices && updated.fx && !missing.length ? 'ok' : 'warn',
      text: missing.length
        ? `${base} ${fill(costTexts.refreshedMissing, { count: formatCount(missing.length, lang) })}`
        : base,
    };
    await load(filters);
  }

  /** Centre la page sur un compte : le filtre « Utilisateur », comme depuis la barre. */
  function focusOn(email) {
    usersStatus = '';
    load({ ...filters, user: String(email || '').toLowerCase() });
  }

  /** Un statut de la carte d'adoption → le tableau, filtré, à l'écran. */
  async function showStatus(status) {
    usersStatus = status;
    await tick();
    document
      .getElementById('stats-usage-table')
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  async function exportPdf(event) {
    exporting = true;
    exportError = '';
    try {
      const report = buildStatsReport({
        stats,
        sections: event.detail,
        texts,
        lang,
        author: $auth.user?.name || $auth.user?.email || '',
      });
      const blob = await htmlToPdfBlob(report);
      await saveFile({ filename: report.filename, mimeType: 'application/pdf', data: blob });
      exportOpen = false;
      showToast(texts.pdf.done, 'success');
    } catch (error) {
      console.error('❌ Rapport PDF des statistiques :', error);
      exportError = texts.pdf.failed;
    } finally {
      exporting = false;
    }
  }

  // ── Périmètre ─────────────────────────────────────────────────────────────
  // Toutes les dérivations nomment leurs dépendances : Svelte ne suit que les
  // identifiants qu'il VOIT. Une fonction qui lirait `stats` ou `lang` en
  // interne ne recalculerait jamais au changement de filtre ou de langue.
  $: applied = stats?.filters?.applied || { days: filters.days };
  $: options = stats?.filters?.options || null;
  $: accounts = stats?.accounts || [];
  $: focused = !!applied.user;
  $: focusAccount = focused
    ? accounts.find((row) => row.email.toLowerCase() === applied.user) ||
      options?.users?.find((user) => user.email.toLowerCase() === applied.user) || {
        email: applied.user,
      }
    : null;
  $: rangeLabel = rangeLabelOf(applied, texts, lang);
  $: rangeDates = rangeDatesOf(stats?.range, lang);
  $: scopeText = scopePartsOf(applied, options, texts, lang).join(' · ');
  $: showGroups = (options?.groups || []).length > 1;

  // ── Séries ────────────────────────────────────────────────────────────────
  $: granularity = stats?.range?.granularity || 'day';
  $: meetingPoints = (stats?.series || []).map((point) => ({
    key: point.key,
    label: formatBucket(point.key, granularity, lang),
    longLabel: formatBucketLong(point.key, granularity, lang),
    value: point.meetings,
  }));
  $: meetingScale = niceScale(meetingPoints.reduce((best, p) => Math.max(best, p.value), 0));

  // Le temps se lit en heures : un axe en secondes afficherait « 43 200 ».
  $: hourPoints = (stats?.series || []).map((point) => ({
    key: point.key,
    label: formatBucket(point.key, granularity, lang),
    longLabel: formatBucketLong(point.key, granularity, lang),
    value: Math.round((point.durationSeconds / 3600) * 10) / 10,
  }));
  $: hourScale = niceScale(hourPoints.reduce((best, p) => Math.max(best, p.value), 0));

  $: sparkPoints = meetingPoints.slice(-12).map((point) => point.value);

  $: durationItems = (stats?.durationBuckets || []).map((bucket) => ({
    key: bucket.id,
    label: texts.buckets[bucket.id],
    value: bucket.count,
  }));

  $: weekdayPoints = (stats?.weekdays || []).map((day) => ({
    key: String(day.index),
    label: texts.weekdaysShort[day.index],
    longLabel: texts.weekdaysLong[day.index],
    value: day.meetings,
  }));
  $: weekdayScale = niceScale(weekdayPoints.reduce((best, p) => Math.max(best, p.value), 0));

  $: templateItems = (stats?.templates || []).map((row) => ({
    key: row.template,
    label: templateName(row, lang, texts.templateUnknown),
    title: row.template,
    value: row.meetings,
  }));

  $: topUsers = sortAccounts(
    accounts.filter((row) => row.meetings > 0),
    'meetings',
    'desc',
  ).slice(0, 8);
  $: topItems = topUsers.map((account) => ({
    key: account.email,
    label: accountName(account),
    title: account.email,
    value: account.meetings,
    hint: account.durationSeconds ? formatDuration(account.durationSeconds, lang) : '',
  }));

  // ── Tableaux jumeaux ──────────────────────────────────────────────────────
  $: meetingRows = meetingPoints.map((point) => [
    point.longLabel,
    formatCount(point.value, lang),
    formatDuration(
      (stats?.series || []).find((s) => s.key === point.key)?.durationSeconds || 0,
      lang,
    ),
  ]);
  $: durationRows = durationItems.map((item) => [item.label, formatCount(item.value, lang)]);
  $: weekdayRows = weekdayPoints.map((point) => [point.longLabel, formatCount(point.value, lang)]);
  $: templateRows = templateItems.map((item) => [item.label, formatCount(item.value, lang)]);
  $: topRows = topUsers.map((account) => [
    account.email,
    formatCount(account.meetings, lang),
    formatDuration(account.durationSeconds, lang),
  ]);

  // ── Mentions de fiabilité ─────────────────────────────────────────────────
  $: withDuration = stats?.coverage?.withDuration ?? 0;
  $: inRange = stats?.coverage?.meetingsInRange ?? 0;
  // AUCUNE durée mesurée sur la période : « 0 min » se lirait comme « personne
  // n'a enregistré », alors que 84 réunions sont là — elles sont simplement
  // antérieures à la mesure. Un tiret et une phrase, jamais un zéro.
  $: noDuration = inRange > 0 && withDuration === 0;
  $: partialDurations = inRange > 0 && withDuration > 0 && withDuration < inRange;
  $: durationBasis = partialDurations
    ? fill(texts.durationBasis, {
        counted: formatCount(withDuration, lang),
        total: formatCount(inRange, lang),
      })
    : '';
  $: periodHint = fill(texts.periodHint, { range: rangeLabel.toLowerCase() });

  // ── Écarts à la période précédente ────────────────────────────────────────
  $: totals = stats?.totals || {};
  $: previous = stats?.previous || null;
  $: previousSpan = previous
    ? {
        from: formatDate(previous.from, lang),
        to: formatDate(new Date(Date.parse(previous.to) - 1).toISOString(), lang),
      }
    : null;
  /** Pastille d'écart d'une tuile : texte, sens, et la période comparée en infobulle. */
  function chip(delta, before, span, language, t) {
    if (!delta || !span) return null;
    return {
      direction: delta.direction,
      text: formatDelta(delta, language, t),
      title: fill(t.deltaTitle, { ...span, value: before }),
    };
  }
  $: meetingsChip = chip(
    deltaOf(totals.meetingsInRange, previous?.meetings),
    formatCount(previous?.meetings, lang),
    previousSpan,
    lang,
    texts,
  );
  $: timeChip = noDuration
    ? null
    : chip(
        deltaOf(totals.durationSeconds, previous?.durationSeconds),
        formatDuration(previous?.durationSeconds, lang),
        previousSpan,
        lang,
        texts,
      );
  $: rate = adoptionRate(totals.activeAccounts, totals.enabledUsers);
  $: previousRate = previous ? adoptionRate(previous.activeAccounts, previous.enabledUsers) : null;
  $: adoptionChip =
    rate === null || previousRate === null
      ? null
      : chip(
          pointsDeltaOf(rate, previousRate),
          formatPercent(previousRate, lang),
          previousSpan,
          lang,
          texts,
        );
  $: adoptionHint = totals.enabledUsers
    ? [
        fill(texts.kpiAdoptionHint, {
          active: formatCount(totals.activeAccounts, lang),
          enabled: formatCount(totals.enabledUsers, lang),
        }),
        totals.newUsers === 1
          ? texts.kpiNewUser
          : totals.newUsers
            ? fill(texts.kpiNewUsersShort, { count: formatCount(totals.newUsers, lang) })
            : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : texts.kpiAdoptionNone;
  $: summaryShare = totals.meetingsInRange ? totals.withSummary / totals.meetingsInRange : null;

  $: exportSections = REPORT_SECTIONS.map((id) => ({
    id,
    available:
      !(focused && ['adoption', 'topUsers', 'users'].includes(id)) &&
      !(id === 'costs' && !stats?.costs),
  }));
</script>

<div class="st-wrap" class:st-refreshing={refreshing}>
  <p class="st-intro">{texts.intro}</p>

  <!-- Un seul rang de filtres, au-dessus de TOUT ce qu'il cadre : chaque figure
       de la page se relit sur la même tranche, les chiffres ne se contredisent
       jamais entre deux cartes. -->
  <StatsFilters
    {filters}
    {options}
    {texts}
    {lang}
    {refreshing}
    canExport={!!stats && !loading}
    on:change={(event) => load(event.detail)}
    on:refresh={() => load(filters)}
    on:exportpdf={() => {
      exportError = '';
      exportOpen = true;
    }}
  />

  {#if errorMessage}
    <div class="st-error" role="alert">{errorMessage}</div>
  {/if}

  {#if loading}
    <div class="st-skeleton" aria-hidden="true"></div>
  {:else if stats}
    {#if focused && focusAccount}
      <UserFocus
        account={focusAccount}
        {texts}
        {lang}
        on:back={() => load({ ...filters, user: '' })}
      />
    {/if}

    <p class="st-scope">
      <span>{rangeLabel}</span>
      {#if rangeDates}<span class="st-scope-dates">{rangeDates}</span>{/if}
      <span class="st-scope-sep" aria-hidden="true">·</span>
      <span>{scopeText}</span>
    </p>

    <div class="st-kpis">
      <StatTile
        hero
        icon={IconCalendar}
        label={texts.kpiMeetings}
        value={formatCount(totals.meetingsInRange, lang)}
        delta={meetingsChip}
        hint={fill(texts.kpiMeetingsHint, {
          total: formatCount(totals.meetings, lang),
          range: rangeLabel.toLowerCase(),
        })}
        spark={sparkPoints}
      />
      <div class="st-kpi-grid">
        <StatTile
          icon={IconClock}
          label={texts.kpiTotalTime}
          value={totals.durationSeconds ? formatDuration(totals.durationSeconds, lang) : '—'}
          delta={timeChip}
          hint={noDuration ? texts.kpiNoDuration : durationBasis}
        />
        <StatTile
          icon={IconChart}
          label={texts.kpiAverage}
          value={totals.avgDurationSeconds ? formatDuration(totals.avgDurationSeconds, lang) : '—'}
          hint={totals.medianDurationSeconds
            ? fill(texts.kpiAverageHint, {
                median: formatDuration(totals.medianDurationSeconds, lang),
              })
            : texts.kpiNoDuration}
        />
        {#if focused}
          <!-- Un seul compte : un taux d'adoption vaudrait 0 ou 100 %. Sa
               régularité dit la même chose, à sa mesure. -->
          <StatTile
            icon={IconGraph}
            label={texts.colRegularity}
            value={focusAccount?.weeks
              ? fill(texts.regularity, {
                  active: focusAccount.activeWeeks,
                  weeks: focusAccount.weeks,
                })
              : '—'}
            hint={focusAccount?.weeks
              ? fill(texts.regularityTitle, {
                  active: focusAccount.activeWeeks,
                  weeks: focusAccount.weeks,
                })
              : ''}
          />
        {:else}
          <StatTile
            icon={IconUsers}
            label={texts.kpiAdoption}
            value={rate === null ? '—' : formatPercent(rate, lang)}
            delta={adoptionChip}
            hint={adoptionHint}
          />
        {/if}
        <StatTile
          icon={IconDocument}
          label={texts.kpiSummaries}
          value={summaryShare === null ? '—' : formatPercent(summaryShare, lang)}
          hint={summaryShare === null
            ? texts.kpiSummariesNone
            : fill(texts.kpiSummariesHint, {
                count: formatCount(totals.withSummary, lang),
                total: formatCount(totals.meetingsInRange, lang),
              })}
        />
      </div>
    </div>

    {#if noDuration}
      <p class="st-notice">{texts.noDurationNotice}</p>
    {:else if partialDurations}
      <p class="st-notice">{texts.partialDurations}</p>
    {/if}

    {#if !focused}
      <!-- L'adoption puis les personnes : « combien l'utilisent ? » appelle
           « qui ? ». Un statut de la carte filtre le tableau juste dessous. -->
      <AdoptionCard
        adoption={stats.adoption}
        {texts}
        {lang}
        on:select={(e) => showStatus(e.detail)}
      />
      <UsageTable
        {accounts}
        {texts}
        {lang}
        {showGroups}
        bind:status={usersStatus}
        on:focus={(event) => focusOn(event.detail)}
      />
    {/if}

    <CostCard
      costs={stats.costs}
      {texts}
      {lang}
      refreshing={pricesRefreshing}
      notice={pricesNotice}
      on:refreshprices={refreshPrices}
    />

    <div class="st-grid">
      <ChartCard
        wide
        title={texts.chartMeetings}
        hint={periodHint}
        columns={[texts.colPeriod, texts.colMeetings, texts.colTime]}
        rows={meetingRows}
        tableLabel={texts.showTable}
        chartLabel={texts.showChart}
        emptyLabel={texts.empty}
      >
        <ColumnChart
          points={meetingPoints}
          ticks={meetingScale.ticks}
          max={meetingScale.max}
          formatValue={(value) => formatCount(value, lang)}
          formatTick={(value) => formatCount(value, lang)}
          ariaLabel={texts.chartMeetings}
        />
      </ChartCard>

      <!-- Aucune durée mesurée = pas de courbe à tracer : une aire plate à zéro
           se lirait comme « personne n'a enregistré ». La carte passe alors en
           état vide et dit pourquoi. Même raison pour la répartition des durées
           juste en dessous. -->
      <ChartCard
        wide
        title={texts.chartTime}
        hint={texts.chartTimeHint}
        columns={[texts.colPeriod, texts.colTime]}
        rows={noDuration ? [] : meetingRows.map((row) => [row[0], row[2]])}
        tableLabel={texts.showTable}
        chartLabel={texts.showChart}
        emptyLabel={noDuration ? texts.noDurationEmpty : texts.empty}
      >
        <AreaChart
          points={hourPoints}
          ticks={hourScale.ticks}
          max={hourScale.max}
          formatValue={(value) => fill(texts.hours, { value: formatHours(value, lang) })}
          formatTick={(value) => formatHours(value, lang)}
          ariaLabel={texts.chartTime}
        />
      </ChartCard>

      <ChartCard
        title={texts.chartDurations}
        hint={texts.chartDurationsHint}
        columns={[texts.colBucket, texts.colMeetings]}
        rows={noDuration ? [] : durationRows}
        tableLabel={texts.showTable}
        chartLabel={texts.showChart}
        emptyLabel={noDuration ? texts.noDurationEmpty : texts.empty}
      >
        <!-- Tranches ORDONNÉES : une rampe d'une seule teinte, du clair au
             foncé — la couleur porte l'ordre, pas l'identité. -->
        <BarList
          items={durationItems}
          colors={[
            'var(--viz-ramp-1)',
            'var(--viz-ramp-2)',
            'var(--viz-ramp-3)',
            'var(--viz-ramp-4)',
            'var(--viz-ramp-5)',
          ]}
          formatValue={(value) => formatCount(value, lang)}
        />
      </ChartCard>

      <ChartCard
        title={texts.chartWeekdays}
        hint={texts.chartWeekdaysHint}
        columns={[texts.colDay, texts.colMeetings]}
        rows={weekdayRows}
        tableLabel={texts.showTable}
        chartLabel={texts.showChart}
        emptyLabel={texts.empty}
      >
        <ColumnChart
          points={weekdayPoints}
          ticks={weekdayScale.ticks}
          max={weekdayScale.max}
          height={170}
          labelWidth={26}
          formatValue={(value) => formatCount(value, lang)}
          formatTick={(value) => formatCount(value, lang)}
          ariaLabel={texts.chartWeekdays}
        />
      </ChartCard>

      {#if !focused}
        <ChartCard
          title={texts.chartTopUsers}
          hint={texts.chartTopUsersHint}
          columns={[texts.colUser, texts.colMeetings, texts.colTime]}
          rows={topRows}
          tableLabel={texts.showTable}
          chartLabel={texts.showChart}
          emptyLabel={texts.emptyUsers}
        >
          <BarList items={topItems} formatValue={(value) => formatCount(value, lang)} />
        </ChartCard>
      {/if}

      <ChartCard
        wide={focused}
        title={texts.chartTemplates}
        hint={texts.chartTemplatesHint}
        columns={[texts.colTemplate, texts.colMeetings]}
        rows={templateRows}
        tableLabel={texts.showTable}
        chartLabel={texts.showChart}
        emptyLabel={texts.empty}
      >
        <BarList
          items={templateItems}
          color="var(--viz-series-2)"
          formatValue={(value) => formatCount(value, lang)}
        />
      </ChartCard>
    </div>

    <p class="st-footnote">
      {fill(texts.footnote, {
        first: stats.range.firstMeetingAt ? formatDate(stats.range.firstMeetingAt, lang) : '—',
        total: formatCount(totals.meetings, lang),
      })}
    </p>
  {/if}
</div>

{#if exportOpen && stats}
  <ExportDialog
    {texts}
    sections={exportSections}
    periodText={[rangeLabel, rangeDates].filter(Boolean).join(' · ')}
    {scopeText}
    busy={exporting}
    errorMessage={exportError}
    on:generate={exportPdf}
    on:cancel={() => (exportOpen = false)}
  />
{/if}

<style>
  /* Palette des figures : jetons `--viz-*` de styles/tokens.css, partagés
     avec « Mes statistiques ». */
  .st-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    transition: opacity 0.15s;
  }
  /* Rechargement : le rendu précédent tient sa place, en retrait. Pas de
     squelette, pas de saut de page à chaque changement de filtre. */
  .st-refreshing {
    opacity: 0.55;
  }

  .st-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
  }

  /* Même phrase d'intro que les autres onglets : dire ce qu'on regarde ici. */
  .st-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  /* Ce que les chiffres couvrent, en clair, juste au-dessus d'eux : une
     capture d'écran de la page dit encore de quelle période et de qui elle
     parle. */
  .st-scope {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.5rem;
    margin: 0.1rem 0 -0.2rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .st-scope-dates {
    font-weight: 400;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }
  .st-scope-sep {
    color: var(--ink-faint);
  }

  /* ── Mesures ── */
  .st-kpis {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 2fr;
    gap: 0.75rem;
  }
  /* 148 px : deux tuiles tiennent côte à côte sur un téléphone (331 px utiles),
     ce que 160 px ratait de deux pixels — une colonne unique de cinq tuiles. */
  .st-kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    gap: 0.75rem;
  }

  .st-notice {
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    border: 1px dashed var(--line-strong);
    background: var(--surface-tint);
    font-size: 0.79rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  /* ── Grille des figures ──
     `align-items: start` : chaque carte prend la hauteur de son contenu. Étirées
     à la hauteur de la plus grande de leur rangée, les courtes (cinq tranches de
     durée à côté de huit utilisateurs) se retrouvaient avec 150 px de blanc
     dessous, ce qui se lit comme un graphique tronqué.

     Deux colonnes au plus (`min(100%, 420px)`) : à trois, la dernière carte
     restait seule sur sa rangée avec deux emplacements vides à sa droite. */
  .st-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
    align-items: start;
    gap: 0.75rem;
  }

  .st-footnote {
    margin: 0.2rem 0 0;
    font-size: 0.75rem;
    color: var(--ink-faint);
    line-height: 1.5;
  }

  .st-skeleton {
    height: 320px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: st-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes st-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .st-skeleton {
      animation: none;
    }
  }

  @media (max-width: 900px) {
    .st-kpis {
      grid-template-columns: 1fr;
    }
  }
</style>
