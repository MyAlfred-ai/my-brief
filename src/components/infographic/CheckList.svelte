<script>
  // Panneau à pictogrammes : décisions (coche), points de vigilance (alerte),
  // suites décidées… La couleur dit la nature : marque pour ce qui est acté,
  // ambre pour ce qui inquiète. Chaque ligne porte sa pastille en dégradé.
  import GradIcon from './GradIcon.svelte';

  export let title = '';
  /** @type {string[]} */
  export let items = [];
  export let icon = 'coche';
  export let pal;
  /** `brand` | `warn` */
  export let tone = 'brand';
</script>

{#if items.length}
  <div class="ig-panel ig-panel-{tone}">
    <p class="ig-panel-title">{title}</p>
    <ul class="ig-panel-list">
      {#each items as item, i (i)}
        <li>
          <GradIcon
            name={icon}
            tone={tone === 'warn' ? 'warn' : 'p'}
            {pal}
            size={3.5}
            shape="round"
          />
          <span>{item}</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}
