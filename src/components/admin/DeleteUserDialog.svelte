<script>
  /**
   * Confirmation de suppression définitive.
   *
   * La suppression purge le compte ET toutes ses données métier (réunions,
   * templates personnels, configuration) — irréversible. La saisie manuelle de
   * l'email est la garde : un simple « êtes-vous sûr ? » se clique sans lire.
   */
  import { createEventDispatcher } from 'svelte';
  import IconWarn from '~icons/solar/danger-triangle-linear';
  import { deleteUser } from '../../services/adminUsersApi.js';
  import { fill } from '../../utils/i18nFormat.js';

  export let texts; // $uiText.adminUsers
  export let user;

  const dispatch = createEventDispatcher();

  let confirmation = '';
  let state = 'idle'; // 'idle' | 'deleting'
  let errorMessage = '';

  $: canDelete = confirmation.trim().toLowerCase() === String(user.email).toLowerCase();

  async function confirm() {
    if (!canDelete) return;
    state = 'deleting';
    errorMessage = '';
    const res = await deleteUser(user.email, true);
    if (res.ok) {
      dispatch('deleted', user);
      return;
    }
    state = 'idle';
    errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
  }
</script>

<div class="du-overlay" role="dialog" aria-modal="true" aria-label={texts.deleteTitle}>
  <button
    type="button"
    class="du-backdrop"
    aria-label={texts.cancel}
    on:click={() => dispatch('cancel')}
  ></button>

  <div class="du-panel">
    <h3 class="du-title">
      <IconWarn width="17" height="17" aria-hidden="true" />
      {texts.deleteTitle}
    </h3>
    <p class="du-message">{fill(texts.deleteMessage, { email: user.email })}</p>

    <label class="du-label" for="du-confirm"
      >{fill(texts.deleteConfirmLabel, { email: user.email })}</label
    >
    <input
      id="du-confirm"
      class="du-input"
      type="text"
      autocomplete="off"
      disabled={state === 'deleting'}
      bind:value={confirmation}
    />

    {#if errorMessage}
      <p class="du-error" role="alert">{errorMessage}</p>
    {/if}

    <div class="du-actions">
      <button
        type="button"
        class="du-secondary"
        on:click={() => dispatch('cancel')}
        disabled={state === 'deleting'}
      >
        {texts.cancel}
      </button>
      <button
        type="button"
        class="du-danger"
        on:click={confirm}
        disabled={!canDelete || state === 'deleting'}
      >
        {texts.deleteConfirm}
      </button>
    </div>
  </div>
</div>

<style>
  .du-overlay {
    position: fixed;
    inset: 0;
    z-index: 10003;
    display: flex;
    /* Centrage par margin:auto sur le panneau (pas par align-items:center) :
       avec le clavier ouvert (saisie de l'email), le panneau dépasse la
       hauteur visible — align-items:center rendait le haut ET le bouton
       Supprimer inatteignables ; margin:auto + overflow permet de scroller. */
    padding: max(1rem, var(--safe-top, 0px)) 1rem max(1rem, var(--safe-bottom, 0px));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .du-backdrop {
    position: fixed;
    inset: 0;
    border: none;
    padding: 0;
    background: rgba(20, 18, 15, 0.45);
    cursor: pointer;
  }
  .du-panel {
    position: relative;
    margin: auto;
    width: 100%;
    max-width: 420px;
    background: #fffefc;
    border-radius: 10px;
    padding: 1.5rem;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.25);
  }
  .du-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.6rem;
    font-size: 1.1rem;
    color: oklch(38% 0.14 25);
  }
  .du-title :global(svg) {
    flex-shrink: 0;
  }
  .du-message {
    margin: 0 0 1rem;
    color: #555;
    font-size: 0.9rem;
    line-height: 1.45;
  }
  .du-label {
    display: block;
    font-size: 0.82rem;
    font-weight: 600;
    color: #555;
    margin-bottom: 0.35rem;
    overflow-wrap: anywhere;
  }
  .du-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.6rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--brand-secondary) 4.1%, #e0e0e0);
    border-radius: 8px;
    font-size: 0.95rem;
  }
  .du-error {
    margin: 0.6rem 0 0;
    color: #c0392b;
    font-size: 0.88rem;
  }
  .du-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1.1rem;
  }
  .du-danger {
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 8px;
    background: oklch(52% 0.19 25);
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }
  .du-danger:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .du-secondary {
    padding: 0.6rem 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-secondary) 4.1%, #e0e0e0);
    border-radius: 8px;
    background: #fff;
    color: #444;
    cursor: pointer;
  }
</style>
