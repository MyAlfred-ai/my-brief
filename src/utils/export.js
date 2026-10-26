/**
 * Import d'un fichier audio et remise à zéro de la réunion — la mécanique,
 * sans état : App fournit l'état par des setters.
 */

/**
 * Déclenche l'upload d'un fichier audio
 */
export function uploadAudio() {
  const input = document.getElementById('audioUpload');
  if (input) {
    input.click();
  }
}

/**
 * Gère l'upload d'un fichier audio
 * @param {Event} event - Événement de changement de fichier
 * @param {Function} processAudio - Fonction pour traiter l'audio
 * @param {Function} formatMessage - Fonction pour formater les messages
 */
export async function handleAudioUpload(event, processAudio, formatMessage) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  // Vérifier que c'est bien un fichier audio
  if (!file.type.startsWith('audio/')) {
    alert(formatMessage('alerts.invalidAudioFile'));
    event.target.value = '';
    return;
  }

  // Vérifier la taille du fichier (max 25MB)
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
  if (file.size > MAX_FILE_SIZE) {
    alert(formatMessage('alerts.fileTooLarge'));
    event.target.value = '';
    return;
  }

  try {
    await processAudio(file);
    event.target.value = '';
  } catch (error) {
    console.error('Erreur lors du traitement du fichier audio:', error);
    event.target.value = '';
  }
}

/**
 * Démarre une nouvelle réunion
 * @param {Object} config - Configuration
 */
export function startNewMeeting(config) {
  const {
    setTranscriptionHistory,
    setTranscriptionFullText,
    setDetectedActions,
    setVisibleActions,
    setActionIdCounter,
    setSummaryText,
    setRecordedAudioUrl,
    setRecordedFilename,
    setCumulativeRecordingTime,
    getDefaultSummaryTextFor,
    currentLanguage,
    clearSessionData,
    saveSessionData,
    setStatus,
  } = config;

  setTranscriptionHistory([]);
  setTranscriptionFullText('');
  setDetectedActions([]);
  setVisibleActions([]);
  setActionIdCounter(0);
  setSummaryText(getDefaultSummaryTextFor(currentLanguage));
  setRecordedAudioUrl('');
  setRecordedFilename('');
  setCumulativeRecordingTime(0);

  clearSessionData();
  saveSessionData();
  setStatus('statuses.ready');
}
