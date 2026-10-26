<script>
  /**
   * Aperçu de la barre de boutons post-réunion, telle qu'elle apparaîtra
   * réellement à l'utilisateur — garde-fous compris (un bouton coché mais
   * inopérant n'y figure pas, cf. `visibleActions()` de l'onglet Actions).
   *
   * Fonction PURE de ce qu'on lui passe : il montre, il n'appelle rien.
   */
  export let actions = [];
  export let label = '';
  export let emptyText = '';
</script>

<div class="abp">
  <span class="abp-label">{label}</span>
  {#if actions.length === 0}
    <span class="abp-empty">{emptyText}</span>
  {:else}
    <span class="abp-bar">
      {#each actions as action (action.key)}
        <span class="abp-btn"><svelte:component this={action.icon} width="14" height="14" /></span>
      {/each}
    </span>
  {/if}
</div>

<style>
  .abp {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .abp-label {
    font-size: 0.78rem;
    color: var(--ink-muted);
  }
  .abp-empty {
    font-size: 0.78rem;
    color: var(--ink-faint);
    font-style: italic;
  }
  .abp-bar {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px 6px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .abp-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    color: var(--brand);
  }
</style>
