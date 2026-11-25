<script>
  // Gabarit « Feuille de route » — projet, chantier, lancement : l'objectif en
  // grand, puis une frise HORIZONTALE — les étapes alternent au-dessus et
  // au-dessous du rail, ce qui leur donne deux colonnes de large chacune ; le
  // rail se colore jusqu'à la dernière étape faite.
  import Hero from './Hero.svelte';
  import Icon from './Icon.svelte';
  import SectionTitle from './SectionTitle.svelte';
  import CheckList from './CheckList.svelte';

  export let layout;
  export let pal;
  export let L;

  $: jalons = layout.jalons;
  $: n = jalons.length;
  $: lastDone = jalons.reduce((last, j, i) => (j.etat === 'fait' ? i : last), -1);
  // Part du rail parcourue : du premier nœud au dernier fait.
  $: progress = n > 1 && lastDone > 0 ? (lastDone / (n - 1)) * 100 : 0;
  $: tagOf = (etat) => (etat === 'fait' ? L.done : etat === 'objectif' ? L.target : L.upcoming);
  $: both = layout.decisions.length && layout.vigilances.length;
</script>

<Hero heros={layout.heros} {pal} eyebrow={L.goal} icon="drapeau" />

{#if n}
  <section class="ig-section">
    <SectionTitle title={L.milestones} icon="calendrier" {pal} />
    <div class="ig-tl" style="grid-template-columns:repeat({n}, minmax(0, 1fr))">
      <div class="ig-tl-track" style="margin:0 calc(100% / {2 * n})">
        <span class="ig-tl-fill" style="width:{progress}%"></span>
      </div>
      {#each jalons as jalon, i (i)}
        <div
          class="ig-tl-card ig-tl-card-{jalon.etat}"
          class:ig-tl-up={i % 2 === 0}
          class:ig-tl-down={i % 2 === 1}
          class:ig-tl-first={i === 0}
          class:ig-tl-last={i === n - 1}
          style="grid-column:{i + 1}"
        >
          <span class="ig-tl-when">{jalon.quand}</span>
          <b>{jalon.libelle}</b>
          {#if jalon.detail}<span class="ig-tl-detail">{jalon.detail}</span>{/if}
          <span class="ig-tl-tag">{tagOf(jalon.etat)}</span>
        </div>
        <div class="ig-tl-cell" class:ig-tl-up={i % 2 === 0} style="grid-column:{i + 1}">
          <span class="ig-tl-stem"></span>
          <span class="ig-tl-node ig-tl-node-{jalon.etat}">
            {#if jalon.etat === 'fait'}
              <Icon name="check" color={pal.iconOnP} size={2.8} strokeWidth={3} />
            {:else if jalon.etat === 'objectif'}
              <Icon name="drapeau" color={pal.iconOnS} size={3.4} strokeWidth={2.2} />
            {:else}
              <span class="ig-tl-num">{i + 1}</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  </section>
{/if}

{#if layout.decisions.length || layout.vigilances.length}
  <section class="ig-section">
    <div class="ig-grid" class:ig-cols-2={both} class:ig-cols-1={!both}>
      <CheckList title={L.decisions} items={layout.decisions} icon="check" {pal} />
      <CheckList title={L.vigilance} items={layout.vigilances} icon="alerte" tone="warn" {pal} />
    </div>
  </section>
{/if}
