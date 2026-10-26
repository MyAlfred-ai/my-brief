<script>
  /**
   * Barre de réunion du téléphone — remplace le dock pendant l'enregistrement
   * et la pause (le dock se masque sous 768 px dans ces deux états).
   *
   * Pourquoi une barre nommée : sur ordinateur, le dock ne montre qu'une onde
   * et un rond « pause », dont l'infobulle explique qu'il mène à la fin de
   * réunion. Un téléphone n'a pas d'infobulle, et les retours utilisateurs
   * disaient la même chose : « pause » n'évoque pas « terminer », et deux
   * boutons flottants à icône (📝, ✅) ne disaient ni « notes » ni « actions ».
   * Ici, quatre commandes à hauteur d'utilisateur, chacune avec son nom sous
   * l'icône, façon barre d'onglets :
   *
   *   Notes · Actions (n) · Pause ⇄ Reprendre · Terminer
   *
   * La troisième place bascule avec l'état : « Pause » en enregistrement,
   * « Reprendre » en pause — en plein, car reprendre est ALORS le geste
   * principal. « Terminer » est toujours là, en rouge d'arrêt : c'est la
   * porte de sortie, à tout moment, sans passer par la pause. Elle ouvre la
   * feuille « Terminer la réunion ? » (EndMeetingSheet), qui explique les trois
   * fins possibles ; la barre ne décide rien elle-même.
   *
   * Au-dessus des boutons, la ligne d'état : l'onde sonore en enregistrement
   * (MyBrief écoute), et en pause la phrase « En pause — la réunion n'est pas
   * terminée » — c'est précisément le contresens à lever.
   *
   * Aucun état propre : le parent (MobileMeetingOverlays) ouvre les notes, les
   * actions et la feuille de fin ; App fournit pause/reprise.
   */
  import { uiText } from '../store.js';
  import AudioWave from './AudioWave.svelte';
  import IconNotes from '~icons/solar/notes-linear';
  import IconChecklist from '~icons/solar/checklist-minimalistic-linear';
  import IconPause from '~icons/solar/pause-bold';
  import IconPlay from '~icons/solar/play-bold';
  import IconStop from '~icons/solar/stop-bold';

  export let isPaused = false;
  export let analyser = null;
  export let actionsCount = 0;
  export let hasNotes = false;
  /** Halo bref sur « Actions » à chaque action détectée ou affinée. */
  export let fabFlash = false;
  export let onNotes = () => {};
  export let onActions = () => {};
  export let onPause = () => {};
  export let onResume = () => {};
  export let onEnd = () => {};
</script>

