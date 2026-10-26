<script>
  /**
   * Dock — la barre du bas sur ordinateur : « Démarrer » ; pendant la réunion
   * l'onde sonore et deux commandes nommées, « Pause » et « Terminer » ; en
   * pause, « Reprendre » et « Terminer » ; après l'arrêt sans compte rendu,
   * « Enregistrer » et « Résumer → ».
   *
   * Pourquoi « Terminer » : la barre ne montrait qu'un rond « pause » pendant
   * l'enregistrement, et c'est de la pause que se décidait la fin (Résumer,
   * Enregistrer, corbeille). Les utilisateurs ne le devinaient pas — même sur
   * ordinateur, où seule l'infobulle du rond l'expliquait. Même vocabulaire
   * que la barre du téléphone (MobileMeetingBar) : « Pause » met en pause,
   * rien d'autre ; « Terminer » ouvre « Terminer la réunion ? »
   * (EndMeetingSheet), qui explique les trois fins et relaie à onOpenPicker,
   * onSave, onRequestDelete — les fonctions qu'appelaient les anciens boutons.
   * Le chemin le plus courant garde son nombre de clics : Terminer → Résumer
   * maintenant, comme pause → Résumer hier ; et la pause redevient une pause.
   *
   * La feuille est téléportée dans <body> (utils/portal.js) : le dock vit dans
   * .dock-wrapper, centré par transform, qui capturerait un position: fixed.
   *
   * Téléphone (≤ 768 px) : le dock se masque pendant la réunion,
   * MobileMeetingBar prend le relais avec sa propre feuille de fin. Il reste
   * pour « Démarrer » et, après l'arrêt, pour « Enregistrer » / « Résumer → ».
   */
  import { uiText } from '../store.js';
  import IconArrowRight from '~icons/solar/arrow-right-linear';
  import IconMicBold from '~icons/solar/microphone-2-bold';
  import IconSave from '~icons/solar/diskette-linear';
  import IconPause from '~icons/solar/pause-bold';
  import IconPlay from '~icons/solar/play-bold';
  import IconStop from '~icons/solar/stop-bold';
  import IconLock from '~icons/solar/lock-keyhole-minimalistic-linear';
  import AudioWave from './AudioWave.svelte';
  import EndMeetingSheet from './EndMeetingSheet.svelte';
  import { portal } from '../utils/portal.js';

  export let isRecording = false;
  export let isPaused = false;
  export let analyser = null;
  export let hasTranscription = false;
  export let isGeneratingSummary = false;
  export let onToggleRecording = () => {};
  export let onPauseRecording = () => {};
  export let onResumeRecording = () => {};
  export let onOpenPicker = () => {};
  export let onRequestDelete = () => {};
  /**
   * « Enregistrer » : clore la réunion SANS compte rendu — elle est nommée par
   * IA et rangée dans l'historique, le résumé pourra se générer plus tard.
   * Proposé dans la feuille de fin et après l'arrêt, tant qu'aucun résumé
   * n'existe et que la réunion est bien en base (`canSave`) : sans ligne
   * d'historique à nommer, le bouton ne ferait rien.
   */
  export let onSave = () => {};
  export let canSave = false;
  export let isRequestingMic = false;
  /**
   * « Démarrer » retenu par le quota de minutes (stores/quota.js) : le libellé
   * à afficher à la place, vide sinon. Le bouton reste cliquable : c'est App
   * qui explique, avec le mois de renouvellement — un bouton simplement grisé
   * ne dirait pas pourquoi.
   */
  export let startBlocked = '';

  let showEnd = false;
  /** La feuille se referme d'abord : ce qui suit s'ouvre sous rien. */
  function endWith(action) {
    showEnd = false;
    action();
  }

  $: showComposer = isPaused || (!isRecording && hasTranscription);
  $: showWaveform = isRecording && !isPaused;
  // Plus d'enregistrement (arrêt par un autre chemin) : plus rien à terminer.
  $: if (!isRecording) showEnd = false;
</script>

<div
  class="composer-wrap"
  class:composer-wrap-compact={!showComposer && !showWaveform}
  class:composer-wrap-recording={showWaveform || isPaused}
