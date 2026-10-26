<script>
  /**
   * Champ mot de passe avec bascule d'affichage.
   * Premier input[type=password] du dépôt : `autocomplete` est indispensable
   * pour que les gestionnaires de mots de passe proposent l'enregistrement et
   * le remplissage.
   */
  import { uiText } from '../../store.js';

  export let value = '';
  export let id;
  export let label;
  export let autocomplete = 'current-password';
  export let disabled = false;
  /** Libellés de la bascule — par défaut ceux du dictionnaire (signIn). */
  export let showLabel = '';
  export let hideLabel = '';
  export let required = true;

  let visible = false;

  // Svelte n'autorise pas bind:value avec un type dynamique : on gère les deux
  // rendus explicitement plutôt que de basculer l'attribut type.
  function onInput(event) {
    value = event.currentTarget.value;
  }
</script>

<div class="pf-field">
  <label class="pf-label" for={id}>{label}</label>
  <div class="pf-input-wrap">
    {#if visible}
      <input
        {id}
        class="pf-input"
        type="text"
        {autocomplete}
        {disabled}
        {required}
        {value}
        on:input={onInput}
      />
    {:else}
      <input
        {id}
        class="pf-input"
        type="password"
        {autocomplete}
        {disabled}
        {required}
        {value}
        on:input={onInput}
      />
    {/if}
    <button
      type="button"
      class="pf-toggle"
      aria-label={visible
        ? hideLabel || $uiText.signIn.hidePassword
        : showLabel || $uiText.signIn.showPassword}
      aria-pressed={visible}
      {disabled}
      on:click={() => {
        visible = !visible;
      }}
    >
      {visible ? '🙈' : '👁'}
    </button>
  </div>
</div>

<style>
  .pf-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    text-align: left;
  }
  .pf-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #444;
  }
  .pf-input-wrap {
    position: relative;
    display: flex;
  }
  .pf-input {
    flex: 1;
    padding: 0.7rem 2.6rem 0.7rem 0.85rem;
    border: 1px solid var(--mb-border-input);
    border-radius: 8px;
    font-size: 1rem;
    background: #fff;
    color: #1a1a1a;
    min-width: 0;
  }
  .pf-input:focus {
    outline: none;
    border-color: var(--mb-orange);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.18);
  }
  .pf-input:disabled {
    background: #f5f3f0;
    color: #888;
  }
  .pf-toggle {
    position: absolute;
    right: 0.35rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.3rem;
    line-height: 1;
  }
  .pf-toggle:disabled {
    cursor: default;
    opacity: 0.5;
  }
</style>
