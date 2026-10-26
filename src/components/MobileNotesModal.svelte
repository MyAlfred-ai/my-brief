<script>
  /**
   * Modale « Notes de réunion » plein écran sur mobile — la colonne desktop
   * (.side-col) étant masquée, ce plein écran est le pendant mobile de
   * MeetingNotesPanel, ouvert par le FAB notes (App.svelte). Réutilise la
   * coquille .mobile-actions-modal-* (plein écran, safe areas, animation).
   * Même contrat que le panneau : brouillon sauvé au blur (onSave), et la
   * fermeture sauve aussi — le blur ne survit pas au démontage. Chaque frappe
   * (onInput) programme en plus l'écriture différée en base.
   */
  import IconNotes from '~icons/solar/notes-linear';

  export let notes = '';
  export let uiText;
  export let texts;
  export let closeModal;
  export let onSave = () => {};
  export let onInput = () => {};
</script>

<div
  class="mobile-actions-modal-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="mobile-notes-modal-title"
>
  <div
    class="mobile-actions-modal-backdrop"
    on:click={(e) => {
      if (e.target === e.currentTarget && !e.defaultPrevented) {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    }}
    on:keydown={(e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    }}
    role="button"
    tabindex="0"
    aria-label={texts.ariaLabels.closeModal}
  ></div>
  <div class="mobile-actions-modal" role="document">
    <div class="mobile-actions-modal-header">
      <h2 class="mobile-actions-modal-title mobile-notes-modal-title" id="mobile-notes-modal-title">
        <IconNotes width="20" height="20" aria-hidden="true" />
        {uiText.notes.title}
      </h2>
      <button
        class="mobile-actions-modal-close"
        on:click={closeModal}
        aria-label={texts.ariaLabels.close}
      >
        ✕
      </button>
    </div>
    <div class="mobile-actions-modal-content mobile-notes-modal-content">
      <p class="mobile-notes-modal-hint">{uiText.notes.hint}</p>
      <textarea
        class="mobile-action-input mobile-notes-modal-textarea"
        bind:value={notes}
        on:blur={onSave}
        on:input={onInput}
        placeholder={uiText.notes.placeholder}
      ></textarea>
    </div>
  </div>
</div>
