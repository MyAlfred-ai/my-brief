<script>
  /**
   * Écran de connexion — affiché en plein écran dès que la session est absente.
   *
   * Il propose les DEUX méthodes côte à côte : le formulaire email/mot de passe
   * et le bouton SSO. C'est ce qui remplace le rebond automatique vers l'IdP :
   * la connexion OIDC n'est plus déclenchée qu'à la demande explicite de
   * l'utilisateur, ce qui supprime au passage la cause des « Invalid state
   * parameter » (deux flux OIDC initiés en parallèle).
   *
   * Le bouton SSO navigue vers /login, la route protégée par le plugin Traefik
   * — l'unique déclencheur du flux OIDC, inchangé.
   */
  import { onMount } from 'svelte';
  import PasswordField from './PasswordField.svelte';
  import ForgotPasswordForm from './ForgotPasswordForm.svelte';
  import ResetPasswordForm from './ResetPasswordForm.svelte';
  import GoogleLogo from '../icons/GoogleLogo.svelte';
  import MicrosoftLogo from '../icons/MicrosoftLogo.svelte';
  import { auth, signIn } from '../../stores/auth.js';
  import { safeNext, DEFAULT_NEXT } from '../../utils/safeNext.js';
  import { uiText, currentLanguageStore } from '../../store.js';
  import { DEFAULT_MIN_LENGTH } from '../../utils/passwordPolicy.js';
  import { fill } from '../../utils/i18nFormat.js';

  export let logoUrl = '/apple-touch-icon.png';

  let view = 'signin'; // 'signin' | 'forgot' | 'reset'
  let resetToken = '';
  /**
   * Où revenir après connexion. Sert au flux mobile : `/auth/mobile/start` nous
   * envoie ici avec un `next` qui y ramène, sinon l'app native n'obtiendrait
   * jamais son jeton. Toujours passé par safeNext — c'est une redirection
   * pilotée par l'URL.
   */
  let nextPath = DEFAULT_NEXT;
  let email = '';
  let password = '';
  let state = 'idle'; // 'idle' | 'submitting'
  let errorMessage = '';

  $: texts = $uiText.signIn;
  $: policyTexts = $uiText.passwordPolicy;
  $: capabilities = $auth.capabilities;
  $: minLength = capabilities.passwordPolicy?.minLength || DEFAULT_MIN_LENGTH;

  onMount(() => {
    try {
      const params = new URLSearchParams(window.location.search);

      // Lien reçu par email : /signin?reset=<jeton>. On retire le paramètre de
      // l'URL aussitôt lu — un jeton d'un seul usage n'a rien à faire dans
      // l'historique du navigateur ni dans un en-tête Referer.
      const token = params.get('reset');
      if (token) {
        resetToken = token;
        view = 'reset';
        params.delete('reset');
      }

      // Retour d'échec du flux Google : /signin?error=<slug>. Le callback ne
      // peut pas renvoyer de JSON (c'est une navigation top-level), il passe
      // donc par l'URL.
      const failure = params.get('error');
      if (failure) {
        errorMessage = texts.errors[failure] || texts.errors.unknown;
        params.delete('error');
      }

      // Conservé dans l'URL (contrairement au jeton et à l'erreur) : un
      // rechargement de la page ne doit pas perdre la destination de retour.
      nextPath = safeNext(params.get('next'));

      if (token || failure) {
        const query = params.toString();
        window.history.replaceState(
          null,
          '',
          window.location.pathname + (query ? `?${query}` : ''),
        );
      }
    } catch (_) {
      /* ignore */
    }
  });

  async function submit() {
    state = 'submitting';
    errorMessage = '';
    const res = await signIn(email.trim(), password);
    state = 'idle';
    if (res.ok) {
      password = '';
      // Navigation dure : la destination peut être une route servie par le
      // backend (le départ du flux mobile), pas une vue du SPA.
      if (nextPath !== DEFAULT_NEXT) window.location.assign(nextPath);
      return;
    }
    const template = texts.errors[res.error] || texts.errors.unknown;
    errorMessage = fill(template, { minutes: Math.ceil((res.retryAfter || 60) / 60) });
  }

  /** SSO du plugin Traefik : /login est son unique déclencheur. */
  function startSso() {
    window.location.assign('/login');
  }

  /**
   * Fournisseurs natifs : le flux OIDC est joué par l'API. Le `next` part avec
   * la requête ; l'API le valide, le range dans l'état OAuth et l'applique au
   * retour — il ne transite jamais par l'IdP.
   */
  function startProvider(id) {
    const suffix = nextPath === DEFAULT_NEXT ? '' : `?next=${encodeURIComponent(nextPath)}`;
    window.location.assign(`/api/auth/${id}/start${suffix}`);
  }
</script>

