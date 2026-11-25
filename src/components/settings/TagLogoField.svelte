<script>
  /**
   * Logo d'un tag — celui du client ou du projet — dans sa fiche : une zone où
   * le déposer (ou cliquer pour le choisir), puis son aperçu avec « Remplacer… »
   * et « Retirer ».
   *
   * Composant de présentation : il remet le fichier choisi au parent, qui le
   * prépare (utils/tagLogo.js) et l'enregistre ; il affiche ce qu'on lui dit
   * (logo, envoi en cours, erreur déjà traduite).
   *
   * L'aperçu est sur fond blanc, en « contain » : un logo se montre entier,
   * jamais recadré — c'est ainsi qu'il paraîtra sur l'infographie et le PDF.
   */
  import { TAG_LOGO_ACCEPT } from '../../utils/tagLogo.js';
  import IconUpload from '~icons/solar/upload-minimalistic-linear';

  /** Le logo à montrer (data URL), vide tant qu'il n'est pas lu. */
  export let logo = '';
  /** Le tag annonce un logo — peut-être pas encore lu. */
  export let hasLogo = false;
  /** Texte alternatif, déjà rédigé. */
  export let alt = '';
  export let busy = false;
  /** Message d'erreur déjà traduit, ou vide. */
  export let error = '';
  /** Libellés `uiText.tagsPanel`. */
  export let texts;
  /** @type {(file: File) => void} */
  export let onFile = () => {};
  export let onRemove = () => {};

  let input;
  let dragging = false;

  function picked(event) {
    const file = event.currentTarget.files?.[0];
    // Vidé aussitôt : choisir deux fois le même fichier doit marcher.
    event.currentTarget.value = '';
    if (file) onFile(file);
  }

  function dropped(event) {
    dragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file && !busy) onFile(file);
  }
</script>

<div class="tlf">
  {#if hasLogo}
    <div class="tlf-preview">
      {#if logo}
        <img src={logo} {alt} />
      {:else}
        <span class="tlf-wait" aria-hidden="true"></span>
      {/if}
    </div>
    <div class="tlf-actions">
      <button type="button" class="tlf-btn" disabled={busy} on:click={() => input.click()}>
        {busy ? texts.logoSaving : texts.logoReplace}
      </button>
      <button type="button" class="tlf-btn tlf-btn-ghost" disabled={busy} on:click={onRemove}>
        {texts.logoRemove}
      </button>
    </div>
  {:else}
    <button
      type="button"
      class="tlf-drop"
      class:tlf-drag={dragging}
      disabled={busy}
      on:click={() => input.click()}
      on:dragenter|preventDefault={() => (dragging = true)}
      on:dragover|preventDefault={() => (dragging = true)}
      on:dragleave={() => (dragging = false)}
      on:drop|preventDefault={dropped}
    >
      <IconUpload width="24" height="24" aria-hidden="true" />
      <span class="tlf-drop-title">{busy ? texts.logoSaving : texts.logoDrop}</span>
      <span class="tlf-drop-hint">{texts.logoBrowse}</span>
    </button>
  {/if}
  <input
    bind:this={input}
    class="tlf-file"
    type="file"
    accept={TAG_LOGO_ACCEPT}
    aria-label={texts.logoDrop}
    tabindex="-1"
    on:change={picked}
  />
  {#if error}
    <div class="tlf-error" role="alert">{error}</div>
  {/if}
</div>

<style>
  .tlf {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 640px;
  }
  .tlf-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 220px;
    max-width: 100%;
    height: 120px;
    box-sizing: border-box;
    padding: 16px;
    border: 1.5px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
  }
  .tlf-preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .tlf-wait {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 3px solid var(--line);
    border-top-color: var(--tag-dot, var(--brand));
    animation: tlf-spin 0.9s linear infinite;
  }
  @keyframes tlf-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .tlf-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .tlf-btn {
    height: 36px;
    padding: 0 14px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    background: var(--surface);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .tlf-btn-ghost {
    border-color: transparent;
    background: transparent;
  }
  .tlf-btn:hover:not(:disabled) {
    background: var(--surface-tint);
  }
  .tlf-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .tlf-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    min-height: 120px;
    padding: 18px;
    box-sizing: border-box;
    border: 1.5px dashed var(--line-faint);
    border-radius: 14px;
    background: var(--surface-tint);
    font-family: inherit;
    color: var(--ink-soft);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .tlf-drop:hover:not(:disabled),
  .tlf-drag {
    border-color: var(--tag-dot, var(--brand));
    background: color-mix(in oklch, var(--tag-dot, var(--brand)) 6%, var(--surface));
  }
  .tlf-drop:disabled {
    cursor: default;
  }
  .tlf-drop-title {
    font-size: 14px;
    font-weight: 500;
  }
  .tlf-drop-hint {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .tlf-btn:focus-visible,
  .tlf-drop:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .tlf-file {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .tlf-error {
    padding: 9px 12px;
    border-radius: 9px;
    font-size: 12.5px;
    color: var(--danger-text);
    background: var(--danger-bg);
    border: 1px solid var(--danger-line);
  }
  @media (pointer: coarse) {
    .tlf-btn {
      height: 44px;
    }
  }
</style>
