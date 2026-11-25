<script>
  import { tick, onMount } from 'svelte';
  import { currentLanguageStore, uiText } from './store.js';
  import './styles/tokens.css';
  import '../style.css';
  import WhatsNewBadge from './components/WhatsNewBadge.svelte';
  import logoUrl from './logo.webp';
  import IconMicBold from '~icons/solar/microphone-2-bold';
  import IconDownload from '~icons/solar/download-minimalistic-linear';
  import IconPlayCircle from '~icons/solar/play-circle-linear';
  import MobileAppBar from './components/MobileAppBar.svelte';
  import WelcomeScreen from './components/WelcomeScreen.svelte';
  import IconRotate from '~icons/solar/smartphone-linear';
  import { isValidTranscription } from './utils/transcriptionValidation.js';
  import {
    formatDurationConditional,
    formatDurationHHMMSS,
    transcriptStamp,
    meetingElapsed,
  } from './utils/formatUtils.js';
  import { createPlatformWakeLock } from './platform/keepAwake.js';
  import { isNative, nativePlugin } from './platform/index.js';
  import { saveFile, interceptAnchorDownload } from './platform/download.js';
  import { getCachedToken, handleAppUrl, logout as nativeAuthLogout } from './platform/auth.js';
  import {
    startBackgroundRecording,
    stopBackgroundRecording,
  } from './platform/backgroundRecording.js';
  import {
    isOfflineCaptureSupported,
    isGapCaptureSupported,
    startOfflineCapture,
    notifyOfflineLiveState,
    endOfflineCapture,
    flushOfflineQueue,
    purgeOfflineOrphans,
  } from './platform/offlineRecording.js';
  import { makeGapMarkerItem, resolveGapMarker, recomputeFullText } from './utils/offlineGaps.js';
  import NativeLoginGate from './components/NativeLoginGate.svelte';
  import { lockPortraitOrientation } from './utils/orientation.js';

  import {
    normalizeSummaryHtml,
    pendingVersionFrom,
    afterFailedGeneration,
    meetingStartIso,
  } from './utils/summary.js';
  import { buildAttributedTranscript, selfSpeakerLabel } from './utils/transcriptAttribution.js';
  import { assignSpeaker } from './utils/transcriptSpeakers.js';
  import { injectKeepAliveSignal as injectKeepAlive } from './utils/audioKeepAlive.js';
  import { createSilenceDetector } from './lib/audio/silenceDetector.js';
  import { unpackHistoryItem } from './utils/historySelection.js';
  import {
    persistVersionHtml,
    persistTranscription,
    requestMeetingTitle,
    addVersion,
    deleteVersion,
  } from './services/meetingsApi.js';
  import { recordDeepLink, consumeRecordDeepLink } from './stores/recordDeepLink.js';
  import { resolveLogoutTarget, PLUGIN_LOGOUT_PATH } from './utils/logoutTarget.js';
  import { processAudio as processAudioUtil, readAudioDurationS } from './utils/audioProcessing.js';
  import {
    saveSessionData as saveSessionDataUtil,
    coalesceSaves,
    saveMeetingNotesDraft,
    restoreSessionData,
    clearSessionData,
  } from './utils/session.js';
  import { generatePDF as generatePDFUtil } from './utils/pdf.js';
  import { buildActionAttachment, documentNameFor } from './utils/documentExport.js';
  import { applyLiveDelta, applyLiveFinal, finalInsertIndex } from './utils/transcriptLive.js';
  import {
    splitActionsForPrompt,
    mergeDetectedActions,
    clearActionFlashes,
    toStoredActions,
    prependManualAction,
    setActionShown,
    FLASH_DURATION_MS,
  } from './utils/liveActionsMerge.js';
  import { createNotesActionsSaver } from './stores/notesActionsSave.js';
  import { buildActionWindow, createActionScheduler } from './utils/actionDetectionScheduler.js';
  import { createNotesRefiner } from './utils/transcriptRefine.js';
  import { learnFromNotes } from './utils/noteLearning.js';
  import { refineSentences } from './services/transcriptApi.js';
  import { buildTemplateTexts } from './utils/templateTexts.js';
  import { actionDetection } from './stores/actionDetection.js';
  import { orgContext, setOrgContext } from './stores/orgContext.js';
  import { correctTranscript, adoptCorrections } from './stores/transcriptCorrections.js';
  import { flashCorrections } from './utils/transcriptCorrections.js';
  import { templateListFrom } from './config/templates.js';
  import { createTranscriptDeltaTracker } from './utils/transcriptDeltas.js';
  import { get as apiGet, post as apiPost, raw as apiRaw } from './services/apiClient.js';
  import { activePanel, openPanel, closePanel, syncFromHash } from './stores/panels.js';
  import { playContinuePromptSound } from './utils/continuePromptSound.js';
  import {
    sidebarOpen,
    closeSidebarDrawer,
    toggleSidebar,
    syncSidebarToWidth,
  } from './stores/sidebar.js';
  import {
    historyItems,
    isLoadingHistory,
    historyError,
    selectedMeetingId,
    selectedHistoryItem,
    meetingIdOf,
    applyTitleOverrides,
    getDeletedHistoryIds,
    deleteMeeting,
    pollHistoryUntilMeetingReady,
    loadHistoryList,
    historyItemWithContent,
  } from './stores/history.js';
  import { loadTags, tagMeeting, summaryTag } from './stores/tags.js';
  import { showToast as showGlobalToast, removeToast } from './stores/toasts.js';
  import { createRealtimeStack } from './lib/realtime/stack.js';
  import { createCaptureGuard } from './lib/recording/captureGuard.js';
  import { setAudioEnabled } from './lib/recording/tracks.js';
  import {
    createLiveSessionKeeper,
    readLiveSession,
    clearLiveSession,
    settleRestoredHistory,
    readRecordingClock,
    seedRecordingClock,
  } from './utils/liveSession.js';
  import { planMeetingResume, resumeMarkerParts } from './utils/meetingResume.js';
  import {
    connectionState,
    isRecordingStore,
    isPausedStore,
    liveMeetingIdStore,
    liveElapsedStore,
  } from './stores/recording.js';
  import { quota, applyQuota, refreshQuota, confirmQuotaExhausted } from './stores/quota.js';
  import { acquireStartTempKey } from './utils/tempKeyStart.js';
  import { periodMonths } from './utils/quotaFormat.js';
  import { formatText } from './utils/i18nFormat.js';
  import { meetingTypeAsked, askMeetingType, answerMeetingType } from './stores/meetingType.js';
  import {
    startLiveMeeting,
    stopLiveMeeting,
    disposeLiveMeeting,
    flushLiveTranscription,
    closeInterruptedMeeting,
  } from './stores/liveMeeting.js';
  import {
    beginSummaryGeneration,
    endSummaryGeneration,
    pendingVersionFor,
  } from './stores/summaryGeneration.js';
  import { buildAiErrorNoticeView, providerSuffix } from './utils/aiErrorNotice.js';
  import { isValidUserName } from './utils/userIdentity.js';

  // Deep-links #config/#my-templates/#admin : le hash est la source de vérité.
  syncFromHash();
  import {
    uploadAudio,
    handleAudioUpload as handleAudioUploadUtil,
    startNewMeeting as startNewMeetingUtil,
  } from './utils/export.js';
  import {
    handleHttpError,
    handleFetchError,
    forceReauth,
    autoRecoverFromAuthError,
    categorizeApiError,
    aiErrorMessageKey,
    logAiServiceError,
    inspectAiServiceError,
    registerRecordingGuard,
    consumeDeferredAuthError,
  } from './utils/httpErrorHandler.js';
  import {
    baseUrl,
    aiBaseUrl,
    RECONNECT_INTERVAL_MS,
    REALTIME_SILENT_STREAM_MS,
    REALTIME_SILENCE_CHECK_MS,
    MAX_RECORDING_DURATION_MS,
    CONTINUE_PROMPT_AFTER_MS,
    CONTINUE_PROMPT_INTERVAL_MS,
    CONTINUE_PROMPT_TIMEOUT_MS,
    RECORDING_AUDIO_BITS_PER_SECOND,
    CAPTURE_MARKER_MIN_MS,
  } from './config/constants.js';
  import { uiTextData, defaultSummaryTexts } from './config/uiText.js';
  import { buildTemplateOptions, resolveSummaryPlan } from './config/templates.js';

  // Imports des composants
  import EditableTranscript from './components/EditableTranscript.svelte';
  import ResumeMeetingCta from './components/ResumeMeetingCta.svelte';
  import LiveTranscript from './components/LiveTranscript.svelte';
  import MobileMeetingOverlays from './components/MobileMeetingOverlays.svelte';
  import WelcomeModal from './components/WelcomeModal.svelte';
  import MeetingTypeModal from './components/MeetingTypeModal.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Dock from './components/Dock.svelte';
  import TemplatePickerPanel from './components/TemplatePickerPanel.svelte';
  import DocumentBar from './components/DocumentBar.svelte';
  import AdminPanel from './components/lazy/AdminPanel.svelte'; // chargés à la demande
  import TagSelect from './components/TagSelect.svelte';
  import ActionsPanel from './components/ActionsPanel.svelte';
  import MeetingNotesPanel from './components/MeetingNotesPanel.svelte';
  import ConfirmDeleteModal from './components/ConfirmDeleteModal.svelte';
  import SettingsPanel from './components/lazy/SettingsPanel.svelte';
  import BrowserAudioNotice from './components/BrowserAudioNotice.svelte';
  import { buildAudioConstraints } from './utils/audioConstraints.js';
  import { currentAudioCaptureSupport } from './utils/browserAudioSupport.js';
  import { audioDevices } from './stores/audioDevices.js';
  import { acquireSystemAudio, systemAudioPath } from './lib/audio/systemAudio.js';
  import { recordingStartErrorKey, startCancelledError } from './utils/recordingErrors.js';
  import MarkdownEditor from './components/lazy/MarkdownEditor.svelte';
  import SummarySaveStatus from './components/SummarySaveStatus.svelte';
  import AiErrorNotice from './components/AiErrorNotice.svelte';
  import ResumeOverlays from './components/ResumeOverlays.svelte';
  import SignInScreen from './components/auth/SignInScreen.svelte';
  import ChangePasswordModal from './components/auth/ChangePasswordModal.svelte';
  import ToastHost from './components/ToastHost.svelte';
  import QuotaLiveAlert from './components/QuotaLiveAlert.svelte';
  import StoreApprovalDialog from './components/settings/StoreApprovalDialog.svelte';
  import AfterSummaryDialog from './components/AfterSummaryDialog.svelte';
  import { offerAfterSummary } from './stores/afterSummary.js';
  import { actionAvailability, loadMailAccountStatus } from './stores/actionAvailability.js';
  import { auth, signedOut, setUserFromInit, signOut } from './stores/auth.js';
  import { branding, applyBrandColors } from './stores/branding.js';
  import { runEmailAction, runStoreAction, buildActionDocument } from './utils/postActions.js';

  let microphoneStream;
  let systemAudioStream;
  let mixedAudioStream;
  let audioContext;
  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;
  let isPaused = false;
  let shouldGenerateOnStop = false;
  let pendingGenerateOpts = null;
  let shouldOpenPickerOnStop = false;
  let saveOnStop = false; // « Enregistrer » pendant l'enregistrement : ranger après la clôture
  let showDeleteModal = false;
  let transcriptionHistory = [];
  let transcriptionFullText = '';
  // Selon le modèle réglé en administration, une transcription finale arrive en
  // PLUS des deltas déjà affichés : ce suiveur évite la phrase en double.
  const deltaTracker = createTranscriptDeltaTracker();

  let detectedActions = [];
  let visibleActions = [];
  let actionIdCounter = 0;
  // Une analyse est en cours (indicateur discret dans l'en-tête du panneau).
  let actionAnalysisInFlight = false;
  // Sur mobile le panneau est masqué : le bouton flottant signale à sa place
  // qu'une action vient d'être créée ou affinée.
  let fabFlash = false;
  let fabFlashTimer = null;
  // Incrémenté à chaque nouvelle réunion : une réponse d'analyse qui arrive
  // après la bascule ne doit pas déposer ses actions dans la réunion suivante.
  let meetingToken = 0;

  // Notes libres tapées pendant la réunion (panneau sous les actions) : jointes
  // à /resume — contenu du résumé + référence d'orthographe des noms/sigles.
  let meetingNotes = '';
  let notesExpanded = false;

  // Analyse relancée à chaque segment finalisé, un seul appel à la fois.
  // Le rythme vient de l'administration et est lu À CHAQUE FOIS, jamais capturé :
  // un réglage changé pendant la réunion s'applique sans redémarrer.
  const actionScheduler = createActionScheduler({
    // Rien en consultation d'archive : une relance analyserait SES actions, et y écrirait.
    getContent: () =>
      savedLiveState !== null
        ? ''
        : buildActionWindow(transcriptionHistory, $actionDetection.windowSize, userInfo?.name),
    run: (content) => detectActions(content),
    onStateChange: (value) => (actionAnalysisInFlight = value),
    getMinSentences: () => $actionDetection.minSentences,
    isEnabled: () => $actionDetection.enabled,
  });
  // Relecture des 2 dernières phrases transcrites à la lumière des notes
  // (graphie des noms/sigles), avec surlignage furtif des mots corrigés —
  // application, garde-fous et flash vivent dans utils/transcriptRefine.js.
  const transcriptRefiner = createNotesRefiner({
    getHistory: () => transcriptionHistory,
    setHistory: (h) => (transcriptionHistory = h),
    getNotes: () => meetingNotes,
    isActive: () => isRecording && savedLiveState === null,
    post: refineSentences,
    editTranscription: (i, t) => editTranscription(i, t),
  });
  // Sauvegarde des notes : le brouillon part comme avant, la relecture repasse
  // sur les dernières phrases (« je tape le nom correct » corrige ce qui vient
  // d'être dit), et un remplacement écrit là est retenu pour les réunions suivantes.
  function handleNotesSave() {
    saveNotesActions();
    transcriptRefiner.notify();
    learnFromNotes(meetingNotes, showToast);
  }
  // Notes et actions en base au fil des modifications (stores/notesActionsSave.js).
  const notesActionsSaver = createNotesActionsSaver({
    read: () => ({ meetingId: currentMeetingId, notes: meetingNotes, actions: detectedActions }),
    onOutcome: (o) => o === 'error' && showToast('alerts.notesActionsSaveError', 'error', 5000),
  });
  function saveNotesActions() {
    saveSessionData();
    notesActionsSaver.schedule();
  }
  // Frappe dans les notes : clé locale des notes seule (cf. saveMeetingNotesDraft), base en différé.
  function handleNotesInput() {
    if (!saveMeetingNotesDraft(meetingNotes, currentMeetingId)) saveSessionData();
    notesActionsSaver.schedule();
  }
  let templateOptions = [];
  let customTemplates = [];
  let userTemplates = [];
  // Changement de mot de passe volontaire (menu profil). Le changement FORCÉ,
  // lui, est piloté par $auth.user.mustChangePassword.
  let showChangePassword = false;

  // Vérifier et initialiser la langue depuis le store
  if (!['fr', 'en'].includes($currentLanguageStore)) {
    currentLanguageStore.set('fr');
    localStorage.setItem('mybrief_language', 'fr');
  }

  let recordingStartTime;
  let recordingInterval;
  let liveTranscriptionInterval;
  let cumulativeRecordingTime = 0; // Temps total cumulé en secondes
  // Durée connue HORS chronomètre (réunion rouverte depuis l'historique,
  // média importé) : sans elle, une régénération écrivait « Durée : 00:00:00 ».
  let fallbackMeetingDuration = 0;
  let currentTemplate = 'standard';
  let clientSecret;
  // Modèle de transcription réglé en administration, annoncé par /tempkey et relu
  // par les canaux à chaque rotation (cf. realtime/channel.js).
  let transcriptionModel = '';
  let wsAudioProcessor = null;
  // 2e flux de transcription dédié à l'audio système (personne distante). Le micro
  // reste le flux primaire (micChannel, tag 'local') ; ce flux-ci est tagué
  // 'remote' et affiché en violet. Best-effort : son échec ne casse pas le micro.
  let wsAudioProcessorSys = null;
  let canResumeSession = false;
  let liveTranscript;

  // Panneau actions : repli persistant (donne plus de place au résumé)
  let actionsPanelCollapsed = (() => {
    try {
      return localStorage.getItem('mybrief_actions_collapsed') === '1';
    } catch {
      return false;
    }
  })();
  function toggleActionsPanel() {
    actionsPanelCollapsed = !actionsPanelCollapsed;
    try {
      localStorage.setItem('mybrief_actions_collapsed', actionsPanelCollapsed ? '1' : '0');
    } catch {}
  }
  // Ajout depuis le rail replié : crée l'action puis déplie pour la montrer.
  function addActionFromCollapsed() {
    addManualAction();
    if (actionsPanelCollapsed) {
      actionsPanelCollapsed = false;
      try {
        localStorage.setItem('mybrief_actions_collapsed', '0');
      } catch {}
    }
  }

  function handleSelectHistory(meetingId) {
    // Ligne de la réunion EN COURS : son document est encore un brouillon
    // (transcription partielle, aucun résumé) — l'ouvrir afficherait une page
    // vide. On revient au direct, sur sa transcription.
    if (meetingId && meetingId === $liveMeetingIdStore && (isRecording || isPaused)) {
      activeTab = 'transcription';
      restoreLiveSession();
      closeSidebarDrawer();
      return;
    }
    selectHistoryItem(meetingId);
    closeSidebarDrawer();
  }

  async function handleNewMeetingMobile() {
    startNewMeeting();
    closeSidebarDrawer();
    await toggleRecording();
  }
  let recordedAudioUrl = '';
  let recordedFilename = '';
  let isRequestingMic = false;
  let isImportingAudio = false;
  let showWelcomeModal = false;
  // Invite « Poursuivre ? » : première à CONTINUE_PROMPT_AFTER_MS de durée TOTALE,
  // puis toutes les CONTINUE_PROMPT_INTERVAL_MS. L'enregistrement continue pendant
  // que l'invite est ouverte ; toute fermeture sans « Poursuivre » (timeout 5 min,
  // ×, backdrop, Escape, bouton Arrêter) = arrêt propre avec sauvegarde normale.
  let showContinueModal = false;
  let nextContinuePromptAtMs = CONTINUE_PROMPT_AFTER_MS; // seuil vs durée totale (cumul + actif)
  let continuePromptDeadline = null; // timestamp mur (Date.now) du timeout — robuste au throttling
  let continuePromptDurationLabel = '';
  let continueCountdownDisplay = '';
  let continueCountdownInterval = null; // intervalle 1 s DÉDIÉ (recordingInterval meurt en pause)
  let showDisconnectedModal = false;
  // Échec auth détecté pendant un enregistrement : on ne montre RIEN et on ne
  // recharge JAMAIS (reload = réunion perdue) ; re-vérifié une fois au stop.
  let deferredDisconnected = false;
  // Réunion AFFICHÉE ; celle qui ENREGISTRE vit dans liveMeetingIdStore
  // (stores/liveMeeting.js) — ouvrir une archive change l'une, pas l'autre.
  let currentMeetingId = null;
  // Tag choisi PENDANT l'enregistrement, avant que la réunion existe en base
  // (le meetingId n'arrive qu'avec le premier résumé) : gardé ici, posé dès
  // que l'id arrive. Voir handleRecordingTagPick.
  let pendingTagId = null;
  let savedLiveState = null; // non-null = preview historique pendant enregistrement
  let editDockOpen = false;
  let summaryVersions = [];
  let activeVersionId = null;
  let pendingDeleteVersionId = null;
  let saveIndicator = 'idle'; // 'idle' | 'pending' | 'saved' | 'error'
  let saveDebounceTimer = null;
  let transcriptionSaveTimer = null;
  let statusMessageKey = 'statuses.ready';

  // ─── New layout state ─────────────────────────────────────────────
  let activeTab = 'resume'; // 'resume' | 'transcription'

  $: applyBrandColors($branding);
  $: appLogo = $branding.logo || logoUrl;

  // Derived screen: welcome | recording | active
  // En preview historique pendant enregistrement, afficher 'active' (contenu historique)
  $: screen =
    isRecording && savedLiveState === null
      ? 'recording'
      : transcriptionHistory.length > 0
        ? 'active'
        : 'welcome';

  // Reset pause when recording fully stops
  $: if (!isRecording) isPaused = false;

  // ── Dock ── offert sur l'accueil, pendant la réunion et sa pause, et sur une
  // réunion tout juste arrêtée. Jamais sur une réunion rangée, ni dès que son
  // compte rendu existe : la barre des documents porte alors « Nouveau résumé »,
  // le « Résumer → » du dock ne ferait que le doubler (sur téléphone d'abord,
  // où il volait la place du contenu ; sur ordinateur pour la même raison).
  // `dockOffered` ignore le choix du template — c'est lui qui masque le dock le
  // temps du choix, sans que la barre gagne un bouton pendant ce temps.
  $: dockOffered =
    !generatingHere &&
    (screen === 'welcome' ||
      isRecording ||
      isPaused ||
      !($selectedMeetingId || hasGeneratedSummary));
  $: dockVisible = dockOffered && !editDockOpen;

  // Filet : quel que soit le chemin d'arrêt (dock, Media Session, résumé,
  // plafond 8 h…), l'invite « Poursuivre ? » ne doit pas survivre à l'arrêt.
  $: if (!isRecording && showContinueModal) closeContinuePrompt();

  // Auto-restore live session when recording stops during history preview
  let _prevRecordingActive = false;
  $: {
    const nowActive = isRecording || isPaused;
    if (_prevRecordingActive && !nowActive && savedLiveState !== null) {
      restoreLiveSession();
    }
    _prevRecordingActive = nowActive;
  }

  // Auto-generate after stop-for-generate (replay opts captured at click time)
  $: if (!isRecording && shouldGenerateOnStop && transcriptionHistory.length > 0) {
    shouldGenerateOnStop = false;
    const replayOpts = pendingGenerateOpts;
    pendingGenerateOpts = null;
    generateSummary(replayOpts);
  }

  // Ouvre le sélecteur de templates après arrêt (dock : "Générer" pendant
  // l'enregistrement doit d'abord stopper avant d'afficher le picker).
  $: if (!isRecording && shouldOpenPickerOnStop && transcriptionHistory.length > 0) {
    shouldOpenPickerOnStop = false;
    activeTab = 'resume';
    editDockOpen = true;
  }

  function openTemplatePicker() {
    if (isRecording) {
      isPaused = false;
      shouldOpenPickerOnStop = true;
      stopRecording();
      releaseWakeLock();
      return;
    }
    activeTab = 'resume';
    editDockOpen = true;
  }

  /**
   * « Enregistrer » (dock) : clore SANS compte rendu — la réunion, en base depuis
   * son premier mot, est nommée par IA et ouverte en archive. En cours d'enregistrement,
   * l'arrêt d'abord : closeLiveMeeting reprend la main avec l'identifiant du DIRECT.
   */
  function saveMeeting() {
    if (!isRecording) return fileMeeting(currentMeetingId);
    isPaused = false;
    saveOnStop = true;
    activeTab = 'transcription'; // avant l'arrêt : pas d'onglet Résumé vide le temps de la clôture
    stopRecording();
    releaseWakeLock();
  }

  /** Réunion rangée — avec ses notes et ses actions : ouverte en archive, titre IA en fond. */
  async function fileMeeting(meetingId) {
    if (!meetingId) return;
    $selectedMeetingId = meetingId;
    activeTab = 'transcription';
    editDockOpen = false;
    await notesActionsSaver.settle(meetingId);
    const outcome = await requestMeetingTitle(meetingId, notesActionsSaver.handOver(meetingId));
    if (outcome === 'error') return showToast('alerts.meetingTitleError', 'error', 6000);
    // Seule preuve visible sur téléphone : la liste des réunions y est repliée.
    showToast('messages.meetingSaved', 'success', 4000);
    pollHistoryUntilMeetingReady(meetingId, fetchHistoryItems);
  }

  // Auto-persist summary versions to localStorage whenever they change
  $: {
    const toSave = summaryVersions.filter((v) => !v.pending);
    // Jamais en consultation d'archive : la session locale est celle du direct.
    if (toSave.length > 0 && savedLiveState === null) {
      try {
        localStorage.setItem('mybrief_summary_versions', JSON.stringify(toSave));
      } catch (e) {}
    }
  }
  $: if (activeVersionId && savedLiveState === null) {
    try {
      localStorage.setItem('mybrief_active_version_id', activeVersionId);
    } catch (e) {}
  }

  // Variables pour la reconnexion automatique
  // Toast « Connexion perdue » affiché UNE fois par coupure (pas à chaque retry
  // de 5 s) ; « rétablie » n'est montré que si « perdue » l'a été.

  // Échap. NB : les modales mobiles (actions/notes) gèrent leur propre Escape
  // dans MobileMeetingOverlays.
  function handleEscapeKey(e) {
    if (e.key === 'Escape' && editDockOpen) {
      editDockOpen = false;
    }
    // Spec invite « Poursuivre ? » : toute fermeture sans choix explicite de
    // poursuivre = arrêt + sauvegarde (Escape compris).
    if (e.key === 'Escape' && showContinueModal) {
      e.preventDefault();
      e.stopPropagation();
      handleContinueChoice(false);
    }
  }

  // Fermetures : la navigation (valeur + hash) vit dans stores/panels.js ;
  // ne restent ici que les effets de bord propres à chaque panneau.
  function closeConfig() {
    closePanel();
    // L'utilisateur a pu connecter ou déconnecter son Gmail depuis le panneau :
    // la visibilité du bouton « Envoyer par mail » doit suivre.
    loadMailAccountStatus();
    // …et créer ou modifier des templates, désormais section du même panneau :
    // le sélecteur du dock doit suivre lui aussi.
    loadUserTemplates();
  }

  // Ramène l'écran principal (transcription) au premier plan.
  //
  // L'administration est montée DANS le layout : elle masque `main-area` mais
  // PAS la sidebar. Depuis l'administration, tout ce qui se déclenche depuis la
  // sidebar — démarrer une réunion, ouvrir une conversation, revenir au direct —
  // se produisait donc derrière le panneau, sans rien à l'écran pour le dire.
  // Toute action dont le résultat doit SE VOIR passe par ici.
  function showMainScreen() {
    // « Réglages » est montée dans le layout au même titre que
    // l'administration : elle masque `main-area` et doit donc se refermer sur
    // les mêmes actions. (« Mes templates » garde son bouton fermer dédié,
    // comportement historique conservé.)
    if ($activePanel === 'config') closeConfig();
    if ($activePanel !== 'admin') return;
    closePanel();
    // Les modèles ont pu être modifiés depuis l'administration.
    loadCustomTemplates();
  }
  // Accueil = « Nouvelle réunion » sans démarrer : panneaux et réunion affichée
  // refermés. Jamais au prix de la réunion qui enregistre — son direct revient.
  function goWelcome() {
    if (isRecording || isPaused) return restoreLiveSession();
    showMainScreen();
    if (screen !== 'welcome' || $selectedMeetingId) startNewMeeting();
  }
  let wakeLockMgr = null;
  let activateWakeLock = async () => {};
  let releaseWakeLock = () => {};
  let releaseOrientationLock = () => {};
  let statusReplacements = {};
  let statusState = '';

  // Menu profil (sidebar) : mappe les actions vers les fonctions existantes.
  // Remplace l'ancien menu hamburger — les deep-links #config/#my-templates/#admin
  // restent gérés par le listener hashchange plus bas.
  // « Réglages », « Mes templates » et l'administration sont trois
  // panneaux `flex: 1` du même layout : ouverts ensemble, ils se
  // partageraient la largeur.
  function handleSidebarMenuAction(id) {
    // Tiroir (téléphone, tablette) : le geste aboutit ailleurs (panneau,
    // modale…) — laissé ouvert, il masquerait ce qu'il vient d'ouvrir.
    closeSidebarDrawer();
    switch (id) {
      // Templates, tags et import sont des SECTIONS de « Réglages » :
      // le raccourci ouvre le panneau sur la bonne.
      case 'config':
      case 'templates':
      case 'tags':
      case 'import':
        openPanel('config', id === 'config' ? '' : id);
        break;
      case 'stats':
        openPanel('config', 'usage');
        break;
      case 'admin':
        openPanel(id);
        break;
      // « Retour à l'accueil » du mode réglages : l'écran principal, tel quel.
      case 'home':
        showMainScreen();
        break;
      // Logo (sidebar, barre d'app) : l'écran d'accueil lui-même.
      case 'welcome':
        goWelcome();
        break;
      case 'password':
        showChangePassword = true;
        break;
      case 'logout':
        logout();
        break;
    }
  }

  // Système de notifications toast

  // État de connexion pour l'indicateur visuel
  // État partagé (stores/recording.js) : App écrit, les composants lisent.
  $: isRecordingStore.set(isRecording);
  $: isPausedStore.set(isPaused);

  // ── Realtime : la pile entière (deux canaux, deux superviseurs, chien de garde
  // « transcription muette », télémétrie) vit dans src/lib/realtime/stack.js.
  // Ici, uniquement le câblage sur l'état d'écran et l'AudioContext.
  const realtime = createRealtimeStack({
    wsUrl: aiBaseUrl.replace(/^https?:\/\//, 'wss://') + '?intent=transcription',
    getLang: () => $currentLanguageStore,
    getModel: () => transcriptionModel,
    // `clientSecret` sert aussi de `sessionId` à la génération du résumé : seule
    // la clé du canal micro (`primary`) le met à jour, jamais celle du système.
    onTempKey: ({ secret, model, primary }) => {
      if (primary) clientSecret = secret;
      transcriptionModel = model || transcriptionModel;
    },
    fetchTempKey: (query) => apiGet(`/tempkey?${query}`),
    isRecording: () => isRecording,
    isPaused: () => isPaused,
    onMessage: handleMessage,
    onConnectionState: (state) => ($connectionState = state),
    // Capture hors ligne (natif) : le live (re)vient ou tombe — ferme/ouvre le
    // gap ; l'audio de la coupure sera transcrit en différé au retour du réseau.
    onLiveStateChange: notifyOfflineLiveState,
    onGapMarker: insertOfflineGapMarker,
    // Le processor système lit le canal à chaque frame : ne le recréer qu'au
    // premier rattachement, jamais à chaque rotation (sinon on empile des
    // ScriptProcessorNode sur le même nœud source).
    onSystemReady: () => {
      if (systemAudioNode && !wsAudioProcessorSys) setupSystemAudioProcessor(systemAudioNode);
    },
    showToast,
    getMeetingId: () => $liveMeetingIdStore || currentMeetingId,
    rotationMs: RECONNECT_INTERVAL_MS,
    staleMs: REALTIME_SILENT_STREAM_MS,
    silenceCheckMs: REALTIME_SILENCE_CHECK_MS,
  });

  // Réunion non arrêtée retrouvée au lancement (utils/liveSession.js), et son
  // identifiant le temps que la reprise rouvre SON document.
  let interruptedSession = null;
  let resumeMeetingId = null;
  // Reprise d'une réunion TERMINÉE : part du chronomètre déjà comptée au quota
  // par le serveur, que le crédit en direct ne doit pas déduire deux fois.
  let resumedCountedS = 0;

  // PWA et Service Worker
  let serviceWorkerRegistration = null;
  let isPWA = false;
  let silentAudioElement = null;
  let silentAudioContext = null;

  // Keep-alive audio : détecteur de silence (lib/audio/silenceDetector.js) et
  // nœud de gain des bouffées, débranché à l'arrêt.
  let audioKeepAliveGainNode = null;
  let silenceDetector = null;
  let outputDestination = null;
  let connectivityCheckInterval = null;

  // Ce que ce navigateur capte au-delà du micro (utils/browserAudioSupport.js).
  // « Navigateur partiellement compatible » : Firefox et Safari sur ordinateur,
  // tant qu'aucun périphérique « son de l'ordinateur » n'y est choisi.
  const audioCapture = currentAudioCaptureSupport();
  let showBrowserWarningModal =
    audioCapture.desktop && !audioCapture.shareAudio && !$audioDevices.system;
  // Porte de connexion native (Capacitor) : affichée sans jeton mobile ou
  // après un 401 (événement mybrief:native-auth-required). Jamais sur le web.
  let showNativeLogin = false;
  let nativeLoginError = '';
  const API_PING_INTERVAL_MS = 2 * 60 * 1000;

  // Déclarations réactives qui se mettent à jour quand la langue change
  $: visibleActions = detectedActions.filter((action) => action.show !== false);
  $: hiddenActions = detectedActions.filter((action) => action.show === false);
  // Template tag for the active summary version (rendered as a discreet header)
  $: activeVersion = summaryVersions.find((v) => v.id === activeVersionId) || null;
  $: activeTemplateOption = activeVersion?.template
    ? templateOptions.find((o) => o.value === activeVersion.template) || null
    : null;
  $: activeTemplateLabel = activeTemplateOption
    ? activeTemplateOption.labels?.[$currentLanguageStore] ||
      activeTemplateOption.labels?.fr ||
      activeTemplateOption.value
    : activeVersion?.template || null;
  $: activeTemplateIcon = activeTemplateOption?.icon || '';
  $: recLabel = isPaused ? $uiText.meetingBar.pausedShort : $uiText.nativeRecording.notifBody;
  $: actionsStatsLabel = formatMessage('actions.countsLabel', {
    visible: visibleActions.length,
    hidden: hiddenActions.length,
  });

  // Toutes les traductions utilisées dans le template - réactives via $uiText.
  // Projection extraite dans utils/templateTexts.js (cliquet max-lines).
  $: texts = buildTemplateTexts($uiText);

  let summaryText = getDefaultSummaryTextFor($currentLanguageStore);

  // Variable réactive pour détecter si un résumé a été généré
  $: hasGeneratedSummary = summaryText !== getDefaultSummaryTextFor($currentLanguageStore);
  // Compte rendu en cours pour la réunion AFFICHÉE — voile, carte, dock et
  // partage attendent ici, pas sur une autre réunion ouverte entre-temps. Vrai
  // tant que sa version en attente est à l'écran (stores/summaryGeneration.js).
  $: generatingHere = summaryVersions.some((v) => v.pending);
  /** Titre d'une réunion de l'historique — pour la nommer dans une notification. */
  const titleOf = (id) =>
    $historyItems.find((it) => meetingIdOf(it) === String(id))?.title ||
    t('sidebar.defaultMeetingTitle');
  // « Enregistrer » (dock) : une réunion en base à nommer, et pas encore de compte rendu.
  $: canSave = isRecording ? !!$liveMeetingIdStore : !!currentMeetingId && !summaryVersions.length;

  // Actions après réunion / résumé ouvertes à ce compte : stores/actionAvailability.js.

  // L'identité vit dans le store (src/stores/auth.js) : la Sidebar, l'AdminPanel
  // et l'écran de connexion en ont besoin sans traverser tout l'arbre de props.
  // Les ~20 lectures de `userInfo` ci-dessous restent inchangées ; seules les
  // ÉCRITURES passent désormais par setUserFromInit()/signedOut() — une
  // affectation directe serait écrasée au tick suivant par cette ligne réactive.
  $: userInfo = $auth.user;

  // Accès à l'administration : SEULE source, le rôle du document `user` tel que
  // le serveur le renvoie — c'est exactement ce que vérifie `requireAdmin` sur
  // les routes /api/admin. Pour désigner un administrateur sur une installation
  // existante : ADMIN_EMAILS dans le .env du déploiement (cf. install/readme.md).

  // ─── Configuration utilisateur (menu « Réglages ») ───────────────────
  // Micro et son de l'ordinateur choisis : stores/audioDevices.js (par appareil).
  // userContext : « MA configuration », texte synchronisé via le backend et injecté
  // avant chaque génération de CR.
  let userContext = '';

  // Acquiert un flux micro. Si le device sélectionné est indisponible (débranché,
  // refusé), retombe sur le micro par défaut — garantit que l'enregistrement
  // démarre toujours (zéro régression).
  async function acquireMicrophoneStream() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints($audioDevices.mic),
      });
    } catch (e) {
      if ($audioDevices.mic) {
        console.warn('Micro sélectionné indisponible, retour au micro par défaut:', e);
        return await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraints('') });
      }
      throw e;
    }
  }

  // Charge « MA configuration » depuis le backend (synchronisé par utilisateur).
  async function loadUserConfig() {
    try {
      const res = await apiGet('/user-config');
      if (!res.ok) return;
      const data = res.data;
      userContext = data && typeof data.context === 'string' ? data.context : '';
    } catch (e) {
      console.warn('Chargement de la configuration utilisateur échoué:', e);
    }
  }

  // Sauvegarde « MA configuration » côté backend. Renvoie true si OK.
  async function saveUserConfig(text) {
    const value = (text || '').toString();
    try {
      const res = await apiPost('/user-config/save', { context: value });
      if (!res.ok) return false;
      userContext = value;
      return true;
    } catch (e) {
      console.warn('Sauvegarde de la configuration utilisateur échouée:', e);
      return false;
    }
  }

  //initialisation
  function rebuildTemplateOptions() {
    templateOptions = buildTemplateOptions(userTemplates, customTemplates);
    if (templateOptions.length > 0 && !templateOptions.find((o) => o.value === currentTemplate)) {
      currentTemplate = templateOptions[0].value;
    }
  }

  async function loadCustomTemplates() {
    try {
      const res = await apiGet('/templates');
      if (res.data.error === 'auth_redirect') {
        forceReauth();
        return;
      }
      console.log('[templates] status:', res.status, res.ok);
      if (res.ok) {
        customTemplates = templateListFrom(res.data);
        setOrgContext(res.data?.orgContext);
        adoptCorrections(res.data);
      }
    } catch (e) {
      console.error('[templates] fetch error:', e);
    } finally {
      rebuildTemplateOptions();
    }
  }

  async function loadUserTemplates() {
    try {
      const res = await apiGet('/user-templates');
      if (res.data.error === 'auth_redirect') {
        forceReauth();
        return;
      }
      console.log('[user-templates] status:', res.status, res.ok);
      if (res.ok) {
        userTemplates = templateListFrom(res.data);
      } else if (res.status === 404) {
        userTemplates = [];
      }
    } catch (e) {
      console.error('[user-templates] fetch error:', e);
    } finally {
      rebuildTemplateOptions();
    }
  }

  async function init() {
    // App native sans jeton : inutile d'appeler l'API (tout renverrait 401),
    // on affiche la porte de connexion. init() est rappelé après le login.
    if (isNative && !getCachedToken()) {
      showNativeLogin = true;
      return;
    }
    try {
      const res = await apiGet('/init');
      if (res.data?.error === 'auth_redirect') {
        forceReauth();
        return;
      }
      // « 200 mais pas du JSON » : page de login OIDC ou page d'erreur traefik
      // servie à la place de la réponse attendue (le client la rend sous le
      // slug `invalid_response`). Tente une auto-récupération silencieuse
      // (purge cookies + SW + hard reload) avec backoff.
      if (res.data?.error === 'invalid_response') {
        const recovered = await autoRecoverFromAuthError('init returned HTML');
        if (recovered) return;
        signedOut();
        return;
      }
      if (res.ok) {
        const userData = res.data;
        if (userData && userData.name && !isValidUserName(userData.name)) {
          userData.name = null;
        }
        setUserFromInit(userData);
        applyQuota(userData?.quota);
        if (userData && !localStorage.getItem('mybrief_welcome_shown')) {
          showWelcomeModal = true;
        }
        loadUserConfig();
        loadMailAccountStatus();
      } else {
        signedOut();
      }
    } catch (error) {
      console.warn("Erreur lors de l'init:", error);
      signedOut();
    } finally {
      await Promise.all([loadCustomTemplates(), loadUserTemplates()]);
    }
  }

  // Listen for hash navigation (#admin, #my-templates)
  window.addEventListener('hashchange', () => syncFromHash());

  // Deep-link #record (extension Chrome, stores/recordDeepLink.js) : démarre
  // une réunion dès que la session est connue ; une réunion déjà en cours
  // n'est jamais doublée. Consommé dans tous les cas, sinon la demande
  // attendrait la fin de la réunion en cours pour en lancer une autre.
  $: if ($recordDeepLink && $auth.user) startFromDeepLink();
  function startFromDeepLink() {
    consumeRecordDeepLink();
    if (!isRecording && !isRequestingMic) toggleRecording();
  }

  // Sur le web, init() attend la sonde d'authentification de main.js : partir
  // sur /api/init sans session ferait un 401 inutile et un clignotement de
  // l'interface avant l'écran de connexion. Sur natif, init() gère lui-même sa
  // porte de login, il part tout de suite.
  let appInitialized = false;
  function initOnce() {
    if (appInitialized) return;
    appInitialized = true;
    init();
    fetchHistoryItems().then(reopenSelectedMeeting);
    // Le catalogue de tags conditionne l'affichage des pastilles de la sidebar :
    // il part avec l'historique, pas à l'ouverture du panneau de gestion.
    loadTags();
  }
  if (isNative) initOnce();
  // Archive ouverte au rechargement : son id survit, pas son contenu (l'instantané
  // est celui du DIRECT) — sans relecture, écran mêlé ou accueil sans « Démarrer ».
  // L'app mobile recharge le site à chaque lancement (cf. MOBILE.md).
  function reopenSelectedMeeting() {
    const id = $selectedMeetingId;
    if (!id) return;
    const known = $historyItems.some((it) => meetingIdOf(it) === id);
    if (known && !canResumeSession) selectHistoryItem(id, { reveal: false });
    else $selectedMeetingId = null;
  }
  // Une déconnexion réarme le chargement pour la prochaine connexion.
  $: if ($auth.status === 'signed_out') appInitialized = false;
  // `unknown` inclus : la sonde /api/auth/session ne voit que les sessions
  // NATIVES, jamais une session OIDC (les en-têtes d'identité sont effacés sur
  // ce chemin). C'est /api/init qui tranche pour le SSO — n'attendre que
  // `authenticated` priverait tout utilisateur SSO de ses données.
  // Le verrou mot de passe, lui, bloque : le serveur refuserait les routes
  // applicatives en 428 et on n'afficherait qu'un toast d'erreur.
  $: if (!isNative && $auth.status !== 'signed_out' && !$auth.user?.mustChangePassword) initOnce();

  // Déclenché par l'intercepteur (401/perte de session) sur l'app native :
  // pas de teardown web possible, on rouvre la porte de connexion.
  function onNativeAuthRequired() {
    showNativeLogin = true;
  }

  // Fonction de déconnexion
  function logout() {
    // Le « quoi fermer » est décidé à part, en fonction pure et testée en
    // table : src/utils/logoutTarget.js, qui porte tout le raisonnement.
    const target = resolveLogoutTarget({
      authMode: $auth.user?.authMode,
      isNative,
      oidcEnabled: $auth.capabilities.oidcEnabled,
    });
    localStorage.removeItem('mybrief_welcome_shown');

    // Session native seule : fermée côté serveur, écran de connexion affiché.
    if (target === 'native') {
      signOut();
      return;
    }

    // Native ET plugin encore devant /api : fermer la première ne suffit pas,
    // le second ré-authentifierait la requête suivante en silence.
    if (target === 'native+plugin') {
      signOut();
      window.location.href = PLUGIN_LOGOUT_PATH;
      return;
    }

    signedOut();
    // Best-effort. `keepalive` : la requête survit à la navigation qui suit.
    apiPost('/logout', undefined, { keepalive: true });

    // Mobile : le « cookie » est un JWT local, on le purge sur l'appareil.
    if (target === 'mobile') {
      nativeAuthLogout().finally(() => {
        showNativeLogin = true;
      });
      return;
    }

    // Cookie du plugin : HttpOnly, donc inaccessible en JS. Seul son RP-logout
    // le détruit. En NAVIGATION top-level — un fetch suivrait le 302 vers l'IdP
    // et l'échec CORS serait avalé.
    window.location.href = PLUGIN_LOGOUT_PATH;
  }

  // Reconnexion déclenchée par l'utilisateur depuis la modale « déconnecté ».
  // Navigation top-level vers /login (route protégée OIDC) = UNE initiation
  // propre du flux. On efface le backoff de forceReauth pour ne pas être bloqué.
  function reconnect() {
    try {
      localStorage.removeItem('mybrief_last_reauth');
    } catch (_) {
      /* ignore */
    }
    showDisconnectedModal = false;
    // App native : reconnexion = porte de login (navigateur système), pas de
    // navigation top-level (le bundle local n'a pas de /login).
    if (isNative) {
      showNativeLogin = true;
      return;
    }
    // Web : on affiche l'écran de connexion, qui propose le mot de passe ET le
    // SSO. Naviguer directement vers /login imposerait l'IdP à un utilisateur
    // connecté par mot de passe.
    signedOut();
  }

  // Texte de uiText par chemin pointé ; introuvable ⇒ le chemin lui-même.
  function t(path) {
    return formatText($uiText, path);
  }

  // Même règle que t() : chemin introuvable ⇒ le chemin lui-même (utils/i18nFormat.js).
  const formatMessage = (path, replacements = {}) => formatText($uiText, path, replacements);

  function setStatus(key, state = '', replacements = {}) {
    statusMessageKey = key;
    statusReplacements = { ...replacements };
    statusState = state;
  }

  // ========================================
  // Notice d'erreur IA (carte élégante dans le panneau résumé)
  // ========================================
  // { kind: 'credit'|'service'|'network', provider: string, meetingId } | null
  // Rattachée à la réunion dont la rédaction a échoué : la carte s'affiche sur
  // SA page, pas sur une autre réunion ouverte entre-temps (projection dans
  // utils/aiErrorNotice.js).
  let aiErrorNotice = null;

  function showAiErrorNotice(kind, provider = '', meetingId = currentMeetingId) {
    aiErrorNotice = { kind, provider, meetingId };
  }
  function dismissAiErrorNotice() {
    aiErrorNotice = null;
  }

  $: aiErrorNoticeView =
    aiErrorNotice && aiErrorNotice.meetingId === currentMeetingId
      ? buildAiErrorNoticeView(aiErrorNotice, { t, formatMessage })
      : null;

  // Centralise toast + carte pour une réponse d'API IA en erreur.
  function reportAiError(info, meetingId = currentMeetingId) {
    if (info?.isCredit) {
      showToast('messages.aiCreditExhausted', 'error', 9000, {
        provider: providerSuffix(info.provider),
      });
      showAiErrorNotice('credit', info.provider, meetingId);
    } else {
      showToast('messages.aiServiceError', 'error', 7000);
      showAiErrorNotice('service', '', meetingId);
    }
  }

  // ========================================
  // Système de Toast Notifications
  // ========================================

  /**
   * Toast local d'App : résout la clé i18n (formatMessage) puis délègue au
   * store global (src/stores/toasts.js) — pile, plafond et fermeture y vivent.
   * Les enfants toastent directement via le store, sans passer par ici.
   * @param {string} messageKey - Clé de traduction du message
   * @param {string} type - Type de toast: 'info', 'warning', 'error', 'success'
   * @param {number} duration - Durée d'affichage en ms (0 = permanent)
   * @param {Object} replacements - Remplacements pour le message
   */
  function showToast(messageKey, type = 'info', duration = 4000, replacements = {}) {
    return showGlobalToast(formatMessage(messageKey, replacements), type, duration);
  }

  // ========================================
  // Historique
  // ========================================

  async function fetchHistoryItems() {
    // Rien à charger tant que la session n'est pas établie, ou tant que le
    // changement de mot de passe obligatoire n'est pas fait : le serveur
    // répondrait 428 et l'utilisateur verrait un toast d'erreur derrière la
    // modale qu'il est en train de remplir.
    if (!isNative && ($auth.status === 'signed_out' || $auth.user?.mustChangePassword)) {
      $isLoadingHistory = false; // sinon la sidebar reste sur « Chargement… »
      return;
    }

    $isLoadingHistory = true;
    $historyError = '';

    try {
      const startedAt = Date.now(); // notes et actions encore en vol : cf. reconcile
      // Liste allégée + contenu de la réunion ouverte depuis l'historique
      // (stores/history.js) ; le direct, lui, a déjà le sien à l'écran.
      const res = await loadHistoryList([$selectedMeetingId]);
      if (res.authRedirect) return forceReauth();
      if (!res.items) {
        // Le serveur ne renvoie que des slugs : le texte affiché vient d'ici.
        const expired = res.status === 401 || res.status === 403;
        $historyError = t(
          res.invalid
            ? 'history.invalidFormat'
            : expired
              ? 'history.sessionExpired'
              : 'history.genericError',
        );
        $historyItems = [];
        showToast('alerts.historyLoadError', 'error', 5000, { error: $historyError });
        return;
      }
      const items = res.items;

      const deletedIds = getDeletedHistoryIds();
      const filtered =
        deletedIds.size > 0
          ? items.filter((item) => {
              const id = meetingIdOf(item);
              return !id || !deletedIds.has(id);
            })
          : items;
      const titled = applyTitleOverrides(filtered, $currentLanguageStore);
      $historyItems = notesActionsSaver.reconcile(titled, startedAt);
    } catch (error) {
      // Le client HTTP ne lève plus : il ne reste ici que les échecs de la mise
      // en forme locale (format inattendu).
      console.warn('Historique illisible:', error);
      $historyError = t('history.genericError');
      $historyItems = [];
      showToast('alerts.historyLoadError', 'error', 5000, { error: $historyError });
    } finally {
      $isLoadingHistory = false;
    }
  }

  let pendingDeleteHistoryId = null;

  function requestDeleteHistoryItem(meetingId) {
    pendingDeleteHistoryId = meetingId || null;
  }

  async function confirmDeleteHistoryItem() {
    const meetingId = pendingDeleteHistoryId;
    pendingDeleteHistoryId = null;
    await deleteMeeting(meetingId); // mémoire locale + backend + désélection
  }

  /** Retour visible des autosaves : indicateur discret, toast, relecture.
      Le résumé ne toaste plus au succès (toastKey null) : l'indicateur de la
      barre d'outils suffit — un toast toutes les 1,5 s d'édition était du
      bruit. L'échec, lui, toaste TOUJOURS (errorToastKey) : silence = perte. */
  function applySaveOutcome(outcome, toastKey, errorToastKey) {
    saveIndicator = outcome;
    if (outcome === 'error') {
      if (errorToastKey) showToast(errorToastKey, 'error', 5000);
      return;
    }
    if (outcome !== 'saved') return;
    setTimeout(() => {
      // Ne pas écraser un « Enregistrement… » relancé pendant les 2 s.
      if (saveIndicator === 'saved') saveIndicator = 'idle';
    }, 2000);
    if (toastKey) showToast(toastKey, 'success', 2500);
    fetchHistoryItems();
  }

  async function updateVersionInBackend(meetingId, versionId, html) {
    applySaveOutcome(
      await persistVersionHtml(meetingId, versionId, html),
      null,
      'alerts.summarySaveError',
    );
  }

  async function updateTranscriptionInBackend(meetingId, transcription) {
    applySaveOutcome(
      await persistTranscription(meetingId, transcription),
      'statuses.transcriptionSaved',
      'alerts.transcriptionSaveError',
    );
  }

  function handleSummaryUpdate(html) {
    summaryText = html;
    const meetingId = currentMeetingId;
    const versionId = activeVersionId;
    // Réunion jamais sauvegardée : rien ne partira au backend (persist renvoie
    // 'idle') — ne pas afficher un « Enregistrement… » qui ment.
    saveIndicator = meetingId && versionId ? 'pending' : 'idle';
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      updateVersionInBackend(meetingId, versionId, html);
    }, 1500);
  }

  function handleSummaryBlur(html) {
    summaryText = html;
    updateActiveVersionHtml(summaryText);
    saveSessionData();
    flushSummaryDebounce(summaryText);
  }

  function flushSummaryDebounce(html) {
    if (!saveDebounceTimer) return;
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
    updateVersionInBackend(currentMeetingId, activeVersionId, html);
  }

  function restoreLiveSession() {
    // Avant le garde : la pastille « réunion en cours » de la sidebar s'affiche
    // dès qu'un enregistrement tourne, snapshot ou pas. Sans instantané à
    // restaurer, le direct est déjà à l'écran — encore faut-il que l'écran soit
    // visible.
    showMainScreen();
    if (savedLiveState === null) return;
    const snap = savedLiveState;
    savedLiveState = null;
    transcriptionHistory = snap.transcriptionHistory;
    transcriptionFullText = snap.transcriptionFullText;
    summaryText = snap.summaryText;
    summaryVersions = snap.summaryVersions;
    activeVersionId = snap.activeVersionId;
    currentMeetingId = snap.currentMeetingId;
    detectedActions = snap.detectedActions;
    meetingNotes = snap.meetingNotes;
    visibleActions = snap.detectedActions.filter((a) => a.show !== false);
    $selectedMeetingId = null;
    // La liste affichée change de réunion : voir selectHistoryItem.
    meetingToken += 1;
    saveSessionData();
  }

  async function selectHistoryItem(meetingId, { reveal = true } = {}) {
    notesActionsSaver.flushAll(); // la copie d'historique relue ci-dessous doit être à jour
    // Résolution AVANT tout effet de bord : sans réunion à ouvrir, on ne quitte
    // pas l'écran courant et on ne met pas le direct de côté pour rien. Le
    // contenu (transcription, comptes rendus) arrive ici, pas avec la liste.
    const histoItem = meetingId == null ? null : await historyItemWithContent(meetingId);
    if (histoItem === false) return; // une autre réunion a été ouverte entre-temps
    if (!histoItem)
      return showToast('alerts.historyLoadError', 'error', 5000, {
        error: t('history.genericError'),
      });
    const id = String(meetingId);
    // Ouvrir une conversation, c'est demander à la lire : pendant un
    // enregistrement comme depuis l'administration, l'écran principal revient.
    // Le direct n'est pas interrompu — il est mis de côté juste en dessous et
    // se retrouve par la pastille « réunion en cours » de la sidebar.
    // (`reveal: false` : réouverture au chargement, un panneau ouvert reste.)
    if (reveal) showMainScreen();
    // Si une réunion est en cours, sauvegarder l'état live avant d'afficher l'historique
    if ((isRecording || isPaused) && savedLiveState === null) {
      sessionSaver.flush(); // les dernières phrases, avant la mise de côté
      savedLiveState = {
        transcriptionHistory: [...transcriptionHistory],
        transcriptionFullText,
        summaryText,
        summaryVersions: [...summaryVersions],
        activeVersionId,
        currentMeetingId,
        detectedActions: [...detectedActions],
        meetingNotes,
      };
    }
    $selectedMeetingId = id;
    // Clé d'ÉCRITURE backend, distincte de l'identité d'affichage : strictement
    // `meetingId`. Une entrée héritée identifiée par un repli (uuid, sessionId…)
    // s'ouvre en lecture mais n'écrit rien — les routes filtrent sur meetingId.
    currentMeetingId = histoItem.meetingId ?? null;
    if (!currentMeetingId) console.warn('[selectHistoryItem] sans meetingId', histoItem);
    editDockOpen = false;
    pendingDeleteVersionId = null;
    // L'enregistrement peut continuer pendant la consultation : sans ce jeton,
    // une analyse du direct viendrait déposer ses actions dans la réunion
    // ouverte en lecture. La détection reprendra au segment suivant.
    meetingToken += 1;
    // Document → état d'écran (utils/historySelection.js). TOUS les champs sont
    // réassignés, même vides : sinon l'écran garde la réunion précédente.
    const view = unpackHistoryItem(histoItem, {
      defaultSummaryText: getDefaultSummaryTextFor($currentLanguageStore),
      fallbackTemplate: currentTemplate,
      selfLabel: selfSpeakerLabel(userInfo?.name),
    });
    summaryVersions = view.summaryVersions;
    activeVersionId = view.activeVersionId;
    summaryText = view.summaryText;
    // Sans compte rendu, l'onglet Résumé serait muet : transcription + « Nouveau résumé ».
    activeTab = view.summaryVersions.length > 0 ? 'resume' : 'transcription';
    detectedActions = view.detectedActions;
    visibleActions = view.visibleActions;
    meetingNotes = view.meetingNotes;
    notesActionsSaver.markClean(currentMeetingId, meetingNotes, detectedActions);
    fallbackMeetingDuration = view.fallbackMeetingDuration;
    transcriptionHistory = view.transcriptionHistory;
    // Le texte complet aussi : sinon export, pied de page et génération
    // réutiliseraient le transcriptionFullText d'une autre session.
    transcriptionFullText = view.transcriptionFullText;
    // Compte rendu en cours pour cette réunion : sa version en attente revient
    // dans le rail, sur l'onglet Résumé — l'écran tel qu'on l'a quitté.
    const pending = pendingVersionFor(currentMeetingId);
    if (pending) {
      summaryVersions = [...summaryVersions, pending];
      activeTab = 'resume';
    }
  }

  // ========================================
  // Tenue de la capture : appel, arrière-plan, micro perdu
  // ========================================
  // Constat et rétablissement vivent dans lib/recording/captureGuard.js ; ici,
  // ce qui touche le graphe audio et l'écran.

  let micSourceNode = null; // source du micro dans le graphe, remplacée avec lui
  let captureBlockedToast = null;

  /** Micro redemandé : rebranché PARTOUT où l'ancien l'était — transcription comprise. */
  function adoptMicrophone(stream) {
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = stream;
    // En pause, les pistes sont coupées (pauseRecording) : la nouvelle aussi.
    setAudioEnabled([stream], !isPaused);
    try {
      micSourceNode?.disconnect();
    } catch (e) {}
    micSourceNode = audioContext.createMediaStreamSource(stream);
    micSourceNode.connect(outputDestination);
    if (wsAudioProcessor) micSourceNode.connect(wsAudioProcessor);
    silenceDetector?.addSource(micSourceNode);
  }

  /** Le trou est écrit dans la transcription : le compte rendu sait qu'il manque un passage. */
  function markInterruption(durationMs) {
    const duration = formatDurationConditional(Math.round(durationMs / 1000));
    const text = formatMessage('offlineCapture.interruptionMarker', { duration });
    insertOfflineGapMarker(`cut-${Date.now()}`, text);
    return duration;
  }

  /** Arrière-plan ou fermeture : un téléphone peut tuer la page juste après, sans préavis. */
  function persistBeforeLeaving() {
    sessionKeeper.beat();
    notesActionsSaver.flushAll({ keepalive: true });
    flushLiveTranscription({ leaving: true }).catch(() => {});
  }

  const captureGuard = createCaptureGuard({
    isRecording: () => isRecording,
    isPaused: () => isPaused,
    getAudioContext: () => audioContext,
    getMicStream: () => microphoneStream,
    acquireMic: () => acquireMicrophoneStream(),
    adoptMic: adoptMicrophone,
    onRecovered: ({ durationMs }) => {
      const duration = markInterruption(durationMs);
      showToast('statuses.captureResumed', 'success', 6000, { duration });
    },
    refreshLive: () => realtime.refresh(),
    onBlocked: (blocked) => {
      if (captureBlockedToast) removeToast(captureBlockedToast);
      captureBlockedToast = blocked
        ? showToast('statuses.recordingInterrupted', 'warning', 0)
        : null;
    },
    persist: persistBeforeLeaving,
    onNetwork: (online) => realtime.noteNetwork(online),
  });

  // Témoin « une réunion enregistre », réécrit toutes les 5 s : c'est lui qui
  // propose la reprise après une fermeture sans préavis (utils/liveSession.js).
  const sessionKeeper = createLiveSessionKeeper({
    read: () =>
      isRecording
        ? {
            state: isPaused ? 'paused' : 'recording',
            elapsedS: getTotalMeetingDuration(),
            meetingId: $liveMeetingIdStore || resumeMeetingId,
          }
        : null,
  });

  // ========================================
  // PWA et Media Session
  // ========================================

  /**
   * Détecte si l'app tourne en mode PWA (standalone)
   */
  function detectPWAMode() {
    // App native = « installée » par définition (matchMedia standalone ne
    // matche pas dans une WebView Capacitor).
    isPWA =
      isNative ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');

    if (isPWA) {
      console.log('📱 Mode PWA détecté');
    } else {
      console.log('🌐 Mode navigateur web détecté');
    }

    return isPWA;
  }

  /**
   * Récupère le Service Worker enregistré par vite-plugin-pwa (autoUpdate)
   * et branche les listeners de message pour le keep-alive d'enregistrement.
   */
  async function registerServiceWorker() {
    // App native (server.url) : pas de service worker — la page fraîche est
    // rechargée depuis le site à chaque démarrage, un SW ne ferait que figer
    // une vieille version dans la WebView.
    if (isNative) return null;
    if ('serviceWorker' in navigator) {
      try {
        // serviceWorker.ready ne résout jamais s'il n'y a pas de SW actif
        // (mode dev, ou SW pas encore activé) : borner l'attente.
        serviceWorkerRegistration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (serviceWorkerRegistration) {
          console.log('✅ Service Worker prêt:', serviceWorkerRegistration.scope);
          // Écouter les messages du Service Worker
          navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
        } else {
          console.warn("⚠️ Aucun Service Worker actif — keep-alive d'enregistrement indisponible");
        }
        return serviceWorkerRegistration;
      } catch (error) {
        console.warn('⚠️ Erreur récupération Service Worker:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * Gère les messages du Service Worker
   */
  function handleServiceWorkerMessage(event) {
    if (event.data && event.data.type === 'SW_KEEP_ALIVE') {
      // Le Service Worker nous ping pour nous garder actifs
      if (isRecording && audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
    }
  }

  /**
   * Notifie le Service Worker du status d'enregistrement
   */
  function notifyServiceWorker(isRecordingNow) {
    if (isNative) return; // pas de SW en natif (keep-alive assuré nativement)
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: isRecordingNow ? 'START_KEEP_ALIVE' : 'STOP_KEEP_ALIVE',
      });
    }
  }

  /**
   * Configure l'API Media Session pour les contrôles système
   * Cela aide le système à savoir que l'app fait de l'audio
   */
  function setupMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t('nativeRecording.mediaTitle'),
        artist: 'MyBrief',
        album: t('nativeRecording.mediaAlbum'),
        artwork: [
          { src: '/logo.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo.png', sizes: '512x512', type: 'image/png' },
        ],
      });

      // Définir les actions pour les contrôles système
      navigator.mediaSession.setActionHandler('play', () => {
        if (isRecording && isPaused) resumeRecording();
        else if (!isRecording && transcriptionHistory.length > 0) toggleRecording(); // Reprendre
      });

      // « Pause » du système — écran verrouillé, bouton d'un casque, téléphone
      // qui reprend la main sur l'audio pour un appel : la réunion est mise en
      // PAUSE, pas terminée. Elle l'arrêtait, et un appui involontaire sur un
      // casque Bluetooth la clôturait en base.
      navigator.mediaSession.setActionHandler('pause', () => {
        if (isRecording && !isPaused) pauseRecording();
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        if (isRecording) {
          stopRecording();
        }
      });

      console.log('✅ Media Session configurée');
    }
  }

  /**
   * Met à jour le status de la Media Session
   */
  function updateMediaSessionPlaybackState(state) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state; // 'playing', 'paused', 'none'
    }
  }

  /**
   * Crée et joue un audio silencieux pour maintenir l'app active (astuce PWA)
   * Sur iOS/Safari PWA, l'app peut être suspendue si aucun audio n'est "joué"
   */
  function startSilentAudio() {
    // Cette astuce est cruciale pour les PWA sur iOS
    if (!isPWA) return;

    try {
      // Créer un AudioContext pour générer du silence
      silentAudioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Créer un oscillateur silencieux
      const oscillator = silentAudioContext.createOscillator();
      const gainNode = silentAudioContext.createGain();

      // Volume à zéro (inaudible)
      gainNode.gain.value = 0;

      oscillator.connect(gainNode);
      gainNode.connect(silentAudioContext.destination);

      oscillator.start();

      console.log('🔇 Audio silencieux PWA démarré');

      // Aussi créer un élément audio HTML comme backup
      if (!silentAudioElement) {
        silentAudioElement = document.createElement('audio');
        silentAudioElement.setAttribute('playsinline', '');
        silentAudioElement.setAttribute('webkit-playsinline', '');
        silentAudioElement.loop = true;
        silentAudioElement.volume = 0.01;

        // Créer un audio data URI silencieux (1 seconde de silence)
        // C'est un fichier WAV minimal valide
        const silentWav =
          'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
        silentAudioElement.src = silentWav;

        document.body.appendChild(silentAudioElement);
      }

      // Jouer l'audio silencieux
      silentAudioElement.play().catch((e) => {
        console.warn("⚠️ Impossible de jouer l'audio silencieux:", e);
      });
    } catch (error) {
      console.warn('⚠️ Erreur création audio silencieux:', error);
    }
  }

  /**
   * Arrête l'audio silencieux
   */
  function stopSilentAudio() {
    if (silentAudioContext) {
      try {
        silentAudioContext.close();
        silentAudioContext = null;
      } catch (e) {}
    }

    if (silentAudioElement) {
      silentAudioElement.pause();
      silentAudioElement.currentTime = 0;
    }

    console.log('🔇 Audio silencieux PWA arrêté');
  }

  function getDefaultSummaryTextFor(lang) {
    return defaultSummaryTexts[lang] || defaultSummaryTexts.fr;
  }

  async function setLanguage(lang) {
    if (!uiTextData[lang] || lang === $currentLanguageStore) {
      return;
    }
    const previousDefault = getDefaultSummaryTextFor($currentLanguageStore);
    const previousStatusKey = statusMessageKey;
    const previousStatusState = statusState;
    let replacements = { ...statusReplacements };
    if (previousStatusKey === 'statuses.templateStatus') {
      const currentOption = templateOptions.find((opt) => opt.value === currentTemplate);
      if (currentOption) {
        replacements = { name: currentOption.labels[lang] };
      }
    }

    // Mettre à jour le store (déclenche la réactivité)
    currentLanguageStore.set(lang);
    localStorage.setItem('mybrief_language', lang);

    // Forcer la mise à jour du DOM pour que tous les t() soient recalculés
    await tick();

    if (summaryText === previousDefault) {
      summaryText = getDefaultSummaryTextFor(lang);
    }
    setStatus(previousStatusKey, previousStatusState, replacements);

    // Forcer une seconde mise à jour après tous les changements
    await tick();
  }

  function onMountInit() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert(t('alerts.incompatibleBrowser'));
    }
    setStatus('statuses.ready');
  }

  onMount(async () => {
    // Détecter le mode PWA
    detectPWAMode();

    // Récupérer le Service Worker en arrière-plan — ne pas bloquer le montage
    // (serviceWorker.ready peut ne jamais résoudre s'il n'y a pas de SW actif)
    registerServiceWorker();

    // Configurer la Media Session
    setupMediaSession();

    // Restauration de la session (utils/session.js, miroir de saveSessionData).
    // `currentMeetingId` en fait partie : sans lui, l'écran restauré perdait sa
    // cible d'écriture — le tag disparaissait des écrans résumé/transcription
    // et « Nouveau résumé » créait une conversation en double dans l'historique.
    const restored = restoreSessionData({
      getDefaultSummaryTextFor,
      currentLanguage: $currentLanguageStore,
    });
    transcriptionHistory = restored.transcriptionHistory;
    if (restored.transcriptionFullText) transcriptionFullText = restored.transcriptionFullText;
    meetingNotes = restored.meetingNotes;
    currentMeetingId = restored.currentMeetingId;
    detectedActions = restored.detectedActions;
    visibleActions = restored.detectedActions.filter((action) => action.show !== false);
    if (restored.detectedActions.length > 0) actionIdCounter = restored.actionIdCounter;
    // Défauts NON appliqués : summaryText garde son texte d'accueil tant que
    // rien n'a été restauré, et les versions restent celles du montage.
    if (restored.summaryText) summaryText = restored.summaryText;
    if (restored.summaryVersions.length > 0) {
      summaryVersions = restored.summaryVersions;
      activeVersionId = restored.activeVersionId;
    } else if (!restored.summaryText) activeTab = 'transcription'; // rien sur l'onglet Résumé

    // Réunion interrompue — page fermée ou rechargée, application tuée en
    // arrière-plan (utils/liveSession.js) : ses lignes en cours sont bouclées,
    // son chronomètre repart d'où il s'est arrêté.
    interruptedSession = readLiveSession();
    if (interruptedSession) {
      const settled = settleRestoredHistory(transcriptionHistory, t('offlineCapture.lostMarker'));
      transcriptionHistory = settled.history;
      for (const line of settled.added) transcriptionFullText += `\n${line}`;
      cumulativeRecordingTime = interruptedSession.elapsedS;
      canResumeSession = transcriptionHistory.length > 0;
      if (!canResumeSession) clearLiveSession();
    }

    // Page fermée pendant le délai d'écriture des notes : elles partent quand
    // même. (Pendant l'enregistrement, le garde de capture écrit aussi le reste.)
    window.addEventListener('pagehide', () => notesActionsSaver.flushAll({ keepalive: true }));

    // Wake Lock manager (single source of truth for anti-veille during recording)
    wakeLockMgr = createPlatformWakeLock(() => isRecording);
    activateWakeLock = wakeLockMgr.activate;
    releaseWakeLock = wakeLockMgr.release;

    // Portrait uniquement sur mobile : lock matériel quand possible (PWA
    // Android), sinon l'overlay CSS .rotate-overlay prend le relais.
    releaseOrientationLock = lockPortraitOrientation();

    await tick();

    // Pendant un enregistrement (ou une pause), l'intercepteur auth ne doit
    // JAMAIS déclencher forceReauth (reload = réunion perdue) : il diffère,
    // et stopRecording() re-vérifie la session via pingApi().
    registerRecordingGuard(() => isRecording || isPaused);

    // App native : deep link de retour du login système + événement 401.
    let removeAppUrlListener = null;
    if (isNative) {
      try {
        const handle = await nativePlugin('App').addListener('appUrlOpen', async ({ url }) => {
          try {
            if (await handleAppUrl(url)) {
              nativeLoginError = '';
              showNativeLogin = false;
              init();
              // Le chargement initial de l'historique (onMount) est parti SANS
              // jeton (401 silencieux -> sidebar vide) : le relancer maintenant.
              // Sur le web le problème n'existe pas (reload complet post-login).
              fetchHistoryItems();
            } else if (showNativeLogin) {
              nativeLoginError = $uiText.nativeLogin.error;
            }
          } catch (e) {
            console.error('[auth-native] traitement du deep link:', e);
            if (showNativeLogin) nativeLoginError = $uiText.nativeLogin.error;
          }
        });
        removeAppUrlListener = () => {
          try {
            handle.remove();
          } catch (_) {
            /* ignore */
          }
        };
      } catch (e) {
        console.warn('[auth-native] listener appUrlOpen indisponible:', e);
      }
      window.addEventListener('mybrief:native-auth-required', onNativeAuthRequired);
      // Capture hors ligne : purge des sessions orphelines (app tuée en plein
      // enregistrement, conservées 7 j) + reprise immédiate des uploads
      // différés dès que la WebView repasse en ligne (sortie du mode avion).
      purgeOfflineOrphans();
      window.addEventListener('online', flushOfflineQueue);
    }

    startApiPingMonitor();
    // Web : le chargement est déclenché par initOnce(), quand la session est
    // confirmée — l'appeler ici en plus ferait un doublon réseau au démarrage.
    if (isNative) fetchHistoryItems();

    return () => {
      registerRecordingGuard(() => false);
      stopBackgroundRecording();
      if (removeAppUrlListener) removeAppUrlListener();
      if (isNative) {
        window.removeEventListener('mybrief:native-auth-required', onNativeAuthRequired);
        window.removeEventListener('online', flushOfflineQueue);
      }
      captureGuard.stop();
      stopApiPingMonitor();
      disposeLiveMeeting();
      if (wakeLockMgr) wakeLockMgr.destroy();
      releaseOrientationLock();
    };
  });

  /**
   * Ouvre la réunion en base dès le démarrage (cf. stores/liveMeeting.js) puis
   * la rend visible dans la sidebar. Échec toléré : sans identifiant, on
   * retombe sur l'ancien comportement — la réunion naîtra au premier résumé.
   * Transcription lue par FONCTION : en consultation d'archive, le direct vit
   * dans `savedLiveState`, et lire la mauvaise source écraserait la réunion en
   * cours avec la transcription de celle qu'on lit.
   */
  async function openLiveMeeting() {
    const meetingId = await startLiveMeeting({
      resumeId: resumeMeetingId, // reprise : la réunion continue dans SON document
      readTranscription: () =>
        savedLiveState !== null ? savedLiveState.transcriptionFullText : transcriptionFullText,
    });
    if (!meetingId) return;
    // Archive ouverte pendant l'attente : le direct vit dans le snapshot, l'écran reste à elle.
    if (savedLiveState !== null) savedLiveState.currentMeetingId = meetingId;
    else currentMeetingId = meetingId;
    // Tag choisi avant le démarrage : posé sans attendre le premier compte rendu.
    await postPendingTag(meetingId);
    // La ligne doit apparaître MAINTENANT dans la sidebar, pas au prochain
    // rechargement de l'app.
    fetchHistoryItems();
  }

  /** Clôture de la réunion en direct. Appelée par stopRecording : tous les chemins d'arrêt. */
  async function closeLiveMeeting() {
    const fileIt = saveOnStop; // lu AVANT l'attente réseau : un arrêt suivant n'en hérite pas
    saveOnStop = false;
    const liveId = $liveMeetingIdStore;
    const res = await stopLiveMeeting({
      duration: getTotalMeetingDuration(),
      settled: notesActionsSaver.settle(liveId),
      // Relues au dernier moment, et seulement si l'écran porte encore cette réunion.
      readNotesActions: () => notesActionsSaver.handOver(liveId),
    });
    // Ligne purgée côté serveur (rien n'a été dit) : ne pas garder son id comme
    // cible d'écriture, un résumé généré ensuite viserait un document supprimé.
    if (res?.discarded) {
      if (currentMeetingId === res.meetingId) currentMeetingId = null;
      if ($selectedMeetingId === res.meetingId) $selectedMeetingId = null;
    }
    if (res) await fetchHistoryItems();
    if (fileIt && res && !res.discarded) fileMeeting(res.meetingId);
    // Durée écrite : le compteur de minutes se relit, puis le direct déduit retombe.
    refreshQuota().then(() => liveElapsedStore.set(0));
  }

  /** Quota de minutes atteint : « Démarrer » le dit, et le refus s'explique avec le mois. */
  $: quotaBlocked = $quota.loaded && !$quota.unlimited && $quota.exhausted;
  function refuseQuotaStart() {
    isRequestingMic = false;
    const month = periodMonths($quota.period, $currentLanguageStore).renewal;
    showToast('quota.exhaustedToast', 'warning', 9000, { month });
  }

  async function toggleRecording() {
    if (!isRecording) {
      // « Démarrer » occupé dès ici : pendant la relecture du quota, pas de second départ.
      isRequestingMic = true;
      // Plus de minutes ce mois-ci, confirmé par le serveur : le dire avant le micro.
      // (Une reprise n'est pas un nouveau départ : le serveur ne la refuse pas non plus.)
      if (!resumeMeetingId && quotaBlocked && (await confirmQuotaExhausted()))
        return refuseQuotaStart();
      // Démarrer un enregistrement quitte forcément la consultation d'un
      // historique — sinon $selectedMeetingId reste renseigné après l'arrêt et
      // masque le dock (condition ligne ~5023) alors qu'une session live
      // vient de se terminer.
      $selectedMeetingId = null;
      // …et quitte l'administration : on démarre une réunion pour la voir se
      // transcrire, pas pour rester devant un écran de gestion des comptes.
      showMainScreen();
      resetRecordedAudio();
      audioChunks = [];
      try {
        // App native : le démarrage ne doit JAMAIS dépendre du réseau. Si
        // /tempkey échoue (hors ligne, serveur injoignable, IA en panne),
        // l'enregistrement démarre quand même sans transcription live — la
        // capture segmentée (platform/offlineRecording) prend le relais et la
        // transcription se fait en différé. clientSecret vide = pas de WS.
        clientSecret = '';
        // Verdict de /tempkey (utils/tempKeyStart.js, corps brut inspecté) ; ici, la plateforme décide.
        const key = await acquireStartTempKey({
          lang: $currentLanguageStore,
          meetingId: resumeMeetingId,
          fetchRaw: apiRaw,
        });
        if (key.kind === 'auth') {
          // Session morte alors que le serveur répond : le réseau est là,
          // c'est une vraie ré-auth qu'il faut (natif comme web).
          forceReauth();
          return;
        }
        if (key.kind === 'quota' || (key.kind === 'ai_error' && !isOfflineCaptureSupported())) {
          // Quota : une règle de l'organisation, pas une panne — natif compris,
          // le serveur a répondu. IA inaccessible (crédit, clé, panne) : sur le
          // web on abandonne, en natif on enregistre hors ligne (ci-dessous).
          if (key.kind === 'quota') applyQuota(key.quota);
          if (key.kind === 'quota') refuseQuotaStart();
          else reportAiError(key.info);
          isRequestingMic = false;
          releaseWakeLock();
          setRecordingState(false);
          return;
        }
        // fetch rejeté = réseau absent. Web : abandon (comportement historique
        // via le catch externe). Natif : on enregistre quand même, sans WS.
        if (key.kind === 'unreachable' && !isOfflineCaptureSupported()) throw key.error;
        if (key.kind === 'ok') {
          clientSecret = key.secret;
          transcriptionModel = key.model || transcriptionModel;
        } else {
          console.warn(`🛟 /tempkey ${key.kind} en natif — enregistrement hors ligne`);
        }
        await activateWakeLock();
        await startRecording();
        // La réunion n'est inscrite que si la capture a VRAIMENT démarré :
        // startRecording avale ses échecs (refus micro…) — sans ce test, une
        // ligne vide naissait quand même, avec le service foreground Android.
        if (!isRecording) return;
        // Erreur AVALÉE : ce bloc `catch` coupe l'enregistrement, et rater
        // l'inscription en base ne doit jamais coûter la réunion elle-même.
        await openLiveMeeting().catch((err) =>
          console.warn('[live] ouverture en échec — réunion créée au premier résumé', err),
        );
        // App native Android : service foreground micro (notification
        // persistante) pour continuer écran verrouillé / arrière-plan.
        // APRÈS startRecording : un FGS type microphone exige la permission
        // RECORD_AUDIO déjà accordée (getUserMedia vient de la demander), et
        // l'app est encore au premier plan (le tap date de quelques secondes).
        await startBackgroundRecording({
          title: 'MyBrief',
          body: $uiText.nativeRecording.notifBody,
        });
      } catch (error) {
        isRequestingMic = false;
        console.error(error.message);
        // Libérer le Wake Lock en cas d'erreur
        stopBackgroundRecording();
        releaseWakeLock();
        setRecordingState(false);
        // Pas de réponse (réseau/hors-ligne) ou échec d'ouverture du flux temps
        // réel OpenAI : message clair selon la catégorie (réseau vs service IA).
        const category = categorizeApiError({ error });
        if (category !== 'auth') {
          showToast(aiErrorMessageKey(category), 'error', 7000);
        }
      }
    } else {
      stopRecording();
      releaseWakeLock();
    }
  }

  function resetRecordedAudio() {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      recordedAudioUrl = '';
    }
    recordedFilename = '';
  }

  function setRecordingState(active) {
    isRequestingMic = false; // démarrée ou refusée : la capture n'attend plus le micro
    if (active) {
      if (!isRecording) {
        // Récupérer le temps cumulé depuis localStorage si disponible
        const savedCumulativeTime = localStorage.getItem('mybrief_cumulative_recording_time');
        if (savedCumulativeTime) {
          cumulativeRecordingTime = parseInt(savedCumulativeTime, 10) || 0;
        }
        recordingStartTime = Date.now();
        updateTimer();
        clearInterval(recordingInterval);
        recordingInterval = setInterval(updateTimer, 1000);
        setStatus('statuses.recordingInProgress', 'active');
      }
    } else {
      // Sauvegarder le temps cumulé dans localStorage avant d'arrêter
      if (recordingStartTime) {
        const currentElapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        cumulativeRecordingTime += currentElapsed;
        localStorage.setItem(
          'mybrief_cumulative_recording_time',
          cumulativeRecordingTime.toString(),
        );
      }

      clearInterval(recordingInterval);
      recordingInterval = null;
      recordingStartTime = null;
    }

    isRecording = active;
  }

  // Souffle de bruit blanc injecté quand la salle est muette : sans lui, la
  // piste se met en veille et le premier mot après un long silence est avalé.
  // Le nœud de gain est CONSERVÉ ici — c'est lui qu'on déconnecte à l'arrêt.
  function injectKeepAliveSignal() {
    audioKeepAliveGainNode = injectKeepAlive(
      audioContext,
      outputDestination,
      audioKeepAliveGainNode,
    );
  }

  // Silence → bouffées keep-alive (lib/audio/silenceDetector.js). Échantillonné
  // par le processor du micro (setupAudioProcessor), au rythme de l'audio —
  // onglet caché compris. Son analyser nourrit aussi l'onde sonore.
  function setupSilenceDetection(microphoneSource, systemSource) {
    if (!audioContext || !outputDestination) return;
    silenceDetector = createSilenceDetector({
      audioContext,
      sources: [microphoneSource, systemSource],
      onKeepAlive: () => isRecording && injectKeepAliveSignal(),
    });
  }

  async function startRecording() {
    console.log("🎙️ Démarrage de l'enregistrement...");
    // Un delta de la session précédente ferait passer la première transcription
    // finale pour un doublon déjà écrit.
    deltaTracker.reset();
    // (Re)démarrer vaut consentement : si la durée cumulée dépasse déjà le
    // seuil de l'invite « Poursuivre ? » (reprise après un arrêt auto >3 h,
    // session restaurée…), on réarme sur le prochain point de la grille
    // horaire au lieu de ré-afficher l'invite à la première seconde.
    // No-op au démarrage d'une réunion neuve (seuil > cumul).
    while (nextContinuePromptAtMs <= cumulativeRecordingTime * 1000) {
      nextContinuePromptAtMs += CONTINUE_PROMPT_INTERVAL_MS;
    }
    try {
      // Étape 1: Accès au microphone
      console.log("📱 Étape 1: Demande d'accès au microphone...");
      setStatus('statuses.requestingMicrophone', 'active');

      microphoneStream = await acquireMicrophoneStream();

      console.log('✅ Microphone obtenu');

      // Vérifier que le microphone est bien actif
      const microphoneTracks = microphoneStream.getAudioTracks();
      if (microphoneTracks.length === 0) {
        throw new Error('Aucune piste audio du microphone détectée');
      }

      // Vérifier l'état de chaque piste audio
      let hasActiveTrack = false;
      microphoneTracks.forEach((track, index) => {
        console.log(`🎤 Piste microphone ${index}:`, {
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          label: track.label,
          settings: track.getSettings(),
        });

        // S'assurer que la piste est activée
        if (!track.enabled) {
          track.enabled = true;
          console.log(`✅ Piste microphone ${index} réactivée`);
        }

        // Vérifier que la piste est en état "live"
        if (track.readyState === 'live') {
          hasActiveTrack = true;
        } else {
          console.warn(`⚠️ Piste microphone ${index} n'est pas en état "live":`, track.readyState);
        }
      });

      if (!hasActiveTrack) {
        throw new Error("Aucune piste audio du microphone n'est active");
      }

      console.log('✅ Microphone configuré et actif');

      // Étape 2: Créer l'AudioContext immédiatement après avoir le microphone
      console.log("🔊 Étape 2: Création de l'AudioContext...");
      audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // S'assurer que l'audioContext est actif (nécessaire pour certains navigateurs)
      if (audioContext.state === 'suspended') {
        console.log("🔄 Réactivation de l'audioContext...");
        await audioContext.resume();
      }

      console.log('✅ AudioContext créé, état:', audioContext.state);
      outputDestination = audioContext.createMediaStreamDestination();

      // Vérifier que le microphoneStream a toujours des pistes actives
      const activeTracks = microphoneStream
        .getAudioTracks()
        .filter((track) => track.readyState === 'live' && track.enabled && !track.muted);
      console.log('🎤 Pistes audio actives du microphone:', activeTracks.length);

      if (activeTracks.length === 0) {
        throw new Error("Aucune piste audio active du microphone disponible pour l'enregistrement");
      }

      const microphoneSource = audioContext.createMediaStreamSource(microphoneStream);
      micSourceNode = microphoneSource; // gardée : un micro remplacé la remplace (adoptMicrophone)
      microphoneSource.connect(outputDestination);
      console.log('✅ microphoneSource connecté à outputDestination');

      // Étape 3 : le son de l'ordinateur (OPTIONNEL) — partage d'écran (Chrome,
      // Edge) ou périphérique virtuel (Firefox, Safari) : lib/audio/systemAudio.js.
      // Ne lève jamais : son échec laisse le micro seul. « Annuler » arrête tout.
      setStatus('statuses.requestingSystemAudio', 'active');
      const system = await acquireSystemAudio({
        path: systemAudioPath({
          ...audioCapture,
          device: $audioDevices.system,
          mediaDevices: navigator.mediaDevices,
        }),
        device: $audioDevices.system,
        micStream: microphoneStream,
        askMeetingType,
        mediaDevices: navigator.mediaDevices,
      });
      if (system.cancelled) throw startCancelledError();
      if (system.status) setStatus(system.status, 'warning');
      systemAudioStream = system.stream;
      let systemSource = null;
      if (systemAudioStream) {
        systemSource = audioContext.createMediaStreamSource(systemAudioStream);
        systemSource.connect(outputDestination);
      }

      mixedAudioStream = outputDestination.stream;
      console.log(
        '✅ mixedAudioStream créé, pistes audio:',
        mixedAudioStream.getAudioTracks().length,
      );

      // Étape 5: Configuration du MediaRecorder
      console.log('📹 Étape 5: Configuration du MediaRecorder...');
      setupMediaRecorder();
      console.log('✅ MediaRecorder configuré');

      // Étape 6: Connexion WebSocket OpenAI Realtime
      console.log('🌐 Étape 6: Configuration de la connexion WebSocket...');
      setStatus('statuses.connectingToServer', 'active');
      // Transcription en DEUX flux séparés pour dissocier la source :
      //  - micro = flux primaire (toi), tag 'local', affiché normalement
      //  - audio système = flux secondaire (personne distante), tag 'remote', violet
      // (l'enregistrement audio, lui, reste le mix via outputDestination).
      setupAudioProcessor(microphoneSource);
      // Natif : la transcription live est best-effort — clientSecret absent
      // (démarrage hors ligne) ou WS qui échoue (réseau tombé entre /tempkey
      // et l'ouverture) ne doivent pas empêcher d'enregistrer. La capture
      // segmentée ci-dessous garantit la transcription différée du manque.
      let liveTranscriptionUp = false;
      if (clientSecret) {
        try {
          await realtime.rotateMic(clientSecret);
          liveTranscriptionUp = true;
          console.log('✅ Connexion WebSocket micro établie');
        } catch (wsError) {
          if (!isOfflineCaptureSupported()) throw wsError;
          console.warn(
            '🛟 WS micro KO au démarrage — capture hors ligne en relais:',
            wsError.message,
          );
        }
      } else if (!isOfflineCaptureSupported()) {
        throw new Error('Clé de transcription absente');
      }

      if (systemSource && liveTranscriptionUp) {
        // Best-effort, NON bloquant : ne pas retarder le démarrage de
        // l'enregistrement micro si le 2e /tempkey est lent. S'attache dès qu'il
        // est prêt ; un échec laisse simplement la transcription micro seule.
        setupSystemTranscription(systemSource);
      }

      setRecordingState(true);

      // Capture segmentée (filet « tout terrain ») : ce que le direct manque
      // pendant une coupure réseau est transcrit au retour — persistée dans
      // l'app native, en mémoire sur le web. Démarrée après setRecordingState
      // pour que getTotalMeetingDuration compte depuis le vrai début de session.
      if (isGapCaptureSupported()) {
        const capture = startOfflineCapture(mixedAudioStream, {
          live: liveTranscriptionUp,
          getElapsedS: getTotalMeetingDuration,
          onGapTranscribed: handleOfflineGapTranscribed,
        });
        if (capture.started && capture.gapOpened) {
          // Démarrage hors ligne : marqueur en tête de transcription, toast
          // dédié, et boucle de reconnexion silencieuse (retry 5 s existant)
          // pour attraper le retour du réseau. disconnectToastShown évite le
          // doublon « Connexion perdue » ; « Connexion rétablie » s'affichera
          // au premier succès.
          insertOfflineGapMarker(capture.gapOpened);
          realtime.noteDropNotified(); // pas de second « Connexion perdue »
          showToast('offlineCapture.startedOffline', 'warning', 7000);
          setTimeout(() => {
            if (isRecording && !realtime.isReconnecting() && !liveTranscriptionUp) {
              realtime.reconnectMic(true);
            }
          }, 3000);
        }
      }

      // Étape 4 : détection de silence + keep-alive (arrêtée par stopRecording).
      setupSilenceDetection(microphoneSource, systemSource);

      console.log('✅ Enregistrement démarré avec succès');

      // Démarrer la reconnexion préventive
      startPreventiveReconnection();

      // Micro, contexte audio et page surveillés pendant toute la réunion.
      captureGuard.start();

      // PWA: Fonctionnalités spécifiques pour maintenir l'app active
      updateMediaSessionPlaybackState('playing');
      notifyServiceWorker(true);
      startSilentAudio();
      sessionKeeper.start(); // en dernier : le témoin n'est posé que si tout a démarré
    } catch (error) {
      // Ce qu'il faut FAIRE, en toast (cf. utils/recordingErrors.js) ; le détail
      // technique, dans la console. Aucune clé : « Annuler », rien à signaler.
      const errorKey = recordingStartErrorKey(error);
      if (errorKey) {
        console.error("❌ Erreur lors du démarrage de l'enregistrement:", error);
        console.error('❌ Stack trace:', error.stack);
        showToast(errorKey, 'error', 9000);
      }

      // Nettoyer les ressources en cas d'erreur
      captureGuard.stop();
      endOfflineCapture(); // capture segmentée éventuellement démarrée
      if (microphoneStream) {
        microphoneStream.getTracks().forEach((track) => track.stop());
        microphoneStream = null;
      }
      if (systemAudioStream) {
        systemAudioStream.getTracks().forEach((track) => track.stop());
        systemAudioStream = null;
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
      silenceDetector?.stop(); // son minuteur de keep-alive ne s'arrête pas seul
      silenceDetector = null;

      // Libérer le Wake Lock en cas d'erreur
      releaseWakeLock();
      setRecordingState(false);
      setStatus(errorKey ? 'statuses.recordingError' : 'statuses.ready', errorKey ? 'error' : '');
    }
  }

  function setupAudioProcessor(micSource) {
    if (wsAudioProcessor) {
      try {
        wsAudioProcessor.disconnect();
      } catch (e) {}
      wsAudioProcessor = null;
    }

    const bufferSize = 4096;
    wsAudioProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    wsAudioProcessor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      captureGuard.noteFrame(); // une trame : la capture vit (cf. captureGuard.js)

      // Ce callback tourne tant que l'audio coule (relié à destination via
      // silentGain), onglet caché compris : RMS du PCM réel pour le chien de
      // garde, et cadence de la détection de silence — avant la pause.
      let sumSq = 0;
      for (let i = 0; i < float32.length; i++) sumSq += float32[i] * float32[i];
      const level = Math.sqrt(sumSq / float32.length);
      silenceDetector?.sample(); // pause comprise : le keep-alive veille aussi

      if (isPaused || !audioContext) return; // dernier callback après l’arrêt
      // Conversion PCM16/24kHz + base64 + envoi : dans le canal. No-op si le
      // socket n'est pas ouvert. Le RMS est repassé au chien de garde : c'est
      // lui qui distingue « OpenAI ne répond plus » de « réunion silencieuse ».
      realtime.sendMicAudio(float32, audioContext.sampleRate, level);
    };

    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    micSource.connect(wsAudioProcessor);
    wsAudioProcessor.connect(silentGain);
    silentGain.connect(audioContext.destination);
  }

  // ───────────────────────────────────────────────────────────────────────
  // 2e flux de transcription : audio SYSTÈME (personne distante) → tag 'remote'.
  // Isolé du flux micro pour ne jamais le casser (best-effort : un échec ici
  // laisse simplement la transcription micro tourner seule).
  // ───────────────────────────────────────────────────────────────────────
  let systemAudioNode = null; // nœud source audio système, conservé pour reconnexion

  // Clé éphémère dédiée, rotation, superviseur propre (rotation préventive +
  // health check) : tout est dans la pile. Le processor audio, lui, reste ici —
  // il est attaché à l'AudioContext — et est créé par onSystemReady.
  function setupSystemTranscription(systemNode) {
    systemAudioNode = systemNode;
    return realtime.attachSystem();
  }

  function setupSystemAudioProcessor(node) {
    if (wsAudioProcessorSys) {
      try {
        wsAudioProcessorSys.disconnect();
      } catch (e) {}
      wsAudioProcessorSys = null;
    }
    wsAudioProcessorSys = audioContext.createScriptProcessor(4096, 1, 1);
    wsAudioProcessorSys.onaudioprocess = (e) => {
      if (isPaused || !audioContext) return;
      realtime.sendSystemAudio(e.inputBuffer.getChannelData(0), audioContext.sampleRate);
    };
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    node.connect(wsAudioProcessorSys);
    wsAudioProcessorSys.connect(silentGain);
    silentGain.connect(audioContext.destination);
  }

  function startPreventiveReconnection() {
    realtime.start({
      // À chaque tick (60 s) AVANT la décision de rotation — comportement
      // historique de checkDuration : le plafond 8 h arrête tout, proprement.
      onPeriodicCheck: () => {
        const activeMs = recordingStartTime ? Date.now() - recordingStartTime : 0;
        const totalDuration = activeMs + cumulativeRecordingTime * 1000;
        if (totalDuration >= MAX_RECORDING_DURATION_MS) {
          console.log(
            "Durée maximale d'enregistrement atteinte (8 heures) — arrêt propre + sauvegarde",
          );
          // Toast persistant (durée 0) : l'utilisateur est probablement
          // absent, le message doit encore être là à son retour.
          showToast('continueRecording.maxDurationToast', 'info', 0);
          stopRecording();
          return false;
        }
        return true;
      },
    });
  }

  function stopPreventiveReconnection() {
    realtime.stop();
  }

  function setupMediaRecorder() {
    if (typeof MediaRecorder === 'undefined') {
      setStatus('statuses.recordingUnavailable', 'warning');
      return;
    }

    if (!mixedAudioStream) {
      setStatus('statuses.mixedStreamUnavailable', 'warning');
      return;
    }

    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
      'audio/wav',
    ];

    let selectedMimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedMimeType = type;
        break;
      }
    }

    if (!selectedMimeType) {
      console.warn('Aucun type MIME audio supporté trouvé, tentative avec défaut');
    }

    try {
      const options = { audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND };
      if (selectedMimeType) options.mimeType = selectedMimeType;
      mediaRecorder = new MediaRecorder(mixedAudioStream, options);
      console.log('MediaRecorder initialisé avec:', mediaRecorder.mimeType);
    } catch (error) {
      console.error("Impossible d'initialiser MediaRecorder:", error);
      setStatus('statuses.recorderPrepError', 'warning');
      mediaRecorder = null;
      return;
    }

    audioChunks = [];

    mediaRecorder.addEventListener('dataavailable', handleRecorderData);
    mediaRecorder.addEventListener('stop', handleRecorderStop);
    mediaRecorder.start(2000);
  }

  function handleRecorderData(event) {
    // push : une copie du tableau toutes les 2 s, c'était O(n²) sur 3 h.
    if (event.data && event.data.size > 0) audioChunks.push(event.data);
  }

  function handleRecorderStop() {
    finalizeRecordedAudio();
    cleanupMediaRecorder();
  }

  function cleanupMediaRecorder() {
    if (mediaRecorder) {
      mediaRecorder.removeEventListener('dataavailable', handleRecorderData);
      mediaRecorder.removeEventListener('stop', handleRecorderStop);
      mediaRecorder = null;
    }
  }

  function finalizeRecordedAudio() {
    if (!audioChunks.length) {
      return;
    }

    const mimeType = mediaRecorder?.mimeType || 'audio/webm';
    const audioBlob = new Blob(audioChunks, { type: mimeType });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    recordedFilename = `mybrief-recording-${timestamp}.webm`;

    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }

    recordedAudioUrl = URL.createObjectURL(audioBlob);
    audioChunks = [];
  }

  // Fonction pour traiter les messages (ex: transcriptions)
  function handleMessage(message, source = 'local') {
    switch (message.type) {
      // Afficher les deltas, espaces seules comprises (« qu'à » « ␣ » « 4 »). L'item_id
      // (segment VAD) pilote fusion et position — cf. utils/transcriptLive.js.
      case 'conversation.item.input_audio_transcription.delta':
        if (message.delta) {
          deltaTracker.onDelta(source, message.item_id, message.delta);
          addTranscription(message.delta, 'Intervenant', true, source, message.item_id);
        }
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        // Toujours consommer le suivi, même si le final est écarté : le suivi
        // du segment ne doit pas lui survivre (cf. utils/transcriptDeltas.js).
        const alreadyWritten = deltaTracker.takeCompleted(
          source,
          message.item_id,
          message.transcript,
        );
        if (isValidTranscription(message.transcript)) {
          // Le final remplace SA ligne (même segment) sur place, met au propre
          // une ligne déjà bouclée, ou s'insère devant le direct — les quatre
          // cas vivent dans applyLiveFinal (utils/transcriptLive.js).
          addTranscription(
            message.transcript,
            'Intervenant',
            false,
            source,
            message.item_id,
            alreadyWritten,
          );
        } else {
          // Transcription filtrée (invalide). Pas de log du contenu : confidentialité réunion.
          // La ligne en cours reste affichée ; la prochaine prise de parole la bouclera.
        }
        break;
      }

      // Erreurs de l'API Realtime (quota, rate limit, session invalide, buffer
      // audio refusé). Elles tombaient jusqu'ici dans le `default` : ni log, ni
      // toast, ni reconnexion — une session morte laisse pourtant le socket
      // OUVERT, donc invisible pour le health check. Traitement dans la pile
      // (lib/realtime/errors.js) : log technique, toast si l'utilisateur doit
      // savoir, reconnexion par le superviseur si la session est perdue.
      case 'error':
        realtime.reportError(message, source);
        break;

      default:
        // Type de message non géré
        break;
    }
  }

  function stopRecording() {
    // Choke point de TOUTES les fins d'enregistrement (bouton, cap 8 h,
    // timeout d'invite, perte micro) : arrêter le service foreground Android.
    stopBackgroundRecording();
    // Capture hors ligne (natif) : clôture AVANT l'arrêt des tracks pour que
    // le dernier segment se finalise avec ses données. Les uploads restants
    // continuent tant que l'app est ouverte (retry + retour réseau).
    const { pendingGaps } = endOfflineCapture();
    if (pendingGaps > 0) {
      showToast('offlineCapture.pendingAtStop', 'info', 8000, { count: pendingGaps });
      flushOfflineQueue();
    }
    closeContinuePrompt();
    // Réinitialiser l'état de connexion
    $connectionState = 'disconnected';
    captureGuard.stop(); // avant la fermeture du contexte audio qu'il écoute
    sessionKeeper.stop(); // arrêt voulu : plus rien à reprendre au prochain lancement
    canResumeSession = false;
    resumedCountedS = 0;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    } else if (!recordedAudioUrl && audioChunks.length) {
      finalizeRecordedAudio();
      cleanupMediaRecorder();
    }

    if (wsAudioProcessor) {
      try {
        wsAudioProcessor.disconnect();
      } catch (error) {}
      wsAudioProcessor = null;
    }

    // 2e flux (audio système) — son processor aussi.
    if (wsAudioProcessorSys) {
      try {
        wsAudioProcessorSys.disconnect();
      } catch (error) {}
      wsAudioProcessorSys = null;
    }
    // Ferme les deux sockets sans émettre onUnexpectedClose (fermeture voulue).
    realtime.close();
    systemAudioNode = null;

    if (mixedAudioStream) {
      mixedAudioStream.getTracks().forEach((track) => track.stop());
      mixedAudioStream = null;
    }

    if (microphoneStream) {
      microphoneStream.getTracks().forEach((track) => track.stop());
      microphoneStream = null;
    }

    if (systemAudioStream) {
      systemAudioStream.getTracks().forEach((track) => track.stop());
      systemAudioStream = null;
    }

    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }

    // Nettoyer les ressources keep-alive audio
    silenceDetector?.stop();
    if (audioKeepAliveGainNode) {
      try {
        audioKeepAliveGainNode.disconnect();
      } catch (e) {
        // Ignorer les erreurs de déconnexion
      }
      audioKeepAliveGainNode = null;
    }

    silenceDetector = null;
    outputDestination = null;

    clearInterval(recordingInterval);
    clearInterval(liveTranscriptionInterval);
    recordingInterval = null;
    liveTranscriptionInterval = null;

    // Arrêter la reconnexion préventive
    stopPreventiveReconnection();

    // PWA: Arrêter les fonctionnalités spécifiques
    updateMediaSessionPlaybackState('paused');
    notifyServiceWorker(false);
    stopSilentAudio();

    // Libérer le Wake Lock
    releaseWakeLock();

    setRecordingState(false);
    setStatus('statuses.recordingFinished');

    transcriptionFullText = buildAttributedTranscript(transcriptionHistory, userInfo?.name).text;

    // Clôture de la ligne ouverte au démarrage. APRÈS setRecordingState(false) :
    // le chronomètre y verse son dernier tronçon dans cumulativeRecordingTime,
    // d'où sort la durée envoyée. Sans await — l'écran bascule tout de suite.
    closeLiveMeeting().catch((err) => console.warn('[live] clôture en échec', err));

    // Dernière analyse, sans attendre le débounce : l'écran bascule tout de
    // suite. (L'ancien appel envoyait aussi les lignes en cours de dictée.)
    actionScheduler.flush();

    // Récupération auth différée pendant l'enregistrement : les données sont
    // sauvegardées, on peut maintenant re-vérifier la session. Un seul ping :
    // si elle est toujours morte, il affiche la modale « déconnecté »
    // (reconnexion pilotée par l'utilisateur) ; si le refresh serveur l'a
    // rétablie entre-temps, rien ne s'affiche.
    const deferredAuth = consumeDeferredAuthError();
    if (deferredAuth || deferredDisconnected) {
      deferredDisconnected = false;
      pingApi();
    }
  }

  function updateTimer() {
    if (!recordingStartTime) return;

    // Calculer le temps écoulé depuis le début de cette session
    const currentElapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    // Ajouter le temps cumulé des sessions précédentes
    const totalElapsed = cumulativeRecordingTime + currentElapsed;

    // Invite « Poursuivre ? » sur la durée TOTALE (cumul + session courante, même
    // formule que checkDuration). Seuil et non timer : robuste au throttling.
    // La garde < MAX évite une invite inutile à l'heure exacte du plafond 8 h.
    if (
      isRecording &&
      !showContinueModal &&
      totalElapsed * 1000 >= nextContinuePromptAtMs &&
      nextContinuePromptAtMs < MAX_RECORDING_DURATION_MS
    ) {
      openContinuePrompt(totalElapsed);
    }

    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) timerDisplay.textContent = formatDurationConditional(totalElapsed);
    liveElapsedStore.set(totalElapsed - resumedCountedS); // déduit en direct du crédit
  }

  function openContinuePrompt(totalElapsedSeconds) {
    continuePromptDurationLabel = formatDurationConditional(totalElapsedSeconds);
    continuePromptDeadline = Date.now() + CONTINUE_PROMPT_TIMEOUT_MS;
    showContinueModal = true;
    updateContinueCountdown();
    // Intervalle DÉDIÉ : recordingInterval est tué par pauseRecording, or le
    // compte à rebours doit survivre à une pause. Deadline-based : un tick en
    // retard (onglet caché) recalcule le vrai restant depuis Date.now().
    clearInterval(continueCountdownInterval);
    continueCountdownInterval = setInterval(updateContinueCountdown, 1000);
    playContinuePromptSound(audioContext);
    // Focus sur « Poursuivre » : Enter prolonge, pas d'arrêt accidentel.
    tick().then(() => {
      const btn = document.getElementById('continuePromptConfirm');
      if (btn) btn.focus();
    });
  }

  function updateContinueCountdown() {
    if (!showContinueModal || continuePromptDeadline == null) return;
    const remaining = continuePromptDeadline - Date.now();
    if (remaining <= 0) {
      // Pas de réponse : arrêt + sauvegarde (spec).
      handleContinueChoice(false);
      return;
    }
    continueCountdownDisplay = formatDurationConditional(Math.ceil(remaining / 1000));
  }

  function handleContinueChoice(keepGoing) {
    closeContinuePrompt();
    if (keepGoing) {
      const totalMs =
        cumulativeRecordingTime * 1000 + (recordingStartTime ? Date.now() - recordingStartTime : 0);
      // Réarme sur la grille 3h + k·1h (4h, 5h…) avec rattrapage si le seuil
      // courant est déjà dépassé (reprise tardive, onglet resté caché…).
      while (nextContinuePromptAtMs <= totalMs) {
        nextContinuePromptAtMs += CONTINUE_PROMPT_INTERVAL_MS;
      }
    } else if (isRecording) {
      stopRecording();
    }
  }

  function closeContinuePrompt() {
    showContinueModal = false;
    continuePromptDeadline = null;
    if (continueCountdownInterval) {
      clearInterval(continueCountdownInterval);
      continueCountdownInterval = null;
    }
  }

  // Sonde de connectivité — de scope composant : stopRecording() la rappelle
  // une fois pour re-vérifier une session marquée morte pendant l'enregistrement.
  // NB : le ping (2 min) est aussi le keep-alive de la session OIDC (refresh
  // côté plugin) — il ne doit jamais être suspendu pendant un enregistrement.
  async function pingApi() {
    const res = await apiGet('/ping');
    // Le client pose X-Requested-With → le plugin OIDC renvoie un 401 plutôt
    // qu'une redirection ; `redirect:'manual'` rend malgré tout opaque celles
    // qui passeraient (slug `auth_redirect`). On couvre les deux cas pour
    // afficher la modale « déconnecté » plutôt que de laisser filer une
    // session morte.
    //
    // Une panne réseau (`network`) n'en est PAS une : hors ligne ≠ déconnecté,
    // et la modale proposerait de se reconnecter à un serveur injoignable.
    const lostSession =
      res.data?.error === 'auth_redirect' || res.status === 401 || res.status === 403;
    if (!lostSession) return;

    if (isRecording || isPaused) {
      // Jamais de modale pendant l'enregistrement : on diffère, l'arrêt
      // re-vérifiera. La transcription continue (sockets déjà ouverts,
      // retries tempkey silencieux), tout est sauvegardé en local.
      deferredDisconnected = true;
    } else {
      showDisconnectedModal = true;
    }
  }

  function startApiPingMonitor() {
    stopApiPingMonitor();
    pingApi();
    connectivityCheckInterval = setInterval(pingApi, API_PING_INTERVAL_MS);
  }

  function stopApiPingMonitor() {
    if (connectivityCheckInterval) {
      clearInterval(connectivityCheckInterval);
      connectivityCheckInterval = null;
    }
  }

  async function processAudio(audioBlob) {
    await processAudioUtil({
      audioBlob,
      setIsImportingAudio: (value) => {
        isImportingAudio = value;
      },
      addTranscription,
      formatMessage,
      apiBaseUrl: baseUrl,
    });
    if (!isImportingAudio) {
      setStatus('statuses.ready');
    }
  }

  function addTranscription(
    text,
    author,
    isDelta = false,
    source = 'local',
    itemId = '',
    alreadyWritten = false,
  ) {
    const elapsed = isRecording
      ? Math.floor((Date.now() - recordingStartTime) / 1000) + cumulativeRecordingTime
      : transcriptionHistory.length * 10;
    const { timeStr, timestamp } = transcriptStamp(elapsed);
    const stamp = { time: timeStr, timestamp, author: author || t('transcription.defaultAuthor') };

    // Fusion par segment VAD, clôture des prises de parole, déduplication
    // d'écho et position des finales devant le direct : toutes les règles
    // vivent dans utils/transcriptLive.js — ici, seuls les effets de bord.
    // En preview historique pendant enregistrement, la session live vit dans
    // le snapshot (savedLiveState) : mêmes règles, sans analyses ni défilement.
    const inPreview = savedLiveState !== null;
    const target = inPreview ? savedLiveState.transcriptionHistory : transcriptionHistory;
    const live = { text, itemId, source, stamp, correct: correctTranscript, nowMs: Date.now() };
    const result = isDelta
      ? applyLiveDelta(target, live)
      : applyLiveFinal(target, { ...live, alreadyWritten, elapsedS: elapsed });

    if (inPreview) {
      savedLiveState.transcriptionHistory = result.history;
      if (result.recompute) {
        savedLiveState.transcriptionFullText = recomputeFullText(result.history, userInfo?.name);
      } else {
        for (const line of result.finalized) {
          savedLiveState.transcriptionFullText = savedLiveState.transcriptionFullText
            ? `${savedLiveState.transcriptionFullText}\n${line}`
            : line;
        }
      }
      if (result.finalized.length || result.recompute || result.dropped) sessionSaver.schedule();
      return;
    }

    transcriptionHistory = result.history;
    flashCorrections(result.corrected, (up) => (transcriptionHistory = up(transcriptionHistory)));
    if (result.recompute) {
      // Un texte déjà versé au texte complet a été mis au propre par son
      // `completed` : re-dériver depuis l'historique plutôt qu'ajouter.
      transcriptionFullText = recomputeFullText(result.history, userInfo?.name);
    } else {
      for (const line of result.finalized) {
        transcriptionFullText = transcriptionFullText ? `${transcriptionFullText}\n${line}` : line;
      }
    }
    if (result.finalized.length || result.recompute) {
      // Chaque phrase bouclée relance les analyses ; les ordonnanceurs ne
      // lancent jamais deux appels en parallèle.
      actionScheduler.notify();
      transcriptRefiner.notify();
    }

    tick().then(() => liveTranscript?.scrollToLatest());

    // Sauvegarde uniquement quand du définitif a changé — jamais par delta —
    // et regroupée sur une rafale (utils/session.js, coalesceSaves).
    if (result.finalized.length || result.recompute || result.dropped) {
      sessionSaver.schedule();
    }
  }

  // Session locale : celle du DIRECT, que « Reprendre » restaure après une
  // coupure. En consultation d'archive pendant l'enregistrement, c'est donc le
  // direct mis de côté qui est écrit (l'archive, elle, est en base) — avant, rien
  // ne l'était, et une application tuée à ce moment perdait ce qui s'était dit
  // depuis l'ouverture de l'archive.
  function saveSessionData() {
    const live = savedLiveState ?? {
      transcriptionHistory,
      transcriptionFullText,
      detectedActions,
      meetingNotes,
      summaryText,
      summaryVersions,
      activeVersionId,
      // Identité de la réunion, sauvée AVEC son contenu : au reload, l'écran
      // restauré doit écrire dans le même document qu'avant (tag, versions,
      // autosaves) — pas dans une conversation neuve.
      currentMeetingId,
    };
    saveSessionDataUtil({
      ...live,
      summaryVersions: live.summaryVersions.filter((v) => !v.pending),
      getDefaultSummaryTextFor,
      currentLanguage: $currentLanguageStore,
    });
  }
  const sessionSaver = coalesceSaves(saveSessionData);

  // ── Capture hors ligne (app native) : marqueurs de gap ──────────────────
  // Insère le marqueur ⟨passage hors ligne⟩ à la position chronologique de la
  // coupure. Ligne finale (isDelta:false) : visible, sauvegardée, honnête dans
  // le texte complet tant que la transcription différée n'est pas revenue.
  function insertOfflineGapMarker(gapId, text = t('offlineCapture.gapMarker')) {
    const { timeStr, timestamp } = transcriptStamp(getTotalMeetingDuration());
    const marker = makeGapMarkerItem({
      gapId,
      time: timeStr,
      timestamp,
      author: t('offlineCapture.markerAuthor'),
      text,
    });
    // Preview d'un historique pendant l'enregistrement : la session live vit
    // dans le snapshot (même règle que addTranscription). Dans les deux cas le
    // marqueur est une ligne FINALE : il s'insère devant le direct
    // (finalInsertIndex), jamais après les lignes en cours.
    if (savedLiveState !== null) {
      const liveHistory = savedLiveState.transcriptionHistory;
      const liveAt = finalInsertIndex(liveHistory);
      savedLiveState.transcriptionHistory = [
        ...liveHistory.slice(0, liveAt),
        marker,
        ...liveHistory.slice(liveAt),
      ];
      savedLiveState.transcriptionFullText = savedLiveState.transcriptionFullText
        ? `${savedLiveState.transcriptionFullText}\n${marker.text}`
        : marker.text;
      return;
    }
    const at = finalInsertIndex(transcriptionHistory);
    transcriptionHistory = [
      ...transcriptionHistory.slice(0, at),
      marker,
      ...transcriptionHistory.slice(at),
    ];
    saveSessionData();
    tick().then(() => liveTranscript?.scrollToLatest());
  }

  // Callback de platform/offlineRecording : un gap est entièrement transcrit
  // (Whisper batch). Remplace le marqueur par le texte — ou le retire si la
  // coupure était silencieuse / la réponse filtrée (anti-hallucination, même
  // filtre que le live). Peut arriver PENDANT l'enregistrement (réseau revenu)
  // ou APRÈS l'arrêt (file d'upload encore en train de drainer).
  function handleOfflineGapTranscribed(gapId, text) {
    const safeText = isValidTranscription(text) ? correctTranscript(text) : '';
    // Preview d'un historique pendant l'enregistrement : le marqueur vit dans
    // le snapshot de la session live, pas dans l'historique affiché.
    if (savedLiveState !== null) {
      const snap = resolveGapMarker(savedLiveState.transcriptionHistory, gapId, safeText);
      if (snap.changed) {
        savedLiveState.transcriptionHistory = snap.history;
        savedLiveState.transcriptionFullText = recomputeFullText(snap.history, userInfo?.name);
        if (safeText.trim()) showToast('offlineCapture.gapResolved', 'success', 4000);
      }
      return;
    }
    const { history, changed } = resolveGapMarker(transcriptionHistory, gapId, safeText);
    if (!changed) return;
    commitTranscriptionHistory(history);
    if (safeText.trim()) showToast('offlineCapture.gapResolved', 'success', 4000);
  }

  // Édition d'une ligne (double-clic dans EditableTranscript). Jamais la ligne
  // live (isDelta) : elle est encore réécrite par les deltas → race.
  function editTranscription(index, text) {
    const item = transcriptionHistory[index];
    if (!item || item.isDelta) return;
    commitTranscriptionHistory(
      transcriptionHistory.map((it, i) => (i === index ? { ...it, text } : it)),
    );
  }

  // Nom posé sur une voix de la visio (pastille « Visio » → « Marie »), en
  // direct ou après coup — portées dans utils/transcriptSpeakers.js. Même
  // persistance qu'une ligne éditée : la transcription stockée porte les noms.
  function nameTranscriptSpeaker({ index, name, everywhere }) {
    const next = assignSpeaker(transcriptionHistory, index, name, {
      everywhere,
      selfName: userInfo?.name,
    });
    if (next !== transcriptionHistory) commitTranscriptionHistory(next);
  }

  // Historique modifié à la main (ligne éditée, voix nommée, gap résolu) :
  // texte complet re-dérivé (source unique envoyée à /resume), session live
  // (localStorage, restaurée au reload) et, pour une réunion sauvegardée,
  // MongoDB (debounce 1500 ms comme l'édition de résumé) avec la copie locale
  // de l'historique mise à jour pour une re-sélection immédiate cohérente.
  function commitTranscriptionHistory(next) {
    transcriptionHistory = next;
    transcriptionFullText = recomputeFullText(transcriptionHistory, userInfo?.name);
    saveSessionData();
    if (!currentMeetingId) return;
    if ($selectedHistoryItem) {
      $historyItems = $historyItems.map((it) =>
        it === $selectedHistoryItem ? { ...it, transcription: transcriptionFullText } : it,
      );
    }
    const meetingId = currentMeetingId;
    const fullText = transcriptionFullText;
    saveIndicator = 'pending';
    clearTimeout(transcriptionSaveTimer);
    transcriptionSaveTimer = setTimeout(() => {
      updateTranscriptionInBackend(meetingId, fullText);
    }, 1500);
  }

  async function detectActions(text) {
    // Réunion au moment du départ : une réponse qui arrive après une bascule
    // (nouvelle réunion, ouverture d'un historique) est jetée.
    const tokenAtCall = meetingToken;
    try {
      // Réponse BRUTE : le corps est relu verbatim (formats hérités de n8n, et
      // signatures « crédit IA épuisé » côté erreur) — cf. apiClient.raw.
      // Le modèle reçoit les actions ÉPURÉES : les actions vivantes avec leur
      // id (pour qu'il puisse en désigner une à affiner) et, séparément, celles
      // que l'utilisateur a masquées (pour ne plus les proposer). Les champs
      // d'affichage et d'animation ne le regardent pas.
      const { active, dismissed } = splitActionsForPrompt(detectedActions);

      const response = await apiRaw('/actions', {
        method: 'POST',
        body: {
          content: text,
          actions: active,
          dismissed,
          // Langue de l'interface, celle du compte rendu (cf. actionsPrompt).
          language: $currentLanguageStore,
        },
      });
      // Aucune réponse = réseau absent : même chemin que le fetch rejeté
      // d'avant (catch ci-dessous → message « hors ligne »).
      if (!response) throw new Error('/actions injoignable');

      if (response.ok) {
        const contentType = response.headers.get('Content-Type') || '';

        // Vérifier que c'est bien du JSON avant de parser
        if (!contentType.includes('application/json')) {
          console.warn("⚠️ Réponse /actions n'est pas du JSON:", contentType);
          return;
        }

        try {
          const result = await response.json();
          // Une seule forme depuis la sortie de n8n : `{ actions: [...] }`
          // (services/api/routes/ai.js).
          const actions = Array.isArray(result?.actions) ? result.actions : [];
          if (actions.length > 0 && tokenAtCall === meetingToken) {
            applyDetectedActions(actions);
          }
        } catch (e) {
          console.error('❌ Erreur de parsing des actions:', e);
        }
      } else {
        // 401/403 → SESSION_EXPIRED (traité dans le catch) ; autres codes =
        // OpenAI inaccessible. Message clair + cause loggée pour l'admin.
        await logAiServiceError(response, '/actions');
        await handleHttpError(response, '/actions');
        showToast('messages.aiServiceError', 'error', 6000);
      }
    } catch (error) {
      // Gérer les erreurs de fetch (réseau, CORS, OAuth) et d'authentification
      if (error.message === 'SESSION_EXPIRED') {
        console.warn(
          '⚠️ Session expirée - Les actions ne peuvent pas être détectées pour le moment',
        );
      } else {
        const errorType = handleFetchError(error, '/actions');
        if (errorType === 'SESSION_EXPIRED') {
          console.warn(
            '⚠️ Session expirée - Les actions ne peuvent pas être détectées pour le moment',
          );
        } else {
          console.error('Erreur détection actions:', error);
          const category = categorizeApiError({ error });
          showToast(aiErrorMessageKey(category), 'error', 6000);
        }
      }
    }
  }

  /**
   * Applique la réponse du modèle : créations ET affinages des actions déjà
   * affichées. La liste est RÉASSIGNÉE (l'ancienne version mutait les
   * propriétés en place — la réactivité ne partait pas et rien n'était
   * sauvegardé).
   */
  function applyDetectedActions(actions) {
    const merged = mergeDetectedActions(detectedActions, actions, { idCounter: actionIdCounter });

    const touched = [...merged.createdIds, ...merged.updatedIds];
    if (touched.length === 0) return;

    detectedActions = merged.actions;
    actionIdCounter = merged.idCounter;
    flashFab();
    // Les marqueurs d'animation ne vivent que le temps de l'animation : sans
    // ce retrait, une carte re-pulserait à chaque re-rendu.
    setTimeout(() => {
      detectedActions = clearActionFlashes(detectedActions, touched);
    }, FLASH_DURATION_MS);
    saveNotesActions();
  }

  /** Ping du bouton flottant mobile, où le panneau d'actions n'est pas visible. */
  function flashFab() {
    fabFlash = false;
    clearTimeout(fabFlashTimer);
    // Un tick avant de rallumer, sinon la classe ne quitte jamais le DOM et
    // l'animation ne redémarre pas sur une détection qui suit de près.
    fabFlashTimer = setTimeout(() => {
      fabFlash = true;
      fabFlashTimer = setTimeout(() => (fabFlash = false), 1900);
    }, 20);
  }

  // Carte vierge : ses champs vides s'affichent en placeholder (utils/liveActionsMerge.js).
  function addManualAction() {
    const next = prependManualAction(detectedActions, actionIdCounter);
    detectedActions = next.actions;
    actionIdCounter = next.idCounter;
    saveNotesActions();
  }

  // « Masquer l'action », et « Rétablir » pour l'inverse : rien n'est jamais effacé.
  function showAction(action, show) {
    detectedActions = setActionShown(detectedActions, action, show);
    saveNotesActions();
  }

  // Durée totale de la réunion, en secondes (calcul : utils/formatUtils.js).
  function getTotalMeetingDuration() {
    return meetingElapsed(cumulativeRecordingTime, recordingStartTime, fallbackMeetingDuration);
  }

  function pauseRecording() {
    setAudioEnabled([microphoneStream, mixedAudioStream], false);
    realtime.notePaused(); // la reprise jugera si le socket a dormi trop longtemps
    // Freeze timer: accumulate elapsed and stop interval
    if (recordingStartTime) {
      cumulativeRecordingTime += Math.floor((Date.now() - recordingStartTime) / 1000);
      recordingStartTime = null;
    }
    clearInterval(recordingInterval);
    recordingInterval = null;
    isPaused = true;
    sessionKeeper.beat();
  }

  function resumeRecording() {
    setAudioEnabled([microphoneStream, mixedAudioStream], true);
    // Restart timer from where it stopped
    recordingStartTime = Date.now();
    updateTimer();
    recordingInterval = setInterval(updateTimer, 1000);
    isPaused = false;
    realtime.noteResumed(); // chien de garde réarmé ; pause longue : canal renouvelé
    sessionKeeper.beat();
    captureGuard.resumed(); // un geste : la chance de relancer un audio resté bloqué
  }

  /** « Reprendre » : même réunion en base, chronomètre et transcription à la suite. */
  async function resumeInterruptedSession() {
    canResumeSession = false;
    resumeMeetingId = interruptedSession?.meetingId || currentMeetingId;
    await toggleRecording();
    resumeMeetingId = null;
    // Micro refusé, réseau absent : la proposition revient, rien n'est perdu.
    if (!isRecording) return (canResumeSession = true);
    const awayMs = interruptedSession?.savedAt ? Date.now() - interruptedSession.savedAt : 0;
    if (awayMs >= CAPTURE_MARKER_MIN_MS) markInterruption(awayMs);
    interruptedSession = null;
  }

  /** « Terminer la réunion » : close comme par un arrêt, elle reste à l'écran, prête à résumer. */
  function dismissResume() {
    canResumeSession = false;
    clearLiveSession();
    const meetingId = interruptedSession?.meetingId || currentMeetingId;
    interruptedSession = null;
    if (meetingId) currentMeetingId = meetingId;
    transcriptionFullText = buildAttributedTranscript(transcriptionHistory, userInfo?.name).text;
    saveSessionData();
    closeInterruptedMeeting({
      meetingId,
      transcription: transcriptionFullText,
      duration: cumulativeRecordingTime,
      notes: meetingNotes,
      actions: toStoredActions(detectedActions),
    })
      .then(fetchHistoryItems)
      .catch((err) => console.warn('[live] clôture de la réunion interrompue en échec', err));
  }

  // Réunion TERMINÉE à l'écran, rien n'enregistre : la reprise est offerte.
  // Une archive héritée sans meetingId n'écrit rien en base : pas de reprise.
  $: canResumeMeeting =
    screen === 'active' &&
    !isRecording &&
    !generatingHere &&
    !!(currentMeetingId || !$selectedMeetingId);

  /**
   * « Reprendre » une réunion TERMINÉE (dock après l'arrêt, ou fin de sa
   * transcription) : même document, transcription et chronomètre à la suite,
   * marqueur daté (utils/meetingResume.js). Le quota s'applique : nouveau départ.
   */
  async function resumeFinishedMeeting() {
    if (quotaBlocked && (await confirmQuotaExhausted())) return refuseQuotaStart();
    const plan = planMeetingResume({
      history: transcriptionHistory,
      fromArchive: !!$selectedMeetingId,
      listedDuration: currentHistoryItem?.meetingDuration,
      archiveDuration: fallbackMeetingDuration,
      liveClockS: Math.max(cumulativeRecordingTime, readRecordingClock()),
      inBase: !!currentMeetingId,
    });
    transcriptionHistory = plan.history;
    seedRecordingClock((cumulativeRecordingTime = plan.clockS));
    resumedCountedS = plan.countedS;
    activeTab = 'transcription'; // à l'arrêt, la suite se lit là où elle s'est écrite
    resumeMeetingId = currentMeetingId;
    await toggleRecording();
    resumeMeetingId = null;
    if (!isRecording) return void (resumedCountedS = 0); // micro refusé : rien n'a repris
    const when = resumeMarkerParts(new Date(), $currentLanguageStore);
    insertOfflineGapMarker(`resume-${Date.now()}`, formatMessage('meetingResume.marker', when));
  }

  async function handleEditGenerate(opts) {
    editDockOpen = false;
    await generateSummary(opts);
  }

  /** Version rédigée : l'objet final (à écrire en base), posé à l'écran seulement
   *  s'il y retrouve sa version en attente — l'écran montre encore sa réunion
   *  (stores/summaryGeneration.js) ; sinon, il reste à ce qu'il lit. */
  function finalizePendingVersion(pending, html, measured = {}) {
    const generatedAt = new Date().toISOString();
    const done = { ...pending, ...measured, html, pending: false, generatedAt };
    if (!summaryVersions.some((v) => v.id === pending.id)) return done;
    summaryVersions = summaryVersions.map((v) => (v.id === pending.id ? done : v));
    activeVersionId = pending.id;
    summaryText = html;
    activeTab = 'resume';
    saveSessionData();
    return done;
  }

  /** Génération en échec : la version affichée reste à l'écran (utils/summary.js).
   *  Écran sur une autre réunion : rien à retirer ici, mais le dire — en la nommant. */
  function abortPendingVersion(id, message, meetingId) {
    setStatus('statuses.summaryError', 'warning');
    if (!summaryVersions.some((v) => v.id === id)) {
      showToast('messages.summaryFailedFor', 'error', 7000, { title: titleOf(meetingId) });
      return;
    }
    const next = afterFailedGeneration(summaryVersions, activeVersionId, id, message);
    summaryVersions = next.versions;
    activeVersionId = next.activeVersionId;
    summaryText = next.summaryText;
  }

  function selectVersion(id) {
    const v = summaryVersions.find((x) => x.id === id);
    if (!v) return;
    activeVersionId = id;
    summaryText = normalizeSummaryHtml(v.html);
    activeTab = 'resume';
    saveSessionData();
  }

  function requestDeleteVersion(id) {
    if (summaryVersions.length <= 1) return;
    pendingDeleteVersionId = id;
  }

  async function confirmDeleteVersion() {
    const id = pendingDeleteVersionId;
    pendingDeleteVersionId = null;
    if (!id || summaryVersions.length <= 1) return;
    const idx = summaryVersions.findIndex((v) => v.id === id);
    if (idx === -1) return;
    summaryVersions = summaryVersions.filter((v) => v.id !== id);
    if (activeVersionId === id) {
      const newIdx = Math.min(idx, summaryVersions.length - 1);
      selectVersion(summaryVersions[newIdx].id);
    } else {
      saveSessionData();
    }
    if (currentMeetingId) {
      await deleteVersion(currentMeetingId, id);
      fetchHistoryItems();
    }
  }

  function cancelDeleteVersion() {
    pendingDeleteVersionId = null;
  }

  function updateActiveVersionHtml(newHtml) {
    if (!activeVersionId) return;
    summaryVersions = summaryVersions.map((v) =>
      v.id === activeVersionId ? { ...v, html: newHtml } : v,
    );
  }

  $: versionLabelById = (() => {
    const map = {};
    summaryVersions.forEach((v, i) => {
      map[v.id] = `V${i + 1}`;
    });
    return map;
  })();

  function toggleEditDock() {
    editDockOpen = !editDockOpen;
  }

  /** Onglet Transcription — referme le choix du template : l'onglet doit
   *  montrer la transcription, pas le sélecteur ouvert par « Nouveau résumé ». */
  function showTranscriptionTab() {
    activeTab = 'transcription';
    editDockOpen = false;
  }

  async function generateSummary(opts) {
    // If still recording, stop first then auto-generate via reactive — preserve opts
    if (isRecording) {
      isPaused = false;
      pendingGenerateOpts = opts ?? null;
      shouldGenerateOnStop = true;
      stopRecording();
      releaseWakeLock();
      return;
    }
    // Une rédaction à la fois PAR RÉUNION : une autre réunion peut s'écrire en même temps.
    if (summaryVersions.some((v) => v.pending)) return;
    // Transcript = TOUJOURS la transcription affichée (réunion sélectionnée :
    // live OU ancienne conversation). On ne se fie PLUS à transcriptionFullText,
    // qui pouvait rester celui d'une session précédente (résumé basé sur la
    // mauvaise réunion observé sur d'anciennes discussions).
    const { text: fullTranscript, attribution: transcriptAttribution } = buildAttributedTranscript(
      transcriptionHistory,
      userInfo?.name,
    );
    if (!fullTranscript.trim()) {
      alert(t('alerts.noTranscription'));
      return;
    }
    const firstSummary = !hasGeneratedSummary; // « Et maintenant ? » : stores/afterSummary.js
    setStatus('statuses.summaryGenerating', 'active');
    const pendingVersion = pendingVersionFrom(opts, currentTemplate);
    summaryVersions = [...summaryVersions, pendingVersion];
    // L'écran peut quitter cette réunion pendant l'attente : la rédaction lui est
    // rattachée (titre animé dans l'historique, version remise à sa réouverture),
    // et la réponse ne touche l'écran que si sa version en attente y est encore.
    beginSummaryGeneration(currentMeetingId, pendingVersion);
    const here = () => summaryVersions.some((v) => v.id === pendingVersion.id);
    let resumedId = currentMeetingId; // réunion écrite par /resume : l'écran peut en changer
    activeTab = 'resume'; // le voile « Résumé en cours » vit dans l'onglet Résumé
    dismissAiErrorNotice();
    try {
      const meetingDuration = getTotalMeetingDuration();
      // Durée inconnue -> null : les templates écrivent « inconnue », pas 00:00:00.
      const meetingDurationFormatted =
        meetingDuration > 0 ? formatDurationHHMMSS(meetingDuration) : null;
      const hasTranscript = transcriptionHistory.length > 0;
      const meetingStartTime = meetingStartIso(recordingStartTime, hasTranscript, meetingDuration);

      // Template envoyé à /resume : opts.template (édition) ou currentTemplate (live)
      const templateForRequest = opts?.template ?? currentTemplate;
      if (opts?.template && opts.template !== currentTemplate) {
        currentTemplate = opts.template;
      }
      const isEdit = !!currentMeetingId;
      notesActionsSaver.forget(resumedId); // /resume écrit l'état de SA requête
      // Forme écrite : échéances yyyy-MM-dd, ni animation ni texte de remplacement.
      const storedActions = toStoredActions(detectedActions);
      const tagged = summaryTag(currentMeetingId ? currentMeetingTag : pendingTagId); // + son contexte
      const plan = resolveSummaryPlan(
        templateForRequest,
        {
          language: $currentLanguageStore,
          actions: storedActions,
          meetingDurationFormatted,
          authorName: userInfo?.name && isValidUserName(userInfo.name) ? userInfo.name : null,
          ton: opts?.ton ?? null,
          longueur: opts?.longueur ?? null,
          customPrompt: opts?.customPrompt ?? null,
          userContext: userContext && userContext.trim() ? userContext.trim() : null,
          orgContext: $orgContext || null,
          ...tagged,
          meetingNotes,
          transcriptAttribution,
          pages: opts?.pages ?? null,
          transcript: fullTranscript,
          includeActions: opts?.withActions !== false, // tuile « Actions détectées »
        },
        [...userTemplates, ...customTemplates],
      );
      // Réponse BRUTE : corps d'erreur inspecté verbatim (« crédit IA épuisé » vs panne).
      const response = await apiRaw('/resume', {
        method: 'POST',
        body: {
          transcription: fullTranscript,
          systemPrompt: plan.systemPrompt,
          blocks: plan.blocks,
          length: plan.length,
          template: templateForRequest,
          language: $currentLanguageStore,
          actions: storedActions,
          // Pré-géneré frontend (utilisé pour V1 atomic insert backend)
          versionId: pendingVersion.id,
          // Paramètres de durée et heure de la réunion
          meetingDuration: meetingDuration, // Durée en secondes
          meetingDurationFormatted: meetingDurationFormatted, // Durée formatée en HH:MM:SS
          meetingStartTime: meetingStartTime, // Heure de début au format ISO
          sessionId: clientSecret,
          // Édition / régénération d'un résumé existant
          meetingId: currentMeetingId,
          isEdit,
          ton: opts?.ton ?? null,
          longueur: opts?.longueur ?? null,
          customPrompt: opts?.customPrompt ?? null,
          userContext: userContext && userContext.trim() ? userContext.trim() : null,
          tagId: tagged.tagId, // l'infographie relit son contexte en base
          notes: meetingNotes,
          // Infographie (case du panneau de génération) : générée en tâche de
          // fond côté serveur, suivie par stores/infographic.js via l'historique.
          infographic: opts?.infographic === true,
        },
      });
      // Aucune réponse = réseau absent : même chemin que le fetch rejeté d'avant.
      if (!response) throw new Error('/resume injoignable');

      if (response.ok) {
        let summaryFromResponse = '';
        let measured = {}; // Pagimètre : ce que le serveur a appliqué et mesuré — ou rien
        const contentType = response.headers.get('Content-Type') || '';

        if (contentType.includes('application/json')) {
          const result = await response.json();
          measured = { pages: result.pages ?? undefined, measuredPages: result.measuredPages };
          summaryFromResponse =
            result.resume ||
            result.text ||
            result.content ||
            result[0]?.resume ||
            JSON.stringify(result, null, 2);
          const receivedMeetingId = result.meetingId || result[0]?.meetingId;
          resumedId = resumedId || receivedMeetingId;
          if (receivedMeetingId && !currentMeetingId && here()) {
            currentMeetingId = receivedMeetingId;
            await postPendingTag(currentMeetingId); // AVANT le rechargement de l'historique
          }
        } else {
          summaryFromResponse = await response.text();
        }

        // Même nettoyage que partout ailleurs (ce bloc dupliquait la fonction
        // à l'identique) ; repli sur le texte par défaut si la réponse est vide.
        const normalizedText =
          normalizeSummaryHtml(summaryFromResponse) ||
          getDefaultSummaryTextFor($currentLanguageStore);

        const done = finalizePendingVersion(pendingVersion, normalizedText, measured);
        // V1 (!isEdit): backend a déjà inséré versions:[V1] dans /resume — ne pas re-push.
        // V2+ (isEdit): /resume a généré le texte uniquement, push atomique de la nouvelle version.
        if (isEdit) await addVersion(resumedId, done);
        setStatus('statuses.summaryReady');
        // /resume a écrit l'état de SA requête : une retouche faite depuis repasse devant.
        notesActionsSaver.resend(resumedId);
        // Sans await : la boucle attend le titre généré en tâche de fond côté
        // backend, l'utilisateur lit déjà son résumé pendant ce temps.
        const ready = pollHistoryUntilMeetingReady(resumedId, fetchHistoryItems);
        if (firstSummary) offerAfterSummary(resumedId, ready);
        // Écran sur une autre réunion : le compte rendu l'attend en base — le dire.
        if (!here()) {
          showToast('messages.summaryReadyFor', 'success', 6000, { title: titleOf(resumedId) });
        }
      } else {
        abortPendingVersion(pendingVersion.id, t('messages.summaryError'), resumedId);
        // 401/403 → handleHttpError lève SESSION_EXPIRED (traité dans le catch).
        // Autres codes (402/429/5xx…) = IA inaccessible (crédit épuisé,
        // clé, quota, panne) : inspecte le corps pour distinguer le « plus de
        // crédit » (message dédié) du reste, et logue la cause pour l'admin.
        const info = await inspectAiServiceError(response, '/resume');
        await handleHttpError(response, '/resume');
        reportAiError(info, resumedId);
      }
    } catch (error) {
      // Erreurs de fetch (réseau, CORS, OAuth) et d'authentification. `||` :
      // handleFetchError (effets de bord) n'est consulté que hors SESSION_EXPIRED.
      const expired =
        error.message === 'SESSION_EXPIRED' ||
        handleFetchError(error, '/resume') === 'SESSION_EXPIRED';
      if (expired) console.warn('⚠️ Session expirée : résumé non généré, reconnectez-vous.');
      const message = t(expired ? 'messages.summaryErrorExpired' : 'messages.summaryError');
      abortPendingVersion(pendingVersion.id, message, resumedId);
      if (!expired) {
        console.error('Erreur:', error);
        saveSessionData();
        // Aucune réponse (réseau/hors-ligne) → message connexion ; sinon service IA.
        const category = categorizeApiError({ error });
        showToast(aiErrorMessageKey(category), 'error', 7000);
        showAiErrorNotice(category === 'network' ? 'network' : 'service', '', resumedId);
      }
    } finally {
      endSummaryGeneration(pendingVersion.id);
    }
  }

  async function downloadTranscription() {
    if (!transcriptionFullText || !transcriptionFullText.trim()) return;
    saveFile({
      filename: await documentNameFor({
        historyItem: currentHistoryItem,
        ext: 'txt',
        fallback: 'transcription',
      }),
      mimeType: 'text/plain;charset=utf-8',
      data: transcriptionFullText,
    }).catch((e) => console.error('Export transcription échoué:', e));
  }

  async function handleAudioUpload(event) {
    setStatus('statuses.processingAudio', 'active');
    // Durée du média importé = durée de réunion (pas de chronomètre ici).
    const file = event?.target?.files?.[0];
    if (file) fallbackMeetingDuration = await readAudioDurationS(file);
    await handleAudioUploadUtil(event, processAudio, formatMessage);
  }

  function startNewMeeting() {
    // Arrêter l'enregistrement en cours si nécessaire
    if (isRecording) {
      stopRecording();
    }

    currentMeetingId = null;
    pendingTagId = null;
    $selectedMeetingId = null;
    savedLiveState = null;
    editDockOpen = false;
    summaryVersions = [];
    activeVersionId = null;
    pendingDeleteVersionId = null;
    meetingNotes = '';
    fallbackMeetingDuration = 0;

    // Aucune analyse de la réunion précédente ne doit atterrir dans celle-ci.
    actionScheduler.reset();
    transcriptRefiner.reset();
    meetingToken += 1;

    startNewMeetingUtil({
      setTranscriptionHistory: (val) => {
        transcriptionHistory = val;
      },
      setTranscriptionFullText: (val) => {
        transcriptionFullText = val;
      },
      setDetectedActions: (val) => {
        detectedActions = val;
      },
      setVisibleActions: (val) => {
        visibleActions = val;
      },
      setActionIdCounter: (val) => {
        actionIdCounter = val;
      },
      setSummaryText: (val) => {
        summaryText = val;
      },
      // Vidé par « Nouvelle réunion » : RÉVOQUER, sinon le Blob de toute la
      // réunion (plusieurs dizaines de Mo) reste en mémoire jusqu'au reload.
      setRecordedAudioUrl: (val) => (val ? (recordedAudioUrl = val) : resetRecordedAudio()),
      setRecordedFilename: (val) => {
        recordedFilename = val;
      },
      setCumulativeRecordingTime: (val) => {
        cumulativeRecordingTime = val;
      },
      getDefaultSummaryTextFor,
      currentLanguage: $currentLanguageStore,
      clearSessionData,
      saveSessionData,
      setStatus,
    });

    nextContinuePromptAtMs = CONTINUE_PROMPT_AFTER_MS;
    closeContinuePrompt();
  }

  /** Paramètres de rendu du PDF — partagés par le téléchargement et la pièce jointe. */
  function pdfConfig() {
    return {
      hasGeneratedSummary,
      summaryText,
      tagId: currentMeetingTag, // son logo (client, projet) en tête du PDF
      userName:
        userInfo?.name && isValidUserName(userInfo.name)
          ? userInfo.name
          : $uiText.transcription.defaultAuthor,
      currentTemplate,
      currentLanguage: $currentLanguageStore,
      templateOptions,
      t,
      formatMessage,
      setStatus,
      isValidUserName,
      uiText: $uiText,
    };
  }

  // Sous le verrou des actions : un double appui fabriquait deux PDF et, en
  // natif, ouvrait une seconde feuille de partage que le système refuse.
  const generatePDF = () =>
    withPostActionLock('download', () =>
      generatePDFUtil(pdfConfig()).catch((error) => {
        console.error('Erreur lors de la génération du PDF:', error);
        showGlobalToast(error.message, 'error', 8000); // déjà mis en forme par utils/pdf.js
      }),
    );

  // ── Actions « Envoyer par mail » / « Entreposer » ──────────────────────────

  // La réunion affichée DANS l'historique — archive ouverte comme direct tout
  // juste terminé. Résolue sur `currentMeetingId` et non sur la sélection
  // d'historique, vide juste après une génération : mail, dépôt et fichiers
  // partaient alors sans titre (objet et nom génériques).
  $: currentHistoryItem =
    (currentMeetingId && $historyItems.find((it) => meetingIdOf(it) === currentMeetingId)) || null;
  $: currentMeetingTag = currentHistoryItem?.tagId || null;
  const currentMeetingTitle = () => (currentHistoryItem?.title || '').trim();

  /** Slug d'erreur de tag → toast, avec les libellés du panneau « Mes tags ». */
  function showTagError(slug) {
    const errors = $uiText.tagsPanel.errors;
    showGlobalToast(errors[slug] || errors.network, 'error', 5000);
  }

  /** Tag mis en attente : posé dès que la réunion existe en base. */
  async function postPendingTag(meetingId) {
    if (!pendingTagId) return;
    const res = await tagMeeting(meetingId, pendingTagId);
    if (!res.ok) showTagError(res.error);
    pendingTagId = null;
  }

  /**
   * Tag choisi depuis l'écran d'enregistrement. Réunion déjà en base
   * (résumé déjà généré) : pose immédiate. Sinon : mis en attente, appliqué
   * quand le premier résumé crée la réunion et renvoie son meetingId.
   */
  function handleRecordingTagPick(tagId) {
    if (currentMeetingId) {
      tagMeeting(currentMeetingId, tagId).then((res) => {
        if (!res.ok) showTagError(res.error);
      });
    } else {
      pendingTagId = tagId;
    }
  }

  /** Document du contexte demandé — `meetingId` : cf. buildActionDocument. */
  const postActionPayload = (kind) =>
    buildActionDocument({
      kind,
      content: kind === 'summary' ? summaryText : transcriptionFullText,
      title: currentMeetingTitle(),
      lang: $currentLanguageStore,
      meetingId: currentMeetingId,
    });

  // Une action à la fois — mail, dépôt, PDF. La valeur NOMME l'action en cours :
  // c'est elle que le bouton affiche en attendant (components/PostActions.svelte).
  let postActionBusy = null;
  async function withPostActionLock(action, task) {
    if (postActionBusy) return;
    postActionBusy = action;
    try {
      await task();
    } finally {
      postActionBusy = null;
    }
  }

  /** Document + fichier de l'action demandée, ou null si rien à envoyer. */
  async function postActionInputs(kind) {
    const payload = postActionPayload(kind);
    if (!payload) return null;
    return {
      payload,
      attachment: await buildActionAttachment({
        kind,
        transcriptionText: transcriptionFullText,
        historyItem: currentHistoryItem,
        pdfConfig: pdfConfig(),
      }),
    };
  }

  const emailDocument = (kind) =>
    withPostActionLock('email', async () => {
      const inputs = await postActionInputs(kind);
      if (inputs) await runEmailAction({ ...inputs, showToast, email: $auth.user?.email || '' });
    });

  const storeDocumentAction = (kind) =>
    withPostActionLock('storage', async () => {
      const inputs = await postActionInputs(kind);
      if (inputs) {
        const providerLabel = $actionAvailability.storageLabel;
        await runStoreAction({ ...inputs, showToast, providerLabel });
      }
    });
