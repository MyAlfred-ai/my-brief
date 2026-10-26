<script>
  /**
   * Pile de notifications — le rendu du store global `stores/toasts.js`.
   *
   * Extrait d'App.svelte : le balisage n'avait aucune dépendance à son état
   * local, et le cliquet `max-lines` de src/App.svelte n'accepte une ligne de
   * plus qu'en échange d'une décomposition (cf. eslint.config.js).
   *
   * Les styles restent dans style.css (`.toast-container`, `.toast-*`) : ils
   * sont partagés avec d'autres surfaces et les rapatrier ici les scoperait.
   */
  import { toasts, removeToast } from '../stores/toasts.js';
  import { uiText } from '../store.js';
</script>

{#if $toasts.length > 0}
  <div class="toast-container">
    {#each $toasts as toast (toast.id)}
      <div class="toast toast-{toast.type}" class:toast-exit={toast.exiting} role="alert">
        <span>{toast.message}</span>
        <button
          class="toast-close"
          on:click={() => removeToast(toast.id)}
          aria-label={$uiText.ariaLabels.close}>×</button
        >
      </div>
    {/each}
  </div>
{/if}