<div class="si-overlay" role="dialog" aria-modal="true" aria-label={texts.title}>
  <div class="si-card">
    <img src={logoUrl} alt="" class="si-logo" />

    {#if view === 'forgot'}
      <ForgotPasswordForm
        {texts}
        lang={$currentLanguageStore}
        initialEmail={email}
        on:back={() => {
          view = 'signin';
        }}
      />
    {:else if view === 'reset'}
      <ResetPasswordForm
        {texts}
        {policyTexts}
        token={resetToken}
        {minLength}
        on:back={() => {
          view = 'signin';
        }}
      />
    {:else}
      <h1 class="si-title">{texts.title}</h1>
      <p class="si-subtitle">{texts.subtitle}</p>

      {#if capabilities.passwordLoginEnabled}
        <form class="si-form" on:submit|preventDefault={submit}>
          <div class="si-field">
            <label class="si-label" for="signin-email">{texts.emailLabel}</label>
            <input
              id="signin-email"
              class="si-input"
              type="email"
              autocomplete="username"
              required
              disabled={state === 'submitting'}
              bind:value={email}
            />
          </div>

          <PasswordField
            id="signin-password"
            label={texts.passwordLabel}
            autocomplete="current-password"
            disabled={state === 'submitting'}
            showLabel={texts.showPassword}
            hideLabel={texts.hidePassword}
            bind:value={password}
          />

          {#if errorMessage}
            <p class="si-error" role="alert">{errorMessage}</p>
          {/if}

          <button type="submit" class="si-submit" disabled={state === 'submitting'}>
            {state === 'submitting' ? texts.submitting : texts.submit}
          </button>
        </form>

        {#if capabilities.passwordResetEnabled}
          <button
            type="button"
            class="si-link"
            on:click={() => {
              view = 'forgot';
            }}
          >
            {texts.forgot}
          </button>
        {/if}
      {/if}

      {#if capabilities.googleEnabled || capabilities.entraEnabled || capabilities.oidcEnabled}
        {#if capabilities.passwordLoginEnabled}
          <div class="si-divider"><span>{texts.ssoDivider}</span></div>
        {/if}

        {#if capabilities.googleEnabled}
          <button type="button" class="si-sso si-provider" on:click={() => startProvider('google')}>
            <!-- Logos partagés avec le panneau d'administration : même image des
                 deux côtés, aucune requête réseau. -->
            <GoogleLogo size={18} />
            {texts.googleButton}
          </button>
        {/if}

        {#if capabilities.entraEnabled}
          <button type="button" class="si-sso si-provider" on:click={() => startProvider('entra')}>
            <MicrosoftLogo size={18} />
            {texts.entraButton}
          </button>
        {/if}

        <!-- SSO du plugin Traefik. Volontairement SANS logo : selon
             l'installation il peut porter Entra ou un autre annuaire, afficher
             une marque précise serait faux. Disparaît une fois toutes les
             installations basculées en natif. -->
        {#if capabilities.oidcEnabled}
          <button type="button" class="si-sso" on:click={startSso}>
            {texts.ssoButton}
          </button>
        {/if}
      {/if}
    {/if}
  </div>
</div>

<style>
  .si-overlay {
    position: fixed;
    inset: 0;
    /* Au-dessus de la porte de connexion native (10000) : les deux ne
       coexistent jamais, mais l'ordre reste déterministe. */
    z-index: 10001;
    display: flex;
    justify-content: center;
    overflow-y: auto;
    background: #fffefc;
    padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0)
      env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
  }
  .si-card {
    /* margin:auto (et non align-items:center) : carte plus haute que
       l'écran + clavier ouvert = haut de carte scrollable, pas coupé. */
    margin: auto;
    width: 100%;
    max-width: 360px;
    padding: 2rem 1.5rem;
    text-align: center;
  }
  .si-logo {
    width: 96px;
    height: 96px;
    border-radius: 12px;
    margin-bottom: 1.25rem;
  }

  /* Les vues « mot de passe oublié » et « réinitialisation » sont des
     composants séparés : leurs classes doivent traverser le scope de Svelte,
     mais restent confinées à cette carte. */
  .si-card :global(.si-title) {
    font-size: 1.4rem;
    margin: 0 0 0.5rem;
    color: #1a1a1a;
  }
  .si-card :global(.si-subtitle) {
    color: #555;
    margin: 0 0 1.5rem;
    line-height: 1.4;
    font-size: 0.95rem;
  }
  .si-card :global(.si-form) {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    text-align: left;
  }
  .si-card :global(.si-field) {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .si-card :global(.si-label) {
    font-size: 0.85rem;
    font-weight: 600;
    color: #444;
  }
  .si-card :global(.si-input) {
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--mb-border-input);
    border-radius: 8px;
    font-size: 1rem;
    background: #fff;
    color: #1a1a1a;
    width: 100%;
    box-sizing: border-box;
  }
  .si-card :global(.si-input:focus) {
    outline: none;
    border-color: var(--mb-orange);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.18);
  }
  .si-card :global(.si-submit) {
    margin-top: 0.4rem;
    padding: 0.9rem 1.5rem;
    border: none;
    border-radius: 8px;
    background: var(--mb-orange);
    color: #fff;
    font-size: 1.05rem;
    font-weight: 600;
    cursor: pointer;
  }
  .si-card :global(.si-submit:disabled) {
    opacity: 0.6;
    cursor: default;
  }
  .si-card :global(.si-error) {
    color: #c0392b;
    font-size: 0.9rem;
    margin: 0;
  }
  .si-card :global(.si-hint) {
    color: #777;
    font-size: 0.82rem;
    margin: 0;
  }
  .si-card :global(.si-link) {
    margin-top: 1rem;
    background: none;
    border: none;
    color: #888;
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .si-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1.5rem 0 1rem;
    color: #aaa;
    font-size: 0.85rem;
  }
  .si-divider::before,
  .si-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--mb-border-default);
  }
  .si-sso {
    width: 100%;
    padding: 0.85rem 1.5rem;
    border: 1px solid var(--mb-border-input);
    border-radius: 8px;
    background: #fff;
    color: #1a1a1a;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
  }
  .si-sso + .si-sso {
    margin-top: 0.6rem;
  }
  .si-sso:active {
    filter: brightness(0.97);
  }
  .si-provider {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
  }
</style>
