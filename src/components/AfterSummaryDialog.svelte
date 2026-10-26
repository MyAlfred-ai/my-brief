<script>
  /**
   * « Votre résumé est prêt » — la fenêtre qui suit le PREMIER résumé d'une
   * réunion : ranger la réunion dans un tag, envoyer le résumé par mail,
   * l'entreposer, ou tout à la fois, en un geste. Fenêtre centrée sur
   * ordinateur, feuille du bas sur téléphone : même contenu, même ordre — c'est
   * le CSS qui tranche (≤ 768 px), comme la feuille de fin de réunion.
   *
   * Ouverte par `stores/afterSummary.js`, qui décide QUAND (réunion relue,
   * réglages relus, préférence, quelque chose à proposer). Montée à la racine
   * d'App.svelte ; elle ne reçoit que la réunion affichée et les deux actions
   * d'App — les mêmes que le menu « Partager » : même verrou « une action à la
   * fois », mêmes notifications.
   *
   * ── Choisir, puis lancer ────────────────────────────────────────────────
   * Rien ne part au clic sur une carte : on coche, le bouton principal NOMME ce
   * qui va se passer (« Ranger, envoyer et entreposer »), et c'est lui qui
   * lance. Le tag passe en premier : le serveur relit le tag de la réunion pour
   * choisir destinataires et dossier (lib/actions/resolve.js) — envoyer avant
   * de ranger enverrait à la liste d'avant. S'il échoue, rien d'autre ne part.
   *
   * La fenêtre se referme au lancement : les résultats arrivent en
   * notifications, une par action, avec ce qui a réussi ou ce qu'il faut faire.
   * Une fenêtre qui resterait ouverte masquerait l'écran d'approbation d'un
   * dépôt.
   *
   * ── Ce que la fenêtre annonce ───────────────────────────────────────────
   * Les destinataires et le dossier affichés suivent le tag CHOISI, avant même
   * qu'il soit posé : c'est ce qui rend la règle « le tag choisit qui reçoit et
   * où ça se range » visible au moment où elle compte (utils/afterSummary.js,
   * aperçu de la règle du serveur).
   *
   * ── Ajouter un destinataire ─────────────────────────────────────────────
   * Une requête d'envoi ne porte JAMAIS de destinataire (cf. l'en-tête de
   * routes/actions/execute.js). Une adresse ajoutée ici est donc ENREGISTRÉE —
   * dans la liste du tag choisi, sinon dans la liste par défaut — et la note
   * sous le champ le dit avant qu'on valide. Une adresse ajoutée dans cette
   * fenêtre peut s'y retirer (faute de frappe) ; les autres se règlent dans
   * « Mes tags » ou « Ma configuration ».
   *
   * Le fond porte `.asd-backdrop` : c'est ce que touche le bouton retour
   * d'Android (utils/backNavigation.js).
   */
  import { tick } from 'svelte';
  import { uiText } from '../store.js';
  import { auth } from '../stores/auth.js';
  import { historyItems, meetingIdOf } from '../stores/history.js';
  import {
    tags,
    tagsById,
    tagColors,
    tagShapes,
    tagsMax,
    tagColorVars,
    tagShapeClip,
    tagMeeting,
    upsertTag,
    loadTags,
  } from '../stores/tags.js';
  import {
    actionSettings,
    saveRecipientList,
    saveAfterSummaryOffer,
  } from '../stores/actionSettings.js';
  import { actionAvailability } from '../stores/actionAvailability.js';
  import { afterSummaryRequest, dismissAfterSummary } from '../stores/afterSummary.js';
  import { showToast, removeToast } from '../stores/toasts.js';
  import { formatText } from '../utils/i18nFormat.js';
  import { libraryKind } from '../utils/storageVocabulary.js';
  import {
    afterSummaryChoices,
    mailPlan,
    listAfterRemoval,
    storagePreview,
    readablePath,
    launchLabel,
    freshTagColor,
  } from '../utils/afterSummary.js';
  import { looksLikeEmail } from '../utils/mailDraft.js';
  import TagChip from './TagChip.svelte';
  import StorageLogo from './icons/StorageLogo.svelte';
  import IconDone from '~icons/solar/check-circle-bold';
  import IconClose from '~icons/solar/close-circle-linear';
  import IconTag from '~icons/solar/tag-linear';
  import IconMail from '~icons/solar/letter-linear';
  import IconCloud from '~icons/solar/cloud-upload-linear';
  import IconFolder from '~icons/solar/folder-with-files-linear';
  import IconAdd from '~icons/solar/add-circle-linear';
  import CheckMark from './icons/CheckMark.svelte';

  /** Réunion affichée (`currentMeetingId` d'App). Une autre ⇒ la proposition tombe. */
  export let meetingId = null;
  /** @type {(kind: 'summary') => Promise<void>} — App : verrou, pièce jointe, notification */
  export let onEmail = async () => {};
  /** @type {(kind: 'summary') => Promise<void>} */
  export let onStore = async () => {};

  let dialogEl;
  let openedFor = null;
  /** Tag choisi dans la fenêtre — posé seulement au lancement. */
  let pickedTagId = null;
  /** Réunion déjà rangée : le choix du tag reste replié tant qu'on ne demande pas à changer. */
  let changingTag = false;
  let selected = { email: false, storage: false };
  let dontOffer = false;
  let creatingTag = false;
  let newTagLabel = '';
  let tagBusy = false;
  let tagError = '';
  let draftAddress = '';
  let recipientBusy = false;
  let recipientError = '';
  /** Adresses ajoutées dans CETTE fenêtre — les seules qu'elle sait retirer. */
  let added = new Set();
  /** Tags dont la liste de destinataires est née dans cette fenêtre. */
  let seeded = new Set();

  $: T = $uiText.afterSummary;
  $: request = $afterSummaryRequest;
  $: open = !!request && !!meetingId && request.meetingId === meetingId;
  // La réunion affichée a changé (nouvelle réunion, autre conversation) : la
  // proposition ne vaut plus — et ne doit pas ressurgir au retour.
  // Après `tick()`, pas dans la mise à jour en cours : un store écrit PENDANT
  // les `$:` de Svelte 4 voit son invalidation effacée en fin de passe —
  // `request` gardait l'ancienne demande, et la fenêtre se rouvrait au retour
  // sur la réunion (cas couvert par le test de composant).
  $: if (request && request.meetingId !== meetingId) tick().then(dismissAfterSummary);
  // `currentTagId` en argument : Svelte ne suit que ce qu'il VOIT, et l'ouverture
  // doit partir du tag que la réunion porte déjà.
  $: if (open && openedFor !== request.meetingId) start(request.meetingId, currentTagId);
  $: if (!open) openedFor = null;

  $: item = $historyItems.find((it) => meetingIdOf(it) === meetingId) || null;
  $: meetingTitle = (item?.title || '').trim();
  $: currentTagId = item?.tagId || null;
  $: currentTag = currentTagId ? $tagsById.get(currentTagId) || null : null;
  $: pickedTag = pickedTagId ? $tagsById.get(pickedTagId) || null : null;
  $: tagChanged = !!pickedTag && pickedTagId !== currentTagId;
  $: showTagPicker = !currentTag || changingTag;

  $: choices = afterSummaryChoices($actionAvailability, { tagged: !!currentTagId });
  $: settings = $actionSettings.settings;
  $: mail = mailPlan(settings, pickedTag ? pickedTagId : null);
  $: maxRecipients = $actionSettings.limits?.maxRecipients || 0;
  $: full = maxRecipients > 0 && mail.recipients.length >= maxRecipients;
  $: count = mail.recipients.length;
  $: countText =
    count === 1
      ? $uiText.postActions.recipientOne
      : $uiText.postActions.recipientsMany.replace('{count}', String(count));
  $: emailHint =
    mail.source === 'tag' && pickedTag
      ? `${T.emailTagHint.replace('{tag}', pickedTag.label)} · ${countText}`
      : count
        ? `${T.emailUserHint} · ${countText}`
        : T.emailSelfHint;
  $: savedNote = full
    ? T.recipientsFull.replace('{max}', String(maxRecipients))
    : pickedTag
      ? T.recipientSavedTag.replace('{tag}', pickedTag.label)
      : T.recipientSavedUser;
  $: selfEmail = $auth.user?.email || '';

  $: provider = $actionAvailability.storageLabel;
  $: preview = storagePreview(settings, pickedTag);
  $: logoKind = libraryKind($actionAvailability.storageProvider, preview.library);
  $: folderHint =
    preview.kind === 'tagFolder'
      ? T.storageTagFolder.replace('{tag}', pickedTag?.label || '')
      : preview.kind === 'tagSubfolder'
        ? T.storageTagSubfolder.replace('{tag}', pickedTag?.label || '')
        : preview.kind === 'user'
          ? T.storageUserFolder
          : T.storageDefaultFolder;
  $: folderPath = readablePath(preview.path);
  $: needsApproval = !!settings?.storage?.requireApproval;

  $: verbs = [
    tagChanged && T.verbTag,
    choices.email && selected.email && T.verbEmail,
    choices.storage && selected.storage && T.verbStorage,
  ].filter(Boolean);
  $: primaryLabel = launchLabel(verbs, T.and) || T.pickOne;
  $: busy = tagBusy || recipientBusy;

  /** Ouverture : tout repart de zéro, sur le tag que porte la réunion. */
  async function start(id, tagId) {
    openedFor = id;
    pickedTagId = tagId;
    changingTag = false;
    selected = { email: false, storage: false };
    dontOffer = false;
    creatingTag = false;
    newTagLabel = '';
    tagError = '';
    draftAddress = '';
    recipientError = '';
    added = new Set();
    seeded = new Set();
    if (!$tags.length) loadTags();
    await tick();
    dialogEl?.focus();
  }

  function toggle(action) {
    selected = { ...selected, [action]: !selected[action] };
  }

  function pickTag(id) {
    pickedTagId = pickedTagId === id ? currentTagId : id;
    tagError = '';
  }

  /** « Garder » : on revient au tag que la réunion porte déjà. */
  function keepTag() {
    pickedTagId = currentTagId;
    changingTag = false;
  }

  async function createTag() {
    const label = newTagLabel.trim();
    if (!label || tagBusy) return;
    tagBusy = true;
    tagError = '';
    const res = await upsertTag({ label, color: freshTagColor($tagColors, $tags) });
    tagBusy = false;
    if (!res.ok) {
      const errors = $uiText.tagsPanel.errors;
      tagError = (errors[res.error] || errors.network).replace('{max}', String($tagsMax || 32));
      return;
    }
    creatingTag = false;
    newTagLabel = '';
    if (res.tag) pickedTagId = res.tag.id;
  }

  /** Refus du serveur → phrase. Il NOMME ce qu'il refuse : on le reprend. */
  function recipientErrorText(res) {
    const texts = $uiText.configActions;
    if (res.error === 'recipient_invalid') {
      return texts.recipientRejected.replace('{list}', (res.data?.rejected || []).join(', '));
    }
    if (res.error === 'recipients_limit_reached') {
      return texts.recipientsTooMany.replace('{max}', String(res.data?.max ?? maxRecipients));
    }
    return texts.saveError;
  }

  async function addRecipient() {
    const address = draftAddress.trim().toLowerCase();
    if (!address || recipientBusy) return;
    if (!looksLikeEmail(address)) {
      recipientError = $uiText.configActions.recipientInvalid;
      return;
    }
    if (mail.recipients.includes(address)) {
      draftAddress = '';
      return;
    }
    const { target } = mail;
    const seeding = !!target && mail.source !== 'tag';
    recipientBusy = true;
    recipientError = '';
    const res = await saveRecipientList(target, [...mail.recipients, address]);
    recipientBusy = false;
    if (!res.ok) {
      recipientError = recipientErrorText(res);
      return;
    }
    if (seeding) seeded = new Set([...seeded, target]);
    added = new Set([...added, address]);
    draftAddress = '';
  }

  async function removeRecipient(address) {
    if (recipientBusy) return;
    const { target } = mail;
    const next = listAfterRemoval({
      settings,
      target,
      recipients: mail.recipients,
      address,
      seeded: seeded.has(target),
    });
    recipientBusy = true;
    recipientError = '';
    const res = await saveRecipientList(target, next);
    recipientBusy = false;
    if (!res.ok) {
      recipientError = recipientErrorText(res);
      return;
    }
    added = new Set([...added].filter((value) => value !== address));
    if (target && !next.length) seeded = new Set([...seeded].filter((id) => id !== target));
  }

  /** « Ne plus me proposer » : enregistré sur le compte, et dit où le rallumer. */
  async function turnOff() {
    const res = await saveAfterSummaryOffer(false);
    if (res.ok) showToast(T.offerOff, 'info', 8000);
  }

  function later() {
    if (dontOffer) turnOff();
    dismissAfterSummary();
  }

  async function launch() {
    if (!verbs.length || busy) return;
    const plan = {
      meetingId,
      tag: tagChanged ? pickedTag : null,
      email: choices.email && selected.email,
      storage: choices.storage && selected.storage,
    };
    const texts = T;
    if (dontOffer) turnOff();
    dismissAfterSummary();

    // Une notification d'attente le temps que le PDF se fabrique et parte :
    // la fenêtre est fermée, et sans elle rien ne dirait que ça travaille.
    // Le rangement est instantané et a sa propre notification : il n'attend pas.
    const steps = [
      plan.email && texts.stepEmail,
      plan.storage && texts.stepStorage.replace('{provider}', provider),
    ].filter(Boolean);
    const progress =
      plan.email || plan.storage
        ? showToast(
            formatText($uiText, 'afterSummary.running', { steps: steps.join(', ') }),
            'info',
            0,
          )
        : null;
    try {
      if (plan.tag) {
        const res = await tagMeeting(plan.meetingId, plan.tag.id);
        if (!res.ok) {
          const errors = $uiText.tagsPanel.errors;
          showToast(
            plan.email || plan.storage ? texts.tagFailed : errors[res.error] || errors.network,
            'error',
            8000,
          );
          return;
        }
        showToast(texts.tagApplied.replace('{tag}', plan.tag.label), 'success', 5000);
      }
      // Chaque action relit la réunion affichée au moment où elle part : si
      // l'utilisateur en a ouvert une autre entre-temps, on s'arrête là.
      if (plan.email && meetingId === plan.meetingId) await onEmail('summary');
      if (plan.storage && meetingId === plan.meetingId) await onStore('summary');
    } finally {
      if (progress) removeToast(progress);
    }
  }

  function onKeydown(event) {
    if (!open || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    later();
  }

  /** Le curseur arrive dans le nom dès que le champ s'ouvre — on vient pour écrire. */
  function focusOnMount(node) {
    node.focus();
  }

  /** Couleur et forme d'une pastille de tag. `_colors`, `_shapes` : dépendances VISIBLES pour Svelte. */
  function tagStyle(color, shape, _colors, _shapes) {
    const vars = tagColorVars(color);
    const clip = tagShapeClip(shape);
    return `--t-dot: ${vars.dot}; --t-soft: ${vars.soft}; --t-fill: ${vars.fill}; --t-shape: ${clip}`;
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="asd-backdrop" on:click|self={later}>
    <div
      class="asd"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asd-title"
      aria-describedby="asd-sub"
      tabindex="-1"
      bind:this={dialogEl}
    >
      <div class="asd-grip" aria-hidden="true"></div>

      <header class="asd-head">
        <span class="asd-badge" aria-hidden="true"><IconDone width="26" height="26" /></span>
        <div class="asd-head-text">
          <h2 class="asd-title" id="asd-title">{T.title}</h2>
          {#if meetingTitle}<p class="asd-meeting">{meetingTitle}</p>{/if}
          <p class="asd-sub" id="asd-sub">{T.subtitle}</p>
        </div>
        <button type="button" class="asd-close" on:click={later} aria-label={T.close}>
          <IconClose width="22" height="22" />
        </button>
      </header>

      <div class="asd-body">
        <!-- ── 1. Ranger : le tag choisit qui reçoit et où ça se range ── -->
        <section class="asd-tagbox" aria-labelledby="asd-tag-title">
          <div class="asd-tagbox-head">
            <span class="asd-step" aria-hidden="true"><IconTag width="17" height="17" /></span>
            <div class="asd-tagbox-text">
              <h3 class="asd-h3" id="asd-tag-title">{T.tagTitle}</h3>
              <p class="asd-hint">{T.tagPrompt}</p>
            </div>
            {#if currentTag}
              <button
                type="button"
                class="asd-link"
                on:click={() => (changingTag ? keepTag() : (changingTag = true))}
              >
                {changingTag ? T.tagKeep : T.tagChange}
              </button>
            {/if}
          </div>

          {#if !showTagPicker}
            <p class="asd-tag-current">
              <span>{T.tagCurrent}</span>
              <TagChip tag={currentTag} />
            </p>
          {:else}
            <div class="asd-tags" role="radiogroup" aria-labelledby="asd-tag-title">
              {#each $tags as tag (tag.id)}
                <button
                  type="button"
                  class="asd-tag"
                  class:asd-tag-on={pickedTagId === tag.id}
                  role="radio"
                  aria-checked={pickedTagId === tag.id}
                  style={tagStyle(tag.color, tag.shape, $tagColors, $tagShapes)}
                  on:click={() => pickTag(tag.id)}
                >
                  <span class="asd-tag-dot" aria-hidden="true"></span>
                  <span class="asd-tag-label">{tag.label}</span>
                  {#if pickedTagId === tag.id}
                    <CheckMark />
                  {/if}
                </button>
              {/each}
              {#if !creatingTag}
                <button
                  type="button"
                  class="asd-tag asd-tag-new"
                  on:click={() => ((creatingTag = true), (tagError = ''))}
                >
                  <IconAdd width="16" height="16" aria-hidden="true" />
                  <span>{T.tagNew}</span>
                </button>
              {/if}
            </div>
            {#if creatingTag}
              <form class="asd-inline" on:submit|preventDefault={createTag}>
                <input
                  class="asd-input"
                  bind:value={newTagLabel}
                  placeholder={T.tagNewPlaceholder}
                  aria-label={T.tagNewPlaceholder}
                  maxlength="32"
                  autocomplete="off"
                  disabled={tagBusy}
                  use:focusOnMount
                />
                <button
                  type="submit"
                  class="asd-mini asd-mini-primary"
                  disabled={tagBusy || !newTagLabel.trim()}
                >
                  {T.tagCreate}
                </button>
                <button
                  type="button"
                  class="asd-mini"
                  on:click={() => ((creatingTag = false), (newTagLabel = ''), (tagError = ''))}
                >
                  {T.tagCancel}
                </button>
              </form>
            {:else if !$tags.length}
              <p class="asd-hint asd-hint-gap">{T.tagNoneYet}</p>
            {/if}
            {#if tagError}<p class="asd-error" role="alert">{tagError}</p>{/if}
          {/if}
        </section>

        <!-- ── 2. Envoyer par mail ── -->
        {#if choices.email}
          <section class="asd-action" class:asd-action-on={selected.email}>
            <button
              type="button"
              class="asd-action-head"
              aria-pressed={selected.email}
              on:click={() => toggle('email')}
            >
              <span class="asd-action-icon" aria-hidden="true">
                <IconMail width="20" height="20" />
              </span>
              <span class="asd-action-text">
                <span class="asd-action-title">{T.emailTitle}</span>
                <span class="asd-action-hint">{emailHint}</span>
              </span>
              <span class="asd-tick" aria-hidden="true">
                {#if selected.email}<CheckMark size={14} />{/if}
              </span>
            </button>

            {#if selected.email}
              <div class="asd-action-body">
                <ul class="asd-recipients">
                  {#each mail.recipients as address (address)}
                    <li class="asd-recipient" class:asd-recipient-new={added.has(address)}>
                      <span class="asd-recipient-text">{address}</span>
                      {#if added.has(address)}
                        <button
                          type="button"
                          class="asd-recipient-remove"
                          disabled={recipientBusy}
                          aria-label={T.recipientRemove.replace('{address}', address)}
                          on:click={() => removeRecipient(address)}>×</button
                        >
                      {/if}
                    </li>
                  {/each}
                  {#if selfEmail}
                    <li class="asd-recipient asd-recipient-self">
                      <span class="asd-recipient-text">{selfEmail}</span>
                      <span class="asd-recipient-cc">{T.emailCopy}</span>
                    </li>
                  {/if}
                </ul>
                <!-- `novalidate` : la règle d'adresse est la nôtre (et celle du
                     serveur), dite sous le champ — pas la bulle du navigateur. -->
                <form class="asd-inline" novalidate on:submit|preventDefault={addRecipient}>
                  <input
                    class="asd-input"
                    type="email"
                    inputmode="email"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    bind:value={draftAddress}
                    on:input={() => (recipientError = '')}
                    placeholder={T.recipientPlaceholder}
                    aria-label={T.recipientPlaceholder}
                    disabled={full || recipientBusy}
                  />
                  <button
                    type="submit"
                    class="asd-mini asd-mini-primary"
                    disabled={full || recipientBusy || !draftAddress.trim()}
                  >
                    {T.recipientAdd}
                  </button>
                </form>
                {#if recipientError}
                  <p class="asd-error" role="alert">{recipientError}</p>
                {:else}
                  <p class="asd-note">{savedNote}</p>
                {/if}
              </div>
            {/if}
          </section>
        {/if}

        <!-- ── 3. Entreposer ── -->
        {#if choices.storage}
          <section class="asd-action" class:asd-action-on={selected.storage}>
            <button
              type="button"
              class="asd-action-head"
              aria-pressed={selected.storage}
              on:click={() => toggle('storage')}
            >
              <span class="asd-action-icon" aria-hidden="true">
                <IconCloud width="20" height="20" />
              </span>
              <span class="asd-action-text">
                <span class="asd-action-title"
                  >{T.storageTitle.replace('{provider}', provider)}</span
                >
                <span class="asd-action-hint">{folderHint}</span>
              </span>
              <span class="asd-tick" aria-hidden="true">
                {#if selected.storage}<CheckMark size={14} />{/if}
              </span>
            </button>

            {#if selected.storage}
              <div class="asd-action-body">
                <div class="asd-folder">
                  {#if logoKind}
                    <StorageLogo kind={logoKind} size={20} />
                  {:else}
                    <IconFolder width="18" height="18" aria-hidden="true" />
                  {/if}
                  <span class="asd-folder-text">
                    <span class="asd-folder-path">{folderPath || folderHint}</span>
                    <span class="asd-folder-lib">{preview.library || provider}</span>
                  </span>
                </div>
                {#if needsApproval}<p class="asd-note">{T.storageApproval}</p>{/if}
              </div>
            {/if}
          </section>
        {/if}
      </div>

      <footer class="asd-foot">
        <label class="asd-optout">
          <input type="checkbox" bind:checked={dontOffer} />
          <span>{T.dontOffer}</span>
        </label>
        <button type="button" class="asd-btn asd-btn-ghost" on:click={later}>{T.later}</button>
        <button
          type="button"
          class="asd-btn asd-btn-primary"
          disabled={!verbs.length || busy}
          on:click={launch}
        >
          {primaryLabel}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  /* Ordinateur : fenêtre centrée, au niveau de la feuille de fin de réunion
     (10000) — les notifications (10001) passent au-dessus, l'approbation d'un
     dépôt (10060) aussi. Téléphone : feuille du bas. */
  .asd-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(15, 23, 42, 0.5);
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
    animation: asd-fade 0.18s ease-out;
  }

  .asd {
    width: 100%;
    /* 600 : « Ranger, envoyer et entreposer » tient sur la ligne de « Plus
       tard » et de « Ne plus me proposer » — le pied ne saute pas d'une à deux
       lignes au troisième choix. */
    max-width: 600px;
    max-height: min(760px, calc(100dvh - 32px));
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: 20px;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.6) inset,
      0 28px 70px rgba(15, 23, 42, 0.28);
    font-family: 'Lexend', sans-serif;
    color: var(--ink);
    overflow: hidden;
    outline: none;
    animation: asd-pop 0.26s cubic-bezier(0.33, 1, 0.68, 1);
  }

  .asd-grip {
    display: none;
    width: 40px;
    height: 4px;
    margin: 8px auto 0;
    border-radius: 999px;
    background: var(--line-faint);
    flex: none;
  }

  /* ── En-tête : la bonne nouvelle d'abord ── */
  .asd-head {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 22px 56px 16px 22px;
    background:
      radial-gradient(120% 140% at 0% 0%, var(--brand-secondary-soft-15), transparent 60%),
      linear-gradient(180deg, var(--brand-secondary-soft-08), transparent);
    flex: none;
  }

  .asd-badge {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 14px;
    background: var(--brand);
    color: #fff;
    box-shadow: 0 8px 20px rgb(var(--brand-rgb) / 0.32);
    animation: asd-badge 0.5s 0.08s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .asd-head-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .asd-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.2px;
  }

  .asd-meeting {
    margin: 2px 0 0;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .asd-sub {
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
    color: var(--ink-muted);
  }

  .asd-close {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .asd-close:hover {
    background: var(--surface-tint);
    color: var(--ink);
  }

  /* ── Corps : seul lui défile, l'en-tête et le pied restent en place ── */
  .asd-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 6px 22px 18px;
  }

  .asd-h3 {
    margin: 0;
    font-size: 14.5px;
    font-weight: 600;
    line-height: 1.3;
  }

  .asd-hint {
    margin: 2px 0 0;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--ink-muted);
  }
  .asd-hint-gap {
    margin-top: 10px;
  }

  /* ── 1. Le tag ── */
  .asd-tagbox {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface-tint);
  }

  .asd-tagbox-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .asd-tagbox-text {
    flex: 1;
    min-width: 0;
  }

  .asd-step {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 11px;
    background: var(--brand-secondary-soft-15);
    color: var(--brand-text);
  }

  .asd-link {
    flex: none;
    min-height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: 8px;
    background: none;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--brand-text);
    cursor: pointer;
  }
  .asd-link:hover {
    background: var(--brand-secondary-soft-12);
  }

  .asd-tag-current {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 0 0 46px;
    font-size: 13px;
    color: var(--ink-soft);
  }

  /* Bornée à quatre rangées : au-delà, la liste défile dans sa boîte. */
  .asd-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-height: 176px;
    overflow-y: auto;
    margin-top: 12px;
    padding: 3px;
  }

  .asd-tag {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    min-height: 36px;
    padding: 0 13px 0 11px;
    border: 1.5px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-soft);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color 0.15s,
      background 0.15s,
      box-shadow 0.15s,
      transform 0.15s;
  }
  .asd-tag:hover {
    border-color: var(--line-faint);
  }
  .asd-tag:active {
    transform: scale(0.97);
  }

  /* Même pastille que TagChip : 12 px (les motifs se lisent à partir de là),
     la forme en clip-path — pas de border-radius. */
  .asd-tag-dot {
    flex: none;
    width: 12px;
    height: 12px;
    clip-path: var(--t-shape);
    background: var(--t-fill);
  }

  .asd-tag-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .asd-tag-on,
  .asd-tag-on:hover {
    border-color: var(--t-dot);
    background: var(--t-soft);
    color: var(--ink);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--t-dot) 16%, transparent);
  }
  .asd-tag-on :global(svg) {
    color: var(--t-dot);
  }

  .asd-tag-new {
    border-style: dashed;
    color: var(--ink-muted);
    background: transparent;
  }
  .asd-tag-new:hover {
    color: var(--ink);
    background: var(--surface);
  }

  /* ── Champ + bouton, sur une ligne : nouveau tag, nouvelle adresse ── */
  .asd-inline {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }

  .asd-input {
    flex: 1;
    min-width: 0;
    height: 38px;
    padding: 0 12px;
    border: 1.5px solid var(--line-strong);
    border-radius: 10px;
    background: var(--surface);
    font-family: inherit;
    font-size: 13.5px;
    color: var(--ink);
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .asd-input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.15);
  }
  .asd-input:disabled {
    background: var(--surface-tint);
  }

  .asd-mini {
    flex: none;
    height: 38px;
    padding: 0 12px;
    border: 1.5px solid var(--line-strong);
    border-radius: 10px;
    background: var(--surface);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .asd-mini-primary {
    border-color: transparent;
    background: var(--brand-secondary-soft-15);
    color: var(--brand-text-strong);
  }
  .asd-mini:hover:not(:disabled) {
    filter: brightness(0.97);
  }
  .asd-mini:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .asd-error {
    margin: 8px 0 0;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--danger-text);
  }

  .asd-note {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--ink-muted);
  }

  /* ── 2 et 3. Les actions : des cartes qu'on coche ── */
  .asd-action {
    border: 1.5px solid var(--line-strong);
    border-radius: 16px;
    background: var(--surface);
    transition:
      border-color 0.18s,
      background 0.18s,
      box-shadow 0.18s;
  }
  .asd-action-on {
    border-color: var(--brand);
    background: var(--brand-secondary-soft-08);
    box-shadow: 0 6px 18px rgb(var(--brand-rgb) / 0.12);
  }

  .asd-action-head {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-height: 70px;
    padding: 14px;
    border: none;
    border-radius: 15px;
    background: none;
    font-family: inherit;
    text-align: left;
    color: var(--ink);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .asd-action-head:focus-visible,
  .asd-tag:focus-visible,
  .asd-btn:focus-visible,
  .asd-link:focus-visible,
  .asd-close:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .asd-action-icon {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 13px;
    background: var(--brand-secondary-soft-12);
    color: var(--brand-text);
    transition:
      background 0.18s,
      color 0.18s;
  }
  .asd-action-on .asd-action-icon {
    background: var(--brand);
    color: #fff;
  }

  .asd-action-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .asd-action-title {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.25;
  }

  .asd-action-hint {
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }

  .asd-tick {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 1.5px solid var(--line-faint);
    border-radius: 50%;
    background: var(--surface);
    color: #fff;
    transition:
      background 0.18s,
      border-color 0.18s;
  }
  .asd-action-on .asd-tick {
    border-color: var(--brand);
    background: var(--brand);
  }

  /* Aligné sur le texte du titre (icône 42 + écart 14). */
  .asd-action-body {
    padding: 0 14px 14px 70px;
    animation: asd-open 0.2s ease-out;
  }

  .asd-recipients {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .asd-recipient {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    font-size: 12.5px;
    color: var(--ink-soft);
  }

  .asd-recipient-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .asd-recipient-new {
    border-color: var(--success-line);
    background: var(--success-bg);
    color: var(--success-text);
    animation: asd-pop 0.2s ease-out;
  }

  .asd-recipient-self {
    border-style: dashed;
    background: transparent;
    color: var(--ink-muted);
  }

  .asd-recipient-cc {
    flex: none;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-faint);
  }

  .asd-recipient-remove {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-right: -4px;
    border: none;
    border-radius: 50%;
    background: color-mix(in srgb, var(--success-text) 14%, transparent);
    font-size: 14px;
    line-height: 1;
    color: inherit;
    cursor: pointer;
  }

  .asd-folder {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink-muted);
  }

  .asd-folder-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .asd-folder-path {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .asd-folder-lib {
    font-size: 12px;
    color: var(--ink-muted);
  }

  /* ── Pied : le choix, puis le geste ── */
  .asd-foot {
    flex: none;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 14px 22px;
    border-top: 1px solid var(--line);
    background: var(--surface);
  }

  .asd-optout {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    margin-right: auto;
    font-size: 12.5px;
    color: var(--ink-muted);
    cursor: pointer;
    user-select: none;
  }
  .asd-optout input {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: var(--brand);
    cursor: pointer;
  }

  .asd-btn {
    min-height: 44px;
    padding: 0 16px;
    border: none;
    border-radius: 12px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s,
      box-shadow 0.15s,
      transform 0.15s,
      opacity 0.15s;
  }
  .asd-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .asd-btn-ghost {
    background: none;
    color: var(--ink-soft);
  }
  .asd-btn-ghost:hover {
    background: var(--surface-tint);
  }

  .asd-btn-primary {
    background: var(--brand);
    color: #fff;
    box-shadow: 0 8px 18px rgb(var(--brand-rgb) / 0.3);
  }
  .asd-btn-primary:hover:not(:disabled) {
    background: var(--brand-strong);
  }
  .asd-btn-primary:disabled {
    background: var(--line-strong);
    color: var(--ink-muted);
    box-shadow: none;
    cursor: default;
  }

  /* ── Téléphone : feuille du bas, pouce sur le bouton principal ── */
  @media (max-width: 768px) {
    .asd-backdrop {
      align-items: flex-end;
      padding: 0;
    }
    .asd {
      max-width: none;
      max-height: calc(100dvh - var(--safe-top, 0px) - 16px);
      border-radius: 22px 22px 0 0;
      box-shadow: 0 -12px 40px rgba(15, 23, 42, 0.2);
      animation: asd-up 0.28s cubic-bezier(0.33, 1, 0.68, 1);
    }
    .asd-grip {
      display: block;
    }
    .asd-head {
      padding: 12px 52px 12px 16px;
      gap: 12px;
    }
    .asd-badge {
      width: 40px;
      height: 40px;
      border-radius: 12px;
    }
    .asd-title {
      font-size: 18px;
    }
    .asd-close {
      top: 14px;
      right: 8px;
      width: 44px;
      height: 44px;
    }
    .asd-body {
      padding: 4px 16px 14px;
    }
    .asd-tag-current {
      margin-left: 0;
    }
    /* Pas de défilement dans le défilement : au doigt, une liste bornée
       cachait « Nouveau tag » sous la dernière rangée. Le corps défile. */
    .asd-tags {
      max-height: none;
    }
    .asd-tag {
      min-height: 40px;
    }
    .asd-action-body {
      padding-left: 14px;
    }
    /* 16 px : en dessous, iOS zoome sur le champ au toucher. */
    .asd-input {
      height: 44px;
      font-size: 16px;
    }
    .asd-mini {
      height: 44px;
    }
    /* Le bouton principal sur toute la largeur, sous le pouce ; « Ne plus me
       proposer » et « Plus tard » se partagent la ligne du dessous. */
    .asd-foot {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 4px 8px;
      padding: 10px 16px calc(8px + var(--safe-bottom, 0px));
    }
    .asd-btn-primary {
      grid-column: 1 / -1;
      order: -1;
      min-height: 50px;
      font-size: 15px;
    }
    .asd-optout {
      min-height: 44px;
    }
  }

  @keyframes asd-fade {
    from {
      opacity: 0;
    }
  }
  @keyframes asd-pop {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.97);
    }
  }
  @keyframes asd-up {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes asd-badge {
    from {
      opacity: 0;
      transform: scale(0.4) rotate(-20deg);
    }
  }
  @keyframes asd-open {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .asd-backdrop,
    .asd,
    .asd-badge,
    .asd-action-body,
    .asd-recipient-new {
      animation: none;
    }
  }
</style>
