<script>
  /**
   * Onglet « Actions » du panneau d'administration : les boutons proposés aux
   * utilisateurs à l'issue de chaque réunion (sur la transcription) et après
   * chaque génération de résumé.
   *
   * Organisé par ACTION et non par contexte : une carte « Envoyer par mail »
   * porte ses deux interrupteurs, sa politique, son gabarit d'objet et son
   * bouton de test. Le découpage précédent (réunion / résumé / dépôt / politique
   * / gabarits) obligeait à visiter quatre cartes pour comprendre une seule
   * action, et à deviner laquelle des deux commandait quoi.
   *
   * Deux garde-fous, appliqués côté serveur ET reflétés ici :
   *   - « Envoyer par mail » n'apparaît que si un relais SMTP est configuré ;
   *   - « Entreposer » n'apparaît que si un fournisseur est choisi.
   * La carte d'aperçu montre les boutons tels qu'ils apparaîtront réellement,
   * garde-fous compris.
   *
   * Le compte relié est TRANSVERSAL (mail + dépôt) : il a sa propre tuile, pas
   * une place dans celle du dépôt, où il aurait laissé croire qu'il ne sert
   * qu'à ça.
   *
   * TABLEAU DE BORD REPLIÉ (2026-10-28), comme les onglets IA, Configuration
   * et Authentification : l'aperçu en tête, puis une tuile par bouton (mail,
   * dépôt, téléchargement) et une par réglage commun (compte relié, nom des
   * fichiers). Chaque tuile dit où son bouton apparaît et ce qui le règle ;
   * un clic déplie son réglage sous son groupe, un seul à la fois. Un bouton
   * activé mais inopérant (pas de relais, pas de compte) le dit sur sa tuile,
   * sans qu'on ait à la déplier.
   */
  import { onMount } from 'svelte';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconMail from '~icons/solar/letter-linear';
  import IconCloud from '~icons/solar/cloud-upload-linear';
  import IconDownload from '~icons/solar/download-minimalistic-linear';
  import IconEye from '~icons/solar/eye-linear';
  import IconLink from '~icons/solar/link-circle-linear';
  import IconText from '~icons/solar/text-field-linear';
  import IconTagIcon from '~icons/solar/tag-linear';
  import GoogleLogo from '../icons/GoogleLogo.svelte';
  import MicrosoftLogo from '../icons/MicrosoftLogo.svelte';
  import DashCard from '../ui/DashCard.svelte';
  import DashTile from '../ui/DashTile.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import ActionBarPreview from '../actions/ActionBarPreview.svelte';
  import ActionTestPanel from '../actions/ActionTestPanel.svelte';
  import TemplateField from '../settings/TemplateField.svelte';
  import { fetchActionsSettings, saveActionsSettings } from '../../services/adminUsersApi.js';
  import { refreshCapabilities } from '../../stores/auth.js';
  import { refreshConfigChecks } from '../../stores/configChecks.js';
  import { uiText } from '../../store.js';
  import { runActionTestAction } from '../../utils/postActions.js';
  import { fill, formatText } from '../../utils/i18nFormat.js';

  let transcription = { email: true, storage: true, download: true };
  let summary = { email: true, storage: true, download: true };
  /**
   * `provider` et `sharepoint` appartiennent à `connections` côté serveur ;
   * `folder` à `storage`. Ils vivent ensemble ici parce qu'ils forment une
   * seule carte à l'écran — la correspondance se fait dans `apply` et `save`.
   */
  let storage = { provider: '', sharepoint: true, folder: '' };
  let mail = { allowSmtpExternal: false, maxRecipients: 10, subjectTemplate: '' };
  let naming = { filenameTemplate: '' };
  let emailAvailable = false;
  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  let errorMessage = '';
  /**
   * Variables des gabarits, servies par le SERVEUR — même allowlist que l'écran
   * utilisateur et que la validation à l'enregistrement
   * (lib/actions/templating.js). La liste était recopiée ici : elle aurait
   * divergé au premier ajout, et l'écran aurait proposé une variable refusée.
   */
  let variables = [];
  /** Dernier test par cible, et snapshot des réglages au moment du test. */
  let tests = { email: null, storage: null };
  let running = '';
  /** Réglages tels qu'enregistrés, pour savoir ce qui a bougé depuis. */
  let savedSnapshot = '';
  /** Dernière réponse du serveur, pour annuler sans refaire un aller-retour. */
  let savedData = null;
  /** Réglages enregistrés, par groupe : la référence de « Modifié » sur les tuiles. */
  let saved = null;
  // Le réglage déplié sous les tuiles : un seul à la fois.
  let openSection = ''; // '' | 'email' | 'storage' | 'download' | 'account' | 'naming'

  $: texts = $uiText.adminActions;
  $: userTexts = $uiText.adminUsers;
  // Les slugs d'action ne sont pas dans le dictionnaire de l'administration :
  // ils appartiennent à la chaîne d'exécution, partagée avec l'écran utilisateur.
  $: actionTexts = $uiText.configActions;
  $: saving = saveState === 'saving';
  // Les garde-fous de l'aperçu : un bouton coché mais inopérant n'apparaîtra pas.
  $: emailBlocked = !emailAvailable && (transcription.email || summary.email);
  $: storageBlocked = !storage.provider && (transcription.storage || summary.storage);
  // Les cinq groupes sont nommés dans l'expression : Svelte ne suit que les
  // identifiants qu'il VOIT, et `signature()` seule ne déclencherait aucun
  // recalcul — « Enregistrer » resterait figé sur l'état du montage.
  $: current = signature(transcription, summary, storage, mail, naming);
  $: dirty = !loading && savedSnapshot !== '' && current !== savedSnapshot;
  /** Valeurs d'exemple des aperçus de gabarit — jamais de vraies données. */
  $: sample = {
    titre: actionTexts.sampleTitle,
    date: actionTexts.sampleDate,
    type: actionTexts.sampleType,
    compte: actionTexts.sampleAccount,
  };
  $: testTexts = { running: texts.testRunning, stale: actionTexts.testStale };
  /**
   * `stale` est calculé en déclaration réactive et non dans une fonction :
   * Svelte ne suit que les identifiants qu'il voit dans l'expression, et caché
   * derrière un appel, `dirty` ne déclencherait aucun recalcul.
   */
  $: emailResult = tests.email && { ...tests.email, stale: dirty || tests.email.at !== current };
  $: storageResult = tests.storage && {
    ...tests.storage,
    stale: dirty || tests.storage.at !== current,
  };

  onMount(load);

  /**
   * Signature des réglages à l'écran. Sert à deux choses : activer
   * « Enregistrer » seulement s'il y a quelque chose à enregistrer, et périmer un
   * résultat de test dès que les valeurs testées ne sont plus celles affichées.
   *
   * Prend ses parts en arguments plutôt que de lire les variables du composant :
   * c'est ce qui permet à la déclaration réactive de nommer ses dépendances.
   */
  function signature(...parts) {
    return JSON.stringify(parts);
  }

  async function load() {
    loading = true;
    errorMessage = '';
    const res = await fetchActionsSettings();
    loading = false;
    if (!res.ok) {
      errorMessage = userTexts.errors[res.data.error] || userTexts.errors.unknown;
      return;
    }
    apply(res.data);
  }

  /**
   * Réglages reçus du serveur → état local. Un seul endroit à relire.
   *
   * Le fournisseur est lu dans `connections`, qui désigne le compte relié
   * (mail ET Drive) ; `storage` ne garde que le dossier cible.
   */
  function apply(data) {
    const s = data.settings;
    transcription = { ...s.transcription };
    summary = { ...s.summary };
    storage = {
      provider: s.connections?.provider || '',
      // Absent d'une réponse servie par une version antérieure : demandé.
      sharepoint: s.connections?.sharepoint !== false,
      folder: s.storage.folder || '',
    };
    mail = { ...mail, ...(s.mail || {}) };
    naming = { ...naming, ...(s.naming || {}) };
    emailAvailable = !!s.emailAvailable;
    if (data.variables) variables = data.variables;
    savedData = data;
    savedSnapshot = signature(transcription, summary, storage, mail, naming);
    saved = JSON.parse(savedSnapshot);
  }

  function toggleSection(id) {
    openSection = openSection === id ? '' : id;
  }

  /** Résultat de test → forme affichable. `postActions.js` rend des CLÉS. */
  function toResult(outcome, at) {
    return {
      ok: outcome.ok,
      title: formatText($uiText, outcome.key, outcome.vars),
      details: (outcome.details || []).map((line) => ({
        label: formatText($uiText, line.labelKey),
        value: line.sourceKey
          ? `${line.value} (${formatText($uiText, line.sourceKey)})`.replace(' ()', '')
          : line.value,
      })),
      at,
    };
  }

  /**
   * Lance un test RÉEL avec le compte de l'administrateur, en ignorant ses
   * réglages personnels (`scope: 'admin'`) : ce qu'on veut valider ici, ce sont
   * les valeurs de l'organisation, pas la surcharge de celui qui clique.
   *
   * Le test lit les valeurs ENREGISTRÉES : avec des modifications en attente, on
   * enregistre d'abord, sinon le bouton validerait ce qui n'est plus à l'écran.
   */
  async function runTest(target) {
    if (dirty && !(await save())) return;
    running = target;
    const outcome = await runActionTestAction(
      { target, scope: 'admin' },
      { errors: actionTexts.errors },
    );
    tests = {
      ...tests,
      [target]: toResult(outcome, signature(transcription, summary, storage, mail, naming)),
    };
    running = '';
  }

  async function save() {
    saveState = 'saving';
    errorMessage = '';
    const res = await saveActionsSettings({
      transcription,
      summary,
      connections: { provider: storage.provider, sharepoint: storage.sharepoint },
      storage: { folder: storage.folder },
      mail: {
        allowSmtpExternal: mail.allowSmtpExternal,
        maxRecipients: Number(mail.maxRecipients) || 0,
        subjectTemplate: mail.subjectTemplate,
      },
      naming: { filenameTemplate: naming.filenameTemplate },
    });
    if (!res.ok) {
      saveState = 'idle';
      errorMessage =
        actionTexts.errors[res.data.error] ||
        userTexts.errors[res.data.error] ||
        userTexts.errors.unknown;
      return false;
    }
    apply(res.data);
    saveState = 'saved';
    // Les boutons de l'écran principal lisent $auth.capabilities.actions :
    // sans ce rafraîchissement, ils resteraient figés jusqu'au rechargement.
    refreshCapabilities();
    // Les pastilles de configuration disent peut-être autre chose, maintenant.
    refreshConfigChecks();
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
    return true;
  }

  /**
   * Ramène les champs sur les valeurs enregistrées — bouton « Annuler ».
   * Relit la dernière réponse du serveur plutôt que d'en redemander une : un
   * squelette qui clignote pour revenir à ce qui était déjà à l'écran donnerait
   * l'impression d'une opération lourde.
   */
  function discard() {
    if (savedData) apply(savedData);
  }

  /** Boutons réellement visibles pour un contexte, garde-fous compris. */
  function visibleActions(section, provider, mailOk) {
    return [
      ...(section.email && mailOk ? [{ key: 'email', icon: IconMail }] : []),
      ...(section.storage && provider ? [{ key: 'storage', icon: IconCloud }] : []),
      ...(section.download ? [{ key: 'download', icon: IconDownload }] : []),
    ];
  }
  $: transcriptionPreview = visibleActions(transcription, storage.provider, emailAvailable);
  $: summaryPreview = visibleActions(summary, storage.provider, emailAvailable);

  const PROVIDERS = [
    { id: '', labelKey: 'providerNone', logo: null },
    { id: 'google', labelKey: 'providerGdrive', logo: GoogleLogo },
    { id: 'microsoft', labelKey: 'providerSharepoint', logo: MicrosoftLogo },
  ];

  // ── Tuiles : où chaque bouton apparaît, ce qui le règle ──
  /** Les deux contextes d'un bouton, en un mot. */
  function scopeText(afterMeeting, afterSummary) {
    if (afterMeeting && afterSummary) return texts.tileScopeBoth;
    if (afterMeeting) return texts.tileScopeMeeting;
    if (afterSummary) return texts.tileScopeSummary;
    return texts.tileScopeNone;
  }
  // `saved` est le tableau de `signature()` : [transcription, summary, storage, mail, naming].
  // Chaque groupe est nommé dans l'expression, pour la même raison que `current`.
  $: changed = saved
    ? {
        email:
          transcription.email !== saved[0].email ||
          summary.email !== saved[1].email ||
          signature(mail) !== signature(saved[3]),
        storage:
          transcription.storage !== saved[0].storage ||
          summary.storage !== saved[1].storage ||
          storage.folder !== saved[2].folder,
        download:
          transcription.download !== saved[0].download || summary.download !== saved[1].download,
        account:
          storage.provider !== saved[2].provider || storage.sharepoint !== saved[2].sharepoint,
        naming: naming.filenameTemplate !== saved[4].filenameTemplate,
      }
    : {};
  $: provider = PROVIDERS.find((option) => option.id === storage.provider) || PROVIDERS[0];
  $: folderText = storage.folder.trim()
    ? fill(texts.tileFolder, { folder: storage.folder.trim() })
    : texts.tileFolderDefault;
  $: buttonTiles = [
    {
      id: 'email',
      icon: IconMail,
      label: texts.actionEmail,
      value: scopeText(transcription.email, summary.email),
      sub: fill(texts.tileMailSub, { max: Number(mail.maxRecipients) || 0 }),
      warn: emailBlocked ? texts.tileMailBlocked : '',
      changed: changed.email,
    },
    {
      id: 'storage',
      icon: IconCloud,
      label: texts.actionStorage,
      value: scopeText(transcription.storage, summary.storage),
      sub: storage.provider ? folderText : texts.tileNoAccount,
      warn: storageBlocked ? texts.tileStorageBlocked : '',
      changed: changed.storage,
    },
    {
      id: 'download',
      icon: IconDownload,
      label: texts.actionDownload,
      value: scopeText(transcription.download, summary.download),
      sub: texts.tileDownloadSub,
      changed: changed.download,
    },
  ];
  $: sharedTiles = [
    {
      id: 'account',
      icon: IconLink,
      label: texts.providerCardTitle,
      value: texts[provider.labelKey],
      subLogo: provider.logo,
      sub:
        storage.provider === 'microsoft'
          ? storage.sharepoint
            ? texts.tileSharePointOn
            : texts.tileSharePointOff
          : storage.provider
            ? texts.tileAccountSub
            : texts.tileAccountNone,
      changed: changed.account,
    },
    {
      id: 'naming',
      icon: IconText,
      label: texts.tileNaming,
      value: naming.filenameTemplate.trim() || texts.tileNamingDefault,
      sub: texts.tileNamingSub,
      changed: changed.naming,
    },
  ];
