<script>
  /**
   * « Réglages » — l'espace du COMPTE : tout ce qui regarde la personne
   * connectée, et rien de l'organisation (qui a l'Administration). Le bouton
   * « Réglages » de la carte du compte l'ouvre, sur « Mon profil ».
   *
   * Reprend la mise en page de l'administration : le panneau occupe toute la
   * zone à droite de l'historique (monté DANS le layout flex, pas en overlay).
   * Ses sections s'affichent dans la SIDEBAR, à la place de l'historique
   * (stores/panels.js) ; sur mobile, où la sidebar est un drawer, le déroulant
   * PanelTabs les garde sous la main.
   *
   * Panneau UNIQUE : « Mes templates », « Mes tags », « Importer un audio »,
   * « Mes statistiques » et le menu déroulant du nom étaient autant de
   * panneaux, de modales et de popovers, chacun avec son chemin d'accès. Ils
   * sont devenus des sections, groupées dans la colonne (la liste et ses
   * raisons : config/configSections.js) ; « Aide » est un lien vers la
   * documentation en ligne, « Se déconnecter » ferme la colonne.
   *
   * Trois pages REGROUPENT des écrans, en onglets (ui/SubTabs) : « Préférences
   * IA » (« Mon contexte », « Aide IA »), « Pendant la réunion » (« Micro et
   * son », « Mots remplacés », « Détection d'actions », « Aide IA ») et « Après
   * la réunion » (un onglet par action). Un écran = une page reste vrai, avec
   * son propre bouton Enregistrer ; la colonne ne compte plus une entrée par
   * écran. « Aide IA » est le même écran sous ses deux pages. « Outils », lui,
   * empile ses deux blocs : aucun n'a de bouton Enregistrer.
   *
   * Le micro et le son de l'ordinateur sont gardés par appareil
   * (stores/audioDevices.js) : un deviceId n'a aucun sens d'une machine à
   * l'autre. Le contexte, lui, suit le compte.
   */
  import { onMount, onDestroy } from 'svelte';

  import PanelShell from './PanelShell.svelte';
  import PanelTabs from './PanelTabs.svelte';
  import {
    panelNav,
    registerPanelNav,
    selectPanelSection,
    clearPanelNav,
  } from '../stores/panels.js';
  import IconMyConfig from '~icons/solar/tuning-4-linear';
  import IconMic from '~icons/solar/microphone-2-linear';
  import IconUserId from '~icons/solar/user-id-linear';
  import IconProfile from '~icons/solar/user-circle-linear';
  import IconMagic from '~icons/solar/magic-stick-3-linear';
  import IconShare from '~icons/solar/square-share-line-linear';
  import IconChart from '~icons/solar/chart-square-linear';
  import IconLogout from '~icons/solar/logout-2-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconWarn from '~icons/solar/danger-triangle-linear';
  import IconSave from '~icons/solar/diskette-linear';
  import IconLink from '~icons/solar/link-minimalistic-2-linear';
  import IconTemplates from '~icons/solar/clipboard-list-linear';
  import IconTag from '~icons/solar/tag-linear';
  import IconHelp from '~icons/solar/question-circle-linear';
  import IconBug from '~icons/solar/bug-linear';
  import IconMeeting from '~icons/solar/record-circle-linear';
  import IconTools from '~icons/solar/case-minimalistic-linear';
  // L'orbe à la sonnette — celle de l'Aide IA en réunion, pas une cloche de
  // notification : on doit reconnaître ici ce qu'on a vu là-bas.
  import IconAiHelp from './icons/AiHelpIcon.svelte';
  import ActionDetectionSection from './settings/ActionDetectionSection.svelte';
  import CorrectionsSection from './settings/CorrectionsSection.svelte';
  import AiHelpSection from './settings/AiHelpSection.svelte';
  import { aiHelp, loadAiHelp } from '../stores/aiHelp.js';
  import ProfileSection from './settings/ProfileSection.svelte';
  import PersonalStats from './stats/PersonalStats.svelte';
  import SubTabs from './ui/SubTabs.svelte';
  import MyBrainSection from './settings/MyBrainSection.svelte';
  import ActionsSettingsTab from './settings/ActionsSettingsTab.svelte';
  import TemplatesSection from './settings/TemplatesSection.svelte';
  import ImportSection from './settings/ImportSection.svelte';
  import ExtensionSection from './settings/ExtensionSection.svelte';
  import SystemAudioCard from './settings/SystemAudioCard.svelte';
  import TagsPanel from './TagsPanel.svelte';
  import GoogleLogo from './icons/GoogleLogo.svelte';
  import MicrosoftLogo from './icons/MicrosoftLogo.svelte';
  import {
    fetchConnectStatus,
    disconnectAccount,
    connectStartUrl,
    createConnectTicket,
  } from '../services/connectApi.js';
  import {
    movedConfigTarget,
    visibleActionTabs,
    visibleAiTabs,
    visibleConfigSections,
    visibleMeetingTabs,
  } from '../config/configSections.js';
  import { myBrain, refreshMyBrain } from '../stores/myBrain.js';
  import { configChecks, refreshConfigChecks } from '../stores/configChecks.js';
  import { alertsBySection, mergeAlerts } from '../utils/configAlerts.js';
  import { accountView } from '../utils/userIdentity.js';
  import { isNative } from '../platform/index.js';
  import { openConnectFlow } from '../platform/auth.js';
  import { auth } from '../stores/auth.js';
  import { audioDevices, chooseMicrophone } from '../stores/audioDevices.js';
  import { currentAudioCaptureSupport } from '../utils/browserAudioSupport.js';

  export let uiText;
  export let userContext = '';
  export let userInfo = null;
  // Callbacks
  export let onSaveContext = async (_text) => true; // doit renvoyer true/false
  export let onImportAudio = () => {};
  export let onClose = () => {};
  /** Langue de l'interface (« Mon profil ») : c'est App qui la porte. */
  export let onSetLanguage = (_lang) => {};
  /** Gestes de compte remontés à App : 'password', 'logout'. */
  export let onAccountAction = (_id) => {};

  $: c = uiText.config;

  // L'onglet mail n'existe que si l'administration propose « Envoyer par
  // mail » quelque part : sinon il n'y aurait rien à configurer.
  $: mailTabVisible = !!(
    mailSettings &&
    (mailSettings.actionEnabled?.transcription || mailSettings.actionEnabled?.summary)
  );
  // Le fournisseur est choisi par l'installation, le serveur le désigne : ce
  // repli ne sert qu'entre le montage et la première réponse.
  $: provider = mailSettings?.provider || {
    id: 'google',
    label: 'Google',
    available: false,
    connected: false,
    account: '',
  };
  $: providerLogo = provider.id === 'microsoft' ? MicrosoftLogo : GoogleLogo;
  // L'onglet « Actions » suit le plafond de l'administration, mais PAS via
  // `mailSettings` : /connect/status ne rapporte que l'interrupteur du mail, et
  // le dépôt peut être ouvert alors que le mail est fermé. C'est
  // /api/actions/settings qui renvoie son propre `ceiling`, et l'onglet le lit
  // lui-même — l'endpoint qui possède le réglage est celui qui dit ce qui est
  // éditable.
  //
  // La LISTE, ses groupes et leurs raisons vivent dans
  // config/configSections.js. Ne restent ici que les icônes — des composants
  // Svelte, qui n'ont rien à faire dans un module de configuration.
  const SECTION_ICONS = {
    profile: IconProfile,
    ai: IconMagic,
    mail: IconLink,
    usage: IconChart,
    meeting: IconMeeting,
    actions: IconShare,
    templates: IconTemplates,
    tags: IconTag,
    tools: IconTools,
    help: IconHelp,
    feedback: IconBug,
    logout: IconLogout,
  };
  const HOME_SECTION = 'profile';
  // Un raccourci écrit avant le déménagement d'un écran (« audio », « aiHelp »,
  // « import »…) aboutit à sa place d'aujourd'hui, pas à « Mon profil ».
  // EN TÊTE des déclarations réactives, et ce n'est pas un détail : Svelte les
  // exécute dans l'ordre du fichier, une fois par passe. Placée après le calcul
  // des onglets, la redirection changeait la nav trop tard — la page s'ouvrait
  // sur son premier onglet au lieu de celui visé. Avant l'enregistrement de la
  // colonne aussi : à l'ouverture, la nav n'a pas encore de propriétaire.
  $: moved = $panelNav.owner !== 'admin' && movedConfigTarget($panelNav.active, $panelNav.sub);
  $: if (moved) selectPanelSection(moved.section, moved.sub);
  // Pastille de chaque section : ce que le diagnostic du compte y trouve à
  // régler — compte relié, dossier de dépôt, dossiers par tag.
  $: alerts = alertsBySection($configChecks.account, uiText.configChecks);
  // Onglets de la page « Après la réunion ». « MyBrain » n'existe que là où
  // l'administration l'a branché : l'état vient du store (stores/myBrain.js),
  // chargé au montage et partagé avec la section. Chaque onglet porte la
  // pastille de SON action ; l'entrée de la colonne les réunit, sans quoi un
  // dossier de dépôt à corriger ne se verrait qu'une fois la page ouverte sur
  // le bon onglet.
  $: actionTabs = visibleActionTabs({ myBrain: $myBrain.available }).map((tab) => ({
    id: tab.id,
    label: tab.label(uiText),
    alert: (tab.alertSection && alerts[tab.alertSection]) || null,
  }));
  $: actionTab = actionTabs.some((tab) => tab.id === $panelNav.sub)
    ? $panelNav.sub
    : actionTabs[0].id;
  $: sectionAlerts = { ...alerts, actions: mergeAlerts(actionTabs.map((tab) => tab.alert)) };
  // Onglets de « Préférences IA » et de « Pendant la réunion ». L'onglet
  // « Aide IA » est le même sous les deux pages : même libellé, même orbe dans
  // sa teinte (`tone`), et il suit le droit du groupe — sans lui, « Préférences
  // IA » n'a qu'un écran, et pas de rangée d'onglets.
  const toTab = (tab, t) => ({
    id: tab.id,
    label: tab.label(t),
    ...(tab.id === 'aiHelp' ? { icon: IconAiHelp, tone: 'ai' } : {}),
  });
  $: aiTabs = visibleAiTabs({ aiHelp: $aiHelp.available }).map((tab) => toTab(tab, uiText));
  $: aiTab = aiTabs.some((tab) => tab.id === $panelNav.sub) ? $panelNav.sub : aiTabs[0].id;
  $: meetingTabs = visibleMeetingTabs({ aiHelp: $aiHelp.available }).map((tab) =>
    toTab(tab, uiText),
  );
  $: meetingTab = meetingTabs.some((tab) => tab.id === $panelNav.sub)
    ? $panelNav.sub
    : meetingTabs[0].id;
  // « Comptes connectés » s'affiche dès qu'il y a un fournisseur à relier, même
  // si l'administration a fermé l'envoi par mail — le dépôt Drive a besoin du
  // même compte.
  $: TABS = visibleConfigSections({
    connectable: mailTabVisible || provider.available,
    feedbackUrl: $auth.capabilities.feedbackUrl,
    docsUrl: $auth.capabilities.docsUrl,
    signedIn: !!accountView($auth.user).name,
  }).map((section) => ({
    id: section.id,
    label: section.label(uiText),
    icon: SECTION_ICONS[section.id],
    group: section.group ? c[section.group] : '',
    href: section.href,
    action: section.action,
    danger: section.danger,
    alert: sectionAlerts[section.id] || null,
  }));
  // Les sections vivent dans stores/panels.js : la SIDEBAR les rend à la
  // place de l'historique (desktop), le déroulant PanelTabs les garde sur
  // mobile. Ré-enregistré à chaque évolution de la liste (plafond mail,
  // langue) — le store préserve la section choisie.
  $: registerPanelNav('config', { title: c.title, items: TABS, active: HOME_SECTION });
  // Repli sur « Mon profil » si l'active enregistrée n'existe pas (nav vidée
  // par un autre panneau, valeur orpheline) : l'écran ne peut pas être vide.
  // Exception : « mail » reste montrable SANS entrée visible — le retour OAuth
  // en échec (#config?connectError) doit afficher son message même quand
  // aucune action mail n'est ouverte par l'administration. Un LIEN (« Aide »)
  // ou un GESTE (« Se déconnecter ») n'a pas d'écran : s'il arrive comme
  // section, repli aussi.
  $: activeTab =
    $panelNav.owner === 'config' &&
    (TABS.some((t) => t.id === $panelNav.active && !t.href && !t.action) ||
      ($panelNav.active === 'mail' && mailError))
      ? $panelNav.active
      : HOME_SECTION;
  onDestroy(() => clearPanelNav('config'));

  // ── Audio ─────────────────────────────────────────────────────────────────
  let audioInputs = [];
  let selectedDeviceId = $audioDevices.mic || '';
  let needsPermission = false;
  let enumerating = true;

  async function loadDevices() {
    enumerating = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        audioInputs = [];
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      audioInputs = devices.filter((d) => d.kind === 'audioinput');
      // Labels vides => permission micro pas encore accordée.
      needsPermission = audioInputs.length > 0 && audioInputs.every((d) => !d.label);
    } catch (e) {
      console.warn('enumerateDevices a échoué:', e);
      audioInputs = [];
    } finally {
      enumerating = false;
    }
  }

  async function requestPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stream jetable : on coupe immédiatement, on voulait juste les labels.
      stream.getTracks().forEach((t) => t.stop());
      await loadDevices();
    } catch (e) {
      console.warn('Autorisation micro refusée:', e);
    }
  }

  function handleDeviceChange() {
    chooseMicrophone(selectedDeviceId || '');
    audioSaved = true;
    setTimeout(() => {
      audioSaved = false;
    }, 2000);
  }

  let audioSaved = false;

  // Son de l'ordinateur : Firefox et Safari sur ordinateur seulement, dont le
  // partage d'écran est muet (settings/SystemAudioCard.svelte). Chrome et Edge
  // partagent le son eux-mêmes.
  const audioCapture = currentAudioCaptureSupport();
  const systemAudioOffered = audioCapture.desktop && !audioCapture.shareAudio;

  // ── Contexte ──────────────────────────────────────────────────────────────
  let contextText = userContext || '';
  let saveState = 'idle'; // idle | saving | saved | error

  async function handleSaveContext() {
    saveState = 'saving';
    try {
      const ok = await onSaveContext(contextText);
      saveState = ok ? 'saved' : 'error';
    } catch (e) {
      console.warn('Sauvegarde contexte échouée:', e);
      saveState = 'error';
    }
    if (saveState === 'saved') {
      setTimeout(() => {
        if (saveState === 'saved') saveState = 'idle';
      }, 2500);
    }
  }

  // ── Compte connecté (envoi par mail, dépôt) ───────────────────────────────
  let mailSettings = null;
  let mailLoading = true;
  let mailError = ''; // slug renvoyé par le callback OAuth (?connectError=…)
  let disconnecting = false;

  async function loadMailSettings() {
    mailLoading = true;
    const res = await fetchConnectStatus();
    mailLoading = false;
    if (res.ok) mailSettings = res.data;
    // Relu après une liaison ou une déconnexion : la pastille « Connexion »
    // doit suivre sans attendre la fermeture du panneau.
    refreshConfigChecks();
  }

  async function connectAccount() {
    // ── App native ──────────────────────────────────────────────────────────
    // Deux raisons de ne PAS naviguer dans la WebView : Google refuse OAuth
    // dans une WebView embarquée, et surtout l'identité native est un JWT porté
    // en en-tête — qu'une navigation ne transporte pas. Le flux partait donc
    // sans identité et revenait à l'accueil sans un mot. Le billet, lui, est
    // obtenu par un fetch (qui porte le Bearer) et présenté par la navigation ;
    // le retour se fait par deep link (cf. platform/auth.js).
    if (isNative) {
      mailError = '';
      const res = await createConnectTicket();
      if (!res.ok || !res.data?.ticket) {
        mailError = 'connect_failed';
        return;
      }
      await openConnectFlow(connectStartUrl(res.data.ticket));
      return;
    }
    // Navigation top-level : le fournisseur prend la main, le callback ramène
    // sur /#config et ce panneau relit son état au montage.
    window.location.href = connectStartUrl();
  }

  /**
   * Retour du navigateur système après un consentement (app native). Le panneau
   * n'a jamais été démonté — c'est le navigateur qui était par-dessus — donc
   * rien ne le rafraîchirait sans cet événement.
   */
  function onConnectReturned(event) {
    mailError = event.detail?.error || '';
    loadMailSettings();
  }

  async function handleDisconnect() {
    disconnecting = true;
    mailError = '';
    const res = await disconnectAccount();
    disconnecting = false;
    if (res.ok || res.status === 404) await loadMailSettings();
    else mailError = 'connect_failed';
  }

  /**
   * Le callback OAuth signale ses échecs par `?connectError=<slug>` devant le
   * hash. Lu une fois, montré dans l'onglet mail, puis retiré de l'URL pour ne
   * pas resurgir à la prochaine navigation.
   */
  function readMailErrorFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('connectError');
    if (!slug) return;
    mailError = slug;
    selectPanelSection('mail');
    params.delete('connectError');
    const query = params.toString();
    history.replaceState(
      null,
      '',
      window.location.pathname + (query ? `?${query}` : '') + window.location.hash,
    );
  }

  onMount(() => {
    loadDevices();
    loadMailSettings();
    refreshMyBrain();
    // L'onglet « Aide IA » suit le droit du groupe : relu à l'ouverture.
    loadAiHelp();
    readMailErrorFromUrl();
    window.addEventListener('mybrief:connect-returned', onConnectReturned);
    return () => window.removeEventListener('mybrief:connect-returned', onConnectReturned);
  });
