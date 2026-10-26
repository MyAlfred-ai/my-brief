<script>
  /**
   * Onglet « Authentification » du panneau d'administration : fournisseurs
   * d'identité et domaines autorisés. (« Connexion », dans « Ma configuration »,
   * désigne tout autre chose : le compte Google/Microsoft relié par un
   * utilisateur pour le mail et le dépôt — d'où ce nom-ci.)
   *
   * Deux fournisseurs natifs, joués par l'API (cf. services/api/lib/auth/providers.js) :
   *   - Google — identifiants créés dans Google Cloud Console, saisis ici ;
   *   - Entra ID — identifiants de l'app registration du client, amorcés depuis
   *     l'environnement du déploiement. `clientId` et annuaire sont affichés en
   *     lecture seule (ils viennent du serveur), mais le secret reste saisissable :
   *     un secret d'app registration expire, et le remplacer ne demande aucun
   *     accès à l'administration Entra.
   *
   * Un clientSecret n'est JAMAIS reçu de l'API — les champs restent vides et ne
   * sont envoyés que si l'administrateur en saisit un nouveau. Laisser vide
   * conserve le secret déjà enregistré.
   */
  import { onMount } from 'svelte';
  import IconGlobe from '~icons/solar/global-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconCopy from '~icons/solar/copy-linear';
  import IconLogin from '~icons/solar/login-2-linear';
  import IconPassword from '~icons/solar/password-linear';
  import IconShield from '~icons/solar/shield-keyhole-linear';
  import DomainList from './DomainList.svelte';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import GoogleLogo from '../icons/GoogleLogo.svelte';
  import MicrosoftLogo from '../icons/MicrosoftLogo.svelte';
  import { fetchAuthSettings, saveAuthSettings } from '../../services/adminUsersApi.js';
  import { auth, refreshCapabilities } from '../../stores/auth.js';
  import { refreshConfigChecks } from '../../stores/configChecks.js';
  import { uiText } from '../../store.js';
  import { withDomain } from '../../utils/allowedDomains.js';

  let googleEnabled = false;
  let clientId = '';
  let clientSecret = '';
  let hasSecret = false;
  let entra = { enabled: false, clientId: '', hasSecret: false, discoveryUrl: '' };
  let entraSecret = '';
  // Modes sans fournisseur natif (carte « Page de connexion ») : `enabled` est
  // le réglage, `envEnabled` le drapeau du déploiement — le serveur n'affiche
  // le mode que si les DEUX sont vrais (cf. routes/auth/session.js).
  let passwordLogin = { enabled: true, envEnabled: true };
  let legacySso = { enabled: true, envEnabled: false };
  let allowedDomains = [];
  // Domaine tapé dans la carte « Domaines autorisés », pas encore ajouté.
  let domainDraft = '';
  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  let errorMessage = '';
  let redirectCopied = false;
  let mailRedirectCopied = false;
  let entraRedirectCopied = false;

  $: texts = $uiText.adminAuth;
  $: userTexts = $uiText.adminUsers;
  // Libellés RÉELS des boutons de l'écran de connexion : l'aperçu nomme chaque
  // mode exactement comme la page le montre, aucun doublon à faire diverger.
  $: signInTexts = $uiText.signIn;
  $: redirectUri = `${window.location.origin}/api/auth/google/callback`;
  // Deuxième URI du MÊME client OAuth : celle de la connexion d'un compte
  // Google (envoi de mail, dépôt sur Drive — cf. services/api/routes/connect.js).
  // Le chemin dit « mail » pour raisons historiques : il est déjà déclaré dans
  // les consoles Google Cloud existantes et ne peut pas changer sans les casser.
  // À déclarer aussi, sinon redirect_uri_mismatch au premier essai.
  $: mailRedirectUri = `${window.location.origin}/api/mail/google/callback`;
  // URI HÉRITÉE de l'app registration : l'API l'a reprise telle quelle parce
  // qu'on ne peut pas en déclarer une autre. Elle sert AUSSI au retour de
  // connexion d'un compte Microsoft (le même client, d'autres scopes).
  // Affichée pour vérification, jamais pour édition.
  $: entraRedirectUri = `${window.location.origin}/oauth2/callback`;
  // Activer un fournisseur sans identifiants complets produirait un bouton qui
  // échoue : le serveur refuserait le démarrage du flux.
  $: missingCredentials =
    googleEnabled && (!clientId.trim() || (!hasSecret && !clientSecret.trim()));
  $: entraIncomplete =
    entra.enabled &&
    (!entra.clientId || (!entra.hasSecret && !entraSecret.trim()) || !entra.discoveryUrl);
  // État réel côté serveur, pas la case à cocher : le badge ne doit pas annoncer
  // « Actif » sur une configuration incomplète ou pas encore enregistrée.
  $: googleLive = $auth.capabilities.googleEnabled;
  $: entraLive = $auth.capabilities.entraEnabled;
  // Plugin Traefik historique, encore monté le temps de la bascule.
  $: legacyPluginLive = $auth.capabilities.oidcEnabled;
  $: passwordLive = $auth.capabilities.passwordLoginEnabled;
  $: entraConfigured = !!(entra.clientId || entra.hasSecret);
  // Ce que l'écran de connexion afficherait si on enregistrait MAINTENANT —
  // même règle que la garde du serveur, pour prévenir avant le refus.
  $: googleReady = googleEnabled && !missingCredentials;
  $: entraReady = entra.enabled && !entraIncomplete;
  $: noModeLeft =
    !(passwordLogin.enabled && passwordLogin.envEnabled) &&
    !(legacySso.enabled && legacySso.envEnabled) &&
    !googleReady &&
    !entraReady;

  onMount(load);

  async function load() {
    loading = true;
    errorMessage = '';
    const res = await fetchAuthSettings();
    loading = false;
    if (!res.ok) {
      errorMessage = userTexts.errors[res.data.error] || userTexts.errors.unknown;
      return;
    }
    apply(res.data.settings);
  }

  /** Réglages reçus du serveur → état local. Un seul endroit à relire. */
  function apply(s) {
    googleEnabled = s.google.enabled;
    clientId = s.google.clientId;
    hasSecret = s.google.hasSecret;
    entra = { ...entra, ...(s.entra || {}) };
    passwordLogin = { ...passwordLogin, ...(s.passwordLogin || {}) };
    legacySso = { ...legacySso, ...(s.legacySso || {}) };
    allowedDomains = s.allowedDomains;
    clientSecret = '';
    entraSecret = '';
  }

  async function save() {
    if (missingCredentials || entraIncomplete || noModeLeft) return;
    // Un domaine tapé sans cliquer « Ajouter » part avec l'enregistrement.
    // Oublié, l'écran annonçait « Enregistré » et chaque première connexion
    // Google ou Microsoft de ce domaine était ensuite refusée.
    const pending = withDomain(allowedDomains, domainDraft);
    if (pending) {
      allowedDomains = pending;
      domainDraft = '';
    }
    saveState = 'saving';
    errorMessage = '';
    const res = await saveAuthSettings({
      google: {
        enabled: googleEnabled,
        clientId: clientId.trim(),
        // Omis quand vide : le serveur conserve alors le secret existant.
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
      },
      // clientId et discoveryUrl ne sont pas renvoyés : ils viennent du
      // déploiement, l'interface ne fait que les afficher.
      entra: {
        enabled: entra.enabled,
        ...(entraSecret.trim() ? { clientSecret: entraSecret.trim() } : {}),
      },
      passwordLogin: { enabled: passwordLogin.enabled },
      legacySso: { enabled: legacySso.enabled },
      allowedDomains,
    });
    if (!res.ok) {
      saveState = 'idle';
      errorMessage = userTexts.errors[res.data.error] || userTexts.errors.unknown;
      return;
    }
    apply(res.data.settings);
    saveState = 'saved';
    // Le badge « Actif » lit les capacités du serveur : sans ce rafraîchissement
    // il resterait figé sur l'état d'avant l'enregistrement.
    refreshCapabilities();
    // Les pastilles de configuration disent peut-être autre chose, maintenant.
    refreshConfigChecks();
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
  }

  async function copyUri(value, fieldId, mark) {
    try {
      await navigator.clipboard.writeText(value);
      mark(true);
      setTimeout(() => mark(false), 2000);
    } catch (_) {
      // Presse-papiers refusé (contexte non sécurisé, permission bloquée) : on
      // sélectionne l'URI pour que le Ctrl+C manuel reste à un geste.
      document.getElementById(fieldId)?.select();
    }
  }

  const copyRedirect = () =>
    copyUri(redirectUri, 'at-redirect', (v) => {
      redirectCopied = v;
    });
  const copyMailRedirect = () =>
    copyUri(mailRedirectUri, 'at-redirect-mail', (v) => {
      mailRedirectCopied = v;
    });
  const copyEntraRedirect = () =>
    copyUri(entraRedirectUri, 'at-entra-redirect', (v) => {
      entraRedirectCopied = v;
    });

  /**
   * Test RÉEL d'un mode : le vrai flux de connexion, dans un nouvel onglet —
   * exactement ce que vivra un utilisateur (découverte, secret, URI de
   * redirection). Un simulacre côté serveur ne prouverait ni le secret ni
   * l'URI. Effet assumé, annoncé sous la carte : terminer le flux avec un
   * autre compte bascule la session dessus.
   */
  function testMode(url) {
    window.open(url, '_blank', 'noopener');
  }