</script>

<div class="ac-wrap">
  {#if loading}
    <div class="ac-skeleton" aria-hidden="true">
      <div class="ac-skeleton-card"></div>
      <div class="ac-skeleton-card"></div>
      <div class="ac-skeleton-card"></div>
    </div>
  {:else}
    <div class="ac-body">
      {#if errorMessage}
        <div class="ac-error" role="alert">{errorMessage}</div>
      {/if}

      <!-- ── Aperçu : ce que verront les utilisateurs ── -->
      <DashCard id="ac-preview" icon={IconEye} title={texts.previewTitle} info={texts.previewIntro}>
        <div class="ac-previews">
          <ActionBarPreview
            actions={transcriptionPreview}
            label={texts.previewMeeting}
            emptyText={texts.previewEmpty}
          />
          <ActionBarPreview
            actions={summaryPreview}
            label={texts.previewSummary}
            emptyText={texts.previewEmpty}
          />
        </div>
      </DashCard>

      <!-- ── Les boutons : une tuile chacun, son réglage déplié au clic ── -->
      <h3 class="ac-group">{texts.groupButtons}</h3>
      <div class="ac-tiles">
        {#each buttonTiles as tile (tile.id)}
          <DashTile
            icon={tile.icon}
            label={tile.label}
            open={openSection === tile.id}
            flag={tile.warn || (tile.changed ? texts.tileChanged : '')}
            warn={!!tile.warn}
            sub={tile.sub}
            on:click={() => toggleSection(tile.id)}>{tile.value}</DashTile
          >
        {/each}
      </div>

      {#if openSection === 'email'}
        <DashCard id="ac-email" level={5} title={texts.mailCardTitle} info={texts.mailCardIntro}>
          <div class="ac-scopes">
            <div class="ac-scope" class:ac-scope-on={transcription.email}>
              <span class="ac-scope-text">{texts.meetingTitle}</span>
              <ToggleSwitch
                bind:checked={transcription.email}
                label="{texts.actionEmail} — {texts.meetingTitle}"
                disabled={saving}
              />
            </div>
            <div class="ac-scope" class:ac-scope-on={summary.email}>
              <span class="ac-scope-text">{texts.summaryTitle}</span>
              <ToggleSwitch
                bind:checked={summary.email}
                label="{texts.actionEmail} — {texts.summaryTitle}"
                disabled={saving}
              />
            </div>
          </div>
          {#if emailBlocked}
            <p class="ac-warn" role="alert">{texts.emailUnavailable}</p>
          {/if}

          <!-- Politique : deux lignes de réglage de même anatomie (intitulé +
               explication à gauche, commande à droite), comme partout ailleurs
               dans l'administration. -->
          <ul class="ac-rows">
            <li class="ac-row">
              <label class="ac-row-text" for="ac-max-recipients">
                <span class="ac-row-label">{texts.maxRecipientsLabel}</span>
                <span class="ac-row-hint">{texts.maxRecipientsHint}</span>
              </label>
              <!-- aria-label : le nom accessible reste l'intitulé seul, pas
                   l'intitulé suivi de son explication. -->
              <input
                id="ac-max-recipients"
                class="ac-input ac-input-narrow"
                aria-label={texts.maxRecipientsLabel}
                type="number"
                min="0"
                max="20"
                disabled={saving}
                bind:value={mail.maxRecipients}
              />
            </li>
            <li class="ac-row">
              <span class="ac-row-text">
                <span class="ac-row-label">{texts.allowSmtpExternalLabel}</span>
                <span class="ac-row-hint">{texts.allowSmtpExternalHint}</span>
                {#if !mail.allowSmtpExternal}
                  <span class="ac-row-state">{texts.allowSmtpExternalOff}</span>
                {/if}
              </span>
              <ToggleSwitch
                bind:checked={mail.allowSmtpExternal}
                label={texts.allowSmtpExternalLabel}
                disabled={saving}
              />
            </li>
          </ul>

          <!-- Ce que vos utilisateurs peuvent faire de ce plafond : une liste par
               défaut, et une liste PAR TAG qui la remplace. Informatif — la règle
               vit côté serveur (lib/actions/recipients.js) et n'a pas
               d'interrupteur : un tag sans liste ne change rien à l'envoi. -->
          <div class="ac-note ac-note-rule">
            <IconTagIcon width="15" height="15" aria-hidden="true" />
            <span>
              <strong>{texts.tagRecipientsRuleTitle}</strong>
              {texts.tagRecipientsRuleBody}
            </span>
          </div>

          <TemplateField
            id="ac-subject-tpl"
            bind:value={mail.subjectTemplate}
            label={texts.subjectTemplateLabel}
            placeholder={texts.subjectTemplatePlaceholder}
            {variables}
            variablesLabel={actionTexts.variablesLabel}
            previewLabel={actionTexts.previewLabel}
            {sample}
            mode="subject"
            disabled={saving}
          />

          <ActionTestPanel
            target="email"
            {dirty}
            running={running === 'email'}
            disabled={saving || !!running || !emailAvailable}
            disabledReason={!emailAvailable ? texts.testEmailDisabled : texts.testScopeHint}
            result={emailResult}
            texts={{
              ...testTexts,
              run: texts.testEmail,
              runDirty: actionTexts.saveAndTestEmail,
            }}
            on:run={() => runTest('email')}
          />
        </DashCard>
      {:else if openSection === 'storage'}
        <DashCard
          id="ac-storage"
          level={5}
          title={texts.storageCardTitle}
          info={texts.storageCardIntro}
        >
          <div class="ac-scopes">
            <div class="ac-scope" class:ac-scope-on={transcription.storage}>
              <span class="ac-scope-text">{texts.meetingTitle}</span>
              <ToggleSwitch
                bind:checked={transcription.storage}
                label="{texts.actionStorage} — {texts.meetingTitle}"
                disabled={saving}
              />
            </div>
            <div class="ac-scope" class:ac-scope-on={summary.storage}>
              <span class="ac-scope-text">{texts.summaryTitle}</span>
              <ToggleSwitch
                bind:checked={summary.storage}
                label="{texts.actionStorage} — {texts.summaryTitle}"
                disabled={saving}
              />
            </div>
          </div>
          {#if storageBlocked}
            <p class="ac-warn" role="alert">
              {texts.storageNotConfigured}
              <button type="button" class="ac-link" on:click={() => (openSection = 'account')}>
                {texts.chooseAccount}
              </button>
            </p>
          {/if}

          {#if storage.provider}
            <div class="ac-field">
              <label class="ac-label" for="ac-folder">{texts.folderLabel}</label>
              <input
                id="ac-folder"
                class="ac-input"
                type="text"
                autocomplete="off"
                spellcheck="false"
                placeholder={texts.folderPlaceholder}
                disabled={saving}
                bind:value={storage.folder}
              />
              <p class="ac-hint">{texts.folderHint}</p>
            </div>
            <p class="ac-note">{texts.storageNotConnected}</p>
          {/if}

          <ActionTestPanel
            target="storage"
            {dirty}
            running={running === 'storage'}
            disabled={saving || !!running || !storage.provider}
            disabledReason={!storage.provider ? texts.testStorageDisabled : texts.testScopeHint}
            result={storageResult}
            texts={{
              ...testTexts,
              run: texts.testStorage,
              runDirty: actionTexts.saveAndTestStorage,
            }}
            on:run={() => runTest('storage')}
          />
        </DashCard>
      {:else if openSection === 'download'}
        <DashCard
          id="ac-download"
          level={5}
          title={texts.downloadCardTitle}
          info={texts.downloadCardIntro}
        >
          <div class="ac-scopes">
            <div class="ac-scope" class:ac-scope-on={transcription.download}>
              <span class="ac-scope-text">{texts.meetingTitle}</span>
              <ToggleSwitch
                bind:checked={transcription.download}
                label="{texts.actionDownload} — {texts.meetingTitle}"
                disabled={saving}
              />
            </div>
            <div class="ac-scope" class:ac-scope-on={summary.download}>
              <span class="ac-scope-text">{texts.summaryTitle}</span>
              <ToggleSwitch
                bind:checked={summary.download}
                label="{texts.actionDownload} — {texts.summaryTitle}"
                disabled={saving}
              />
            </div>
          </div>
        </DashCard>
      {/if}

      <!-- ── Réglages communs : le compte relié (mail ET dépôt), le nom des fichiers ── -->
      <h3 class="ac-group">{texts.groupShared}</h3>
      <div class="ac-tiles ac-tiles-2">
        {#each sharedTiles as tile (tile.id)}
          <DashTile
            icon={tile.icon}
            label={tile.label}
            open={openSection === tile.id}
            flag={tile.changed ? texts.tileChanged : ''}
            sub={tile.sub}
            subLogo={tile.subLogo}
            on:click={() => toggleSection(tile.id)}>{tile.value}</DashTile
          >
        {/each}
      </div>

      {#if openSection === 'account'}
        <DashCard
          id="ac-account"
          level={5}
          title={texts.providerCardTitle}
          info={texts.providerCardIntro}
        >
          <div class="ac-field">
            <span class="ac-label">{texts.providerLabel}</span>
            <div class="ac-providers" role="radiogroup" aria-label={texts.providerLabel}>
              {#each PROVIDERS as option (option.id)}
                <button
                  type="button"
                  class="ac-provider"
                  class:ac-provider-active={storage.provider === option.id}
                  role="radio"
                  aria-checked={storage.provider === option.id}
                  disabled={saving}
                  on:click={() => {
                    storage = { ...storage, provider: option.id };
                  }}
                >
                  {#if option.logo}
                    <svelte:component this={option.logo} size={18} />
                  {:else}
                    <span class="ac-provider-none" aria-hidden="true">—</span>
                  {/if}
                  <span>{texts[option.labelKey]}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- Microsoft seul : Google n'a aucun scope retirable. -->
          {#if storage.provider === 'microsoft'}
            <div class="ac-scope" class:ac-scope-on={storage.sharepoint}>
              <span class="ac-scope-text">{texts.sharePointScopeLabel}</span>
              <ToggleSwitch
                bind:checked={storage.sharepoint}
                label={texts.sharePointScopeLabel}
                disabled={saving}
              />
            </div>
            <p class="ac-hint">
              {storage.sharepoint ? texts.sharePointScopeOnHint : texts.sharePointScopeOffHint}
            </p>
          {/if}
        </DashCard>
      {:else if openSection === 'naming'}
        <DashCard
          id="ac-naming"
          level={5}
          title={texts.filenameCardTitle}
          info={texts.filenameCardIntro}
        >
          <TemplateField
            id="ac-filename-tpl"
            bind:value={naming.filenameTemplate}
            label={texts.filenameTemplateLabel}
            placeholder={texts.filenameTemplatePlaceholder}
            hint={texts.templateHint}
            {variables}
            variablesLabel={actionTexts.variablesLabel}
            previewLabel={actionTexts.previewLabel}
            {sample}
            mode="filename"
            disabled={saving}
          />
        </DashCard>
      {/if}
    </div>

    <!-- Barre collante : même anatomie que Configuration, Authentification et IA. -->
    <div class="ac-actions">
      {#if dirty}
        <span class="ac-unsaved">{texts.unsavedHint}</span>
        <button type="button" class="ac-ghost" on:click={discard} disabled={saving}>
          {texts.discardChanges}
        </button>
      {:else if saveState === 'saved'}
        <span class="ac-saved"
          ><IconCheck width="15" height="15" aria-hidden="true" /> {texts.saved}</span
        >
      {/if}
      <button type="button" class="ac-save" on:click={save} disabled={!dirty || saving}>
        {saving ? userTexts.saving : userTexts.save}
      </button>
    </div>
  {/if}
</div>

<style>
  .ac-wrap {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .ac-body {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  /* Cartes et tuiles : DashCard, DashTile (ui/) — la même anatomie que les
     onglets IA, Configuration et Authentification. Ne restent ici que les
     groupes et le contenu des panneaux. */
  .ac-group {
    margin: 0.3rem 0 -0.35rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-faint);
  }
  .ac-tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
  }
  .ac-tiles-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ac-link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-weight: 600;
    color: var(--brand-text);
    cursor: pointer;
  }
  .ac-link:hover {
    text-decoration: underline;
  }
  .ac-link:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    border-radius: 3px;
  }
  .ac-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }

  /* ── Aperçu : les deux barres côte à côte ── */
  .ac-previews {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px 20px;
  }

  /* ── Portée d'une action : réunion · résumé, sur UNE ligne ──
     Deux tuiles côte à côte plutôt que deux lignes pleine largeur : la même
     question (« où le bouton apparaît ») posée trois fois prenait la moitié
     de la page. La tuile allumée se teinte : on lit l'état sans chercher
     l'interrupteur. */
  .ac-scopes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 8px;
  }
  .ac-scope {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .ac-scope-on {
    background: var(--brand-secondary-soft-08);
    border-color: var(--brand-secondary-soft-18);
  }
  .ac-scope-text {
    flex: 1;
    min-width: 0;
    font-size: 0.86rem;
    font-weight: 500;
    color: var(--ink);
  }

  /* ── Lignes de réglage ── */
  .ac-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ac-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .ac-row-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 0.88rem;
    color: var(--ink);
  }
  .ac-row-label {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ink);
  }
  .ac-row-hint {
    font-size: 0.78rem;
    font-weight: 400;
    color: var(--ink-faint);
    line-height: 1.4;
  }
  .ac-row-state {
    margin-top: 3px;
    font-size: 0.76rem;
    color: var(--ink-muted);
  }
  .ac-row .ac-input-narrow {
    flex: 0 0 auto;
    width: 5.5rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* ── Champs ── */
  .ac-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .ac-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ac-input {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 0.92rem;
    font-family: inherit;
    background: var(--surface);
    color: var(--ink);
    width: 100%;
    box-sizing: border-box;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .ac-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft-15);
  }
  .ac-input:disabled {
    opacity: 0.6;
  }
  .ac-input-narrow {
    max-width: 8rem;
  }

  /* ── Fournisseur ── */
  .ac-providers {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .ac-provider {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.86rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color 0.15s,
      box-shadow 0.15s,
      background 0.15s;
  }
  .ac-provider:hover:not(:disabled) {
    border-color: var(--line-faint);
  }
  .ac-provider-active {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft-15);
    color: var(--ink);
    font-weight: 600;
  }
  .ac-provider:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .ac-provider-none {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    color: var(--ink-faint);
    font-weight: 700;
  }

  /* ── Notes et alertes ── */
  .ac-note {
    margin: 0;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px dashed var(--line);
    font-size: 0.8rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .ac-note-rule {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .ac-note-rule :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--brand-text);
  }
  .ac-note-rule strong {
    display: block;
    font-weight: 600;
    color: var(--ink);
  }
  .ac-warn {
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn-text);
    font-size: 0.85rem;
    line-height: 1.5;
  }
  .ac-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-line);
    color: var(--danger-text);
    font-size: 0.9rem;
  }

  /* ── Squelette de chargement ── */
  .ac-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .ac-skeleton-card {
    height: 150px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: ac-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes ac-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ac-skeleton-card {
      animation: none;
    }
  }

  /* ── Barre d'action collante — même bleed que l'onglet Authentification ── */
  .ac-actions {
    position: sticky;
    bottom: -22px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    border-top: 1px solid var(--line);
    margin: 0.9rem -22px -22px;
    padding: 0.85rem 22px 22px;
    background: var(--surface);
  }
  .ac-unsaved {
    margin-right: auto;
    font-size: 0.82rem;
    font-weight: 500;
    color: color-mix(in srgb, var(--brand) 56.9%, #010101);
  }
  .ac-saved {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--success-text);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .ac-ghost {
    padding: 0.55rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.88rem;
    cursor: pointer;
  }
  .ac-ghost:hover:not(:disabled) {
    border-color: var(--line-faint);
  }
  .ac-ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ac-save {
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
  .ac-save:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .ac-save:active:not(:disabled) {
    transform: scale(0.97);
  }
  .ac-save:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    .ac-tiles,
    .ac-tiles-2 {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.45rem;
    }
    .ac-providers {
      flex-direction: column;
      align-items: stretch;
    }
    .ac-provider {
      justify-content: center;
    }
    /* Même barre que les onglets IA, Configuration et Authentification : les
       boutons prennent la largeur, au pouce. */
    .ac-actions {
      flex-wrap: wrap;
      justify-content: stretch;
      bottom: -14px;
      margin: 0.9rem -16px -14px;
      padding: 0.85rem 16px 14px;
    }
    .ac-unsaved {
      flex-basis: 100%;
    }
    .ac-actions button {
      flex: 1 1 auto;
    }
  }
</style>