>
  <div class="composer">
    {#if isPaused}
      <!-- En pause : l'état en clair (une pause n'est pas une fin), reprendre
           en plein — c'est ALORS le geste principal —, et la sortie. -->
      <div class="live-bar">
        <div class="status-pill" role="status">
          <IconPause width="14" height="14" aria-hidden="true" />
          <span class="status-text status-long">{$uiText.meetingBar.pausedStatus}</span>
          <span class="status-text status-short" aria-hidden="true">
            {$uiText.meetingBar.pausedShort}
          </span>
        </div>
        <button type="button" class="pill pill-primary" on:click={onResumeRecording}>
          <IconPlay width="16" height="16" aria-hidden="true" />
          {$uiText.meetingBar.resume}
        </button>
        <button type="button" class="pill pill-end" on:click={() => (showEnd = true)}>
          <IconStop width="14" height="14" aria-hidden="true" />
          {$uiText.meetingBar.end}
        </button>
      </div>
    {:else if showComposer}
      <!-- Arrêtée sans compte rendu (sélecteur de template refermé) -->
      <div class="action-bar">
        <div class="spacer"></div>

        {#if canSave}
          <!-- La réunion peut encore être nommée et rangée sans compte rendu. -->
          <button
            type="button"
            class="generate generate-secondary"
            on:click={onSave}
            disabled={isGeneratingSummary}
            aria-label={$uiText.ariaLabels.saveMeeting}
            title={$uiText.ariaLabels.saveMeeting}
          >
            <IconSave width="15" height="15" aria-hidden="true" />
            {$uiText.buttons.saveMeeting}
          </button>
        {/if}
        <button
          type="button"
          class="generate"
          on:click={onOpenPicker}
          disabled={isGeneratingSummary}
          aria-label={$uiText.ariaLabels.generateSummary}
        >
          {isGeneratingSummary ? '…' : $uiText.buttons.summarize}
          <IconArrowRight width="14" height="14" />
        </button>
      </div>
    {:else if showWaveform}
      <!-- Enregistrement : l'onde (MyBrief écoute), « Pause », « Terminer » -->
      <div class="live-bar">
        <div class="wave-pill">
          <AudioWave
            {analyser}
            active={showWaveform}
            label={$uiText.ariaLabels.recordingInProgress}
          />
        </div>
        <button type="button" class="pill" on:click={onPauseRecording}>
          <IconPause width="14" height="14" aria-hidden="true" />
          {$uiText.meetingBar.pause}
        </button>
        <button type="button" class="pill pill-end" on:click={() => (showEnd = true)}>
          <IconStop width="14" height="14" aria-hidden="true" />
          {$uiText.meetingBar.end}
        </button>
      </div>
    {:else}
      <!-- Idle / start state -->
      <button
        type="button"
        class="start-btn"
        class:start-loading={isRequestingMic}
        class:start-blocked={!!startBlocked && !isRequestingMic}
        on:click={onToggleRecording}
        disabled={isRequestingMic}
        aria-label={startBlocked
          ? `${$uiText.buttons.start} : ${startBlocked}`
          : $uiText.buttons.start}
        title={startBlocked || null}
      >
        {#if isRequestingMic}
          <div class="mic-spinner"></div>
          <span>{$uiText.dock.requestingMicShort}</span>
        {:else if startBlocked}
          <IconLock width="16" height="16" aria-hidden="true" />
          <span>{startBlocked}</span>
        {:else}
          <IconMicBold width="18" height="18" style="color: white" />
          <span>{$uiText.buttons.start}</span>
        {/if}
      </button>
    {/if}
  </div>
</div>

{#if showEnd}
  <div use:portal>
    <EndMeetingSheet
      {canSave}
      onSummarize={() => endWith(onOpenPicker)}
      onSave={() => endWith(onSave)}
      onDelete={() => endWith(onRequestDelete)}
      onCancel={() => (showEnd = false)}
    />
  </div>
{/if}

<style>
  .composer-wrap {
    width: min(720px, calc(100vw - 32px));
    pointer-events: none;
  }
  .composer-wrap > * {
    pointer-events: auto;
  }

  .composer-wrap-compact {
    width: auto;
  }

  .composer-wrap-recording {
    width: auto;
  }

  .composer {
    background: #fefdff;
    border: 1px solid var(--mb-border-card);
    border-radius: 12px;
    padding: 12px 12px 10px;
    box-shadow:
      0 4px 40px rgb(var(--brand-rgb) / 0.25),
      0 4px 14px -4px rgb(var(--brand-rgb) / 0.08);
    transition:
      border-radius 0.3s,
      box-shadow 0.3s;
  }
  .composer-wrap-compact .composer {
    padding: 6px;
    border-radius: 999px;
    background: transparent;
    border: none;
    box-shadow: none;
    display: flex;
    justify-content: center;
  }

  /* Action bar */
  .action-bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .spacer {
    flex: 1;
  }

  .generate {
    height: 38px;
    padding: 0 18px;
    border-radius: 10px;
    background: var(--brand);
    color: white;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 6px 18px -4px rgb(var(--brand-rgb) / 0.5);
    transition:
      background 0.15s,
      transform 0.15s,
      box-shadow 0.15s;
  }
  .generate:hover {
    background: color-mix(in srgb, var(--brand) 91.7%, #ffffff);
    box-shadow: 0 8px 22px -4px rgb(var(--brand-rgb) / 0.6);
  }
  .generate:active {
    transform: scale(0.97);
  }
  .generate:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
  /* « Enregistrer » à côté de « Résumer » : même gabarit, en creux — le
     résumé reste le geste principal. */
  .generate-secondary {
    background: #fefdff;
    color: var(--brand);
    border: 1px solid var(--mb-border-card);
    box-shadow: 0 4px 14px -4px rgb(var(--brand-rgb) / 0.25);
  }
  .generate-secondary:hover {
    background: var(--mb-bg-warm);
    box-shadow: 0 6px 18px -4px rgb(var(--brand-rgb) / 0.35);
  }

  /* Réunion en cours — barre flottante sans boîte (Vocal view Figma) : les
     pastilles portent chacune leur fond et leur halo. */
  .composer-wrap-recording .composer {
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 4px;
  }
  .live-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0;
  }
  /* L'onde : large mais pas au point de pousser les deux pastilles hors de
     la zone centrale quand l'historique est ouvert sur un écran étroit. */
  .wave-pill {
    width: clamp(150px, 28vw, 380px);
    height: 47px;
    flex: none;
    display: flex;
    align-items: center;
    padding: 0 18px;
    background: #fefdff;
    border: 1px solid var(--mb-border-card);
    border-radius: 12px;
    box-shadow: 0 4px 40px rgb(var(--brand-rgb) / 0.3);
    overflow: hidden;
  }
  /* En pause, à la place de l'onde : l'état, en toutes lettres. Plafond lié à
     la place restante (historique de 280 px, deux pastilles, marges) : la
     phrase tient dès 1 000 px, s'ellipse en dessous — le haut de l'écran dit
     déjà « En pause ». */
  .status-pill {
    height: 47px;
    max-width: clamp(160px, calc(100vw - 620px), 420px);
    flex: 0 1 auto;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 18px;
    background: #fefdff;
    border: 1px solid var(--mb-border-card);
    border-radius: 12px;
    box-shadow: 0 4px 24px rgb(var(--brand-rgb) / 0.18);
    color: var(--brand-text);
    font-family: 'Lexend', sans-serif;
    font-size: 14px;
    font-weight: 500;
  }
  .status-pill :global(svg) {
    flex: none;
  }
  .status-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Fenêtre étroite : la phrase ne tient plus à côté des deux pastilles —
     « En pause » court, plutôt qu'une ellipse. Media query APRÈS la règle de
     base, même spécificité : c'est l'ordre qui décide. */
  .status-short {
    display: none;
  }
  @media (max-width: 1000px) {
    .status-long {
      display: none;
    }
    .status-short {
      display: inline;
    }
  }

  /* Pastilles nommées (47 px, comme l'onde) : « Pause » en creux, « Reprendre »
     en plein marque, « Terminer » en rouge d'arrêt — le même code que le
     téléphone, pour que les deux écrans s'apprennent l'un l'autre. */
  .pill {
    height: 47px;
    padding: 0 18px 0 16px;
    border-radius: 12px;
    background: #fefdff;
    border: 1px solid var(--mb-border-card);
    color: var(--brand-text);
    font-family: 'Lexend', sans-serif;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    flex: none;
    box-shadow: 0 4px 24px rgb(var(--brand-rgb) / 0.28);
    transition:
      background 0.15s,
      transform 0.15s,
      box-shadow 0.15s;
  }
  .pill:hover {
    background: var(--mb-bg-warm);
  }
  .pill:active {
    transform: scale(0.97);
  }
  .pill:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .pill-primary {
    background: var(--brand);
    border-color: var(--brand);
    color: #fff;
    box-shadow: 0 6px 24px -2px rgb(var(--brand-rgb) / 0.5);
  }
  .pill-primary:hover {
    background: var(--brand-strong);
  }
  .pill-end {
    background: var(--danger-bg);
    border-color: var(--danger-line);
    color: var(--danger-strong);
    box-shadow: 0 4px 24px rgba(229, 72, 77, 0.16);
  }
  .pill-end:hover {
    background: var(--danger-bg-hover);
  }

  /* Idle start button */
  .start-btn {
    height: 50px;
    padding: 0 26px;
    border-radius: 12px;
    background: var(--brand);
    color: white;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 15px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 10px 30px -6px rgb(var(--brand-rgb) / 0.5);
    transition:
      background 0.18s,
      transform 0.18s,
      box-shadow 0.18s;
  }
  .start-btn:hover {
    background: color-mix(in srgb, var(--brand) 91.7%, #ffffff);
    transform: translateY(-1px);
    box-shadow: 0 14px 34px -6px rgb(var(--brand-rgb) / 0.6);
  }
  .start-btn:active {
    transform: scale(0.97);
  }
  .start-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  /* Quota atteint : le geste principal dit la vérité, sans l'orange qui
     promet un démarrage. Cliquable : App explique, avec la date. */
  .start-blocked,
  .start-blocked:hover {
    background: var(--line-strong);
    color: var(--ink-muted);
    box-shadow: none;
    transform: none;
  }
  .mic-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Téléphone : pendant la réunion (enregistrement ou pause), la barre de
     réunion mobile (MobileMeetingBar) remplace ce dock. Le wrapper, lui, reste
     monté : la place réservée en bas du contenu (style.css,
     :has(.dock-wrapper)) sert à la barre mobile. */
  @media (max-width: 768px) {
    .composer-wrap-recording {
      display: none;
    }
  }

  /* Écrans étroits (dock encore visible : accueil, après l'arrêt) */
  @media (max-width: 640px) {
    .composer {
      padding: 10px;
      border-radius: 12px;
    }
    .generate {
      padding: 0 14px;
      font-size: 12px;
    }
    .generate-secondary {
      padding: 0 12px;
    }
  }
</style>
