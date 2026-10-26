/**
 * Traitement des fichiers audio importés
 */

/**
 * Extrait le texte de transcription d'une réponse de /record, dont le format
 * a historiquement varié (JSON objet/tableau ou texte brut — tolérance
 * conservée). Partagé entre l'import manuel (processAudio) et la
 * transcription différée des segments hors ligne (platform/offlineRecording).
 * @returns {string|null}
 */
export function extractTranscriptionText(responseText, contentType = '') {
  if (!responseText) return null;
  const looksJson =
    contentType.includes('application/json') ||
    responseText.trim().startsWith('{') ||
    responseText.trim().startsWith('[');
  if (!looksJson) return responseText;
  try {
    const result = JSON.parse(responseText);
    if (Array.isArray(result) && result.length > 0) {
      const firstItem = result[0];
      return (
        firstItem.text ||
        firstItem.transcription ||
        firstItem.content ||
        (firstItem.message && firstItem.message.content) ||
        (firstItem.output && firstItem.output.text) ||
        (firstItem.output && firstItem.output.transcription) ||
        null
      );
    }
    if (result.text) return result.text;
    if (result.transcription) return result.transcription;
    if (result.content) return result.content;
    if (result.output) {
      return result.output.text || result.output.transcription || result.output.content || null;
    }
    if (result.message) return result.message.content || result.message.text || null;
    return null;
  } catch (jsonError) {
    return responseText;
  }
}

/**
 * Refus de /record qui ont leur propre message, par slug du serveur
 * (services/api/routes/ai.js). Les autres gardent le message générique, qui
 * cite la réponse brute.
 */
const RECORD_ERROR_KEYS = {
  record_busy: 'alerts.recordBusy',
  audio_too_long: 'alerts.audioTooLong',
};

/**
 * Clé uiText d'un refus de /record d'après le corps de la réponse ; null quand
 * le refus n'a pas de message dédié, corps non JSON compris.
 * @param {string} responseText
 * @returns {string|null}
 */
export function recordErrorKey(responseText) {
  try {
    const slug = JSON.parse(responseText)?.error;
    return typeof slug === 'string' && Object.hasOwn(RECORD_ERROR_KEYS, slug)
      ? RECORD_ERROR_KEYS[slug]
      : null;
  } catch {
    return null;
  }
}

/**
 * Traite un fichier audio et le transcrit
 * @param {Object} config - Configuration
 * @param {Blob|File} config.audioBlob - Fichier audio à traiter
 * @param {Function} config.setIsImportingAudio - Fonction pour définir l'état d'import
 * @param {Function} config.addTranscription - Fonction pour ajouter une transcription
 * @param {Function} config.formatMessage - Fonction pour formater les messages
 * @param {string} config.apiBaseUrl - URL de base de l'API
 * @returns {Promise<void>}
 */
export async function processAudio(config) {
  const {
    audioBlob,
    setIsImportingAudio,
    addTranscription,
    formatMessage,
    apiBaseUrl = '/api',
  } = config;

  setIsImportingAudio(true);
  try {
    const formData = new FormData();
    const fileName = audioBlob instanceof File ? audioBlob.name : 'audio.webm';

    formData.append('data', audioBlob, fileName);

    console.log('Envoi du fichier audio:', {
      fileName: fileName,
      fileSize: audioBlob.size,
      fileType: audioBlob.type || 'non défini',
      isFile: audioBlob instanceof File,
    });

    const response = await fetch(`${apiBaseUrl}/record`, {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const responseText = await response.text();
      const rawResponse = responseText;
      const transcriptionText = extractTranscriptionText(responseText, contentType);

      console.log('Réponse /record - Status:', response.status);
      console.log('Réponse /record - Content-Type:', contentType || 'non défini');
      console.log('Réponse /record - Longueur:', rawResponse?.length || 0);

      if (!rawResponse || rawResponse.length === 0) {
        throw new Error(formatMessage('alerts.audioImportEmpty'));
      }

      if (!transcriptionText || transcriptionText.trim().length === 0) {
        throw new Error(formatMessage('alerts.audioImportNoSpeech'));
      }

      // Ajouter la transcription
      addTranscription(transcriptionText.trim(), 'Import');
    } else {
      const errorText = await response.text();
      // Refus attendu (serveur occupé) : dire quoi faire plutôt que citer la
      // réponse brute.
      const key = recordErrorKey(errorText);
      if (key) {
        alert(formatMessage(key));
        return;
      }
      throw new Error(
        formatMessage('alerts.audioImportServer', { status: response.status, detail: errorText }),
      );
    }
  } catch (error) {
    console.error('Erreur lors du traitement audio:', error);
    alert(formatMessage('alerts.audioImportError', { error: error.message }));
  } finally {
    setIsImportingAudio(false);
  }
}

/**
 * Durée d'un fichier audio, en secondes entières — via les métadonnées d'un
 * élément <audio>, sans décoder le flux. Best-effort : 0 si le navigateur ne
 * sait pas lire le format ou n'annonce pas de durée finie (WebM tronqué…).
 * Sert de durée de réunion aux imports, qui n'ont pas de chronomètre.
 * @param {Blob} file
 * @returns {Promise<number>}
 */
export function readAudioDurationS(file) {
  return new Promise((resolve) => {
    let url = '';
    const done = (seconds) => {
      if (url) URL.revokeObjectURL(url);
      resolve(seconds);
    };
    try {
      url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () =>
        done(
          Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : 0,
        );
      audio.onerror = () => done(0);
      audio.src = url;
    } catch {
      done(0);
    }
  });
}
