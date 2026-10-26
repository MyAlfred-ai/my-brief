<script>
  /**
   * « Au fil du mois » — ce qu'il reste du crédit, jour après jour.
   *
   * La courbe DESCEND, comme la jauge se vide : les deux lisent « ce qui
   * reste ». La diagonale pointillée est le rythme régulier (le crédit
   * consommé en ligne droite du 1er au renouvellement) ; l'écart entre la
   * courbe et elle est l'avance, ou le retard, sur le mois. Les week-ends sont
   * grisés : ils expliquent les paliers. La projection jusqu'à zéro n'est
   * tracée que lorsque le serveur l'annonce (`pace.alert`, au-delà de 15
   * points d'avance) — la même règle que la phrase sous la jauge.
   *
   * La courbe prend la couleur de la jauge (son ton) : vert, ambre, orange
   * ou rouge, le même code au-dessus et au-dessous.
   *
   * Comme ColumnChart : la géométrie est calculée en pixels réels à partir de
   * la largeur mesurée, dans UNE dérivation qui nomme toutes ses dépendances
   * (`$: geometry = layout(…)`) — sinon la largeur mesurée n'invalide rien.
   */
  import { formatMinutes, formatDay, civilDay } from '../../utils/quotaFormat.js';
  import { fill } from '../../utils/i18nFormat.js';

  /** Consommation jour par jour (serveur) : `[{date, usedSeconds}]`. */
  export let days = [];
  export let limitSeconds = 0;
  /** `{start, end, timeZone}` du mois du crédit. */
  export let period;
  /** `{expectedRemainingSeconds, exhaustsAt, alert}` ou null. */
  export let pace = null;
  /** Secondes à ajouter aujourd'hui : la réunion en cours, ou une relecture plus fraîche. */
  export let extraSeconds = 0;
  export let now = new Date();
  export let quotaTexts;
  export let texts;
  export let lang = 'fr';
  /** Ton du crédit (utils/creditTone.js) : la courbe prend la couleur de la jauge. */
  export let tone = 'high';
  export let height = 230;

  const PAD = { top: 24, right: 14, bottom: 24, left: 50 };
  const STEPS = [15, 30, 60, 120, 180, 300, 600, 1200, 3000, 6000, 12000];

  let width = 0;

  const clamp = (value) => Math.max(0, Math.min(1, value));

  function layout(list, w, h, limit, range, rhythm, extra, nowMs, tz) {
    const plotWidth = Math.max(0, w - PAD.left - PAD.right);
    const plotHeight = Math.max(0, h - PAD.top - PAD.bottom);
    const right = PAD.left + plotWidth;
    const baseline = PAD.top + plotHeight;
    const count = list.length || 1;
    const start = Date.parse(range.start);
    const end = Date.parse(range.end);
    const xAt = (ms) => PAD.left + clamp((ms - start) / (end - start)) * plotWidth;
    const xDay = (index) => PAD.left + (index / count) * plotWidth;
    const y = (seconds) => baseline - clamp(seconds / (limit || 1)) * plotHeight;

    // Aujourd'hui : son jour civil dans le fuseau du crédit.
    const todayKey = civilDay(new Date(nowMs), tz);
    let today = list.findIndex((day) => day.date === todayKey);
    if (today < 0) today = nowMs >= end ? count - 1 : 0;

    let used = 0;
    const points = [[PAD.left, y(limit)]];
    for (let index = 0; index <= today && index < list.length; index += 1) {
      const dayUsed = list[index].usedSeconds + (index === today ? extra : 0);
      used += dayUsed;
      const isToday = index === today;
      points.push([isToday ? xAt(nowMs) : xDay(index + 1), y(limit - used)]);
    }
    const nowX = points[points.length - 1][0];
    const remaining = Math.max(0, limit - used);
    const nowY = y(remaining);
    const line = points.map(([px, py]) => `${px},${py}`).join(' ');
    const area = `M${PAD.left} ${baseline} L${points.map(([px, py]) => `${px} ${py}`).join(' L')} L${nowX} ${baseline} Z`;

    const paceY = rhythm ? y(rhythm.expectedRemainingSeconds) : null;
    const projection =
      rhythm?.alert && rhythm.exhaustsAt
        ? { x: xAt(Date.parse(rhythm.exhaustsAt)), y: baseline, date: rhythm.exhaustsAt }
        : null;

    const weekends = list
      .map((day, index) => ({ day, index }))
      .filter(({ day }) => [0, 6].includes(new Date(`${day.date}T12:00:00Z`).getUTCDay()))
      .map(({ index, day }) => ({ key: day.date, x: xDay(index), width: plotWidth / count }));

    const limitMinutes = Math.round(limit / 60);
    const step = STEPS.find((candidate) => limitMinutes / candidate <= 5) || STEPS.at(-1);
    const ticks = [];
    for (let minutes = 0; minutes <= limitMinutes; minutes += step) ticks.push(minutes);
    if (ticks.at(-1) !== limitMinutes) ticks.push(limitMinutes);

    const labelDays = [...new Set([1, 5, 10, 15, 20, 25, list.length])].filter(
      (day) => day <= list.length,
    );

    // Étiquettes du jour, chacune du côté où aucun trait ne passe. En avance,
    // la projection part en bas à droite et la diagonale monte à gauche : le
    // reste se lit en bas à gauche, le rythme en haut à droite. En retard, la
    // courbe arrive d'en haut à gauche : le reste en haut à droite, le rythme
    // en bas à gauche. Près du bord droit, tout passe à gauche.
    const ahead = paceY !== null && nowY > paceY;
    const flip = nowX > right - 150;
    const side = (wanted) => {
      const left = flip || wanted === 'left';
      return { x: left ? nowX - 8 : nowX + 8, anchor: left ? 'end' : 'start' };
    };
    const remainingSide = side(ahead ? 'left' : 'right');
    const paceSide = side(ahead ? 'right' : 'left');
    return {
      right,
      baseline,
      line,
      area,
      nowX,
      nowY,
      remaining,
      paceY,
      projection,
      weekends,
      remainingLabel: { ...remainingSide, y: ahead ? nowY + 16 : nowY - 8 },
      // Graphique étroit (téléphone) : la valeur du rythme régulier est déjà
      // sous la jauge, son étiquette déborderait sur l'axe — le point suffit.
      paceLabel:
        paceY === null || plotWidth < 420
          ? null
          : { ...paceSide, y: ahead ? paceY - 8 : paceY + 16 },
      // La date d'épuisement se pose à droite de la fin de la projection quand
      // elle y tient ; sinon la légende la porte.
      projectionLabelFits: projection ? projection.x + 150 < right : false,
      ticks: ticks.map((minutes) => ({ minutes, y: y(minutes * 60) })),
      labels: labelDays.map((day) => ({ day, x: PAD.left + ((day - 0.5) / count) * plotWidth })),
    };
  }

  $: geometry = layout(
    days,
    width,
    height,
    limitSeconds,
    period,
    pace,
    extraSeconds,
    now.getTime(),
    period?.timeZone || 'UTC',
  );
  $: tz = period?.timeZone || 'UTC';
  $: projectionText = geometry.projection
    ? fill(texts.projectionLabel, {
        date: formatDay(geometry.projection.date, lang, { timeZone: tz, month: 'short' }),
      })
    : '';
  $: ariaLabel = `${texts.chartCredit} : ${formatMinutes(Math.floor(geometry.remaining / 60), quotaTexts)}`;
