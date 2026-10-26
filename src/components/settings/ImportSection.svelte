<script>
  /**
   * Section « Importer un audio » de « Ma configuration ».
   *
   * L'entrée du menu ouvrait jadis le sélecteur de fichier du système, sans un
   * mot : on ne savait ni ce qui était accepté, ni ce qui allait se passer
   * ensuite. Elle affiche désormais un écran, comme toutes les autres — le
   * sélecteur ne s'ouvre qu'au clic sur le bouton, geste explicite.
   *
   * L'import lui-même reste dans App.svelte (il enchaîne transcription puis
   * résumé, avec l'état de l'écran principal) : cette section n'en porte que
   * la porte d'entrée.
   */
  import IconImport from '~icons/solar/upload-minimalistic-linear';

  export let texts;
  export let onImport = () => {};
</script>

<div class="is-head">
  <IconImport width="17" height="17" aria-hidden="true" />
  <h4>{texts.importSection}</h4>
</div>

<div class="is-body">
  <p class="is-intro">{texts.importIntro}</p>

  <section class="is-card">
    <button type="button" class="is-cta" on:click={onImport}>
      <IconImport width="17" height="17" aria-hidden="true" />
      {texts.importCta}
    </button>
    <p class="is-hint">{texts.importFormats}</p>
  </section>
</div>

<style>
  .is-head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 16px 22px 12px;
    border-bottom: 1px solid var(--line);
    color: var(--brand-text);
    flex-shrink: 0;
  }
  .is-head h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .is-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 22px;
    max-width: 620px;
  }
  .is-intro {
    margin: 0 0 16px;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--ink-muted);
  }
  .is-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 20px;
    border: 1px dashed var(--line-strong);
    border-radius: 10px;
    background: var(--surface-tint);
  }
  .is-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0.65rem 1.2rem;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: #fff;
    font-family: inherit;
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.45);
    transition:
      background 0.15s,
      transform 0.1s;
  }
  .is-cta:hover {
    background: var(--brand-strong);
  }
  .is-cta:active {
    transform: scale(0.97);
  }
  .is-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
</style>
