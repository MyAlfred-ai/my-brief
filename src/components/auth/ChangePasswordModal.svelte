<script>
  /**
   * Changement de mot de passe.
   *
   * Deux modes :
   *   - volontaire (`forced={false}`) : fermable, ouvert depuis le menu profil ;
   *   - forcé (`forced={true}`) : ni croix ni fermeture au clic extérieur, quand
   *     le compte utilise encore son mot de passe initial.
   *
   * Le mode forcé n'est PAS la sécurité : le serveur refuse de son côté toute
   * requête applicative d'un compte en attente de changement (403
   * password_change_required). Cette modale évite juste à l'utilisateur de se
   * heurter à des erreurs sans comprendre.
   */
  import { createEventDispatcher } from 'svelte';
  import PasswordField from './PasswordField.svelte';
  import { changePassword } from '../../services/authApi.js';
  import { checkPassword, DEFAULT_MIN_LENGTH } from '../../utils/passwordPolicy.js';
  import { auth, clearPasswordChangeRequirement } from '../../stores/auth.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { uiText } from '../../store.js';

  export let forced = false;

  const dispatch = createEventDispatcher();

  let currentPassword = '';
  let newPassword = '';
  let confirmation = '';
  let state = 'idle'; // 'idle' | 'saving' | 'saved'
  let errorMessage = '';

  $: texts = $uiText.account;
  $: policyTexts = $uiText.passwordPolicy;
  $: minLength = $auth.capabilities.passwordPolicy?.minLength || DEFAULT_MIN_LENGTH;
  $: email = $auth.user?.email || '';

  function close() {
    if (forced) return;
    dispatch('close');
  }

  async function submit() {
    errorMessage = '';
    const policy = checkPassword(newPassword, { email, minLength });
    if (!policy.ok) {
      errorMessage = fill(policyTexts[policy.reason] || policyTexts.required, { min: minLength });
      return;
    }
    if (newPassword !== confirmation) {
      errorMessage = policyTexts.mismatch;
      return;
    }

    state = 'saving';
    const res = await changePassword(currentPassword, newPassword);
    if (res.ok) {
      state = 'saved';
      clearPasswordChangeRequirement();
      currentPassword = '';
      newPassword = '';
      confirmation = '';
      return;
    }
    state = 'idle';
    errorMessage = res.data.reason
      ? fill(policyTexts[res.data.reason] || texts.errors.unknown, { min: minLength })
      : texts.errors[res.data.error] || texts.errors.unknown;
  }
</script>

<div
  class="cp-overlay"
  role="dialog"
  aria-modal="true"
  aria-label={forced ? texts.forcedTitle : texts.changePasswordTitle}
>
  <!-- Pas de fermeture au clic extérieur en mode forcé. -->
  {#if !forced}
    <button type="button" class="cp-backdrop" aria-label={texts.cancel} on:click={close}></button>
  {:else}
    <div class="cp-backdrop cp-backdrop-locked"></div>
  {/if}

  <div class="cp-panel">
    <h2 class="cp-title">{forced ? texts.forcedTitle : texts.changePasswordTitle}</h2>
    {#if forced}
      <p class="cp-message">{texts.forcedMessage}</p>
    {/if}

    {#if state === 'saved'}
      <p class="cp-success" aria-live="polite">{texts.saved}</p>
      <button type="button" class="cp-primary" on:click={() => dispatch('close')}>OK</button>
    {:else}
      <form class="cp-form" on:submit|preventDefault={submit}>
        <PasswordField
          id="cp-current"
          label={texts.currentLabel}
          autocomplete="current-password"
          disabled={state === 'saving'}
          bind:value={currentPassword}
        />
        <PasswordField
          id="cp-new"
          label={texts.newLabel}
          autocomplete="new-password"
          disabled={state === 'saving'}
          bind:value={newPassword}
        />
        <PasswordField
          id="cp-confirm"
          label={texts.confirmLabel}
          autocomplete="new-password"
          disabled={state === 'saving'}
          bind:value={confirmation}
        />
        <p class="cp-hint">{fill(policyTexts.hint, { min: minLength })}</p>

        {#if errorMessage}
          <p class="cp-error" role="alert">{errorMessage}</p>
        {/if}

        <div class="cp-actions">
          {#if !forced}
            <button
              type="button"
              class="cp-secondary"
              on:click={close}
              disabled={state === 'saving'}
            >
              {texts.cancel}
            </button>
          {/if}
          <button type="submit" class="cp-primary" disabled={state === 'saving'}>
            {state === 'saving' ? texts.submitting : texts.submit}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
  .cp-overlay {
    position: fixed;
    inset: 0;
    z-index: 10002;
    display: flex;
    justify-content: center;
    padding: max(1rem, var(--safe-top, 0px)) 1rem max(1rem, var(--safe-bottom, 0px));
    /* margin:auto + overflow : en mode forcé (pas de bouton fermer), le
       bouton Valider doit rester atteignable avec le clavier ouvert. */
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .cp-backdrop {
    position: fixed;
    inset: 0;
    border: none;
    padding: 0;
    background: rgba(20, 18, 15, 0.45);
    cursor: pointer;
  }
  .cp-backdrop-locked {
    cursor: default;
  }
  .cp-panel {
    position: relative;
    margin: auto;
    width: 100%;
    max-width: 400px;
    background: #fffefc;
    border-radius: 10px;
    padding: 1.5rem;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.25);
  }
  .cp-title {
    margin: 0 0 0.5rem;
    font-size: 1.2rem;
    color: #1a1a1a;
  }
  .cp-message {
    margin: 0 0 1rem;
    color: #555;
    font-size: 0.92rem;
    line-height: 1.4;
  }
  .cp-form {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .cp-hint {
    margin: 0;
    color: #777;
    font-size: 0.82rem;
  }
  .cp-error {
    margin: 0;
    color: #c0392b;
    font-size: 0.9rem;
  }
  .cp-success {
    color: #1f7a4d;
    font-size: 0.95rem;
    margin: 0 0 1rem;
  }
  .cp-actions {
    display: flex;
    gap: 0.6rem;
    justify-content: flex-end;
    margin-top: 0.3rem;
  }
  .cp-primary {
    padding: 0.75rem 1.4rem;
    border: none;
    border-radius: 8px;
    background: var(--mb-orange);
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }
  .cp-primary:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .cp-secondary {
    padding: 0.75rem 1.2rem;
    border: 1px solid var(--mb-border-input);
    border-radius: 8px;
    background: #fff;
    color: #444;
    cursor: pointer;
  }
</style>
