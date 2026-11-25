<script>
  /**
   * L'ordre du jour, point par point : le libellé, puis son état. La même
   * liste sous une intervention de l'IA (une photo de l'instant, figée) et au
   * pupitre (vivante : `onRemove` y ajoute de quoi retirer un point).
   *
   * L'état se lit par la CLARTÉ avant la teinte : gris pour ce qui est traité,
   * teinte claire pour ce qui est en cours, teinte PLEINE pour ce qu'on n'a pas
   * encore abordé — c'est ce point-là qui demande l'attention.
   *
   * Un point retenu d'après ce qui s'est dit porte un micro : on voit d'un coup
   * d'œil ce que l'IA a compris toute seule, donc ce qu'il faut relire.
   */
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import AiIcon from './AiIcon.svelte';

  /** @type {{label: string, state: string, heard?: boolean}[]} */
  export let points = [];
  /** Retirer un point (pupitre) ; absent : la liste est en lecture seule. */
  export let onRemove = null;

  $: T = $uiText.aiHelp;
  // La liste est clée par libellé : une réunion enregistrée avant le
  // dédoublonnage des points peut en porter deux identiques.
  $: rows = points.filter(
    (point, index) => points.findIndex((other) => other.label === point.label) === index,
  );
</script>

<ul class="aia">
  {#each rows as point (point.label)}
    <li class="aia-point" class:aia-done={point.state === 'done'}>
      <span class="aia-label">{point.label}</span>
      {#if point.heard}
        <span class="aia-heard" title={T.agendaHeard} role="img" aria-label={T.agendaHeard}>
          <AiIcon name="voice" size={14} />
        </span>
      {/if}
      <span class="aia-state aia-state-{point.state}">
        {T.agendaStates[point.state] || T.agendaStates.todo}
      </span>
      {#if onRemove}
        <button
          type="button"
          class="aia-remove"
          aria-label={fill(T.agendaRemove, { point: point.label })}
          title={fill(T.agendaRemove, { point: point.label })}
          on:click={() => onRemove(point.label)}
        >
          <AiIcon name="close" size={13} strokeWidth={2} />
        </button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .aia {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-family: 'Lexend', sans-serif;
  }
  .aia-point {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: calc(12.5px * var(--ai-scale, 1));
    line-height: 1.4;
    color: var(--ink);
  }
  .aia-label {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .aia-done .aia-label {
    color: var(--mb-text-secondary);
  }
  .aia-heard {
    flex: none;
    display: inline-flex;
    color: var(--ai-ink);
  }
  .aia-state {
    flex: none;
    padding: 2px 8px;
    border-radius: 9px;
    font-size: calc(11px * var(--ai-scale, 1));
    font-weight: 500;
    white-space: nowrap;
    background: var(--ai);
    color: #fff;
  }
  .aia-state-now {
    background: var(--ai-soft-strong);
    color: var(--ai-ink);
  }
  .aia-state-done {
    background: var(--surface-tint);
    color: var(--mb-text-secondary);
  }
  .aia-remove {
    width: 26px;
    height: 26px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--mb-text-secondary);
    cursor: pointer;
    transition: background 0.15s;
  }
  .aia-remove:hover {
    background: var(--ai-soft);
    color: var(--ai-ink);
  }
  .aia-remove:focus-visible {
    outline: 2px solid var(--ai);
    outline-offset: 2px;
  }

  @media (pointer: coarse) {
    .aia-remove {
      width: 44px;
      height: 44px;
    }
  }
</style>
