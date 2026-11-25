<script>
  // Gabarit « Tableau de bord » — revue budgétaire, commerciale, de
  // production : le premier indicateur en vedette sur le dégradé, chaque
  // chiffre sous sa forme, une répartition en colonnes, ce qui est à surveiller.
  import Hero from './Hero.svelte';
  import KpiTile from './KpiTile.svelte';
  import SectionTitle from './SectionTitle.svelte';
  import CheckList from './CheckList.svelte';
  import { formatNumber, formatPercent } from '../../lib/infographic/format.js';

  export let layout;
  export let pal;
  export let L;
  export let lang = 'fr';

  $: kpis = layout.chiffres;
  $: bars = layout.repartition?.elements || [];
  $: barMax = Math.max(...bars.map((b) => b.valeur), 0) || 1;
  $: barTotal = bars.reduce((sum, b) => sum + b.valeur, 0);
</script>

<Hero heros={layout.heros} {pal} eyebrow={L.essential} icon="graphique" />

{#if kpis.length}
  <section class="ig-section">
    <SectionTitle title={L.indicators} icon="tendance" {pal} />
    <div class="ig-kpis ig-kpis-{kpis.length}">
      {#each kpis as kpi, i (i)}
        <KpiTile {kpi} {pal} {lang} {L} featured={i === 0} />
      {/each}
    </div>
  </section>
{/if}

{#if bars.length}
  <section class="ig-section">
    <SectionTitle
      title={`${layout.repartition.titre || L.breakdown}${layout.repartition.unite ? ` · ${layout.repartition.unite}` : ''}`}
      icon="graphique"
      tone="s"
      {pal}
    />
    <div class="ig-colchart">
      {#each bars as bar, i (i)}
        <div class="ig-cc-col">
          <span class="ig-cc-plot">
            <span class="ig-cc-value">
              <b>{formatNumber(bar.valeur, lang)}</b>
              {#if barTotal > 0}<small>{formatPercent(bar.valeur / barTotal, lang)}</small>{/if}
            </span>
            <i
              class="ig-cc-bar"
              class:ig-cc-top={bar.valeur === barMax}
              style="height:{Math.max(2, (bar.valeur / barMax) * 100)}%"
            ></i>
          </span>
          <span class="ig-cc-label">{bar.libelle}</span>
        </div>
      {/each}
    </div>
  </section>
{/if}

{#if layout.vigilances.length}
  <section class="ig-section">
    <CheckList title={L.vigilance} items={layout.vigilances} icon="alerte" tone="warn" {pal} />
  </section>
{/if}
