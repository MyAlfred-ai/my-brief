<script>
  /**
   * « Actions masquées » — repliées sous les cartes, chacune avec « Rétablir ».
   *
   * Le bouton d'une carte ne supprime rien : il MASQUE (`show: false`). Une
   * action masquée quitte la liste, le compte rendu et l'infographie, et la
   * détection ne la repropose plus — c'est pour ce dernier point qu'elle reste
   * dans les données. Une vraie suppression aurait rendu la tâche au modèle, qui
   * l'aurait recréée à la phrase suivante. Il manquait le chemin du retour : le
   * compteur annonçait des actions « masquées » qu'aucun écran ne montrait.
   *
   * Réversible, donc sans confirmation. Partagé par le panneau desktop
   * (ActionsPanel) et la modale mobile (MobileActionsModal).
   */
  import { tick } from 'svelte';
  import IconChevronDown from '~icons/solar/alt-arrow-down-linear';
  import IconRestore from '~icons/solar/undo-left-linear';

  /** Actions masquées, dans l'ordre de la liste. */
  export let actions = [];
  export let uiText;
  export let onRestore = () => {};

  let open = false;
  let list;

  $: labels = uiText.actions;
  // Toutes rétablies : la prochaine action masquée retrouvera la liste repliée.
  $: if (actions.length === 0) open = false;

  // La liste s'ouvre en bas d'une colonne qui défile : sans ce défilement,
  // elle se déplierait hors de vue et le clic semblerait sans effet.
  async function toggle() {
    open = !open;
    if (!open) return;
    await tick();
    list?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
</script>

{#if actions.length > 0}
  <div class="ha">
    <button type="button" class="ha-toggle" aria-expanded={open} on:click={toggle}>
      <span>{labels.hiddenToggle.replace('{count}', actions.length)}</span>
      <span class="ha-chevron" class:ha-open={open} aria-hidden="true">
        <IconChevronDown width="14" height="14" />
      </span>
    </button>
    {#if open}
      <ul class="ha-list" bind:this={list}>
        {#each actions as a (a.id)}
          {@const title =
            String(a.title || '').trim() ||
            String(a.description || '').trim() ||
            labels.untitledAction}
          <li class="ha-item">
            <span class="ha-title" {title}>{title}</span>
            <button
              type="button"
              class="ha-restore"
              aria-label={labels.restoreActionLabel.replace('{title}', title)}
              on:click={() => onRestore(a)}
            >
              <IconRestore width="14" height="14" aria-hidden="true" />
              {labels.restoreAction}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .ha {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .ha-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 4px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--mb-text-secondary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .ha-toggle:hover,
  .ha-toggle:focus-visible {
    background: var(--brand-soft-08);
    color: var(--brand-text);
  }

  .ha-chevron {
    display: inline-flex;
    transition: transform 0.15s;
  }

  .ha-chevron.ha-open {
    transform: rotate(180deg);
  }

  .ha-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ha-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 10px;
    border: 1px dashed var(--mb-border-default);
    border-radius: 8px;
  }

  .ha-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--mb-text-muted);
  }

  .ha-restore {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 3px 8px;
    border: 1px solid var(--mb-border-default);
    border-radius: 8px;
    background: var(--mb-bg-surface);
    color: var(--brand-text);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  .ha-restore:hover,
  .ha-restore:focus-visible {
    background: var(--brand-soft-08);
    border-color: rgb(var(--brand-rgb) / 0.35);
  }

  /* Cibles tactiles ≥ 44 px, comme le reste de l'app (style.css, Phase 6.bis). */
  @media (pointer: coarse) {
    .ha-toggle,
    .ha-restore {
      min-height: 44px;
    }
  }
</style>
