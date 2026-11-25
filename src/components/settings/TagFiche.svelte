<script>
  /**
   * Fiche d'un tag dans « Mes tags » — tout ce que le tag décide, sur une page.
   *
   * La page « Mes tags » est une liste à gauche et la fiche du tag choisi à
   * droite. La fiche pose les deux questions qu'un utilisateur se pose
   * vraiment, en clair : « Où ranger ses comptes rendus ? » et « À qui les
   * envoyer ? ». Chacune a DEUX réponses, présentées comme des choix radio :
   * comme les autres (la règle commune), ou une règle à lui. L'ancienne carte
   * empilait pour chaque règle une étiquette, une pastille d'état (« Dossier
   * dédié », « Sous-dossier automatique », « Liste par défaut »), un bouton et
   * un lien « Réinitialiser » : quatre éléments pour dire un choix binaire.
   *
   * Composant de PRÉSENTATION : il ne lit ni n'écrit aucun store de réglages.
   * TagsPanel lui passe les valeurs ENREGISTRÉES et reçoit les gestes. Les
   * choix ne sont donc jamais « cochés en avance » : choisir « Dans un dossier
   * que je choisis » ouvre la fenêtre de navigation, et la fiche ne bascule
   * qu'une fois le dossier enregistré. Fermer la fenêtre sans choisir laisse
   * la fiche telle qu'elle était — ce que des `<input type="radio">` natifs
   * n'auraient pas fait (le navigateur coche avant qu'on ait enregistré quoi
   * que ce soit). D'où des boutons `role="radio"`, comme dans TagForm.
   *
   * Les logos (Google Drive, OneDrive, SharePoint) disent OÙ va chaque
   * dossier : celui de la bibliothèque visée, calculé par `libraryKind()`.
   * Fournisseur inconnu (statut de connexion pas encore arrivé, ou refusé) :
   * l'icône de dossier générique, jamais le logo d'un fournisseur au hasard.
   *
   * ── Ce que l'IA doit savoir ──────────────────────────────────────────────
   * La première question de la fiche : le contexte du tag (le projet, ses
   * acteurs, ses sigles), lu par le compte rendu, l'infographie et l'Aide IA
   * d'une conversation taguée (services/api/lib/tagContext.js). Le texte est
   * le seul état que la fiche garde : un brouillon, rattaché au tag affiché,
   * enregistré par le parent à une pause de la frappe et quand on quitte le
   * champ — cliquer un autre tag de la liste fait d'abord quitter le champ.
   * La comparaison se fait sur l'écriture NORMALISÉE, celle que le serveur
   * garde : sans elle, un texte à trois lignes vides se réenregistrerait à
   * chaque sortie du champ.
   *
   * ── Tout s'enregistre aussitôt ───────────────────────────────────────────
   * Le nom se modifie sur place (crayon à côté du titre, Entrée ou sortie du
   * champ enregistre, Échap annule) ; couleur et forme se choisissent dans
   * une petite fenêtre (TagPastillePopover) ; le logo se dépose
   * (TagLogoField). Plus de formulaire « Nom et apparence » à valider : il ne
   * reste que pour les motifs et la couleur libre (« Motifs et couleur
   * libre… »). Le rangement et l'envoi sont repliés en une ligne chacun
   * (TagRule) : la réponse se lit, « Modifier » les déplie.
   */
  import { onDestroy, tick } from 'svelte';
  import TagChip from '../TagChip.svelte';
  import TagRule from './TagRule.svelte';
  import TagPastillePopover from './TagPastillePopover.svelte';
  import TagLogoField from './TagLogoField.svelte';
  import StorageLogo from '../icons/StorageLogo.svelte';
  import {
    tagColorVars,
    tagShapeClip,
    tagColors,
    tagShapes,
    normalizeTagContext,
  } from '../../stores/tags.js';
  import { libraryKind, storageLabel } from '../../utils/storageVocabulary.js';
  import IconBack from '~icons/solar/alt-arrow-left-linear';
  import IconPen from '~icons/solar/pen-linear';
  import IconTrash from '~icons/solar/trash-bin-trash-linear';
  import IconFolder from '~icons/solar/folder-linear';
  import IconMail from '~icons/solar/letter-linear';
  import IconInfo from '~icons/solar/info-circle-linear';
  import IconCheck from '~icons/solar/check-circle-linear';
  import IconContext from '~icons/solar/document-text-linear';
  import IconLogo from '~icons/solar/gallery-linear';
  import IconCaret from '~icons/solar/alt-arrow-down-linear';

  /** @type {{id: string, label: string, color: string, shape?: string, context?: string, logoAt?: string}} */
  export let tag;
  /** Conversations affichées qui portent ce tag. */
  export let count = 0;
  /** Libellés `uiText.tagsPanel`. */
  export let texts;
  /** Libellés `uiText.configActions` (racine d'une bibliothèque). */
  export let actionTexts;

  // ── Rangement ──
  /** Destination propre au tag (`storage.tagFolders`), ou null. */
  export let folderEntry = null;
  /** Interrupteur « Un sous-dossier par tag » (réglage commun). */
  export let subfolders = false;
  /** Dossier principal (`storage.folder`) — vide : celui de l'administrateur. */
  export let rootFolder = '';
  export let rootDriveName = '';
  /** `google`, `microsoft`, ou vide tant que /connect/status n'a pas répondu. */
  export let providerId = '';
  export let storageEditable = false;
  export let storageBusy = false;
  /** Pourquoi le rangement est inactif — déjà traduit, ou vide. */
  export let storageNote = '';
  export let storageError = '';

  // ── Envoi ──
  /** Liste propre au tag (`mail.tagRecipients`), ou null. */
  export let recipients = null;
  /** Ce que « destinataires habituels » désigne : « vous seul », « vous + 2 adresses »… */
  export let defaultRecipients = '';
  export let mailEditable = false;
  export let mailBusy = false;
  export let mailNote = '';
  export let mailError = '';

  // ── Contexte ──
  /** Longueur maximale — celle que l'API a servie. */
  export let contextMax = 1500;
  /** Qui le lit, déjà traduit : « Compte rendu », puis ce que le compte utilise. */
  export let contextReaders = [];
  /** Enregistrement du texte DE CE TAG : `''`, `'saving'`, `'saved'` ou `'error'`. */
  export let contextState = '';
  /** Pourquoi il a échoué — déjà traduit, ou vide. */
  export let contextError = '';
  /** @type {(tagId: string, text: string) => void} */
  export let onContextSave = () => {};

  // ── Nom et pastille, enregistrés aussitôt ──
  /** Teintes unies et formes proposées dans la fenêtre de la pastille. */
  export let solidColors = [];
  export let shapeSlugs = [];
  /** Refus du nom ou de la pastille — déjà traduit, ou vide. */
  export let appearanceError = '';
  /** @type {(label: string) => void} */
  export let onRename = () => {};
  /** @type {(choice: {color: string, shape: string}) => void} */
  export let onPastille = () => {};

  // ── Logo ──
  /** Le logo lu (data URL), vide tant qu'il ne l'est pas. */
  export let logo = '';
  export let logoBusy = false;
  export let logoError = '';
  /** @type {(file: File) => void} */
  export let onLogoFile = () => {};
  export let onLogoRemove = () => {};

  export let onBack = () => {};
  /** Le formulaire complet : motifs, couleur libre. */
  export let onEdit = () => {};
  export let onDelete = () => {};
  /** Revenir à la règle commune (retire la destination propre). */
  export let onFolderDefault = () => {};
  /** Ouvrir la fenêtre de navigation. */
  export let onFolderPick = () => {};
  export let onMailDefault = () => {};
  export let onMailPick = () => {};

  /**
   * Une destination existe dès qu'elle nomme un chemin OU une bibliothèque —
   * même règle que `resolveFolder` côté serveur : la RACINE d'un Drive
   * partagé rend un `folder` vide avec un `driveId`.
   */
  $: folderCustom = !!(folderEntry?.folder || folderEntry?.driveId);
  $: mailCustom = !!recipients?.length;

  // `$tagColors` / `$tagShapes` nommés : les helpers lisent leur store de
  // façon impérative, une fiche rendue avant /tags garderait le repli.
  $: vars = ($tagColors, tagColorVars(tag.color));
  $: clip = ($tagShapes, tagShapeClip(tag.shape));

  $: countText =
    count === 0
      ? texts.ficheCountNone
      : count === 1
        ? texts.ficheCountOne
        : texts.ficheCountMany.replace('{n}', String(count));

  $: rootLabel = rootFolder || texts.rootAdmin;
  $: defaultPath = subfolders ? `${rootLabel} › ${tag.label}` : rootLabel;
  $: rootLibrary = rootDriveName || storageLabel(providerId, '');
  $: rootKind = libraryKind(providerId, rootDriveName);
  $: customPath = folderEntry?.folder || actionTexts.folderDriveRoot;
  $: customLibrary = folderEntry?.driveName || storageLabel(providerId, '');
  $: customKind = libraryKind(providerId, folderEntry?.driveName);

  // ── Nom sur place, pastille, règles dépliées : remis à zéro à chaque tag ──
  let renaming = false;
  let nameDraft = '';
  let nameInput;
  let pastilleOpen = false;
  /** Règles dépliées — chacune pour soi. */
  let folderOpen = false;
  let mailOpen = false;
  let shownFor = null;
  $: if (tag.id !== shownFor) {
    shownFor = tag.id;
    renaming = false;
    pastilleOpen = false;
    folderOpen = false;
    mailOpen = false;
  }

  async function startRename() {
    nameDraft = tag.label;
    renaming = true;
    await tick();
    nameInput?.select();
  }
  function commitRename() {
    if (!renaming) return;
    renaming = false;
    const next = nameDraft.trim().replace(/\s+/g, ' ');
    if (next && next !== tag.label) onRename(next);
  }
  function renameKey(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
    } else if (event.key === 'Escape') {
      // Échap annule la saisie, sans refermer le panneau (PanelShell ignore
      // un Échap venu d'un champ).
      event.preventDefault();
      renaming = false;
    }
  }
  function pickPastille(choice) {
    pastilleOpen = false;
    if (choice.color !== tag.color || choice.shape !== (tag.shape || 'circle')) onPastille(choice);
  }
  function moreAppearance() {
    pastilleOpen = false;
    onEdit();
  }

  $: folderSummary = folderCustom ? texts.folderCustomTitle : texts.folderDefaultTitle;
  $: folderDetail = folderCustom
    ? [customPath, customLibrary].filter(Boolean).join(' · ')
    : [defaultPath, rootLibrary].filter(Boolean).join(' · ');
  $: mailSummary = mailCustom ? texts.mailCustomTitle : texts.mailDefaultTitle;
  $: mailDetail = mailCustom
    ? recipients.length > 2
      ? `${recipients.slice(0, 2).join(', ')} ${texts.peopleMore.replace('{n}', String(recipients.length - 2))}`
      : recipients.join(', ')
    : texts.mailDefaultNow.replace('{who}', defaultRecipients);

  /** Pause de frappe après laquelle le texte s'enregistre. */
  const CONTEXT_PAUSE_MS = 1200;
  let draftFor = null;
  let draft = '';
  let pauseTimer = null;

  // Un autre tag s'affiche : son texte remplace le brouillon. Le texte du même
  // tag qui revient du serveur (normalisé) ne touche pas au brouillon : ce
  // qu'on tape en ce moment serait perdu.
  $: if (tag.id !== draftFor) {
    clearTimeout(pauseTimer);
    draftFor = tag.id;
    draft = tag.context || '';
  }

  function commitContext() {
    clearTimeout(pauseTimer);
    if (normalizeTagContext(draft) === normalizeTagContext(tag.context)) return;
    onContextSave(tag.id, draft);
  }

  function pauseThenCommit() {
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(commitContext, CONTEXT_PAUSE_MS);
  }

  onDestroy(() => clearTimeout(pauseTimer));

  $: contextCount = texts.contextCount
    .replace('{n}', String(draft.length))
    .replace('{max}', String(contextMax));

  function chooseFolderDefault() {
    if (folderCustom) onFolderDefault();
  }
  function chooseFolderCustom() {
    if (!folderCustom) onFolderPick();
  }
  function chooseMailDefault() {
    if (mailCustom) onMailDefault();
  }
  function chooseMailCustom() {
    if (!mailCustom) onMailPick();
  }
