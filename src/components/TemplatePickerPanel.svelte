<script>
  /**
   * Carte de génération du ✨ Résumé IA : choisir un template, régler sa
   * longueur (Pagimètre), ajouter au besoin des instructions, générer.
   *
   * Tout se lit de haut en bas, dans l'ordre du geste, et tient sur un écran :
   *   - les templates sont des cartes COMPACTES (icône, nom, longueur, coche)
   *     — empilées icône sur nom, elles faisaient 85 px de haut, une seule
   *     colonne sur téléphone : il fallait défiler pour voir les autres
   *     templates, et le Pagimètre restait sous le bord de l'écran ;
   *   - la coche dit « un seul choix » (un chevron promettait une page de plus) ;
   *   - la pastille de longueur d'une carte suit le réglage en cours : elle dit
   *     ce qui partira si l'on choisit ce template ;
   *   - un template sans Pagimètre l'explique en une ligne, au lieu de faire
   *     disparaître le curseur sans un mot ;
   *   - les instructions, facultatives, se déplient à la demande.
   * La carte s'adapte à SA largeur (container query), pas à celle de l'écran :
   * entre l'historique et la colonne Actions, sur un portable étroit, elle est
   * aussi serrée que sur un téléphone.
   */
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { uiText } from '../store.js';
  import { canGenerateInfographic } from '../stores/auth.js';
  import {
    normalizePages,
    materialCapPages,
    countWords,
    formatPages,
    tickLabel,
  } from '../lib/pageMeter.js';
  import PageMeterSlider from './PageMeterSlider.svelte';
  import IconCheck from '~icons/solar/check-circle-bold';
  import IconAdd from '~icons/solar/add-circle-linear';
  import IconRuler from '~icons/solar/ruler-linear';

  export let templateOptions = [];
  export let currentTemplate = 'standard';
  /** Longueur de la version affichée (Pagimètre), reprise si l'on régénère avec le même template. */
  export let currentPages = null;
  /** Transcription de la réunion : sa longueur borne le Pagimètre (materialCapPages). */
  export let transcript = [];
  export let currentLanguage = 'fr';
  export let isGeneratingSummary = false;
  export let onGenerate = () => {};
  /** « Annuler » : referme la carte sans générer. Omis = pas de bouton (la
   *  carte se ferme alors par Échap, l'onglet Transcription ou le bouton qui
   *  l'a ouverte). Nécessaire quand elle vient du dock, qui s'efface le temps
   *  du choix : sans lui, rien à l'écran ne disait comment revenir. */
  export let onCancel = null;

  let selectedTemplate = currentTemplate;
  let instructions = '';
  /** Instructions repliées à l'ouverture : facultatives, elles ne prennent la
   *  place des templates et du Pagimètre que si on les demande. */
  let showInstructions = false;
  let instructionsEl;
  // Décochée à CHAQUE ouverture du panneau : chaque image coûte un appel au
  // modèle d'image, la demande doit être un geste explicite, jamais un reliquat.
  let withInfographic = false;
  // Pagimètre : la longueur réglée pour chaque template pendant que la carte
  // est ouverte — passer d'un template à l'autre ne perd pas le réglage.
  let pagesByTemplate = {};

  $: isLoading = templateOptions.length === 0;
  $: groups = [
    {
      key: 'admin',
      label: $uiText.dockCard.templatesSection,
      options: templateOptions.filter((o) => o.group !== 'user'),
    },
    {
      key: 'user',
      label: $uiText.dockCard.groupUserTemplates,
      options: templateOptions.filter((o) => o.group === 'user'),
    },
  ].filter((g) => g.options.length > 0);
  $: skeletonRows = Array.from({ length: 4 });
  // Proposée par l'administration (Administration → IA) ET permise par un des
  // groupes du compte (cf. stores/auth.js, canGenerateInfographic).
  $: infographicAvailable = $canGenerateInfographic;
  $: pm = $uiText.pageMeter;

  /**
   * Longueur qui partira avec un template : le réglage fait dans la carte, ou
   * celle de la version affichée quand on la régénère avec son template, ou la
   * position par défaut. null : le template ne propose pas le Pagimètre.
   * Réactive (et non une fonction ordinaire) : le gabarit qui l'appelle ne
   * voit pas pagesByTemplate, il ne se recalculerait pas.
   */
  $: lengthOf = (option) => {
    if (!option || option.pageMeter === null || option.pageMeter === undefined) return null;
    return (
      pagesByTemplate[option.value] ??
      (option.value === currentTemplate ? normalizePages(currentPages) : null) ??
      option.pageMeter
    );
  };
  $: pages = lengthOf(templateOptions.find((o) => o.value === selectedTemplate));
  $: materialCap = materialCapPages(
    countWords((transcript || []).map((item) => item?.text ?? '').join(' ')),
  );
  $: meterCap = materialCap < 10 ? materialCap : null;

  function selectTemplate(value) {
    selectedTemplate = value;
  }

  function setPages(value) {
    pagesByTemplate = { ...pagesByTemplate, [selectedTemplate]: value };
  }

  async function openInstructions() {
    showInstructions = true;
    await tick();
    instructionsEl?.focus();
  }

  /** « 1 p. », « ¼ p. », « 1,5 p. » : la pastille des cartes. */
  $: shortPages = (p) => `${tickLabel(p).replace('.', currentLanguage === 'en' ? '.' : ',')} p.`;

  function handleGenerate() {
    onGenerate({
      template: selectedTemplate,
      customPrompt: instructions.trim() || null,
      infographic: infographicAvailable && withInfographic,
      pages,
    });
  }
