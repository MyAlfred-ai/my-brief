<script>
  /**
   * « Mes tags » — création, renommage, pastille (couleur, forme), suppression,
   * et les RÈGLES D'ACTION de chaque tag : où ranger ses comptes rendus, à qui
   * les envoyer.
   *
   * SECTION de « Ma configuration » : le composant n'a pas de coquille, il rend
   * son contenu dans le volet de droite du panneau.
   *
   * ── Une liste, et la fiche du tag choisi ─────────────────────────────────
   * La page était une grille de cartes, chacune répétant deux blocs (étiquette,
   * pastille d'état, bouton, « Réinitialiser »), sous deux bandeaux qui
   * expliquaient le dépôt et l'envoi avant qu'on ait choisi un tag. Dès six
   * tags, c'était un mur. Désormais : à gauche une liste calme (pastille, nom,
   * nombre de conversations, deux icônes qui disent si le tag a SA règle), à
   * droite la FICHE du tag choisi (settings/TagFiche.svelte), qui pose les deux
   * questions en clair. Les bandeaux sont devenus l'entrée « Réglages
   * communs », en bas de la liste (settings/TagCommonSettings.svelte).
   *
   * Créer et modifier passent par la même fiche : « Nouveau tag » et « Nom et
   * apparence » y ouvrent le formulaire (TagForm.svelte, un seul pour les deux
   * cas). Après la création, la fiche du nouveau tag s'affiche : c'est là que
   * se règlent son rangement et son envoi.
   *
   * Sur téléphone (≤ 760 px), la liste et la fiche sont deux écrans : choisir
   * un tag ouvre sa fiche, « Mes tags » ramène à la liste.
   *
   * La palette et les formes proposées sont celles que l'API renvoie, jamais
   * une liste écrite ici : c'est le serveur qui arbitre les slugs valides.
   *
   * Suppression : confirmation explicite, et le message dit ce qui n'est PAS
   * supprimé. Un utilisateur qui range ses conversations par client doit
   * pouvoir jeter un classeur sans craindre d'emporter son contenu.
   *
   * ── Règles par tag : dépôt et destinataires ──────────────────────────────
   * Les deux vivent dans les réglages d'actions (`storage.tagFolders` et
   * `mail.tagRecipients`, édités aussi par les pages Actions de « Ma
   * configuration ») — ici on les édite dans la fiche, parce que c'est là
   * qu'on pense « ce client se range où, et qui reçoit son compte rendu ? ».
   * Enregistrement immédiat par patch PARTIEL (`{ storage: { tagFolders } }`
   * ou `{ mail: { tagRecipients } }`) reconstruit depuis les valeurs
   * ENREGISTRÉES : ce panneau n'a pas de brouillon. Après chaque écriture,
   * `syncDraftTagRules()` aligne l'éventuel brouillon ouvert des pages Actions
   * — sinon son prochain « Enregistrer » écraserait ce qu'on vient de choisir.
   *
   * Les destinataires d'un tag REMPLACENT la liste par défaut du compte (cf.
   * lib/actions/recipients.js) ; la fiche et la fenêtre de saisie le disent.
   */
  import { onMount } from 'svelte';
  import { uiText } from '../store.js';
  import { refreshConfigChecks } from '../stores/configChecks.js';
  import { historyItems } from '../stores/history.js';
  import {
    tags,
    tagsMax,
    tagColors,
    tagShapes,
    tagHueLightness,
    isLoadingTags,
    loadTags,
    upsertTag,
    removeTag,
    tagColorVars,
    tagShapeClip,
    TAG_COLOR_FALLBACK,
    TAG_SHAPE_FALLBACK,
  } from '../stores/tags.js';
  import {
    actionSettings,
    refreshActionSettings,
    applyActionSettings,
    syncDraftTagRules,
  } from '../stores/actionSettings.js';
  import { selectPanelSection } from '../stores/panels.js';
  import { saveActionSettings } from '../services/actionsApi.js';
  import { fetchConnectStatus } from '../services/connectApi.js';
  import TagForm from './TagForm.svelte';
  import TagFiche from './settings/TagFiche.svelte';
  import TagCommonSettings from './settings/TagCommonSettings.svelte';
  import DriveFolderPicker from './settings/DriveFolderPicker.svelte';
  import TagRecipientsDialog from './settings/TagRecipientsDialog.svelte';
  import StorageLogo from './icons/StorageLogo.svelte';
  import { formatText } from '../utils/i18nFormat.js';
  import { libraryKind } from '../utils/storageVocabulary.js';
  import IconTag from '~icons/solar/tag-linear';
  import IconPlus from '~icons/solar/add-circle-linear';
  import IconFolder from '~icons/solar/folder-linear';
  import IconMail from '~icons/solar/letter-linear';
  import IconTuning from '~icons/solar/tuning-2-linear';
  import IconChevron from '~icons/solar/alt-arrow-right-linear';
  import IconSearch from '~icons/solar/magnifer-linear';

  /** Identifiant de la fiche « Réglages communs » dans `selectedId`. */
  const COMMON = 'common';
  /** La recherche n'apparaît qu'au-delà : sous ce nombre, la liste se lit d'un coup d'œil. */
  const SEARCH_FROM = 7;

  /** null = formulaire fermé · {} = création · {id,…} = modification. */
  let draft = null;
  let errorSlug = '';
  let busy = false;
  let pendingDelete = null;
  /** Ce que montre la fiche : l'id d'un tag, ou COMMON. */
  let selectedId = null;
  /** Téléphone : la fiche remplace la liste. Sans effet sur un écran large. */
  let detailOpen = false;
  let query = '';
  /** Le volet qui défile — remis en haut quand la fiche change, sur téléphone. */
  let bodyEl;

  $: t = $uiText.tagsPanel;
  $: a = $uiText.configActions;
  $: limitReached = $tagsMax > 0 && $tags.length >= $tagsMax;
  $: palette = $tagColors.length ? $tagColors : [TAG_COLOR_FALLBACK];
  $: shapes = $tagShapes.length ? $tagShapes : [TAG_SHAPE_FALLBACK];
  $: creating = !!draft && !draft.id;
  $: loadingFirst = $isLoadingTags && $tags.length === 0;
  $: counterText = ($tags.length <= 1 ? t.counterOne : t.counterMany)
    .replace('{n}', String($tags.length))
    .replace('{max}', String($tagsMax || '—'));

  // Rien de choisi, ou le tag choisi vient d'être supprimé : la fiche montre
  // le premier tag de la liste. `currentId` est ce qui est RÉELLEMENT montré
  // — c'est lui que la liste surligne.
  $: selectedTag =
    selectedId === COMMON ? null : $tags.find((tag) => tag.id === selectedId) || $tags[0] || null;
  $: currentId = selectedId === COMMON ? COMMON : selectedTag?.id || null;

  $: needle = query.trim().toLocaleLowerCase();
  $: visibleTags = needle
    ? $tags.filter((tag) => tag.label.toLocaleLowerCase().includes(needle))
    : $tags;

  // ── Dépôt par tag ──────────────────────────────────────────────────────────
  /** Payload de GET /connect/status — chargé ici, le panneau vit sans parent. */
  let connect = null;
  let connectLoading = true;
  /** `''` au repos, `'subfolders'` ou un tagId pendant une écriture. */
  let storageBusy = '';
  let storageError = false;
  /** Tag dont on choisit la destination (fenêtre de navigation), ou null. */
  let picking = null;
  /** Miroir local de l'interrupteur — enregistré à chaque bascule. */
  let subfolders = false;

  $: storage = $actionSettings.settings?.storage || {};
  $: tagFolderMap = Object.fromEntries((storage.tagFolders || []).map((e) => [e.tagId, e]));
  $: storageOpen = !!$actionSettings.ceiling?.storage;

  // ── Destinataires par tag ──────────────────────────────────────────────────
  $: mail = $actionSettings.settings?.mail || {};
  $: tagRecipientMap = Object.fromEntries(
    (mail.tagRecipients || []).map((e) => [e.tagId, e.recipients]),
  );
  $: mailOpen = !!$actionSettings.ceiling?.email;
  $: maxRecipients = $actionSettings.limits?.maxRecipients ?? 0;
  /** Tag dont on édite les destinataires (fenêtre de saisie), ou null. */
  let editingRecipients = null;
  /** `''` au repos, ou le tagId pendant une écriture de destinataires. */
  let recipientsBusy = '';
  /** Refus du serveur sur la fenêtre ouverte — déjà traduit. */
  let recipientsError = '';
  /** Échec du retour aux destinataires habituels (hors fenêtre). */
  let mailError = false;
  $: provider = connect?.provider || null;
  $: connected = !!provider?.connected;
  $: driveReady = connected && !!provider?.driveReady;
  $: canEditStorage = storageOpen && driveReady && !connectLoading;
  $: canEditMail = mailOpen && !!$actionSettings.loaded;
  // Le store est la vérité : l'interrupteur le suit dès qu'il change (montage,
  // rafraîchissement, valeur enregistrée par l'onglet Actions), SAUF pendant sa
  // propre écriture — le bind vient de le basculer et le serveur n'a pas encore
  // répondu. Un refus le ramène donc tout seul à la valeur enregistrée.
  $: if ($actionSettings.loaded && storageBusy !== 'subfolders') {
    subfolders = !!storage.tagSubfolders;
  }

  /** Pourquoi le rangement est inactif — une seule raison, la plus en amont. */
  $: storageNote = !$actionSettings.loaded
    ? ''
    : !storageOpen
      ? t.storageClosed
      : connectLoading
        ? ''
        : !connected
          ? t.storageNotConnected
          : !driveReady
            ? t.storageDriveMissing
            : '';
  $: mailNote = $actionSettings.loaded && !mailOpen ? t.mailClosed : '';
  $: defaultRecipientsText = defaultRecipients(mail.recipients || [], t);

  /**
   * Conversations AFFICHÉES par tag — déclaration réactive qui NOMME
   * `$historyItems`, pas une fonction appelée du gabarit : Svelte ne suit que
   * les identifiants qu'il voit dans l'expression, et un compteur caché
   * derrière un appel resterait figé sur l'état du montage (tag posé pendant
   * que le panneau est ouvert, historique arrivé après un deep-link #my-tags).
   */
  $: taggedCounts = $historyItems.reduce((acc, it) => {
    if (it.tagId) acc.set(it.tagId, (acc.get(it.tagId) || 0) + 1);
    return acc;
  }, new Map());

  /**
   * Lignes de la liste. `$tagColors` et `$tagShapes` nommés : tagColorVars et
   * tagShapeClip lisent leur store de façon impérative, et une ligne rendue
   * avant /tags garderait la couleur et la forme de repli.
   */
  $: rows =
    ($tagColors,
    $tagShapes,
    visibleTags.map((tag) => {
      const entry = tagFolderMap[tag.id];
      const folderCustom = hasDestination(entry);
      const vars = tagColorVars(tag.color);
      return {
        tag,
        count: taggedCounts.get(tag.id) || 0,
        folderCustom,
        // Le logo de la bibliothèque visée (SharePoint, OneDrive, Google Drive)
        // dit d'un coup d'œil OÙ ce tag range ses comptes rendus.
        folderKind: folderCustom ? libraryKind(provider?.id, entry.driveName) : '',
        mailCustom: !!tagRecipientMap[tag.id]?.length,
        style: `--row-dot: ${vars.dot}; --row-soft: ${vars.soft}; --row-fill: ${vars.fill}; --row-shape: ${tagShapeClip(tag.shape)}`,
      };
    }));

  /** Pastille de la ligne « en cours de création » : celle du formulaire. */
  $: draftStyle = draft
    ? ($tagColors,
      $tagShapes,
      `--row-dot: ${tagColorVars(draft.color).dot}; --row-soft: ${tagColorVars(draft.color).soft}; --row-fill: ${tagColorVars(draft.color).fill}; --row-shape: ${tagShapeClip(draft.shape)}`)
    : '';

  onMount(() => {
    loadTags();
    refreshActionSettings();
    fetchConnectStatus().then((res) => {
      connect = res.ok ? res.data : null;
      connectLoading = false;
    });
  });

  /**
   * Une destination existe dès qu'elle nomme un chemin OU une bibliothèque —
   * même règle que `resolveFolder` côté serveur. Choisir la RACINE d'un Drive
   * partagé rend un `folder` vide avec un `driveId`.
   */
  function hasDestination(entry) {
    return !!(entry?.folder || entry?.driveId);
  }

  /** Ce que « destinataires habituels » désigne : « vous seul », « vous + 2 adresses ». */
  function defaultRecipients(defaultList, texts) {
    const n = defaultList.length;
    if (n === 0) return texts.recipientsSelfOnly;
    return (n === 1 ? texts.recipientsDefaultOne : texts.recipientsDefaultMany).replace(
      '{n}',
      String(n),
    );
  }

  /** Libellé du nombre de conversations — `texts` en argument, cf. defaultRecipients. */
  function taggedLabel(count, texts) {
    if (count === 0) return texts.taggedNone;
    if (count === 1) return texts.taggedOne;
    return texts.taggedMany.replace('{n}', String(count));
  }

  /** Traduit le slug serveur ; `{max}` est le seul paramètre attendu. */
  function errorText(slug) {
    const raw = t.errors?.[slug] || t.errors?.network || '';
    return raw.replace('{max}', String($tagsMax || ''));
  }

  /** Montre une fiche ; sur téléphone, elle remplace la liste. */
  function show(id) {
    if (draft) {
      draft = null;
      errorSlug = '';
    }
    selectedId = id;
    detailOpen = true;
    if (bodyEl) bodyEl.scrollTop = 0;
  }

  function backToList() {
    detailOpen = false;
  }

  function startCreate() {
    if (limitReached || creating) return;
    errorSlug = '';
    draft = { label: '', color: palette[0], shape: TAG_SHAPE_FALLBACK };
    detailOpen = true;
    if (bodyEl) bodyEl.scrollTop = 0;
  }

  function startEdit(tag) {
    errorSlug = '';
    // Un tag d'avant les formes n'a pas de `shape` : c'est un rond.
    draft = {
      id: tag.id,
      label: tag.label,
      color: tag.color,
      shape: tag.shape || TAG_SHAPE_FALLBACK,
    };
  }

  function cancel() {
    // Annuler une CRÉATION ramène à la liste sur téléphone : il n'y a pas de
    // fiche derrière. Annuler une modification ramène à la fiche du tag.
    if (creating) detailOpen = false;
    draft = null;
    errorSlug = '';
  }

  async function submit() {
    if (busy || !draft) return;
    busy = true;
    const res = await upsertTag({
      ...(draft.id ? { id: draft.id } : {}),
      label: draft.label,
      color: draft.color,
      shape: draft.shape,
    });
    busy = false;
    if (!res.ok) {
      errorSlug = res.error;
      return;
    }
    // La fiche du tag tout juste créé : c'est là que se règlent son rangement
    // et son envoi.
    if (res.tag?.id) selectedId = res.tag.id;
    draft = null;
    errorSlug = '';
  }

  function deleteBody(tag) {
    const count = taggedCounts.get(tag.id) || 0;
    const template = count > 0 ? t.deleteBodyCount : t.deleteBody;
    return template.replace('{label}', tag.label).replace('{count}', String(count));
  }

  async function confirmDelete() {
    const tag = pendingDelete;
    pendingDelete = null;
    if (!tag || busy) return;
    busy = true;
    const res = await removeTag(tag.id);
    busy = false;
    if (!res.ok) {
      errorSlug = res.error;
      return;
    }
    // La fiche n'a plus de tag à montrer : retour à la liste sur téléphone ;
    // ailleurs, la déclaration réactive choisit le premier tag restant.
    detailOpen = false;
  }

  /** Patch PARTIEL des réglages d'actions — n'envoie que le champ modifié. */
  async function saveStorage(patch, busyKey) {
    storageBusy = busyKey;
    storageError = false;
    const res = await saveActionSettings({ storage: patch });
    storageBusy = '';
    if (!res.ok) {
      storageError = true;
      return false;
    }
    applyActionSettings(res.data);
    syncDraftTagRules();
    // Les pastilles de configuration disent peut-être autre chose, maintenant.
    refreshConfigChecks();
    return true;
  }

  function toggleSubfolders() {
    saveStorage({ tagSubfolders: subfolders }, 'subfolders');
  }

  /**
   * Sélection rendue par la fenêtre de navigation. Le dossier ET sa
   * bibliothèque arrivent ensemble : un chemin sans sa bibliothèque déposerait
   * dans un homonyme de l'ancienne. La liste envoyée est reconstruite depuis
   * les valeurs ENREGISTRÉES : ce panneau n'a pas de brouillon.
   */
  function applyPick(selection) {
    const tagId = picking;
    picking = null;
    if (!tagId) return;
    const others = (storage.tagFolders || []).filter((e) => e.tagId !== tagId);
    saveStorage({ tagFolders: [...others, { tagId, ...selection }] }, tagId);
  }

  /** Retire la destination d'un tag : il retombe sur la règle commune. */
  function resetFolder(tagId) {
    const next = (storage.tagFolders || []).filter((e) => e.tagId !== tagId);
    saveStorage({ tagFolders: next }, tagId);
  }

  function openRecipients(tag) {
    recipientsError = '';
    mailError = false;
    editingRecipients = tag;
  }

  /**
   * Liste rendue par la fenêtre de saisie — enregistrée sur-le-champ, par
   * patch PARTIEL de `mail.tagRecipients`, reconstruit depuis les valeurs
   * ENREGISTRÉES. Une liste vide retire le tag : le serveur ne garde pas de
   * ligne sans adresse, et la fiche repasse sur « destinataires habituels ».
   *
   * Un refus du serveur reste dans la fenêtre : l'adresse refusée y est
   * encore, corrigeable — la fermer ferait ressaisir toute la liste.
   */
  async function saveRecipients(list) {
    const tag = editingRecipients;
    if (!tag) return;
    recipientsBusy = tag.id;
    recipientsError = '';
    const others = (mail.tagRecipients || []).filter((e) => e.tagId !== tag.id);
    const res = await saveActionSettings({
      mail: { tagRecipients: [...others, { tagId: tag.id, recipients: list }] },
    });
    recipientsBusy = '';
    if (!res.ok) {
      recipientsError = recipientsErrorText(res.data);
      return;
    }
    applyActionSettings(res.data);
    syncDraftTagRules();
    editingRecipients = null;
  }

  /** Retire la liste d'un tag : il retombe sur les destinataires habituels. */
  async function resetRecipients(tagId) {
    editingRecipients = null;
    recipientsBusy = tagId;
    mailError = false;
    const next = (mail.tagRecipients || []).filter((e) => e.tagId !== tagId);
    const res = await saveActionSettings({ mail: { tagRecipients: next } });
    recipientsBusy = '';
    if (!res.ok) {
      mailError = true;
      return;
    }
    applyActionSettings(res.data);
    syncDraftTagRules();
  }

  /**
   * Le serveur nomme CE qu'il refuse (cf. routes/actions/settings.js) ; on
   * reprend cette précision — même traduction que l'onglet Actions.
   */
  function recipientsErrorText(data) {
    const slug = data?.error;
    if (slug === 'recipient_invalid') {
      return formatText($uiText, 'configActions.recipientRejected', {
        list: (data.rejected || []).join(', '),
      });
    }
    if (slug === 'recipients_limit_reached') {
      return formatText($uiText, 'configActions.recipientsTooMany', { max: data.max });
    }
    return a.saveError;
  }
