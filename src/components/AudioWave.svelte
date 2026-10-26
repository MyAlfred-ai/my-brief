<script context="module">
  /**
   * Trace partagée entre les montages : le dock démonte l'onde à la pause et
   * la remonte à la reprise — la trace continue au lieu de repartir de zéro.
   * Réinitialisée quand l'analyser change : App en crée un par réunion.
   */
  import { createHistory, createLevelTracker, rmsOfBytes, STEP_MS } from '../utils/waveHistory.js';

  let sharedAnalyser = null;
  const history = createHistory();
  let tracker = createLevelTracker();
</script>

<script>
  /**
   * Onde sonore — la trace du son qui défile, comme un mémo vocal.
   *
   * Chaque STEP_MS, une barre naît au bord droit avec le niveau du moment ;
   * les précédentes glissent vers la gauche et s'estompent avant de sortir.
   * On lit ainsi ce qui vient de se passer — un silence, une prise de parole,
   * une voix qui monte — là où l'ancien spectre symétrique, figé au centre,
   * ne montrait que l'instant. Le calcul du niveau (RMS, auto-gain, gate)
   * vit dans utils/waveHistory.js ; ici, le rythme et le rendu.
   *
   * Le glissement : entre deux barres, la piste est décalée de la fraction
   * du pas restante (translateX, GPU) — la barre neuve entre par la droite au
   * lieu de sauter d'un cran. Sous prefers-reduced-motion, elle saute.
   *
   * Le conteneur donne la largeur (la piste, ancrée à droite, déborde à
   * gauche, coupée) et la hauteur des barres (.wave-bar : 34 px dans le dock,
   * 22 px dans la barre du téléphone) ; l'amplitude est un scaleY par barre.
   * Sans analyser (micro pas encore ouvert, test) : des barres CSS ondulent
   * à hauteurs fixes.
   */
  import { onDestroy } from 'svelte';

  export let analyser = null;
  /** Tourne seulement quand c'est vrai (pas pendant la pause). */
  export let active = false;
  /** Nom pour le lecteur d'écran (role img). */
  export let label = '';

  // Fallback (pas d'analyser) : barres CSS animées, hauteurs fixes
  const fallbackBars = [6, 12, 18, 14, 22, 16, 24, 20, 26, 22, 26, 20, 24, 16, 22, 14, 18, 12, 6];

  /** Largeur d'un pas à l'écran : 2 px de barre + 2 px d'espace. */
  const SLOT = 4;
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let bars = history.items;
  let shift = 0; // px : glissement entre deux pas
  let timeData = null;
  let hold = 0; // pic du pas en cours
  let lastPush = 0;
  let rafId = null;

  function frame(now) {
    rafId = null;
    if (!active || !analyser) return;
    if (!timeData || timeData.length !== analyser.fftSize) {
      timeData = new Uint8Array(analyser.fftSize);
    }
    analyser.getByteTimeDomainData(timeData);
    hold = Math.max(hold, tracker.next(rmsOfBytes(timeData)));
    if (!lastPush) lastPush = now;
    if (now - lastPush >= STEP_MS) {
      bars = history.push(hold);
      hold = 0;
      lastPush = now;
    }
    shift = reduceMotion ? 0 : (1 - Math.min(1, (now - lastPush) / STEP_MS)) * SLOT;
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (analyser !== sharedAnalyser) {
      sharedAnalyser = analyser;
      bars = history.reset();
      tracker = createLevelTracker();
    }
    lastPush = 0;
    hold = 0;
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }
  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
  onDestroy(stop);

  $: if (active && analyser) start();
  else stop();
</script>

<div class="wave" role="img" aria-label={label}>
  {#if analyser}
    <div class="wave-track" style="transform:translateX({shift.toFixed(2)}px)">
      {#each bars as b (b.id)}
        <div class="wave-bar" style="transform:scaleY({(0.08 + b.v * 0.92).toFixed(3)})"></div>
      {/each}
    </div>
  {:else}
    <div class="wave-track wave-track-css">
      {#each fallbackBars as h, i}
        <div class="wave-bar wave-bar-css" style="height:{h}px;animation-delay:{i * 0.06}s"></div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wave {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    /* Les barres les plus anciennes s'estompent avant de sortir à gauche. */
    -webkit-mask-image: linear-gradient(to right, transparent, #000 28%);
    mask-image: linear-gradient(to right, transparent, #000 28%);
  }
  /* Ancrée à droite : la barre neuve est toujours au bord, le surplus
     déborde à gauche, coupé par le conteneur. */
  .wave-track {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    will-change: transform;
  }
  /* Fallback : centré, sans défilement. */
  .wave-track-css {
    left: 0;
    justify-content: center;
  }
  /* Hauteur = amplitude maximale (surchargée par la barre du téléphone) ;
     l'amplitude réelle est un scaleY par barre — pas de transition : c'est
     l'historique qui bouge, pas la barre. */
  .wave-bar {
    width: 2px;
    height: 34px;
    max-height: 100%;
    flex: none;
    background: linear-gradient(
      to top,
      color-mix(in srgb, var(--brand) 83.9%, #ffffff),
      color-mix(in srgb, var(--brand) 36.9%, #ffffff)
    );
    border-radius: 999px;
    transform: scaleY(0.08);
    transform-origin: center;
    will-change: transform;
  }
  /* Fallback sans analyser : ondulation CSS, hauteurs inline */
  .wave-bar-css {
    animation: wave 1.2s ease-in-out infinite;
    opacity: 0.7;
  }
  @keyframes wave {
    0%,
    100% {
      transform: scaleY(0.6);
    }
    50% {
      transform: scaleY(1);
    }
  }
</style>