</script>

<svelte:window on:load={onMountInit} on:keydown={handleEscapeKey} on:resize={syncSidebarToWidth} />

<!-- Hidden inputs / overlays preserved -->
<input
  id="audioUpload"
  type="file"
  accept="audio/*"
  style="display: none;"
  on:change={handleAudioUpload}
/>

<ToastHost />
<QuotaLiveAlert />
<StoreApprovalDialog />
<AfterSummaryDialog
  meetingId={currentMeetingId}
  onEmail={emailDocument}
  onStore={storeDocumentAction}
/>

{#if isImportingAudio}
  <div class="audio-import-overlay">
    <div class="audio-import-message">
      <div class="audio-import-spinner"></div>
      <span>{$uiText.statuses.importingAudio}</span>
    </div>
  </div>
{/if}

{#if showContinueModal}
  <!-- Spec : l'enregistrement CONTINUE tant que l'invite est ouverte ; toute
       fermeture sans « Poursuivre » (backdrop, ×, Escape, timeout) = arrêt +
       sauvegarde. Le compte à rebours affiche le temps restant avant arrêt auto. -->
  <div
    class="continue-prompt-backdrop"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="continue-prompt-title"
    on:click={() => handleContinueChoice(false)}
  >
    <div class="continue-prompt-modal" on:click|stopPropagation>
      <button
        class="continue-prompt-close"
        aria-label={$uiText.ariaLabels.close}
        on:click={() => handleContinueChoice(false)}>×</button
      >
      <div class="continue-prompt-icon">⏱️</div>
      <h2 id="continue-prompt-title">{$uiText.continueRecording.title}</h2>
      <p>{$uiText.continueRecording.message.replace('{duration}', continuePromptDurationLabel)}</p>
      <p class="continue-prompt-countdown">
        {$uiText.continueRecording.countdown.replace('{countdown}', continueCountdownDisplay)}
      </p>
      <div class="continue-prompt-actions">
        <button class="continue-prompt-stop" on:click={() => handleContinueChoice(false)}
          >{$uiText.continueRecording.stop}</button
        >
        <button
          id="continuePromptConfirm"
          class="continue-prompt-confirm"
          on:click={() => handleContinueChoice(true)}>{$uiText.continueRecording.continue}</button
        >
      </div>
    </div>
  </div>
{/if}

{#if showNativeLogin}
  <NativeLoginGate uiText={$uiText} logoUrl={appLogo} errorMessage={nativeLoginError} />
{/if}

<!-- Écran de connexion web (mot de passe + SSO). Monté en overlay plein écran
     plutôt qu'en enveloppant le template : l'app reste montée derrière, ce qui
     évite de toucher aux centaines de lignes de markup qui suivent. L'app
     native garde sa propre porte (NativeLoginGate). -->
{#if !isNative && $auth.status === 'signed_out'}
  <SignInScreen logoUrl={appLogo} />
{/if}

<!-- Mot de passe initial encore actif : modale non fermable. Le serveur applique
     la même règle de son côté (403 password_change_required). -->
{#if $auth.status === 'authenticated' && $auth.user?.mustChangePassword}
  <!-- Le chargement des données part tout seul quand le verrou tombe (bloc
       réactif ci-dessus) : rien à déclencher ici. -->
  <ChangePasswordModal forced={true} />
{:else if showChangePassword}
  <ChangePasswordModal
    on:close={() => {
      showChangePassword = false;
    }}
  />
{/if}

{#if showDisconnectedModal}
  <div
    class="disconnected-modal-backdrop"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="disconnected-modal-title"
  >
    <div class="disconnected-modal">
      <div class="disconnected-modal-icon">🔒</div>
      <h2 id="disconnected-modal-title">{$uiText.disconnection.title}</h2>
      <p>{$uiText.disconnection.message}</p>
      <div class="disconnected-modal-actions">
        <!-- Reconnexion = navigation délibérée vers /login (route protégée OIDC).
             Contourne volontairement le backoff de forceReauth (action user). -->
        <button class="disconnected-modal-confirm" on:click={reconnect}
          >{$uiText.disconnection.reconnect}</button
        >
        <button class="disconnected-modal-dismiss" on:click={() => (showDisconnectedModal = false)}
          >{$uiText.disconnection.confirm}</button
        >
      </div>
    </div>
  </div>
{/if}

<!-- Welcome modal (onboarding) -->
{#if showWelcomeModal}
  <WelcomeModal logoUrl={appLogo} uiText={$uiText} onClose={() => (showWelcomeModal = false)} />
{/if}

<!-- Portrait uniquement sur mobile : overlay affiché en paysage sur
     téléphone (ciblage CSS : pointer coarse + landscape + faible hauteur).
     Complète le lock matériel (PWA) qui n'est pas possible en navigateur. -->
<div class="rotate-overlay" role="alert">
  <div class="rotate-overlay-icon" aria-hidden="true">
    <IconRotate width="52" height="52" />
  </div>
  <h2 class="rotate-overlay-title">{$uiText.orientation.title}</h2>
  <p class="rotate-overlay-message">{$uiText.orientation.message}</p>
</div>

<!-- ─── NEW LAYOUT ──────────────────────────────────────────────── -->
<div class="app-layout">
  <!-- Version en bas à droite : cliquable, elle ouvre « Quoi de neuf ? » -->
  <WhatsNewBadge />

  <!-- Barre d'app mobile (masquée en CSS sur desktop). Hors de <main> à
       dessein — main est masqué quand un panneau est ouvert, la barre survit. -->
  <MobileAppBar
    menuOpen={$sidebarOpen}
    onToggleMenu={toggleSidebar}
    onMenuAction={handleSidebarMenuAction}
    canStart={!isRecording && !isPaused && !isRequestingMic}
    startBlocked={quotaBlocked}
    startLabel={$uiText.sidebar.newMeeting}
    onStart={handleNewMeetingMobile}
  />

  <!-- Sidebar -->
  <Sidebar
    {screen}
    isOpen={$sidebarOpen}
    onNewMeeting={handleNewMeetingMobile}
    onSelectHistory={handleSelectHistory}
    onDeleteHistory={requestDeleteHistoryItem}
    onGoToLive={restoreLiveSession}
    onToggle={toggleSidebar}
    onMenuAction={handleSidebarMenuAction}
  />

  <!-- Fond du tiroir (téléphone, tablette) : un clic referme la barre -->
  {#if $sidebarOpen}
    <div class="sidebar-backdrop" on:click={() => sidebarOpen.set(false)}></div>
  {/if}

  <!-- Administration : occupe toute la zone à droite de l'historique. Montée
       DANS le layout flex (et non en overlay plein écran) pour hériter de la
       largeur restante sans avoir à connaître celle de la sidebar, qui est
       redimensionnable. -->
  {#if $activePanel === 'admin'}
    <AdminPanel {userInfo} onClose={showMainScreen} />
  {/if}

  <!-- « Réglages » : même montage que l'administration, et panneau
       UNIQUE des réglages de l'utilisateur — « Mes templates », « Mes tags »
       et l'import audio y sont des sections (cf. SettingsPanel), plus des
       panneaux ni des modales à part. -->
  {#if $activePanel === 'config'}
    <SettingsPanel
      uiText={$uiText}
      {userContext}
      {userInfo}
      onSaveContext={saveUserConfig}
      onImportAudio={uploadAudio}
      onSetLanguage={setLanguage}
      onAccountAction={handleSidebarMenuAction}
      onClose={closeConfig}
    />
  {/if}

  <!-- Main area -->
  <main
    class="main-area"
    class:main-area-sidebar-closed={!$sidebarOpen}
    class:main-area-hidden={$activePanel !== null}
  >
    {#if screen === 'welcome'}
      <WelcomeScreen logoUrl={appLogo} userName={userInfo?.name} />
    {:else if screen === 'recording'}
      <!-- ── Recording ── -->
      <div class="content-layout">
        <div class="recording-screen">
          <!-- Compact top bar -->
          <div class="rec-topbar">
            <div class="rec-mic-ring" class:rec-mic-paused={isPaused}>
              <IconMicBold width="18" height="18" style="color: white" />
            </div>
            <span class="rec-label">{recLabel}</span>
            <!-- Rangement DÈS l'enregistrement : tag posé en attente tant que
                 la réunion n'a pas de meetingId (voir handleRecordingTagPick). -->
            <TagSelect
              meetingId={currentMeetingId}
              tagId={currentMeetingId ? currentMeetingTag : pendingTagId}
              onPick={handleRecordingTagPick}
              onError={showTagError}
            />
            <div class="rec-timer" id="recordingTimer">
              <span id="timerDisplay">00:00</span>
            </div>
          </div>

          <!-- Live transcript (suivi détachable : voir LiveTranscript.svelte) -->
          <LiveTranscript
            bind:this={liveTranscript}
            items={transcriptionHistory}
            selfName={userInfo?.name}
            waitingText={t('transcription.waiting')}
            followLabel={t('transcription.backToLive')}
            on:edit={(e) => editTranscription(e.detail.index, e.detail.text)}
            on:speaker={(e) => nameTranscriptSpeaker(e.detail)}
          />
        </div>

        <!-- Monté dès l'enregistrement, même sans action : c'est là que
             s'affichent l'état « à l'écoute » et l'indicateur d'analyse.
             La colonne partage sa hauteur avec les notes (grille .side-col). -->
        <div
          class="side-col side-col-live"
          class:side-col-collapsed={actionsPanelCollapsed}
          class:notes-expanded={notesExpanded && !actionsPanelCollapsed}
        >
          <ActionsPanel
            actions={visibleActions}
            {hiddenActions}
            countsLabel={actionsStatsLabel}
            collapsed={actionsPanelCollapsed}
            listening={true}
            analysisActive={actionAnalysisInFlight}
            uiText={$uiText}
            {texts}
            onToggleCollapsed={toggleActionsPanel}
            onAddManual={addManualAction}
            onAddFromCollapsed={addActionFromCollapsed}
            onRemove={(a) => showAction(a, false)}
            onRestore={(a) => showAction(a, true)}
            onSave={saveNotesActions}
          />
          <MeetingNotesPanel
            bind:notes={meetingNotes}
            expanded={notesExpanded}
            uiText={$uiText}
            onToggleExpanded={() => (notesExpanded = !notesExpanded)}
            onSave={handleNotesSave}
            onInput={handleNotesInput}
          />
        </div>
      </div>
    {:else}
      <!-- ── Active: tabs + panels ── -->
      <div class="content-layout">
        <!-- Main tab panel -->
        <div class="main-panel">
          <!-- Barre des documents (DocumentBar) : sélecteur Transcription /
               Résumé n, tag de la réunion, « Partager » et « Résumer » /
               « Nouveau résumé ». Les actions sont pilotées par l'administration
               (onglet « Actions ») via /api/auth/config ; le tag se choisit ici,
               là où il pré-remplit destinataires et dossier. -->
          <DocumentBar
            {activeTab}
            versions={summaryVersions}
            {activeVersionId}
            summaryInDock={dockOffered}
            pickerOpen={editDockOpen}
            generating={generatingHere}
            meetingId={currentMeetingId}
            tagId={currentMeetingTag}
            onShowTranscription={showTranscriptionTab}
            onSelectVersion={selectVersion}
            onDeleteVersion={requestDeleteVersion}
            onToggleSummary={toggleEditDock}
            onTagError={showTagError}
            onManageTags={() => openPanel('config', 'tags')}
            share={{
              kind: activeTab === 'resume' ? 'summary' : 'transcription',
              available:
                activeTab === 'resume' ? hasGeneratedSummary : !!transcriptionFullText?.trim(),
              content: activeTab === 'resume' ? summaryText : transcriptionFullText,
              meeting: currentHistoryItem,
              toggles: $actionAvailability[activeTab === 'resume' ? 'summary' : 'transcription'],
              emailReady: $actionAvailability.emailReady,
              storageProvider: $actionAvailability.storageProvider,
              busy: postActionBusy,
              locked: activeTab === 'resume' && generatingHere,
              onEmail: emailDocument,
              onStore: storeDocumentAction,
              onDownload: (kind) => (kind === 'summary' ? generatePDF() : downloadTranscription()),
            }}
          />

          <!-- Tab content -->
          <div class="tab-content">
            {#if editDockOpen}
              <TemplatePickerPanel
                {templateOptions}
                currentTemplate={activeVersion?.template ?? currentTemplate}
                currentPages={activeVersion?.pages ?? null}
                transcript={transcriptionHistory}
                actions={detectedActions}
                currentLanguage={$currentLanguageStore}
                isGeneratingSummary={generatingHere}
                onGenerate={handleEditGenerate}
                onCancel={() => (editDockOpen = false)}
              />
            {:else if activeTab === 'resume'}
              <div class="tab-resume-wrap">
                <ResumeOverlays
                  isGenerating={generatingHere}
                  loadingLabel={texts.resumeLoading}
                  showTag={hasGeneratedSummary && !!activeTemplateLabel}
                  tagIcon={activeTemplateIcon}
                  tagLabel={activeTemplateLabel}
                  tagLength={activeVersion?.pages ? activeVersion : null}
                  meetingId={currentMeetingId}
                />
                <AiErrorNotice
                  view={aiErrorNoticeView}
                  dismissLabel={t('aiNotice.dismiss')}
                  onDismiss={dismissAiErrorNotice}
                />
                <MarkdownEditor
                  html={summaryText}
                  labels={$uiText.editor}
                  on:update={(e) => handleSummaryUpdate(e.detail.html)}
                  on:blur={(e) => handleSummaryBlur(e.detail.html)}
                >
                  <SummarySaveStatus slot="status" state={saveIndicator} labels={$uiText.editor} />
                </MarkdownEditor>
              </div>
            {:else}
              <!-- Transcription tab -->
              <div class="tab-transcript-wrap" id="transcriptDiv">
                <EditableTranscript
                  items={transcriptionHistory}
                  selfName={userInfo?.name}
                  on:edit={(e) => editTranscription(e.detail.index, e.detail.text)}
                  on:speaker={(e) => nameTranscriptSpeaker(e.detail)}
                />
                {#if transcriptionHistory.length === 0}
                  <div class="transcript-empty">{$uiText.transcription.empty}</div>
                {/if}
                {#if canResumeMeeting && !dockOffered}
                  <ResumeMeetingCta onResume={resumeFinishedMeeting} busy={isRequestingMic} />
                {/if}
              </div>
              {#if transcriptionFullText && transcriptionFullText.trim() && recordedAudioUrl}
                <div class="transcript-footer">
                  <a
                    class="transcript-download-btn"
                    href={recordedAudioUrl}
                    download={recordedFilename || 'mybrief-recording.webm'}
                    title={$uiText.buttons.downloadAudio}
                    on:click={(e) =>
                      interceptAnchorDownload(
                        e,
                        recordedAudioUrl,
                        recordedFilename || 'mybrief-recording.webm',
                      )}
                  >
                    <IconDownload width="14" height="14" aria-hidden="true" />
                    <span>{$uiText.buttons.downloadAudio}</span>
                  </a>
                </div>
              {/if}
            {/if}
          </div>
        </div>

        <!-- Actions panel — visible sur les deux onglets (résumé ET transcription).
             Sibling persistant : ne se démonte pas au changement d'onglet (pas de
             perte d'édition en cours). Masqué sur mobile (CSS) → FAB prend le
             relais. Notes et actions restent éditables, gardées en base au fil de l'eau. -->
        <div
          class="side-col"
          class:side-col-collapsed={actionsPanelCollapsed}
          class:notes-expanded={notesExpanded && !actionsPanelCollapsed}
        >
          <ActionsPanel
            actions={visibleActions}
            {hiddenActions}
            countsLabel={actionsStatsLabel}
            collapsed={actionsPanelCollapsed}
            uiText={$uiText}
            {texts}
            onToggleCollapsed={toggleActionsPanel}
            onAddManual={addManualAction}
            onAddFromCollapsed={addActionFromCollapsed}
            onRemove={(a) => showAction(a, false)}
            onRestore={(a) => showAction(a, true)}
            onSave={saveNotesActions}
          />
          <MeetingNotesPanel
            bind:notes={meetingNotes}
            expanded={notesExpanded}
            uiText={$uiText}
            onToggleExpanded={() => (notesExpanded = !notesExpanded)}
            onSave={handleNotesSave}
            onInput={handleNotesInput}
          />
        </div>
      </div>
    {/if}

    <!-- ── Dock ── voir dockOffered ; JAMAIS masqué sur l'accueil : sans lui,
         plus de « Démarrer ». -->
    {#if dockVisible}
      <div class="dock-wrapper" class:dock-recording={screen === 'recording'}>
        <Dock
          {isRecording}
          {isPaused}
          analyser={silenceDetector?.analyser}
          hasTranscription={transcriptionHistory.length > 0}
          isGeneratingSummary={generatingHere}
          {isRequestingMic}
          startBlocked={quotaBlocked ? $uiText.quota.blockedShort : ''}
          onToggleRecording={toggleRecording}
          onPauseRecording={pauseRecording}
          onResumeRecording={resumeRecording}
          onOpenPicker={openTemplatePicker}
          onRequestDelete={() => (showDeleteModal = true)}
          onSave={saveMeeting}
          {canSave}
          onResumeMeeting={canResumeMeeting ? resumeFinishedMeeting : null}
        />
      </div>
    {/if}

    <!-- Mobile : barre de réunion (en réunion, à la place du dock) ou boutons
         flottants nommés (hors réunion) + modales notes/actions et feuille de fin. -->
    {#if screen === 'recording' || screen === 'active' || visibleActions.length > 0}
      <MobileMeetingOverlays
        {visibleActions}
        {hiddenActions}
        {texts}
        uiText={$uiText}
        {fabFlash}
        bind:notes={meetingNotes}
        removeAction={(a) => showAction(a, false)}
        restoreAction={(a) => showAction(a, true)}
        saveSessionData={saveNotesActions}
        {addManualAction}
        onSaveNotes={handleNotesSave}
        onNotesInput={handleNotesInput}
        live={isRecording || isPaused}
        {isPaused}
        analyser={silenceDetector?.analyser}
        {canSave}
        onPause={pauseRecording}
        onResume={resumeRecording}
        onOpenPicker={openTemplatePicker}
        onSave={saveMeeting}
        onRequestDelete={() => (showDeleteModal = true)}
        onSummarize={generateSummary}
        {templateOptions}
        bind:currentTemplate
      />
    {/if}
  </main>
</div>

<!-- Confirmations de suppression — même coquille, textes différents. -->
{#if pendingDeleteVersionId}
  <ConfirmDeleteModal
    title={formatMessage('modals.deleteVersionTitle', {
      label: versionLabelById[pendingDeleteVersionId] || $uiText.modals.deleteVersionFallback,
    })}
    body={$uiText.modals.deleteVersionBody}
    onCancel={cancelDeleteVersion}
    onConfirm={confirmDeleteVersion}
  />
{/if}

{#if pendingDeleteHistoryId}
  <ConfirmDeleteModal
    title={$uiText.modals.deleteMeetingTitle}
    body={$uiText.modals.deleteFromHistoryBody}
    onCancel={() => (pendingDeleteHistoryId = null)}
    onConfirm={confirmDeleteHistoryItem}
  />
{/if}

{#if canResumeSession}
  <!-- Le fond ne décide rien : un toucher à côté des boutons ne doit pas clore la réunion. -->
  <div
    class="delete-modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="resume-session-modal-title"
  >
    <div class="delete-modal">
      <div class="delete-modal-icon">
        <IconPlayCircle width="28" height="28" style="color: var(--mb-orange)" />
      </div>
      <h2 id="resume-session-modal-title" class="delete-modal-title">
        {$uiText.modals.resumeInterruptedTitle}
      </h2>
      <p class="delete-modal-body">{$uiText.modals.resumeInterruptedBody}</p>
      <div class="delete-modal-actions">
        <button class="delete-modal-cancel" on:click={dismissResume}
          >{$uiText.modals.endInterrupted}</button
        >
        <button
          class="delete-modal-confirm resume-modal-confirm"
          on:click={resumeInterruptedSession}>{$uiText.modals.resume}</button
        >
      </div>
    </div>
  </div>
{/if}

<!-- Navigateur qui ne capte pas le son de la visio (Firefox, Safari) -->
{#if showBrowserWarningModal}
  <BrowserAudioNotice
    onClose={() => (showBrowserWarningModal = false)}
    onConfigure={() => {
      showBrowserWarningModal = false;
      openPanel('config', 'meeting', 'audio');
    }}
  />
{/if}

{#if $meetingTypeAsked}
  <MeetingTypeModal onChoose={answerMeetingType} onCancel={() => answerMeetingType(null)} />
{/if}

<!-- Delete meeting modal — at body root, no transformed ancestor -->
{#if showDeleteModal}
  <ConfirmDeleteModal
    title={$uiText.modals.deleteMeetingTitle}
    body={$uiText.modals.deleteCurrentBody}
    onCancel={() => (showDeleteModal = false)}
    onConfirm={() => {
      showDeleteModal = false;
      // La réunion est en base depuis son premier mot, et la clôture normale ne
      // purge que les réunions VIDES : sans cette suppression explicite, la
      // réunion jetée resterait dans l'historique.
      const jetee = $liveMeetingIdStore || currentMeetingId;
      startNewMeeting();
      if (jetee) deleteMeeting(jetee);
    }}
  />
{/if}
