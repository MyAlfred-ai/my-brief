<script>
  /**
   * « Réglages communs » de « Mes tags » — ce que « avec les autres comptes
   * rendus » et « destinataires habituels » désignent sur la fiche d'un tag.
   *
   * Ces réglages vivaient dans deux bandeaux posés AU-DESSUS des tags (« Dépôt
   * par tag », « Destinataires par tag ») : ils expliquaient des notions avant
   * qu'on en ait besoin, et repoussaient les tags sous le pli. Ils ont
   * désormais leur entrée en bas de la liste, et leur propre fiche.
   *
   * Seul l'interrupteur « Un sous-dossier par tag » se règle ici : il ne vaut
   * que pour les tags. Le dossier principal et les destinataires habituels
   * servent aussi aux conversations SANS tag — ils se règlent sur leurs pages
   * (« Entreposer », « Envoi d'email »), vers lesquelles on renvoie : deux
   * endroits pour éditer la même valeur, c'est deux brouillons qui divergent.
   */
  import ToggleSwitch from '../ui/ToggleSwitch.svelte';
  import StorageLogo from '../icons/StorageLogo.svelte';
  import { libraryKind, storageLabel } from '../../utils/storageVocabulary.js';
  import IconBack from '~icons/solar/alt-arrow-left-linear';
  import IconTuning from '~icons/solar/tuning-2-linear';
  import IconFolder from '~icons/solar/folder-linear';
  import IconUser from '~icons/solar/user-circle-linear';
  import IconInfo from '~icons/solar/info-circle-linear';

  /** Libellés `uiText.tagsPanel`. */
  export let texts;
  /** Libellés `uiText.configActions` (interrupteur des sous-dossiers). */
  export let actionTexts;
  export let rootFolder = '';
  export let rootDriveName = '';
  export let providerId = '';
  /** Interrupteur « Un sous-dossier par tag » — lié au parent, qui l'enregistre. */
  export let subfolders = false;
  export let subfoldersDisabled = false;
  export let defaultRecipients = '';
  export let storageNote = '';
  export let storageError = '';
  export let mailNote = '';
  export let onToggleSubfolders = () => {};
  export let onBack = () => {};
  /** Ouvre la page « Entreposer » de Ma configuration. */
  export let onOpenStorage = () => {};
  /** Ouvre la page « Envoi d'email » de Ma configuration. */
  export let onOpenMail = () => {};

  $: rootKind = libraryKind(providerId, rootDriveName);
  $: rootLibrary = rootDriveName || storageLabel(providerId, '');
</script>

<article class="tgc" aria-labelledby="tgc-title">
  <button type="button" class="tgc-back" on:click={onBack}>
    <IconBack width="18" height="18" aria-hidden="true" />
    {texts.back}
  </button>

  <header class="tgc-head">
    <span class="tgc-badge" aria-hidden="true"><IconTuning width="26" height="26" /></span>
    <div class="tgc-title">
      <h3 id="tgc-title">{texts.commonTitle}</h3>
      <p>{texts.commonIntro}</p>
    </div>
  </header>

  <div class="tgc-body">
    <section class="tgc-block" aria-labelledby="tgc-root">
      <h4 id="tgc-root">{texts.rootTitle}</h4>
      <div class="tgc-row">
        <span class="tgc-row-icon" aria-hidden="true">
          {#if rootKind}
            <StorageLogo kind={rootKind} size={20} />
          {:else}
            <IconFolder width="20" height="20" />
          {/if}
        </span>
        <span class="tgc-row-text">
          <strong>{rootFolder || texts.rootAdmin}</strong>
          {#if rootLibrary}<em>{rootLibrary}</em>{/if}
        </span>
        <button type="button" class="tgc-link" on:click={onOpenStorage}>{texts.rootEdit}</button>
      </div>

      <div class="tgc-row tgc-toggle">
        <span class="tgc-row-text">
          <strong>{actionTexts.tagSubfoldersLabel}</strong>
          <em>{actionTexts.tagSubfoldersHint}</em>
        </span>
        <ToggleSwitch
          bind:checked={subfolders}
          label={actionTexts.tagSubfoldersLabel}
          disabled={subfoldersDisabled}
          on:change={onToggleSubfolders}
        />
      </div>
      {#if storageNote}
        <div class="tgc-note">
          <IconInfo width="15" height="15" aria-hidden="true" />{storageNote}
        </div>
      {/if}
      {#if storageError}
        <div class="tgc-error" role="alert">{storageError}</div>
      {/if}
    </section>

    <section class="tgc-block" aria-labelledby="tgc-mail">
      <h4 id="tgc-mail">{texts.defaultRecipientsTitle}</h4>
      <div class="tgc-row">
        <span class="tgc-row-icon" aria-hidden="true"><IconUser width="20" height="20" /></span>
        <span class="tgc-row-text"><strong class="tgc-who">{defaultRecipients}</strong></span>
        <button type="button" class="tgc-link" on:click={onOpenMail}>
          {texts.defaultRecipientsEdit}
        </button>
      </div>
      {#if mailNote}
        <div class="tgc-note"><IconInfo width="15" height="15" aria-hidden="true" />{mailNote}</div>
      {/if}
    </section>
  </div>
</article>

<style>
  .tgc {
    display: flex;
    flex-direction: column;
  }
  /* Téléphone seulement — règle de base AVANT la media query qui l'affiche. */
  .tgc-back {
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
  .tgc-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 20px;
    padding: 26px 28px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-tint);
  }
  .tgc-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 62px;
    height: 62px;
    border-radius: 50%;
    background: var(--brand-secondary-soft-12);
    box-shadow: inset 0 0 0 4px var(--surface);
    color: var(--ink-soft);
    flex-shrink: 0;
  }
  .tgc-title {
    flex: 1 1 260px;
    min-width: 0;
  }
  .tgc-title h3 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--ink);
  }
  .tgc-title p {
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink-muted);
  }
  .tgc-body {
    display: flex;
    flex-direction: column;
    gap: 26px;
    padding: 26px 28px 28px;
  }
  .tgc-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tgc-block h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .tgc-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface-tint);
  }
  .tgc-toggle {
    flex-wrap: nowrap;
    background: var(--surface);
  }
  .tgc-row-icon {
    display: inline-flex;
    color: var(--ink-soft);
    flex-shrink: 0;
  }
  .tgc-row-text {
    flex: 1 1 200px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    word-break: break-word;
  }
  .tgc-row-text strong {
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
  }
  .tgc-who::first-letter {
    text-transform: uppercase;
  }
  .tgc-row-text em {
    font-style: normal;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  .tgc-link {
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: var(--brand-text);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .tgc-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 9px 12px;
    border: 1px dashed var(--line-strong);
    border-radius: 10px;
    background: var(--surface);
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--ink-muted);
  }
  .tgc-note :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--brand-text);
  }
  .tgc-error {
    padding: 9px 12px;
    border-radius: 9px;
    font-size: 12.5px;
    color: var(--danger-text);
    background: var(--danger-bg);
    border: 1px solid var(--danger-line);
  }
  @media (max-width: 760px) {
    .tgc-back {
      display: inline-flex;
    }
    .tgc-head {
      padding: 16px 18px 20px;
    }
    .tgc-body {
      padding: 22px 18px 24px;
    }
  }
</style>
