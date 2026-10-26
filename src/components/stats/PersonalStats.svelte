<script>
  /**
   * « Mes statistiques » — la page d'UN compte : son crédit de temps du mois
   * (jauge, rythme, « Au fil du mois »), puis son usage sur la période choisie
   * (réunions, temps, modèles, jours, durées).
   *
   * Deux usages, une page : le sien (`account` nul), et celle d'un collègue
   * qu'un administrateur ouvre depuis Administration → Crédit de temps (`account` =
   * {email, name}). Le serveur rend la même charge aux deux
   * (services/api/lib/personalStats.js) : des volumes, jamais le contenu.
   *
   * Sa propre page suit le compteur de la colonne de gauche (stores/quota.js) :
   * la réunion en cours se déduit en direct, et la relecture qui suit son arrêt
   * vaut sans recharger la page. Le reste reste figé au chargement — on ne
   * regarde pas ses statistiques en enregistrant.
   *
   * La jauge et le graphique du mois ne dépendent PAS de la période choisie :
   * le crédit est mensuel. La période ne règle que les tuiles et les figures
   * d'usage.
   *
   * Réactivité : toutes les dérivations nomment leurs dépendances (cf.
   * CLAUDE.md, « Réactivité Svelte »).
   */
  import { onMount } from 'svelte';
  import IconCalendar from '~icons/solar/calendar-linear';
  import IconClock from '~icons/solar/clock-circle-linear';
  import IconChart from '~icons/solar/chart-square-linear';
  import IconDocument from '~icons/solar/document-text-linear';
  import IconRefresh from '~icons/solar/refresh-linear';
  import IconBack from '~icons/solar/alt-arrow-left-linear';
  import IconTrend from '~icons/solar/graph-up-linear';

  import ChartCard from '../admin/stats/ChartCard.svelte';
  import ColumnChart from '../admin/stats/ColumnChart.svelte';
  import BarList from '../admin/stats/BarList.svelte';
  import StatTile from '../admin/stats/StatTile.svelte';
  import {
    formatCount,
    formatDuration,
    formatHours,
    formatBucket,
    formatBucketLong,
    niceScale,
  } from '../admin/stats/format.js';
  import CreditGauge from './CreditGauge.svelte';
  import CreditChart from './CreditChart.svelte';
  import { fetchMyStats, fetchAccountStats } from '../../services/statsApi.js';
  import { uiText, currentLanguageStore } from '../../store.js';
  import { quota } from '../../stores/quota.js';
  import { liveElapsedStore } from '../../stores/recording.js';
  import { templateName } from '../admin/stats/statsView.js';
  import { creditTone } from '../../utils/creditTone.js';
  import { fill } from '../../utils/i18nFormat.js';
  import {
    formatMinutes,
    formatDay,
    civilDay,
    monthLabel,
    periodMonths,
  } from '../../utils/quotaFormat.js';

  /** Compte d'un collègue ({email, name}), ou null : le sien. */
  export let account = null;
  /** Retour à la liste des comptes (vue administrateur). */
  export let onBack = null;

  const RANGES = ['month', '90', '365', 'all'];

  let range = 'month';
  let stats = null;
  let loading = true;
  let refreshing = false;
  let errorMessage = '';

  $: texts = $uiText.myStats;
  $: qt = $uiText.quota;
  $: adminTexts = $uiText.adminStats;
  $: lang = $currentLanguageStore;

  onMount(() => load('month'));

  /** Un rechargement garde le rendu précédent en retrait (cf. StatsTab). */
  async function load(next) {
    range = next;
    errorMessage = '';
    if (stats) refreshing = true;
    else loading = true;
    const res = account ? await fetchAccountStats(account.email, next) : await fetchMyStats(next);
    loading = false;
    refreshing = false;
    if (!res.ok) {
      errorMessage = texts.errors[res.data?.error] || texts.errors.unknown;
      return;
    }
    stats = res.data;
  }

  /** Jours écoulés du mois : consommé ce jour et reste — le jumeau tableau du graphique. */
  function creditTable(days, limit, extra, todayKey, language, quotaTexts) {
    const rows = [];
    let used = 0;
    for (const day of days) {
      if (day.date > todayKey) break;
      const dayUsed = day.usedSeconds + (day.date === todayKey ? extra : 0);
      used += dayUsed;
      rows.push([
        formatDay(day.date, language),
        formatMinutes(Math.round(dayUsed / 60), quotaTexts),
        formatMinutes(Math.floor(Math.max(0, limit - used) / 60), quotaTexts),
      ]);
    }
    return rows;
  }

  // ── Crédit du mois ────────────────────────────────────────────────────────
  $: credit = stats?.credit || null;
  $: limited = !!credit && !credit.unlimited;
  $: limitSeconds = limited ? credit.limitMinutes * 60 : 0;
  $: storeUsed = !account && $quota.loaded && !$quota.unlimited ? $quota.usedSeconds : 0;
  $: live = account ? 0 : $liveElapsedStore || 0;
  $: serverUsed = credit?.monthSeconds || 0;
  $: usedNow = Math.max(serverUsed, storeUsed) + live;
  $: extraSeconds = usedNow - serverUsed;
  $: remainingSeconds = Math.max(0, limitSeconds - usedNow);
  $: tone = creditTone(remainingSeconds, limitSeconds);
  $: exhausted = limited && tone === 'out';
  $: paceRatio =
    limited && credit.pace && !exhausted
      ? credit.pace.expectedRemainingSeconds / limitSeconds
      : null;
  $: tz = credit?.period?.timeZone || 'UTC';
  $: months = periodMonths(credit?.period, lang);
  $: monthName = monthLabel(credit?.period?.start, lang, { timeZone: tz });
  $: paceAlert = limited && !exhausted && !!credit.pace?.alert;
  $: limitLabel = limited ? formatMinutes(credit.limitMinutes, qt) : '';
  $: groupLine =
    limited && credit.group
      ? fill(qt.groupHint, { group: credit.group.name, limit: limitLabel })
      : '';
  $: renewal = fill(qt.renewal, { month: months.renewal });
  // L'horloge du graphique avance avec le chronomètre de la réunion en cours.
  $: now = (live, new Date());
  $: todayKey = civilDay(now, tz);
  $: creditRows = limited
    ? creditTable(credit.days || [], limitSeconds, extraSeconds, todayKey, lang, qt)
    : [];

  // ── Usage de la période ───────────────────────────────────────────────────
  $: totals = stats?.totals || null;
  $: granularity = stats?.granularity || 'day';
  $: series = stats?.series || [];
  $: sparkMeetings = series.slice(-12).map((point) => point.meetings);
  $: sparkTime = series.slice(-12).map((point) => point.durationSeconds);
  $: inRange = stats?.coverage?.meetingsInRange ?? 0;
  $: withDuration = stats?.coverage?.withDuration ?? 0;
  $: noDuration = inRange > 0 && withDuration === 0;
  $: partialDurations = inRange > 0 && withDuration > 0 && withDuration < inRange;
  $: deletedHint =
    // Sans limite, pas de crédit à expliquer : rien à dire des réunions supprimées.
    limited && range === 'month' && credit.deletedSeconds > 0
      ? fill(texts.kpiDeleted, { time: formatDuration(credit.deletedSeconds, lang) })
      : '';
  $: regeneratedHint = !totals?.regenerated
    ? texts.kpiNoRegeneration
    : totals.regenerated === 1
      ? texts.kpiRegeneratedOne
      : fill(texts.kpiRegenerated, { count: formatCount(totals.regenerated, lang) });

  $: hourPoints = series.map((point) => ({
    key: point.key,
    label: formatBucket(point.key, granularity, lang),
    longLabel: formatBucketLong(point.key, granularity, lang),
    value: Math.round((point.durationSeconds / 3600) * 10) / 10,
  }));
  $: hourScale = niceScale(hourPoints.reduce((best, p) => Math.max(best, p.value), 0));
  $: hourRows = hourPoints.map((point) => [
    point.longLabel,
    formatDuration(series.find((s) => s.key === point.key)?.durationSeconds || 0, lang),
  ]);

  $: templateItems = (stats?.templates || []).map((row) => ({
    key: row.template,
    label: templateName(row, lang, texts.templateUnknown),
    value: row.meetings,
  }));
  $: templateRows = templateItems.map((item) => [item.label, formatCount(item.value, lang)]);

  $: weekdayPoints = (stats?.weekdays || []).map((day) => ({
    key: String(day.index),
    label: adminTexts.weekdaysShort[day.index],
    longLabel: adminTexts.weekdaysLong[day.index],
    value: day.meetings,
  }));
  $: weekdayScale = niceScale(weekdayPoints.reduce((best, p) => Math.max(best, p.value), 0));
  $: weekdayRows = weekdayPoints.map((p) => [p.longLabel, formatCount(p.value, lang)]);

  $: durationItems = (stats?.durationBuckets || []).map((bucket) => ({
    key: bucket.id,
    label: adminTexts.buckets[bucket.id],
    value: bucket.count,
  }));
  $: durationRows = durationItems.map((item) => [item.label, formatCount(item.value, lang)]);
