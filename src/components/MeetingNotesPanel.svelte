<script>
  /**
   * Panneau « Notes de réunion » — sous le panneau Actions, dans la colonne
   * de droite (.side-col, App.svelte). Texte libre tapé pendant la réunion,
   * envoyé avec la transcription à la génération du résumé : il en complète
   * le contenu, et corrige l'orthographe des noms/sigles transcrits dans des
   * cas limitatifs — consigne explicite, sigle défini, mot écorché
   * (cf. buildNotesBlock, src/config/templates.js).
   *
   * La hauteur ne se règle pas ici : c'est la grille de .side-col qui partage
   * la colonne (moitié/moitié par défaut), le bouton ne fait que basculer
   * `expanded` remonté au parent. Le brouillon est sauvé au blur (onSave),
   * comme les champs des cartes d'action ; chaque frappe (onInput) programme
   * en plus l'écriture en base, différée — une note tapée sur une réunion
   * rouverte n'attend plus un nouveau résumé pour être gardée.
   */
  import IconNotes from '~icons/solar/notes-linear';
  import IconChevronUp from '~icons/solar/alt-arrow-up-linear';
  import InfoHint from './ui/InfoHint.svelte';

  export let notes = '';
  export let expanded = false;
  export let uiText;
  export let onToggleExpanded = () => {};
  export let onSave = () => {};
  export let onInput = () => {};

  $: toggleLabel = expanded ? uiText.notes.shrinkPanel : uiText.notes.expandPanel;
</script>

<div class="notes-panel" class:np-expanded={expanded}>
  <div class="np-header">
    <IconNotes width="18" height="18" class="np-title-icon" />
    <span class="np-title">{uiText.notes.title}</span>
    <!-- Panneau collé au bas de l'écran : la bulle s'ouvre vers le haut. -->
    <InfoHint place="above" label={uiText.notes.hintLabel} text={uiText.notes.hint} />
    <button
      class="np-expand-btn"
      on:click={onToggleExpanded}
      aria-label={toggleLabel}
      aria-expanded={expanded}
      title={toggleLabel}
    >
      <IconChevronUp width="16" height="16" />
    </button>
  </div>
  <div class="np-card">
    <textarea
      class="np-textarea"
      bind:value={notes}
      on:blur={onSave}
      on:input={onInput}
      placeholder={uiText.notes.placeholder}
    ></textarea>
  </div>
</div>
