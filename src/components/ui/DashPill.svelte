<script>
  /**
   * Pastille d'un tableau de bord replié : un fournisseur d'IA (onglet IA),
   * un mode de connexion (onglet Authentification). Une marque, un nom, et
   * l'état d'un signe — point vert quand c'est en service ; sinon bordure en
   * pointillés et, avec `addable`, un « + » qui dit qu'il reste à l'ajouter.
   * Un clic déplie son détail sous la ligne de pastilles, un seul à la fois :
   * c'est l'onglet qui tient `open`.
   *
   * L'état est aussi DIT (`status`, lu par les lecteurs d'écran) : le point
   * vert seul ne s'entend pas.
   */
  import IconAddCircle from '~icons/solar/add-circle-linear';

  export let label = '';
  /** En service : point vert. */
  export let on = false;
  export let open = false;
  /** Hors service : un « + » (à ajouter) plutôt qu'un point creux. */
  export let addable = false;
  /** L'état, en mots, pour les lecteurs d'écran. */
  export let status = '';
  /** « Modifié » : un changement pas encore enregistré. */
  export let flag = '';
  /** Marque carrée (prop `size`). */
  export let logo = null;
  /** Ou icône d'un jeu d'icônes (props width/height). */
  export let icon = null;
  /** Ou logo complet (prop `height`), affiché à la place du nom. */
  export let wordmark = null;
</script>

<button
  type="button"
  class="dp"
  class:dp-open={open}
  class:dp-off={!on}
  aria-expanded={open}
  on:click
>
  {#if wordmark}
    <svelte:component this={wordmark} height={12} />
    <span class="dp-sr">{label}</span>
  {:else}
    {#if logo}
      <svelte:component this={logo} size={16} />
    {:else if icon}
      <svelte:component this={icon} width="16" height="16" aria-hidden="true" />
    {/if}
    <span>{label}</span>
  {/if}
  {#if flag}<span class="dp-flag">{flag}</span>{/if}
  {#if on}
    <span class="dp-dot" aria-hidden="true"></span>
  {:else if addable}
    <IconAddCircle class="dp-add" width="15" height="15" aria-hidden="true" />
  {:else}
    <span class="dp-dot dp-dot-off" aria-hidden="true"></span>
  {/if}
  {#if status}<span class="dp-sr">{status}</span>{/if}
</button>

<style>
  .dp {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: #fff;
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color 0.15s,
      box-shadow 0.15s,
      background 0.15s;
  }
  .dp:hover {
    background: var(--surface-tint);
  }
  .dp-off {
    border-style: dashed;
    border-color: var(--line-strong);
    color: var(--ink-soft);
  }
  .dp-open {
    border-color: var(--brand);
    border-style: solid;
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.12);
  }
  .dp:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .dp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success-text);
  }
  .dp-dot-off {
    box-sizing: border-box;
    border: 1.5px solid var(--ink-faint);
    background: transparent;
  }
  .dp :global(.dp-add) {
    color: var(--ink-faint);
  }
  .dp-flag {
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    font-size: 0.66rem;
    font-weight: 600;
    background: var(--line);
    color: var(--ink-soft);
  }
  .dp-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
