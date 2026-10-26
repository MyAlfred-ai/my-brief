<script>
  /**
   * Surcouche mobile de la réunion : l'accès aux notes et aux actions, et
   * pendant la réunion la barre de commandes du bas. La colonne desktop
   * Actions+Notes (.side-col) est masquée sur mobile — ces relais sont le
   * seul accès.
   *
   * Deux visages, selon `live` (enregistrement ou pause) :
   *   - en réunion : la barre MobileMeetingBar (Notes · Actions · Pause ⇄
   *     Reprendre · Terminer) remplace le dock et les boutons flottants ;
   *     « Terminer » ouvre la feuille EndMeetingSheet, qui explique les trois
   *     fins et relaie le choix aux mêmes fonctions qu'appelle le dock
   *     (résumer, enregistrer sans résumé, supprimer) ;
   *   - hors réunion (réunion arrêtée ou archive ouverte) : deux boutons
   *     flottants NOMMÉS, « Notes » et « Actions », au-dessus du dock.
   *
   * L'état ouvert/fermé vit ici ; App ne fournit que les données et les
   * callbacks (dont `fabFlash`, allumé à chaque action détectée/affinée).
   * Fermer les notes sauve (onSaveNotes) : le blur du textarea ne survit pas
   * au démontage de la modale. La frappe, elle, part en base en différé
   * (onNotesInput), comme sur desktop. La feuille de fin se referme AVANT
   * l'action : la carte de génération ou la confirmation de suppression
   * s'ouvrent sous rien.
   */
  import MobileActionsModal from './MobileActionsModal.svelte';
  import MobileNotesModal from './MobileNotesModal.svelte';
  import MobileMeetingBar from './MobileMeetingBar.svelte';
  import EndMeetingSheet from './EndMeetingSheet.svelte';
  import IconNotes from '~icons/solar/notes-linear';
  import IconChecklist from '~icons/solar/checklist-minimalistic-linear';

  export let visibleActions;
  export let hiddenActions = [];
  export let texts;
  export let uiText;
  export let fabFlash = false;
  export let notes = '';
  export let removeAction;
  export let restoreAction = () => {};
  export let saveSessionData = () => {};
  export let addManualAction = () => {};
  export let onSaveNotes = () => {};
  export let onNotesInput = () => {};

  // ── Réunion en cours : la barre du bas ────────────────────────────────
  /** Enregistrement ou pause : la barre remplace les boutons flottants. */
  export let live = false;
  export let isPaused = false;
  export let analyser = null;
  /** La réunion est en base et sans résumé : « Enregistrer sans résumé » a un sens. */
  export let canSave = false;
  export let onPause = () => {};
  export let onResume = () => {};
  export let onOpenPicker = () => {};
  export let onSave = () => {};
  export let onRequestDelete = () => {};

  let showActionsModal = false;
  let showNotesModal = false;
  let showEndSheet = false;

  function closeNotesModal() {
    showNotesModal = false;
    onSaveNotes();
  }

  /** La feuille se referme d'abord : ce qui suit s'ouvre sous rien. */
  function endWith(action) {
    showEndSheet = false;
    action();
  }

  function handleEscape(e) {
    if (e.key !== 'Escape') return;
    if (showActionsModal) {
      e.preventDefault();
      e.stopPropagation();
      showActionsModal = false;
    }
    if (showNotesModal) {
      e.preventDefault();
      e.stopPropagation();
      closeNotesModal();
    }
  }
</script>

<svelte:window on:keydown={handleEscape} />

{#if live}
  <MobileMeetingBar
    {isPaused}
    {analyser}
    {fabFlash}
    actionsCount={visibleActions.length}
    hasNotes={!!notes.trim()}
    onNotes={() => (showNotesModal = true)}
    onActions={() => (showActionsModal = true)}
    {onPause}
    {onResume}
    onEnd={() => (showEndSheet = true)}
  />
{:else}
  <!-- Boutons flottants (mobile only, CSS), nommés — notes et actions ont
       chacune leur modale, accessibles avant la 1re action détectée. -->
  <div class="mobile-fab-row">
    <button
      type="button"
      class="mobile-notes-fab"
      on:click={() => (showNotesModal = true)}
      aria-label={uiText.notes.title}
      title={uiText.notes.title}
    >
      <IconNotes width="20" height="20" aria-hidden="true" />
      <span class="mobile-fab-label">{uiText.meetingBar.notes}</span>
      {#if notes.trim()}
        <span class="mobile-notes-fab-dot" aria-hidden="true"></span>
      {/if}
    </button>
    <button
      type="button"
      class="mobile-actions-fab"
      class:mobile-actions-fab-flash={fabFlash}
      on:click={() => (showActionsModal = true)}
      aria-label={texts.sections.actionsTitle}
    >
      <IconChecklist width="20" height="20" aria-hidden="true" />
      <span class="mobile-fab-label">{uiText.meetingBar.actions}</span>
      <span class="mobile-actions-fab-count">{visibleActions.length}</span>
    </button>
  </div>
{/if}

{#if showEndSheet}
  <EndMeetingSheet
    {canSave}
    onSummarize={() => endWith(onOpenPicker)}
    onSave={() => endWith(onSave)}
    onDelete={() => endWith(onRequestDelete)}
    onCancel={() => (showEndSheet = false)}
  />
{/if}

{#if showActionsModal}
  <MobileActionsModal
    {visibleActions}
    {hiddenActions}
    {texts}
    {uiText}
    {removeAction}
    {restoreAction}
    {saveSessionData}
    {addManualAction}
    closeModal={() => (showActionsModal = false)}
  />
{/if}

{#if showNotesModal}
  <MobileNotesModal
    bind:notes
    {uiText}
    {texts}
    onSave={onSaveNotes}
    onInput={onNotesInput}
    closeModal={closeNotesModal}
  />
{/if}
