<script>
  /**
   * Porte de connexion de l'app native (Capacitor).
   * Affichée quand aucun jeton mobile n'est présent ou après un 401.
   * Le login réel se déroule dans le navigateur système ; le retour arrive
   * par deep link mybrief://auth/callback (géré dans App.svelte).
   */
  import { login } from '../platform/auth.js';

  export let uiText; // dictionnaire réactif ($uiText.nativeLogin)
  export let logoUrl;
  export let errorMessage = '';

  let waiting = false;

  async function startLogin() {
    errorMessage = '';
    waiting = true;
    try {
      await login();
    } catch (e) {
      console.error('[auth-native] ouverture du navigateur impossible:', e);
      waiting = false;
      errorMessage = uiText.nativeLogin.error;
    }
  }

  function cancelWaiting() {
    waiting = false;
  }
</script>

<div
  class="native-login-gate"
  role="dialog"
  aria-modal="true"
  aria-label={uiText.nativeLogin.title}
>
  <div class="native-login-card">
    <img src={logoUrl} alt="" class="native-login-logo" />
    <h1>{uiText.nativeLogin.title}</h1>
    <p>{uiText.nativeLogin.message}</p>

    {#if waiting}
      <p class="native-login-waiting" aria-live="polite">{uiText.nativeLogin.waiting}</p>
      <button type="button" class="native-login-cancel" on:click={cancelWaiting}>
        {uiText.nativeLogin.cancel}
      </button>
    {:else}
      <button type="button" class="native-login-btn" on:click={startLogin}>
        {uiText.nativeLogin.button}
      </button>
    {/if}

    {#if errorMessage}
      <p class="native-login-error" role="alert">{errorMessage}</p>
    {/if}
  </div>
</div>

<style>
  .native-login-gate {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fffefc;
    padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0)
      env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
  }
  .native-login-card {
    text-align: center;
    padding: 2rem 1.5rem;
    max-width: 320px;
  }
  .native-login-logo {
    width: 115px;
    height: 115px;
    border-radius: 12px;
    margin-bottom: 1.25rem;
  }
  h1 {
    font-size: 1.4rem;
    margin: 0 0 0.5rem;
    color: #1a1a1a;
  }
  p {
    color: #555;
    margin: 0 0 1.5rem;
    line-height: 1.4;
  }
  .native-login-btn {
    width: 100%;
    padding: 0.95rem 1.5rem;
    border: none;
    border-radius: 8px;
    background: var(--mb-orange);
    color: #fff;
    font-size: 1.05rem;
    font-weight: 600;
    cursor: pointer;
  }
  .native-login-btn:active {
    filter: brightness(0.92);
  }
  .native-login-waiting {
    color: var(--mb-orange);
    font-weight: 500;
    margin-bottom: 0.75rem;
  }
  .native-login-cancel {
    background: none;
    border: none;
    color: #888;
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.95rem;
  }
  .native-login-error {
    color: #c0392b;
    margin-top: 1rem;
    font-size: 0.95rem;
  }
</style>
