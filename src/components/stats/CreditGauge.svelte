<script>
  /**
   * Cadran du crédit de temps — « Mes statistiques ».
   *
   * Un RÉSERVOIR : plein le 1er du mois, vide quand le crédit est épuisé, comme
   * l'anneau de l'avatar (ui/CreditAvatar.svelte). L'arc se remplit de ce qui RESTE ; sa
   * couleur suit la part restante (utils/creditTone.js, jetons `--credit-*`),
   * et la piste porte les mêmes zones en teinte légère : on voit où l'on est,
   * et où commence la zone suivante. Le chiffre est écrit au centre : la
   * couleur n'est jamais seule à dire combien il reste.
   *
   * Le CURSEUR est la poignée au bout de l'arc : elle marque ce qui reste, et
   * recule à mesure qu'on consomme. À l'ouverture, l'arc se remplit depuis zéro
   * jusqu'à sa valeur : la poignée se voit bouger. Une minute sur cinq heures
   * ne la déplace que d'un pixel — le chiffre au centre, lui, change.
   *
   * Le petit triangle posé HORS de l'arc est le RYTHME RÉGULIER : ce qu'il
   * resterait aujourd'hui si le crédit s'était consommé en ligne droite depuis
   * le 1er. Il ne bouge qu'avec la date. Il était d'abord un trait sombre en
   * travers de l'arc : à la recette, on l'a pris pour le curseur, « bloqué »
   * puisqu'il ne suivait pas la consommation. D'où sa forme discrète, à
   * l'extérieur, et une poignée nettement plus marquée.
   *
   * Géométrie fixe dans un `viewBox` : le cadran se met à l'échelle d'un bloc,
   * texte compris — rien n'y est mesuré, contrairement aux graphiques à axes.
   */
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { creditTone, CREDIT_ZONES } from '../../utils/creditTone.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { formatMinutes } from '../../utils/quotaFormat.js';

  export let limitSeconds = 0;
  export let remainingSeconds = 0;
  /** Part du crédit qui resterait au rythme régulier, ou null (pas de repère). */
  export let paceRatio = null;
  /** Textes `quota` (formats de durée) et `myStats` (libellés). */
  export let quotaTexts;
  export let texts;
  /** Balayage à l'ouverture et aux changements ; coupé sous `prefers-reduced-motion`. */
  export let animate = true;

  const reducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Part affichée : part de l'arc remplie, part où se pose la poignée.
  const shown = tweened(0, { duration: 0 });

  const CX = 120;
  const CY = 118;
  const R = 92;
  const START = 150; // degrés, sens horaire depuis l'axe x : bas gauche
  const SWEEP = 240;
  // L'arc de 150° à 390° : bas gauche → haut → bas droite.
  const ARC = `M${point(0, R).x} ${point(0, R).y} A${R} ${R} 0 1 1 ${point(1, R).x} ${point(1, R).y}`;

  function point(ratio, radius, shift = 0) {
    const angle = ((START + SWEEP * ratio + shift) * Math.PI) / 180;
    return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
  }

  /**
   * Triangle hors de l'arc, pointe vers la piste (le bord extérieur est à
   * R + 8). Étroit et long : presque équilatéral, il se lisait comme une
   * flèche le long de l'arc plutôt que vers lui.
   */
  function marker(ratio) {
    const tip = point(ratio, R + 10);
    const left = point(ratio, R + 23, -2.3);
    const right = point(ratio, R + 23, 2.3);
    return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
  }

  $: ratio = limitSeconds > 0 ? Math.max(0, Math.min(1, remainingSeconds / limitSeconds)) : 0;
  $: tone = creditTone(remainingSeconds, limitSeconds);
  $: exhausted = tone === 'out';
  $: shown.set(exhausted ? 0 : ratio, {
    duration: animate && !reducedMotion ? 900 : 0,
    easing: cubicOut,
  });
  $: knob = point($shown, R);
  $: pace = paceRatio === null || paceRatio === undefined ? null : marker(paceRatio);
  $: remainingLabel = formatMinutes(Math.floor(remainingSeconds / 60), quotaTexts);
  $: limitLabel = formatMinutes(Math.round(limitSeconds / 60), quotaTexts);
  $: ariaLabel = fill(texts.gaugeLabel, { remaining: remainingLabel, limit: limitLabel });
