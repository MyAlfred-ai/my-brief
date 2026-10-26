<script>
  /**
   * Suite d'étapes numérotées. `hint` porte le détail qui fait rater l'étape —
   * il est en second plan, mais présent : c'est justement lui qu'on cherche
   * quand on y revient.
   */
  export let steps = [];
  /** Les étapes du parcours visio n'ont pas d'emoji : la numérotation suffit. */
  export let icons = true;
</script>

<ol class="hst">
  {#each steps as step, i}
    <li>
      <span class="hst-n">{i + 1}</span>
      {#if icons && step.icon}<span class="hst-icon" aria-hidden="true">{step.icon}</span>{/if}
      <span class="hst-body">
        <span class="hst-label">{step.label}</span>
        {#if step.hint}<span class="hst-hint">{step.hint}</span>{/if}
      </span>
    </li>
  {/each}
</ol>

<style>
  .hst {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .hst li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .hst-n {
    flex: 0 0 auto;
    width: 21px;
    height: 21px;
    border-radius: 50%;
    background: var(--brand-secondary-soft-15);
    color: var(--brand-text-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    margin-top: 1px;
  }
  .hst-icon {
    flex: 0 0 auto;
    font-size: 15px;
    line-height: 1.4;
  }
  .hst-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .hst-label {
    font-size: 13px;
    color: var(--ink);
    line-height: 1.45;
  }
  .hst-hint {
    font-size: 12px;
    color: var(--ink-muted);
    line-height: 1.45;
  }
</style>
