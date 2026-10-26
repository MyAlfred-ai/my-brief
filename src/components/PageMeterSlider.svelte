<script>
  /**
   * Pagimètre — le curseur de longueur du ✨ Résumé IA, en pages.
   *
   * Deux usages : la carte de génération (TemplatePickerPanel), où chacun règle
   * la longueur de CE résumé, et l'éditeur de template (TemplateEditor), où l'on
   * choisit la position de départ. Même dessin des deux côtés : ce qu'on règle
   * dans l'éditeur est exactement ce que l'utilisateur verra.
   *
   * Trois lectures de la même valeur, pour qu'aucune ne soit à deviner :
   *   - le libellé (« 1 page ») ;
   *   - des feuilles A4 qui se remplissent de lignes — une feuille pleine par
   *     page, la dernière remplie au prorata ;
   *   - l'équivalent en mots et en temps de lecture.
   * Réunion trop courte pour la longueur demandée (`cap`) : la part inatteignable
   * est hachurée, sur le curseur comme sur les feuilles, et une phrase dit où le
   * résumé s'arrêtera — plutôt que de promettre dix pages et d'en rendre deux.
   *
   * Le curseur parcourt les RANGS de PAGE_STEPS (pas serrés sous une page,
   * larges au-dessus) : un input range natif, donc clavier et lecteurs d'écran
   * sans rien réimplémenter ; `aria-valuetext` dit « 1 page », pas « 3 ».
   */
  import { createEventDispatcher } from 'svelte';
  import { scale } from 'svelte/transition';
  import IconRuler from '~icons/solar/ruler-linear';
  import {
    PAGE_STEPS,
    MAX_PAGES,
    normalizePages,
    stepIndex,
    stepAtOrBelow,
    formatPages,
    tickLabel,
    wordsForPages,
    readingMinutes,
  } from '../lib/pageMeter.js';

  /** Longueur choisie, en pages (une position de PAGE_STEPS). */
  export let value = 1;
  /** Pages que la matière de la réunion permet (null : pas de plafond). */
  export let cap = null;
  /** Textes : $uiText.pageMeter. */
  export let labels = {};
  export let lang = 'fr';
  export let disabled = false;
  /** Titre de la ligne d'en-tête : le nom par défaut, « Position par défaut » dans l'éditeur. */
  export let title = null;
  /** Sous-titre ; '' pour n'en afficher aucun. */
  export let subtitle = null;
  /** Sans l'icône : l'éditeur la porte déjà dans le titre de sa section. */
  export let showIcon = true;
  /** Préfixe des id (deux curseurs sur un même écran ne doivent pas se croiser). */
  export let id = 'page-meter';

  const dispatch = createEventDispatcher();
  const LAST = PAGE_STEPS.length - 1;
  /** Graduations nommées : les repères qu'on vise, pas tous les pas. */
  const TICKS = [0.25, 0.5, 1, 2, 3, 5, 10];
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  $: pages = normalizePages(value) ?? 1;
  $: index = stepIndex(pages);
  $: capped = cap !== null && cap < pages - 1e-9;
  /** Ce qui sera réellement écrit : la demande, bornée par la matière. */
  $: effective = capped ? cap : pages;
  $: words = wordsForPages(effective);
  $: minutes = readingMinutes(words);
  $: capLabel = capped ? formatPages(stepAtOrBelow(cap), lang) : '';

  /** Position d'une longueur sur le curseur, en fraction : rang interpolé entre deux pas. */
  function positionOf(p) {
    if (p <= PAGE_STEPS[0]) return 0;
    if (p >= MAX_PAGES) return 1;
    for (let i = 1; i < PAGE_STEPS.length; i++) {
      if (p <= PAGE_STEPS[i]) {
        const lo = PAGE_STEPS[i - 1];
        return (i - 1 + (p - lo) / (PAGE_STEPS[i] - lo)) / LAST;
      }
    }
    return 1;
  }

  $: fillPos = index / LAST;
  $: capPos = cap !== null && cap < MAX_PAGES ? positionOf(cap) : null;

  /**
   * Feuilles dessinées : autant que de pages entamées. `ink` est la part que
   * le résumé remplira, `ghost` la part demandée mais hors de portée.
   */
  const part = (x) => Math.round(Math.max(0, Math.min(1, x)) * 1000) / 1000;
  $: sheets = Array.from({ length: Math.ceil(pages - 1e-9) }, (_, i) => ({
    ink: part(effective - i),
    ghost: part(pages - i),
  }));

  function setIndex(i) {
    const next = PAGE_STEPS[Math.max(0, Math.min(LAST, i))];
    if (next === value) return;
    value = next;
    dispatch('change', next);
  }

  function onInput(event) {
    setIndex(Number(event.currentTarget.value));
  }

  const fmt = (template, vars) =>
    String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
