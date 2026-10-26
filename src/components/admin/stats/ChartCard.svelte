<script>
  /**
   * Cadre commun d'un graphique : titre, sous-titre, et le JUMEAU TABLEAU.
   *
   * Le tableau n'est pas un supplément : une infobulle ne doit jamais être le
   * seul chemin vers une valeur (lecteur d'écran, clavier, impression, daltonisme
   * total). Chaque carte porte donc le même contenu sous deux formes, et le
   * bouton bascule de l'une à l'autre sans quitter la page.
   */
  import IconTable from '~icons/solar/list-linear';
  import IconChart from '~icons/solar/chart-2-linear';

  export let title = '';
  export let hint = '';
  /** Libellés de colonnes du jumeau tableau. */
  export let columns = [];
  /** Lignes du jumeau tableau : tableau de tableaux de chaînes déjà formatées. */
  export let rows = [];
  export let tableLabel = 'Données';
  export let chartLabel = 'Graphique';
  export let emptyLabel = '';
  /** Carte large (deux colonnes de la grille). */
  export let wide = false;

  let showTable = false;
  $: isEmpty = rows.length === 0;
</script>

<section class="cc-card" class:cc-wide={wide}>
  <header class="cc-head">
    <div class="cc-titles">
      <h4>{title}</h4>
      {#if hint}<p class="cc-hint">{hint}</p>{/if}
    </div>
    {#if !isEmpty && columns.length}
      <button
        type="button"
        class="cc-toggle"
        aria-pressed={showTable}
        on:click={() => (showTable = !showTable)}
      >
        {#if showTable}
          <IconChart width="14" height="14" aria-hidden="true" />{chartLabel}
        {:else}
          <IconTable width="14" height="14" aria-hidden="true" />{tableLabel}
        {/if}
      </button>
    {/if}
  </header>

  {#if isEmpty}
    <p class="cc-empty">{emptyLabel}</p>
  {:else if showTable}
    <div class="cc-table-wrap">
      <table class="cc-table">
        <thead>
          <tr
            >{#each columns as column (column)}<th scope="col">{column}</th>{/each}</tr
          >
        </thead>
        <tbody>
          {#each rows as row, index (index)}
            <tr>
              {#each row as cell, cellIndex (cellIndex)}
                {#if cellIndex === 0}
                  <th scope="row">{cell}</th>
                {:else}
                  <td>{cell}</td>
                {/if}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <slot />
  {/if}
</section>

<style>
  .cc-card {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 1rem 1.1rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    min-width: 0;
  }
  .cc-wide {
    grid-column: 1 / -1;
  }

  .cc-head {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .cc-titles {
    flex: 1 1 auto;
    min-width: 0;
  }
  .cc-head h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .cc-hint {
    margin: 0.2rem 0 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }

  .cc-toggle {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink-muted);
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .cc-toggle:hover {
    background: var(--surface-tint);
    color: var(--ink-soft);
  }
  .cc-toggle[aria-pressed='true'] {
    border-color: var(--brand-secondary-soft-18);
    background: var(--brand-secondary-soft-08);
    color: var(--brand-text);
  }

  .cc-empty {
    margin: 0;
    padding: 1.4rem 0;
    text-align: center;
    font-size: 0.84rem;
    color: var(--ink-faint);
  }

  .cc-table-wrap {
    overflow-x: auto;
    max-height: 320px;
    overflow-y: auto;
  }
  .cc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
  }
  .cc-table th,
  .cc-table td {
    padding: 0.4rem 0.6rem 0.4rem 0;
    text-align: right;
    color: var(--ink-soft);
    white-space: nowrap;
    border-bottom: 1px solid var(--line);
  }
  .cc-table thead th {
    position: sticky;
    top: 0;
    background: var(--surface);
    font-weight: 600;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-faint);
  }
  .cc-table th[scope='row'],
  .cc-table thead th:first-child {
    text-align: left;
    font-weight: 500;
    color: var(--ink);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cc-table tbody tr:last-child th,
  .cc-table tbody tr:last-child td {
    border-bottom: none;
  }
</style>
