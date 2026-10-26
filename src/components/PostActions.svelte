<script>
  /**
   * Actions post-réunion du document affiché — le bouton « Partager » de la
   * barre des documents (DocumentBar), et son mini-menu.
   *
   * Un seul bouton, sur ordinateur comme sur téléphone, qui ouvre un menu
   * ancré sous lui (même carte que le sélecteur de tag voisin). Chaque entrée
   * porte son nom et dit OÙ partira le document — le tag de la réunion, ou vos
   * réglages : envoyer par mail, entreposer, télécharger. Trois icônes muettes
   * faisaient le même travail sur ordinateur ; nommées seulement au survol,
   * elles envoyaient un mail d'un clic sans dire à qui.
   *
   * Le menu a une entrée de plus sur téléphone : « Rédiger dans ma
   * messagerie » ouvre un mail prêt à relire dans l'application du téléphone
   * (lien `mailto:`, cf. utils/mailDraft.js), destinataires et objet comme
   * l'envoi automatique. Elle obéit à l'interrupteur « Envoyer par mail » de
   * l'administration : fermer l'envoi par mail d'un document ferme les deux
   * façons de l'envoyer. Sur ordinateur elle reste masquée (CSS) : un
   * `mailto:` de 20 000 caractères y dépasse ce que Windows transmet.
   *
   * Extrait d'App.svelte (plafonné par `max-lines`) : App garde les traitements
   * serveur (mail, dépôt, PDF). `busy` nomme l'action en cours — un envoi à la
   * fois, verrou tenu par App : le menu se referme dès le choix, le bouton
   * montre l'attente, puis un toast dit le résultat. Refermer AVANT laisse la
   * fenêtre d'approbation d'un dépôt s'afficher sans rien au-dessus.
   */
  import { tick } from 'svelte';
  import { uiText, currentLanguageStore } from '../store.js';
  import { auth } from '../stores/auth.js';
  import { tagsById } from '../stores/tags.js';
  import { actionSettings, ensureActionSettings } from '../stores/actionSettings.js';
  import { showToast } from '../stores/toasts.js';
  import { storageLabel } from '../utils/storageVocabulary.js';
  import { DOCUMENT_TYPE_LABEL, fileDatePart } from '../utils/filename.js';
  import {
    htmlToText,
    draftRecipients,
    draftSubject,
    storageFollowsTag,
    buildMailto,
  } from '../utils/mailDraft.js';
  import IconMail from '~icons/solar/letter-linear';
  import IconCloudUp from '~icons/solar/cloud-upload-linear';
  import IconDownload from '~icons/solar/download-minimalistic-linear';
  import IconPen from '~icons/solar/pen-new-square-linear';
  import IconShare from '~icons/solar/share-linear';

  /** @type {'summary'|'transcription'} document affiché */
  export let kind = 'summary';
  /** Le document existe (résumé généré, transcription non vide). */
  export let available = false;
  /** Le document tel qu'affiché : HTML de l'éditeur (résumé) ou texte (transcription). */
  export let content = '';
  /** La réunion dans l'historique : son titre (objet du mail) et son tag. */
  export let meeting = null;
  /** Interrupteurs de l'administration pour ce document : {email, storage, download}. */
  export let toggles = {};
  /** Un moyen d'envoi existe (relais du serveur ou compte relié). */
  export let emailReady = false;
  /** Fournisseur du compte relié (`google`, `microsoft`) ; vide = pas de dépôt. */
  export let storageProvider = '';
  /** @type {null|'email'|'storage'|'download'} action en cours */
  export let busy = null;
  /** Génération d'un résumé en cours : rien ne part d'un document qui change. */
  export let locked = false;
  export let onEmail = () => {};
  export let onStore = () => {};
  export let onDownload = () => {};
  /** Ouverture du brouillon — `mailto:` intercepté par la WebView native. */
  export let openUrl = (url) => window.location.assign(url);

  let menuOpen = false;
  let btnEl;
  let menuEl;
  // Position fixe, ancrée sur le bouton : en absolu, le menu serait rogné par
  // l'overflow du panneau (même raison que TagSelect).
  let menuX = 0;
  let menuY = 0;

  $: T = $uiText.postActions;
  $: summary = kind === 'summary';
  $: provider = storageLabel(storageProvider);
  $: tagId = meeting?.tagId || null;
  $: tagName = (tagId && $tagsById.get(tagId)?.label) || '';
  // Réglages chargés à l'ouverture du menu : sans eux, pas de sous-titre, et
  // le brouillon part sans destinataires — jamais avec de faux.
  $: settings = $actionSettings.loaded ? $actionSettings.settings : null;
  $: mail = draftRecipients(settings, tagId);
  $: count = mail.recipients.length;
  $: mailViaTag = !!tagName && mail.source === 'tag';
  $: storeViaTag = !!tagName && storageFollowsTag(settings, tagId);
  // État dérivé DÉCLARÉ, pas calculé dans l'expression des entrées : Svelte ne
  // suit que les noms qu'il voit (piège noté dans CLAUDE.md).
  $: countText = count === 1 ? T.recipientOne : T.recipientsMany.replace('{count}', String(count));
  $: emailHint = mailViaTag
    ? `${tagName} · ${countText}`
    : !settings
      ? ''
      : count
        ? `${T.emailUserHint} · ${countText}`
        : T.emailSelfHint;

  $: items = available
    ? [
        toggles?.email &&
          emailReady && {
            id: 'email',
            icon: IconMail,
            label: mailViaTag ? T.emailTag : T.email,
            hint: emailHint,
            busyLabel: T.busyEmail,
            run: onEmail,
          },
        toggles?.storage &&
          storageProvider && {
            id: 'storage',
            icon: IconCloudUp,
            label: storeViaTag ? T.storageTag : T.storage.replace('{provider}', provider),
            hint: storeViaTag ? `${tagName} · ${provider}` : settings ? T.storageUserHint : '',
            busyLabel: T.busyStorage,
            run: onStore,
          },
        // Téléphone seulement (masquée en CSS sur ordinateur).
        toggles?.email && {
          id: 'compose',
          icon: IconPen,
          mobileOnly: true,
          label: T.compose,
          hint: count ? T.composeHintPrefilled : T.composeHint,
          run: compose,
        },
        toggles?.download && {
          id: 'download',
          icon: IconDownload,
          label: summary ? T.downloadSummary : T.downloadTranscription,
          busyLabel: T.busyDownload,
          run: onDownload,
        },
      ].filter(Boolean)
    : [];
  $: disabled = locked || !!busy;
  $: busyItem = items.find((item) => item.id === busy) || null;
  // Plus rien à partager (onglet changé, génération relancée) : le menu part.
  $: if (menuOpen && (!items.length || disabled)) menuOpen = false;

  function run(item) {
    menuOpen = false;
    item.run(kind);
  }

  async function toggleMenu() {
    if (menuOpen) return void (menuOpen = false);
    menuOpen = true;
    ensureActionSettings();
    const r = btnEl.getBoundingClientRect();
    menuX = r.left;
    menuY = r.bottom + 6;
    // Recalé sur la taille RÉELLE du menu, avant la peinture : aligné sur le
    // bord droit du bouton, et toujours dans la fenêtre.
    await tick();
    const m = menuEl?.getBoundingClientRect();
    if (!m) return;
    menuX = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8));
    menuY = Math.max(8, Math.min(menuY, window.innerHeight - m.height - 8));
  }

  /** Le brouillon : objet comme l'envoi automatique, document dans le corps. */
  async function compose() {
    const state = await ensureActionSettings();
    const title = (meeting?.title || '').trim();
    const builtin = summary
      ? title
        ? T.subjectSummary.replace('{title}', title)
        : T.subjectSummaryUntitled
      : title
        ? T.subjectTranscription.replace('{title}', title)
        : T.subjectTranscriptionUntitled;
    // Mêmes variables que l'envoi (templateVars, resolve.js) : date du jour.
    const lang = $currentLanguageStore === 'en' ? 'en' : 'fr';
    const vars = {
      titre: title,
      date: fileDatePart(),
      type: DOCUMENT_TYPE_LABEL[lang][kind],
      compte: $auth.user?.email || '',
    };
    const { url, truncated } = buildMailto({
      to: draftRecipients(state.settings, tagId).recipients,
      subject: draftSubject(state, vars, builtin),
      body: summary ? htmlToText(content) : String(content || '').trim(),
      truncatedNote: T.bodyTruncated,
    });
    if (truncated) showToast(T.composeTruncated, 'warning', 8000);
    openUrl(url);
  }

  function onKeydown(event) {
    if (menuOpen && event.key === 'Escape') {
      event.preventDefault();
      menuOpen = false;
    }
  }
