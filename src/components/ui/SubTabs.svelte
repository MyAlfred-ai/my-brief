<script>
  /**
   * Onglets À L'INTÉRIEUR d'une page de panneau : le troisième niveau de la
   * navigation (panneau → entrée de la colonne → onglet), celui que MIA appelle
   * ses onglets de pages sœurs.
   *
   * Ils servent quand une entrée de la colonne regroupe plusieurs écrans de
   * même nature (« Actions » : un onglet par action). L'entrée reste allumée
   * dans la colonne quel que soit l'onglet ; chaque écran garde sa page à lui,
   * sans que la colonne ne s'allonge d'une ligne par écran.
   *
   * Sur téléphone, la rangée défile au doigt plutôt que de se replier : trois
   * ou quatre onglets courts tiennent presque toujours, et un second menu
   * déroulant sous celui des sections ferait deux menus à ouvrir. Quand ils
   * ne tiennent pas, la rangée défile d'elle-même jusqu'à l'onglet OUVERT : un
   * raccourci peut ouvrir le dernier (« Aide IA »), qui serait sinon hors
   * champ — l'écran affiché, sans rien pour dire lequel c'est.
   *
   * Clavier : la rangée est UN arrêt de tabulation, les flèches passent d'un
   * onglet à l'autre (motif « tablist » de l'ARIA).
   *
   * Un onglet peut porter une icône. Seul celui de l'Aide IA en a une
   * (`tone: 'ai'`) : son orbe, dans sa teinte, et le trait de l'onglet actif
   * la prend aussi — on reconnaît en réglages ce qu'on a vu en réunion. Les
   * autres onglets n'ont que leur libellé : une icône par onglet allongerait
   * la rangée d'un téléphone sans rien dire de plus.
   */
  import { afterUpdate } from 'svelte';
  import ConfigAlertDot from './ConfigAlertDot.svelte';

  /** @type {{id: string, label: string, icon?: any, tone?: 'ai',
   *   alert?: {level: string, items: {level: string, text: string}[]}|null}[]} */
  export let tabs = [];
  export let active = '';
  /** @type {(id: string) => void} */
  export let onSelect = (_id) => {};
  export let ariaLabel = '';

  let row;

  // L'onglet ouvert reste en vue : la rangée défile (elle seule, jamais la
  // page) quand il dépasse d'un bord. Une fois par changement d'onglet — le
  // doigt reste libre de faire défiler la rangée ensuite.
  const EDGE = 12;
  let revealed = '';
  afterUpdate(() => {
    if (!row || active === revealed) return;
    revealed = active;
    const tab = row.querySelector(`[data-tab="${active}"]`);
    if (!tab) return;
    const box = row.getBoundingClientRect();
    const { left, right } = tab.getBoundingClientRect();
    if (left < box.left) row.scrollLeft += left - box.left - EDGE;
    else if (right > box.right) row.scrollLeft += right - box.right + EDGE;
  });

  function onKeydown(event) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step || !tabs.length) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onSelect(next.id);
    // Le focus suit la sélection : sans ça il resterait sur un onglet devenu
    // inatteignable à la tabulation (tabindex -1).
    row?.querySelector(`[data-tab="${next.id}"]`)?.focus();
  }
</script>

<!-- svelte-ignore a11y-interactive-supports-focus -->
<div class="st" role="tablist" aria-label={ariaLabel} bind:this={row} on:keydown={onKeydown}>
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      class="st-tab"
      class:st-tab-on={active === tab.id}
      class:st-tab-ai={tab.tone === 'ai'}
      role="tab"
      data-tab={tab.id}
      aria-selected={active === tab.id}
      tabindex={active === tab.id ? 0 : -1}
      on:click={() => active !== tab.id && onSelect(tab.id)}
    >
      {#if tab.icon}
        <span class="st-icon" aria-hidden="true">
          <svelte:component this={tab.icon} width="17" height="17" />
        </span>
      {/if}
      <span>{tab.label}</span>
      {#if tab.alert}
        <ConfigAlertDot level={tab.alert.level} items={tab.alert.items} />
      {/if}
    </button>
  {/each}
</div>

<style>
  .st {
    display: flex;
    gap: 2px;
    padding: 0 22px;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }
  .st::-webkit-scrollbar {
    display: none;
  }
  .st-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    border: none;
    border-bottom: 3px solid transparent;
    margin-bottom: -1px;
    background: none;
    font-family: inherit;
    font-size: 13.5px;
    color: var(--ink-muted);
    white-space: nowrap;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s;
  }
  .st-tab:hover {
    color: var(--ink);
  }
  .st-tab-on {
    border-bottom-color: var(--brand);
    color: var(--ink);
    font-weight: 600;
  }
  .st-icon {
    display: inline-flex;
    flex-shrink: 0;
  }
  /* L'Aide IA : son orbe et son trait dans sa teinte, la seule hors marque. */
  .st-tab-ai .st-icon {
    color: var(--ai);
  }
  .st-tab-ai.st-tab-on {
    border-bottom-color: var(--ai);
  }
  .st-tab:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
    border-radius: 6px;
  }

  @media (max-width: 640px) {
    .st {
      padding: 0 12px;
    }
  }
</style>
