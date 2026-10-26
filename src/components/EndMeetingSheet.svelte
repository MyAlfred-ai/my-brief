<script>
  /**
   * « Terminer la réunion ? » — la feuille qu'ouvre « Terminer », dans le dock
   * sur ordinateur et dans la barre de réunion du téléphone (MobileMeetingBar).
   * Fenêtre centrée sur ordinateur, feuille du bas sur téléphone : même
   * contenu, même ordre — c'est le CSS qui tranche (≤ 768 px).
   *
   * L'ancien dock de la pause alignait quatre boutons (Résumer, Enregistrer,
   * Reprendre, Supprimer) dont les noms, seuls, ne disaient pas ce qui est
   * gardé. Ici, chaque fin s'explique en une ligne — c'est ce que demande un
   * utilisateur qui n'a jamais lu la documentation :
   *
   *   Résumer maintenant       — l'enregistrement s'arrête, le compte rendu se rédige
   *   Enregistrer sans résumé  — rangée dans l'historique, le compte rendu peut attendre
   *   Supprimer la réunion     — rien n'est gardé
   *
   * « Enregistrer sans résumé » n'apparaît que si la réunion est en base
   * (`canSave`, même règle que le dock) : sans ligne d'historique à nommer, le
   * bouton ne ferait rien.
   *
   * La feuille ne touche pas à l'état de l'enregistrement : « Annuler », le
   * fond ou Échap la referment sans rien changer — la réunion continue, ou
   * reste en pause. Écarté : mettre en pause à l'ouverture et reprendre à
   * l'annulation — deux transitions cachées pour rien, et un utilisateur qui
   * avait choisi la pause se serait vu relancer l'enregistrement.
   *
   * Le fond porte `.mes-backdrop` : c'est ce que touche le bouton retour
   * d'Android (utils/backNavigation.js).
   */
  import { onMount } from 'svelte';
  import { uiText } from '../store.js';
  import IconMagic from '~icons/solar/magic-stick-3-bold-duotone';
  import IconSave from '~icons/solar/diskette-linear';
  import IconTrash from '~icons/solar/trash-bin-trash-linear';

  export let canSave = false;
  export let onSummarize = () => {};
  export let onSave = () => {};
  export let onDelete = () => {};
  export let onCancel = () => {};

  let firstChoice;
  onMount(() => firstChoice?.focus());

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="mes-backdrop" on:click|self={onCancel}>
  <div class="mes" role="dialog" aria-modal="true" aria-labelledby="mes-title">
    <div class="mes-grip" aria-hidden="true"></div>
    <h2 class="mes-title" id="mes-title">{$uiText.meetingBar.endTitle}</h2>
    <p class="mes-sub">{$uiText.meetingBar.endSubtitle}</p>

    <div class="mes-choices">
      <button
        type="button"
        class="mes-choice mes-choice-primary"
        bind:this={firstChoice}
        on:click={onSummarize}
      >
        <span class="mes-choice-icon"><IconMagic width="22" height="22" aria-hidden="true" /></span>
        <span class="mes-choice-text">
          <span class="mes-choice-name">{$uiText.meetingBar.endSummarize}</span>
          <span class="mes-choice-hint">{$uiText.meetingBar.endSummarizeHint}</span>
        </span>
      </button>

      {#if canSave}
        <button type="button" class="mes-choice" on:click={onSave}>
          <span class="mes-choice-icon">
            <IconSave width="22" height="22" aria-hidden="true" />
          </span>
          <span class="mes-choice-text">
            <span class="mes-choice-name">{$uiText.meetingBar.endSave}</span>
            <span class="mes-choice-hint">{$uiText.meetingBar.endSaveHint}</span>
          </span>
        </button>
      {/if}

      <button type="button" class="mes-choice mes-choice-danger" on:click={onDelete}>
        <span class="mes-choice-icon"><IconTrash width="22" height="22" aria-hidden="true" /></span>
        <span class="mes-choice-text">
          <span class="mes-choice-name">{$uiText.meetingBar.endDelete}</span>
          <span class="mes-choice-hint">{$uiText.meetingBar.endDeleteHint}</span>
        </span>
      </button>
    </div>

    <button type="button" class="mes-cancel" on:click={onCancel}>
      {$uiText.meetingBar.endCancel}
    </button>
  </div>
</div>

<style>
  /* Ordinateur : fenêtre centrée, au-dessus de tout comme les confirmations
     (.delete-modal-backdrop, style.css : 9999). Téléphone : feuille du bas. */
  .mes-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(15, 23, 42, 0.55);
    -webkit-backdrop-filter: blur(4px);
    backdrop-filter: blur(4px);
    animation: backdrop-fade 0.18s ease-out;
  }

  .mes {
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 22px 22px 16px;
    background: var(--surface);
    border-radius: 16px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
    font-family: 'Lexend', sans-serif;
    animation: modal-scale-in 0.22s cubic-bezier(0.33, 1, 0.68, 1);
  }
  @keyframes mes-in {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .mes,
    .mes-backdrop {
      animation: none;
    }
  }

  /* La poignée n'a de sens que sur une feuille du bas. */
  .mes-grip {
    display: none;
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: var(--line-faint);
    align-self: center;
    margin-bottom: 6px;
  }

  @media (max-width: 768px) {
    .mes-backdrop {
      align-items: flex-end;
      padding: 0;
    }
    .mes {
      max-width: 520px;
      padding: 10px 16px calc(14px + var(--safe-bottom, 0px));
      border-radius: 18px 18px 0 0;
      box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.18);
      animation: mes-in 0.22s cubic-bezier(0.33, 1, 0.68, 1);
    }
    .mes-grip {
      display: block;
    }
  }

  .mes-title {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
    color: var(--ink);
    text-align: center;
  }
  .mes-sub {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--ink-muted);
    text-align: center;
  }

  .mes-choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mes-choice {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-height: 64px;
    padding: 12px 14px;
    background: var(--surface);
    border: 1.5px solid var(--line-strong);
    border-radius: 12px;
    color: var(--ink);
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color 0.15s,
      background 0.15s,
      transform 0.15s;
  }
  .mes-choice:active {
    transform: scale(0.985);
  }
  .mes-choice:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  .mes-choice-icon {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--brand-secondary-soft-12);
    color: var(--brand-text);
  }
  .mes-choice-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .mes-choice-name {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.25;
  }
  .mes-choice-hint {
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--ink-muted);
  }

  /* Le résumé reste le geste principal : cadre et icône en marque. */
  .mes-choice-primary {
    border-color: var(--brand);
    background: var(--brand-secondary-soft-08);
  }
  .mes-choice-primary .mes-choice-icon {
    background: var(--brand);
    color: #fff;
  }

  .mes-choice-danger {
    border-color: var(--danger-line);
  }
  .mes-choice-danger .mes-choice-name {
    color: var(--danger-text);
  }
  .mes-choice-danger .mes-choice-icon {
    background: var(--danger-bg);
    color: var(--danger-strong);
  }

  .mes-cancel {
    align-self: center;
    margin-top: 6px;
    min-height: 44px;
    padding: 8px 22px;
    background: none;
    border: none;
    border-radius: 10px;
    font-family: inherit;
    font-size: 15px;
    font-weight: 500;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .mes-cancel:active {
    background: var(--surface-tint);
  }
  .mes-cancel:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
</style>
