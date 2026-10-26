<script>
  /**
   * « Navigateur partiellement compatible » — Firefox et Safari, sur ordinateur.
   *
   * Leur partage d'écran ne transporte jamais de son : sans réglage, myBrief
   * n'y enregistre que le micro, et la voix des interlocuteurs d'une visio ou
   * le son d'une application sont perdus. La fenêtre le dit à l'ouverture, et
   * donne les deux issues : Chrome ou Edge, ou un périphérique audio virtuel
   * choisi dans Ma configuration → Réglages audio (lib/audio/systemAudio.js).
   * Elle ne s'affiche plus une fois ce périphérique choisi (App.svelte).
   *
   * Sortie d'App.svelte, où elle était écrite en dur et en français seulement ;
   * ses styles restent les classes globales `browser-warning-*` de style.css.
   */
  import { uiText } from '../store.js';

  /** Ferme la fenêtre. */
  export let onClose = () => {};
  /** Ouvre Ma configuration → Réglages audio. */
  export let onConfigure = () => {};

  $: t = $uiText.browserAudioNotice;

  function handleKeydown(event) {
    if (event.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="browser-warning-backdrop" on:click|self={onClose}>
  <div
    class="browser-warning-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="browser-warning-title"
  >
    <button class="browser-warning-close" aria-label={$uiText.ariaLabels.close} on:click={onClose}
      >×</button
    >
    <div class="browser-warning-icons" aria-hidden="true"><span>ℹ️</span></div>
    <h2 class="browser-warning-title" id="browser-warning-title">{t.title}</h2>
    <p class="browser-warning-lead">{t.lead}</p>
    <p class="browser-warning-detail">{t.detail}</p>
    <p class="browser-warning-note">{t.note}</p>
    <div class="bn-actions">
      <button type="button" class="bn-configure" on:click={onConfigure}>{t.configure}</button>
      <button type="button" class="browser-warning-ack" on:click={onClose}>{t.ack}</button>
    </div>
  </div>
</div>

<style>
  .bn-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }
  .bn-configure {
    padding: 9px 18px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .bn-configure:hover {
    background: var(--surface-tint);
    border-color: var(--brand);
  }
  .bn-configure:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
</style>
