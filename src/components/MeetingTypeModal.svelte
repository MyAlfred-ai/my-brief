<script>
  /**
   * « Quel type de réunion ? » — posé au démarrage, micro déjà ouvert, sur les
   * seuls navigateurs qui captent le son d'un partage d'écran (Chrome, Edge
   * sur ordinateur : `browserSupportsSystemAudio`, App.svelte).
   *
   * Deux boutons nommés par la RÉUNION, pas par la technique : chacun sait s'il
   * est autour d'une table ou en visio, personne ne sait ce qu'est « l'audio du
   * système ». L'écran qu'il remplace (« Capturer l'audio Teams »,
   * « Passer (micro seulement) » / « Continuer → ») ne décrivait en outre que
   * l'application de bureau, alors que l'onglet est le chemin sûr.
   *
   * « Réunion avec visio » ouvre AUSSITÔT la fenêtre de partage du navigateur,
   * sans écran intermédiaire : c'est ce clic qui fournit le geste que réclame
   * getDisplayMedia. Le rappel sous les boutons dit les deux choix qui comptent
   * dans cette fenêtre — l'onglet (ou tout l'écran) et la case de l'audio.
   *
   * « Annuler », discret sous le rappel, renonce à démarrer : startRecording
   * relâche le micro déjà ouvert et n'inscrit aucune réunion. Le fond et Échap
   * valent « Annuler » — fermer une fenêtre ne doit pas lancer d'enregistrement.
   *
   * Firefox et Safari n'ont pas de son dans leur partage d'écran : là, la
   * question n'est posée que si un périphérique « son de l'ordinateur » est
   * choisi (lib/audio/systemAudio.js), et le rappel nomme ce périphérique au
   * lieu de décrire une fenêtre de partage qui ne s'ouvrira pas.
   */
  import { onMount } from 'svelte';
  import { uiText } from '../store.js';
  import { meetingTypeContext } from '../stores/meetingType.js';
  import IconInfo from '~icons/solar/info-circle-linear';
  import InPersonMeetingIcon from './icons/InPersonMeetingIcon.svelte';
  import VisioMeetingIcon from './icons/VisioMeetingIcon.svelte';

  /** @type {(withVisio: boolean) => void} */
  export let onChoose;
  /** @type {() => void} */
  export let onCancel;

  let firstOption;
  // Le focus entre dans la fenêtre : au clavier, Entrée choisit sans détour.
  onMount(() => firstOption?.focus());

  function handleKeydown(event) {
    if (event.key === 'Escape') onCancel();
  }

  $: hint =
    $meetingTypeContext.path === 'device'
      ? $uiText.meetingType.visioHintDevice.replace(
          '{device}',
          $meetingTypeContext.deviceLabel || '',
        )
      : $uiText.meetingType.visioHint;
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="mtm-backdrop" on:click|self={onCancel}>
  <div class="mtm" role="dialog" aria-modal="true" aria-labelledby="mtm-title">
    <h2 class="mtm-title" id="mtm-title">{$uiText.meetingType.title}</h2>

    <div class="mtm-options">
      <button
        type="button"
        class="mtm-option"
        bind:this={firstOption}
        on:click={() => onChoose(false)}
      >
        <InPersonMeetingIcon width="76" height="76" aria-hidden="true" />
        <span class="mtm-label">{$uiText.meetingType.inPerson}</span>
      </button>
      <button type="button" class="mtm-option" on:click={() => onChoose(true)}>
        <VisioMeetingIcon width="76" height="76" aria-hidden="true" />
        <span class="mtm-label">{$uiText.meetingType.visio}</span>
      </button>
    </div>

    <p class="mtm-hint">
      <IconInfo width="16" height="16" aria-hidden="true" />
      <span>{hint}</span>
    </p>

    <button type="button" class="mtm-cancel" on:click={onCancel}>
      {$uiText.meetingType.cancel}
    </button>
  </div>
</div>

<style>
  .mtm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 9999;
    animation: backdrop-fade 0.18s ease-out;
  }

  .mtm {
    width: 480px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 28px 24px 22px;
    background: var(--surface);
    border-radius: 14px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
    font-family: 'Lexend', sans-serif;
    animation: modal-scale-in 0.22s cubic-bezier(0.33, 1, 0.68, 1);
  }

  .mtm-title {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
    color: var(--ink);
    text-align: center;
  }

  .mtm-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .mtm-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    min-height: 180px;
    padding: 20px 12px 18px;
    background: var(--surface);
    border: 1.5px solid var(--line-strong);
    border-radius: 12px;
    color: var(--brand);
    font-family: inherit;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s,
      box-shadow 0.15s,
      transform 0.15s;
  }
  .mtm-option:hover {
    border-color: var(--brand);
    background: var(--brand-secondary-soft-08);
    box-shadow: 0 8px 22px rgb(var(--brand-rgb) / 0.14);
    transform: translateY(-2px);
  }
  .mtm-option:active {
    transform: translateY(0) scale(0.98);
  }
  .mtm-option:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .mtm-label {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--ink);
    text-align: center;
  }

  .mtm-hint {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    padding: 10px 12px;
    background: var(--surface-tint);
    border: 1px solid var(--line);
    border-radius: 10px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  .mtm-hint :global(svg) {
    flex: none;
    margin-top: 2px;
    color: var(--brand-text);
  }

  /* Discret exprès : on vient de cliquer « Démarrer », annuler est l'exception. */
  .mtm-cancel {
    align-self: center;
    margin-top: -8px;
    padding: 6px 14px;
    background: none;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink-muted);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .mtm-cancel:hover {
    background: var(--surface-tint);
    color: var(--ink);
  }
  .mtm-cancel:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  /* Fenêtre étroite : les deux choix s'empilent, dessin à gauche. */
  @media (max-width: 440px) {
    .mtm-options {
      grid-template-columns: 1fr;
    }
    .mtm-option {
      flex-direction: row;
      justify-content: flex-start;
      min-height: 0;
      padding: 14px 16px;
    }
    .mtm-option :global(svg) {
      width: 52px;
      height: 52px;
    }
  }
</style>
