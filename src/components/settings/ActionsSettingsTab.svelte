<script>
  /**
   * Onglet « Actions » de « Ma configuration ».
   *
   * L'utilisateur y règle ce qui lui appartient : à qui partent ses comptes
   * rendus, dans quel dossier ils se déposent, sous quel objet et sous quel nom.
   * Pas les interrupteurs — l'administration est un plafond, et ce que ce
   * plafond laisse ouvert arrive dans `ceiling`.
   *
   * Organisé par ACTION et non par type de réglage : une carte = « où ça part,
   * avec quoi, et le bouton pour le vérifier ». Grouper les destinataires d'un
   * côté et le test de l'autre obligeait à faire des allers-retours pour savoir
   * ce que le test venait de valider.
   *
   * Une action = une PAGE, depuis que la colonne de gauche porte le groupe
   * « Actions » (Envoi d'email · Entreposer · Connexion) : la prop `section`
   * dit laquelle est à l'écran. Le composant reste unique — voir sa
   * justification sur la prop.
   *
   * La saisie vit dans `actionDraft` (store) et non en variables locales :
   * changer d'onglet démonte ce composant, et sans enregistrement automatique
   * une saisie perdue en cliquant ailleurs est une saisie perdue en silence.
   *
   * Composant AUTONOME pour ses réglages : il charge et enregistre lui-même, et
   * lit `$uiText` directement. Aucun réglage ne traverse App.svelte, qui est à
   * son plafond `max-lines` (cf. eslint.config.js). Seul l'état du compte relié
   * arrive en props — le panneau parent le possède déjà pour l'onglet « Envoi
   * par mail », et le redemander ferait deux sources de vérité.
   */
  import { onMount } from 'svelte';
  import IconMail from '~icons/solar/letter-linear';
  import IconCloud from '~icons/solar/cloud-upload-linear';
  import IconText from '~icons/solar/text-field-linear';
  import IconInfo from '~icons/solar/info-circle-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconStars from '~icons/solar/stars-minimalistic-linear';
  import RecipientList from './RecipientList.svelte';
  import TemplateField from './TemplateField.svelte';
  import DriveFolderPicker from './DriveFolderPicker.svelte';
  import TagRecipientsDialog from './TagRecipientsDialog.svelte';
  import TagChip from '../TagChip.svelte';
  import ConnectionStatusBanner from './ConnectionStatusBanner.svelte';
  import SettingsCard from '../ui/SettingsCard.svelte';
  import StatusBadge from '../ui/StatusBadge.svelte';
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import StorageLogo from '../icons/StorageLogo.svelte';
  import { tagColorVars } from '../../stores/tags.js';
  import IconFolderOpen from '~icons/solar/folder-with-files-linear';
  import ActionTestPanel from '../actions/ActionTestPanel.svelte';
  import { saveActionSettings } from '../../services/actionsApi.js';
  import {
    actionSettings,
    actionDraft,
    actionSettingsDirty,
    refreshActionSettings,
    applyActionSettings,
    seedActionDraft,
    resetActionDraft,
  } from '../../stores/actionSettings.js';
  import { runActionTestAction } from '../../utils/postActions.js';
  import { formatText } from '../../utils/i18nFormat.js';
  import { storageLabel, libraryKind } from '../../utils/storageVocabulary.js';
  import { uiText } from '../../store.js';
  import { refreshConfigChecks } from '../../stores/configChecks.js';
  import { tags, tagColors, loadTags } from '../../stores/tags.js';

  /** Payload de GET /api/connect/status, tenu par le panneau parent. */
  export let connectStatus = null;
  export let connectLoading = false;
  export let onConnect = () => {};
  /**
   * Quelle action cet écran configure : `'mail'` (envoi d'email) ou
   * `'storage'` (entreposer). Une action = une page de la colonne de gauche.
   *
   * Un SEUL composant pour les deux, et non deux fichiers : le brouillon,
   * l'enregistrement, la traduction des erreurs et l'enchaînement
   * « enregistrer puis tester » sont communs — les dupliquer garantirait de
   * corriger un jour l'un sans l'autre. Ce qui diffère tient dans les cartes.
   */
  export let section = 'mail';

  $: a = $uiText.configActions;
  $: errors = a.errors || {};

  /** `null`, `'root'`, ou l'id du tag dont on choisit la destination. */
  let picking = null;
  /** Tag dont on édite les destinataires (fenêtre de saisie), ou null. */
  let editingRecipients = null;
  let loading = true;
  let saveState = 'idle'; // 'idle' | 'saving' | 'saved'
  let errorMessage = '';
  /**
   * Dernier test par cible. `revision` mémorise l'état enregistré au moment du
   * test : c'est ce qui permet de dire qu'un résultat ne vaut plus pour ce qui
   * est affiché, sans l'effacer pour autant.
   */
  let tests = { email: null, storage: null };
  let running = '';

  $: state = $actionSettings;
  $: draft = $actionDraft;
  $: dirty = $actionSettingsDirty;
  $: saving = saveState === 'saving';
  $: variables = state.variables || [];
  $: maxRecipients = state.limits?.maxRecipients ?? 0;
  /** L'action de CET écran est-elle ouverte par l'administration ? */
  $: sectionOpen = section === 'mail' ? !!state.ceiling?.email : !!state.ceiling?.storage;
  $: closedBody = section === 'mail' ? a.mailClosedBody : a.storageClosedBody;
  /**
   * Le bandeau ne signale « reconnectez pour le Drive » que sur l'écran du
   * dépôt : sur celui de l'envoi, ce serait exiger un consentement dont la page
   * affichée n'a aucun besoin.
   */
  $: bannerCeiling =
    section === 'storage' ? state.ceiling || {} : { ...(state.ceiling || {}), storage: false };
  $: connected = !!connectStatus?.provider?.connected;
  $: driveReady = connected && !!connectStatus?.provider?.driveReady;
  /**
   * « votre OneDrive » ou « votre Google Drive » selon le fournisseur retenu ;
   * le mot générique tant que /connect/status n'a pas répondu, pour ne pas
   * nommer un fournisseur que l'installation n'a pas choisi.
   */
  $: storageHint = formatText($uiText, 'configActions.storageCardHint', {
    drive: storageLabel(connectStatus?.provider?.id),
  });
  /** Fournisseur retenu, pour choisir le logo posé devant chaque bibliothèque. */
  $: providerId = connectStatus?.provider?.id || '';
  /** Valeurs d'exemple de l'aperçu — jamais de vraies données de réunion. */
  $: sample = {
    titre: a.sampleTitle,
    date: a.sampleDate,
    type: a.sampleType,
    compte: a.sampleAccount,
  };
  $: testTexts = { running: a.testRunning, stale: a.testStale };
  /**
   * `stale` est calculé ICI, en déclaration réactive, et non dans une fonction
   * appelée depuis le gabarit : Svelte ne suit que les identifiants qu'il VOIT
   * dans l'expression. Caché derrière un appel, `dirty` ne déclencherait aucun
   * recalcul et un résultat périmé resterait présenté comme valable.
   */
  $: emailResult = tests.email && {
    ...tests.email,
    stale: dirty || tests.email.revision !== state.revision,
  };
  $: storageResult = tests.storage && {
    ...tests.storage,
    stale: dirty || tests.storage.revision !== state.revision,
  };

  onMount(async () => {
    const res = await refreshActionSettings();
    // Le brouillon est amorcé AVANT de rendre le formulaire, y compris en échec
    // de chargement : les champs sont liés à `$actionDraft`, et un brouillon nul
    // au premier rendu casserait la liaison.
    seedActionDraft();
    loading = false;
    if (!res.ok) errorMessage = errors[res.error] || a.loadError;
    // Le catalogue de tags alimente la liste des destinations. Best-effort :
    // sans lui, l'écran garde tout le reste.
    loadTags();
  });

  /**
   * Sélection rendue par la fenêtre de navigation. Le dossier ET sa
   * bibliothèque arrivent ensemble : un chemin sans sa bibliothèque déposerait
   * dans un homonyme de l'ancienne.
   */
  function applyPick(selection) {
    if (picking === 'root') {
      $actionDraft.folder = selection.folder;
      $actionDraft.driveId = selection.driveId;
      $actionDraft.driveName = selection.driveName;
    } else if (picking) {
      $actionDraft.tagFolders = {
        ...$actionDraft.tagFolders,
        [picking]: { tagId: picking, ...selection },
      };
    }
    picking = null;
  }

  /**
   * Variables CSS d'une ligne de tag : sa couleur en liseré et en fond doux,
   * comme la carte de « Mes tags ». `$tagColors` en argument pour que Svelte
   * VOIE la dépendance — tagColorVars lit le store de façon impérative.
   */
  function rowVars(color, _colors) {
    const vars = tagColorVars(color);
    return `--row-dot: ${vars.dot}; --row-soft: ${vars.soft}`;
  }

  /** Retire la destination d'un tag : il retombe sur le dossier par défaut. */
  function clearTagFolder(tagId) {
    const next = { ...$actionDraft.tagFolders };
    delete next[tagId];
    $actionDraft.tagFolders = next;
  }

  /**
   * Liste rendue par la fenêtre de saisie — posée dans le BROUILLON, pas
   * enregistrée : sur cette page, c'est « Enregistrer » qui écrit, comme pour
   * tout le reste. Une liste vide retire le tag, pour que le brouillon et ce
   * que le serveur rendra après l'enregistrement aient la même forme.
   */
  function applyTagRecipients(list) {
    const tagId = editingRecipients?.id;
    editingRecipients = null;
    if (!tagId) return;
    const next = { ...$actionDraft.tagRecipients };
    if (list.length) next[tagId] = list;
    else delete next[tagId];
    $actionDraft.tagRecipients = next;
  }

  /** Retire la liste d'un tag : il retombe sur la liste par défaut. */
  function clearTagRecipients(tagId) {
    const next = { ...$actionDraft.tagRecipients };
    delete next[tagId];
    $actionDraft.tagRecipients = next;
  }

  /**
   * Résultat de test → forme affichable. Les libellés et les provenances sont
   * résolus ici : `postActions.js` rend des CLÉS, parce qu'il est partagé avec
   * les actions réelles qui parlent par toasts.
   */
  function toResult(outcome, revision) {
    return {
      ok: outcome.ok,
      title: formatText($uiText, outcome.key, outcome.vars),
      details: (outcome.details || []).map((line) => ({
        label: formatText($uiText, line.labelKey),
        value: line.sourceKey
          ? `${line.value} (${formatText($uiText, line.sourceKey)})`.replace(' ()', '')
          : line.value,
      })),
      revision,
    };
  }

  async function save() {
    if (!draft) return false;
    saveState = 'saving';
    errorMessage = '';
    const res = await saveActionSettings({
      mail: {
        recipients: draft.recipients,
        subjectTemplate: draft.subjectTemplate,
        tagRecipients: Object.entries(draft.tagRecipients).map(([tagId, recipients]) => ({
          tagId,
          recipients,
        })),
      },
      storage: {
        folder: draft.folder,
        driveId: draft.driveId,
        driveName: draft.driveName,
        requireApproval: draft.requireApproval,
        tagSubfolders: draft.tagSubfolders,
        // Les lignes VRAIMENT vides ne sont pas envoyées. Une bibliothèque
        // sans chemin en est une : c'est « la racine de ce Drive partagé »,
        // et la filtrer sur le seul `folder` renvoyait le tag vers Mon Drive.
        tagFolders: Object.values(draft.tagFolders).filter(
          (entry) => entry.folder || entry.driveId,
        ),
      },
      naming: { filenameTemplate: draft.filenameTemplate },
      afterSummary: { offer: draft.offerAfterSummary },
    });
    if (!res.ok) {
      saveState = 'idle';
      errorMessage = messageFor(res.data);
      return false;
    }
    // Le store porte aussi le gabarit de nom lu par utils/documentExport.js :
    // sans cette mise à jour, le fichier suivant garderait l'ancien nom.
    applyActionSettings(res.data);
    resetActionDraft();
    // Les pastilles de configuration disent peut-être autre chose, maintenant.
    refreshConfigChecks();
    saveState = 'saved';
    setTimeout(() => {
      if (saveState === 'saved') saveState = 'idle';
    }, 2500);
    return true;
  }

  /**
   * Le serveur ne renvoie qu'un slug (cf. lib/errors.js) — mais il nomme aussi
   * CE qu'il refuse. Reprendre cette précision est tout l'intérêt : « adresse
   * invalide » sans dire laquelle fait ressaisir la même chose à l'identique.
   */
  function messageFor(data) {
    const slug = data?.error;
    // Le refus d'une liste PAR TAG nomme le tag : sans lui, l'utilisateur
    // rouvrirait chaque liste pour trouver l'adresse en cause.
    const tagLabel = data?.tagId ? $tags.find((tag) => tag.id === data.tagId)?.label : '';
    const forTag = (message) =>
      tagLabel ? formatText($uiText, 'configActions.forTag', { message, tag: tagLabel }) : message;
    if (slug === 'recipient_invalid') {
      return forTag(
        formatText($uiText, 'configActions.recipientRejected', {
          list: (data.rejected || []).join(', '),
        }),
      );
    }
    if (slug === 'recipients_limit_reached') {
      return forTag(formatText($uiText, 'configActions.recipientsTooMany', { max: data.max }));
    }
    if (slug === 'template_variable_unknown') {
      return formatText($uiText, 'configActions.templateUnknown', {
        list: (data.unknown || []).join(', '),
      });
    }
    return errors[slug] ? `${a.saveError} ${errors[slug]}` : a.saveError;
  }

  /**
   * Le test s'exécute sur les réglages ENREGISTRÉS. Avec des modifications en
   * attente, on enregistre d'abord — sinon le bouton validerait des valeurs que
   * l'utilisateur ne voit plus à l'écran. Save en échec ⇒ pas de test : le
   * message d'erreur de l'enregistrement est ce qu'il faut lire d'abord.
   */
  async function runTest(target) {
    if (dirty && !(await save())) return;
    running = target;
    const outcome = await runActionTestAction({ target }, { errors });
    tests = { ...tests, [target]: toResult(outcome, state.revision) };
    running = '';
  }
