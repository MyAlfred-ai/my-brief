<script>
  /**
   * Demande d'un lien de réinitialisation. Rendu par SignInScreen, qui porte le
   * layout ; ce composant ne s'occupe que du formulaire et de son état.
   */
  import { createEventDispatcher } from 'svelte';
  import { forgotPassword } from '../../services/authApi.js';

  export let texts; // $uiText.signIn
  export let lang = 'fr';
  export let initialEmail = '';

  const dispatch = createEventDispatcher();

  let email = initialEmail;
  let state = 'idle'; // 'idle' | 'submitting' | 'sent' | 'error'
  let errorMessage = '';

  async function submit() {
    state = 'submitting';
    errorMessage = '';
    const res = await forgotPassword(email.trim(), lang);
    if (res.ok) {
      // Réponse volontairement identique que le compte existe ou non : le
      // serveur répond 202 dans les deux cas pour ne pas permettre d'énumérer
      // les adresses. Le message affiché reflète cette ambiguïté.
      state = 'sent';
      return;
    }
    state = 'error';
    errorMessage = texts.errors[res.data.error] || texts.errors.unknown;
  }
</script>

<h1 class="si-title">{texts.forgotTitle}</h1>

{#if state === 'sent'}
  <p class="si-subtitle" aria-live="polite">{texts.forgotSent}</p>
{:else}
  <p class="si-subtitle">{texts.forgotMessage}</p>

  <form class="si-form" on:submit|preventDefault={submit}>
    <div class="si-field">
      <label class="si-label" for="forgot-email">{texts.emailLabel}</label>
      <input
        id="forgot-email"
        class="si-input"
        type="email"
        autocomplete="username"
        required
        disabled={state === 'submitting'}
        bind:value={email}
      />
    </div>

    {#if errorMessage}
      <p class="si-error" role="alert">{errorMessage}</p>
    {/if}

    <button type="submit" class="si-submit" disabled={state === 'submitting'}>
      {state === 'submitting' ? texts.submitting : texts.forgotSubmit}
    </button>
  </form>
{/if}

<button type="button" class="si-link" on:click={() => dispatch('back')}>
  {texts.backToSignIn}
</button>
