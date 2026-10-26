<script>
  /**
   * Colonnes — une série, une valeur par période.
   *
   * SVG écrit à la main : le projet n'embarque aucune librairie de graphiques et
   * n'en ajoute pas une (~200 Ko) pour cinq figures. La géométrie est calculée
   * en pixels réels à partir de la largeur mesurée du conteneur, pas dans un
   * `viewBox` étiré : un viewBox mis à l'échelle déformerait le texte des axes.
   *
   * TOUTE la géométrie sort d'UNE dérivation `$: geometry = layout(points,
   * width, height, max, ticks)` qui NOMME ses dépendances. Écrire `d={barPath(
   * point.value, index)}` dans le gabarit ne marche pas : Svelte n'invalide
   * l'expression que sur les identifiants qu'il y voit — la largeur mesurée
   * n'en fait pas partie, et les colonnes restent dessinées à la taille du
   * montage pendant que les axes, eux, suivent (bug vu à la recette : toutes les
   * barres tassées dans le quart gauche du cadre).
   *
   * Spécifications tenues : colonnes ≤ 24 px, sommet arrondi 4 px et pied carré
   * sur la ligne de base, 2 px de fond entre deux colonnes voisines (c'est le
   * VIDE qui sépare, jamais un contour), grille en filets pleins d'un ton au-
   * dessus du fond, valeur affichée seulement sur l'extremum.
   */
  export let points = [];
  /** Couleur des marques. Le texte, lui, garde les encres — jamais la couleur de série. */
  export let color = 'var(--viz-series-1)';
  export let formatValue = (value) => String(value);
  export let formatTick = (value) => String(value);
  export let ticks = [];
  export let max = 1;
  export let height = 190;
  export let ariaLabel = '';
  /**
   * Encombrement d'une étiquette d'axe, en pixels. Une étiquette est posée tous
   * les `ceil(labelWidth / bande)` points : 52 px pour des dates (« 19/07 »),
   * beaucoup moins pour trois lettres — sinon un axe de jours de semaine
   * n'afficherait qu'un jour sur deux alors que les sept tiennent largement.
   */
  export let labelWidth = 52;

  const PAD = { top: 18, right: 6, bottom: 22, left: 38 };
  const MAX_BAR = 24;

  let width = 0;
  let hovered = -1;

  /** Colonne à sommet arrondi et pied carré — le pied reste posé sur l'axe. */
  function barPath(left, top, bottom, barWidth) {
    const h = bottom - top;
    if (h <= 0.5) return '';
    const r = Math.min(4, barWidth / 2, h);
    return `M${left} ${bottom} L${left} ${top + r} Q${left} ${top} ${left + r} ${top} L${left + barWidth - r} ${top} Q${left + barWidth} ${top} ${left + barWidth} ${top + r} L${left + barWidth} ${bottom} Z`;
  }

  /** Géométrie complète du cadre. Pure : tout ce dont elle dépend est un argument. */
  function layout(list, w, h, ceiling, tickValues, labelPitch) {
    const plotWidth = Math.max(0, w - PAD.left - PAD.right);
    const plotHeight = Math.max(0, h - PAD.top - PAD.bottom);
    const baseline = PAD.top + plotHeight;
    const band = list.length ? plotWidth / list.length : 0;
    // 2 px de fond entre deux colonnes ; le plafond de 24 px laisse respirer les
    // séries courtes au lieu de remplir la bande.
    const barWidth = Math.max(2, Math.min(MAX_BAR, band - 2));
    const y = (value) => baseline - (Math.max(0, value) / (ceiling || 1)) * plotHeight;
    // Une étiquette tous les N libellés : au-delà, l'axe se chevauche. Le premier
    // et le dernier sont toujours posés, ce sont les bornes de la période.
    const labelStep = band > 0 ? Math.max(1, Math.ceil(labelPitch / band)) : 1;
    let peak = 0;
    list.forEach((point, index) => {
      if (point.value > (list[peak]?.value ?? -1)) peak = index;
    });

    const bars = list.map((point, index) => {
      const left = PAD.left + index * band + (band - barWidth) / 2;
      return {
        key: point.key,
        point,
        d: barPath(left, y(point.value), baseline, barWidth),
        center: left + barWidth / 2,
        top: y(point.value),
        hitX: PAD.left + index * band,
        hitWidth: Math.max(band, 1),
        showLabel: index % labelStep === 0 || index === list.length - 1,
        isPeak: index === peak && point.value > 0,
      };
    });

    return {
      bars,
      plotHeight,
      baseline,
      right: Math.max(w - PAD.right, PAD.left),
      ticks: (tickValues || []).map((value) => ({ value, y: y(value) })),
    };
  }

  /**
   * Clavier : UN seul arrêt de tabulation par graphique, puis les flèches pour
   * parcourir les points. Une zone sensible focalisable par colonne donnerait
   * trente et un arrêts pour un mois — traverser la page au clavier deviendrait
   * interminable. La valeur du point atteint est annoncée par la zone `polite`
   * en fin de composant.
   */
  function onKeydown(event) {
    const lastIndex = points.length - 1;
    if (lastIndex < 0) return;
    const moves = {
      ArrowRight: Math.min((hovered < 0 ? -1 : hovered) + 1, lastIndex),
      ArrowLeft: Math.max((hovered < 0 ? lastIndex + 1 : hovered) - 1, 0),
      Home: 0,
      End: lastIndex,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    hovered = moves[event.key];
  }

  // Série remplacée = index survolé périmé. Sans cette remise à zéro, revenir de
  // « 30 jours » à « 7 jours » après avoir survolé le 31e point laissait un
  // index hors bornes : plus aucune colonne « active », donc TOUTES en retrait
  // et aucune infobulle (vu à la recette).
  $: (points, (hovered = -1));

  $: geometry = layout(points, width, height, max, ticks, labelWidth);
  $: tooltip =
    hovered >= 0 && geometry.bars[hovered]
      ? {
          left: Math.min(Math.max(geometry.bars[hovered].center, 70), Math.max(width - 70, 70)),
          point: geometry.bars[hovered].point,
        }
      : null;
</script>

<div class="cx-wrap" bind:clientWidth={width} style="--cx-color: {color}">
  {#if width > 0}
    <svg
      {width}
      {height}
      role="img"
      aria-label={ariaLabel}
      tabindex="0"
      on:pointerleave={() => (hovered = -1)}
      on:keydown={onKeydown}
      on:blur={() => (hovered = -1)}
    >
      <!-- Grille : filets pleins (jamais pointillés) d'un ton au-dessus du fond. -->
      {#each geometry.ticks as tick (tick.value)}
        <line
          class="cx-grid"
          class:cx-axis={tick.value === 0}
          x1={PAD.left}
          x2={geometry.right}
          y1={tick.y}
          y2={tick.y}
        />
        <text class="cx-tick" x={PAD.left - 8} y={tick.y + 3.5} text-anchor="end">
          {formatTick(tick.value)}
        </text>
      {/each}

      {#each geometry.bars as bar, index (bar.key)}
        <path class="cx-bar" class:cx-bar-dim={hovered >= 0 && hovered !== index} d={bar.d} />
      {/each}

      <!-- Valeur de l'extremum : une seule étiquette directe, jamais une par
           colonne (une valeur sur chaque point ne se lit plus). -->
      {#each geometry.bars as bar (bar.key)}
        {#if bar.isPeak}
          <text class="cx-peak" x={bar.center} y={bar.top - 6} text-anchor="middle">
            {formatValue(bar.point.value)}
          </text>
        {/if}
      {/each}

      {#each geometry.bars as bar (bar.key)}
        {#if bar.showLabel}
          <text class="cx-label" x={bar.center} y={height - 6} text-anchor="middle">
            {bar.point.label}
          </text>
        {/if}
      {/each}

      <!-- Zone sensible : toute la bande, pas la colonne peinte. Une barre de
           3 px de large serait injoignable au pointeur. -->
      {#each geometry.bars as bar, index (bar.key)}
        <rect
          class="cx-hit"
          x={bar.hitX}
          y={PAD.top}
          width={bar.hitWidth}
          height={geometry.plotHeight}
          on:pointerenter={() => (hovered = index)}
        />
      {/each}
    </svg>

    {#if tooltip}
      <div class="cx-tip" style="left: {tooltip.left}px" aria-hidden="true">
        <strong>{formatValue(tooltip.point.value)}</strong>
        <span>{tooltip.point.longLabel || tooltip.point.label}</span>
      </div>
    {/if}

    <p class="cx-live" aria-live="polite">
      {tooltip
        ? `${tooltip.point.longLabel || tooltip.point.label} : ${formatValue(tooltip.point.value)}`
        : ''}
    </p>
  {/if}
</div>

<style>
  .cx-wrap {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
  }
  svg:focus-visible {
    outline: 2px solid var(--brand-text);
    outline-offset: 2px;
    border-radius: 6px;
  }

  /* Annonce du point atteint aux flèches — hors écran, jamais masquée par
     `display:none` (les lecteurs d'écran ignorent ce qui n'est pas rendu). */
  .cx-live {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .cx-grid {
    stroke: var(--viz-grid);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .cx-axis {
    stroke: var(--viz-axis);
  }
  .cx-tick,
  .cx-label {
    fill: var(--viz-ink-muted);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }
  .cx-peak {
    fill: var(--ink-soft);
    font-size: 11px;
    font-weight: 600;
  }

  .cx-bar {
    fill: var(--cx-color);
    transition: opacity 0.12s;
  }
  .cx-bar-dim {
    opacity: 0.42;
  }

  .cx-hit {
    fill: transparent;
    cursor: default;
  }

  .cx-tip {
    position: absolute;
    top: -2px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    padding: 0.35rem 0.6rem;
    border-radius: 8px;
    background: var(--ink);
    color: #fff;
    font-size: 0.74rem;
    line-height: 1.35;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 6px 18px -8px color-mix(in srgb, var(--ink) 55.00000000000001%, transparent);
    z-index: 2;
  }
  /* La valeur mène, le libellé suit : ici le lecteur a la période, il veut le nombre. */
  .cx-tip strong {
    font-size: 0.86rem;
    font-weight: 600;
  }
  .cx-tip span {
    opacity: 0.75;
  }
</style>
