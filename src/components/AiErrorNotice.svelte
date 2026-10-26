<script>
  // Bandeau d'erreur/avertissement IA au-dessus du résumé. Présentation pure :
  // `view` ({cls, icon, title, body}) est construit par App (aiErrorNoticeView),
  // qui garde aussi la décision d'affichage et le dismiss.
  export let view = null;
  export let dismissLabel = '';
  export let onDismiss = () => {};
</script>

{#if view}
  <div class="ai-error-notice ai-error-notice-{view.cls}" role="alert">
    <span class="ai-error-notice-icon" aria-hidden="true">{view.icon}</span>
    <div class="ai-error-notice-text">
      <strong class="ai-error-notice-title">{view.title}</strong>
      <p class="ai-error-notice-body">{view.body}</p>
    </div>
    <button class="ai-error-notice-close" on:click={onDismiss} aria-label={dismissLabel}>×</button>
  </div>
{/if}