</script>

<article
  class="tgfi"
  aria-labelledby="tgfi-title"
  style="--tag-dot: {vars.dot}; --tag-soft: {vars.soft}; --tag-fill: {vars.fill}; --tag-shape: {clip}"
>
  <button type="button" class="tgfi-back" on:click={onBack}>
    <IconBack width="18" height="18" aria-hidden="true" />
    {texts.back}
  </button>

  <header class="tgfi-head">
    <!-- Le logo du tag s'il en a un — sur fond blanc, entier ; sinon sa
         pastille. Le halo blanc est sur le parent : un clip-path emporte
         l'ombre de l'élément qu'il découpe. -->
    {#if logo}
      <span class="tgfi-badge tgfi-badge-logo"><img src={logo} alt="" /></span>
    {:else}
      <span class="tgfi-badge" aria-hidden="true"><span class="tgfi-shape"></span></span>
    {/if}
    <div class="tgfi-title">
      {#if renaming}
        <input
          bind:this={nameInput}
          bind:value={nameDraft}
          class="tgfi-name-input"
          aria-label={texts.labelField}
          maxlength="32"
          autocomplete="off"
          on:keydown={renameKey}
          on:blur={commitRename}
        />
      {:else}
        <div class="tgfi-name">
          <h3 id="tgfi-title">{tag.label}</h3>
          <button
            type="button"
            class="tgfi-rename"
            aria-label={texts.rename}
            title={texts.rename}
            on:click={startRename}
          >
            <IconPen width="15" height="15" aria-hidden="true" />
          </button>
        </div>
      {/if}
      <div class="tgfi-meta">
        <div class="tgfi-pastille-wrap" on:click|stopPropagation role="none">
          <button
            type="button"
            class="tgfi-pastille"
            aria-haspopup="dialog"
            aria-expanded={pastilleOpen}
            aria-label={texts.pastille}
            title={texts.pastille}
            on:click={() => (pastilleOpen = !pastilleOpen)}
          >
            <TagChip {tag} />
            <IconCaret width="13" height="13" aria-hidden="true" />
          </button>
          {#if pastilleOpen}
            <TagPastillePopover
              color={tag.color}
              shape={tag.shape || 'circle'}
              colors={solidColors}
              shapes={shapeSlugs}
              {texts}
              onPick={pickPastille}
              onMore={moreAppearance}
            />
          {/if}
        </div>
        <span class="tgfi-count">{countText}</span>
      </div>
      {#if appearanceError}
        <div class="tgfi-error tgfi-error-head" role="alert">{appearanceError}</div>
      {/if}
    </div>
    <div class="tgfi-head-actions">
      <button
        type="button"
        class="tgfi-icon-btn tgfi-danger"
        on:click={onDelete}
        aria-label={texts.removeTag}
        title={texts.removeTag}
      >
        <IconTrash width="17" height="17" />
      </button>
    </div>
  </header>

  <!-- ── Ce que l'IA doit savoir : le contexte du tag ── -->
  <section class="tgfi-section" aria-labelledby="tgfi-ctx-q">
    <div class="tgfi-q">
      <span class="tgfi-q-icon" aria-hidden="true"><IconContext width="19" height="19" /></span>
      <div class="tgfi-q-text">
        <h4 id="tgfi-ctx-q">{texts.contextQuestion}</h4>
        <p>{texts.contextWhen.replace('{tag}', tag.label)}</p>
      </div>
    </div>

    <div class="tgfi-ctx">
      <textarea
        class="tgfi-ctx-field"
        aria-labelledby="tgfi-ctx-q"
        rows="7"
        maxlength={contextMax}
        placeholder={texts.contextPlaceholder}
        bind:value={draft}
        on:input={pauseThenCommit}
        on:blur={commitContext}
      ></textarea>
      <div class="tgfi-ctx-foot">
        {#if contextReaders.length}
          <div class="tgfi-ctx-readers">
            <span>{texts.contextReadBy}</span>
            {#each contextReaders as reader (reader)}
              <span class="tgfi-chip">{reader}</span>
            {/each}
          </div>
        {/if}
        <div class="tgfi-ctx-meta">
          <span class="tgfi-ctx-state" aria-live="polite">
            {#if contextState === 'saving'}
              {texts.contextSaving}
            {:else if contextState === 'saved'}
              <IconCheck width="14" height="14" aria-hidden="true" />{texts.contextSaved}
            {/if}
          </span>
          <span class="tgfi-ctx-count">{contextCount}</span>
        </div>
      </div>
      <p class="tgfi-ctx-guard">
        <IconInfo width="15" height="15" aria-hidden="true" />{texts.contextGuard}
      </p>
      {#if contextError}
        <div class="tgfi-error" role="alert">{contextError}</div>
      {/if}
    </div>
  </section>

  <!-- ── Le logo du client ou du projet ── -->
  <section class="tgfi-section" aria-labelledby="tgfi-logo-q">
    <div class="tgfi-q">
      <span class="tgfi-q-icon" aria-hidden="true"><IconLogo width="19" height="19" /></span>
      <div class="tgfi-q-text">
        <h4 id="tgfi-logo-q">{texts.logoQuestion}</h4>
        <p>{texts.logoWhen}</p>
      </div>
    </div>
    <div class="tgfi-logo">
      <TagLogoField
        {logo}
        hasLogo={!!tag.logoAt}
        alt={texts.logoAlt.replace('{tag}', tag.label)}
        busy={logoBusy}
        error={logoError}
        {texts}
        onFile={onLogoFile}
        onRemove={onLogoRemove}
      />
    </div>
  </section>

  <!-- ── Rangement : le lien tag → action « Entreposer » ── -->
  <div class="tgfi-rules">
    <TagRule
      icon={IconFolder}
      headingId="tgfi-folder-q"
      question={texts.folderQuestion}
      when={texts.folderWhen.replace('{tag}', tag.label)}
      summary={folderSummary}
      detail={folderDetail}
      open={folderOpen}
      editLabel={texts.ruleEdit}
      closeLabel={texts.ruleClose}
      onToggle={() => (folderOpen = !folderOpen)}
    >
      <div class="tgfi-options" role="radiogroup" aria-labelledby="tgfi-folder-q">
        <div class="tgfi-option" class:tgfi-option-on={!folderCustom}>
          <button
            type="button"
            class="tgfi-pick"
            role="radio"
            aria-checked={!folderCustom}
            disabled={!storageEditable || storageBusy}
            on:click={chooseFolderDefault}
          >
            <span class="tgfi-radio" aria-hidden="true"></span>
            <span class="tgfi-pick-text">
              <span class="tgfi-option-title">{texts.folderDefaultTitle}</span>
              <span class="tgfi-option-hint">
                {subfolders ? texts.folderDefaultAuto : texts.folderDefaultRoot}
              </span>
            </span>
          </button>
          <div class="tgfi-option-extra">
            <span class="tgfi-path">
              <span class="tgfi-path-icon" aria-hidden="true">
                {#if rootKind}
                  <StorageLogo kind={rootKind} size={17} />
                {:else}
                  <IconFolder width="17" height="17" />
                {/if}
              </span>
              <span class="tgfi-path-text">
                <strong>{defaultPath}</strong>
                {#if rootLibrary}<em>{rootLibrary}</em>{/if}
              </span>
            </span>
          </div>
        </div>

        <div class="tgfi-option" class:tgfi-option-on={folderCustom}>
          <button
            type="button"
            class="tgfi-pick"
            role="radio"
            aria-checked={folderCustom}
            disabled={!storageEditable || storageBusy}
            on:click={chooseFolderCustom}
          >
            <span class="tgfi-radio" aria-hidden="true"></span>
            <span class="tgfi-pick-text">
              <span class="tgfi-option-title">{texts.folderCustomTitle}</span>
              {#if !folderCustom}
                <span class="tgfi-option-hint">{texts.folderNone}</span>
              {/if}
            </span>
          </button>
          <div class="tgfi-option-extra">
            {#if folderCustom}
              <!-- Un chemin vide avec une bibliothèque = sa RACINE. L'afficher comme
                 « pas de destination » a déjà fait croire à un dépôt dans Mon
                 Drive alors qu'un Drive partagé était choisi. -->
              <span class="tgfi-path tgfi-path-custom">
                <span class="tgfi-path-icon" aria-hidden="true">
                  {#if customKind}
                    <StorageLogo kind={customKind} size={17} />
                  {:else}
                    <IconFolder width="17" height="17" />
                  {/if}
                </span>
                <span class="tgfi-path-text">
                  <strong>{customPath}</strong>
                  {#if customLibrary}<em>{customLibrary}</em>{/if}
                </span>
              </span>
            {/if}
            <button
              type="button"
              class="tgfi-btn tgfi-btn-sm"
              disabled={!storageEditable || storageBusy}
              on:click={onFolderPick}
            >
              {storageBusy ? '…' : folderCustom ? texts.folderChange : texts.folderChoose}
            </button>
          </div>
        </div>
      </div>

      {#if storageNote}
        <div class="tgfi-note">
          <IconInfo width="15" height="15" aria-hidden="true" />{storageNote}
        </div>
      {/if}
      <svelte:fragment slot="after">
        {#if storageError}
          <div class="tgfi-error" role="alert">{storageError}</div>
        {/if}
      </svelte:fragment>
    </TagRule>

    <!-- ── Envoi : le lien tag → action « Envoyer par mail » ── -->
    <TagRule
      icon={IconMail}
      headingId="tgfi-mail-q"
      question={texts.mailQuestion}
      when={texts.mailWhen.replace('{tag}', tag.label)}
      summary={mailSummary}
      detail={mailDetail}
      open={mailOpen}
      editLabel={texts.ruleEdit}
      closeLabel={texts.ruleClose}
      onToggle={() => (mailOpen = !mailOpen)}
    >
      <div class="tgfi-options" role="radiogroup" aria-labelledby="tgfi-mail-q">
        <div class="tgfi-option" class:tgfi-option-on={!mailCustom}>
          <button
            type="button"
            class="tgfi-pick"
            role="radio"
            aria-checked={!mailCustom}
            disabled={!mailEditable || mailBusy}
            on:click={chooseMailDefault}
          >
            <span class="tgfi-radio" aria-hidden="true"></span>
            <span class="tgfi-pick-text">
              <span class="tgfi-option-title">{texts.mailDefaultTitle}</span>
              <span class="tgfi-option-hint">
                {texts.mailDefaultNow.replace('{who}', defaultRecipients)}
              </span>
            </span>
          </button>
        </div>

        <div class="tgfi-option" class:tgfi-option-on={mailCustom}>
          <button
            type="button"
            class="tgfi-pick"
            role="radio"
            aria-checked={mailCustom}
            disabled={!mailEditable || mailBusy}
            on:click={chooseMailCustom}
          >
            <span class="tgfi-radio" aria-hidden="true"></span>
            <span class="tgfi-pick-text">
              <span class="tgfi-option-title">{texts.mailCustomTitle}</span>
              <span class="tgfi-option-hint">
                {mailCustom ? texts.mailCustomHint : texts.mailNone}
              </span>
            </span>
          </button>
          <div class="tgfi-option-extra">
            {#if mailCustom}
              <ul class="tgfi-people">
                {#each recipients as address (address)}
                  <li class="tgfi-person">
                    <span class="tgfi-avatar" aria-hidden="true"
                      >{address.charAt(0).toUpperCase()}</span
                    >
                    <span class="tgfi-person-mail">{address}</span>
                  </li>
                {/each}
              </ul>
            {/if}
            <button
              type="button"
              class="tgfi-btn tgfi-btn-sm"
              disabled={!mailEditable || mailBusy}
              on:click={onMailPick}
            >
              {mailBusy ? '…' : mailCustom ? texts.mailEdit : texts.mailChoose}
            </button>
          </div>
        </div>
      </div>

      {#if mailNote}
        <div class="tgfi-note">
          <IconInfo width="15" height="15" aria-hidden="true" />{mailNote}
        </div>
      {/if}
      <svelte:fragment slot="after">
        {#if mailError}
          <div class="tgfi-error" role="alert">{mailError}</div>
        {/if}
      </svelte:fragment>
    </TagRule>
  </div>

  <footer class="tgfi-foot">
    <IconCheck width="15" height="15" aria-hidden="true" />
    {texts.savedHint}
  </footer>
</article>

<style>
  .tgfi {
    display: flex;
    flex-direction: column;
  }

  /* Retour à la liste : téléphone seulement (la liste et la fiche y sont deux
     écrans). Règle de base AVANT la media query qui l'affiche. */
  .tgfi-back {
    display: none;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    margin: 12px 0 0 12px;
    padding: 8px 12px 8px 6px;
    border: none;
    border-radius: 11px;
    background: none;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    color: var(--ink-soft);
    cursor: pointer;
  }

  .tgfi-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 20px;
    padding: 26px 28px;
    border-bottom: 1px solid var(--line);
    background: color-mix(in oklch, var(--tag-dot) 5%, var(--surface));
  }
  .tgfi-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 62px;
    height: 62px;
    border-radius: 50%;
    background: var(--tag-soft);
    box-shadow: inset 0 0 0 4px var(--surface);
    flex-shrink: 0;
  }
  .tgfi-shape {
    width: 26px;
    height: 26px;
    background: var(--tag-fill);
    clip-path: var(--tag-shape);
  }
  .tgfi-title {
    flex: 1 1 220px;
    min-width: 0;
  }
  .tgfi-title h3 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.015em;
    line-height: 1.25;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .tgfi-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    margin-top: 8px;
    font-size: 12.5px;
    color: var(--ink-muted);
  }
  /* À droite, même quand l'en-tête passe à la ligne (téléphone). */
  .tgfi-head-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .tgfi-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 26px 28px 4px;
  }
  .tgfi-section + .tgfi-section {
    margin-top: 18px;
    border-top: 1px solid var(--line);
  }
  .tgfi-q {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .tgfi-q-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--surface-tint);
    color: var(--ink-soft);
    flex-shrink: 0;
  }
  .tgfi-q-text {
    min-width: 0;
  }
  .tgfi-q-text h4 {
    margin: 0;
    font-size: 15.5px;
    font-weight: 600;
    color: var(--ink);
  }
  .tgfi-q-text p {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink-muted);
  }

  /* ── Les deux réponses ── l'une sous l'autre, comme une liste de choix :
     côte à côte, un chemin de dossier ou une adresse s'y coupaient en deux,
     et la réponse courte s'étirait à la hauteur de la longue. Indentées sous
     la question (largeur de son icône + écart). */
  .tgfi-options {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    max-width: 640px;
    padding-left: 54px;
  }
  .tgfi-option {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    padding: 14px 16px 16px;
    border: 1.5px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    transition:
      border-color 0.15s,
      background 0.15s,
      box-shadow 0.15s;
  }
  /* La réponse retenue prend la couleur de SON tag, pas l'orange de marque :
     c'est ce qui fait reconnaître le même tag dans la liste, ici, et sur la
     page « Entreposer ». */
  .tgfi-option-on {
    border-color: var(--tag-dot);
    background: color-mix(in oklch, var(--tag-dot) 5%, var(--surface));
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--tag-dot) 12%, transparent);
  }
  .tgfi-pick {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }
  .tgfi-pick:disabled {
    cursor: default;
  }
  .tgfi-pick:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 4px;
    border-radius: 6px;
  }
  .tgfi-radio {
    position: relative;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    border-radius: 50%;
    border: 2px solid var(--line-faint);
    background: var(--surface);
    box-sizing: border-box;
    flex-shrink: 0;
  }
  .tgfi-option-on .tgfi-radio {
    border-color: var(--tag-dot);
  }
  .tgfi-option-on .tgfi-radio::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: var(--tag-dot);
  }
  .tgfi-pick-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .tgfi-option-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
  }
  .tgfi-option-hint {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  .tgfi-pick:disabled .tgfi-option-title {
    color: var(--ink-muted);
  }
  .tgfi-option-extra {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding-left: 30px;
    min-width: 0;
  }
  .tgfi-option-extra:empty {
    display: none;
  }

  .tgfi-path {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    max-width: 100%;
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    box-sizing: border-box;
  }
  .tgfi-path-icon {
    display: inline-flex;
    margin-top: 1px;
    color: var(--ink-faint);
    flex-shrink: 0;
  }
  .tgfi-path-custom .tgfi-path-icon {
    color: var(--tag-dot);
  }
  .tgfi-path-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    word-break: break-word;
  }
  .tgfi-path-text strong {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
  }
  .tgfi-path-text em {
    font-style: normal;
    font-size: 11.5px;
    color: var(--ink-muted);
  }

  .tgfi-people {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-width: 100%;
  }
  .tgfi-person {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    min-width: 0;
    padding: 3px 10px 3px 3px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
  }
  .tgfi-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--tag-soft);
    font-size: 11px;
    font-weight: 600;
    color: var(--ink);
    flex-shrink: 0;
  }
  .tgfi-person-mail {
    font-size: 12.5px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tgfi-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-left: 54px;
    padding: 9px 12px;
    border: 1px dashed var(--line-strong);
    border-radius: 10px;
    background: var(--surface-tint);
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-muted);
  }
  .tgfi-note :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--brand-text);
  }
  .tgfi-error {
    margin-left: 54px;
    padding: 9px 12px;
    border-radius: 9px;
    font-size: 12.5px;
    color: var(--danger-text);
    background: var(--danger-bg);
    border: 1px solid var(--danger-line);
  }

  /* ── En-tête : logo, nom sur place, pastille ── */
  .tgfi-badge-logo {
    border-radius: 18px;
    background: var(--surface);
    box-shadow:
      0 0 0 1px var(--line),
      0 10px 24px -16px color-mix(in srgb, var(--ink) 50%, transparent);
    padding: 8px;
    box-sizing: border-box;
  }
  .tgfi-badge-logo img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .tgfi-name {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .tgfi-rename {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .tgfi-rename:hover {
    background: var(--surface);
    color: var(--ink-soft);
  }
  .tgfi-name-input {
    width: 100%;
    max-width: 420px;
    box-sizing: border-box;
    margin-left: -9px;
    padding: 2px 8px;
    border: 1.5px solid var(--tag-dot);
    border-radius: 10px;
    background: var(--surface);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--tag-dot) 14%, transparent);
    font-family: inherit;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--ink);
    outline: none;
  }
  .tgfi-pastille-wrap {
    position: relative;
  }
  .tgfi-pastille {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 8px 0 4px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-muted);
    cursor: pointer;
  }
  .tgfi-pastille:hover {
    border-color: var(--line-faint);
  }
  .tgfi-rename:focus-visible,
  .tgfi-pastille:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .tgfi-error-head {
    margin: 10px 0 0;
  }
  .tgfi-logo {
    margin-left: 54px;
  }
  .tgfi-rules {
    margin-top: 18px;
    border-top: 1px solid var(--line);
  }

  /* ── Contexte ── indenté sous sa question, comme les réponses des deux
     autres. Le focus prend la couleur du tag, comme la réponse retenue. */
  .tgfi-ctx {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 640px;
    margin-left: 54px;
  }
  /* Le champ grandit avec le texte (`field-sizing`, Chromium) jusqu'à 420 px,
     puis défile : un contexte de 1 500 caractères se relit d'un coup d'œil.
     Ailleurs, la hauteur de départ et la poignée de redimensionnement. */
  .tgfi-ctx-field {
    width: 100%;
    min-height: 170px;
    max-height: 420px;
    field-sizing: content;
    box-sizing: border-box;
    padding: 14px 16px;
    border: 1.5px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    font-family: inherit;
    font-size: 14px;
    line-height: 1.6;
    color: var(--ink);
    resize: vertical;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .tgfi-ctx-field::placeholder {
    color: var(--ink-faint);
  }
  .tgfi-ctx-field:focus {
    outline: none;
    border-color: var(--tag-dot);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--tag-dot) 14%, transparent);
  }
  .tgfi-ctx-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .tgfi-ctx-readers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .tgfi-chip {
    display: inline-flex;
    align-items: center;
    height: 26px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface-tint);
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .tgfi-ctx-meta {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }
  .tgfi-ctx-state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--success-text);
  }
  .tgfi-ctx-count {
    font-variant-numeric: tabular-nums;
  }
  .tgfi-ctx-guard {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-tint);
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-soft);
  }
  .tgfi-ctx-guard :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--brand-text);
  }
  .tgfi-ctx .tgfi-error {
    margin-left: 0;
  }

  .tgfi-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 22px;
    padding: 16px 28px 22px;
    font-size: 12.5px;
    color: var(--ink-muted);
  }
  .tgfi-foot :global(svg) {
    color: var(--success-text);
  }

  .tgfi-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 16px;
    border: 1px solid var(--line-strong);
    border-radius: 11px;
    background: var(--surface);
    font-family: inherit;
    font-size: 13.5px;
    font-weight: 500;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .tgfi-btn:hover:not(:disabled) {
    border-color: var(--brand);
    color: var(--brand-text);
  }
  .tgfi-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .tgfi-btn-sm {
    height: 34px;
    padding: 0 14px;
    font-size: 12.5px;
  }
  .tgfi-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--line-strong);
    border-radius: 11px;
    background: var(--surface);
    color: var(--ink-muted);
    cursor: pointer;
  }
  .tgfi-danger:hover {
    color: var(--danger-strong);
    background: var(--danger-bg);
    border-color: var(--danger-line);
  }

  @media (max-width: 760px) {
    .tgfi-back {
      display: inline-flex;
    }
    .tgfi-head {
      padding: 16px 18px 20px;
    }
    .tgfi-section {
      padding: 22px 18px 4px;
    }
    /* Sur un téléphone, l'indentation sous la question mange la largeur des
       réponses : elles reprennent toute la ligne. */
    .tgfi-options,
    .tgfi-ctx,
    .tgfi-logo,
    .tgfi-note,
    .tgfi-error {
      padding-left: 0;
      margin-left: 0;
    }
    .tgfi-foot {
      padding: 14px 18px 20px;
    }
  }
  @media (pointer: coarse) {
    .tgfi-btn-sm {
      height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tgfi-option {
      transition: none;
    }
  }
</style>
