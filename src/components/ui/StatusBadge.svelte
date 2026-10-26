<script>
  /**
   * Pastille d'état — généralise les quatre copies indépendantes du même badge
   * (`.sp-badge`, `.ai-badge`, `.at-badge`, `.au-badge`).
   *
   * Trois tons seulement, et c'est volontaire : « ok » dit que ça fonctionne,
   * « warn » qu'il y a un geste à faire, « neutral » qu'il n'y a rien à signaler.
   * Un quatrième ton obligerait à décider ce qu'il veut dire.
   */
  /** 'neutral' | 'ok' | 'warn' */
  export let tone = 'neutral';
  export let text = '';
</script>

<span class="sb sb-{tone}">{text}</span>

<style>
  .sb {
    flex: 0 0 auto;
    align-self: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }
  .sb-neutral {
    background: var(--line);
    color: var(--ink-muted);
  }
  .sb-ok {
    background: var(--success-bg);
    color: var(--success-text);
  }
  .sb-warn {
    background: var(--warn-bg);
    color: var(--warn-text);
  }
</style>
