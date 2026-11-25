<script>
  /**
   * L'écran chargé à la demande n'est pas arrivé. Le plus souvent : une
   * nouvelle version a été mise en ligne depuis l'ouverture de la page, et le
   * fichier de l'ancienne n'existe plus sur le serveur.
   */
  import { uiText } from '../../store.js';
  import { isRecordingStore, isPausedStore } from '../../stores/recording.js';

  $: inMeeting = $isRecordingStore || $isPausedStore;
</script>

<div class="lazy-failed" role="alert">
  <p>{inMeeting ? $uiText.lazyLoad.failedRecording : $uiText.lazyLoad.failed}</p>
  {#if !inMeeting}
    <button type="button" class="lazy-failed-btn" on:click={() => location.reload()}>
      {$uiText.lazyLoad.reload}
    </button>
  {/if}
</div>

<style>
  .lazy-failed {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px 16px;
    text-align: center;
    color: var(--mb-text-secondary);
  }
  .lazy-failed p {
    max-width: 420px;
    margin: 0;
    line-height: 1.5;
  }
  .lazy-failed-btn {
    padding: 8px 16px;
    border-radius: 10px;
    border: 1px solid var(--mb-border-default);
    background: var(--mb-bg-surface);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
</style>