</script>

<div class="tgp-head">
  <IconTag width="17" height="17" aria-hidden="true" />
  <h4>{t.title}</h4>
  <span class="tgp-counter" class:tgp-counter-max={limitReached}>{counterText}</span>
  <!-- Seul point d'entrée de la création : toujours visible, en tête. -->
  <button
    class="tgp-add"
    on:click={startCreate}
    disabled={limitReached || creating}
    title={limitReached ? errorText('limit_reached') : null}
  >
    <IconPlus width="16" height="16" aria-hidden="true" />
    {t.add}
  </button>
</div>

<div class="tgp-body" class:tgp-body-detail={detailOpen} bind:this={bodyEl}>
  <p class="tgp-intro">{t.intro}</p>

  <!-- Erreur hors formulaire (suppression refusée) : le formulaire, lui,
       affiche la sienne. -->
  {#if errorSlug && !draft}
    <div class="tgp-error" role="alert">{errorText(errorSlug)}</div>
  {/if}

  {#if loadingFirst}
    <div class="tgp-muted" role="status">{t.loading}</div>
    <div class="tgp-layout" aria-hidden="true">
      <div class="tgp-list">
        <div class="tgp-skeleton"></div>
        <div class="tgp-skeleton"></div>
        <div class="tgp-skeleton"></div>
      </div>
      <div class="tgp-detail tgp-skeleton tgp-skeleton-detail"></div>
    </div>
  {:else if $tags.length === 0 && !draft}
    <div class="tgp-empty">
      <span class="tgp-empty-icon" aria-hidden="true"><IconTag width="22" height="22" /></span>
      <p>{t.empty}</p>
    </div>
  {:else}
    <div class="tgp-layout" class:tgp-detail-open={detailOpen}>
      <nav class="tgp-list" aria-label={t.title}>
        {#if $tags.length >= SEARCH_FROM}
          <label class="tgp-search">
            <IconSearch width="17" height="17" aria-hidden="true" />
            <input
              type="search"
              bind:value={query}
              placeholder={t.searchLabel}
              aria-label={t.searchLabel}
              autocomplete="off"
            />
          </label>
        {/if}

        <ul class="tgp-rows">
          {#if creating}
            <li>
              <div class="tgp-row tgp-row-on tgp-row-draft" style={draftStyle}>
                <span class="tgp-row-badge" aria-hidden="true"
                  ><span class="tgp-row-shape"></span></span
                >
                <span class="tgp-row-text">
                  <span class="tgp-row-name">{draft.label.trim() || t.add}</span>
                  <span class="tgp-row-sub tgp-row-sub-draft">{t.creating}</span>
                </span>
              </div>
            </li>
          {/if}
          {#each rows as row (row.tag.id)}
            {@const on = !creating && currentId === row.tag.id}
            <li>
              <button
                type="button"
                class="tgp-row"
                class:tgp-row-on={on}
                aria-current={on ? 'true' : undefined}
                style={row.style}
                on:click={() => show(row.tag.id)}
              >
                <span class="tgp-row-badge" aria-hidden="true"
                  ><span class="tgp-row-shape"></span></span
                >
                <span class="tgp-row-text">
                  <span class="tgp-row-name">{row.tag.label}</span>
                  <span class="tgp-row-sub">{taggedLabel(row.count, t)}</span>
                </span>
                <span class="tgp-rules" aria-hidden="true">
                  <span class="tgp-rule" class:tgp-rule-on={row.folderCustom}>
                    {#if row.folderKind}
                      <StorageLogo kind={row.folderKind} size={15} />
                    {:else}
                      <IconFolder width="15" height="15" />
                    {/if}
                  </span>
                  <span class="tgp-rule" class:tgp-rule-on={row.mailCustom}>
                    <IconMail width="15" height="15" />
                  </span>
                </span>
                {#if row.folderCustom}<span class="tgp-sr">{t.legendFolder}</span>{/if}
                {#if row.mailCustom}<span class="tgp-sr">{t.legendMail}</span>{/if}
              </button>
            </li>
          {:else}
            {#if !creating}
              <li class="tgp-search-empty">{t.searchEmpty}</li>
            {/if}
          {/each}
        </ul>

        <div class="tgp-legend" aria-hidden="true">
          <span><IconFolder width="13" height="13" />{t.legendFolder}</span>
          <span><IconMail width="13" height="13" />{t.legendMail}</span>
        </div>

        <div class="tgp-sep"></div>

        <button
          type="button"
          class="tgp-row tgp-row-common"
          class:tgp-row-on={!creating && currentId === COMMON}
          aria-current={!creating && currentId === COMMON ? 'true' : undefined}
          on:click={() => show(COMMON)}
        >
          <span class="tgp-row-badge tgp-common-badge" aria-hidden="true">
            <IconTuning width="18" height="18" />
          </span>
          <span class="tgp-row-text">
            <span class="tgp-row-name">{t.commonTitle}</span>
            <span class="tgp-row-sub">{t.commonHint}</span>
          </span>
          <IconChevron width="16" height="16" aria-hidden="true" />
        </button>
      </nav>

      <section class="tgp-detail">
        {#if draft}
          {#key draft.id || 'new'}
            <TagForm
              bind:draft
              {palette}
              {shapes}
              lightnessRange={$tagHueLightness}
              {busy}
              texts={t}
              error={errorSlug ? errorText(errorSlug) : ''}
              onSubmit={submit}
              onCancel={cancel}
            />
          {/key}
        {:else if selectedId === COMMON}
          <TagCommonSettings
            texts={t}
            actionTexts={a}
            rootFolder={storage.folder || ''}
            rootDriveName={storage.driveName || ''}
            providerId={provider?.id || ''}
            bind:subfolders
            subfoldersDisabled={!canEditStorage || storageBusy === 'subfolders'}
            defaultRecipients={defaultRecipientsText}
            {storageNote}
            storageError={storageError ? t.storageSaveError : ''}
            {mailNote}
            onToggleSubfolders={toggleSubfolders}
            onBack={backToList}
            onOpenStorage={() => selectPanelSection('action-storage')}
            onOpenMail={() => selectPanelSection('action-mail')}
          />
        {:else if selectedTag}
          <TagFiche
            tag={selectedTag}
            count={taggedCounts.get(selectedTag.id) || 0}
            texts={t}
            actionTexts={a}
            folderEntry={tagFolderMap[selectedTag.id] || null}
            {subfolders}
            rootFolder={storage.folder || ''}
            rootDriveName={storage.driveName || ''}
            providerId={provider?.id || ''}
            storageEditable={canEditStorage}
            storageBusy={!!storageBusy}
            {storageNote}
            storageError={storageError ? t.storageSaveError : ''}
            recipients={tagRecipientMap[selectedTag.id] || null}
            defaultRecipients={defaultRecipientsText}
            mailEditable={canEditMail}
            mailBusy={!!recipientsBusy}
            {mailNote}
            mailError={mailError ? a.saveError : ''}
            onBack={backToList}
            onEdit={() => startEdit(selectedTag)}
            onDelete={() => (pendingDelete = selectedTag)}
            onFolderDefault={() => resetFolder(selectedTag.id)}
            onFolderPick={() => (picking = selectedTag.id)}
            onMailDefault={() => resetRecipients(selectedTag.id)}
            onMailPick={() => openRecipients(selectedTag)}
          />
        {/if}
      </section>
    </div>
  {/if}
</div>

{#if picking}
  <DriveFolderPicker
    texts={a}
    tag={$tags.find((tag) => tag.id === picking) || null}
    initialDriveId={tagFolderMap[picking]?.driveId || storage.driveId || ''}
    onSelect={applyPick}
    onClose={() => (picking = null)}
  />
{/if}

{#if editingRecipients}
  <TagRecipientsDialog
    tag={editingRecipients}
    recipients={tagRecipientMap[editingRecipients.id] || []}
    max={maxRecipients}
    texts={a}
    busy={recipientsBusy === editingRecipients.id}
    error={recipientsError}
    onSave={saveRecipients}
    onClose={() => (editingRecipients = null)}
  />
{/if}

{#if pendingDelete}
  <div
    class="tgp-modal-backdrop"
    on:click={() => (pendingDelete = null)}
    role="dialog"
    aria-modal="true"
    aria-labelledby="tgp-delete-title"
  >
    <div class="tgp-modal" on:click|stopPropagation role="none">
      <h3 id="tgp-delete-title" class="tgp-modal-title">{t.deleteTitle}</h3>
      <p class="tgp-modal-body">{deleteBody(pendingDelete)}</p>
      <div class="tgp-modal-actions">
        <button class="tgp-btn" on:click={() => (pendingDelete = null)}>{t.cancel}</button>
        <button class="tgp-btn tgp-btn-danger" on:click={confirmDelete}>{t.confirmDelete}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Tête de section ───────────────────────────────────────────────────────
     Le header du panneau porte « Ma configuration » et ne peut pas nommer
     l'écran, il y en a huit. Le bouton de création vit ici : un seul point
     d'entrée, toujours visible, quelle que soit la longueur de la liste. */
  .tgp-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 22px 12px;
    border-bottom: 1px solid var(--line);
    color: var(--brand-text);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .tgp-head h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .tgp-counter {
    font-size: 12px;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .tgp-counter-max {
    color: var(--danger-strong);
    font-weight: 600;
  }
  .tgp-add {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-left: auto;
    padding: 9px 16px;
    border: none;
    border-radius: 10px;
    background: var(--brand);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    box-shadow: 0 2px 10px -3px rgb(var(--brand-rgb) / 0.55);
    transition:
      background 0.15s,
      box-shadow 0.15s,
      transform 0.1s;
  }
  .tgp-add:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .tgp-add:active:not(:disabled) {
    transform: scale(0.97);
  }
  .tgp-add:disabled {
    opacity: 0.45;
    cursor: default;
    box-shadow: none;
  }

  /* ── Corps : toute la largeur du volet ── */
  .tgp-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 26px 32px;
  }
  .tgp-intro {
    margin: 0 0 20px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--ink-muted);
    max-width: 72ch;
  }
  .tgp-muted {
    padding: 0 0 10px;
    font-size: 12.5px;
    color: var(--ink-faint);
  }
  .tgp-error {
    margin-bottom: 16px;
    padding: 9px 12px;
    border-radius: 9px;
    font-size: 12.5px;
    color: var(--danger-text);
    background: var(--danger-bg);
    border: 1px solid var(--danger-line);
  }

  /* ── État vide ── */
  .tgp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 40px 20px;
    border: 1px dashed var(--line-strong);
    border-radius: 16px;
    background: var(--surface-tint);
    text-align: center;
  }
  .tgp-empty-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 14px;
    background: var(--brand-secondary-soft-12);
    color: var(--brand-text);
  }
  .tgp-empty p {
    margin: 0;
    max-width: 42ch;
    font-size: 13px;
    line-height: 1.6;
    color: var(--ink-muted);
  }

  /* ── Liste + fiche ─────────────────────────────────────────────────────────
     La liste reste en place (sticky) pendant que la fiche défile : on passe
     d'un tag à l'autre sans remonter. */
  .tgp-layout {
    display: grid;
    grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .tgp-list {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .tgp-search {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 42px;
    margin-bottom: 8px;
    padding: 0 13px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink-muted);
  }
  .tgp-search:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.12);
  }
  .tgp-search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 13.5px;
    color: var(--ink);
  }
  .tgp-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .tgp-search-empty {
    padding: 10px 12px;
    font-size: 12.5px;
    color: var(--ink-muted);
  }

  /* Une ligne : la pastille dans son disque teinté, le nom, le compte, et
     deux icônes — teintes de la couleur du tag quand il a SA règle, à peine
     visibles sinon. */
  .tgp-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 58px;
    padding: 9px 12px;
    border: 1px solid transparent;
    border-radius: 14px;
    background: transparent;
    font-family: inherit;
    text-align: left;
    color: var(--ink);
    cursor: pointer;
    box-sizing: border-box;
    transition:
      background 0.12s,
      border-color 0.12s,
      box-shadow 0.12s;
  }
  .tgp-row:hover {
    background: var(--surface-tint);
  }
  .tgp-row:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }
  .tgp-row-on,
  .tgp-row-on:hover {
    background: var(--surface);
    border-color: var(--line);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--ink) 5%, transparent),
      0 10px 24px -16px color-mix(in srgb, var(--ink) 30%, transparent);
  }
  .tgp-row-draft {
    border: 1.5px dashed var(--brand);
    cursor: default;
  }
  .tgp-row-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--row-soft);
    flex-shrink: 0;
  }
  .tgp-row-shape {
    width: 15px;
    height: 15px;
    background: var(--row-fill);
    clip-path: var(--row-shape);
  }
  .tgp-row-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tgp-row-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tgp-row-sub {
    font-size: 12px;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .tgp-row-sub-draft {
    color: var(--brand-text);
  }
  .tgp-rules {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .tgp-rule {
    display: inline-flex;
    color: var(--line-faint);
  }
  .tgp-rule-on {
    color: var(--row-dot);
  }
  .tgp-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    padding: 10px 12px 0;
    font-size: 11.5px;
    color: var(--ink-muted);
  }
  .tgp-legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .tgp-sep {
    height: 1px;
    margin: 14px 4px 10px;
    background: var(--line);
  }
  .tgp-row-common :global(svg) {
    flex-shrink: 0;
    color: var(--ink-muted);
  }
  .tgp-common-badge {
    background: var(--brand-secondary-soft-12);
    color: var(--ink-soft);
  }
  .tgp-common-badge :global(svg) {
    color: var(--ink-soft);
  }
  .tgp-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .tgp-detail {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--surface);
    overflow: hidden;
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--ink) 4%, transparent),
      0 16px 40px -24px color-mix(in srgb, var(--ink) 22%, transparent);
  }

  .tgp-skeleton {
    min-height: 58px;
    border-radius: 14px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 25%,
      color-mix(in srgb, var(--brand-secondary) 5.2%, #efefef) 37%,
      color-mix(in srgb, var(--brand-secondary) 3.5%, #f8f8f8) 63%
    );
    background-size: 400% 100%;
    animation: tgp-shimmer 1.4s ease-in-out infinite;
  }
  .tgp-skeleton-detail {
    min-height: 360px;
    border: none;
    box-shadow: none;
  }
  @keyframes tgp-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }

  /* ── Boutons ── */
  .tgp-btn {
    padding: 8px 15px;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    background: var(--surface);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .tgp-btn:hover:not(:disabled) {
    background: var(--surface-tint);
  }
  .tgp-btn-danger {
    background: var(--danger-strong);
    border-color: var(--danger-strong);
    color: #fff;
  }
  .tgp-btn-danger:hover:not(:disabled) {
    background: var(--danger-strong);
    filter: brightness(0.95);
  }

  /* ── Confirmation de suppression ── */
  .tgp-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    justify-content: center;
    background: color-mix(in srgb, var(--ink) 40%, transparent);
    padding: max(20px, var(--safe-top, 0px)) 20px max(20px, var(--safe-bottom, 0px));
    /* margin:auto sur le panneau + overflow : les boutons Annuler/Supprimer
       restent atteignables même quand le contenu dépasse l'écran mobile. */
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .tgp-modal {
    margin: auto;
    width: 100%;
    max-width: 400px;
    background: var(--surface);
    border-radius: 16px;
    padding: 22px;
    box-shadow: 0 24px 60px color-mix(in srgb, var(--ink) 25%, transparent);
  }
  .tgp-modal-title {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
    color: var(--ink);
  }
  .tgp-modal-body {
    margin: 0 0 18px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--ink-muted);
  }
  .tgp-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  /* Téléphone : la liste et la fiche sont deux écrans. Règles de base plus
     haut, media query APRÈS — à spécificité égale, c'est l'ordre qui décide. */
  @media (max-width: 760px) {
    .tgp-head {
      padding: 12px 16px 10px;
    }
    .tgp-body {
      padding: 14px 16px 24px;
    }
    .tgp-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .tgp-list {
      position: static;
    }
    /* La liste seule à l'écran : aucune ligne n'est « ouverte », aucune ne se
       détache des autres. */
    .tgp-layout:not(.tgp-detail-open) .tgp-row-on {
      background: transparent;
      border-color: transparent;
      box-shadow: none;
    }
    .tgp-detail-open .tgp-list,
    .tgp-layout:not(.tgp-detail-open) .tgp-detail {
      display: none;
    }
    /* La présentation de la page n'a plus lieu d'être quand on est dans une
       fiche : elle repousserait le formulaire sous le pli. */
    .tgp-body-detail .tgp-intro {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tgp-skeleton {
      animation: none;
    }
    .tgp-row {
      transition: none;
    }
  }
</style>
