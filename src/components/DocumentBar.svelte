<script>
  /**
   * Barre des documents d'une réunion terminée — au-dessus de la transcription
   * ou du compte rendu. Extraite d'App.svelte (plafonné par `max-lines`).
   *
   * Elle répond à la question de la fin de réunion — résumer, ou partager ? —
   * en trois zones, une seule hiérarchie :
   *   - à gauche, UN sélecteur : « Transcription », puis un segment par version
   *     du résumé (« Résumé 1 », « Résumé 2 »…). Une seule famille visuelle là
   *     où cohabitaient une pastille bordée et des onglets à halo orange ;
   *   - à droite, ce qu'on fait du document affiché : le tag de la réunion
   *     (contexte, discret), « Partager » (PostActions — mail, dépôt,
   *     téléchargement, chaque entrée nommée, sur ordinateur comme sur
   *     téléphone), et le seul bouton plein de la barre : « Résumer », ou
   *     « Nouveau résumé » dès qu'une version existe.
   *
   * Le bouton de résumé n'apparaît pas tant que le dock, en bas, propose
   * « Résumer → » (réunion tout juste arrêtée) : un même geste n'a qu'un
   * endroit. Il prend le relais dès que le dock s'efface — réunion rangée,
   * ouverte depuis l'historique, ou déjà résumée. Le choix du template qu'il
   * ouvre se referme par ce même bouton (enfoncé), par « Annuler », Échap ou
   * l'onglet Transcription.
   *
   * La croix d'une version n'existe que sur le segment affiché, et seulement
   * s'il en reste une autre : pour supprimer une version, on l'affiche d'abord.
   * Au survol elle se révèle ; au doigt, elle est toujours là.
   *
   * Téléphone (≤ 768 px) : deux lignes — le sélecteur seul, puis le tag,
   * « Partager » et « Résumer » côte à côte, tous nommés : un écran tactile n'a
   * pas d'infobulle, et c'est cette ligne qui pose la question de la fin de
   * réunion. Le bouton y dit « Résumer » même quand une version existe —
   * « Nouveau résumé » ne tient pas à côté du tag et de « Partager » à 360 px,
   * et l'ancienne solution, un « + » sans nom, ne disait rien. Sous 350 px,
   * l'icône seule, comme les boutons du dock.
   */
  import { afterUpdate, onMount } from 'svelte';
  import { uiText } from '../store.js';
  import { PHONE_MAX_WIDTH } from '../config/constants.js';
  import TagSelect from './TagSelect.svelte';
  import PostActions from './PostActions.svelte';
  import SparkleIcon from './icons/SparkleIcon.svelte';
  import IconTranscript from '~icons/solar/document-text-linear';
  import IconCloseX from '~icons/solar/close-circle-linear';
  import IconStars from '~icons/solar/stars-minimalistic-linear';

  /** @type {'transcription'|'resume'} document affiché */
  export let activeTab = 'transcription';
  /** @type {{id: string, pending?: boolean}[]} versions du résumé, dans l'ordre */
  export let versions = [];
  export let activeVersionId = null;
  /** Le dock propose déjà « Résumer → » : pas de second bouton ici. */
  export let summaryInDock = false;
  /** Choix du template ouvert — par ce bouton, ou par le dock. */
  export let pickerOpen = false;
  /** Génération en cours : le bouton attend, la version en attente respire. */
  export let generating = false;
  /** Réunion en base : sans elle, rien à ranger, pas de tag. */
  export let meetingId = null;
  export let tagId = null;
  /** Propriétés de PostActions, passées telles quelles (voir ce composant). */
  export let share = {};
  export let onShowTranscription = () => {};
  /** @type {(id: string) => void} */
  export let onSelectVersion = () => {};
  /** @type {(id: string) => void} */
  export let onDeleteVersion = () => {};
  export let onToggleSummary = () => {};
  /** @type {(slug: string) => void} erreur du serveur au rangement */
  export let onTagError = () => {};
  /** Ouvre « Mes tags ». Omis = entrée masquée du sélecteur. */
  export let onManageTags = null;

  // Téléphone : le libellé du bouton change avec la largeur, pas seulement sa
  // mise en page — le nom accessible doit rester le texte affiché. jsdom n'a
  // pas matchMedia : ordinateur par défaut.
  let narrow = false;
  onMount(() => {
    const mq = window.matchMedia?.(`(max-width: ${PHONE_MAX_WIDTH}px)`);
    if (!mq) return;
    const sync = () => (narrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  $: T = $uiText.documentBar;
  $: hasVersions = versions.length > 0;
  $: ctaLabel = hasVersions && !narrow ? T.newSummary : T.summarize;
  $: ctaTitle = pickerOpen ? T.closePicker : hasVersions ? T.newSummaryHint : T.summarizeHint;

  const numbered = (text, n) => text.replace('{n}', String(n));

  // Le rail défile quand les versions dépassent (téléphone, panneau étroit) :
  // le segment affiché y reste visible — et, le temps d'une génération, le
  // segment en attente (« Résumé n — génération en cours… ») : sur ordinateur,
  // avec la colonne des actions ouverte, le rail n'a la place que d'un segment
  // et demi, et l'étincelle naissait hors champ, à droite (mesuré au harnais).
  // `scrollIntoView` manque à jsdom.
  let railEl;
  let shown = '';
  $: pendingId = versions.find((v) => v.pending)?.id ?? null;
  afterUpdate(() => {
    const key = pendingId
      ? `pending:${pendingId}`
      : activeTab === 'resume'
        ? String(activeVersionId)
        : 'transcription';
    if (key === shown) return;
    shown = key;
    railEl
      ?.querySelector(pendingId ? '.db-tab-pending' : '.db-tab-active')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });
</script>

<div class="db">
  <div class="db-tabs" role="tablist" aria-label={T.tabsLabel} bind:this={railEl}>
    <div class="db-tab" class:db-tab-active={activeTab === 'transcription'}>
      <button
        type="button"
        role="tab"
        class="db-tab-btn"
        aria-selected={activeTab === 'transcription'}
        on:click={onShowTranscription}
      >
        <IconTranscript width="14" height="14" aria-hidden="true" />
        <span>{T.transcription}</span>
      </button>
    </div>

    {#each versions as v, i (v.id)}
      {@const n = i + 1}
      {@const active = activeTab === 'resume' && activeVersionId === v.id}
      <div
        class="db-tab db-tab-version"
        class:db-tab-active={active}
        class:db-tab-pending={v.pending}
      >
        <button
          type="button"
          role="tab"
          class="db-tab-btn"
          aria-selected={active}
          aria-busy={v.pending}
          title={v.pending ? numbered(T.summaryPending, n) : undefined}
          on:click={() => !v.pending && onSelectVersion(v.id)}
        >
          <span>{numbered(T.summaryTab, n)}</span>
        </button>
        {#if v.pending}
          <!-- Étincelle animée pendant la génération (SparkleIcon) -->
          <span class="db-tab-slot" aria-hidden="true"><SparkleIcon /></span>
        {:else if active && versions.length > 1}
          <span class="db-tab-slot">
            <button
              type="button"
              class="db-tab-close"
              on:click={() => onDeleteVersion(v.id)}
              aria-label={numbered(T.deleteSummary, n)}
              title={numbered(T.deleteSummary, n)}
            >
              <IconCloseX width="13" height="13" aria-hidden="true" />
            </button>
          </span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="db-actions">
    {#if meetingId}
      <TagSelect {meetingId} {tagId} onError={onTagError} onManage={onManageTags} />
    {/if}
    <PostActions {...share} />
    {#if !summaryInDock}
      <button
        type="button"
        class="db-cta"
        class:db-cta-open={pickerOpen}
        on:click={onToggleSummary}
        disabled={generating}
        aria-expanded={pickerOpen}
        aria-label={ctaLabel}
        title={ctaTitle}
      >
        <IconStars width="16" height="16" aria-hidden="true" />
        <span class="db-cta-label">{ctaLabel}</span>
      </button>
    {/if}
  </div>
</div>

<style>
  /* 42 px de haut (5 + 32 + 5) : le centre de la barre, à 21 px, est celui du
     titre du panneau Actions voisin (.ap-header / .ap-collapse-btn, style.css)
     — les deux panneaux commencent au même bord. */
  .db {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 5px 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }

  /* ── Sélecteur de document : un rail, un segment par document ── */
  .db-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    max-width: 100%;
    padding: 2px;
    border-radius: 10px;
    background: var(--brand-secondary-soft-12);
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .db-tabs::-webkit-scrollbar {
    display: none;
  }

  .db-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 28px;
    flex: none;
    border-radius: 8px;
    color: var(--ink-muted);
    transition:
      background 0.15s,
      color 0.15s,
      box-shadow 0.15s;
  }
  .db-tab:hover {
    color: var(--ink);
  }
  .db-tab-active {
    background: var(--surface);
    color: var(--ink);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 0 0 1px var(--line);
  }
  .db-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 100%;
    padding: 0 12px;
    border: none;
    border-radius: inherit;
    background: none;
    color: inherit;
    font-family: 'Lexend', sans-serif;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }
  .db-tab-active .db-tab-btn {
    font-weight: 600;
  }
  /* Version en cours : teinte de marque et respiration, pas de clic. */
  .db-tab-pending {
    color: var(--brand-text);
    animation: db-breathe 1.4s ease-in-out infinite;
  }
  .db-tab-pending .db-tab-btn {
    cursor: progress;
  }
  @keyframes db-breathe {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }
  /* Emplacement fixe en fin de segment — étincelle ou croix — sans saut. */
  .db-tab-slot {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin: 0 4px 0 -6px;
    flex: none;
  }
  .db-tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--ink-muted);
    opacity: 0.55;
    cursor: pointer;
    transition:
      opacity 0.15s,
      background 0.15s,
      color 0.15s;
  }
  .db-tab:hover .db-tab-close,
  .db-tab-close:focus-visible {
    opacity: 1;
  }
  .db-tab-close:hover {
    background: var(--danger-bg);
    color: var(--danger-strong);
  }

  /* ── Tag et « Partager », à droite ── */
  .db-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    min-width: 0;
    flex: none;
  }
  /* Le tag prend le gabarit de ses voisins (TagSelect sert aussi la barre
     d'enregistrement, plus dense) : même hauteur, même rayon. */
  .db-actions :global(.ts-btn) {
    height: 32px;
    padding: 0 10px;
    border-radius: 10px;
    font-size: 12px;
  }

  /* ── Le geste plein : « Résumer » / « Nouveau résumé » ── */
  .db-cta {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 14px 0 12px;
    flex: none;
    border: none;
    border-radius: 10px;
    background: var(--brand);
    color: #fff;
    font-family: 'Lexend', sans-serif;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: 0 4px 12px -4px rgb(var(--brand-rgb) / 0.55);
    transition:
      background 0.15s,
      transform 0.15s,
      box-shadow 0.15s;
  }
  .db-cta:hover:not(:disabled) {
    background: var(--brand-strong);
    box-shadow: 0 6px 16px -4px rgb(var(--brand-rgb) / 0.6);
  }
  .db-cta:active:not(:disabled) {
    transform: scale(0.97);
  }
  .db-cta:disabled {
    opacity: 0.55;
    cursor: progress;
    box-shadow: none;
  }
  /* Choix du template ouvert : bouton enfoncé, il reste l'ancre du panneau. */
  .db-cta-open {
    background: var(--brand-strong);
    box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.2);
  }

  /* ── Téléphone : deux lignes ── */
  @media (max-width: 768px) {
    .db {
      flex-wrap: wrap;
      gap: 8px 6px;
      padding: 8px;
    }
    /* Ligne 1 : le rail seul, à sa largeur ; trop large, il défile. */
    .db-tabs {
      flex: 0 1 auto;
      padding: 3px;
    }
    /* Ligne 2, entière : le tag à gauche, « Partager » et « Résumer » à
       droite. Rien n'y passe à la ligne — c'est le tag qui cède (ellipse). */
    .db-actions {
      flex: 1 1 100%;
      gap: 6px;
      margin-left: 0;
      justify-content: flex-end;
    }
    /* Toute la chaîne du tag accepte de rétrécir (min-width: 0 jusqu'au
       nom, qui s'ellipse) ; « Partager » et « Résumer », eux, ne cèdent
       jamais — un bouton coupé à « Parta… » ne dit plus rien. */
    .db-actions :global(.ts) {
      margin-right: auto;
      min-width: 0;
    }
    .db-actions :global(.ts-btn) {
      height: 44px;
      min-width: 0;
      max-width: min(40vw, 160px);
      white-space: nowrap;
    }
    .db-actions :global(.ts-btn > span),
    .db-actions :global(.tag-chip) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .db-actions :global(.pa) {
      flex-shrink: 0;
    }
    .db-cta {
      height: 44px;
      padding: 0 12px 0 10px;
    }
  }

  /* Très petits écrans (320 px) : « Résumer » ne tient plus à côté du tag et
     de « Partager » — l'icône seule, le nom restant porté par le lecteur
     d'écran, comme les boutons du dock. */
  @media (max-width: 350px) {
    .db-cta-label {
      display: none;
    }
    .db-cta {
      width: 44px;
      padding: 0;
      justify-content: center;
    }
  }

  /* Au doigt : segments plus hauts, croix toujours visible et plus large. */
  @media (hover: none) and (pointer: coarse) {
    .db-tab {
      height: 38px;
    }
    .db-tab-btn {
      padding: 0 14px;
    }
    .db-tab-slot,
    .db-tab-close {
      width: 28px;
      height: 28px;
    }
    .db-tab-close {
      opacity: 0.85;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .db-tab-pending {
      animation: none;
    }
  }
</style>
