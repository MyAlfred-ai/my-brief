<script>
  // Surcouches de l'onglet Résumé : voile de génération (spinner), badge du
  // template utilisé, et infographie de la réunion (miniature flottante,
  // animation pendant la génération, visionneuse plein écran).
  //
  // L'infographie vit ICI et non dans App.svelte (plafonné par `max-lines`) :
  // App ne fournit que `meetingId`, toute la mécanique d'état est dans
  // stores/infographic.js — ce composant s'abonne et dessine.
  import { uiText, currentLanguageStore } from '../store.js';
  import { formatPages, roundToStep } from '../lib/pageMeter.js';
  import { portal } from '../utils/portal.js';
  import { canGenerateInfographic } from '../stores/auth.js';
  import { historyItems } from '../stores/history.js';
  import {
    infographicView,
    syncInfographic,
    regenerateInfographic,
    deleteInfographic,
  } from '../stores/infographic.js';
  import { showToast } from '../stores/toasts.js';
  import { interceptAnchorDownload } from '../platform/download.js';
  import IconDownload from '~icons/solar/download-minimalistic-linear';
  import IconGallery from '~icons/solar/gallery-linear';
  import IconWarn from '~icons/solar/danger-triangle-linear';
  import IconClose from '~icons/solar/close-circle-linear';
  import IconRefresh from '~icons/solar/refresh-linear';
  import IconTrash from '~icons/solar/trash-bin-trash-linear';

  export let isGenerating = false;
  export let loadingLabel = '';
  export let showTag = false;
  export let tagIcon = '';
  export let tagLabel = '';
  /**
   * Version générée avec le Pagimètre ({pages, measuredPages}), ou null : le
   * badge rappelle alors la longueur du résumé, telle que le serveur l'a
   * mesurée — ramenée au pas du curseur, sans fausse précision.
   */
  export let tagLength = null;
  /** Réunion affichée (live ou archive) — pilote l'état d'infographie. */
  export let meetingId = null;

  let lightboxOpen = false;

  const DOWNLOAD_NAME = 'mybrief-infographie.png';

  /**
   * Téléporte la visionneuse dans <body> : rendue ici, elle vit dans la zone
   * de scroll de l'onglet Résumé, dont un ancêtre (transform/filter) capture
   * le `position: fixed` — le voile ne couvrait que la colonne centrale,
   * constaté en recette. Un dialogue plein écran doit sortir de cette pile.
   */

  // Réactif sur la réunion affichée ET sur l'historique : c'est le
  // rechargement d'historique qui apporte le passage à `pending` après une
  // génération cochée (le drapeau est posé côté serveur avant la réponse).
  $: syncInfographic(meetingId, $historyItems);
  $: T = $uiText.infographic;
  $: lengthPages = tagLength ? roundToStep(tagLength.measuredPages ?? tagLength.pages) : null;
  $: lengthLabel = lengthPages ? formatPages(lengthPages, $currentLanguageStore) : '';
  $: lengthTitle = tagLength
    ? $uiText.pageMeter.tagTitle
        .replace('{requested}', formatPages(tagLength.pages, $currentLanguageStore))
        .replace('{measured}', lengthLabel)
    : '';
  $: info = $infographicView;
  $: showInfographic =
    !isGenerating &&
    info.meetingId !== null &&
    String(info.meetingId) === String(meetingId ?? '') &&
    info.status !== 'none';
  // Invite « Créer une infographie » : à l'emplacement de la miniature, quand
  // la réunion affichée a un COMPTE RENDU mais pas d'image. Le résumé se lit
  // dans l'historique (documents entiers) — pas de prop de plus à App,
  // plafonné. Masquée si l'administration a coupé la fonctionnalité, ou si
  // aucun groupe du compte n'en donne le droit : un bouton qui échouerait au
  // clic est pire qu'absent. Même règle pour « Régénérer » ; télécharger et
  // supprimer une image existante restent permis.
  $: currentItem = Array.isArray($historyItems)
    ? $historyItems.find((it) => String(it?.meetingId ?? '') === String(meetingId ?? ''))
    : null;
  $: showInvite =
    !isGenerating &&
    !showInfographic &&
    !!meetingId &&
    $canGenerateInfographic &&
    !!(currentItem?.versions?.length || String(currentItem?.resume || '').trim());
  // La visionneuse ne survit ni à un changement de réunion ni à une régénération.
  $: if (info.status !== 'ready' && lightboxOpen) lightboxOpen = false;

  function onKeydown(event) {
    if (lightboxOpen && event.key === 'Escape') lightboxOpen = false;
  }

  function onBackdropClick(event) {
    if (event.target === event.currentTarget) lightboxOpen = false;
  }

  /** Une action à la fois : régénérer pendant une suppression n'a pas de sens. */
  let actionBusy = false;

  async function onRegenerate() {
    if (actionBusy) return;
    actionBusy = true;
    // Langue choisie AU CLIC : régénérer sous l'interface anglaise rend une image anglaise.
    const res = await regenerateInfographic(meetingId, $currentLanguageStore);
    actionBusy = false;
    if (!res.ok) {
      const message =
        res.error === 'infographic_disabled'
          ? T.disabledError
          : res.error === 'infographic_not_allowed'
            ? T.notAllowedError
            : T.actionFailed;
      showToast(message, 'error', 6000);
    }
  }

  async function onDelete() {
    if (actionBusy || !confirm(T.removeConfirm)) return;
    actionBusy = true;
    const res = await deleteInfographic(meetingId);
    actionBusy = false;
    if (!res.ok) showToast(T.actionFailed, 'error', 6000);
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if isGenerating}
  <div class="resume-loading-state">
    <div class="resume-spinner-ring"></div>
    <span>{loadingLabel}</span>
  </div>
{/if}
{#if showTag}
  <div class="resume-template-tag" aria-label={$uiText.dockCard.templateUsed}>
    {#if tagIcon}<span class="resume-template-tag-icon" aria-hidden="true">{tagIcon}</span>{/if}
    <span class="resume-template-tag-label">{tagLabel}</span>
    {#if lengthLabel}
      <span class="resume-template-tag-length" title={lengthTitle}>· ≈ {lengthLabel}</span>
    {/if}
  </div>
{/if}

{#if showInfographic || showInvite}
  <!-- Ancre collante haut-droit : hauteur nulle (rien ne se décale), la carte
       reste visible au défilement — pendant du badge template, côté droit. -->
  <div class="igc-anchor">
    <div class="igc-slot">
      {#if showInvite}
        <!-- Résumé sans infographie : l'invite occupe l'empreinte exacte de la
             future miniature — le clic la remplace par l'animation, sans saut. -->
        <button
          type="button"
          class="igc-box igc-invite"
          on:click={onRegenerate}
          disabled={actionBusy}
          aria-label={T.createInvite}
          title={T.createInviteHint}
        >
          <IconGallery width="18" height="18" aria-hidden="true" />
          <span>{T.createInvite}</span>
        </button>
      {:else if info.status === 'ready'}
        <button
          type="button"
          class="igc-thumb"
          on:click={() => (lightboxOpen = true)}
          aria-label={T.openAria}
          title={T.openAria}
        >
          <img src={info.dataUrl} alt={T.thumbAlt} />
          <span class="igc-thumb-label" aria-hidden="true">{T.shortLabel}</span>
        </button>
        <!-- Téléphone : ces outils passent dans l'affichage en grand (CSS). -->
        <div class="igc-tools igc-tools-ready">
          <a
            class="igc-tool"
            href={info.dataUrl}
            download={DOWNLOAD_NAME}
            aria-label={T.download}
            title={T.download}
            on:click={(e) => interceptAnchorDownload(e, info.dataUrl, DOWNLOAD_NAME)}
          >
            <IconDownload width="14" height="14" aria-hidden="true" />
          </a>
          {#if $canGenerateInfographic}
            <button
              type="button"
              class="igc-tool"
              on:click={onRegenerate}
              disabled={actionBusy}
              aria-label={T.regenerate}
              title={T.regenerate}
            >
              <IconRefresh width="14" height="14" aria-hidden="true" />
            </button>
          {/if}
          <button
            type="button"
            class="igc-tool igc-tool-danger"
            on:click={onDelete}
            disabled={actionBusy}
            aria-label={T.remove}
            title={T.remove}
          >
            <IconTrash width="14" height="14" aria-hidden="true" />
          </button>
        </div>
      {:else if info.status === 'error'}
        <div class="igc-box igc-error" role="status" title={T.errorHint}>
          <IconWarn width="18" height="18" aria-hidden="true" />
          <span>{T.errorLabel}</span>
        </div>
        <!-- Réessayer sans repasser par une génération de résumé, ou retirer
             l'état d'échec : les mêmes gestes que sous la miniature. -->
        <div class="igc-tools">
          {#if $canGenerateInfographic}
            <button
              type="button"
              class="igc-tool"
              on:click={onRegenerate}
              disabled={actionBusy}
              aria-label={T.regenerate}
              title={T.regenerate}
            >
              <IconRefresh width="14" height="14" aria-hidden="true" />
            </button>
          {/if}
          <button
            type="button"
            class="igc-tool igc-tool-danger"
            on:click={onDelete}
            disabled={actionBusy}
            aria-label={T.remove}
            title={T.remove}
          >
            <IconTrash width="14" height="14" aria-hidden="true" />
          </button>
        </div>
      {:else}
        <!-- pending / loading : même empreinte que la future miniature -->
        <div class="igc-box igc-pending" role="status" aria-label={T.pendingLabel}>
          <IconGallery width="18" height="18" aria-hidden="true" />
          <span>{T.pendingLabel}</span>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if lightboxOpen && info.status === 'ready'}
  <!-- Fermeture au clic sur le fond : Échap est déjà géré au niveau fenêtre. -->
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div
    class="igc-lightbox"
    role="dialog"
    aria-modal="true"
    aria-label={T.title}
    use:portal
    on:click={onBackdropClick}
  >
    <div class="igc-lb-inner">
      <img class="igc-lb-img" src={info.dataUrl} alt={T.thumbAlt} />
      <div class="igc-lb-bar">
        <a
          class="igc-lb-btn igc-lb-download"
          href={info.dataUrl}
          download={DOWNLOAD_NAME}
          on:click={(e) => interceptAnchorDownload(e, info.dataUrl, DOWNLOAD_NAME)}
        >
          <IconDownload width="15" height="15" aria-hidden="true" />
          <span>{T.download}</span>
        </a>
        <!-- Régénérer / supprimer ici aussi : sur téléphone, la miniature réduite
             en pastille n'a plus sa rangée d'outils. -->
        {#if $canGenerateInfographic}
          <button type="button" class="igc-lb-btn" on:click={onRegenerate} disabled={actionBusy}>
            <IconRefresh width="15" height="15" aria-hidden="true" />
            <span>{T.regenerateShort}</span>
          </button>
        {/if}
        <button type="button" class="igc-lb-btn" on:click={onDelete} disabled={actionBusy}>
          <IconTrash width="15" height="15" aria-hidden="true" />
          <span>{T.removeShort}</span>
        </button>
        <button type="button" class="igc-lb-btn" on:click={() => (lightboxOpen = false)}>
          <IconClose width="15" height="15" aria-hidden="true" />
          <span>{T.close}</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Longueur du résumé (Pagimètre) dans le badge du template. Le badge laisse
     passer les clics vers l'éditeur (style.css) ; cette part-ci les reçoit,
     pour que l'infobulle « demandé / obtenu » s'affiche au survol. */
  .resume-template-tag-length {
    flex-shrink: 0;
    white-space: nowrap;
    color: var(--brand-text);
    font-weight: 500;
    pointer-events: auto;
    cursor: default;
  }

  /* Hauteur nulle + sticky : la carte flotte sous la barre d'outils de
     l'éditeur (sticky top 0, z 4) sans décaler le contenu. z 6 : au-dessus de
     la barre et du voile de génération (z 5) — mais la carte est masquée
     pendant la génération, le voile garde donc l'écran pour lui. */
  .igc-anchor {
    position: sticky;
    top: 54px;
    z-index: 6;
    height: 0;
  }

  .igc-slot {
    position: absolute;
    top: 0;
    right: 18px;
  }

  .igc-thumb {
    display: block;
    width: 86px;
    aspect-ratio: 2 / 3;
    padding: 0;
    border: 1px solid var(--mb-border-card);
    border-radius: 10px;
    overflow: hidden;
    cursor: zoom-in;
    background: #fff;
    box-shadow: 0 6px 18px -6px rgb(0 0 0 / 0.25);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .igc-thumb:hover {
    transform: scale(1.04);
    box-shadow: 0 10px 24px -6px rgb(0 0 0 / 0.3);
  }

  .igc-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Empreinte commune de l'attente et de l'échec : la place exacte de la
     future miniature — rien ne saute quand l'image arrive. */
  .igc-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 86px;
    aspect-ratio: 2 / 3;
    box-sizing: border-box;
    padding: 8px;
    border-radius: 10px;
    font-family: 'Lexend', sans-serif;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.3;
    text-align: center;
  }

  .igc-pending {
    border: 1px solid var(--mb-border-card);
    color: var(--mb-text-muted, #8a8a8a);
    background: linear-gradient(
      110deg,
      color-mix(in srgb, var(--brand-secondary) 6%, #f4f4f4) 25%,
      color-mix(in srgb, var(--brand-secondary) 4%, #fbfbfb) 40%,
      color-mix(in srgb, var(--brand-secondary) 6%, #f4f4f4) 55%
    );
    background-size: 300% 100%;
    animation: igc-shimmer 1.6s ease infinite;
  }

  @keyframes igc-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .igc-pending {
      animation: none;
    }
  }

  .igc-error {
    border: 1px dashed var(--warn-line, #e2c08d);
    background: var(--warn-bg, #fdf6ec);
    color: var(--warn-text, #8a6116);
  }

  /* Invite « Créer une infographie » : même empreinte que la miniature, en
     pointillés discrets — une proposition, pas un état. L'orange n'arrive
     qu'au survol, pour ne pas concurrencer le compte rendu. */
  .igc-invite {
    border: 1.25px dashed var(--mb-border-card);
    background: color-mix(in srgb, var(--brand-secondary) 2%, #fff);
    color: var(--mb-text-muted, #8a8a8a);
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .igc-invite:hover:not(:disabled) {
    color: var(--mb-orange);
    border-color: var(--mb-orange);
    background: var(--mb-orange-10, rgb(var(--brand-rgb) / 0.08));
    box-shadow: 0 6px 18px -8px rgb(var(--brand-rgb) / 0.45);
  }

  .igc-invite:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* ── Rangée d'outils sous la miniature (télécharger / régénérer / supprimer) ── */
  .igc-tools {
    display: flex;
    justify-content: center;
    gap: 6px;
    margin-top: 6px;
  }

  .igc-tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--mb-border-card);
    border-radius: 7px;
    background: #fff;
    color: var(--ink-soft, #6b6b6b);
    cursor: pointer;
    box-shadow: 0 2px 6px -2px rgb(0 0 0 / 0.18);
    transition:
      color 0.12s ease,
      border-color 0.12s ease,
      background 0.12s ease;
  }

  .igc-tool:hover:not(:disabled) {
    color: var(--mb-orange);
    border-color: var(--mb-orange);
  }

  .igc-tool-danger:hover:not(:disabled) {
    color: var(--danger-text, #b3261e);
    border-color: var(--danger-text, #b3261e);
  }

  .igc-tool:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* ── Visionneuse plein écran ── */
  /* 10000 : échelle des modales (cf. style.css) — à 1000, la barre d'app
     mobile (8500) passait par-dessus l'image. */
  .igc-lightbox {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgb(0 0 0 / 0.78);
    animation: igc-fade-in 0.15s ease;
  }

  @keyframes igc-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .igc-lb-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: min(92vw, 640px);
    max-height: calc(100vh - 48px);
  }

  .igc-lb-img {
    max-width: 100%;
    max-height: calc(100vh - 48px - 52px);
    border-radius: 12px;
    box-shadow: 0 18px 50px -12px rgb(0 0 0 / 0.6);
    background: #fff;
  }

  .igc-lb-bar {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .igc-lb-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 16px;
    border: none;
    border-radius: 8px;
    background: rgb(255 255 255 / 0.14);
    color: #fff;
    font-family: 'Lexend', sans-serif;
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s;
  }

  .igc-lb-btn:hover {
    background: rgb(255 255 255 / 0.26);
  }

  .igc-lb-download {
    background: var(--mb-orange);
  }

  .igc-lb-download:hover {
    background: var(--mb-orange);
    opacity: 0.88;
  }

  .igc-thumb-label {
    display: none;
  }

  .igc-lb-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Téléphone : la colonne est trop étroite pour que le texte contourne une
     carte flottante — elle recouvrait le titre du compte rendu. La carte se
     réduit en pastille, rangée dans la marge haute du texte en face du badge
     de template (style.css, même `top`), et défile avec lui au lieu de rester
     collée. Les outils de l'image passent dans l'affichage en grand. */
  @media (max-width: 768px) {
    .igc-anchor {
      position: absolute;
      top: 60px;
      left: 44%;
      right: 14px;
      height: 28px;
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }

    .igc-slot {
      position: static;
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .igc-box {
      flex-direction: row;
      width: auto;
      min-width: 0;
      height: 28px;
      aspect-ratio: auto;
      padding: 0 10px;
      gap: 6px;
      border-radius: 999px;
      font-size: 11px;
      white-space: nowrap;
    }

    .igc-box span {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .igc-thumb {
      display: flex;
      align-items: center;
      gap: 7px;
      width: auto;
      height: 32px;
      aspect-ratio: auto;
      padding: 1px 12px 1px 1px;
      border-radius: 999px;
      font-family: 'Lexend', sans-serif;
      font-size: 11px;
      font-weight: 500;
      color: var(--mb-orange);
    }

    .igc-thumb img {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .igc-thumb-label {
      display: inline;
      white-space: nowrap;
    }

    .igc-tools {
      margin-top: 0;
    }

    .igc-tools-ready {
      display: none;
    }
  }
</style>
