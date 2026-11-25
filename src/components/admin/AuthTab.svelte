<script>
  /**
   * Onglet « Authentification » du panneau d'administration : fournisseurs
   * d'identité et domaines autorisés. (« Connexion », dans « Réglages »,
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
   *
   * TABLEAU DE BORD REPLIÉ (2026-10-28), comme l'onglet IA : la carte « Page de
   * connexion » porte une pastille par mode — point vert quand le serveur
   * l'affiche —, et un clic déplie TOUT ce qui le concerne (interrupteur,
   * identifiants, URI de redirection, « Tester ») ; un seul à la fois. Avant,
   * Google et Microsoft avaient deux lignes chacun, l'une dans « Page de
   * connexion », l'autre dans leur carte de fournisseur. Ce qui empêche
   * d'enregistrer reste écrit sous les pastilles, quel que soit le mode
   * ouvert ; un mode activé que le serveur ne sert pas s'ouvre de lui-même.
   */
  import { onMount } from 'svelte';
  import IconGlobe from '~icons/solar/global-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconCopy from '~icons/solar/copy-linear';
  import IconLogin from '~icons/solar/login-2-linear';
  import IconPassword from '~icons/solar/password-linear';
  import IconShield from '~icons/solar/shield-keyhole-linear';
  import DomainList from './DomainList.svelte';
  import LoginModePanel from './LoginModePanel.svelte';
  import DashCard from '../ui/DashCard.svelte';
  import DashPill from '../ui/DashPill.svelte';
  import GoogleLogo from '../icons/GoogleLogo.svelte';
  import MicrosoftLogo from '../icons/MicrosoftLogo.svelte';
  import { fetchAuthSettings, saveAuthSettings } from '../../services/adminUsersApi.js';
  import { auth, refreshCapabilities } from '../../stores/auth.js';
  import { refreshConfigChecks } from '../../stores/configChecks.js';
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { withDomain } from '../../utils/allowedDomains.js';

  let googleEnabled = false;
  let clientId = '';
  let clientSecret = '';
  let hasSecret = false;
  let entra = { enabled: false, clientId: '', hasSecret: false, discoveryUrl: '' };
  let entraSecret = '';
  // Modes sans fournisseur natif : `enabled` est le réglage, `envEnabled` le
  // drapeau du déploiement — le serveur n'affiche le mode que si les DEUX
  // sont vrais (cf. routes/auth/session.js).
  let passwordLogin = { enabled: true, envEnabled: true };
  let legacySso = { enabled: true, envEnabled: false };
  let allowedDomains = [];
  // Domaine tapé dans la carte « Domaines autorisés », pas encore ajouté.
  let domainDraft = '';
  // Derniers réglages reçus du serveur : ce que « Annuler » rétablit, et la
  // référence de « Modifié ».
  let saved = null;
  // Le mode déplié sous les pastilles : un seul à la fois.
  let openMode = ''; // '' | 'password' | 'google' | 'entra' | 'legacy'
  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  let errorMessage = '';
  let redirectCopied = false;
  let mailRedirectCopied = false;
  let entraRedirectCopied = false;

  $: texts = $uiText.adminAuth;
  $: userTexts = $uiText.adminUsers;
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
  // État réel côté serveur, pas l'interrupteur : la pastille ne doit pas
  // annoncer « Affiché » sur une configuration incomplète ou pas encore
  // enregistrée.
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

  // Ce qui a changé depuis le serveur, mode par mode. Déclarations réactives :
  // Svelte ne suit que les identifiants qu'il VOIT.
  $: changed = saved
    ? {
        password: passwordLogin.enabled !== saved.passwordLogin.enabled,
        google:
          googleEnabled !== saved.google.enabled ||
          clientId.trim() !== saved.google.clientId ||
          !!clientSecret.trim(),
        entra: entra.enabled !== saved.entra.enabled || !!entraSecret.trim(),
        legacy: legacySso.enabled !== saved.legacySso.enabled,
        // Un domaine tapé compte : il partira avec « Enregistrer ».
        domains:
          allowedDomains.join(',') !== saved.allowedDomains.join(',') || !!domainDraft.trim(),
      }
    : {};
  $: dirty = Object.values(changed).some(Boolean);
  $: canSave =
    dirty && !missingCredentials && !entraIncomplete && !noModeLeft && saveState !== 'saving';

  // ── Pastilles : les modes, tels que la page de connexion les montre ──
  // Le SSO historique n'existe que là où le déploiement le déclare
  // (OIDC_ENABLED) — ailleurs, pas de pastille.
  $: modes = [
    {
      id: 'password',
      label: texts.modeNames.password,
      icon: IconPassword,
      live: passwordLive,
    },
    { id: 'google', label: texts.modeNames.google, logo: GoogleLogo, live: googleLive },
    { id: 'entra', label: texts.modeNames.entra, logo: MicrosoftLogo, live: entraLive },
    ...(legacySso.envEnabled
      ? [{ id: 'legacy', label: texts.modeNames.legacy, icon: IconShield, live: legacyPluginLive }]
      : []),
  ];
  $: shownCount = modes.filter((mode) => mode.live).length;
  $: domainsMeta =
    allowedDomains.length === 0
      ? texts.domainsNone
      : allowedDomains.length === 1
        ? texts.domainsOne
        : fill(texts.domainsMany, { count: allowedDomains.length });

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
    // Un fournisseur activé que le serveur ne sert pas attend un geste
    // (identifiants incomplets, secret expiré) : il ne reste pas replié. Lu
    // sur l'état brut : les déclarations réactives ne sont pas encore
    // recalculées à cette ligne.
    if (googleEnabled && !googleLive) openMode = 'google';
    else if (entra.enabled && (entra.clientId || entra.hasSecret) && !entraLive) openMode = 'entra';
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
    saved = {
      google: { enabled: googleEnabled, clientId: clientId || '' },
      entra: { enabled: entra.enabled },
      passwordLogin: { enabled: passwordLogin.enabled },
      legacySso: { enabled: legacySso.enabled },
      allowedDomains: [...allowedDomains],
      raw: s,
    };
  }

  function toggleMode(id) {
    openMode = openMode === id ? '' : id;
  }

  function discard() {
    apply(saved.raw);
    domainDraft = '';
    errorMessage = '';
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
    // Les pastilles lisent les capacités du serveur : sans ce rafraîchissement
    // elles resteraient figées sur l'état d'avant l'enregistrement.
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
   * l'URI. Effet assumé, dit derrière l'ⓘ du bouton : terminer le flux avec
   * un autre compte bascule la session dessus.
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

    <!-- ── Page de connexion : une pastille par mode, son détail au clic ── -->
    <DashCard
      id="at-modes"
      icon={IconLogin}
      title={texts.loginModesTitle}
      info={texts.loginModesIntro}
      meta={fill(texts.modesCount, { count: shownCount, total: modes.length })}
    >
      <div class="at-pills">
        {#each modes as mode (mode.id)}
          <DashPill
            label={mode.label}
            logo={mode.logo}
            icon={mode.icon}
            on={mode.live}
            status={mode.live ? texts.modeShown : texts.modeHidden}
            flag={changed[mode.id] ? texts.modeChanged : ''}
            open={openMode === mode.id}
            on:click={() => toggleMode(mode.id)}
          />
        {/each}
      </div>

      <!-- Ce qui empêche d'enregistrer reste sous les yeux, quel que soit le
           mode déplié. -->
      {#if noModeLeft}
        <p class="at-warn" role="alert">{texts.noModeLeft}</p>
      {/if}
      {#if missingCredentials}
        <p class="at-warn" role="alert">{texts.credentialsRequired}</p>
      {/if}
      {#if entraIncomplete}
        <p class="at-warn" role="alert">{texts.entraCredentialsRequired}</p>
      {/if}

      {#if openMode === 'password'}
        <LoginModePanel
          icon={IconPassword}
          name={texts.modePassword}
          usage={texts.modePasswordUsage}
          live={passwordLive}
          shownLabel={texts.modeShown}
          hiddenLabel={texts.modeHidden}
          bind:checked={passwordLogin.enabled}
          toggleText={texts.modeOffer}
          toggleDisabled={!passwordLogin.envEnabled}
        >
          {#if !passwordLogin.envEnabled}
            <p class="at-note">{texts.modePasswordEnvOff}</p>
          {/if}
        </LoginModePanel>
      {:else if openMode === 'google'}
        <LoginModePanel
          logo={GoogleLogo}
          name={texts.googleTitle}
          usage={texts.googleIntro}
          live={googleLive}
          shownLabel={texts.modeShown}
          hiddenLabel={texts.modeHidden}
          bind:checked={googleEnabled}
          toggleText={texts.modeOffer}
          testLabel={texts.modeTest}
          testInfo={texts.modeTestHint}
          testInfoLabel={texts.modeTestInfoLabel}
          on:test={() => testMode('/api/auth/google/start')}
        >
          <div class="at-grid">
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
        </LoginModePanel>
      {:else if openMode === 'entra'}
        <LoginModePanel
          logo={MicrosoftLogo}
          name={texts.entraTitle}
          usage={texts.entraIntro}
          live={entraLive}
          shownLabel={texts.modeShown}
          hiddenLabel={texts.modeHidden}
          bind:checked={entra.enabled}
          showToggle={entraConfigured}
          toggleText={texts.modeOffer}
          testLabel={texts.modeTest}
          testInfo={texts.modeTestHint}
          testInfoLabel={texts.modeTestInfoLabel}
          on:test={() => testMode('/api/auth/entra/start')}
        >
          {#if !entraConfigured}
            <p class="at-note">{texts.entraDisabledHint}</p>
          {:else}
            <div class="at-grid">
              <div class="at-field">
                <span class="at-label">{texts.clientId}</span>
                <input
                  class="at-input at-input-readonly"
                  type="text"
                  readonly
                  aria-label={texts.clientId}
                  value={entra.clientId}
                />
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
                  {entra.hasSecret ? texts.secretKeepHint : texts.entraSecretRequiredHint}
                </p>
              </div>
            </div>

            <div class="at-field">
              <span class="at-label">{texts.entraDiscovery}</span>
              <input
                class="at-input at-input-readonly"
                type="text"
                readonly
                aria-label={texts.entraDiscovery}
                value={entra.discoveryUrl}
              />
              <p class="at-hint">{texts.entraFromEnv}</p>
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
              <p class="at-hint">{texts.entraRedirectLocked}</p>
            </div>
            <p class="at-note">{texts.graphPermissionsHint}</p>
          {/if}

          {#if legacyPluginLive}
            <p class="at-hint">{texts.entraLegacyPlugin}</p>
          {/if}
        </LoginModePanel>
      {:else if openMode === 'legacy'}
        <LoginModePanel
          icon={IconShield}
          name={texts.modeLegacy}
          usage={texts.modeLegacyHint}
          live={legacyPluginLive}
          shownLabel={texts.modeShown}
          hiddenLabel={texts.modeHidden}
          bind:checked={legacySso.enabled}
          toggleText={texts.modeOffer}
          testLabel={texts.modeTest}
          testInfo={texts.modeTestHint}
          testInfoLabel={texts.modeTestInfoLabel}
          on:test={() => testMode('/login')}
        />
      {/if}
    </DashCard>

    <!-- ── Domaines autorisés ── -->
    <DashCard
      id="at-domains"
      icon={IconGlobe}
      title={texts.domainsTitle}
      info={texts.domainsIntro}
      meta={domainsMeta}
    >
      <DomainList
        domains={allowedDomains}
        bind:draft={domainDraft}
        {texts}
        disabled={saveState === 'saving'}
        on:change={(e) => {
          allowedDomains = e.detail;
        }}
      />
    </DashCard>

    <!-- Barre collante : même anatomie que Configuration, IA et Actions. -->
    <div class="at-actions">
      {#if dirty}
        <span class="at-unsaved">{texts.unsavedHint}</span>
        <button type="button" class="at-ghost" on:click={discard} disabled={saveState === 'saving'}>
          {texts.discardChanges}
        </button>
      {:else if saveState === 'saved'}
        <span class="at-saved"
          ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.saved}</span
        >
      {/if}
      <button type="button" class="at-save" on:click={save} disabled={!canSave}>
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

  /* Cartes et pastilles : DashCard, DashPill (ui/) ; détail d'un mode :
     LoginModePanel — la même anatomie que les onglets IA et Configuration.
     Ne restent ici que les champs. */
  .at-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  /* ── Champs ── */
  .at-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
    align-items: start;
  }
  .at-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
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
    flex-wrap: wrap;
    gap: 0.6rem;
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
  .at-unsaved {
    font-size: 0.82rem;
    color: var(--ink-muted);
  }
  .at-ghost {
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    color: var(--ink-soft);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.88rem;
    transition: background 0.15s;
  }
  .at-ghost:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .at-ghost:disabled {
    opacity: 0.5;
    cursor: default;
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
    .at-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .at-redirect {
      flex-direction: column;
    }
    .at-copy {
      width: 100%;
      justify-content: center;
    }
    /* `.ap-body` retombe à 14px/16px de padding sur mobile. */
    .at-actions {
      justify-content: stretch;
      bottom: -14px;
      margin: 0 -16px -14px;
      padding: 0.85rem 16px 14px;
    }
    .at-actions button {
      flex: 1 1 auto;
    }
  }
</style>
