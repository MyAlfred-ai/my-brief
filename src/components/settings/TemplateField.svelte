<script>
  /**
   * Champ de gabarit `{{clé}}` avec insertion assistée et aperçu.
   *
   * Les variables viennent du SERVEUR (`GET /actions/settings`), jamais d'une
   * liste recopiée ici : une seconde source de vérité divergerait au premier
   * ajout, exactement comme la palette des tags.
   *
   * L'aperçu est une fonction PURE de la valeur saisie — même règle que
   * `visibleActions()` dans l'onglet d'administration : il montre ce que le
   * réglage produira, sans rien écrire ni appeler.
   */
  import { renderFilenameTemplate } from '../../utils/filename.js';

  export let value = '';
  export let label = '';
  export let placeholder = '';
  export let hint = '';
  export let variables = [];
  export let variablesLabel = '';
  export let previewLabel = '';
  export let sample = {};
  /** 'subject' | 'filename' — l'aperçu d'un nom de fichier est sluggé, pas l'objet. */
  export let mode = 'subject';
  export let id = 'tpl';
  /** Verrouille champ ET boutons de variable pendant un enregistrement. */
  export let disabled = false;

  let input;

  /**
   * Insère la variable à la position du curseur plutôt qu'en fin de champ :
   * un gabarit se compose en écrivant, pas en recollant à la fin.
   */
  function insert(name) {
    const token = `{{${name}}}`;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    value = value.slice(0, start) + token + value.slice(end);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  /**
   * Aperçu. Pour un nom de fichier, on réutilise le rendu RÉEL — c'est le même
   * code qui nommera le document, donc l'aperçu ne peut pas mentir.
   */
  $: preview =
    mode === 'filename'
      ? renderFilenameTemplate(value, sample, { ext: 'pdf' }) || ''
      : value.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, name) => sample[name.toLowerCase()] ?? '');
</script>

<div class="tf">
  <label class="tf-label" for={id}>{label}</label>
  <input
    {id}
    bind:this={input}
    class="tf-input"
    type="text"
    autocomplete="off"
    spellcheck="false"
    {placeholder}
    {disabled}
    bind:value
  />

  <div class="tf-vars">
    <span class="tf-vars-label">{variablesLabel}</span>
    {#each variables as name (name)}
      <button type="button" class="tf-var" {disabled} on:click={() => insert(name)}>
        {'{{' + name + '}}'}
      </button>
    {/each}
  </div>

  {#if hint}<p class="tf-hint">{hint}</p>{/if}
  {#if value.trim() && preview}
    <p class="tf-preview"><span>{previewLabel}</span> {preview}</p>
  {/if}
</div>

<style>
  .tf {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .tf-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .tf-input {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line, var(--line));
    border-radius: 8px;
    font-size: 0.92rem;
    font-family: inherit;
    background: #fff;
    color: #1a1a1a;
    width: 100%;
    box-sizing: border-box;
  }
  .tf-input:focus {
    outline: none;
    border-color: var(--brand, var(--brand));
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .tf-vars {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
  }
  .tf-vars-label {
    font-size: 0.74rem;
    color: color-mix(in srgb, var(--brand-secondary) 11.8%, #828282);
    margin-right: 2px;
  }
  .tf-var {
    padding: 2px 7px;
    border-radius: 6px;
    border: 1px solid var(--line, var(--line));
    background: color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.74rem;
    color: color-mix(in srgb, var(--brand-secondary) 18.1%, #313131);
    cursor: pointer;
  }
  .tf-var:hover:not(:disabled) {
    border-color: var(--brand, var(--brand));
  }
  .tf-input:disabled,
  .tf-var:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .tf-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .tf-preview {
    margin: 0;
    padding: 0.45rem 0.65rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8);
    border: 1px dashed var(--line, color-mix(in srgb, var(--brand-secondary) 8.6%, #e3e3e3));
    font-size: 0.82rem;
    color: color-mix(in srgb, var(--brand-secondary) 18%, #2b2b2b);
    overflow-wrap: anywhere;
  }
  .tf-preview span {
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.6%, #747474);
  }
</style>
