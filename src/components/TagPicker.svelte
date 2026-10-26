<script>
  /**
   * Liste de choix « quel tag pour cette conversation » — sans positionnement
   * ni popover : l'appelant la place où il veut (menu contextuel de la sidebar,
   * menu déroulant de l'en-tête de conversation).
   *
   * « Aucun tag » est toujours proposé, y compris quand la conversation n'en a
   * pas : c'est l'entrée qui permet de la sortir d'un rangement, et la masquer
   * obligerait à deviner comment défaire.
   *
   * Seule la liste des tags défile : « Aucun tag » en tête et « Gérer les
   * tags… » en pied restent visibles quelle que soit la longueur de la liste.
   * Livrée seule, la liste se borne elle-même (260 px) ; un appelant qui borne
   * la hauteur du menu la laisse prendre la place restante en posant
   * `--tp-list-max: none` sur sa colonne flex (cf. TagSelect).
   */
  import { tags } from '../stores/tags.js';
  import { uiText } from '../store.js';
  import TagChip from './TagChip.svelte';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconSettings from '~icons/solar/settings-linear';

  /** Tag actuellement posé sur la conversation. */
  export let selectedId = null;
  /** @type {(tagId: string|null) => void} */
  export let onPick = () => {};
  /** Ouvre « Mes tags ». Omis = entrée masquée. */
  export let onManage = null;

  $: t = $uiText.sidebar;
</script>

<div class="tp" role="menu">
  <button
    class="tp-item"
    class:tp-item-active={!selectedId}
    role="menuitemradio"
    aria-checked={!selectedId}
    on:click={() => onPick(null)}
  >
    <span class="tp-none">{t.tagNone}</span>
    {#if !selectedId}<IconCheck width="13" height="13" class="tp-check" />{/if}
  </button>

  {#if $tags.length === 0}
    <div class="tp-empty">{t.tagNoneYet}</div>
  {:else}
    <div class="tp-sep"></div>
    <div class="tp-list">
      {#each $tags as tag (tag.id)}
        <button
          class="tp-item"
          class:tp-item-active={selectedId === tag.id}
          role="menuitemradio"
          aria-checked={selectedId === tag.id}
          on:click={() => onPick(tag.id)}
        >
          <TagChip {tag} />
          {#if selectedId === tag.id}<IconCheck width="13" height="13" class="tp-check" />{/if}
        </button>
      {/each}
    </div>
  {/if}

  {#if onManage}
    <div class="tp-sep"></div>
    <button class="tp-item tp-item-manage" role="menuitem" on:click={onManage}>
      <IconSettings width="13" height="13" />
      {t.tagManage}
    </button>
  {/if}
</div>

<style>
  .tp {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 190px;
  }
  /* La SEULE zone qui défile : tête et pied du menu ne bougent pas. */
  .tp-list {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    max-height: var(--tp-list-max, 260px);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--line-faint) transparent;
  }
  /* WebKit (Safari) ignore scrollbar-color et hériterait de l'ascenseur
     orange épais global de style.css — trop lourd pour un menu. */
  .tp-list::-webkit-scrollbar {
    width: 6px;
  }
  .tp-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .tp-list::-webkit-scrollbar-thumb {
    background: var(--line-faint);
    border-radius: 3px;
  }
  .tp-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    background: none;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--ink-soft);
    text-align: left;
  }
  .tp-item:hover {
    background: var(--brand-secondary-soft-08);
  }
  .tp-item-active {
    color: var(--ink);
  }
  .tp-item :global(.tp-check) {
    color: var(--brand-text);
    flex-shrink: 0;
  }
  .tp-none {
    color: var(--ink-muted);
    font-weight: 500;
  }
  .tp-item-active .tp-none {
    color: var(--ink);
  }
  .tp-empty {
    flex-shrink: 0;
    padding: 8px 10px;
    font-size: 11px;
    color: var(--ink-faint);
  }
  .tp-sep {
    flex-shrink: 0;
    height: 1px;
    background: var(--line);
    margin: 4px 0;
  }
  .tp-item-manage {
    gap: 7px;
    justify-content: flex-start;
    color: var(--ink-muted);
    font-size: 11.5px;
  }
</style>
