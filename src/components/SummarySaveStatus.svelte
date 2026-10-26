<script>
  // Indicateur d'autosave du résumé — vit dans le slot `status` de la barre
  // d'outils de MarkdownEditor. Présentation pure : l'état vient d'App
  // (applySaveOutcome), les libellés de $uiText.editor.
  export let state = 'idle'; // 'idle' | 'pending' | 'saved' | 'error'
  export let labels = {};
</script>

{#if state === 'pending'}
  <span class="save-status save-status-pending" role="status">{labels.saving}</span>
{:else if state === 'saved'}
  <span class="save-status save-status-saved" role="status">✓ {labels.saved}</span>
{:else if state === 'error'}
  <span class="save-status save-status-error" role="alert">⚠ {labels.saveFailed}</span>
{/if}
