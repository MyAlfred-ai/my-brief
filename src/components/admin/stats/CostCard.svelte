<script>
  /**
   * Carte « Dépenses d'IA estimées » de l'onglet Statistiques : combien coûte
   * myBrief par mois, combien coûte une heure, où part la dépense, et ce
   * qu'elle deviendrait avec un autre modèle.
   *
   * Présentation SEULE : le calcul vit côté serveur (services/api/lib/costs/),
   * le chargement et l'actualisation des tarifs dans StatsTab — cette carte
   * émet `refreshprices` et affiche ce qu'on lui donne.
   *
   * Trois règles de la page, tenues ici aussi :
   *   - la période de la barre du haut cadre la carte comme le reste — les
   *     montants se relisent sur la même tranche que les réunions ;
   *   - chaque figure a son jumeau tableau (bouton « Données ») ;
   *   - une estimation se DIT estimation : la provenance des tarifs est sous
   *     les chiffres, les hypothèses à un clic, et un modèle sans tarif connu
   *     est signalé au lieu d'être compté pour zéro.
   *
   * Réactivité : chaque dérivation nomme `t` et `lang` dans son expression —
   * Svelte ne suit que les identifiants qu'il voit, et une fonction qui lirait
   * les textes en interne ne suivrait pas un changement de langue.
   */
  import { createEventDispatcher } from 'svelte';
  import IconWallet from '~icons/solar/wallet-money-linear';
  import IconStopwatch from '~icons/solar/stopwatch-linear';
  import IconBill from '~icons/solar/bill-list-linear';
  import IconRefresh from '~icons/solar/refresh-linear';
  import IconTable from '~icons/solar/list-linear';
  import IconChart from '~icons/solar/chart-2-linear';

  import BarList from './BarList.svelte';
  import { fill } from '../../../utils/i18nFormat.js';
  import {
    formatCount,
    formatDecimal,
    formatDuration,
    formatEuros,
    formatPercent,
    formatUsd,
    pricingLines,
  } from './format.js';

  /** `costs` de GET /api/admin/stats — `null` quand l'estimation a échoué. */
  export let costs = null;
  /** Textes de l'onglet (`$uiText.adminStats`). */
  export let texts;
  export let lang = 'fr';
  export let refreshing = false;
  /** Résultat de la dernière actualisation : `{tone: 'ok'|'warn'|'error', text}`. */
  export let notice = null;

  const dispatch = createEventDispatcher();
  let showTable = false;

  function unitCost(line, value, t, lang) {
    return fill(t.units[line.unit], { value: formatEuros(value, lang) });
  }

  /**
   * Tarif public d'un modèle, dans l'unité et la devise où il se facture — des
   * dollars, comme sur la page de tarifs du fournisseur.
   */
  function tariffText(tariff, t, lang) {
    if (!tariff) return t.unknownTariff;
    const usd = (value) => formatUsd(value, lang);
    if (tariff.audioMinute !== undefined)
      return fill(t.tariffAudio, { price: usd(tariff.audioMinute) });
    const perImage = tariff.image ?? tariff.imageUsd;
    if (tariff.kind === 'image' && perImage !== undefined) {
      return fill(t.tariffImage, { price: usd(perImage) });
    }
    if (tariff.inputMTok !== undefined && tariff.outputMTok !== undefined) {
      return fill(t.tariffText, { input: usd(tariff.inputMTok), output: usd(tariff.outputMTok) });
    }
    return t.unknownTariff;
  }

  function lineHint(line, t, lang) {
    if (line.unpriced.length) return fill(t.unpricedLine, { models: line.unpriced.join(', ') });
    return [
      line.models.join(', '),
      unitCost(line, line.unitEur, t, lang),
      fill(t.share, { value: formatPercent(line.share, lang) }),
    ].join(' · ');
  }

  $: t = texts.costs;
  $: lines = costs?.lines || [];
  $: usage = costs?.usage || {};
  $: assumed = costs?.assumptions || {};
  $: pricing = costs?.pricing || null;

  // ── Chiffres de tête ──────────────────────────────────────────────────────
  $: hint = costs ? fill(t.hint, { days: formatCount(Math.round(costs.spanDays), lang) }) : '';
  // Des durées déduites du texte entrent dans l'heure moyenne : le dire, sans
  // quoi « 43 h 47 » contredit le « Temps enregistré » de la tuile du haut.
  $: perHourHint =
    costs?.perHourBasis === 'measured'
      ? fill(usage.inferredDurations ? t.perHourMeasuredInferred : t.perHourMeasured, {
          duration: formatDuration(usage.audioSeconds, lang),
          count: formatCount(usage.inferredDurations, lang),
        })
      : t.perHourReference;
  $: periodHint = usage.meetings
    ? fill(t.periodHint, {
        meetings: formatCount(usage.meetings, lang),
        perMeeting: formatEuros(costs?.perMeetingEur, lang),
      })
    : t.periodHintEmpty;

  // ── Répartition, et son jumeau tableau ────────────────────────────────────
  $: items = lines.map((line) => ({
    key: line.id,
    label: t.lines[line.id],
    title: `${t.lines[line.id]} · ${t.linesHint[line.id]}`,
    value: line.monthlyEur,
    hint: lineHint(line, t, lang),
  }));
  $: columns = [
    t.colLine,
    t.colModels,
    t.colVolume,
    t.colUnit,
    t.colPeriod,
    t.colMonthly,
    t.colShare,
  ];
  $: rows = lines.map((line) => ({
    key: line.id,
    cells: [
      t.lines[line.id],
      line.models.join(', '),
      line.unit === 'hour'
        ? formatDuration(line.count * 3600, lang)
        : formatCount(line.count, lang),
      line.unpriced.length ? t.unknownTariff : unitCost(line, line.unitEur, t, lang),
      formatEuros(line.periodEur, lang),
      formatEuros(line.monthlyEur, lang),
      formatPercent(line.share, lang),
    ],
  }));

  // ── Comparaison des modèles proposés ──────────────────────────────────────
  // Dans un cadre étroit, chaque ligne devient une fiche (cf. le bas de la
  // feuille) : le coût par mois y perd son en-tête de colonne, « / mois » le
  // remplace.
  $: perMonthSuffix = t.perMonthValue.replace('{value}', '').trim();
  $: comparisons = lines
    .filter((line) => line.alternatives.length)
    .map((line) => {
      const current = line.alternatives.find((alt) => alt.current);
      return {
        key: line.id,
        label: t.lines[line.id],
        rows: line.alternatives.map((alt) => ({
          key: alt.model,
          model: alt.model,
          current: alt.current,
          tariff: tariffText(alt.tariff, t, lang),
          unit: alt.priced ? unitCost(line, alt.unitEur, t, lang) : t.unknownTariff,
          monthly: alt.priced ? formatEuros(alt.monthlyEur, lang) : '—',
          delta:
            alt.current || !alt.priced || !current?.priced
              ? '—'
              : formatEuros(alt.monthlyEur - current.monthlyEur, lang, { signed: true }),
        })),
      };
    });

  // ── Hypothèses : les valeurs viennent du serveur, les phrases d'ici ───────
  $: assumptions = costs
    ? [
        t.assumptions.prices,
        t.assumptions.audio,
        fill(t.assumptions.tokens, {
          chars: formatCount(assumed.charsPerToken, lang),
          output: formatCount(assumed.summaryOutputTokens, lang),
        }),
        fill(
          assumed.measuredSpeechRate ? t.assumptions.speechMeasured : t.assumptions.speechDefault,
          {
            rate: formatDecimal(assumed.speechCharsPerSecond, lang, 1),
          },
        ),
        ...(usage.inferredDurations
          ? [fill(t.assumptions.inferred, { count: formatCount(usage.inferredDurations, lang) })]
          : []),
        fill(t.assumptions.detection, { calls: formatCount(assumed.detectionCallsPerHour, lang) }),
        fill(t.assumptions.image, { tokens: formatCount(assumed.imageTokens, lang) }),
        t.assumptions.excluded,
      ]
    : [];

  // ── Provenance des tarifs ─────────────────────────────────────────────────
  $: provenance = pricingLines(pricing, t, lang);
  $: pricesLine = provenance.prices;
  $: fxLine = provenance.fx;
  $: unpricedNotice = costs?.unpriced?.length
    ? fill(t.unpricedNotice, { models: costs.unpriced.join(', ') })
    : '';
