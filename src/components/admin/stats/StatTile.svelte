<script>
  /**
   * Tuile de mesure : un libellé, un nombre, éventuellement une précision.
   *
   * Un nombre seul n'est pas un graphique à une barre — c'est cette tuile. La
   * variante `hero` porte LE chiffre de la page (un seul par écran) ; les
   * autres restent en corps de texte pour ne pas lui disputer l'attention.
   *
   * Chiffres proportionnels (pas de `tabular-nums`) sur les grandes valeurs :
   * à cette taille, des chiffres de largeur fixe font flotter « 121 ».
   *
   * `delta` : l'écart à la période précédente (stats/statsView.js), posé à
   * côté de la valeur. La flèche ET le signe le disent — jamais la couleur
   * seule —, et l'infobulle nomme la période comparée.
   */
  export let label = '';
  export let value = '';
  export let hint = '';
  export let hero = false;
  /** Douze derniers compartiments, pour la trace de tendance. */
  export let spark = [];
  export let icon = null;
  /** `{direction: 'up'|'down'|'flat'|'new', text: string, title: string}` ou null. */
  export let delta = null;

  $: sparkMax = spark.reduce((best, point) => Math.max(best, point), 0) || 1;
</script>

<div class="sv-tile" class:sv-hero={hero}>
  <div class="sv-head">
    {#if icon}
      <span class="sv-icon" aria-hidden="true"
        ><svelte:component this={icon} width="16" height="16" /></span
      >
    {/if}
    <span class="sv-label">{label}</span>
  </div>
  <div class="sv-line">
    <span class="sv-value">{value}</span>
    {#if delta?.text}
      <span class="sv-delta sv-delta-{delta.direction}" title={delta.title || null}>
        <span aria-hidden="true"
          >{delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '•'}</span
        >
        {delta.text}
      </span>
    {/if}
  </div>
  {#if hint}<span class="sv-hint">{hint}</span>{/if}

  {#if spark.length > 1}
    <!-- Trace de tendance : la période courante prend l'accent, le reste recule. -->
    <div class="sv-spark" aria-hidden="true">
      {#each spark as point, index (index)}
        <span
          class="sv-spark-bar"
          class:sv-spark-now={index === spark.length - 1}
          style="height: {Math.max(8, (point / sparkMax) * 100)}%"
        ></span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sv-tile {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.85rem 0.95rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    min-width: 0;
  }
  .sv-hero {
    background: linear-gradient(160deg, var(--brand-secondary-soft-12), var(--surface) 62%);
    border-color: var(--brand-secondary-soft-18);
  }

  .sv-head {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    min-width: 0;
  }
  .sv-icon {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--brand-text);
  }
  /* Le libellé passe à la ligne au lieu d'être coupé : « Utilisateurs actifs »
     tronqué en « Utilisateurs… » ne dit plus quelle mesure on lit. */
  .sv-label {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink-faint);
    line-height: 1.3;
  }

  .sv-line {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.2rem 0.5rem;
  }
  /* Écart à la période précédente : une pastille discrète, lisible sans sa
     couleur (flèche + signe). Hausse en vert, baisse en rouge — sur un écran
     d'adoption, plus d'usage est le sens souhaité. */
  .sv-delta {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.08rem 0.4rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    background: var(--surface-tint);
    color: var(--ink-muted);
  }
  .sv-delta span {
    font-size: 0.6rem;
  }
  .sv-delta-up,
  .sv-delta-new {
    background: var(--success-bg);
    color: var(--success-text);
  }
  .sv-delta-down {
    background: var(--danger-bg);
    color: var(--danger-text);
  }
  .sv-value {
    font-size: 1.5rem;
    font-weight: 650;
    line-height: 1.15;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .sv-hero .sv-value {
    font-size: 2.9rem;
    line-height: 1.05;
  }
  .sv-hint {
    font-size: 0.75rem;
    color: var(--ink-faint);
    line-height: 1.4;
  }

  .sv-spark {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 34px;
    margin-top: 0.45rem;
  }
  .sv-spark-bar {
    flex: 1 1 auto;
    border-radius: 2px 2px 0 0;
    background: var(--brand-secondary-soft-18);
  }
  .sv-spark-now {
    background: var(--viz-series-1);
  }

  @media (max-width: 640px) {
    .sv-hero .sv-value {
      font-size: 2.3rem;
    }
  }
</style>
