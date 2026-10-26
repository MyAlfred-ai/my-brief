<script>
  /**
   * « Exporter en PDF » : le choix des sections du rapport.
   *
   * Le rapport reprend la période et les filtres de l'écran — la boîte les
   * rappelle en tête, pour qu'on sache ce qu'on exporte avant de cliquer. Le
   * dernier choix de sections est retenu dans ce navigateur (confort
   * personnel : un rapport mensuel se refait avec les mêmes sections).
   *
   * Une section sans objet dans le périmètre (dépenses non calculées, tableau
   * par utilisateur quand la page est centrée sur un compte) est grisée, pas
   * cachée : la liste reste la même d'un export à l'autre.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import IconDocument from '~icons/solar/document-text-linear';

  export let texts;
  /** `[{id, available}]` dans l'ordre du rapport. */
  export let sections = [];
  /** Période et périmètre, en mots (statsView.js). */
  export let periodText = '';
  export let scopeText = '';
  export let busy = false;
  export let errorMessage = '';

  const STORAGE_KEY = 'mybrief.adminStats.pdfSections';
  const dispatch = createEventDispatcher();

  let chosen = new Set();
  let firstBox;

  onMount(() => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      saved = null;
    }
    const ids = Array.isArray(saved) ? saved : sections.map((s) => s.id);
    chosen = new Set(ids.filter((id) => sections.some((s) => s.id === id)));
    firstBox?.focus();
  });

  $: usable = sections.filter((s) => s.available);
  $: picked = usable.filter((s) => chosen.has(s.id)).map((s) => s.id);

  function toggle(id) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    chosen = next;
  }

  function setAll(on) {
    chosen = new Set(on ? sections.map((s) => s.id) : []);
  }

  function generate() {
    if (!picked.length || busy) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...chosen]));
    } catch {
      // Stockage indisponible (navigation privée) : le choix ne sera pas retenu.
    }
    dispatch('generate', picked);
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && !busy) dispatch('cancel');
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="ed-overlay" role="dialog" aria-modal="true" aria-labelledby="ed-title">
  <button
    type="button"
    class="ed-backdrop"
    aria-label={texts.pdf.cancel}
    on:click={() => !busy && dispatch('cancel')}
  ></button>

  <form class="ed-panel" on:submit|preventDefault={generate}>
    <h3 class="ed-title" id="ed-title">
      <IconDocument width="18" height="18" aria-hidden="true" />
      {texts.pdf.title}
    </h3>
    <p class="ed-intro">{texts.pdf.intro}</p>
    <dl class="ed-scope">
      <div>
        <dt>{texts.pdf.period}</dt>
        <dd>{periodText}</dd>
      </div>
      <div>
        <dt>{texts.pdf.scope}</dt>
        <dd>{scopeText}</dd>
      </div>
    </dl>

    <fieldset class="ed-sections">
      <legend class="ed-sr">{texts.pdf.sectionsLabel}</legend>
      <div class="ed-sections-head">
        <span aria-hidden="true">{texts.pdf.sectionsLabel}</span>
        <div class="ed-bulk">
          <button type="button" on:click={() => setAll(true)}>{texts.pdf.all}</button>
          <button type="button" on:click={() => setAll(false)}>{texts.pdf.none}</button>
        </div>
      </div>
      <ul>
        {#each sections as section, index (section.id)}
          <li>
            <label class="ed-option" class:ed-option-off={!section.available}>
              {#if index === 0}
                <input
                  type="checkbox"
                  bind:this={firstBox}
                  checked={section.available && chosen.has(section.id)}
                  disabled={!section.available || busy}
                  on:change={() => toggle(section.id)}
                />
              {:else}
                <input
                  type="checkbox"
                  checked={section.available && chosen.has(section.id)}
                  disabled={!section.available || busy}
                  on:change={() => toggle(section.id)}
                />
              {/if}
              <span>{texts.pdf.sections[section.id]}</span>
            </label>
          </li>
        {/each}
      </ul>
    </fieldset>

    <p class="ed-privacy">{texts.pdf.privacy}</p>
    {#if errorMessage}
      <p class="ed-error" role="alert">{errorMessage}</p>
    {:else if !picked.length}
      <p class="ed-warn">{texts.pdf.empty}</p>
    {/if}

    <div class="ed-actions">
      <button
        type="button"
        class="ed-secondary"
        on:click={() => dispatch('cancel')}
        disabled={busy}
      >
        {texts.pdf.cancel}
      </button>
      <button type="submit" class="ed-primary" disabled={!picked.length || busy}>
        {busy ? texts.pdf.generating : texts.pdf.generate}
      </button>
    </div>
  </form>
</div>

<style>
  .ed-overlay {
    position: fixed;
    inset: 0;
    z-index: 10003;
    display: flex;
    padding: max(1rem, var(--safe-top, 0px)) 1rem max(1rem, var(--safe-bottom, 0px));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .ed-backdrop {
    position: fixed;
    inset: 0;
    border: none;
    padding: 0;
    background: rgba(20, 18, 15, 0.45);
    cursor: pointer;
  }
  .ed-panel {
    position: relative;
    margin: auto;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.4rem 1.5rem 1.3rem;
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.25);
  }
  .ed-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 1.08rem;
    color: var(--ink);
  }
  .ed-title :global(svg) {
    flex-shrink: 0;
    color: var(--brand-text);
  }
  .ed-intro {
    margin: 0;
    font-size: 0.86rem;
    color: var(--ink-muted);
    line-height: 1.45;
  }
  .ed-scope {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0.65rem 0.8rem;
    border-radius: 9px;
    background: var(--surface-tint);
    border: 1px solid var(--line);
  }
  .ed-scope div {
    display: grid;
    grid-template-columns: 6rem 1fr;
    gap: 0.6rem;
    font-size: 0.82rem;
  }
  .ed-scope dt {
    color: var(--ink-faint);
    font-weight: 600;
  }
  .ed-scope dd {
    margin: 0;
    color: var(--ink);
  }

  .ed-sections {
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
  }
  /* La légende reste pour les lecteurs d'écran ; à l'œil, la même phrase
     partage sa ligne avec « Tout cocher / Tout décocher », sans chevauchement. */
  .ed-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .ed-sections-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.45rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .ed-bulk {
    display: flex;
    gap: 0.6rem;
    text-transform: none;
    letter-spacing: normal;
  }
  .ed-bulk button {
    padding: 0;
    border: none;
    background: none;
    color: var(--brand-text);
    font-family: inherit;
    font-size: 0.76rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .ed-sections ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem 0.8rem;
  }
  .ed-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.1rem;
    font-size: 0.86rem;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .ed-option input {
    width: 16px;
    height: 16px;
    accent-color: var(--brand);
  }
  .ed-option-off {
    color: var(--ink-faint);
    cursor: default;
  }

  .ed-privacy {
    margin: 0;
    font-size: 0.76rem;
    color: var(--ink-faint);
    line-height: 1.4;
  }
  .ed-warn {
    margin: 0;
    font-size: 0.8rem;
    color: var(--warn-text);
  }
  .ed-error {
    margin: 0;
    padding: 0.5rem 0.7rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.84rem;
  }
  .ed-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }
  .ed-secondary,
  .ed-primary {
    padding: 0.6rem 1.1rem;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.86rem;
    cursor: pointer;
  }
  .ed-secondary {
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--ink-soft);
  }
  .ed-primary {
    border: none;
    background: var(--brand);
    color: #fff;
    font-weight: 600;
    box-shadow: 0 2px 8px -3px rgb(var(--brand-rgb) / 0.5);
  }
  .ed-primary:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .ed-primary:disabled,
  .ed-secondary:disabled {
    opacity: 0.5;
    cursor: default;
  }

  @media (max-width: 480px) {
    .ed-sections ul {
      grid-template-columns: 1fr;
    }
    .ed-scope div {
      grid-template-columns: 1fr;
      gap: 0.05rem;
    }
  }
</style>
