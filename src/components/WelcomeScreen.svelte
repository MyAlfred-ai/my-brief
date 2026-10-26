<script>
  /**
   * Écran d'accueil — aucune réunion ouverte : le logo, « Bienvenue {prénom} »
   * et une phrase. Le geste, lui, est ailleurs : « Démarrer » dans le dock, et
   * sur téléphone le « + » de la barre d'app.
   *
   * Extrait d'App.svelte pour la même raison que ToastHost ou MobileAppBar :
   * App est à son plafond `max-lines` (eslint.config.js). Aucune logique —
   * le prénom n'est affiché que s'il ressemble à un prénom (isValidUserName :
   * un identifiant technique ne salue personne). Les styles (.welcome-*)
   * restent globaux, dans style.css.
   */
  import { isValidUserName } from '../utils/userIdentity.js';
  import { uiText } from '../store.js';

  export let logoUrl = '';
  export let userName = '';
</script>

<div class="welcome-screen">
  <div class="welcome-content">
    <img src={logoUrl} alt="MyBrief" class="welcome-logo" />
    <h1 class="welcome-title">
      {#if userName && isValidUserName(userName)}
        {$uiText.home.greetingNamed.replace('{name}', userName)}
      {:else}
        {$uiText.home.greeting}
      {/if}
    </h1>
    <p class="welcome-sub">{$uiText.home.subtitle}</p>
  </div>
</div>