</script>

<svg class="cg cg-{tone}" viewBox="0 0 240 192" role="img" aria-label={ariaLabel}>
  <!-- Les zones, en teinte légère : vide → plein. Chacune déborde un peu sur la
       suivante, qui la recouvre : sans quoi l'arrondi des tirets laisse une
       fente claire à la jointure. -->
  {#each CREDIT_ZONES as [from, to, zone] (zone)}
    <path
      class="cg-zone cg-zone-{zone}"
      d={ARC}
      pathLength="100"
      stroke-dasharray="{(to - from) * 100 + (to < 1 ? 0.6 : 0)} 100"
      stroke-dashoffset={-from * 100}
    />
  {/each}
  {#if !exhausted}
    <path class="cg-fill" d={ARC} pathLength="100" stroke-dasharray="{$shown * 100} 100" />
  {/if}
  {#if pace}
    <polygon class="cg-pace" points={pace} />
  {/if}
  <!-- Le curseur : toujours là, au bout de ce qui reste — au départ de l'arc
       quand tout est consommé. -->
  <circle class="cg-knob" cx={knob.x} cy={knob.y} r="9" />
  {#if exhausted}
    <text class="cg-big cg-big-out" x={CX} y={CY - 2} text-anchor="middle">
      {texts.exhaustedBig}
    </text>
  {:else}
    <text class="cg-big" x={CX} y={CY - 4} text-anchor="middle">{remainingLabel}</text>
    <text class="cg-sub" x={CX} y={CY + 18} text-anchor="middle">
      {fill(texts.remainingOf, { limit: limitLabel })}
    </text>
  {/if}
  <text class="cg-scale" x={point(0, R).x} y="188" text-anchor="middle">0</text>
  <text class="cg-scale" x={point(1, R).x} y="188" text-anchor="middle">{limitLabel}</text>
</svg>

<style>
  .cg {
    --cg-color: var(--credit-high);
    display: block;
    width: 100%;
    max-width: 260px;
    margin: 0 auto;
    overflow: visible;
  }
  .cg-mid {
    --cg-color: var(--credit-mid);
  }
  .cg-low {
    --cg-color: var(--credit-low);
  }
  .cg-out {
    --cg-color: var(--credit-out);
  }
  /* Teintes OPAQUES (mêlées au fond, pas transparentes) : deux zones qui se
     touchent ne laissent pas de jointure plus foncée là où l'anticrénelage
     les superpose. */
  .cg-zone,
  .cg-fill {
    fill: none;
    stroke-width: 16;
  }
  .cg-zone-high {
    stroke: color-mix(in srgb, var(--credit-high) 20%, var(--surface));
  }
  .cg-zone-mid {
    stroke: color-mix(in srgb, var(--credit-mid) 24%, var(--surface));
  }
  .cg-zone-low {
    stroke: color-mix(in srgb, var(--credit-low) 24%, var(--surface));
  }
  .cg-out .cg-zone {
    stroke: color-mix(in srgb, var(--credit-out) 18%, var(--surface));
  }
  .cg-fill {
    stroke: var(--cg-color);
    transition: stroke 0.3s;
  }
  .cg-knob {
    fill: var(--surface);
    stroke: var(--cg-color);
    stroke-width: 4;
    filter: drop-shadow(0 1px 2px color-mix(in srgb, var(--ink) 30%, transparent));
  }
  .cg-pace {
    fill: var(--ink-faint);
  }
  .cg-big {
    font-family: inherit;
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.02em;
    fill: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .cg-big-out {
    fill: var(--credit-out);
    font-size: 26px;
  }
  .cg-sub {
    font-family: inherit;
    font-size: 11.5px;
    fill: var(--ink-muted);
  }
  .cg-scale {
    font-family: inherit;
    font-size: 10px;
    fill: var(--ink-faint);
  }
  @media (prefers-reduced-motion: reduce) {
    .cg-fill {
      transition: none;
    }
  }
</style>
