<script>
  /**
   * Le minuteur de l'Aide IA — une capsule au-dessus de la transcription, tant
   * qu'un décompte tourne : l'anneau qui se vide, le temps qui reste, à quoi il
   * sert, et un bouton pour l'arrêter.
   *
   * On le DEMANDE à l'IA (« Alfred, lance un minuteur de cinq minutes »,
   * « ajoute-lui deux minutes », « arrête le minuteur ») : l'écran n'a pas de
   * quoi le régler, seulement de quoi l'arrêter — le bouton reste le seul
   * recours quand la réunion est en pause, micro coupé.
   *
   * ── Pourquoi une capsule à part, et pas une carte de la scène ────────────────
   * La scène ne montre qu'UNE intervention, et se ferme d'un geste : un
   * décompte de dix minutes y aurait disparu à la première question posée.
   * Lui reste, quoi que fasse la fenêtre de l'IA — en haut, à l'opposé d'elle.
   *
   * ── Dans le flux, pas par-dessus ─────────────────────────────────────────────
   * Posée en surimpression au coin de la transcription, elle masquait la fin
   * des lignes qui passaient dessous (vu à la première capture). Elle occupe
   * donc sa propre rangée, entre l'en-tête de la réunion et la transcription,
   * qui cède sa hauteur le temps du décompte : rien n'est jamais recouvert.
   * LiveTranscript recolle la vue au direct quand la rangée apparaît ou s'en va.
   *
   * Sa teinte est celle de l'IA : c'est elle qui l'a posé. À zéro, la capsule
   * se remplit de cette teinte et dit « Temps écoulé » pendant que la mélodie
   * joue (stores/aiHelp.js), puis s'efface seule au bout d'une minute.
   *
   * Tout son texte suit la taille choisie pour la fenêtre de l'IA
   * (`--ai-scale`) : un décompte se lit du fond de la salle.
   *
   * Purement d'affichage : l'horloge vit dans stores/aiHelpTimer.js.
   */
  import { uiText } from '../../store.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { timerClock, timerWords } from '../../utils/timerFormat.js';
  import {
    aiHelp,
    aiHelpSize,
    AI_HELP_SCALES,
    AI_HELP_SIZE_MAX,
    stopAiHelpTimer,
  } from '../../stores/aiHelp.js';
  import { aiHelpTimer, aiHelpTimerLeft } from '../../stores/aiHelpTimer.js';
  import AiIcon from './AiIcon.svelte';

  /** Les dix dernières secondes se signalent : le temps bat. */
  const LAST_SECONDS = 10;
  const RING_RADIUS = 15;
  const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

  $: T = $uiText.aiHelp.timer;
  // Hors réunion, rien : le minuteur appartient à celle qui l'a demandé.
  $: timer = $aiHelp.meetingId ? $aiHelpTimer : null;
  $: left = $aiHelpTimerLeft;
  $: done = timer?.done === true;
  $: last = !!timer && !done && left <= LAST_SECONDS;
  // Ce qui reste de l'anneau : plein au départ, vide à zéro.
  $: fraction = timer && !done ? Math.min(1, Math.max(0, left / timer.seconds)) : 0;
  $: scale = AI_HELP_SCALES[Math.min(AI_HELP_SIZE_MAX, Math.max(0, $aiHelpSize))];
  $: label = timer?.label || '';
  $: spoken = !timer
    ? ''
    : done
      ? [T.done, label].filter(Boolean).join(' — ')
      : fill(label ? T.leftLabel : T.left, { time: timerWords(left), label });
</script>