</script>

<div class="cc-wrap" bind:clientWidth={width} style="--cc-color: var(--credit-{tone})">
  {#if width > 0}
    <svg {width} {height} role="img" aria-label={ariaLabel}>
      {#each geometry.weekends as band (band.key)}
        <rect
          class="cc-weekend"
          x={band.x}
          y={PAD.top}
          width={band.width}
          height={geometry.baseline - PAD.top}
        />
      {/each}
      {#each geometry.ticks as tick (tick.minutes)}
        <line class="cc-grid" x1={PAD.left} x2={geometry.right} y1={tick.y} y2={tick.y} />
        <text class="cc-tick" x={PAD.left - 8} y={tick.y + 3.5} text-anchor="end">
          {formatMinutes(tick.minutes, quotaTexts)}
        </text>
      {/each}
      {#each geometry.labels as label (label.day)}
        <text class="cc-tick" x={label.x} y={height - 6} text-anchor="middle">{label.day}</text>
      {/each}

      <line class="cc-pace" x1={PAD.left} y1={PAD.top} x2={geometry.right} y2={geometry.baseline} />
      <path class="cc-area" d={geometry.area} />
      <polyline class="cc-line" points={geometry.line} />

      <line
        class="cc-today"
        x1={geometry.nowX}
        x2={geometry.nowX}
        y1={PAD.top - 6}
        y2={geometry.baseline}
      />
      <text class="cc-note" x={geometry.nowX} y={PAD.top - 10} text-anchor="middle"
        >{texts.today}</text
      >

      {#if geometry.projection}
        <line
          class="cc-projection"
          x1={geometry.nowX}
          y1={geometry.nowY}
          x2={geometry.projection.x}
          y2={geometry.projection.y}
        />
        <circle class="cc-end" cx={geometry.projection.x} cy={geometry.projection.y} r="4" />
        {#if geometry.projectionLabelFits}
          <text class="cc-proj-label" x={geometry.projection.x + 8} y={geometry.projection.y - 8}>
            {projectionText}
          </text>
        {/if}
      {/if}

      {#if geometry.paceY !== null}
        <circle class="cc-pace-dot" cx={geometry.nowX} cy={geometry.paceY} r="3.2" />
      {/if}
      {#if geometry.paceLabel}
        <text
          class="cc-note"
          x={geometry.paceLabel.x}
          y={geometry.paceLabel.y}
          text-anchor={geometry.paceLabel.anchor}
        >
          {fill(texts.legendPace, {
            value: formatMinutes(Math.floor(pace.expectedRemainingSeconds / 60), quotaTexts),
          })}
        </text>
      {/if}
      <circle class="cc-now" cx={geometry.nowX} cy={geometry.nowY} r="5" />
      <text
        class="cc-value"
        x={geometry.remainingLabel.x}
        y={geometry.remainingLabel.y}
        text-anchor={geometry.remainingLabel.anchor}
      >
        {formatMinutes(Math.floor(geometry.remaining / 60), quotaTexts)}
      </text>
    </svg>
  {/if}
</div>
<div class="cc-legend" aria-hidden="true" style="--cc-color: var(--credit-{tone})">
  <span><i class="cc-key cc-key-line"></i>{texts.legendRemaining}</span>
  <span><i class="cc-key cc-key-pace"></i>{texts.legendPaceLine}</span>
  {#if geometry.projection}
    <span
      ><i class="cc-key cc-key-proj"></i>{texts.legendProjection}{#if !geometry.projectionLabelFits}
        · {projectionText}{/if}</span
    >
  {/if}
  <span><i class="cc-key cc-key-weekend"></i>{texts.legendWeekend}</span>
</div>

<style>
  .cc-wrap {
    position: relative;
    width: 100%;
    min-height: 1px;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .cc-weekend {
    fill: color-mix(in srgb, var(--ink) 3%, transparent);
  }
  .cc-grid {
    stroke: var(--viz-grid);
    stroke-width: 1;
  }
  .cc-tick {
    font-family: inherit;
    font-size: 10.5px;
    fill: var(--viz-ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .cc-pace {
    stroke: var(--ink-faint);
    stroke-width: 1.4;
    stroke-dasharray: 4 4;
  }
  .cc-area {
    fill: color-mix(in srgb, var(--cc-color) 13%, transparent);
  }
  .cc-line {
    fill: none;
    stroke: var(--cc-color);
    stroke-width: 2.4;
    stroke-linejoin: round;
  }
  .cc-today {
    stroke: var(--ink-faint);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .cc-projection {
    stroke: var(--credit-low);
    stroke-width: 1.8;
    stroke-dasharray: 5 4;
  }
  .cc-end {
    fill: var(--surface);
    stroke: var(--credit-low);
    stroke-width: 2;
  }
  .cc-proj-label {
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    fill: var(--warn-text);
  }
  .cc-pace-dot {
    fill: var(--ink-faint);
  }
  .cc-now {
    fill: var(--cc-color);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .cc-note {
    font-family: inherit;
    font-size: 10.5px;
    fill: var(--ink-muted);
  }
  .cc-value {
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 600;
    fill: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .cc-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin-top: 0.4rem;
    font-size: 0.72rem;
    color: var(--ink-muted);
  }
  .cc-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .cc-key {
    display: inline-block;
    width: 18px;
    height: 0;
    border-top: 2.4px solid var(--cc-color);
  }
  .cc-key-pace {
    border-top: 1.6px dashed var(--ink-faint);
  }
  .cc-key-proj {
    border-top: 1.8px dashed var(--credit-low);
  }
  .cc-key-weekend {
    width: 12px;
    height: 10px;
    border: none;
    border-radius: 2px;
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
</style>
