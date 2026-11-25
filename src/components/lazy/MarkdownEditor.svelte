<script>
  /**
   * MarkdownEditor (TipTap), chargé à la demande (lazy/panels.js) — même
   * contrat : props, événements `update` et `blur`, emplacement `status`.
   * main.js le précharge pendant un temps mort : en pratique, il est déjà là
   * quand un compte rendu s'ouvre.
   */
  import LazyFailed from './LazyFailed.svelte';
  import { markdownEditor } from './panels.js';

  const failed = markdownEditor.failed;
  markdownEditor.preload();
</script>

{#if $markdownEditor}
  <svelte:component this={$markdownEditor} {...$$restProps} on:update on:blur>
    <svelte:fragment slot="status"><slot name="status" /></svelte:fragment>
  </svelte:component>
{:else if $failed}
  <LazyFailed />
{/if}