{#if timer}
  <div class="ait-row">
    <!-- `role="timer"` : annoncé à la demande, pas à chaque seconde. -->
    <div
      class="ait"
      class:ait-done={done}
      class:ait-last={last}
      role="timer"
      aria-label={spoken}
      style:--ai-scale={scale}
    >
      <span class="ait-ring" aria-hidden="true">
        <svg viewBox="0 0 36 36">
          <circle class="ait-track" cx="18" cy="18" r={RING_RADIUS} />
          <circle
            class="ait-arc"
            cx="18"
            cy="18"
            r={RING_RADIUS}
            stroke-dasharray={RING_LENGTH}
            stroke-dashoffset={RING_LENGTH * (1 - fraction)}
            transform="rotate(-90 18 18)"
          />
        </svg>
        <span class="ait-glyph"><AiIcon name={done ? 'bell' : 'timer'} size={15} /></span>
      </span>
      <span class="ait-time" aria-hidden="true">{done ? T.done : timerClock(left)}</span>
      {#if label}
        <span class="ait-label" aria-hidden="true" title={label}>{label}</span>
      {/if}
      <button
        type="button"
        class="ait-stop"
        aria-label={done ? T.close : T.stop}
        title={done ? T.close : T.stop}
        on:click={stopAiHelpTimer}
      >
        <AiIcon name="close" size={15} strokeWidth={2} />
      </button>
    </div>
  </div>
{/if}

<style>
  /* Sa propre rangée, au-dessus de la transcription (colonne flex de
     LiveTranscript) : `flex: none`, la liste lui cède sa hauteur. */
  .ait-row {
    flex: none;
    display: flex;
    justify-content: center;
    padding: 10px 14px 8px;
  }
  .ait {
    display: inline-flex;
    align-items: center;
    gap: calc(9px * var(--ai-scale, 1));
    max-width: 100%;
    box-sizing: border-box;
    padding: 5px 6px 5px 5px;
    border: 1.5px solid var(--ai-line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ai-ink);
    box-shadow: 0 6px 28px -6px var(--ai-glow);
    font-family: 'Lexend', sans-serif;
    animation: ait-drop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
    transition:
      background 0.4s ease,
      color 0.4s ease,
      border-color 0.4s ease;
  }

  .ait-ring {
    position: relative;
    flex: none;
    width: calc(34px * var(--ai-scale, 1));
    height: calc(34px * var(--ai-scale, 1));
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .ait-ring svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .ait-track,
  .ait-arc {
    fill: none;
    stroke-width: 3;
  }
  .ait-track {
    stroke: var(--ai-soft-strong);
  }
  /* L'anneau glisse d'une seconde à l'autre au lieu de sauter. */
  .ait-arc {
    stroke: var(--ai);
    stroke-linecap: round;
    transition: stroke-dashoffset 1s linear;
  }
  .ait-glyph {
    display: inline-flex;
    transform-origin: 50% 12%;
  }
  .ait-glyph :global(svg) {
    width: calc(15px * var(--ai-scale, 1));
    height: calc(15px * var(--ai-scale, 1));
  }

  /* Chiffres à chasse fixe : le temps ne danse pas d'une seconde à l'autre. */
  .ait-time {
    flex: none;
    font-size: calc(19px * var(--ai-scale, 1));
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.01em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .ait-label {
    min-width: 0;
    max-width: calc(190px * var(--ai-scale, 1));
    padding-left: calc(9px * var(--ai-scale, 1));
    border-left: 1px solid var(--ai-line);
    overflow: hidden;
    font-size: calc(12.5px * var(--ai-scale, 1));
    font-weight: 400;
    line-height: 1.5;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.86;
  }

  .ait-stop {
    flex: none;
    width: 28px;
    height: 28px;
    margin-left: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    opacity: 0.62;
    cursor: pointer;
    transition:
      background 0.15s,
      opacity 0.15s;
  }
  .ait-stop:hover {
    background: rgb(var(--ai-rgb) / 0.12);
    opacity: 1;
  }
  .ait-stop:focus-visible {
    outline: 2px solid var(--ai-ink);
    outline-offset: 2px;
    opacity: 1;
  }

  /* Les dix dernières secondes : le temps bat, une fois par seconde. */
  .ait-last .ait-time {
    animation: ait-beat 1s ease-in-out infinite;
  }

  /* À zéro : la capsule pleine, la cloche qui sonne, un halo qui s'élargit —
     le temps de la mélodie, pas plus. */
  .ait-done {
    border-color: var(--ai);
    background: var(--ai);
    color: #fff;
    animation: ait-halo 1.3s ease-out 3;
  }
  .ait-done .ait-time {
    font-size: calc(15px * var(--ai-scale, 1));
    letter-spacing: 0;
  }
  .ait-done .ait-track {
    stroke: rgb(255 255 255 / 0.28);
  }
  .ait-done .ait-arc {
    stroke: transparent;
    transition: none;
  }
  .ait-done .ait-label {
    border-left-color: rgb(255 255 255 / 0.4);
  }
  .ait-done .ait-glyph {
    animation: ait-swing 0.55s ease-in-out 7;
  }
  .ait-done .ait-stop:hover {
    background: rgb(255 255 255 / 0.2);
  }
  .ait-done .ait-stop:focus-visible {
    outline-color: #fff;
  }

  @keyframes ait-drop {
    from {
      opacity: 0;
      transform: translateY(-14px) scale(0.94);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes ait-beat {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }
  @keyframes ait-halo {
    from {
      box-shadow: 0 0 0 0 var(--ai-glow);
    }
    to {
      box-shadow: 0 0 0 16px rgb(var(--ai-rgb) / 0);
    }
  }
  @keyframes ait-swing {
    0%,
    100% {
      transform: rotate(0);
    }
    25% {
      transform: rotate(16deg);
    }
    75% {
      transform: rotate(-16deg);
    }
  }

  /* Téléphone : le libellé cède la place avant le temps. */
  @media (max-width: 768px) {
    .ait-row {
      padding: 8px 8px 6px;
    }
    .ait-label {
      max-width: calc(120px * var(--ai-scale, 1));
    }
  }
  /* Au doigt : un bouton d'arrêt qu'on ne rate pas. */
  @media (pointer: coarse) {
    .ait-stop {
      width: 40px;
      height: 40px;
      margin: -3px -3px -3px 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ait,
    .ait-done,
    .ait-last .ait-time,
    .ait-done .ait-glyph {
      animation: none;
    }
    .ait-arc {
      transition: none;
    }
  }
</style>
