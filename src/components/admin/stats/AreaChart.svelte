<script>
  /**
   * Aire — une seule série continue dans le temps (le temps enregistré).
   *
   * Une deuxième série n'entrera JAMAIS ici avec sa propre échelle : deux axes
   * verticaux sur un même cadre inventent une corrélation que les données ne
   * portent pas. Deux mesures = deux graphiques alignés sur le même axe des
   * abscisses — c'est la raison d'être de ce composant à côté de ColumnChart.
   *
   * Comme ColumnChart, toute la géométrie sort d'UNE dérivation qui nomme ses
   * dépendances : un chemin construit par une fonction appelée depuis le gabarit
   * ne se recalculerait pas quand la largeur mesurée change.
   *
   * Trait 2 px, remplissage à 10 % (un lavis, jamais un aplat), point final
   * cerné de 2 px de fond pour rester lisible sur la ligne.
   */
  export let points = [];
  export let color = 'var(--viz-series-2)';
  export let formatValue = (value) => String(value);
  export let formatTick = (value) => String(value);
  export let ticks = [];
  export let max = 1;
  export let height = 190;
  export let ariaLabel = '';

  const PAD = { top: 18, right: 10, bottom: 22, left: 44 };

  let width = 0;
  let hovered = -1;

  function layout(list, w, h, ceiling, tickValues) {
    const plotWidth = Math.max(0, w - PAD.left - PAD.right);
    const plotHeight = Math.max(0, h - PAD.top - PAD.bottom);
    const baseline = PAD.top + plotHeight;
    const step = list.length > 1 ? plotWidth / (list.length - 1) : 0;
    const x = (index) => (list.length > 1 ? PAD.left + index * step : PAD.left + plotWidth / 2);
    const y = (value) => baseline - (Math.max(0, value) / (ceiling || 1)) * plotHeight;
    const labelStep = step > 0 ? Math.max(1, Math.ceil(52 / step)) : 1;
    // Zone sensible d'au moins 24 px : le lecteur vise une DATE, jamais un trait.
    const hitWidth = Math.max(step, 24);

    const nodes = list.map((point, index) => ({
      key: point.key,
      point,
      x: x(index),
      y: y(point.value),
      hitX: x(index) - hitWidth / 2,
      showLabel: index % labelStep === 0 || index === list.length - 1,
    }));
    const line = nodes.map((node, index) => `${index ? 'L' : 'M'}${node.x} ${node.y}`).join(' ');

    return {
      nodes,
      line,
      area: nodes.length
        ? `${line} L${nodes[nodes.length - 1].x} ${baseline} L${nodes[0].x} ${baseline} Z`
        : '',
      hitWidth,
      plotHeight,
      baseline,
      right: Math.max(w - PAD.right, PAD.left),
      ticks: (tickValues || []).map((value) => ({ value, y: y(value) })),
    };
  }

  /** Clavier : un seul arrêt de tabulation, flèches pour parcourir (cf. ColumnChart). */
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

  // Série remplacée = index survolé périmé (cf. ColumnChart).
  $: (points, (hovered = -1));

  $: geometry = layout(points, width, height, max, ticks);
  $: active = hovered >= 0 ? geometry.nodes[hovered] : null;
  $: last = geometry.nodes.length ? geometry.nodes[geometry.nodes.length - 1] : null;
  $: tooltip = active
    ? { left: Math.min(Math.max(active.x, 70), Math.max(width - 70, 70)), point: active.point }
    : null;
</script>

<div class="ax-wrap" bind:clientWidth={width} style="--ax-color: {color}">
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
      {#each geometry.ticks as tick (tick.value)}
        <line
          class="ax-grid"
          class:ax-axis={tick.value === 0}
          x1={PAD.left}
          x2={geometry.right}
          y1={tick.y}
          y2={tick.y}
        />
        <text class="ax-tick" x={PAD.left - 8} y={tick.y + 3.5} text-anchor="end">
          {formatTick(tick.value)}
        </text>
      {/each}

      <path class="ax-area" d={geometry.area} />
      <path class="ax-line" d={geometry.line} />

      {#if active}
        <line class="ax-cross" x1={active.x} x2={active.x} y1={PAD.top} y2={geometry.baseline} />
        <circle class="ax-dot" cx={active.x} cy={active.y} r="4.5" />
      {:else if last}
        <circle class="ax-dot" cx={last.x} cy={last.y} r="4.5" />
      {/if}

      {#each geometry.nodes as node (node.key)}
        {#if node.showLabel}
          <text class="ax-label" x={node.x} y={height - 6} text-anchor="middle">
            {node.point.label}
          </text>
        {/if}
      {/each}

      {#each geometry.nodes as node, index (node.key)}
        <rect
          class="ax-hit"
          x={node.hitX}
          y={PAD.top}
          width={geometry.hitWidth}
          height={geometry.plotHeight}
          on:pointerenter={() => (hovered = index)}
        />
      {/each}
    </svg>

    {#if tooltip}
      <div class="ax-tip" style="left: {tooltip.left}px" aria-hidden="true">
        <strong>{formatValue(tooltip.point.value)}</strong>
        <span>{tooltip.point.longLabel || tooltip.point.label}</span>
      </div>
    {/if}

    <p class="ax-live" aria-live="polite">
      {tooltip
        ? `${tooltip.point.longLabel || tooltip.point.label} : ${formatValue(tooltip.point.value)}`
        : ''}
    </p>
  {/if}
</div>

<style>
  .ax-wrap {
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

  /* Annonce du point atteint aux flèches (hors écran, jamais display:none). */
  .ax-live {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .ax-grid {
    stroke: var(--viz-grid);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .ax-axis {
    stroke: var(--viz-axis);
  }
  .ax-tick,
  .ax-label {
    fill: var(--viz-ink-muted);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

  .ax-area {
    fill: var(--ax-color);
    opacity: 0.1;
  }
  .ax-line {
    fill: none;
    stroke: var(--ax-color);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .ax-cross {
    stroke: var(--viz-axis);
    stroke-width: 1;
  }
  /* Anneau de 2 px en couleur de fond : le point reste lisible là où il croise
     la ligne ou le bord de l'aire. */
  .ax-dot {
    fill: var(--ax-color);
    stroke: var(--surface);
    stroke-width: 2;
  }

  .ax-hit {
    fill: transparent;
  }

  .ax-tip {
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
  .ax-tip strong {
    font-size: 0.86rem;
    font-weight: 600;
  }
  .ax-tip span {
    opacity: 0.75;
  }
</style>
