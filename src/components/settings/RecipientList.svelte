<script>
  /**
   * Liste d'adresses de destinataires — saisie, retrait, compteur.
   *
   * La validation locale double celle du serveur, elle ne la remplace pas : le
   * serveur refuse et NOMME ce qu'il rejette (`recipient_invalid`), parce qu'un
   * document en base peut venir d'ailleurs que de cet écran. Ici, la validation
   * ne sert qu'à éviter un aller-retour pour une faute de frappe évidente.
   *
   * Le compte de l'utilisateur n'apparaît pas dans la liste : il est TOUJOURS
   * en copie, quoi qu'il arrive, et l'afficher comme une entrée retirable
   * mentirait sur ce qu'il est possible de faire.
   */
  import IconClose from '~icons/solar/close-circle-linear';
  import IconAdd from '~icons/solar/add-circle-linear';
  import { looksLikeEmail } from '../../utils/mailDraft.js';

  export let recipients = [];
  export let max = 10;
  export let texts;
  export let disabled = false;

  let draft = '';
  let localError = '';

  $: full = recipients.length >= max;

  function add() {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (!looksLikeEmail(value)) {
      localError = texts.recipientInvalid;
      return;
    }
    if (recipients.includes(value)) {
      draft = '';
      return;
    }
    recipients = [...recipients, value];
    draft = '';
    localError = '';
  }

  function remove(value) {
    recipients = recipients.filter((r) => r !== value);
  }

  function onKeydown(event) {
    // Entrée et virgule ajoutent : c'est le geste attendu d'un champ
    // d'adresses, et la virgule ne peut de toute façon pas entrer dans une
    // adresse (le serveur la refuse).
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add();
    }
  }
</script>

<div class="rl">
  {#if recipients.length}
    <ul class="rl-chips">
      {#each recipients as address (address)}
        <li class="rl-chip">
          <span>{address}</span>
          <button
            type="button"
            class="rl-remove"
            {disabled}
            on:click={() => remove(address)}
            aria-label={`${texts.remove} ${address}`}
          >
            <IconClose width="14" height="14" aria-hidden="true" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="rl-input-row">
    <input
      class="rl-input"
      type="email"
      autocomplete="off"
      spellcheck="false"
      placeholder={texts.recipientPlaceholder}
      bind:value={draft}
      on:keydown={onKeydown}
      disabled={disabled || full}
    />
    <button
      type="button"
      class="rl-add"
      on:click={add}
      disabled={disabled || full || !draft.trim()}
    >
      <IconAdd width="15" height="15" aria-hidden="true" />
      <span>{texts.recipientAdd}</span>
    </button>
  </div>

  <p class="rl-count" class:rl-count-full={full}>{recipients.length} / {max}</p>
  {#if localError}<p class="rl-error" role="alert">{localError}</p>{/if}
</div>

<style>
  .rl {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .rl-chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .rl-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--line, var(--line));
    background: #fff;
    font-size: 0.84rem;
    color: var(--ink, color-mix(in srgb, var(--brand-secondary) 17.5%, #121212));
  }
  .rl-remove {
    display: inline-flex;
    border: none;
    background: transparent;
    padding: 2px;
    border-radius: 999px;
    cursor: pointer;
    color: var(--ink-faint);
  }
  .rl-remove:hover:not(:disabled) {
    color: var(--danger-strong);
  }
  .rl-input-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .rl-input {
    flex: 1 1 14rem;
    min-width: 0;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--line, var(--line));
    border-radius: 8px;
    font-size: 0.9rem;
    font-family: inherit;
    background: #fff;
    color: #1a1a1a;
  }
  .rl-input:focus {
    outline: none;
    border-color: var(--brand, var(--brand));
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .rl-add {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.55rem 0.9rem;
    border-radius: 8px;
    border: 1px solid var(--line, var(--line));
    background: #fff;
    font-family: inherit;
    font-size: 0.86rem;
    cursor: pointer;
    color: var(--ink, color-mix(in srgb, var(--brand-secondary) 17.5%, #121212));
  }
  .rl-add:disabled,
  .rl-remove:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .rl-count {
    margin: 0;
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--brand-secondary) 11.8%, #828282);
  }
  .rl-count-full {
    color: color-mix(in srgb, var(--brand) 62.2%, #040404);
    font-weight: 600;
  }
  .rl-error {
    margin: 0;
    font-size: 0.82rem;
    color: var(--danger-text);
  }
</style>
