<script>
  /**
   * Modale de bienvenue (premier lancement). Le contenu vit dans
   * WelcomeContent ; le mode d'emploi complet, dans la documentation en ligne
   * qu'ouvre « Aide ».
   */
  import WelcomeContent from './WelcomeContent.svelte';

  export let onClose;
  export let logoUrl;
  export let uiText;

  function handleClose() {
    localStorage.setItem('mybrief_welcome_shown', 'true');
    onClose();
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="welcome-modal-backdrop" on:click={handleBackdropClick} role="dialog" aria-modal="true">
  <div class="welcome-modal">
    <button class="welcome-modal-close" on:click={handleClose} aria-label={uiText.ariaLabels.close}>
      ✕
    </button>

    <WelcomeContent {uiText} {logoUrl} onGetStarted={handleClose} />
  </div>
</div>