</script>

<PanelShell title={c.title} icon={IconMyConfig} {onClose} closeLabel={uiText.ariaLabels.close}>
  <svelte:fragment slot="title-extra">
    {#if userInfo?.email}
      <span class="sp-whoami" title={userInfo.email}>{userInfo.email}</span>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="tabs">
    <!-- Mobile uniquement : sur desktop, les sections vivent dans la sidebar. -->
    <PanelTabs
      tabs={TABS}
      active={activeTab}
      onSelect={selectPanelSection}
      ariaLabel={c.title}
      newTabLabel={uiText.ariaLabels.newTab}
      onAction={onAccountAction}
    />
  </svelte:fragment>

  <!-- ── Mon profil : identité, groupe, langue, mot de passe ── -->
  {#if activeTab === 'profile'}
    <ProfileSection {onSetLanguage} {onAccountAction} />

    <!-- ── Pendant la réunion : quatre ONGLETS, dans l'ordre où la réunion
         s'en sert — ce qu'elle entend (« Micro et son »), ce qu'elle écrit
         (« Mots remplacés »), ce que l'IA y repère (« Détection d'actions »),
         ce que l'IA y dit (« Aide IA », pour un compte qui y a droit). -->
  {:else if activeTab === 'meeting'}
    <SubTabs
      tabs={meetingTabs}
      active={meetingTab}
      onSelect={(id) => selectPanelSection('meeting', id)}
      ariaLabel={c.meetingSection}
    />
    {#if meetingTab === 'corrections'}
      <div class="sp-body"><CorrectionsSection /></div>
    {:else if meetingTab === 'detection'}
      <div class="sp-body"><ActionDetectionSection /></div>
    {:else if meetingTab === 'aiHelp'}
      <div class="sp-body"><AiHelpSection /></div>
    {:else}
      <div class="sp-body">
        <p class="sp-intro">{c.audioIntro}</p>

        <section class="sp-card">
          <header class="sp-card-head">
            <span class="sp-card-icon" aria-hidden="true"><IconMic width="20" height="20" /></span>
            <div class="sp-card-title">
              <h4>{c.audioSection}</h4>
              <p class="sp-hint">{c.audioLabel}</p>
            </div>
            {#if audioSaved}
              <span class="sp-ok"
                ><IconCheck width="15" height="15" aria-hidden="true" /> {c.saved}</span
              >
            {/if}
          </header>

          {#if enumerating}
            <div class="sp-skeleton" aria-hidden="true"></div>
          {:else if audioInputs.length === 0}
            <p class="sp-note sp-note-warn">{c.audioNoDevice}</p>
          {:else}
            <div class="sp-field">
              <label class="sp-label" for="sp-audio-select">{c.audioDeviceLabel}</label>
              <select
                id="sp-audio-select"
                class="sp-select"
                bind:value={selectedDeviceId}
                on:change={handleDeviceChange}
              >
                <option value="">{c.audioDefault}</option>
                {#each audioInputs as device, i (device.deviceId)}
                  <option value={device.deviceId}>
                    {device.label || `Microphone ${i + 1}`}
                  </option>
                {/each}
              </select>
              <p class="sp-hint">{c.audioDeviceHint}</p>
            </div>

            {#if needsPermission}
              <p class="sp-note">{c.audioPermissionHint}</p>
              <div class="sp-actions">
                <button type="button" class="sp-ghost" on:click={requestPermission}>
                  {c.audioPermissionBtn}
                </button>
              </div>
            {/if}
          {/if}
        </section>

        {#if systemAudioOffered}
          <SystemAudioCard
            devices={audioInputs}
            ready={!enumerating && audioInputs.length > 0 && !needsPermission}
          />
        {/if}
      </div>
    {/if}

    <!-- ── Préférences IA : ce que l'IA sait de moi (« Mon contexte ») et,
         pour un compte qui y a droit, comment elle se tient à mes côtés
         (« Aide IA » — le même écran que sous « Pendant la réunion »). Sans
         ce droit, un seul écran : pas de rangée d'onglets. -->
  {:else if activeTab === 'ai'}
    {#if aiTabs.length > 1}
      <SubTabs
        tabs={aiTabs}
        active={aiTab}
        onSelect={(id) => selectPanelSection('ai', id)}
        ariaLabel={c.aiSection}
      />
    {/if}
    {#if aiTab === 'aiHelp'}
      <div class="sp-body"><AiHelpSection /></div>
    {:else}
      <div class="sp-body">
        <p class="sp-intro">{c.contextIntro}</p>

        <section class="sp-card">
          <header class="sp-card-head">
            <span class="sp-card-icon" aria-hidden="true"
              ><IconUserId width="20" height="20" /></span
            >
            <div class="sp-card-title">
              <h4>{c.contextSection}</h4>
              <p class="sp-hint">{c.contextHint}</p>
            </div>
          </header>

          <div class="sp-field">
            <textarea
              class="sp-textarea"
              rows="12"
              maxlength="4000"
              bind:value={contextText}
              placeholder={c.contextPlaceholder}
            ></textarea>
            <p class="sp-hint">{contextText.length} / 4000</p>
          </div>

          {#if saveState === 'error'}
            <p class="sp-warn" role="alert">
              <IconWarn width="15" height="15" aria-hidden="true" />
              {c.error}
            </p>
          {/if}
        </section>

        <!-- Ce que l'IA fait EN réunion ne se règle pas ici : on le dit, on y
             mène — c'est sous « Préférences IA » qu'on vient le chercher. -->
        <p class="sp-note sp-elsewhere">
          <span>{c.aiElsewhere}</span>
          <button
            type="button"
            class="sp-inline-link"
            on:click={() => selectPanelSection('meeting')}
          >
            {c.aiElsewhereLink}
          </button>
        </p>
      </div>

      <div class="sp-footer">
        {#if saveState === 'saved'}
          <span class="sp-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {c.saved}</span
          >
        {/if}
        <button
          type="button"
          class="sp-save"
          on:click={handleSaveContext}
          disabled={saveState === 'saving'}
        >
          {#if saveState === 'saving'}{c.saving}{:else}<IconSave
              width="15"
              height="15"
              aria-hidden="true"
            />
            {c.save}{/if}
        </button>
      </div>
    {/if}

    <!-- ── Après la réunion : un ONGLET par action, réglages + test ── -->
    <!-- L'état du compte relié est passé en props, pas redemandé : ce panneau
         l'a déjà chargé pour la page « Comptes connectés », et deux appels à
         /connect/status feraient deux vérités possibles à l'écran. -->
  {:else if activeTab === 'actions'}
    <SubTabs
      tabs={actionTabs}
      active={actionTab}
      onSelect={(id) => selectPanelSection('actions', id)}
      ariaLabel={c.actionsSection}
    />
    <div class="sp-body">
      {#if actionTab === 'mybrain'}
        <!-- MyBrain : envoyer ses réunions au cerveau partagé. -->
        <MyBrainSection />
      {:else}
        <ActionsSettingsTab
          section={actionTab}
          connectStatus={mailSettings}
          connectLoading={mailLoading}
          onConnect={connectAccount}
        />
      {/if}
    </div>

    <!-- ── Comptes connectés ── -->
  {:else if activeTab === 'mail'}
    <div class="sp-body">
      <p class="sp-intro">{c.mailIntro}</p>

      {#if mailError}
        <p class="sp-warn" role="alert">
          <IconWarn width="15" height="15" aria-hidden="true" />
          {c.mailErrors[mailError] || c.mailErrors.connect_failed}
        </p>
      {/if}

      {#if mailLoading}
        <div class="sp-skeleton" aria-hidden="true"></div>
      {:else if mailSettings}
        <section class="sp-card" class:sp-card-on={provider.connected}>
          <header class="sp-card-head">
            <span class="sp-card-icon" aria-hidden="true">
              <svelte:component this={providerLogo} size={20} />
            </span>
            <div class="sp-card-title">
              <h4>{c.mailGoogleTitle.replace('{provider}', provider.label)}</h4>
              <p class="sp-hint">{c.mailGoogleHint}</p>
            </div>
            <span class="sp-badge" class:sp-badge-on={provider.connected}>
              {provider.connected ? c.mailConnected : c.mailNotConnected}
            </span>
          </header>

          {#if !provider.available}
            <p class="sp-note sp-note-warn">
              {c.mailGoogleUnavailable.replace('{provider}', provider.label)}
            </p>
          {:else if provider.connected}
            <div class="sp-field">
              <span class="sp-label">{c.mailAccountLabel}</span>
              <input class="sp-select" type="text" readonly value={provider.account} />
            </div>
            <div class="sp-actions">
              <button
                type="button"
                class="sp-ghost"
                on:click={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? c.mailDisconnecting : c.mailDisconnect}
              </button>
            </div>
          {:else if isNative}
            <!-- Le flux OAuth est une navigation top-level vers l'API : en
                 WebView elle ne porte ni le cookie de session ni le jeton
                 Bearer, donc elle ne peut pas aboutir. Afficher le bouton
                 promettrait une connexion impossible. -->
            <p class="sp-note sp-note-warn">{c.mailConnectDesktopOnly}</p>
          {:else}
            <div class="sp-actions">
              <button type="button" class="sp-connect" on:click={connectAccount}>
                <svelte:component this={providerLogo} size={16} />
                {c.mailConnect.replace('{provider}', provider.label)}
              </button>
            </div>
          {/if}
        </section>

        {#if mailSettings.smtpAvailable}
          <p class="sp-note">{c.mailSmtpNote}</p>
        {:else if !provider.connected}
          <p class="sp-note sp-note-warn">
            {c.mailSmtpNone.replace('{provider}', provider.label)}
          </p>
        {/if}
      {/if}
    </div>

    <!-- ── Usage & crédits : SA consommation, et rien d'autre — administrateur
         compris (le crédit de l'équipe est dans l'administration). ── -->
  {:else if activeTab === 'usage'}
    <div class="sp-body"><PersonalStats /></div>

    <!-- ── Mes templates ── -->
    <!-- Les sections suivantes étaient des panneaux plein écran à part. Elles
         portent leur propre mise en page — d'où l'absence de `sp-body` : elles
         gèrent leur défilement et, pour les templates, leurs deux colonnes. -->
  {:else if activeTab === 'templates'}
    <TemplatesSection />
  {:else if activeTab === 'tags'}
    <TagsPanel />
    <!-- ── Outils : deux blocs titrés dans UNE page qui défile. Chacun était
         une page, avec son défilement à lui : empilés dans une enveloppe qui
         n'est pas un conteneur flex, ils reprennent leur hauteur naturelle.
         L'extension se lie à l'onglet ouvert : elle n'a de sens que dans un
         navigateur d'ordinateur, jamais dans l'app mobile. -->
  {:else if activeTab === 'tools'}
    <div class="sp-tools">
      <ImportSection texts={c} onImport={onImportAudio} />
      {#if !isNative}
        <ExtensionSection texts={c} />
      {/if}
    </div>
  {/if}
</PanelShell>

<style>
  /* Coquille (overlay/panel/header/close) : PanelShell. Ne restent ici que
     les styles propres au contenu du panneau. */
  .sp-whoami {
    font-size: 11.5px;
    color: var(--ink-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sp-body {
    width: 100%;
    box-sizing: border-box;
  }

  /* ── Tabs : voir PanelTabs.svelte (pastilles desktop, déroulant mobile) ── */
  /* ── Body ── */
  .sp-body {
    overflow-y: auto;
    padding: 18px 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
  }
  .sp-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  /* ── Carte ── */
  .sp-card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-tint);
  }
  .sp-card-on {
    border-color: color-mix(in srgb, var(--brand-secondary) 17.2%, #e1e1e1);
    box-shadow: inset 3px 0 0 var(--brand);
  }
  .sp-badge {
    flex: 0 0 auto;
    align-self: center;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--brand-secondary) 4.2%, #eeeeee);
    color: color-mix(in srgb, var(--brand-secondary) 7.4%, #6c6c6c);
  }
  .sp-badge-on {
    background: oklch(94% 0.07 155);
    color: oklch(38% 0.13 155);
  }
  .sp-connect {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.1rem;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: #fff;
    color: color-mix(in srgb, var(--brand-secondary) 17.5%, #121212);
    font-weight: 600;
    font-family: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .sp-connect:hover {
    background: var(--surface-tint);
    border-color: var(--brand);
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.3);
  }
  .sp-card-head {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .sp-card-icon {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background: #fff;
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--brand-text);
  }
  .sp-card-title {
    flex: 1 1 220px;
    min-width: 0;
  }
  .sp-card-title h4 {
    margin: 0 0 0.15rem;
    font-size: 0.98rem;
    font-weight: 600;
    color: var(--ink);
  }

  /* ── Champs ── */
  .sp-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .sp-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sp-select,
  .sp-textarea {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.92rem;
    background: #fff;
    color: #1a1a1a;
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .sp-textarea {
    resize: vertical;
    min-height: 160px;
    line-height: 1.6;
  }
  .sp-select:focus,
  .sp-textarea:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .sp-hint {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .sp-note {
    margin: 0;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #fff;
    border: 1px dashed color-mix(in srgb, var(--brand-secondary) 8.6%, #e3e3e3);
    font-size: 0.82rem;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    line-height: 1.5;
  }
  /* Renvoi vers une autre page : la phrase, puis le lien qui y mène. */
  .sp-elsewhere {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
  }
  .sp-inline-link {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    font-weight: 600;
    color: var(--brand-text);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  /* Au doigt, un lien dans une phrase reste une cible de 44 px. */
  @media (pointer: coarse) {
    .sp-inline-link {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
    }
  }
  .sp-inline-link:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    border-radius: 4px;
  }
  /* « Outils » : la page défile d'un bloc ; le second titre referme le premier
     bloc d'un filet, comme une nouvelle page le ferait. */
  .sp-tools {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .sp-tools :global(.es-head) {
    border-top: 1px solid var(--line);
  }
  .sp-note-warn {
    background: var(--warn-bg);
    border-color: var(--warn-line);
    color: var(--warn-text);
  }
  .sp-warn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: oklch(95% 0.05 25);
    color: oklch(38% 0.14 25);
    font-size: 0.85rem;
  }
  .sp-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: oklch(48% 0.12 150);
    font-size: 0.85rem;
    font-weight: 500;
    align-self: center;
  }

  .sp-skeleton {
    height: 60px;
    border-radius: 8px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: sp-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes sp-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sp-skeleton {
      animation: none;
    }
  }

  /* ── Boutons ── */
  .sp-actions {
    display: flex;
    justify-content: flex-start;
  }
  .sp-ghost {
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
  .sp-ghost:hover {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }

  /* ── Footer ── */
  .sp-footer {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    align-items: center;
    padding: 14px 22px;
    border-top: 1px solid var(--line);
    background: var(--surface-tint);
    flex-shrink: 0;
  }
  .sp-save {
    display: inline-flex;
    align-items: center;
    gap: 7px;
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
  .sp-save:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .sp-save:active:not(:disabled) {
    transform: scale(0.97);
  }
  .sp-save:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    .sp-body {
      padding: 14px 16px;
    }
    .sp-card {
      padding: 0.85rem 0.9rem;
    }
    .sp-footer {
      padding: 12px 14px;
    }
    .sp-footer .sp-save {
      flex: 1;
      justify-content: center;
    }
  }
</style>
