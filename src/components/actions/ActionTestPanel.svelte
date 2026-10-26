<script>
  /**
   * Bloc « Tester » d'UNE action — bouton, état en cours, diagnostic.
   *
   * PRÉSENTATIONNEL : il n'appelle rien. C'est le parent qui possède
   * l'enregistrement, et le test doit pouvoir être précédé d'un save (le test
   * s'exécute sur les réglages ENREGISTRÉS, pas sur ce qui est à l'écran) —
   * enchaîner les deux depuis ici obligerait à faire remonter le save.
   *
   * Deux détails qui font tout l'intérêt du panneau :
   *   - `dirty` change le LIBELLÉ du bouton. Un bouton « Tester » qui testerait
   *     silencieusement d'anciennes valeurs mentirait sur ce qu'il vérifie.
   *   - `result.stale` grise un résultat devenu obsolète sans l'effacer : il
   *     reste vrai de ce qui a été testé, il n'est plus vrai de ce qui est
   *     affiché au-dessus.
   */
  import { createEventDispatcher } from 'svelte';
  import IconMail from '~icons/solar/letter-linear';
  import IconCloud from '~icons/solar/cloud-upload-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconWarn from '~icons/solar/danger-triangle-linear';

  /** 'email' | 'storage' — décide seulement de l'icône. */
  export let target = 'email';
  export let dirty = false;
  export let running = false;
  export let disabled = false;
  export let disabledReason = '';
  /**
   * `null` = aucun test lancé.
   * `{ok, title, details: [{label, value}], stale}`
   */
  export let result = null;
  /** {run, runDirty, running, stale} */
  export let texts = {};

  const dispatch = createEventDispatcher();

  $: icon = target === 'storage' ? IconCloud : IconMail;
  $: label = running ? texts.running : dirty ? texts.runDirty : texts.run;
</script>

<div class="atp">
  <div class="atp-row">
    <button
      type="button"
      class="atp-btn"
      class:atp-btn-dirty={dirty && !running}
      on:click={() => dispatch('run')}
      disabled={disabled || running}
    >
      <svelte:component this={icon} width="15" height="15" aria-hidden="true" />
      {label}
    </button>
    {#if disabled && disabledReason}
      <span class="atp-why">{disabledReason}</span>
    {/if}
  </div>

  {#if result}
    <div class="atp-result" class:atp-ko={!result.ok} class:atp-stale={result.stale} role="status">
      <p class="atp-title">
        {#if result.ok}<IconCheck width="15" height="15" aria-hidden="true" />{:else}<IconWarn
            width="15"
            height="15"
            aria-hidden="true"
          />{/if}
        <span>{result.title}</span>
      </p>
      {#if result.details?.length}
        <dl class="atp-details">
          {#each result.details as line, i (i)}
            <div class="atp-line">
              <dt>{line.label}</dt>
              <dd>{line.value}</dd>
            </div>
          {/each}
        </dl>
      {/if}
      {#if result.stale}
        <p class="atp-stale-note">{texts.stale}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .atp {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .atp-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .atp-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .atp-btn:hover:not(:disabled) {
    border-color: var(--line-faint);
    background: var(--surface-tint);
  }
  /* Le bouton enchaîne un enregistrement : il porte la couleur de marque pour
     dire qu'il ne fait plus seulement un test. */
  .atp-btn-dirty {
    border-color: var(--brand);
    color: var(--brand-text-strong);
    background: var(--brand-secondary-soft-08);
  }
  .atp-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .atp-why {
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.4;
  }

  .atp-result {
    padding: 0.65rem 0.8rem;
    border-radius: 8px;
    background: var(--success-bg);
    border: 1px solid var(--success-line);
    color: var(--success-text);
    font-size: 0.85rem;
  }
  .atp-ko {
    background: var(--danger-bg);
    border-color: var(--danger-line);
    color: var(--danger-text);
  }
  /* Grisé, pas effacé : le résultat reste vrai de ce qui a été testé. */
  .atp-stale {
    background: var(--surface);
    border-color: var(--line);
    border-style: dashed;
    color: var(--ink-muted);
  }
  .atp-title {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0;
    font-weight: 600;
    line-height: 1.45;
  }
  .atp-title span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .atp-details {
    margin: 0.5rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.82rem;
    font-weight: 400;
  }
  .atp-line {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }
  .atp-line dt {
    flex: 0 0 auto;
    min-width: 6.5rem;
    opacity: 0.8;
  }
  .atp-line dd {
    margin: 0;
    min-width: 0;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .atp-stale-note {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    font-weight: 400;
    line-height: 1.45;
  }
  @media (max-width: 640px) {
    .atp-line {
      flex-direction: column;
      gap: 0;
    }
  }
</style>