<div class="mmb" role="toolbar" aria-label={$uiText.meetingBar.title}>
  <div class="mmb-status" class:mmb-status-paused={isPaused}>
    {#if isPaused}
      <IconPause width="14" height="14" aria-hidden="true" />
      <span class="mmb-status-text" role="status">{$uiText.meetingBar.pausedStatus}</span>
    {:else}
      <AudioWave {analyser} active={true} label={$uiText.ariaLabels.recordingInProgress} />
    {/if}
  </div>

  <div class="mmb-row">
    <button type="button" class="mmb-btn" on:click={onNotes}>
      <span class="mmb-icon">
        <IconNotes width="24" height="24" aria-hidden="true" />
        {#if hasNotes}
          <span class="mmb-dot" aria-hidden="true"></span>
        {/if}
      </span>
      <span class="mmb-label">{$uiText.meetingBar.notes}</span>
    </button>

    <button type="button" class="mmb-btn" class:mmb-btn-flash={fabFlash} on:click={onActions}>
      <span class="mmb-icon">
        <IconChecklist width="24" height="24" aria-hidden="true" />
        {#if actionsCount > 0}
          <span class="mmb-count">{actionsCount}</span>
        {/if}
      </span>
      <span class="mmb-label">{$uiText.meetingBar.actions}</span>
    </button>

    {#if isPaused}
      <button type="button" class="mmb-btn mmb-btn-resume" on:click={onResume}>
        <span class="mmb-disc mmb-disc-brand">
          <IconPlay width="18" height="18" aria-hidden="true" />
        </span>
        <span class="mmb-label">{$uiText.meetingBar.resume}</span>
      </button>
    {:else}
      <button type="button" class="mmb-btn mmb-btn-pause" on:click={onPause}>
        <span class="mmb-disc mmb-disc-outline">
          <IconPause width="16" height="16" aria-hidden="true" />
        </span>
        <span class="mmb-label">{$uiText.meetingBar.pause}</span>
      </button>
    {/if}

    <button type="button" class="mmb-btn mmb-btn-end" on:click={onEnd}>
      <span class="mmb-disc mmb-disc-end">
        <IconStop width="16" height="16" aria-hidden="true" />
      </span>
      <span class="mmb-label">{$uiText.meetingBar.end}</span>
    </button>
  </div>
</div>

<style>
  /* Fixée en bas, pleine largeur, au-dessus du contenu (même z-index que le
     dock : 50) et sous les modales plein écran (10000). Le contenu garde sa
     réserve basse (style.css, 140 px + safe-bottom) : la barre y tient. */
  .mmb {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px calc(6px + var(--safe-right, 0px)) calc(6px + var(--safe-bottom, 0px))
      calc(6px + var(--safe-left, 0px));
    background: rgba(255, 254, 252, 0.96);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    border-top: 1px solid var(--line-strong);
    box-shadow: 0 -8px 30px rgb(var(--brand-rgb) / 0.12);
    font-family: 'Lexend', sans-serif;
  }
  /* Téléphone seulement : le parent la monte sur tout écran (il ne connaît
     pas la largeur), c'est le CSS qui tranche — comme .mobile-fab-row. APRÈS
     la règle de base : même spécificité, c'est l'ordre qui décide — placée
     avant, elle était écrasée par `display: flex` et la barre recouvrait le
     dock sur ordinateur. */
  @media (min-width: 769px) {
    .mmb {
      display: none;
    }
  }

  /* Ligne d'état : l'onde ou la phrase de pause. Les barres de l'onde font
     34 px dans le dock (pastille de 47 px) : ici la ligne est plus basse,
     on les ramène à 22 px — scaleY joue dessus, rien n'est rogné. */
  .mmb-status {
    height: 32px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--ink-muted);
    font-size: 12.5px;
  }
  .mmb-status :global(.wave-bar) {
    height: 22px;
  }
  .mmb-status-paused {
    color: var(--brand-text);
  }
  .mmb-status-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mmb-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  .mmb-btn {
    min-height: 58px;
    padding: 4px 2px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--ink-soft);
    font-family: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background 0.15s,
      transform 0.15s;
  }
  .mmb-btn:active {
    background: var(--brand-secondary-soft-08);
    transform: scale(0.96);
  }

  .mmb-label {
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }

  /* Icône simple (notes, actions), avec sa pastille ou son compteur. */
  .mmb-icon {
    position: relative;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--brand-text);
  }
  .mmb-dot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--brand);
    border: 2px solid #fff;
  }
  .mmb-count {
    position: absolute;
    top: -2px;
    right: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--brand);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    border: 2px solid #fff;
    box-sizing: content-box;
  }

  /* Disque des trois commandes d'état : pause (creux), reprise (plein marque),
     fin (plein rouge d'arrêt). Même taille que l'icône simple pour aligner
     les quatre libellés. */
  .mmb-disc {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mmb-disc-outline {
    border: 1.5px solid var(--brand);
    color: var(--brand-text);
    background: #fff;
  }
  .mmb-disc-brand {
    background: var(--brand);
    color: #fff;
    box-shadow: 0 4px 12px rgb(var(--brand-rgb) / 0.4);
  }
  .mmb-btn-resume {
    color: var(--brand-text);
  }
  .mmb-disc-end {
    background: var(--danger-strong);
    color: #fff;
  }
  .mmb-btn-end {
    color: var(--danger-text);
  }

  /* Le panneau d'actions est masqué sur mobile : ce halo est le seul signal
     qu'une action vient d'être détectée ou affinée. Deux battements. */
  .mmb-btn-flash .mmb-icon {
    animation: mmb-ping 0.9s cubic-bezier(0.4, 0, 0.6, 1) 2;
    border-radius: 999px;
  }
  @keyframes mmb-ping {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgb(var(--brand-rgb) / 0);
    }
    50% {
      box-shadow: 0 0 0 8px rgb(var(--brand-rgb) / 0.18);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .mmb-btn-flash .mmb-icon {
      animation: none;
    }
  }

  /* Très petits écrans : quatre noms côte à côte serrent. */
  @media (max-width: 350px) {
    .mmb-label {
      font-size: 10px;
    }
    .mmb-row {
      gap: 2px;
    }
  }
</style>
