/**
 * Utilitaires de formatage
 */

/**
 * Formate la durée conditionnellement (MM:SS si < 1h, HH:MM:SS sinon)
 * @param {number} seconds - Durée en secondes
 * @returns {string} - Durée formatée
 */
export function formatDurationConditional(seconds) {
  if (seconds >= 3600) {
    // Format HH:MM:SS si >= 1 heure
    const hours = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, '0');
    const minutes = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${secs}`;
  } else {
    // Format MM:SS si < 1 heure
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  }
}

/**
 * Formate la durée en HH:MM:SS (toujours)
 * @param {number} seconds - Durée en secondes
 * @returns {string} - Durée formatée en HH:MM:SS
 */
export function formatDurationHHMMSS(seconds) {
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
}

/**
 * Horodatage d'une ligne de transcription : durée écoulée depuis le début de
 * l'enregistrement, et heure murale du poste.
 * @param {number} elapsedSeconds
 * @param {Date} [now]
 * @returns {{timeStr: string, timestamp: string}}
 */
export function transcriptStamp(elapsedSeconds, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return {
    timeStr: formatDurationHHMMSS(elapsedSeconds),
    timestamp: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  };
}

/**
 * Normalise une date au format YYYY-MM-DD
 * @param {string} dateString - Date à normaliser
 * @returns {string} - Date normalisée ou chaîne vide
 */
export function normalizeDate(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return '';
  }

  // Nettoyer la chaîne
  const cleaned = dateString.trim();

  // Si c'est déjà au format YYYY-MM-DD, le retourner tel quel
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // Essayer de parser avec Date (gère la plupart des formats)
  try {
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // Continuer avec les autres méthodes de parsing
  }

  // Si c'est au format DD-MM-YYYY ou DD/MM/YYYY (format européen)
  // On privilégie ce format car l'application est en français
  const ddmmyyyy = cleaned.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (ddmmyyyy) {
    const firstPart = parseInt(ddmmyyyy[1], 10);
    const secondPart = parseInt(ddmmyyyy[2], 10);
    const year = ddmmyyyy[3];

    // Si le premier nombre est > 12, c'est probablement DD-MM-YYYY
    // Sinon, on assume DD-MM-YYYY (format européen)
    if (firstPart > 12) {
      const day = ddmmyyyy[1].padStart(2, '0');
      const month = ddmmyyyy[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    } else if (secondPart > 12) {
      // Si le second nombre est > 12, c'est MM-DD-YYYY
      const month = ddmmyyyy[1].padStart(2, '0');
      const day = ddmmyyyy[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    } else {
      // Ambiguïté : on privilégie DD-MM-YYYY (format européen)
      const day = ddmmyyyy[1].padStart(2, '0');
      const month = ddmmyyyy[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // Si aucun format n'est reconnu, retourner une chaîne vide
  return '';
}
