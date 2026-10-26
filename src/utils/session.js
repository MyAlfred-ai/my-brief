/**
 * Gestion de la session et du stockage local
 */

import { normalizeActions } from './liveActionsMerge.js';

/**
 * Retire les marqueurs d'animation avant écriture : ils ne décrivent qu'un
 * instant de l'interface. Persistés, ils feraient re-pulser des cartes au
 * rechargement, et partiraient en base via le corps de /resume.
 */
function stripActionFlashes(detectedActions) {
  if (!Array.isArray(detectedActions)) return [];
  return detectedActions.map(({ flash, flashAt, updatedFields, ...rest }) => rest);
}

/**
 * Même discipline pour la transcription : `refineFlash` (surlignage furtif des
 * mots corrigés par la relecture, cf. utils/transcriptRefine.js) est un état
 * d'animation, pas du contenu — rejoué au reload, il mentirait.
 */
function stripRefineFlashes(transcriptionHistory) {
  if (!Array.isArray(transcriptionHistory)) return [];
  return transcriptionHistory.map(({ refineFlash, ...rest }) => rest);
}

/**
 * Sauvegarde les données de session dans le localStorage
 * @param {Object} config - Configuration
 * @param {Array} config.transcriptionHistory - Historique des transcriptions
 * @param {string} config.transcriptionFullText - Texte complet des transcriptions
 * @param {Array} config.detectedActions - Actions détectées
 * @param {string} config.summaryText - Texte du résumé
 * @param {string|null} config.currentMeetingId - Réunion AFFICHÉE, sauvée avec son contenu
 * @param {Function} config.getDefaultSummaryTextFor - Fonction pour obtenir le texte par défaut
 * @param {string} config.currentLanguage - Langue actuelle
 */
export function saveSessionData(config) {
  const {
    transcriptionHistory,
    transcriptionFullText,
    detectedActions,
    meetingNotes,
    summaryText,
    summaryVersions,
    activeVersionId,
    currentMeetingId,
    getDefaultSummaryTextFor,
    currentLanguage,
  } = config;

  try {
    localStorage.setItem(
      'mybrief_transcription_history',
      JSON.stringify(stripRefineFlashes(transcriptionHistory)),
    );
    localStorage.setItem('mybrief_transcription_full_text', transcriptionFullText);
    localStorage.setItem(
      'mybrief_detected_actions',
      JSON.stringify(stripActionFlashes(detectedActions)),
    );
    // Notes de réunion : même cycle de vie que la transcription (restaurées au
    // reload, effacées par clearSessionData). `undefined` = appelant d'avant la
    // fonctionnalité : on ne touche pas à la clé.
    if (meetingNotes !== undefined) {
      localStorage.setItem('mybrief_meeting_notes', meetingNotes || '');
    }

    // Identité de la réunion affichée, sauvée AVEC son contenu : c'est elle qui
    // fait qu'un rechargement recolle l'écran restauré au bon document. Sans
    // elle, le tag disparaissait des écrans résumé/transcription et « Nouveau
    // résumé » repartait sans meetingId — le serveur créait alors une SECONDE
    // conversation dans l'historique. `undefined` = appelant d'avant le champ.
    if (currentMeetingId !== undefined) {
      if (currentMeetingId) {
        localStorage.setItem('mybrief_current_meeting_id', currentMeetingId);
      } else {
        localStorage.removeItem('mybrief_current_meeting_id');
      }
    }

    // Sauvegarder summaryText si différent de la valeur par défaut
    if (summaryText !== getDefaultSummaryTextFor(currentLanguage)) {
      localStorage.setItem('mybrief_summary_text', summaryText);
    }

    if (Array.isArray(summaryVersions) && summaryVersions.length > 0) {
      localStorage.setItem('mybrief_summary_versions', JSON.stringify(summaryVersions));
      if (activeVersionId) {
        localStorage.setItem('mybrief_active_version_id', activeVersionId);
      }
    } else {
      localStorage.removeItem('mybrief_summary_versions');
      localStorage.removeItem('mybrief_active_version_id');
    }

    console.log('Données de session sauvegardées');
  } catch (e) {
    console.error('Erreur lors de la sauvegarde de la session:', e);
  }
}

/**
 * Brouillon des notes SEUL, à chaque frappe. Les notes partent en base au fil
 * de la frappe (stores/notesActionsSave.js) : si la copie locale n'était
 * écrite qu'au blur, un rechargement réafficherait une version plus ancienne
 * que la base — et la retouche suivante la réécrirait par-dessus. Une clé, pas
 * tout l'instantané : la transcription d'une longue réunion pèse des centaines
 * de Ko, à resérialiser à chaque touche.
 *
 * Refusé si la session locale est celle d'une AUTRE réunion : restaurées au
 * rechargement avec la transcription et l'identifiant d'une réunion, les notes
 * d'une autre partiraient dans la première. L'appelant écrit alors
 * l'instantané entier (saveSessionData), qui remet tout d'accord.
 *
 * @param {string} notes
 * @param {string|null} meetingId - réunion affichée
 * @returns {boolean} false si la session locale porte une autre réunion
 */