</script>

<div class="pm" class:pm-disabled={disabled} class:pm-no-icon={!showIcon}>
  <div class="pm-head">
    {#if showIcon}
      <span class="pm-icon" aria-hidden="true"><IconRuler width="18" height="18" /></span>
    {/if}
    <label class="pm-title" for="{id}-range">{title ?? labels.name}</label>
    {#if (subtitle ?? labels.subtitle) !== ''}
      <span class="pm-subtitle">{subtitle ?? labels.subtitle}</span>
    {/if}
    <!-- aria-live : la valeur annoncée quand on relâche, pas seulement lue. -->
    <output class="pm-value" for="{id}-range" aria-live="polite">{formatPages(pages, lang)}</output>
  </div>

  <div class="pm-body">
    <div class="pm-sheets" aria-hidden="true">
      {#each sheets as sheet, i (i)}
        <span
          class="pm-sheet"
          in:scale={{ start: 0.7, duration: reducedMotion ? 0 : 160 }}
          style="--ink: {sheet.ink}; --ghost: {sheet.ghost};"
        >
          <span class="pm-sheet-ghost"></span>
          <span class="pm-sheet-ink"></span>
        </span>
      {/each}
    </div>
    <p class="pm-figures" id="{id}-figures">
      <strong
        >{fmt(labels.words, { n: words.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR') })}</strong
      >
      <span class="pm-dot" aria-hidden="true">·</span>
      <span>{fmt(labels.reading, { n: minutes })}</span>
    </p>
  </div>

  <div class="pm-slider" style="--fill: {fillPos}; --cap: {capPos ?? 1};">
    <div class="pm-track" aria-hidden="true">
      <span class="pm-track-fill"></span>
      {#if capPos !== null}
        <span class="pm-track-cap" title={labels.capZone}></span>
      {/if}
      {#each PAGE_STEPS as step, i (step)}
        <span class="pm-step" class:pm-step-on={i <= index} style="--at: {i / LAST};"></span>
      {/each}
    </div>
    <input
      id="{id}-range"
      class="pm-range"
      type="range"
      min="0"
      max={LAST}
      step="1"
      value={index}
      {disabled}
      aria-label={labels.sliderAria}
      aria-valuetext={formatPages(pages, lang)}
      aria-describedby="{id}-figures {id}-note"
      on:input={onInput}
    />
    <!-- Repères cliquables à la souris ; au clavier, le curseur suffit. -->
    <div class="pm-ticks" aria-hidden="true">
      {#each TICKS as tick (tick)}
        <button
          type="button"
          tabindex="-1"
          class="pm-tick"
          class:pm-tick-on={tick === pages}
          class:pm-tick-minor={tick === 0.5}
          style="--at: {PAGE_STEPS.indexOf(tick) / LAST};"
          {disabled}
          on:click={() => setIndex(PAGE_STEPS.indexOf(tick))}>{tickLabel(tick)}</button
        >
      {/each}
    </div>
  </div>

  <p class="pm-note" class:pm-note-cap={capped} id="{id}-note">
    {capped ? fmt(labels.capNote, { max: capLabel }) : labels.extras}
  </p>
</div>

<style>
  .pm {
    --pm-thumb: 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-family: 'Lexend', sans-serif;
    color: var(--ink);
    /* Repère de largeur du mode compact (cf. fin de feuille). */
    container: pm / inline-size;
  }
  .pm-disabled {
    opacity: 0.55;
  }

  /* ── En-tête : le nom, ce qu'il règle, la valeur ──
     Grille : le sous-titre passe SOUS le titre et la valeur, sur toute la
     largeur — en ligne, il s'écrasait sur quatre lignes à côté de la valeur
     sur téléphone. */
  .pm-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'icon title value'
      'icon sub sub';
    align-items: center;
    column-gap: 12px;
    row-gap: 2px;
  }
  .pm-no-icon .pm-head {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'title value'
      'sub sub';
  }
  .pm-icon {
    grid-area: icon;
    align-self: start;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    color: var(--brand-text);
    background: rgb(var(--brand-rgb) / 0.1);
  }
  .pm-title {
    grid-area: title;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1.25;
  }
  .pm-subtitle {
    grid-area: sub;
    font-size: 12px;
    font-weight: 300;
    color: var(--ink-muted);
    line-height: 1.35;
  }
  .pm-value {
    grid-area: value;
    min-width: 86px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1.25px solid rgb(var(--brand-rgb) / 0.35);
    background: rgb(var(--brand-rgb) / 0.08);
    color: var(--brand-text);
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  /* ── Feuilles A4 et chiffres ── */
  /* Feuilles et chiffres côte à côte : un seul aperçu de la longueur. */
  .pm-body {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 14px;
    min-height: 31px;
  }
  .pm-sheets {
    display: flex;
    align-items: flex-end;
    gap: 5px;
    min-height: 31px;
  }
  /* Une feuille : format A4 (1 : 1,41), des lignes de texte qui la remplissent
     de haut en bas. `--ink` : part écrite ; `--ghost` : part demandée. */
  .pm-sheet {
    position: relative;
    width: 22px;
    height: 31px;
    border-radius: 3px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
    overflow: hidden;
    flex-shrink: 0;
  }
  .pm-sheet-ink,
  .pm-sheet-ghost {
    position: absolute;
    left: 3px;
    right: 3px;
    top: 4px;
    transition: height 0.18s ease;
  }
  /* Fond opaque sous les lignes : la part écrite masque les hachures. */
  .pm-sheet-ink {
    height: calc((100% - 8px) * var(--ink));
    background-color: var(--surface);
    background-image: repeating-linear-gradient(
      to bottom,
      rgb(var(--brand-rgb) / 0.75) 0 1.5px,
      transparent 1.5px 4px
    );
  }
  /* Demandé mais hors de portée : hachuré, dans le ton d'avertissement. */
  .pm-sheet-ghost {
    height: calc((100% - 8px) * var(--ghost));
    background: repeating-linear-gradient(135deg, var(--warn-line) 0 2px, transparent 2px 4.5px);
  }
  .pm-figures {
    margin: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 300;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .pm-figures strong {
    font-weight: 600;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  .pm-dot {
    color: var(--line-faint);
  }

  /* ── Curseur ──
     Le centre du pouce parcourt [pouce/2, 100 % − pouce/2] : piste, pas et
     repères se placent sur la même formule, sinon ils dérivent du pouce. */
  .pm-slider {
    position: relative;
    padding-bottom: 22px;
    /* Repère de largeur pour les graduations (cf. plus bas). */
    container: pm-slider / inline-size;
  }
  .pm-track {
    position: absolute;
    left: calc(var(--pm-thumb) / 2);
    right: calc(var(--pm-thumb) / 2);
    top: calc(var(--pm-thumb) / 2 - 3px);
    height: 6px;
    border-radius: 999px;
    background: var(--line);
  }
  .pm-track-fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: calc(100% * var(--fill));
    border-radius: inherit;
    background: linear-gradient(90deg, rgb(var(--brand-rgb) / 0.55), var(--brand));
  }
  /* Au-delà de la matière de la réunion : hachures, par-dessus le remplissage. */
  .pm-track-cap {
    position: absolute;
    top: -2px;
    bottom: -2px;
    left: calc(100% * var(--cap));
    right: 0;
    border-radius: 0 999px 999px 0;
    background: repeating-linear-gradient(135deg, var(--warn-line) 0 3px, var(--warn-bg) 3px 6px);
    box-shadow: inset 2px 0 0 var(--warn-text);
  }
  .pm-step {
    position: absolute;
    top: 50%;
    left: calc(100% * var(--at));
    width: 4px;
    height: 4px;
    margin: -2px 0 0 -2px;
    border-radius: 50%;
    background: var(--line-faint);
  }
  .pm-step-on {
    background: rgb(255 255 255 / 0.85);
  }
  .pm-range {
    position: relative;
    display: block;
    width: 100%;
    height: var(--pm-thumb);
    margin: 0;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
  }
  .pm-range:disabled {
    cursor: not-allowed;
  }
  .pm-range::-webkit-slider-runnable-track {
    height: var(--pm-thumb);
    background: transparent;
  }
  .pm-range::-moz-range-track {
    height: var(--pm-thumb);
    background: transparent;
  }
  .pm-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: var(--pm-thumb);
    height: var(--pm-thumb);
    border-radius: 50%;
    background: var(--surface);
    border: 2px solid var(--brand);
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.55);
    transition:
      transform 0.12s ease,
      box-shadow 0.12s ease;
  }
  .pm-range::-moz-range-thumb {
    box-sizing: border-box;
    width: var(--pm-thumb);
    height: var(--pm-thumb);
    border-radius: 50%;
    background: var(--surface);
    border: 2px solid var(--brand);
    box-shadow: 0 2px 8px -2px rgb(var(--brand-rgb) / 0.55);
  }
  .pm-range:hover:not(:disabled)::-webkit-slider-thumb {
    transform: scale(1.08);
  }
  .pm-range:focus-visible {
    outline: none;
  }
  .pm-range:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 5px rgb(var(--brand-rgb) / 0.22);
  }
  .pm-range:focus-visible::-moz-range-thumb {
    box-shadow: 0 0 0 5px rgb(var(--brand-rgb) / 0.22);
  }

  .pm-ticks {
    position: absolute;
    left: calc(var(--pm-thumb) / 2);
    right: calc(var(--pm-thumb) / 2);
    bottom: 0;
    height: 18px;
  }
  .pm-tick {
    position: absolute;
    left: calc(100% * var(--at));
    transform: translateX(-50%);
    padding: 1px 4px;
    border: none;
    border-radius: 5px;
    background: none;
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 400;
    color: var(--ink-faint);
    cursor: pointer;
    font-variant-numeric: tabular-nums;
    transition: color 0.12s ease;
  }
  .pm-tick:hover:not(:disabled) {
    color: var(--brand-text);
  }
  .pm-tick-on {
    color: var(--brand-text);
    font-weight: 600;
  }
  /* Curseur étroit (téléphone de 320 px) : ¼ et ½ n'ont plus 17 px entre
     eux, leurs libellés se touchent — ½ s'efface, la position reste au bout
     du doigt et des flèches. */
  @container pm-slider (max-width: 259px) {
    .pm-tick-minor {
      display: none;
    }
  }

  .pm-note {
    margin: -4px 0 0;
    font-size: 12px;
    font-weight: 300;
    line-height: 1.45;
    color: var(--ink-faint);
  }
  .pm-note-cap {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--warn-line);
    background: var(--warn-bg);
    color: var(--warn-text);
    font-weight: 400;
  }

  /* Compact (téléphone, panneau étroit) : feuilles réduites, et la note sur
     la mise en forme s'efface — secondaire, elle prenait deux lignes. Celle
     d'une réunion trop courte, elle, reste : elle dit où le résumé s'arrête. */
  @container pm (max-width: 400px) {
    .pm-body,
    .pm-sheets {
      min-height: 22px;
    }
    .pm-sheet {
      width: 16px;
      height: 22px;
      border-radius: 2px;
    }
    .pm-sheet-ink,
    .pm-sheet-ghost {
      left: 2px;
      right: 2px;
      top: 3px;
    }
    .pm-note:not(.pm-note-cap) {
      display: none;
    }
  }
  /* Très étroit (panneau serré entre deux colonnes) : sans l'icône, la valeur
     tient à côté du titre — avec elle, « 1 page » recouvrait « Pagimètre ». */
  @container pm (max-width: 280px) {
    .pm-head {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'title value'
        'sub sub';
    }
    .pm-icon {
      display: none;
    }
    .pm-value {
      min-width: 0;
      padding: 5px 10px;
      font-size: 14px;
    }
    .pm-figures {
      flex-wrap: wrap;
      white-space: normal;
    }
  }

  /* Au doigt : pouce agrandi. Les repères gardent une marge étroite — sur un
     téléphone de 375 px, ¼ et ½ ne sont qu'à 19 px l'un de l'autre, et des
     zones de tap qui se chevauchent rendraient le geste ambigu ; le curseur,
     lui, reste la vraie cible. */
  @media (pointer: coarse) {
    .pm {
      --pm-thumb: 28px;
    }
    .pm-tick {
      font-size: 12px;
      padding: 2px 3px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pm-sheet-ink,
    .pm-sheet-ghost,
    .pm-range::-webkit-slider-thumb {
      transition: none;
    }
  }
</style>