</script>

<div class="sa">
  {#if loading}
    <div class="sa-skeleton" aria-hidden="true">
      <div class="sa-skeleton-card"></div>
      <div class="sa-skeleton-card"></div>
      <div class="sa-skeleton-card"></div>
    </div>
  {:else}
    <div class="sa-body">
      {#if errorMessage}<div class="sa-error" role="alert">{errorMessage}</div>{/if}

      <p class="sa-intro">{a.intro}</p>

      <ConnectionStatusBanner
        status={connectStatus}
        loading={connectLoading}
        ceiling={bannerCeiling}
        texts={a}
        dict={$uiText}
        {onConnect}
      />

      {#if !sectionOpen}
        <SettingsCard title={a.ceilingClosedTitle} icon={IconInfo}>
          <p class="sa-note">{closedBody}</p>
        </SettingsCard>
      {/if}

      <!-- ── Envoyer par mail ─────────────────────────────────────────────── -->
      {#if section === 'mail' && state.ceiling?.email}
        <SettingsCard title={a.mailCardTitle} hint={a.mailCardHint} icon={IconMail} on={true}>
          <StatusBadge
            slot="badge"
            tone={connected ? 'ok' : 'neutral'}
            text={connected ? a.mailViaAccount : a.mailViaServer}
          />

          <div class="sa-field">
            <span class="sa-label">{a.recipientsTitle}</span>
            <RecipientList
              bind:recipients={$actionDraft.recipients}
              max={maxRecipients}
              texts={a}
              disabled={saving}
            />
            <p class="sa-note">{a.alwaysCopied}</p>
          </div>

          <!-- Même forme que « Destinations par tag » sur la page Entreposer :
               une ligne par tag, sa valeur, et le geste pour la changer. -->
          <div class="sa-tags">
            <h5>{a.tagRecipientsTitle}</h5>
            <p class="sa-hint">{a.tagRecipientsIntro}</p>
            {#if $tags.length === 0}
              <p class="sa-note">{a.tagFoldersEmpty}</p>
            {:else}
              <ul class="sa-tag-list">
                {#each $tags as tag (tag.id)}
                  {@const list = $actionDraft.tagRecipients[tag.id]}
                  <li
                    class="sa-tag-row"
                    class:sa-tag-row-on={!!list?.length}
                    style={rowVars(tag.color, $tagColors)}
                  >
                    <span class="sa-tag-name"><TagChip {tag} /></span>
                    <span class="sa-tag-target" class:sa-tag-target-on={!!list?.length}>
                      {#if list?.length}
                        <span class="sa-tag-chips">
                          {#each list as address (address)}
                            <span class="sa-tag-chip">{address}</span>
                          {/each}
                        </span>
                      {:else}
                        {a.tagRecipientsDefault}
                      {/if}
                    </span>
                    <span class="sa-tag-actions">
                      <button
                        type="button"
                        class="sa-link"
                        disabled={saving}
                        on:click={() => (editingRecipients = tag)}
                      >
                        {a.tagRecipientsEdit}
                      </button>
                      {#if list?.length}
                        <button
                          type="button"
                          class="sa-link sa-link-muted"
                          disabled={saving}
                          on:click={() => clearTagRecipients(tag.id)}
                        >
                          {a.tagFolderReset}
                        </button>
                      {/if}
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          <TemplateField
            id="sa-subject"
            bind:value={$actionDraft.subjectTemplate}
            label={a.subjectLabel}
            placeholder={state.defaults?.subjectTemplate || a.subjectPlaceholder}
            {variables}
            variablesLabel={a.variablesLabel}
            previewLabel={a.previewLabel}
            {sample}
            mode="subject"
            disabled={saving}
          />

          <ActionTestPanel
            target="email"
            {dirty}
            running={running === 'email'}
            disabled={saving || !!running}
            result={emailResult}
            texts={{ ...testTexts, run: a.testEmail, runDirty: a.saveAndTestEmail }}
            on:run={() => runTest('email')}
          />
        </SettingsCard>
      {/if}

      <!-- ── Entreposer ───────────────────────────────────────────────────── -->
      {#if section === 'storage' && state.ceiling?.storage}
        <SettingsCard title={a.storageCardTitle} hint={storageHint} icon={IconCloud} on={true}>
          <StatusBadge
            slot="badge"
            tone={driveReady ? 'ok' : 'warn'}
            text={driveReady ? a.connectedBadge : a.driveMissingBadge}
          />

          <div class="sa-field">
            <label class="sa-label" for="sa-folder">{a.folderTitle}</label>
            <div class="sa-folder-row">
              <input
                id="sa-folder"
                class="sa-input"
                type="text"
                autocomplete="off"
                spellcheck="false"
                placeholder={a.folderPlaceholder}
                maxlength={state.limits?.folderMax || 500}
                bind:value={$actionDraft.folder}
                disabled={saving}
              />
              <button
                type="button"
                class="sa-ghost"
                on:click={() => (picking = 'root')}
                disabled={saving}
              >
                {a.browse}
              </button>
            </div>
            {#if $actionDraft.driveName}
              <p class="sa-hint sa-library">
                <StorageLogo kind={libraryKind(providerId, $actionDraft.driveName)} size={14} />
                <span>{a.libraryLabel} {$actionDraft.driveName}</span>
              </p>
            {/if}
            <p class="sa-hint">{a.folderHint}</p>
          </div>

          <!-- Même anatomie que les lignes de réglage de l'administration et
               que la tuile de « Mes tags » : intitulé + explication à gauche,
               interrupteur à droite. La case à cocher native qu'il y avait ici
               était le seul endroit de l'application à en porter une. -->
          <ul class="sa-rows">
            <li class="sa-row">
              <span class="sa-row-text">
                <strong>{a.approvalLabel}</strong>
                <em>{a.approvalHint}</em>
              </span>
              <ToggleSwitch
                bind:checked={$actionDraft.requireApproval}
                label={a.approvalLabel}
                disabled={saving}
              />
            </li>
            <li class="sa-row">
              <span class="sa-row-text">
                <strong>{a.tagSubfoldersLabel}</strong>
                <em>{a.tagSubfoldersHint}</em>
              </span>
              <ToggleSwitch
                bind:checked={$actionDraft.tagSubfolders}
                label={a.tagSubfoldersLabel}
                disabled={saving}
              />
            </li>
          </ul>

          <div class="sa-tags">
            <h5>{a.tagFoldersTitle}</h5>
            <p class="sa-hint">{a.tagFoldersIntro}</p>
            {#if $tags.length === 0}
              <p class="sa-note">{a.tagFoldersEmpty}</p>
            {:else}
              <ul class="sa-tag-list">
                {#each $tags as tag (tag.id)}
                  {@const entry = $actionDraft.tagFolders[tag.id]}
                  {@const custom = !!(entry?.folder || entry?.driveId)}
                  {@const kind = libraryKind(
                    providerId,
                    custom ? entry.driveName : $actionDraft.driveName,
                  )}
                  <li
                    class="sa-tag-row"
                    class:sa-tag-row-on={custom}
                    style={rowVars(tag.color, $tagColors)}
                  >
                    <span class="sa-tag-name"><TagChip {tag} /></span>
                    <span class="sa-tag-target" class:sa-tag-target-on={custom}>
                      <!-- Logo de la bibliothèque visée plutôt qu'un dossier
                           générique : SharePoint pour un site, OneDrive ou
                           Drive sinon (repli : le dossier, fournisseur inconnu). -->
                      {#if kind}
                        <StorageLogo {kind} size={14} />
                      {:else}
                        <IconFolderOpen width="14" height="14" aria-hidden="true" />
                      {/if}
                      <span>
                        {#if custom}
                          <!-- Une bibliothèque sans chemin = sa RACINE, pas un vide. -->
                          {entry.folder || a.folderDriveRoot}
                          {#if entry.driveName}
                            <em>{a.libraryLabel} {entry.driveName}</em>
                          {/if}
                        {:else if $actionDraft.tagSubfolders}
                          {formatText($uiText, 'configActions.tagFolderAuto', { tag: tag.label })}
                        {:else}
                          {a.tagFolderDefault}
                        {/if}
                      </span>
                    </span>
                    <span class="sa-tag-actions">
                      <button
                        type="button"
                        class="sa-link"
                        disabled={saving}
                        on:click={() => (picking = tag.id)}
                      >
                        {a.browse}
                      </button>
                      {#if custom}
                        <button
                          type="button"
                          class="sa-link sa-link-muted"
                          disabled={saving}
                          on:click={() => clearTagFolder(tag.id)}
                        >
                          {a.tagFolderReset}
                        </button>
                      {/if}
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          <!-- Le bouton reste actif sans compte relié : le test RÉEL est le
               diagnostic, et son erreur nomme désormais le geste à faire. -->
          <ActionTestPanel
            target="storage"
            {dirty}
            running={running === 'storage'}
            disabled={saving || !!running}
            result={storageResult}
            texts={{ ...testTexts, run: a.testStorage, runDirty: a.saveAndTestStorage }}
            on:run={() => runTest('storage')}
          />
        </SettingsCard>
      {/if}

      <!-- ── Nom du fichier ────────────────────────────────────────────────
           Présent sur LES DEUX écrans, et c'est voulu : un même gabarit nomme
           la pièce jointe, le document déposé et le fichier téléchargé. Le
           reléguer sur une seule des deux pages le rendrait introuvable pour
           qui n'utilise que l'autre action. Même champ, même valeur — les deux
           écrans écrivent dans le même brouillon. -->
      <!-- ── Nom du fichier (vaut aussi pour « Télécharger ») ──────────────── -->
      <SettingsCard title={a.filenameCardTitle} hint={a.filenameCardHint} icon={IconText}>
        <TemplateField
          id="sa-filename"
          bind:value={$actionDraft.filenameTemplate}
          label={a.filenameLabel}
          placeholder={state.defaults?.filenameTemplate || a.filenamePlaceholder}
          hint={a.templateHint}
          {variables}
          variablesLabel={a.variablesLabel}
          previewLabel={a.previewLabel}
          {sample}
          mode="filename"
          disabled={saving}
        />
      </SettingsCard>

      <!-- ── Après le premier résumé ─────────────────────────────────────────
           Sur les deux écrans, comme le nom du fichier : la fenêtre « Et
           maintenant ? » propose les DEUX actions, et c'est ici qu'on la
           rallume après « Ne plus me proposer ». -->
      <SettingsCard title={a.afterSummaryTitle} icon={IconStars}>
        <ul class="sa-rows">
          <li class="sa-row">
            <span class="sa-row-text">
              <strong>{a.afterSummaryToggle}</strong>
              <em>{a.afterSummaryHint}</em>
            </span>
            <ToggleSwitch
              bind:checked={$actionDraft.offerAfterSummary}
              label={a.afterSummaryToggle}
              disabled={saving}
            />
          </li>
        </ul>
      </SettingsCard>
    </div>

    <div class="sa-actions">
      {#if dirty}
        <span class="sa-unsaved">{a.unsavedHint}</span>
        <button type="button" class="sa-ghost" on:click={resetActionDraft} disabled={saving}>
          {a.discardChanges}
        </button>
      {:else if saveState === 'saved'}
        <span class="sa-ok"><IconCheck width="15" height="15" aria-hidden="true" /> {a.saved}</span>
      {/if}
      <button type="button" class="sa-save" on:click={save} disabled={!dirty || saving}>
        {saving ? a.saving : a.save}
      </button>
    </div>
  {/if}
</div>

{#if editingRecipients}
  <TagRecipientsDialog
    tag={editingRecipients}
    recipients={$actionDraft.tagRecipients[editingRecipients.id] || []}
    max={maxRecipients}
    texts={a}
    onSave={applyTagRecipients}
    onClose={() => (editingRecipients = null)}
  />
{/if}

{#if picking}
  <DriveFolderPicker
    texts={a}
    tag={picking === 'root' ? null : $tags.find((tag) => tag.id === picking) || null}
    initialDriveId={picking === 'root'
      ? $actionDraft.driveId
      : $actionDraft.tagFolders[picking]?.driveId || $actionDraft.driveId}
    onSelect={applyPick}
    onClose={() => (picking = null)}
  />
{/if}

<style>
  .sa {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .sa-body {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .sa-intro {
    margin: 0;
    font-size: 0.88rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .sa-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .sa-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sa-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--ink-faint);
    line-height: 1.45;
  }
  /* Bibliothèque choisie : son logo devant son nom. */
  .sa-library {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-muted);
  }
  .sa-note {
    margin: 0;
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px dashed var(--line);
    font-size: 0.8rem;
    color: var(--ink-muted);
    line-height: 1.5;
  }
  .sa-input {
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
  .sa-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-soft-15);
  }
  .sa-input:disabled {
    opacity: 0.6;
  }
  .sa-folder-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .sa-folder-row .sa-input {
    flex: 1 1 220px;
    width: auto;
  }
  .sa-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sa-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    background: var(--surface, #fff);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .sa-row-text {
    flex: 1;
    min-width: 0;
  }
  .sa-row-text strong {
    display: block;
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--ink);
  }
  .sa-row-text em {
    display: block;
    margin-top: 1px;
    font-style: normal;
    font-size: 0.78rem;
    line-height: 1.4;
    color: var(--ink-faint);
  }
  .sa-tags h5 {
    margin: 0 0 0.15rem;
    font-size: 0.88rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--brand-secondary) 17.5%, #0b0b0b);
  }
  .sa-tag-list {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  /* La ligne porte la COULEUR de son tag — liseré à gauche, fond doux quand
     une règle propre est posée — comme la carte de « Mes tags » : c'est le
     même objet, il doit se reconnaître d'un écran à l'autre. */
  .sa-tag-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 0.5rem 0.65rem 0.5rem 0.75rem;
    border: 1px solid var(--line, color-mix(in srgb, var(--brand-secondary) 4.4%, #eeeeee));
    border-radius: 8px;
    background: var(--surface, #fff);
    box-shadow: inset 3px 0 0 var(--row-dot);
  }
  .sa-tag-row-on {
    background: var(--row-soft);
  }
  /* Largeur minimale commune : les valeurs s'alignent d'une ligne à l'autre
     tant que les noms de tags restent courts, sans tronquer les longs. */
  .sa-tag-name {
    flex: 0 0 auto;
    min-width: 9rem;
    max-width: 40%;
  }
  .sa-tag-target {
    flex: 1;
    min-width: 120px;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--ink-muted);
    word-break: break-word;
  }
  .sa-tag-target :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--ink-faint);
  }
  .sa-tag-target-on {
    color: var(--ink);
    font-weight: 500;
  }
  .sa-tag-target-on :global(svg) {
    color: var(--row-dot);
  }
  .sa-tag-target em {
    display: block;
    font-style: normal;
    font-weight: 400;
    font-size: 0.72rem;
    color: var(--ink-faint);
  }
  .sa-tag-chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .sa-tag-chip {
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--line-strong);
    background: var(--surface, #fff);
    font-size: 0.74rem;
    color: var(--ink, color-mix(in srgb, var(--brand-secondary) 17.5%, #121212));
  }
  .sa-tag-actions {
    display: flex;
    gap: 10px;
  }
  .sa-link:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .sa-link {
    border: none;
    background: none;
    padding: 0;
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--brand, var(--brand-text));
    cursor: pointer;
    text-decoration: underline;
  }
  .sa-link-muted {
    color: var(--ink-muted);
  }
  .sa-error {
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    background: var(--danger-bg);
    border: 1px solid var(--danger-line);
    color: var(--danger-text);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  /* ── Squelette de chargement ── */
  .sa-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .sa-skeleton-card {
    height: 140px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: sa-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes sa-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sa-skeleton-card {
      animation: none;
    }
  }

  /* ── Barre d'action collante — même bleed que l'onglet Actions admin ── */
  .sa-actions {
    position: sticky;
    bottom: -22px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    margin: 0.9rem -22px -22px;
    padding: 0.85rem 22px 22px;
    border-top: 1px solid var(--line);
    background: var(--surface);
  }
  .sa-unsaved {
    margin-right: auto;
    font-size: 0.82rem;
    font-weight: 500;
    color: color-mix(in srgb, var(--brand) 56.9%, #010101);
  }
  .sa-ok {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--success-text);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .sa-ghost {
    padding: 0.55rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-soft);
    font-family: inherit;
    font-size: 0.88rem;
    cursor: pointer;
  }
  .sa-ghost:hover:not(:disabled) {
    border-color: var(--line-faint);
  }
  .sa-ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .sa-save {
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
  .sa-save:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .sa-save:active:not(:disabled) {
    transform: scale(0.97);
  }
  .sa-save:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    .sa-actions {
      bottom: -14px;
      margin: 0.9rem -16px -14px;
      padding: 0.85rem 16px 14px;
    }
  }
</style>