export function saveMeetingNotesDraft(notes, meetingId) {
  try {
    const storedId = localStorage.getItem('mybrief_current_meeting_id') || null;
    if (storedId !== (meetingId || null)) return false;
    localStorage.setItem('mybrief_meeting_notes', notes || '');
    return true;
  } catch (e) {
    console.error('Erreur lors de la sauvegarde des notes:', e);
    return true; // stockage indisponible : l'instantané entier échouerait pareil
  }
}

/**
 * Restaure les données de session depuis le localStorage — miroir exact de
 * saveSessionData, appelé au montage d'App. Renvoie un objet TOUJOURS complet :
 * chaque champ porte sa valeur restaurée ou son défaut, l'appelant décide de ce
 * qu'il applique (certains états d'App ne doivent pas être écrasés par un
 * défaut, comme le texte de résumé initial).
 *
 * @param {Object} config - Configuration
 * @param {Function} config.getDefaultSummaryTextFor - Texte de résumé par défaut
 * @param {string} config.currentLanguage - Langue actuelle
 * @returns {{transcriptionHistory: Array, transcriptionFullText: string,
 *   detectedActions: Array, meetingNotes: string, summaryText: string,
 *   actionIdCounter: number, summaryVersions: Array, activeVersionId: string|null,
 *   currentMeetingId: string|null}}
 */
export function restoreSessionData(config) {
  const { getDefaultSummaryTextFor, currentLanguage } = config;

  const restored = {
    transcriptionHistory: [],
    transcriptionFullText: '',
    detectedActions: [],
    meetingNotes: '',
    summaryText: '',
    actionIdCounter: 0,
    summaryVersions: [],
    activeVersionId: null,
    currentMeetingId: null,
  };

  try {
    const savedTranscription = localStorage.getItem('mybrief_transcription_history');
    if (savedTranscription) {
      restored.transcriptionHistory = JSON.parse(savedTranscription);
    }

    restored.transcriptionFullText = localStorage.getItem('mybrief_transcription_full_text') || '';
    restored.meetingNotes = localStorage.getItem('mybrief_meeting_notes') || '';
    // Cible d'écriture de l'écran restauré (tag, versions, autosaves, nouvelle
    // génération). Cohérente par construction : écrite par saveSessionData en
    // même temps que le contenu ci-dessus.
    restored.currentMeetingId = localStorage.getItem('mybrief_current_meeting_id') || null;

    const savedActions = localStorage.getItem('mybrief_detected_actions');
    if (savedActions) {
      // Les enregistrements d'avant la détection en direct peuvent contenir des
      // actions sans id : le rendu est keyé dessus et les mises à jour du
      // modèle s'y adossent, donc on en attribue un au passage. Les textes de
      // remplacement d'autrefois (« À définir »…) sont vidés du même coup.
      const { actions: parsedActions, idCounter } = normalizeActions(JSON.parse(savedActions));
      restored.detectedActions = parsedActions;
      if (parsedActions.length > 0) {
        restored.actionIdCounter = idCounter;
      }
    }

    const savedSummary = localStorage.getItem('mybrief_summary_text');
    if (savedSummary && savedSummary !== getDefaultSummaryTextFor(currentLanguage)) {
      restored.summaryText = savedSummary;
    }

    const savedVersions = localStorage.getItem('mybrief_summary_versions');
    if (savedVersions) {
      try {
        const parsed = JSON.parse(savedVersions);
        // Une version encore en génération au moment de la sauvegarde n'a pas
        // de contenu : la restaurer afficherait un onglet « … » mort.
        const finalized = Array.isArray(parsed) ? parsed.filter((v) => !v.pending) : [];
        if (finalized.length > 0) {
          restored.summaryVersions = finalized;
          const savedActiveId = localStorage.getItem('mybrief_active_version_id');
          restored.activeVersionId = finalized.find((v) => v.id === savedActiveId)
            ? savedActiveId
            : finalized[finalized.length - 1].id;
          // Le texte affiché suit la version active — la clé summary_text peut
          // dater d'une autre version que celle qu'on ré-ouvre.
          const cur = finalized.find((v) => v.id === restored.activeVersionId);
          if (cur) restored.summaryText = cur.html;
        }
      } catch (e) {
        console.warn('Versions de résumé invalides en localStorage', e);
      }
    }
  } catch (e) {
    console.error('Erreur lors de la restauration de la session:', e);
  }

  return restored;
}

/**
 * Efface toutes les données de session
 */
export function clearSessionData() {
  try {
    localStorage.removeItem('mybrief_transcription_history');
    localStorage.removeItem('mybrief_transcription_full_text');
    localStorage.removeItem('mybrief_detected_actions');
    localStorage.removeItem('mybrief_meeting_notes');
    localStorage.removeItem('mybrief_summary_text');
    localStorage.removeItem('mybrief_summary_versions');
    localStorage.removeItem('mybrief_active_version_id');
    localStorage.removeItem('mybrief_current_meeting_id');
    localStorage.removeItem('mybrief_cumulative_recording_time');
    localStorage.removeItem('mybrief_session_active');
    console.log('Données de session effacées');
  } catch (e) {
    console.error("Erreur lors de l'effacement de la session:", e);
  }
}