</script>

<div class="at-wrap">
  {#if loading}
    <div class="at-skeleton" aria-hidden="true">
      <div class="at-skeleton-card"></div>
      <div class="at-skeleton-card"></div>
    </div>
  {:else}
    {#if errorMessage}
      <div class="at-error" role="alert">{errorMessage}</div>
    {/if}

    <p class="at-intro">{texts.intro}</p>

    <!-- ── Page de connexion : les modes tels qu'affichés aux utilisateurs ──
         Les badges lisent les capacités du SERVEUR (/api/auth/config), la même
         source que l'écran de connexion : ce que dit cette carte est ce que
         voit un utilisateur — pas l'état du formulaire en cours d'édition. -->
    <SettingsCard
      title={texts.loginModesTitle}
      hint={texts.loginModesIntro}
      icon={IconLogin}
      on={passwordLive || googleLive || entraLive || legacyPluginLive}
    >
      <ul class="at-modes">
        <li class="at-mode">
          <span class="at-mode-icon"
            ><IconPassword width="16" height="16" aria-hidden="true" /></span
          >
          <span class="at-mode-name">{texts.modePassword}</span>
          <span class="at-mode-controls">
            <StatusBadge
              tone={passwordLive ? 'ok' : 'neutral'}
              text={passwordLive ? texts.modeShown : texts.modeHidden}
            />
            <span class="at-switch">
              <span class="at-switch-label" aria-hidden="true">{texts.modeToggle}</span>
              <ToggleSwitch
                bind:checked={passwordLogin.enabled}
                disabled={!passwordLogin.envEnabled}
                label={texts.modePassword}
              />
            </span>
          </span>
        </li>

        <li class="at-mode">
          <span class="at-mode-icon"><GoogleLogo size={16} /></span>
          <span class="at-mode-name">{signInTexts.googleButton}</span>
          <span class="at-mode-controls">
            <StatusBadge
              tone={googleLive ? 'ok' : 'neutral'}
              text={googleLive ? texts.modeShown : texts.modeHidden}
            />
            <button
              type="button"
              class="at-test"
              disabled={!googleLive}
              on:click={() => testMode('/api/auth/google/start')}
            >
              {texts.modeTest}
            </button>
          </span>
        </li>

        <li class="at-mode">
          <span class="at-mode-icon"><MicrosoftLogo size={16} /></span>
          <span class="at-mode-name">{signInTexts.entraButton}</span>
          <span class="at-mode-controls">
            <StatusBadge
              tone={entraLive ? 'ok' : 'neutral'}
              text={entraLive ? texts.modeShown : texts.modeHidden}
            />
            <button
              type="button"
              class="at-test"
              disabled={!entraLive}
              on:click={() => testMode('/api/auth/entra/start')}
            >
              {texts.modeTest}
            </button>
          </span>
        </li>

        <!-- SSO du plugin Traefik : proposé seulement là où le déploiement le
             déclare (OIDC_ENABLED) — ailleurs, la ligne n'existe pas. -->
        {#if legacySso.envEnabled}
          <li class="at-mode">
            <span class="at-mode-icon"
              ><IconShield width="16" height="16" aria-hidden="true" /></span
            >
            <span class="at-mode-name">{texts.modeLegacy}</span>
            <span class="at-mode-controls">
              <StatusBadge
                tone={legacyPluginLive ? 'ok' : 'neutral'}
                text={legacyPluginLive ? texts.modeShown : texts.modeHidden}
              />
              <button
                type="button"
                class="at-test"
                disabled={!legacyPluginLive}
                on:click={() => testMode('/login')}
              >
                {texts.modeTest}
              </button>
              <span class="at-switch">
                <span class="at-switch-label" aria-hidden="true">{texts.modeToggle}</span>
                <ToggleSwitch bind:checked={legacySso.enabled} label={texts.modeLegacy} />
              </span>
            </span>
          </li>
        {/if}
      </ul>

      {#if !passwordLogin.envEnabled}
        <p class="at-hint">{texts.modePasswordEnvOff}</p>
      {/if}
      {#if legacySso.envEnabled}
        <p class="at-hint">{texts.modeLegacyHint}</p>
      {/if}
      <p class="at-hint">{texts.modeProviderHint} {texts.modeTestHint}</p>

      {#if noModeLeft}
        <p class="at-warn" role="alert">{texts.noModeLeft}</p>
      {/if}
    </SettingsCard>

    <h3 class="at-group-title">{texts.providersTitle}</h3>

    <!-- ── Google (modifiable) ───────────────────────────────────────────── -->
    <SettingsCard title={texts.googleTitle} hint={texts.googleIntro} on={googleLive}>
      <GoogleLogo slot="icon" size={22} />
      <svelte:fragment slot="badge">
        <StatusBadge
          tone={googleLive ? 'ok' : 'neutral'}
          text={googleLive ? texts.statusOn : texts.statusOff}
        />
        <span class="at-switch">
          <span class="at-switch-label" aria-hidden="true">{texts.googleEnable}</span>
          <ToggleSwitch bind:checked={googleEnabled} label={texts.googleTitle} />
        </span>
      </svelte:fragment>

      <div class="at-fields">
        <div class="at-field">
          <label class="at-label" for="at-client-id">{texts.clientId}</label>
          <input
            id="at-client-id"
            class="at-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            bind:value={clientId}
          />
        </div>

        <div class="at-field">
          <label class="at-label" for="at-client-secret">{texts.clientSecret}</label>
          <input
            id="at-client-secret"
            class="at-input"
            type="password"
            autocomplete="new-password"
            placeholder={hasSecret ? texts.secretSet : texts.secretEmpty}
            bind:value={clientSecret}
          />
          <p class="at-hint">{hasSecret ? texts.secretKeepHint : texts.secretRequiredHint}</p>
        </div>

        <div class="at-field">
          <label class="at-label" for="at-redirect">{texts.redirectUri}</label>
          <div class="at-redirect">
            <input
              id="at-redirect"
              class="at-input at-input-readonly"
              type="text"
              readonly
              value={redirectUri}
            />
            <button
              type="button"
              class="at-copy"
              class:at-copy-done={redirectCopied}
              on:click={copyRedirect}
            >
              {#if redirectCopied}<IconCheck
                  width="14"
                  height="14"
                  aria-hidden="true"
                />{:else}<IconCopy width="14" height="14" aria-hidden="true" />{/if}
              {redirectCopied ? userTexts.copied : userTexts.copy}
            </button>
          </div>
          <p class="at-hint">{texts.redirectHint}</p>
        </div>

        <div class="at-field">
          <label class="at-label" for="at-redirect-mail">{texts.redirectUriMail}</label>
          <div class="at-redirect">
            <input
              id="at-redirect-mail"
              class="at-input at-input-readonly"
              type="text"
              readonly
              value={mailRedirectUri}
            />
            <button
              type="button"
              class="at-copy"
              class:at-copy-done={mailRedirectCopied}
              on:click={copyMailRedirect}
            >
              {#if mailRedirectCopied}<IconCheck
                  width="14"
                  height="14"
                  aria-hidden="true"
                />{:else}<IconCopy width="14" height="14" aria-hidden="true" />{/if}
              {mailRedirectCopied ? userTexts.copied : userTexts.copy}
            </button>
          </div>
          <p class="at-hint">{texts.redirectMailHint}</p>
        </div>
      </div>

      {#if missingCredentials}
        <p class="at-warn" role="alert">{texts.credentialsRequired}</p>
      {/if}
    </SettingsCard>

    <!-- ── Entra ID ──────────────────────────────────────────────────────── -->
    <SettingsCard title={texts.entraTitle} hint={texts.entraIntro} on={entraLive}>
      <MicrosoftLogo slot="icon" size={22} />
      <svelte:fragment slot="badge">
        <StatusBadge
          tone={entraLive ? 'ok' : 'neutral'}
          text={entraLive ? texts.statusOn : texts.statusOff}
        />
        {#if entraConfigured}
          <span class="at-switch">
            <span class="at-switch-label" aria-hidden="true">{texts.googleEnable}</span>
            <ToggleSwitch bind:checked={entra.enabled} label={texts.entraTitle} />
          </span>
        {/if}
      </svelte:fragment>

      {#if !entraConfigured}
        <p class="at-note">{texts.entraDisabledHint}</p>
      {:else}
        <div class="at-fields">
          <div class="at-field">
            <span class="at-label">{texts.clientId}</span>
            <input class="at-input at-input-readonly" type="text" readonly value={entra.clientId} />
          </div>

          <div class="at-field">
            <span class="at-label">{texts.entraDiscovery}</span>
            <input
              class="at-input at-input-readonly"
              type="text"
              readonly
              value={entra.discoveryUrl}
            />
            <p class="at-hint">{texts.entraFromEnv}</p>
          </div>

          <div class="at-field">
            <label class="at-label" for="at-entra-secret">{texts.clientSecret}</label>
            <input
              id="at-entra-secret"
              class="at-input"
              type="password"
              autocomplete="new-password"
              placeholder={entra.hasSecret ? texts.secretSet : texts.secretEmpty}
              bind:value={entraSecret}
            />
            <p class="at-hint">
              {entra.hasSecret ? texts.secretKeepHint : texts.secretRequiredHint}
            </p>
          </div>

          <div class="at-field">
            <label class="at-label" for="at-entra-redirect">{texts.redirectUri}</label>
            <div class="at-redirect">
              <input
                id="at-entra-redirect"
                class="at-input at-input-readonly"
                type="text"
                readonly
                value={entraRedirectUri}
              />
              <button
                type="button"
                class="at-copy"
                class:at-copy-done={entraRedirectCopied}
                on:click={copyEntraRedirect}
              >
                {#if entraRedirectCopied}<IconCheck
                    width="14"
                    height="14"
                    aria-hidden="true"
                  />{:else}<IconCopy width="14" height="14" aria-hidden="true" />{/if}
                {entraRedirectCopied ? userTexts.copied : userTexts.copy}
              </button>
            </div>
            <p class="at-note">{texts.entraRedirectLocked}</p>
            <p class="at-note">{texts.graphPermissionsHint}</p>
          </div>
        </div>

        {#if entraIncomplete}
          <p class="at-warn" role="alert">{texts.credentialsRequired}</p>
        {/if}
      {/if}

      {#if legacyPluginLive}
        <p class="at-hint">{texts.entraLegacyPlugin}</p>
      {/if}
    </SettingsCard>

    <!-- ── Domaines ──────────────────────────────────────────────────────── -->
    <SettingsCard title={texts.domainsTitle} hint={texts.domainsIntro} icon={IconGlobe}>
      <DomainList
        domains={allowedDomains}
        bind:draft={domainDraft}
        {texts}
        disabled={saveState === 'saving'}
        on:change={(e) => {
          allowedDomains = e.detail;
        }}
      />
    </SettingsCard>

    <div class="at-actions">
      {#if saveState === 'saved'}
        <span class="at-saved"
          ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.saved}</span
        >
      {/if}
      <button
        type="button"
        class="at-save"
        on:click={save}
        disabled={saveState === 'saving' || missingCredentials || entraIncomplete || noModeLeft}
      >
        {saveState === 'saving' ? userTexts.saving : userTexts.save}
      </button>
    </div>
  {/if}
</div>

<style>
  .at-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .at-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .at-group-title {
    margin: 0.4rem 0 -0.2rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-faint);
  }

  /* ── Carte « Page de connexion » : une ligne par mode ── */
  .at-modes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .at-mode {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.6rem;
    padding: 0.55rem 0;
    border-top: 1px solid color-mix(in srgb, var(--brand-secondary) 5.2%, #ebebeb);
  }
  .at-mode:first-child {
    border-top: none;
    padding-top: 0;
  }
  .at-mode-icon {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: #fff;
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
  }
  .at-mode-name {
    flex: 1 1 160px;
    min-width: 0;
    font-size: 0.92rem;
    font-weight: 500;
    color: var(--ink);
  }
  .at-mode-controls {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex: 0 0 auto;
    margin-left: auto;
  }
  /* Même famille que .at-copy, en plus compact : une action secondaire. */
  .at-test {
    padding: 0.35rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--ink-soft);
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
    font-size: 0.82rem;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .at-test:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .at-test:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* Anatomie des cartes : SettingsCard (ui/) ; pastilles : StatusBadge ;
     interrupteur : ToggleSwitch — son intitulé visible est porté ici. */
  .at-switch {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    align-self: center;
    font-size: 0.82rem;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .at-switch-label {
    font-weight: 500;
  }

  /* ── Champs ── */
  .at-fields {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  .at-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .at-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .at-input {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.92rem;
    background: #fff;
    color: #1a1a1a;
    width: 100%;
    box-sizing: border-box;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .at-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .at-input-readonly {
    background: color-mix(in srgb, var(--brand-secondary) 2.1%, #f6f6f6);
    color: #666;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
  }
  .at-redirect {
    display: flex;
    gap: 0.5rem;
  }
  .at-copy {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--ink-soft);
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
    font-size: 0.88rem;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s;
  }
  .at-copy:hover {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .at-copy-done {
    background: oklch(96% 0.06 155);
    border-color: oklch(80% 0.12 155);
    color: oklch(38% 0.13 155);
  }

  .at-hint {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .at-note {
    margin: 0;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #fff;
    border: 1px dashed color-mix(in srgb, var(--brand-secondary) 8.6%, #e3e3e3);
    font-size: 0.8rem;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    line-height: 1.5;
  }
  .at-warn {
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 0.85rem;
  }
  .at-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
  }

  /* ── Squelette de chargement ── */
  .at-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .at-skeleton-card {
    height: 120px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: at-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes at-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .at-skeleton-card {
      animation: none;
    }
  }

  /* ── Barre d'action collante ──
     Elle déborde sur le padding de `.ap-body` (22px, 16px en mobile) : sans ce
     bleed, le contenu défilerait dans la marge sous la barre et resterait
     visible sous le bouton. */
  .at-actions {
    position: sticky;
    bottom: -22px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    border-top: 1px solid var(--line);
    margin: 0 -22px -22px;
    padding: 0.85rem 22px 22px;
    background: #fff;
  }
  .at-saved {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: oklch(48% 0.12 150);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .at-save {
    padding: 0.6rem 1.3rem;
    border: none;
    border-radius: 8px;
    background: var(--brand);
    color: #fff;
    font-weight: 600;
    font-family: inherit;
    font-size: 0.92rem;
    cursor: pointer;
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.45);
    transition:
      background 0.15s,
      box-shadow 0.15s,
      transform 0.1s;
  }
  .at-save:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .at-save:active:not(:disabled) {
    transform: scale(0.97);
  }
  .at-save:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    .at-redirect {
      flex-direction: column;
    }
    .at-copy {
      width: 100%;
    }
    /* `.ap-body` retombe à 14px/16px de padding sur mobile. */
    .at-actions {
      bottom: -14px;
      margin: 0 -16px -14px;
      padding: 0.85rem 16px 14px;
    }
  }
</style>
