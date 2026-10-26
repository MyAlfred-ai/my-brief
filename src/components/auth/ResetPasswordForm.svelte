<script>
  /**
   * Choix d'un nouveau mot de passe depuis le lien reçu par email
   * (/signin?reset=<jeton>). Le jeton est à usage unique côté serveur.
   */
  import { createEventDispatcher } from 'svelte';
  import PasswordField from './PasswordField.svelte';
  import { resetPassword } from '../../services/authApi.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { checkPassword, DEFAULT_MIN_LENGTH } from '../../utils/passwordPolicy.js';

  export let texts; // $uiText.signIn
  export let policyTexts; // $uiText.passwordPolicy
  export let token = '';
  export let minLength = DEFAULT_MIN_LENGTH;

  const dispatch = createEventDispatcher();

  let password = '';
  let confirmation = '';
  let state = 'idle'; // 'idle' | 'submitting' | 'done' | 'error'
  let errorMessage = '';

  async function submit() {
    errorMessage = '';
    const policy = checkPassword(password, { minLength });
    if (!policy.ok) {
      errorMessage = fill(policyTexts[policy.reason] || policyTexts.required, { min: minLength });
      return;
    }
    if (password !== confirmation) {
      errorMessage = policyTexts.mismatch;
      return;
    }

    state = 'submitting';
    const res = await resetPassword(token, password);
    if (res.ok) {
      state = 'done';
      return;
    }
    state = 'error';
    errorMessage = res.data.reason
      ? fill(policyTexts[res.data.reason] || texts.errors.unknown, { min: minLength })
      : texts.errors[res.data.error] || texts.errors.unknown;
  }
</script>

<h1 class="si-title">{texts.resetTitle}</h1>

{#if state === 'done'}
  <p class="si-subtitle" aria-live="polite">{texts.resetDone}</p>
{:else}
  <form class="si-form" on:submit|preventDefault={submit}>
    <PasswordField
      id="reset-password"
      label={texts.passwordLabel}
      autocomplete="new-password"
      disabled={state === 'submitting'}
      showLabel={texts.showPassword}
      hideLabel={texts.hidePassword}
      bind:value={password}
    />
    <PasswordField
      id="reset-password-confirm"
      label={texts.passwordLabel}
      autocomplete="new-password"
      disabled={state === 'submitting'}
      showLabel={texts.showPassword}
      hideLabel={texts.hidePassword}
      bind:value={confirmation}
    />
    <p class="si-hint">{fill(policyTexts.hint, { min: minLength })}</p>

    {#if errorMessage}
      <p class="si-error" role="alert">{errorMessage}</p>
    {/if}

    <button type="submit" class="si-submit" disabled={state === 'submitting'}>
      {state === 'submitting' ? texts.submitting : texts.resetSubmit}
    </button>
  </form>
{/if}

<button type="button" class="si-link" on:click={() => dispatch('back')}>
  {texts.backToSignIn}
</button>