</script>

<div class="tpp">
  <div class="tpp-scroll">
    {#if isLoading}
      <div class="tpp-section">
        <span class="tpp-section-skel tpp-skel"></span>
        <div class="tpp-grid">
          {#each skeletonRows as _}
            <div class="tpp-card tpp-card-skel">
              <span class="tpp-card-icon-skel tpp-skel"></span>
              <span class="tpp-card-label-skel tpp-skel"></span>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      {#each groups as group (group.key)}
        <div class="tpp-section">
          <span class="tpp-section-label" id="tpp-group-{group.key}">{group.label}</span>
          <div class="tpp-grid" role="group" aria-labelledby="tpp-group-{group.key}">
            {#each group.options as option (option.value)}
              {@const selected = selectedTemplate === option.value}
              {@const length = lengthOf(option)}
              <button
                type="button"
                class="tpp-card"
                class:tpp-card-active={selected}
                aria-pressed={selected}
                on:click={() => selectTemplate(option.value)}
              >
                <span class="tpp-card-icon" aria-hidden="true">{option.icon}</span>
                <!-- Nom et pastille : côte à côte, la pastille à droite ; si la
                     place manque, elle passe sous le nom plutôt que de le casser. -->
                <span class="tpp-card-text">
                  <span class="tpp-card-label"
                    >{option.labels?.[currentLanguage] || option.value}</span
                  >
                  {#if length !== null}
                    <span
                      class="tpp-card-meter"
                      title={pm.badgeTitle.replace('{value}', formatPages(length, currentLanguage))}
                      ><span class="tpp-card-meter-sheet" aria-hidden="true"></span>{shortPages(
                        length,
                      )}</span
                    >
                  {/if}
                </span>
                <span class="tpp-card-check" aria-hidden="true">
                  {#if selected}<IconCheck width="20" height="20" />{/if}
                </span>
              </button>
            {/each}
          </div>
        </div>
      {/each}

      <!-- Pagimètre : sous les templates, là où l'œil arrive après avoir choisi. -->
      {#if pages !== null}
        <div class="tpp-meter" transition:slide={{ duration: 180 }}>
          <PageMeterSlider
            id="tpp-page-meter"
            value={pages}
            cap={meterCap}
            labels={pm}
            lang={currentLanguage}
            disabled={isGeneratingSummary}
            on:change={(e) => setPages(e.detail)}
          />
        </div>
      {:else}
        <p class="tpp-meter-off" transition:slide={{ duration: 180 }}>
          <IconRuler width="16" height="16" aria-hidden="true" />
          <span>{pm.pickerOff}</span>
        </p>
      {/if}
    {/if}

    <div class="tpp-section">
      {#if showInstructions}
        <label class="tpp-section-label" for="tpp-instructions"
          >{$uiText.dockCard.instructionsLabel}</label
        >
        <textarea
          id="tpp-instructions"
          class="tpp-instructions"
          bind:this={instructionsEl}
          bind:value={instructions}
          placeholder={$uiText.dockCard.instructionsPlaceholder}
          rows="4"
          transition:slide={{ duration: 160 }}
        ></textarea>
      {:else}
        <button
          type="button"
          class="tpp-add-instructions"
          aria-expanded="false"
          on:click={openInstructions}
        >
          <IconAdd width="18" height="18" aria-hidden="true" />
          <span>{$uiText.dockCard.instructionsLabel}</span>
          <span class="tpp-optional">{$uiText.dockCard.optional}</span>
        </button>
      {/if}
    </div>
  </div>

  <div class="tpp-footer">
    {#if infographicAvailable}
      <!-- Libellé court sur carte étroite : le pied tient alors sur une ligne.
           Le nom complet reste celui de la case (aria-label) et de la bulle. -->
      <label class="tpp-infographic" title={$uiText.dockCard.infographicLabel}>
        <input
          type="checkbox"
          aria-label={$uiText.dockCard.infographicLabel}
          bind:checked={withInfographic}
          disabled={isGeneratingSummary}
        />
        <span class="tpp-infographic-long">{$uiText.dockCard.infographicLabel}</span>
        <span class="tpp-infographic-short">{$uiText.dockCard.infographicShort}</span>
      </label>
    {/if}
    {#if onCancel}
      <button
        type="button"
        class="tpp-cancel-btn"
        on:click={onCancel}
        disabled={isGeneratingSummary}
      >
        {$uiText.dockCard.cancel}
      </button>
    {/if}
    <button
      type="button"
      class="tpp-generate-btn"
      on:click={handleGenerate}
      disabled={isGeneratingSummary}
    >
      {isGeneratingSummary ? '…' : $uiText.buttons.generateArrow}
    </button>
  </div>
</div>

<style>
  /* La carte mesure SA largeur : les règles « étroites » valent pour un
     téléphone comme pour un panneau serré sur ordinateur. */
  .tpp {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    container: tpp / inline-size;
  }

  .tpp-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px 8px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .tpp-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tpp-section-label {
    font-family: 'Lexend', sans-serif;
    font-size: 15px;
    font-weight: 500;
    color: var(--ink);
  }

  /* Deux colonnes dès que la place le permet, une seule sur téléphone :
     220 px, c'est un nom de deux mots, sa pastille et la coche sans ellipse. */
  .tpp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
    gap: 8px;
  }

  /* ── Carte de template : une ligne, 48 px (cible tactile) ──
     Les couleurs et le trait des cartes Figma (node 154:1755), à plat. */
  .tpp-card {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 7px 10px 7px 12px;
    background: var(--mb-bg-warm-light);
    border: 1.25px solid var(--mb-border-card);
    border-radius: 12px;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
    transition:
      border-color 0.15s,
      background 0.15s,
      box-shadow 0.15s;
  }

  .tpp-card:hover {
    border-color: var(--mb-orange);
  }

  .tpp-card:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgb(var(--brand-rgb) / 0.25);
  }

  .tpp-card-active {
    background: var(--mb-orange-10);
    border-color: var(--mb-orange);
  }

  .tpp-card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    font-size: 21px;
    line-height: 1;
    flex-shrink: 0;
  }

  .tpp-card-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 3px 8px;
  }

  /* Le nom entier, sur deux lignes s'il le faut : « Réunion de … » ne disait
     pas de quelle réunion il s'agissait. */
  .tpp-card-label {
    flex: 0 1 auto;
    min-width: 0;
    font-family: 'Lexend', sans-serif;
    font-weight: 600;
    font-size: 15px;
    line-height: 1.25;
    color: var(--mb-orange);
    overflow-wrap: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  /* Coche du choix : un anneau vide, plein et coché sur la carte retenue. */
  .tpp-card-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);
    color: var(--brand);
  }

  .tpp-card-active .tpp-card-check {
    box-shadow: none;
  }

  /* Pastille « Pagimètre » d'une carte : le template règle sa longueur en
     pages, et voici celle qui partira avec lui. */
  .tpp-card-meter {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 2px 7px 2px 5px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid rgb(var(--brand-rgb) / 0.3);
    font-family: 'Lexend', sans-serif;
    font-size: 11px;
    font-weight: 600;
    color: var(--brand-text);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  /* Mini feuille A4 à trois lignes : le motif du curseur, en 7 × 10 px. */
  .tpp-card-meter-sheet {
    width: 7px;
    height: 10px;
    border-radius: 1.5px;
    border: 1px solid currentColor;
    box-sizing: border-box;
    background: repeating-linear-gradient(
        to bottom,
        transparent 0 1.5px,
        currentColor 1.5px 2.3px,
        transparent 2.3px 3px
      )
      1px 1px / calc(100% - 2px) calc(100% - 3px) no-repeat;
  }

  /* Carte du Pagimètre : le même trait que les cartes de template, en blanc
     pour se lire comme un réglage et non comme un choix de plus. */
  .tpp-meter {
    padding: 16px 18px 14px;
    background: var(--surface);
    border: 1.25px solid var(--mb-border-card);
    border-radius: 12px;
    box-shadow: 0 6px 20px -14px rgb(var(--brand-rgb) / 0.45);
  }

  /* Template sans Pagimètre : une ligne qui dit pourquoi le curseur manque. */
  .tpp-meter-off {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    padding: 10px 14px;
    border: 1.25px dashed var(--mb-border-card);
    border-radius: 12px;
    font-family: 'Lexend', sans-serif;
    font-size: 12.5px;
    font-weight: 300;
    line-height: 1.45;
    color: var(--ink-muted);
  }
  .tpp-meter-off :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--ink-faint);
  }

  /* ── Instructions : repliées en un bouton, dépliées sur demande ── */
  .tpp-add-instructions {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 8px;
    min-height: 40px;
    padding: 8px 14px 8px 10px;
    border: 1.25px dashed var(--mb-border-card);
    border-radius: 10px;
    background: none;
    font-family: 'Lexend', sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: var(--brand-text);
    cursor: pointer;
    text-align: left;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .tpp-add-instructions:hover {
    border-color: var(--mb-orange);
    background: var(--surface-tint);
  }
  .tpp-add-instructions :global(svg) {
    flex-shrink: 0;
  }
  .tpp-optional {
    font-weight: 300;
    font-size: 12.5px;
    color: var(--ink-faint);
  }

  /* ── Skeleton (chargement) ── */
  .tpp-skel {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-secondary) 6%, #f2f2f2) 25%,
      color-mix(in srgb, var(--brand-secondary) 5%, #fafafa) 37%,
      color-mix(in srgb, var(--brand-secondary) 6%, #f2f2f2) 63%
    );
    background-size: 400% 100%;
    animation: tpp-shimmer 1.4s ease infinite;
    border-radius: 6px;
    display: inline-block;
  }

  @keyframes tpp-shimmer {
    0% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0 50%;
    }
  }

  .tpp-section-skel {
    width: 90px;
    height: 15px;
  }

  .tpp-card-skel {
    cursor: default;
  }

  .tpp-card-icon-skel {
    width: 26px;
    height: 26px;
    border-radius: 8px;
  }

  .tpp-card-label-skel {
    width: 90px;
    height: 15px;
  }

  .tpp-instructions {
    width: 100%;
    min-height: 120px;
    background: var(--mb-bg-app);
    border: 1.25px solid var(--mb-border-card);
    border-radius: 12px;
    font-family: 'Lexend', sans-serif;
    font-weight: 300;
    font-size: 13px;
    color: var(--ink);
    padding: 14px 16px;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .tpp-instructions:focus {
    border-color: var(--mb-orange);
  }

  .tpp-instructions::placeholder {
    color: #a4a4a4;
    font-weight: 300;
  }

  /* position:relative + z-index au-dessus de .main-area::after (fondu bas,
     z-index implicite dans la pile de .main-area) + fond opaque, sinon le
     bouton se fait laver par le dégradé/flou du fondu (peu visible). */
  .tpp-footer {
    flex-shrink: 0;
    position: relative;
    z-index: 51;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 18px;
    /* safe-bottom : le bouton Générer ne doit pas passer sous l'indicateur
       home iOS ni sous le dock fixe mobile. */
    padding: 14px 24px calc(18px + var(--safe-bottom, 0px));
    background: var(--mb-bg-app);
    border-top: 1px solid var(--line);
  }

  /* Case « Générer une infographie » — dans le pied, avec le bouton :
     c'est une option DE cette génération, pas un réglage du panneau. */
  .tpp-infographic {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-right: auto;
    cursor: pointer;
    font-family: 'Lexend', sans-serif;
    font-size: 13px;
    font-weight: 400;
    color: var(--ink);
    user-select: none;
  }

  .tpp-infographic input {
    width: 16px;
    height: 16px;
    margin: 0;
    flex-shrink: 0;
    accent-color: var(--mb-orange);
    cursor: pointer;
  }

  .tpp-infographic input:disabled {
    cursor: not-allowed;
  }

  .tpp-infographic-short {
    display: none;
  }

  /* « Annuler » en texte seul : présent, mais sans concurrencer « Générer → ». */
  .tpp-cancel-btn {
    flex-shrink: 0;
    white-space: nowrap;
    background: none;
    border: none;
    border-radius: 8px;
    padding: 10px 12px;
    font-family: 'Lexend', sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: var(--ink-muted);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .tpp-cancel-btn:hover:not(:disabled) {
    background: var(--surface-tint);
    color: var(--ink);
  }

  .tpp-cancel-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .tpp-generate-btn {
    flex-shrink: 0;
    white-space: nowrap;
    background: var(--mb-orange);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    font-family: 'Lexend', sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 14px -2px rgb(var(--brand-rgb) / 0.4);
    transition:
      opacity 0.15s,
      transform 0.1s;
  }

  .tpp-generate-btn:hover:not(:disabled) {
    opacity: 0.88;
  }

  .tpp-generate-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .tpp-generate-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── Carte étroite (téléphone, panneau serré) ──
     Tout doit tenir au-dessus du pied sur un téléphone : templates ET
     Pagimètre. Deux colonnes de cartes resserrées (une seule sous 296 px),
     la coche passe en coin de la carte retenue, la pastille perd sa feuille ;
     le Pagimètre perd son sous-titre (la valeur et les mots disent déjà ce
     qu'il règle) ; le pied tient sur une ligne, « Infographie » en court. */
  @container tpp (max-width: 480px) {
    .tpp-scroll {
      padding: 16px 16px 8px;
      gap: 18px;
    }
    .tpp-grid {
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 140px), 1fr));
    }
    .tpp-card {
      position: relative;
      gap: 8px;
      min-height: 44px;
      padding: 6px 8px 6px 10px;
    }
    .tpp-card-icon {
      width: 22px;
      height: 22px;
      font-size: 18px;
    }
    .tpp-card-label {
      font-size: 14px;
    }
    .tpp-card-meter {
      padding: 1px 6px;
      font-size: 10.5px;
    }
    .tpp-card-meter-sheet {
      display: none;
    }
    .tpp-card-check {
      position: absolute;
      top: -7px;
      right: -7px;
      background: var(--surface);
      box-shadow: 0 0 0 2px var(--surface);
    }
    .tpp-card:not(.tpp-card-active) .tpp-card-check {
      display: none;
    }
    .tpp-meter {
      padding: 14px 14px 12px;
    }
    .tpp-meter :global(.pm-subtitle) {
      display: none;
    }
    .tpp-footer {
      flex-wrap: wrap;
      gap: 8px 10px;
      padding: 12px 16px calc(14px + var(--safe-bottom, 0px));
    }
    .tpp-infographic-long {
      display: none;
    }
    .tpp-infographic-short {
      display: inline;
    }
    .tpp-infographic {
      min-height: 44px;
    }
    .tpp-cancel-btn,
    .tpp-generate-btn {
      min-height: 44px;
    }
    .tpp-cancel-btn {
      padding: 10px;
    }
    .tpp-generate-btn {
      padding: 10px 16px;
    }
  }

  /* Plus étroit encore (téléphone de 320 px) : la case passe seule au-dessus,
     « Générer → » prend la largeur restante. */
  @container tpp (max-width: 330px) {
    .tpp-infographic {
      flex: 1 1 100%;
      min-height: 32px;
    }
    .tpp-generate-btn {
      flex: 1 1 auto;
    }
  }

  /* Panneau écrasé (fenêtre de 800 à 900 px, historique et Actions ouverts) :
     l'icône cède sa place au nom, plutôt que le nom ne se coupe en deux. */
  @container tpp (max-width: 240px) {
    .tpp-card-icon {
      display: none;
    }
  }
</style>
