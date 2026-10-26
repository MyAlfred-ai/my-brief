/**
 * Projection de $uiText vers l'objet `texts` passé aux composants du template
 * d'App.svelte (ActionsPanel, MobileActionsModal…). Extrait tel quel
 * d'App.svelte — pur, aucune logique : seule la liste des clés réellement
 * consommées par les enfants vit ici.
 */
export function buildTemplateTexts(uiText) {
  return {
    sections: {
      summaryTitle: uiText.sections.summaryTitle,
      transcriptionTitle: uiText.sections.transcriptionTitle,
      transcriptionSubtitle: uiText.sections.transcriptionSubtitle,
      actionsTitle: uiText.sections.actionsTitle,
      actionsSubtitle: uiText.sections.actionsSubtitle,
      actionsHint: uiText.sections.actionsHint,
    },
    buttons: {
      record: uiText.buttons.record,
      stop: uiText.buttons.stop,
      resume: uiText.buttons.resume,
      generateSummary: uiText.buttons.generateSummary,
      summaryGenerating: uiText.buttons.summaryGenerating,
      export: uiText.buttons.export,
      downloadPDF: uiText.buttons.downloadPDF,
      addAction: uiText.buttons.addAction,
      hideAction: uiText.buttons.hideAction,
      newMeeting: uiText.buttons.newMeeting,
      hideTranscription: uiText.buttons.hideTranscription,
      showTranscription: uiText.buttons.showTranscription,
    },
    actions: {
      ownerLabel: uiText.actions.ownerLabel,
      deadlineLabel: uiText.actions.deadlineLabel,
      descriptionLabel: uiText.actions.descriptionLabel,
    },
    ariaLabels: {
      resizeSummary: uiText.ariaLabels.resizeSummary,
      resizeColumns: uiText.ariaLabels.resizeColumns,
      close: uiText.ariaLabels.close,
      closeModal: uiText.ariaLabels.closeModal,
    },
    app: {
      languageToggleLabel: uiText.app.languageToggleLabel,
    },
    resumeLoading: uiText.resumeLoading,
  };
}
