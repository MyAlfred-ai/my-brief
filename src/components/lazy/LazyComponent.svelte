<script>
  /**
   * Affiche un composant chargé à la demande (utils/lazyComponent.js) avec les
   * props reçues. Le chargement part au MONTAGE — c'est-à-dire quand l'écran
   * s'ouvre —, jamais au démarrage. Échec : une phrase et « Recharger » à la
   * place de l'écran (pendant une réunion, pas de bouton : recharger couperait
   * l'enregistrement) ; rouvrir l'écran retente.
   *
   * Pour un composant qui n'émet aucun événement Svelte (ses actions passent
   * par des props `on…`). L'éditeur du compte rendu, qui en émet, a sa propre
   * enveloppe (lazy/MarkdownEditor.svelte).
   */
  import LazyFailed from './LazyFailed.svelte';

  /** @type {ReturnType<typeof import('../../utils/lazyComponent.js').lazyComponent>} */
  export let component;

  const failed = component.failed;
  component.preload();
</script>

{#if $component}
  <svelte:component this={$component} {...$$restProps} />
{:else if $failed}
  <LazyFailed />
{/if}