</script>

<svelte:window on:click={() => (menuOpen = false)} on:keydown={onKeydown} />

{#if items.length}
  <!-- « Partager » et son mini-menu. Le clic dans le menu ne remonte pas
       jusqu'à `window`, qui le referme. -->
  <span class="pa" on:click|stopPropagation role="none">
    <button
      type="button"
      class="pa-share"
      bind:this={btnEl}
      on:click={toggleMenu}
      {disabled}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-busy={!!busy}
    >
      {#if busyItem}
        <span class="pa-spinner" aria-hidden="true"></span>
        <span>{busyItem.busyLabel}</span>
      {:else}
        <IconShare width="16" height="16" aria-hidden="true" />
        <span>{T.share}</span>
      {/if}
    </button>

    {#if menuOpen}
      <div
        class="pa-menu"
        bind:this={menuEl}
        role="menu"
        aria-label={summary ? T.titleSummary : T.titleTranscription}
        style="left: {menuX}px; top: {menuY}px"
      >
        <div class="pa-menu-title" aria-hidden="true">
          {summary ? T.titleSummary : T.titleTranscription}
        </div>
        {#each items as item (item.id)}
          <button
            type="button"
            class="pa-item"
            class:pa-item-mobile={item.mobileOnly}
            role="menuitem"
            on:click={() => run(item)}
          >
            <span class="pa-item-icon" aria-hidden="true">
              <svelte:component this={item.icon} width="18" height="18" />
            </span>
            <span class="pa-item-text">
              <span class="pa-item-label">{item.label}</span>
              {#if item.hint}<span class="pa-item-hint">{item.hint}</span>{/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </span>
{/if}

<style>
  .pa {
    position: relative;
    display: inline-flex;
    min-width: 0;
    max-width: 100%;
  }

  /* Même gabarit que le bouton de résumé voisin (DocumentBar), en creux :
     blanc, bordure, encre — c'est le geste second de la barre. */
  .pa-share {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    max-width: 100%;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    background: var(--surface);
    color: var(--ink);
    font-family: 'Lexend', sans-serif;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.15s;
  }

  .pa-share > span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pa-share:hover:not(:disabled),
  .pa-share[aria-expanded='true'] {
    background: var(--surface-tint);
    border-color: var(--line-faint);
  }

  .pa-share:active:not(:disabled) {
    transform: scale(0.97);
  }

  .pa-share:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .pa-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgb(var(--brand-rgb) / 0.25);
    border-top-color: var(--mb-orange);
    border-radius: 50%;
    animation: pa-spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes pa-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Téléphone : cible de 44 px, et le bouton peut céder de la largeur (le
     libellé s'ellipse) plutôt que sortir de la barre. */
  @media (max-width: 768px) {
    .pa-share {
      min-height: 44px;
      padding: 0 12px;
    }
  }

  /* ── Mini-menu : même carte que celui du sélecteur de tag (TagSelect) ── */
  .pa-menu {
    position: fixed;
    z-index: 10001;
    width: min(300px, calc(100vw - 16px));
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    box-shadow: 0 8px 24px color-mix(in srgb, var(--ink) 14%, transparent);
    animation: pa-in 0.12s ease;
  }

  .pa-menu-title {
    padding: 6px 10px 4px;
    font-family: 'Lexend', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: var(--ink-muted);
  }

  .pa-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 6px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    font-family: 'Lexend', sans-serif;
    text-align: left;
    cursor: pointer;
  }

  .pa-item:hover,
  .pa-item:active {
    background: var(--surface-tint);
  }

  .pa-item-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 9px;
    background: var(--mb-orange-10, rgb(var(--brand-rgb) / 0.08));
    color: var(--mb-orange);
  }

  .pa-item-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .pa-item-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
  }

  .pa-item-hint {
    font-size: 12px;
    line-height: 1.35;
    color: var(--ink-muted);
  }

  @keyframes pa-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pa-menu {
      animation: none;
    }
  }

  /* « Rédiger dans ma messagerie » : téléphone seulement. En fin de feuille,
     APRÈS .pa-item : à spécificité égale, c'est la dernière règle qui gagne. */
  @media (min-width: 769px) {
    .pa-item-mobile {
      display: none;
    }
  }
</style>
