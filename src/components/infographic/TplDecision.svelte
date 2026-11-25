<script>
  // Gabarit « Décision » — comité, arbitrage : LA décision sous un sceau, les
  // options pesées côte à côte (la retenue en tête de dégradé, étoilée), puis
  // ce qui reste à surveiller.
  import Hero from './Hero.svelte';
  import Icon from './Icon.svelte';
  import SectionTitle from './SectionTitle.svelte';
  import CheckList from './CheckList.svelte';

  export let layout;
  export let pal;
  export let L;

  $: options = layout.options;
  $: both = layout.decisions.length && layout.vigilances.length;
</script>

<Hero heros={layout.heros} {pal} eyebrow={L.decision} variant="seal" />

{#if options.length}
  <section class="ig-section">
    <SectionTitle title={L.options} icon="balance" {pal} />
    <div class="ig-grid ig-cols-{Math.min(options.length, 3)} ig-options">
      {#each options as option, i (i)}
        <article class="ig-option" class:ig-option-retained={option.retenue}>
          <header class="ig-option-head">
            {#if option.retenue}
              <span class="ig-option-badge">
                <Icon name="etoile" color={pal.pInk} size={2.2} strokeWidth={2.2} />{L.retained}
              </span>
            {/if}
            <span class="ig-option-title">{option.titre}</span>
          </header>
          <div class="ig-option-body">
            {#each option.pour as arg, j (j)}
              <p class="ig-arg">
                <span class="ig-arg-dot ig-arg-pro">
                  <Icon name="plus" color={pal.ok} size={2.3} strokeWidth={2.6} />
                </span>
                <span>{arg}</span>
              </p>
            {/each}
            {#each option.contre as arg, j (j)}
              <p class="ig-arg">
                <span class="ig-arg-dot ig-arg-con">
                  <Icon name="moins" color={pal.bad} size={2.3} strokeWidth={2.6} />
                </span>
                <span>{arg}</span>
              </p>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  </section>
{/if}

{#if layout.decisions.length || layout.vigilances.length}
  <section class="ig-section">
    <div class="ig-grid" class:ig-cols-2={both} class:ig-cols-1={!both}>
      <CheckList title={L.otherDecisions} items={layout.decisions} icon="check" {pal} />
      <CheckList title={L.vigilance} items={layout.vigilances} icon="alerte" tone="warn" {pal} />
    </div>
  </section>
{/if}
