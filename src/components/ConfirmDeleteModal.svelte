<script context="module">
  /**
   * Identifiants uniques pour `aria-labelledby` : deux modales montées en même
   * temps (cas de bord, mais l'attribut doit rester non ambigu) ne peuvent pas
   * partager le même id de titre.
   */
  let seq = 0;
</script>

<script>
  /**
   * Confirmation de suppression — la même modale, montée trois fois dans
   * App.svelte avec des textes différents (version de résumé, réunion de
   * l'historique, réunion en cours).
   *
   * Le style vient de `style.css` (classes `.delete-modal-*`, globales) : la
   * coquille n'apporte que la structure, l'accessibilité et le câblage.
   */
  import IconDanger from '~icons/solar/danger-circle-linear';
  import { uiText } from '../store.js';

  export let title = '';
  export let body = '';
  /** Par défaut « Annuler » / « Supprimer » du dictionnaire (modals). */
  export let cancelLabel = '';
  export let confirmLabel = '';
  export let onCancel = () => {};
  export let onConfirm = () => {};

  const titleId = `confirm-delete-title-${++seq}`;
</script>

<div
  class="delete-modal-backdrop"
  on:click={onCancel}
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
>
  <div class="delete-modal" on:click|stopPropagation role="none">
    <div class="delete-modal-icon">
      <IconDanger width="28" height="28" style="color: rgb(210,60,60)" />
    </div>
    <h2 id={titleId} class="delete-modal-title">{title}</h2>
    <p class="delete-modal-body">{body}</p>
    <div class="delete-modal-actions">
      <button class="delete-modal-cancel" on:click={onCancel}
        >{cancelLabel || $uiText.modals.cancel}</button
      >
      <button class="delete-modal-confirm" on:click={onConfirm}
        >{confirmLabel || $uiText.modals.confirmDelete}</button
      >
    </div>
  </div>
</div>
