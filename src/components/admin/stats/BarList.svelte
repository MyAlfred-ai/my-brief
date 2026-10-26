<script>
  /**
   * Barres horizontales — classements et répartitions à libellés longs (emails,
   * noms de templates, tranches de durée). En HTML plutôt qu'en SVG : le texte
   * y coule, se tronque proprement et reste sélectionnable, là où un SVG
   * demanderait de mesurer chaque chaîne à la main.
   *
   * Barre à bout arrondi 4 px côté valeur, carré côté base ; la valeur est posée
   * À CÔTÉ de la barre, jamais dedans — une barre courte ne doit pas rogner son
   * étiquette. Chaque ligne porte donc sa valeur en clair : c'est aussi ce qui
   * autorise des teintes claires en fin de rampe (le nombre ne dépend pas de la
   * couleur pour être lu).
   */
  export let items = [];
  /** Couleur unique, ou `colors[i]` pour une rampe ordonnée (tranches de durée). */
  export let color = 'var(--viz-series-1)';
  export let colors = null;
  export let formatValue = (value) => String(value);
  /** Dénominateur des barres. Par défaut le maximum de la liste. */
  export let max = 0;

  $: scale = max || items.reduce((best, item) => Math.max(best, item.value || 0), 0) || 1;
</script>

<ul class="bl-list">
  {#each items as item, index (item.key ?? item.label)}
    <li class="bl-row">
      <div class="bl-head">
        <span class="bl-label" title={item.title || item.label}>{item.label}</span>
        <span class="bl-value">{formatValue(item.value)}</span>
      </div>
      <div class="bl-track">
        <div
          class="bl-bar"
          style="width: {Math.max(
            item.value > 0 ? 2 : 0,
            (item.value / scale) * 100,
          )}%; background: {colors ? colors[index % colors.length] : color}"
        ></div>
      </div>
      {#if item.hint}<span class="bl-hint">{item.hint}</span>{/if}
    </li>
  {/each}
</ul>

<style>
  .bl-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .bl-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .bl-head {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }
  .bl-label {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.83rem;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Les valeurs portent les encres, jamais la couleur de la barre : une teinte
     claire de fin de rampe serait illisible en texte. */
  .bl-value {
    flex: 0 0 auto;
    font-size: 0.83rem;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .bl-track {
    height: 10px;
    border-radius: 2px;
    background: var(--viz-track);
  }
  .bl-bar {
    height: 100%;
    border-radius: 0 4px 4px 0;
    transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .bl-bar {
      transition: none;
    }
  }
  .bl-hint {
    font-size: 0.74rem;
    color: var(--ink-faint);
  }
</style>
