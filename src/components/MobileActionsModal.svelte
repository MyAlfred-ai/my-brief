<script>
  /**
   * Modale plein écran des actions, sur mobile — pendant de ActionsPanel.
   * Même contrat : le bouton d'une carte MASQUE l'action (elle se rétablit
   * depuis « Actions masquées », en bas), et les champs vides s'affichent en
   * placeholder, jamais remplis d'un texte de remplacement.
   */
  import HiddenActionsList from './HiddenActionsList.svelte';

  export let visibleActions;
  export let hiddenActions = [];
  export let texts;
  export let uiText;
  export let removeAction;
  export let restoreAction = () => {};
  export let closeModal;
  export let saveSessionData = () => {};
  export let addManualAction = () => {};
</script>

<div
  class="mobile-actions-modal-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="mobile-actions-modal-title"
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
  <div
    class="mobile-actions-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="mobile-actions-modal-title"
  >
    <div class="mobile-actions-modal-header">
      <h2 class="mobile-actions-modal-title" id="mobile-actions-modal-title">
        {texts.sections.actionsTitle} ({visibleActions.length})
      </h2>
      <button
        class="mobile-actions-modal-close"
        on:click={closeModal}
        aria-label={texts.ariaLabels.close}
      >
        ✕
      </button>
    </div>
    <div class="mobile-actions-modal-content">
      <button class="mobile-add-action-btn" type="button" on:click={addManualAction}>
        {texts.buttons.addAction}
      </button>
      <!-- Keyé : les actions détectées sont ajoutées en tête de liste. -->
      {#each visibleActions as a (a.id)}
        <div class="mobile-action-item">
          <div class="mobile-action-header">
            <input
              class="mobile-action-title mobile-action-input"
              type="text"
              bind:value={a.title}
              on:blur={saveSessionData}
              placeholder={uiText.actions.actionPlaceholder}
            />
            <div class="mobile-action-header-controls">
              {#if a.newBadge}
                <span class="mobile-action-badge">{a.newBadge}</span>
              {/if}
              <button
                type="button"
                class="mobile-action-delete-btn"
                on:click={() => removeAction(a)}
                title={texts.buttons.hideAction}
                aria-label={texts.buttons.hideAction}
              >
                ✕
              </button>
            </div>
          </div>
          <div class="mobile-action-details">
            <div class="mobile-action-fields-row">
              <div class="mobile-action-field">
                <span class="mobile-action-field-label">{texts.actions.ownerLabel}</span>
                <input
                  class="mobile-action-field-value mobile-action-input"
                  type="text"
                  bind:value={a.owner}
                  on:blur={saveSessionData}
                  placeholder={uiText.actions.ownerPlaceholder}
                />
              </div>
              <div class="mobile-action-field">
                <span class="mobile-action-field-label">{texts.actions.deadlineLabel}</span>
                <input
                  class="mobile-action-field-value mobile-action-input"
                  type="date"
                  bind:value={a.dueDate}
                  on:change={saveSessionData}
                />
              </div>
            </div>
            <div class="mobile-action-description">
              <span class="mobile-action-field-label">{texts.actions.descriptionLabel}</span>
              <textarea
                class="mobile-action-field-value mobile-action-input mobile-action-textarea"
                bind:value={a.description}
                on:blur={saveSessionData}
              ></textarea>
            </div>
          </div>
        </div>
      {/each}
      <HiddenActionsList actions={hiddenActions} {uiText} onRestore={restoreAction} />
    </div>
  </div>
</div>
