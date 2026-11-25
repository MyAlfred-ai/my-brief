<script>
  /**
   * Tuile d'un tableau de bord replié (onglets IA, Configuration) : ce qui est
   * en service, en un coup d'œil — icône, libellé, valeur, une ligne de
   * détail — et un bouton qui déplie le réglage sous les tuiles. Un seul
   * réglage déplié à la fois : c'est l'onglet qui tient `open`.
   *
   * Le drapeau dit ce qui attend : « Modifié » (pas encore enregistré) ou,
   * avec `warn`, un geste à faire (« Clé requise ») — la tuile se cerne alors
   * d'ambre. La valeur est un slot : un nom de modèle, mais aussi une vignette
   * de logo ou deux pastilles de couleur.
   */
  import IconAltArrowDown from '~icons/solar/alt-arrow-down-linear';

  /** Icône d'un jeu d'icônes (props width/height). */
  export let icon;
  export let label = '';
  export let open = false;
  /** « Modifié », « Clé requise »… — vide, rien ne s'affiche. */
  export let flag = '';
  /** Le drapeau est un avertissement. */
  export let warn = false;
  /** Ligne de détail sous la valeur. */
  export let sub = '';
  /** Marque carrée devant le détail (prop `size`). */
  export let subLogo = null;
  /** Ou logo complet, qui ne se recadre pas (prop `height`). */
  export let subWordmark = null;
</script>

<button
  type="button"
  class="dt"
  class:dt-open={open}
  class:dt-warn={warn}
  aria-expanded={open}
  on:click
>
  <span class="dt-top">
    <span class="dt-icon" aria-hidden="true">
      <svelte:component this={icon} width="16" height="16" />
    </span>
    <span class="dt-label">{label}</span>
    {#if flag}<span class="dt-flag" class:dt-flag-warn={warn}>{flag}</span>{/if}
    <IconAltArrowDown class="dt-chevron" width="14" height="14" aria-hidden="true" />
  </span>
  <span class="dt-value"><slot /></span>
  {#if sub || subLogo || subWordmark}
    <span class="dt-sub">
      {#if subWordmark}
        <svelte:component this={subWordmark} height={10} />
      {:else if subLogo}
        <svelte:component this={subLogo} size={13} />
      {/if}
      <span>{sub}</span>
    </span>
  {/if}
</button>

<style>
  .dt {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fff;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .dt:hover {
    border-color: var(--line-strong);
  }
  .dt:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .dt-open,
  .dt-open:hover {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.12);
  }
  .dt-warn {
    border-color: var(--warn-line);
  }
  .dt-top {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }
  .dt-icon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--brand) 9%, #fff);
    color: var(--brand-text);
    flex-shrink: 0;
  }
  .dt-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ink-faint);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .dt-flag {
    flex-shrink: 0;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 600;
    background: var(--line);
    color: var(--ink-soft);
  }
  .dt-flag-warn {
    background: var(--warn-bg);
    color: var(--warn-text);
  }
  .dt-top :global(.dt-chevron) {
    margin-left: auto;
    color: var(--ink-faint);
    transition: transform 0.2s;
    flex-shrink: 0;
  }
  .dt-open :global(.dt-chevron) {
    transform: rotate(180deg);
  }
  .dt-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dt-sub {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    white-space: nowrap;
  }
  .dt-sub span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (prefers-reduced-motion: reduce) {
    .dt-top :global(.dt-chevron) {
      transition: none;
    }
  }
  @media (max-width: 640px) {
    .dt {
      gap: 0.15rem;
      padding: 0.6rem 0.75rem;
    }
  }
</style>