</script>

<div class="ps-wrap" class:ps-refreshing={refreshing}>
  {#if account}
    <div class="ps-viewing">
      {#if onBack}
        <button type="button" class="ps-back" on:click={onBack}>
          <IconBack width="14" height="14" aria-hidden="true" />{texts.back}
        </button>
      {/if}
      <div>
        <h3>{fill(texts.viewingTitle, { name: account.name || account.email })}</h3>
        <p class="ps-intro">{fill(texts.viewingHint, { name: account.name || account.email })}</p>
      </div>
    </div>
  {:else}
    <p class="ps-intro">{texts.intro}</p>
  {/if}

  {#if errorMessage}
    <div class="ps-error" role="alert">{errorMessage}</div>
  {/if}

  <div class="ps-toolbar">
    <div class="ps-ranges" role="group" aria-label={texts.rangeLabel}>
      {#each RANGES as value (value)}
        <button
          type="button"
          class="ps-range"
          class:ps-range-on={range === value}
          aria-pressed={range === value}
          on:click={() => load(value)}
        >
          {texts.ranges[value]}
        </button>
      {/each}
    </div>
    <button type="button" class="ps-refresh" on:click={() => load(range)} disabled={refreshing}>
      <IconRefresh width="14" height="14" aria-hidden="true" />
      {refreshing ? texts.refreshing : texts.refresh}
    </button>
  </div>

  {#if loading}
    <div class="ps-skeleton" aria-hidden="true"></div>
  {:else if stats}
    <div class="ps-top">
      <section class="ps-credit ps-credit-{limited ? tone : 'none'}" aria-label={qt.title}>
        <header class="ps-credit-head">
          <IconClock width="16" height="16" aria-hidden="true" />
          <h4>{qt.title}</h4>
          <span class="ps-month">{months.current}</span>
        </header>
        {#if limited}
          <CreditGauge {limitSeconds} {remainingSeconds} {paceRatio} quotaTexts={qt} {texts} />
          {#if paceRatio !== null}
            <div class="ps-legend">
              <span><i class="ps-swatch"></i>{texts.legendLeft}</span>
              <span
                ><i class="ps-tick"></i>{fill(texts.legendPace, {
                  value: formatMinutes(Math.floor(credit.pace.expectedRemainingSeconds / 60), qt),
                })}</span
              >
            </div>
          {/if}
          {#if exhausted}
            <p class="ps-note ps-note-out">
              {credit.exhaustedOn
                ? fill(texts.exhaustedOn, { date: formatDay(credit.exhaustedOn, lang) })
                : ''}
              {renewal}
            </p>
          {:else if paceAlert}
            <p class="ps-note ps-note-warn">
              <IconTrend width="15" height="15" aria-hidden="true" />
              <span
                >{fill(texts.paceAlert, {
                  date: formatDay(credit.pace.exhaustsAt, lang, { timeZone: tz }),
                })}</span
              >
            </p>
          {/if}
          <p class="ps-foot">
            {#if live > 0}{texts.liveHint}{/if}
            {groupLine}
            {#if !exhausted}{renewal}{/if}
          </p>
        {:else}
          <div class="ps-unlimited">
            <span class="ps-infinity" aria-hidden="true">∞</span>
            <strong>{texts.unlimitedTitle}</strong>
            <span
              >{fill(texts.unlimitedLine, {
                time: formatDuration(usedNow, lang),
                month: monthName,
              })}</span
            >
            <span class="ps-foot">{texts.unlimitedHint}</span>
          </div>
        {/if}
      </section>

      <div class="ps-tiles">
        <StatTile
          icon={IconCalendar}
          label={texts.kpiMeetings}
          value={formatCount(totals.meetings, lang)}
          hint={fill(texts.kpiMeetingsHint, { total: formatCount(totals.meetingsAllTime, lang) })}
          spark={sparkMeetings}
        />
        <StatTile
          icon={IconClock}
          label={texts.kpiTime}
          value={totals.durationSeconds ? formatDuration(totals.durationSeconds, lang) : '—'}
          hint={deletedHint || (noDuration ? texts.kpiNoDuration : '')}
          spark={sparkTime}
        />
        <StatTile
          icon={IconChart}
          label={texts.kpiAverage}
          value={totals.avgDurationSeconds ? formatDuration(totals.avgDurationSeconds, lang) : '—'}
          hint={totals.medianDurationSeconds
            ? fill(texts.kpiAverageHint, {
                median: formatDuration(totals.medianDurationSeconds, lang),
                longest: formatDuration(totals.longestDurationSeconds, lang),
              })
            : texts.kpiNoDuration}
        />
        <StatTile
          icon={IconDocument}
          label={texts.kpiSummaries}
          value={formatCount(totals.summaries, lang)}
          hint={regeneratedHint}
        />
      </div>
    </div>

    {#if partialDurations || noDuration}
      <p class="ps-notice">{texts.partialDurations}</p>
    {/if}

    {#if limited}
      <ChartCard
        wide
        title={texts.chartCredit}
        hint={texts.chartCreditHint}
        columns={[texts.colDay, texts.colUsedDay, texts.colRemaining]}
        rows={creditRows}
        tableLabel={adminTexts.showTable}
        chartLabel={adminTexts.showChart}
        emptyLabel={texts.empty}
      >
        <CreditChart
          days={credit.days || []}
          {limitSeconds}
          period={credit.period}
          pace={exhausted ? null : credit.pace}
          {extraSeconds}
          {now}
          {tone}
          quotaTexts={qt}
          {texts}
          {lang}
        />
      </ChartCard>
    {/if}
    {#if !limited || range !== 'month'}
      <ChartCard
        wide
        title={texts.chartTime}
        hint={texts.chartTimeHint}
        columns={[texts.colPeriod, texts.colTime]}
        rows={noDuration ? [] : hourRows}
        tableLabel={adminTexts.showTable}
        chartLabel={adminTexts.showChart}
        emptyLabel={texts.empty}
      >
        <ColumnChart
          points={hourPoints}
          ticks={hourScale.ticks}
          max={hourScale.max}
          color="var(--viz-series-2)"
          formatValue={(value) => fill(adminTexts.hours, { value: formatHours(value, lang) })}
          formatTick={(value) => formatHours(value, lang)}
          ariaLabel={texts.chartTime}
        />
      </ChartCard>
    {/if}

    <div class="ps-grid">
      <ChartCard
        title={texts.chartTemplates}
        hint={texts.chartTemplatesHint}
        columns={[texts.colTemplate, texts.colMeetings]}
        rows={templateRows}
        tableLabel={adminTexts.showTable}
        chartLabel={adminTexts.showChart}
        emptyLabel={texts.empty}
      >
        <BarList items={templateItems} formatValue={(value) => formatCount(value, lang)} />
      </ChartCard>
      <ChartCard
        title={texts.chartWeekdays}
        hint={texts.chartWeekdaysHint}
        columns={[adminTexts.colDay, texts.colMeetings]}
        rows={inRange ? weekdayRows : []}
        tableLabel={adminTexts.showTable}
        chartLabel={adminTexts.showChart}
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
      <ChartCard
        title={texts.chartDurations}
        hint={texts.chartDurationsHint}
        columns={[adminTexts.colBucket, texts.colMeetings]}
        rows={withDuration ? durationRows : []}
        tableLabel={adminTexts.showTable}
        chartLabel={adminTexts.showChart}
        emptyLabel={texts.empty}
      >
        <!-- Tranches ORDONNÉES : la rampe d'une seule teinte, comme chez l'admin. -->
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
    </div>
  {/if}
</div>

<style>
  .ps-wrap {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    transition: opacity 0.15s;
  }
  .ps-refreshing {
    opacity: 0.55;
  }
  .ps-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .ps-viewing {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .ps-viewing h3 {
    margin: 0 0 0.15rem;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--ink);
  }
  .ps-back {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.65rem 0.3rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .ps-back:hover {
    background: var(--surface-tint);
  }
  .ps-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
  }

  /* ── Période (même contrôle que les statistiques d'administration) ── */
  .ps-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .ps-ranges {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-tint);
    flex-wrap: wrap;
  }
  .ps-range {
    padding: 0.35rem 0.75rem;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--ink-muted);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .ps-range:hover {
    color: var(--ink);
  }
  .ps-range-on {
    background: var(--surface);
    color: var(--brand-text);
    font-weight: 600;
    box-shadow: 0 1px 3px -1px color-mix(in srgb, var(--ink) 18%, transparent);
  }
  .ps-refresh {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-muted);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .ps-refresh:hover:not(:disabled) {
    background: var(--surface-tint);
    color: var(--ink-soft);
  }
  .ps-refresh:disabled {
    opacity: 0.55;
    cursor: default;
  }

  /* ── Crédit + tuiles ── */
  .ps-top {
    display: grid;
    grid-template-columns: minmax(250px, 340px) minmax(0, 1fr);
    gap: 0.75rem;
  }
  @container (max-width: 640px) {
    .ps-top {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .ps-credit {
    --ps-accent: var(--credit-high);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.85rem 0.95rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: linear-gradient(
      165deg,
      color-mix(in srgb, var(--ps-accent) 9%, var(--surface)),
      var(--surface) 60%
    );
    min-width: 0;
  }
  .ps-credit-mid {
    --ps-accent: var(--credit-mid);
  }
  .ps-credit-low {
    --ps-accent: var(--credit-low);
  }
  .ps-credit-out {
    --ps-accent: var(--credit-out);
    border-color: var(--danger-line);
  }
  .ps-credit-none {
    --ps-accent: var(--brand-secondary);
  }
  .ps-credit-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--brand-text);
  }
  .ps-credit-head h4 {
    margin: 0;
    flex: 1;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink);
  }
  .ps-month {
    font-size: 0.75rem;
    color: var(--ink-faint);
  }
  .ps-legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.3rem 1rem;
    font-size: 0.72rem;
    color: var(--ink-muted);
  }
  .ps-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .ps-swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--ps-accent);
  }
  /* Le triangle du rythme régulier, comme sur le cadran. */
  .ps-tick {
    width: 0;
    height: 0;
    border-left: 4.5px solid transparent;
    border-right: 4.5px solid transparent;
    border-top: 7px solid var(--ink-faint);
  }
  .ps-note {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    margin: 0;
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    border: 1px solid;
    font-size: 0.8rem;
    line-height: 1.45;
  }
  .ps-note :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
  }
  .ps-note-warn {
    color: var(--warn-text);
    background: var(--warn-bg);
    border-color: var(--warn-line);
  }
  .ps-note-out {
    color: var(--danger-text);
    background: var(--danger-bg);
    border-color: var(--danger-line);
    font-weight: 500;
  }
  .ps-foot {
    margin: 0;
    font-size: 0.75rem;
    color: var(--ink-muted);
    text-align: center;
    line-height: 1.45;
  }
  .ps-unlimited {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 1.2rem 0.5rem 0.6rem;
    text-align: center;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .ps-unlimited strong {
    font-size: 1.05rem;
    color: var(--ink);
  }
  .ps-infinity {
    font-size: 2.6rem;
    line-height: 1;
    color: var(--ink-faint);
  }
  /* 2 × 2 à la hauteur de la jauge : les tuiles s'étirent, leur trace se
     pose en bas — pas de blanc sous la grille à côté d'un cadran plus haut. */
  .ps-tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .ps-tiles :global(.sv-spark) {
    margin-top: auto;
  }
  .ps-notice {
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    border: 1px dashed var(--line-strong);
    background: var(--surface-tint);
    font-size: 0.79rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  /* Trois figures courtes : chacune à la hauteur de son contenu. */
  .ps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    align-items: start;
    gap: 0.75rem;
  }
  .ps-skeleton {
    height: 320px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 6%, #f2f2f2) 50%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 75%
    );
    background-size: 200% 100%;
    animation: ps-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes ps-shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ps-skeleton {
      animation: none;
    }
  }
</style>
