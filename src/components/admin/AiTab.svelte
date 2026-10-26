<script>
  /**
   * Onglet « IA » du panneau d'administration : la clé OpenAI, le modèle qui
   * RÉDIGE les comptes rendus, le modèle de transcription et l'infographie —
   * proposée ou non, dessinée par le modèle d'image choisi, à la charte de
   * l'installation.
   *
   * Le modèle de rédaction est le réglage le plus visible de l'écran : c'est
   * lui qui décide de la longueur et de la structure du compte rendu. Il vit
   * ici parce que le figer dans le code avait un coût réel — jusqu'au
   * 2026-09-01 il valait gpt-4o-mini sans que personne puisse le constater ni
   * le changer, et les comptes rendus sortaient plus courts que ceux du même
   * prompt dans ChatGPT (cf. lib/summaryModels.js).
   *
   * La clé pilote la transcription, le résumé et la détection d'actions — sans
   * elle l'application enregistre mais ne produit rien. La régler ici évite de
   * redéployer pour une clé expirée ou remplacée.
   *
   * Chaque modèle de transcription montre son PRIX : un niveau en « € » et le
   * coût d'une heure en euros, aux tarifs de l'écran Statistiques (servis par
   * GET /settings/ai, cf. lib/costs). Choisir un modèle, c'est aussi choisir
   * une dépense : l'écart avec le modèle en service s'affiche avant
   * l'enregistrement.
   *
   * La clé n'est JAMAIS reçue de l'API : on n'affiche que sa provenance et un
   * indice (`sk-proj…UyoA`), assez pour reconnaître laquelle est en place — et
   * pour voir à l'œil une clé collée deux fois.
   *
   * Le serveur VÉRIFIE la clé auprès d'OpenAI avant de l'enregistrer : ce
   * formulaire ne peut donc pas mettre l'application en panne.
   *
   * UN bouton Enregistrer pour les deux réglages, comme sur les autres
   * onglets — mais le corps envoyé ne porte QUE ce qui a changé : la clé si
   * une nouvelle a été collée, le modèle s'il a été modifié. Un corps qui
   * porterait toujours les deux effacerait la clé dès qu'on ne change que le
   * modèle (vide = « retire la clé » côté serveur). Les tests, eux, restent
   * dans leur carte : ils portent sur UN réglage, pas sur la page.
   */
  import { onMount } from 'svelte';
  import IconCpu from '~icons/solar/cpu-bolt-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconMicrophone from '~icons/solar/microphone-3-linear';
  import IconGallery from '~icons/solar/gallery-linear';
  import IconDocumentText from '~icons/solar/document-text-linear';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import ModelPicker from './ModelPicker.svelte';
  import { formatDate, formatEuros, pricingLines } from './stats/format.js';
  import { pricedChoices } from '../../utils/modelPrices.js';
  import { refreshCapabilities } from '../../stores/auth.js';
  import { refreshConfigChecks } from '../../stores/configChecks.js';
  import { selectPanelSection } from '../../stores/panels.js';
  import {
    fetchAiSettings,
    saveAiSettings,
    testAiKey,
    testTranscriptionModel,
    testSummaryModel,
  } from '../../services/adminUsersApi.js';
  import { currentLanguageStore, uiText } from '../../store.js';

  // Même plafond que le serveur (INFOGRAPHIC_STYLE_MAX, lib/prompts.js) : le
  // schéma de route refuserait au-delà, autant borner la saisie ici (même
  // parti pris que BrandingTab pour le contexte d'organisation).
  const INFOGRAPHIC_STYLE_MAX = 1000;

  let settings = {
    hasKey: false,
    source: 'none',
    hint: '',
    transcriptionModel: '',
    transcriptionModelSource: 'default',
    transcriptionModelRetired: null,
    transcriptionModels: [],
    summaryModel: '',
    summaryModelSource: 'default',
    summaryModels: [],
    summaryModelOffList: false,
    infographicEnabled: true,
    infographicImageModel: '',
    infographicImageModelSource: 'default',
    infographicImageModels: [],
    infographicImageModelOffList: false,
    infographicStyle: '',
    updatedAt: null,
    updatedBy: null,
  };
  // Prix des modèles proposés (GET /settings/ai) ; `null` quand le serveur
  // n'a pas pu les établir : les modèles s'affichent alors sans prix.
  let prices = null;
  let apiKey = '';
  let model = '';
  let summaryModel = '';
  let infographicEnabled = true;
  let infographicImageModel = '';
  let infographicStyle = '';
  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  // Ce que le dernier enregistrement a écrit — pour dire « Clé enregistrée »
  // ou « Modèle enregistré », pas un « Enregistré » qui ne dit pas quoi.
  let savedFields = {
    key: false,
    model: false,
    summary: false,
    infographic: false,
    imageModel: false,
    style: false,
  };
  let testState = 'idle'; // 'idle' | 'testing' | 'ok'
  let modelTestState = 'idle'; // 'idle' | 'testing' | 'ok'
  let summaryTestState = 'idle'; // 'idle' | 'testing' | 'ok'
  let errorMessage = '';

  $: texts = $uiText.adminAi;
  $: userTexts = $uiText.adminUsers;
  $: lang = $currentLanguageStore;
  // Une clé saisie ici remplacera celle du déploiement : le dire AVANT
  // l'enregistrement, pas après.
  $: willOverrideEnv = apiKey.trim() && settings.source === 'env';
  // Déclarations réactives et non fonctions : Svelte ne suit que les
  // identifiants qu'il VOIT (piège rencontré sur les autres écrans de réglages).
  $: keyChanged = !!apiKey.trim();
  $: modelChanged = !!model && model !== settings.transcriptionModel;
  // Du moins cher au plus cher, chacun avec son niveau en « € ».
  $: transcriptionChoices = pricedChoices(settings.transcriptionModels, prices?.transcription);
  $: transcriptionOptions = transcriptionChoices.map((choice) => ({
    id: choice.id,
    description: texts.models[choice.id] || '',
    tier: choice.tier,
    price: choice.unitEur === null ? '' : formatEuros(choice.unitEur, lang),
  }));
  // Ce que le choix en cours changerait à la dépense, par heure : dit AVANT
  // d'enregistrer, quand les deux prix sont connus.
  $: selectedHourEur = transcriptionChoices.find((choice) => choice.id === model)?.unitEur ?? null;
  $: serviceHourEur =
    transcriptionChoices.find((choice) => choice.id === settings.transcriptionModel)?.unitEur ??
    null;
  $: priceDelta =
    modelChanged && selectedHourEur !== null && serviceHourEur !== null
      ? selectedHourEur - serviceHourEur
      : null;
  $: priceDeltaText =
    priceDelta === null
      ? ''
      : Math.abs(priceDelta) < 0.005
        ? texts.priceDeltaSame
        : (priceDelta < 0 ? texts.priceDeltaLess : texts.priceDeltaMore).replace(
            '{amount}',
            formatEuros(Math.abs(priceDelta), lang),
          );
  $: provenance = pricingLines(prices, $uiText.adminStats.costs, lang);
  // Midi UTC : un jour civil lu à minuit UTC tomberait la veille à l'ouest.
  $: retired = settings.transcriptionModelRetired;
  $: retiredText = retired
    ? texts.modelRetired
        .replace('{from}', retired.from)
        .replace('{date}', formatDate(`${retired.date}T12:00:00Z`, lang) || retired.date)
        .replace('{model}', settings.transcriptionModel)
    : '';
  $: summaryChanged = !!summaryModel && summaryModel !== settings.summaryModel;
  // Le menu doit pouvoir AFFICHER un modèle imposé par le serveur et absent de
  // la liste : sinon le <select> n'a aucune option correspondante, affiche le
  // premier élément, et l'écran ment sur le modèle réellement en service.
  $: summaryOptions = settings.summaryModels.includes(settings.summaryModel)
    ? settings.summaryModels
    : [settings.summaryModel, ...settings.summaryModels].filter(Boolean);
  // Normalisé des deux côtés (`!== false`) : une projection d'avant ce réglage
  // ne porte pas le champ, et son absence vaut « activée » — pas « modifiée ».
  $: infographicChanged = infographicEnabled !== (settings.infographicEnabled !== false);
  $: infographicImageChanged =
    !!infographicImageModel && infographicImageModel !== settings.infographicImageModel;
  // Même raison que pour la rédaction : un palier imposé par le déploiement et
  // absent de la liste doit rester AFFICHABLE, sinon le <select> retombe sur sa
  // première option et l'écran ment sur le modèle qui dessine.
  $: infographicImageOptions = settings.infographicImageModels.includes(
    settings.infographicImageModel,
  )
    ? settings.infographicImageModels
    : [settings.infographicImageModel, ...settings.infographicImageModels].filter(Boolean);
  // Comparé APRÈS trim des deux côtés : le serveur enregistre la valeur trimée,
  // sans quoi une espace finale laisserait le bouton actif après enregistrement.
  $: infographicStyleChanged = infographicStyle.trim() !== (settings.infographicStyle || '').trim();
  $: dirty =
    keyChanged ||
    modelChanged ||
    summaryChanged ||
    infographicChanged ||
    infographicImageChanged ||
    infographicStyleChanged;
  $: canSave = dirty && saveState !== 'saving';

  onMount(load);

  async function load() {
    loading = true;
    errorMessage = '';
    const res = await fetchAiSettings();
    loading = false;
    if (!res.ok) {
      errorMessage = messageFor(res.data);
      return;
    }
    settings = res.data.settings;
    prices = res.data.prices || null;
    model = settings.transcriptionModel;
    summaryModel = settings.summaryModel;
    infographicEnabled = settings.infographicEnabled !== false;
    infographicImageModel = settings.infographicImageModel;
    infographicStyle = settings.infographicStyle || '';
  }

  /**
   * Slug d'erreur → texte. `upstreamMessage` est le message d'OpenAI lui-même
   * (clé révoquée, quota épuisé…) : on le montre tel quel, il est plus précis
   * que tout ce qu'on pourrait écrire à sa place.
   */
  function messageFor(data) {
    const base =
      texts.errors[data?.error] || userTexts.errors[data?.error] || userTexts.errors.unknown;
    return data?.upstreamMessage ? `${base} — ${data.upstreamMessage}` : base;
  }

  async function save() {
    // Seuls les champs modifiés partent : absent = inchangé côté serveur.
    const patch = {};
    if (keyChanged) patch.apiKey = apiKey.trim();
    if (modelChanged) patch.transcriptionModel = model;
    if (summaryChanged) patch.summaryModel = summaryModel;
    if (infographicChanged) patch.infographicEnabled = infographicEnabled;
    if (infographicImageChanged) patch.infographicImageModel = infographicImageModel;
    if (infographicStyleChanged) patch.infographicStyle = infographicStyle.trim();
    const fields = {
      key: keyChanged,
      model: modelChanged,
      summary: summaryChanged,
      infographic: infographicChanged,
      imageModel: infographicImageChanged,
      style: infographicStyleChanged,
    };
    saveState = 'saving';
    errorMessage = '';
    testState = 'idle';
    modelTestState = 'idle';
    summaryTestState = 'idle';
    const res = await saveAiSettings(patch);
    if (!res.ok) {
      saveState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    settings = res.data.settings;
    prices = res.data.prices || null;
    apiKey = '';
    model = settings.transcriptionModel;
    summaryModel = settings.summaryModel;
    infographicEnabled = settings.infographicEnabled !== false;
    infographicImageModel = settings.infographicImageModel;
    infographicStyle = settings.infographicStyle || '';
    savedFields = fields;
    // L'interrupteur de l'infographie est une capacité de l'installation : la
    // case « Générer une infographie » et l'onglet Groupes la relisent sans
    // attendre un rechargement de page.
    if (fields.infographic) refreshCapabilities();
    // Les pastilles de configuration disent peut-être autre chose, maintenant.
    refreshConfigChecks();
    saveState = 'saved';
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
  }

  function discard() {
    apiKey = '';
    model = settings.transcriptionModel;
    summaryModel = settings.summaryModel;
    infographicEnabled = settings.infographicEnabled !== false;
    infographicImageModel = settings.infographicImageModel;
    infographicStyle = settings.infographicStyle || '';
    errorMessage = '';
  }

  async function test() {
    testState = 'testing';
    errorMessage = '';
    const res = await testAiKey();
    if (!res.ok) {
      testState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    testState = 'ok';
    setTimeout(() => {
      if (testState === 'ok') testState = 'idle';
    }, 2500);
  }

  function clearKey() {
    if (!confirm(texts.clearConfirm)) return;
    apiKey = '';
    saveState = 'saving';
    errorMessage = '';
    saveAiSettings({ apiKey: '' }).then((res) => {
      if (!res.ok) {
        saveState = 'idle';
        errorMessage = messageFor(res.data);
        return;
      }
      settings = res.data.settings;
      saveState = 'idle';
    });
  }

  /**
   * Enregistre le remplaçant d'un modèle retiré : le choix devient explicite et
   * l'avis disparaît. Sans ce bouton, garder le remplaçant serait impossible
   * depuis le sélecteur — il est déjà « en service », le choisir ne change rien.
   */
  async function keepReplacement() {
    saveState = 'saving';
    errorMessage = '';
    const res = await saveAiSettings({ transcriptionModel: settings.transcriptionModel });
    if (!res.ok) {
      saveState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    settings = res.data.settings;
    prices = res.data.prices || null;
    model = settings.transcriptionModel;
    savedFields = {
      key: false,
      model: true,
      summary: false,
      infographic: false,
      imageModel: false,
      style: false,
    };
    saveState = 'saved';
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
  }

  /**
   * Test RÉEL du modèle sélectionné : le serveur ouvre une session de
   * transcription avec lui. C'est ce qui distingue « ce modèle existe » de
   * « ce modèle est utilisable avec cette clé, dans cette organisation ».
   */
  async function testModel() {
    modelTestState = 'testing';
    errorMessage = '';
    const res = await testTranscriptionModel(model);
    if (!res.ok) {
      modelTestState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    modelTestState = 'ok';
    setTimeout(() => {
      if (modelTestState === 'ok') modelTestState = 'idle';
    }, 2500);
  }

  /**
   * Test d'ACCÈS au modèle de rédaction : un appel de chat minuscule côté
   * serveur. Il ne dit rien de la qualité du compte rendu — la seule question
   * qu'un écran peut trancher avant d'enregistrer est « cette organisation a-t-
   * elle accès à ce modèle ? ». Sinon, la panne se découvrirait à la première
   * génération, chez l'utilisateur.
   */
  async function testSummary() {
    summaryTestState = 'testing';
    errorMessage = '';
    const res = await testSummaryModel(summaryModel);
    if (!res.ok) {
      summaryTestState = 'idle';
      errorMessage = messageFor(res.data);
      return;
    }
    summaryTestState = 'ok';
    setTimeout(() => {
      if (summaryTestState === 'ok') summaryTestState = 'idle';
    }, 2500);
  }
</script>

<div class="ai-wrap">
  {#if loading}
    <div class="ai-skeleton" aria-hidden="true"></div>
  {:else}
    {#if errorMessage}
      <div class="ai-error" role="alert">{errorMessage}</div>
    {/if}

    <p class="ai-intro">{texts.intro}</p>

    <!-- ── Clé API ── -->
    <SettingsCard title={texts.keyTitle} hint={texts.keyIntro} icon={IconCpu} on={settings.hasKey}>
      <!-- Sans clé, rien n'est généré : c'est un geste à faire, pas un état neutre. -->
      <StatusBadge
        slot="badge"
        tone={settings.hasKey ? 'ok' : 'warn'}
        text={settings.hasKey ? texts.statusOn : texts.statusOff}
      />

      {#if settings.source === 'settings'}
        <p class="ai-note">
          {texts.sourceSettings} <code>{settings.hint}</code>
          {#if settings.updatedBy}<br /><span class="ai-meta"
              >{texts.updatedBy} {settings.updatedBy}</span
            >{/if}
        </p>
      {:else if settings.source === 'env'}
        <p class="ai-note">{texts.sourceEnv} <code>{settings.hint}</code></p>
      {:else}
        <p class="ai-note ai-note-warn">{texts.sourceNone}</p>
      {/if}

      <div class="ai-field">
        <label class="ai-label" for="ai-key">{texts.keyLabel}</label>
        <input
          id="ai-key"
          class="ai-input"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder={settings.hasKey ? texts.keyPlaceholderReplace : texts.keyPlaceholderNew}
          bind:value={apiKey}
        />
        <p class="ai-hint">{texts.keyHelp}</p>
        {#if willOverrideEnv}
          <p class="ai-warn">{texts.overrideEnvWarning}</p>
        {/if}
      </div>

      <div class="ai-card-actions">
        {#if testState === 'ok'}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.testOk}</span
          >
        {/if}
        {#if settings.source === 'settings'}
          <button
            type="button"
            class="ai-ghost"
            on:click={clearKey}
            disabled={saveState === 'saving'}
          >
            {texts.clear}
          </button>
        {/if}
        <button
          type="button"
          class="ai-ghost"
          on:click={test}
          disabled={!settings.hasKey || testState === 'testing' || saveState === 'saving'}
        >
          {testState === 'testing' ? texts.testing : texts.test}
        </button>
      </div>
    </SettingsCard>

    <!-- ── Modèle de rédaction du compte rendu ──
         Avant la transcription : c'est le réglage dont l'effet est le plus
         visible dans le produit fini. -->
    <SettingsCard
      title={texts.summaryTitle}
      hint={texts.summaryIntro}
      icon={IconDocumentText}
      on={true}
    >
      <div class="ai-field">
        <label class="ai-label" for="ai-summary-model">{texts.summaryLabel}</label>
        <select id="ai-summary-model" class="ai-input" bind:value={summaryModel}>
          <!-- La liste vient du serveur, plus l'éventuel modèle imposé par le
               déploiement : un menu sans option correspondante afficherait le
               premier élément et mentirait sur le modèle en service. -->
          {#each summaryOptions as id (id)}
            <option value={id}>{id}</option>
          {/each}
        </select>
        <p class="ai-hint">{texts.summaryModels[summaryModel] || ''}</p>
        {#if settings.summaryModelSource === 'env'}
          <p class="ai-hint">{texts.summarySourceEnv}</p>
        {:else if settings.summaryModelSource === 'default'}
          <p class="ai-hint">{texts.summarySourceDefault}</p>
        {/if}
        {#if settings.summaryModelOffList}
          <p class="ai-warn">{texts.summaryOffList}</p>
        {/if}
        <p class="ai-hint">{texts.summaryHelp}</p>
      </div>

      <div class="ai-card-actions">
        {#if summaryTestState === 'ok'}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.summaryTestOk}</span
          >
        {/if}
        <button
          type="button"
          class="ai-ghost"
          on:click={testSummary}
          disabled={!settings.hasKey || summaryTestState === 'testing' || saveState === 'saving'}
        >
          {summaryTestState === 'testing' ? texts.summaryTesting : texts.summaryTest}
        </button>
      </div>
    </SettingsCard>

    <!-- ── Modèle de transcription ── -->
    <SettingsCard title={texts.modelTitle} hint={texts.modelIntro} icon={IconMicrophone} on={true}>
      <div class="ai-field">
        <!-- La liste vient du serveur, ses prix aussi : proposer un modèle qu'il
             refuserait ne produirait qu'une panne au prochain enregistrement. -->
        <ModelPicker
          name="ai-transcription-model"
          legend={texts.modelLabel}
          bind:value={model}
          options={transcriptionOptions}
          current={settings.transcriptionModel}
          currentLabel={texts.modelInService}
          unit={texts.pricePerHour}
          levelLabel={texts.priceLevel}
          unknownLabel={prices ? texts.priceUnknown : ''}
        />
        <!-- Toujours présente, masquée tant qu'elle est vide : une zone
             d'annonce doit exister AVANT son texte pour qu'un lecteur d'écran
             dise l'écart au moment du choix. -->
        <p
          class="ai-delta"
          class:ai-delta-less={priceDelta !== null && priceDelta <= -0.005}
          class:ai-delta-more={priceDelta !== null && priceDelta >= 0.005}
          class:ai-delta-empty={!priceDeltaText}
          role="status"
        >
          {priceDeltaText}
        </p>
        {#if prices}
          <p class="ai-hint">{texts.pricesBasis}</p>
          <p class="ai-hint">
            {[provenance.prices, provenance.fx].filter(Boolean).join(' · ')}
            <button type="button" class="ai-link" on:click={() => selectPanelSection('stats')}>
              {texts.pricesRefreshLink}
            </button>
          </p>
        {/if}
        {#if settings.transcriptionModelSource === 'env'}
          <p class="ai-hint">{texts.modelSourceEnv}</p>
        {:else if settings.transcriptionModelSource === 'default'}
          <p class="ai-hint">{texts.modelSourceDefault}</p>
        {/if}
        {#if retired}
          <p class="ai-warn">
            {retiredText}
            <button
              type="button"
              class="ai-link"
              on:click={keepReplacement}
              disabled={saveState === 'saving'}
            >
              {texts.modelRetiredKeep.replace('{model}', settings.transcriptionModel)}
            </button>
          </p>
        {/if}
        <p class="ai-hint">{texts.modelHelp}</p>
      </div>

      <div class="ai-card-actions">
        {#if modelTestState === 'ok'}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.modelTestOk}</span
          >
        {/if}
        <button
          type="button"
          class="ai-ghost"
          on:click={testModel}
          disabled={!settings.hasKey || modelTestState === 'testing' || saveState === 'saving'}
        >
          {modelTestState === 'testing' ? texts.modelTesting : texts.modelTest}
        </button>
      </div>
    </SettingsCard>

    <!-- ── Infographie de compte rendu ── -->
    <SettingsCard
      title={texts.infographicTitle}
      hint={texts.infographicIntro}
      icon={IconGallery}
      on={infographicEnabled}
    >
      <StatusBadge
        slot="badge"
        tone={infographicEnabled ? 'ok' : 'neutral'}
        text={infographicEnabled ? texts.infographicOn : texts.infographicOff}
      />
      <div class="ai-toggle-row">
        <span class="ai-toggle-label">{texts.infographicToggleLabel}</span>
        <ToggleSwitch
          bind:checked={infographicEnabled}
          label={texts.infographicToggleLabel}
          disabled={saveState === 'saving'}
        />
      </div>
      <p class="ai-hint">{texts.infographicHelp}</p>

      <!-- Modèle d'image et style graphique : masqués quand l'infographie ne
           l'est pas — un générateur et une charte sans image à produire n'ont
           pas de sens. -->
      {#if infographicEnabled}
        <div class="ai-field">
          <label class="ai-label" for="ai-infographic-model">{texts.infographicModelLabel}</label>
          <select id="ai-infographic-model" class="ai-input" bind:value={infographicImageModel}>
            <!-- La liste vient du serveur, plus l'éventuel palier imposé par le
                 déploiement : un menu sans option correspondante afficherait le
                 premier élément et mentirait sur le modèle en service. -->
            {#each infographicImageOptions as id (id)}
              <option value={id}>{id}</option>
            {/each}
          </select>
          <p class="ai-hint">{texts.infographicModels[infographicImageModel] || ''}</p>
          {#if settings.infographicImageModelSource === 'env'}
            <p class="ai-hint">{texts.infographicModelSourceEnv}</p>
          {:else if settings.infographicImageModelSource === 'default'}
            <p class="ai-hint">{texts.infographicModelSourceDefault}</p>
          {/if}
          {#if settings.infographicImageModelOffList}
            <p class="ai-warn">{texts.infographicModelOffList}</p>
          {/if}
          <p class="ai-hint">{texts.infographicModelHelp}</p>
        </div>

        <div class="ai-field">
          <label class="ai-label" for="ai-infographic-style">{texts.infographicStyleLabel}</label>
          <textarea
            id="ai-infographic-style"
            class="ai-input ai-textarea"
            rows="3"
            maxlength={INFOGRAPHIC_STYLE_MAX}
            placeholder={texts.infographicStylePlaceholder}
            bind:value={infographicStyle}
          ></textarea>
          <p class="ai-hint">{texts.infographicStyleHelp}</p>
        </div>
      {/if}
    </SettingsCard>

    <!-- Barre collante : même anatomie que Configuration, Authentification et
         Actions — un bouton, sous les yeux quelle que soit la hauteur. -->
    <div class="ai-actions">
      {#if dirty}
        <span class="ai-unsaved">{texts.unsavedHint}</span>
        <button type="button" class="ai-ghost" on:click={discard} disabled={saveState === 'saving'}>
          {texts.discardChanges}
        </button>
      {:else if saveState === 'saved'}
        {#if savedFields.key}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.saved}</span
          >
        {/if}
        {#if savedFields.model}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.modelSaved}</span
          >
        {/if}
        {#if savedFields.summary}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.summarySaved}</span
          >
        {/if}
        {#if savedFields.infographic}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.infographicSaved}</span
          >
        {/if}
        {#if savedFields.imageModel}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" />
            {texts.infographicModelSaved}</span
          >
        {/if}
        {#if savedFields.style}
          <span class="ai-ok"
            ><IconCheck width="15" height="15" aria-hidden="true" />
            {texts.infographicStyleSaved}</span
          >
        {/if}
      {/if}
      <button type="button" class="ai-save" on:click={save} disabled={!canSave}>
        {saveState === 'saving' ? userTexts.saving : userTexts.save}
      </button>
    </div>
  {/if}
</div>

<style>
  .ai-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .ai-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }

  /* Anatomie des cartes : SettingsCard (ui/) ; pastilles : StatusBadge. */
  .ai-note {
    margin: 0;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px dashed var(--line-strong);
    font-size: 0.82rem;
    color: var(--ink-soft);
    line-height: 1.55;
  }
  .ai-note-warn {
    background: var(--warn-bg);
    border-color: var(--warn-line);
    color: var(--warn-text);
  }
  .ai-note code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.8rem;
    background: color-mix(in srgb, var(--brand-secondary) 4.2%, #f5f5f5);
    padding: 0.1rem 0.35rem;
    border-radius: 5px;
  }
  .ai-meta {
    font-size: 0.78rem;
    color: var(--ink-faint);
  }

  .ai-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .ai-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 11.2%, #5a5a5a);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ai-input {
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
  .ai-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .ai-textarea {
    resize: vertical;
    min-height: 4.5rem;
    line-height: 1.5;
    font-family: inherit;
  }
  .ai-hint {
    margin: 0.15rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  .ai-warn {
    margin: 0.3rem 0 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 0.85rem;
  }
  /* Écart de prix avec le modèle en service : vert s'il fait économiser,
     ambre s'il coûte plus — avant même d'enregistrer. */
  .ai-delta {
    margin: 0.35rem 0 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .ai-delta-less {
    border-color: var(--success-line);
    background: var(--success-bg);
    color: var(--success-text);
  }
  .ai-delta-more {
    border-color: var(--warn-line);
    background: var(--warn-bg);
    color: var(--warn-text);
  }
  .ai-delta-empty {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .ai-link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-weight: 600;
    color: var(--brand-text);
    cursor: pointer;
  }
  .ai-link:hover {
    text-decoration: underline;
  }
  .ai-link:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    border-radius: 3px;
  }
  .ai-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    color: var(--danger-text);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .ai-skeleton {
    height: 220px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: ai-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes ai-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ai-skeleton {
      animation: none;
    }
  }

  /* Ligne interrupteur de la carte Infographie — même anatomie que les lignes
     à interrupteur des autres onglets : libellé à gauche, interrupteur à droite. */
  .ai-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }
  .ai-toggle-label {
    font-size: 0.9rem;
    color: #1a1a1a;
  }

  /* Gestes propres à une carte (tester, retirer) : alignés à droite, dans la
     carte — ce ne sont pas des enregistrements. */
  .ai-card-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  /* ── Barre d'action collante — même bleed que les autres onglets ──
     Elle déborde sur le padding de `.ap-body` (22px, 16px en mobile) : sans ce
     bleed, le contenu défilerait dans la marge sous la barre. */
  .ai-actions {
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
  .ai-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: oklch(48% 0.12 150);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .ai-unsaved {
    font-size: 0.82rem;
    color: var(--ink-muted);
  }
  .ai-ghost {
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
  .ai-ghost:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-secondary) 5.3%, #f6f6f6);
  }
  .ai-ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ai-save {
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
      transform 0.1s;
  }
  .ai-save:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .ai-save:active:not(:disabled) {
    transform: scale(0.97);
  }
  .ai-save:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    .ai-actions {
      justify-content: stretch;
      bottom: -14px;
      margin: 0 -16px -14px;
      padding: 0.85rem 16px 14px;
    }
    .ai-actions button {
      flex: 1 1 auto;
    }
  }
</style>