</script>

<section class="co-card" aria-labelledby="st-costs-title">
  <header class="co-head">
    <div class="co-titles">
      <h4 id="st-costs-title">{t.title}</h4>
      {#if hint}<p class="co-hint">{hint}</p>{/if}
    </div>
    {#if costs && lines.length}
      <button
        type="button"
        class="co-toggle"
        aria-pressed={showTable}
        on:click={() => (showTable = !showTable)}
      >
        {#if showTable}
          <IconChart width="14" height="14" aria-hidden="true" />{texts.showChart}
        {:else}
          <IconTable width="14" height="14" aria-hidden="true" />{texts.showTable}
        {/if}
      </button>
    {/if}
  </header>

  {#if !costs}
    <p class="co-empty" role="status">{t.unavailable}</p>
  {:else}
    <!-- Trois nombres, pas un graphique : la dépense mensuelle mène, l'heure et
         la période la situent. -->
    <div class="co-figures">
      <div class="co-figure co-figure-lead">
        <span class="co-figure-label"
          ><IconWallet width="15" height="15" aria-hidden="true" />{t.monthly}</span
        >
        <span class="co-figure-value">{formatEuros(costs.monthlyEur, lang, { compact: true })}</span
        >
        <span class="co-figure-hint">{t.monthlyHint}</span>
      </div>
      <div class="co-figure">
        <span class="co-figure-label"
          ><IconStopwatch width="15" height="15" aria-hidden="true" />{t.perHour}</span
        >
        <span class="co-figure-value">{formatEuros(costs.perHourEur, lang)}</span>
        <span class="co-figure-hint">{perHourHint}</span>
      </div>
      <div class="co-figure">
        <span class="co-figure-label"
          ><IconBill width="15" height="15" aria-hidden="true" />{t.period}</span
        >
        <span class="co-figure-value">{formatEuros(costs.periodEur, lang)}</span>
        <span class="co-figure-hint">{periodHint}</span>
      </div>
    </div>

    {#if showTable}
      <div class="co-table-wrap">
        <table class="co-table">
          <caption class="co-sr">{t.breakdownLabel}</caption>
          <thead>
            <tr>
              {#each columns as column, index (column)}<th scope="col" class:co-text={index === 1}
                  >{column}</th
                >{/each}
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.key)}
              <tr>
                {#each row.cells as cell, index (index)}
                  {#if index === 0}<th scope="row">{cell}</th>{:else}<td class:co-text={index === 1}
                      >{cell}</td
                    >{/if}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="co-breakdown" role="group" aria-label={t.breakdownLabel}>
        <BarList
          {items}
          formatValue={(value) => fill(t.perMonthValue, { value: formatEuros(value, lang) })}
        />
      </div>
    {/if}

    {#if unpricedNotice}
      <p class="co-warning" role="note">{unpricedNotice}</p>
    {/if}

    {#if comparisons.length}
      <details class="co-details">
        <summary>{t.compareTitle}</summary>
        <p class="co-details-intro">{t.compareIntro}</p>
        {#each comparisons as group (group.key)}
          <div class="co-table-wrap co-compare-wrap">
            <!-- Rôles explicites : dans un cadre étroit, la feuille change
                 l'affichage du tableau (une fiche par modèle), ce qui lui
                 ôterait sa sémantique de tableau dans certains navigateurs. -->
            <!-- svelte-ignore a11y-no-redundant-roles -->
            <table class="co-table co-compare" role="table">
              <caption>{group.label}</caption>
              <!-- svelte-ignore a11y-no-redundant-roles -->
              <thead role="rowgroup">
                <!-- svelte-ignore a11y-no-redundant-roles -->
                <tr role="row">
                  <!-- svelte-ignore a11y-no-redundant-roles -->
                  <th scope="col" role="columnheader">{t.colModel}</th>
                  <!-- svelte-ignore a11y-no-redundant-roles -->
                  <th scope="col" role="columnheader">{t.colTariff}</th>
                  <!-- svelte-ignore a11y-no-redundant-roles -->
                  <th scope="col" role="columnheader">{t.colUnit}</th>
                  <!-- svelte-ignore a11y-no-redundant-roles -->
                  <th scope="col" role="columnheader">{t.colMonthly}</th>
                  <!-- svelte-ignore a11y-no-redundant-roles -->
                  <th scope="col" role="columnheader">{t.colDelta}</th>
                </tr>
              </thead>
              <!-- svelte-ignore a11y-no-redundant-roles -->
              <tbody role="rowgroup">
                {#each group.rows as row (row.key)}
                  <!-- svelte-ignore a11y-no-redundant-roles -->
                  <tr class:co-current={row.current} role="row">
                    <!-- svelte-ignore a11y-no-redundant-roles -->
                    <th scope="row" role="rowheader">
                      <span class="co-model">{row.model}</span>
                      {#if row.current}<span class="co-badge">{t.current}</span>{/if}
                    </th>
                    <!-- svelte-ignore a11y-no-redundant-roles -->
                    <td class="co-tariff" role="cell">{row.tariff}</td>
                    <!-- svelte-ignore a11y-no-redundant-roles -->
                    <td class="co-unit" role="cell">{row.unit}</td>
                    <!-- svelte-ignore a11y-no-redundant-roles -->
                    <td class="co-monthly" role="cell" data-suffix={perMonthSuffix}
                      >{row.monthly}</td
                    >
                    <!-- svelte-ignore a11y-no-redundant-roles -->
                    <td
                      class="co-delta"
                      class:co-delta-none={row.delta === '—'}
                      role="cell"
                      data-label={t.colDelta}>{row.delta}</td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/each}
      </details>
    {/if}

    <details class="co-details">
      <summary>{t.assumptionsTitle}</summary>
      <ul class="co-assumptions">
        {#each assumptions as assumption (assumption)}
          <li>{assumption}</li>
        {/each}
      </ul>
    </details>

    <footer class="co-foot">
      <p class="co-source">
        {#if pricesLine}<span>{pricesLine}</span>{/if}
        {#if fxLine}<span>{fxLine}</span>{/if}
      </p>
      <button
        type="button"
        class="co-refresh"
        on:click={() => dispatch('refreshprices')}
        disabled={refreshing}
      >
        <IconRefresh width="14" height="14" aria-hidden="true" />
        {refreshing ? t.pricesRefreshing : t.pricesRefresh}
      </button>
      <!-- Toujours dans le DOM, même vide : une zone `status` qui apparaît en
           même temps que son texte n'est pas annoncée par tous les lecteurs
           d'écran. -->
      <p class="co-notice co-notice-{notice?.tone || 'none'}" role="status">{notice?.text || ''}</p>
    </footer>
  {/if}
</section>

<style>
  .co-card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1rem 1.1rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    min-width: 0;
  }

  .co-head {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .co-titles {
    flex: 1 1 auto;
    min-width: 0;
  }
  .co-head h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .co-hint {
    margin: 0.2rem 0 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  /* Même bascule que les autres cartes (ChartCard). */
  .co-toggle {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-muted);
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .co-toggle:hover {
    background: var(--surface-tint);
    color: var(--ink-soft);
  }
  .co-toggle[aria-pressed='true'] {
    border-color: var(--brand-secondary-soft-18);
    background: var(--brand-secondary-soft-08);
    color: var(--brand-text);
  }

  .co-empty {
    margin: 0;
    padding: 1rem 0;
    text-align: center;
    font-size: 0.84rem;
    color: var(--ink-faint);
  }

  /* ── Chiffres de tête ──
     Des aplats, pas des tuiles bordées : trois cadres dans un cadre se liraient
     comme trois cartes de plus. La dépense mensuelle prend le dégradé de la
     tuile vedette de la page, sans sa taille — la page n'a qu'un héros. */
  .co-figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 0.6rem;
  }
  .co-figure {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 0.85rem;
    border-radius: 8px;
    background: var(--surface-tint);
    min-width: 0;
  }
  .co-figure-lead {
    background: linear-gradient(160deg, var(--brand-secondary-soft-12), var(--surface-tint) 70%);
  }
  .co-figure-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-faint);
    line-height: 1.3;
  }
  .co-figure-label :global(svg) {
    flex: 0 0 auto;
    color: var(--brand-text);
  }
  .co-figure-value {
    font-size: 1.5rem;
    font-weight: 650;
    line-height: 1.15;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .co-figure-lead .co-figure-value {
    font-size: 1.9rem;
  }
  .co-figure-hint {
    font-size: 0.74rem;
    color: var(--ink-faint);
    line-height: 1.4;
  }

  .co-warning {
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    border: 1px dashed var(--line-strong);
    background: var(--surface-tint);
    font-size: 0.79rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  /* ── Tableaux (jumeau de la répartition, comparaison) ── */
  .co-table-wrap {
    overflow-x: auto;
  }
  .co-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
  }
  .co-table caption {
    padding: 0.2rem 0 0.35rem;
    text-align: left;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .co-table th,
  .co-table td {
    padding: 0.4rem 0.6rem 0.4rem 0;
    text-align: right;
    color: var(--ink-soft);
    white-space: nowrap;
    border-bottom: 1px solid var(--line);
  }
  .co-table thead th {
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-faint);
  }
  .co-table th[scope='row'],
  .co-table thead th:first-child {
    text-align: left;
    font-weight: 500;
    color: var(--ink);
  }
  .co-table tbody tr:last-child th,
  .co-table tbody tr:last-child td {
    border-bottom: none;
  }
  /* Du texte (noms de modèles), pas des nombres : aligné comme du texte. */
  .co-table .co-text {
    text-align: left;
  }
  /* Le tarif public est la seule cellule longue : elle passe à la ligne plutôt
     que d'imposer un défilement horizontal au tableau entier. */
  .co-table .co-tariff {
    white-space: normal;
    min-width: 11rem;
    color: var(--ink-muted);
  }
  .co-current th,
  .co-current td {
    background: var(--brand-secondary-soft-08);
  }
  .co-model {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
  }
  .co-badge {
    display: inline-block;
    margin-left: 0.4rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--brand-secondary-soft-12);
    color: var(--brand-text);
    font-size: 0.68rem;
    font-weight: 600;
    font-family: inherit;
  }
  .co-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* ── Sections repliables ── */
  .co-details {
    border-top: 1px solid var(--line);
    padding-top: 0.65rem;
  }
  .co-details summary {
    cursor: pointer;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--ink-soft);
    width: fit-content;
  }
  .co-details summary:hover {
    color: var(--ink);
  }
  .co-details[open] {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .co-details-intro {
    margin: 0;
    font-size: 0.79rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .co-assumptions {
    margin: 0;
    padding-left: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.79rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  /* ── Provenance et actualisation ── */
  /* Pas d'écart vertical : la zone d'annonce, vide la plupart du temps, ne
     doit pas creuser une ligne blanche sous le bouton. */
  .co-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0 0.75rem;
    border-top: 1px solid var(--line);
    padding-top: 0.75rem;
  }
  .co-source {
    flex: 1 1 260px;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    font-size: 0.76rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .co-refresh {
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
  .co-refresh:hover:not(:disabled) {
    background: var(--surface-tint);
    color: var(--ink-soft);
  }
  .co-refresh:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .co-notice {
    flex: 1 1 100%;
    margin: 0;
    font-size: 0.79rem;
    line-height: 1.45;
  }
  .co-notice:not(:empty) {
    margin-top: 0.5rem;
  }
  .co-notice-ok {
    color: var(--success-text);
  }
  .co-notice-warn {
    color: var(--ink-muted);
  }
  .co-notice-error {
    color: var(--danger-text);
  }

  @media (max-width: 640px) {
    .co-card {
      padding: 0.85rem 0.9rem 0.95rem;
    }
    .co-figure-lead .co-figure-value {
      font-size: 1.7rem;
    }
  }

  /* Comparaison dans un cadre étroit (téléphone, tablette dont la colonne de
     gauche est ouverte) : cinq colonnes ne tiennent pas — sur ~310 px, seules
     les deux premières restaient visibles, et le coût par mois et l'écart,
     l'objet même de la comparaison, sortaient du cadre sans que rien ne le
     signale. Chaque modèle devient une fiche : nom et coût par mois en tête,
     tarif dessous, coût unitaire et écart au pied. Requête de CONTENEUR et non
     d'écran : c'est la largeur du cadre qui compte, et 760 px est celle du
     tableau le plus large. L'en-tête reste lu par les lecteurs d'écran,
     masqué à l'œil. */
  .co-compare-wrap {
    container: co-compare / inline-size;
  }
  @container co-compare (max-width: 759px) {
    .co-compare,
    .co-compare tbody,
    .co-compare caption {
      display: block;
    }
    .co-compare thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .co-compare tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'model monthly'
        'tariff tariff'
        'unit delta';
      align-items: baseline;
      gap: 0.2rem 0.75rem;
      padding: 0.6rem 0.65rem;
      border-bottom: 1px solid var(--line);
    }
    .co-compare tbody tr:last-child {
      border-bottom: none;
    }
    .co-compare th,
    .co-compare td {
      padding: 0;
      border-bottom: none;
      background: none;
      white-space: normal;
      text-align: left;
    }
    .co-compare .co-current {
      border-radius: 8px;
      background: var(--brand-secondary-soft-08);
    }
    .co-compare th[scope='row'] {
      grid-area: model;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.4rem;
      min-width: 0;
    }
    .co-compare .co-badge {
      margin-left: 0;
    }
    .co-compare .co-tariff {
      grid-area: tariff;
      min-width: 0;
      font-size: 0.76rem;
    }
    .co-compare .co-unit {
      grid-area: unit;
      font-size: 0.76rem;
      color: var(--ink-muted);
    }
    .co-compare .co-monthly {
      grid-area: monthly;
      text-align: right;
      font-weight: 600;
      color: var(--ink);
      white-space: nowrap;
    }
    .co-compare .co-monthly::after {
      content: ' ' attr(data-suffix);
      font-weight: 400;
      color: var(--ink-muted);
    }
    .co-compare .co-delta {
      grid-area: delta;
      text-align: right;
      font-size: 0.76rem;
      white-space: nowrap;
    }
    .co-compare .co-delta::before {
      content: attr(data-label) ' : ';
      color: var(--ink-faint);
    }
    /* Le modèle en service n'a pas d'écart avec lui-même : rien à écrire. */
    .co-compare .co-delta-none {
      display: none;
    }
  }
</style>
