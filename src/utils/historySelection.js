/**
 * Ouverture d'une réunion d'historique : de la forme MONGO à l'état d'écran.
 *
 * Sorti d'App.svelte, où cette conversion occupait le gros de
 * `selectHistoryItem` et se mélangeait à ses effets de bord (mise de côté du
 * direct, jeton de détection, retour à l'écran principal). Ces effets restent
 * là-bas ; ici, une fonction PURE, testable, qui ne connaît que la forme des
 * documents.
 *
 * Les replis ne sont pas cosmétiques :
 *   - `summaryText` est réassigné dans TOUS les cas — c'est lui que rend le
 *     panneau central, et le laisser tel quel affichait le résumé de la réunion
 *     précédemment ouverte ;
 *   - une réunion sans `versions` (documents n8n, brouillons ouverts au
 *     démarrage de l'enregistrement) reçoit une version reconstruite, sinon
 *     l'écran n'aurait aucun onglet à afficher ;
 *   - `actions` a été stocké tantôt en tableau, tantôt en JSON sérialisé, et
 *     porte parfois les textes de remplacement d'autrefois (« À définir »…),
 *     vidés ici pour s'afficher en placeholder (cf. normalizeActions).
 */
import { normalizeSummaryHtml, LEGACY_VERSION_ID } from './summary.js';
import { parseAttributedTranscript } from './transcriptAttribution.js';
import { normalizeActions } from './liveActionsMerge.js';

/**
 * @param {Object} item - document d'historique tel que renvoyé par /history
 * @param {{defaultSummaryText: string, fallbackTemplate: string, selfLabel?: string}} opts
 *   `selfLabel` : étiquette du micro (selfSpeakerLabel) — sans elle, un
 *   participant de la visio nommé par l'utilisateur serait relu comme micro.
 * @returns {{summaryVersions: Array, activeVersionId: string, summaryText: string,
 *   detectedActions: Array, visibleActions: Array, meetingNotes: string,
 *   fallbackMeetingDuration: number, transcriptionHistory: Array,
 *   transcriptionFullText: string}}
 */
export function unpackHistoryItem(
  item,
  { defaultSummaryText = '', fallbackTemplate = '', selfLabel = '' } = {},
) {
  const versions = Array.isArray(item?.versions) ? item.versions : [];
  let summaryVersions;
  let activeVersionId;
  let summaryText;
  const legacyHtml = normalizeSummaryHtml(item?.resume) || '';
  if (versions.length > 0) {
    summaryVersions = versions;
    const lastVersion = versions[versions.length - 1];
    activeVersionId = lastVersion.id;
    summaryText = normalizeSummaryHtml(lastVersion.html || item.resume) || defaultSummaryText;
  } else if (legacyHtml.trim()) {
    // Document n8n : un compte rendu sans tableau de versions. Identifiant
    // FIXE : celui sous lequel le serveur inscrit cette version en base.
    const initialVersion = {
      id: LEGACY_VERSION_ID,
      html: legacyHtml,
      template: item?.template ?? fallbackTemplate,
      ton: null,
      longueur: null,
      customPrompt: null,
      generatedAt: item?.lastConnection || item?.now || new Date().toISOString(),
    };
    summaryVersions = [initialVersion];
    activeVersionId = initialVersion.id;
    summaryText = initialVersion.html;
  } else {
    // Réunion enregistrée SANS compte rendu (brouillon ouvert au démarrage,
    // clos par « Enregistrer ») : aucune version. Une version vide fabriquée
    // ici affichait un onglet « Résumé 1 » qui n'ouvrait que sur le texte
    // d'accueil — l'écran s'ouvre plutôt sur la transcription, avec
    // « Nouveau résumé » à côté (App.svelte → selectHistoryItem).
    summaryVersions = [];
    activeVersionId = null;
    summaryText = defaultSummaryText;
  }

  const { actions: detectedActions } = normalizeActions(
    Array.isArray(item?.actions)
      ? item.actions
      : typeof item?.actions === 'string' && item.actions.trim()
        ? JSON.parse(item.actions)
        : [],
  );

  // Durée réelle en base : le chronomètre est à zéro quand la réunion vient de
  // l'historique, c'est ce repli qui alimente l'en-tête et les gabarits.
  const storedDuration = Math.round(Number(item?.meetingDuration));

  const rawTranscription = item?.transcription || '';
  const lines = rawTranscription.trim()
    ? rawTranscription.split(/\n+/).filter((l) => l.trim())
    : [];
  // Réunion enregistrée sur les deux flux : la transcription stockée porte des
  // lignes d'étiquette « [Nom] » / « [Visio] ». Elles ne sont PAS du texte de
  // réunion — les rendre telles quelles afficherait des lignes parasites et
  // régénérer le compte rendu perdrait l'attribution.
  const attributed = rawTranscription.trim()
    ? parseAttributedTranscript(rawTranscription, selfLabel)
    : null;

  return {
    summaryVersions,
    activeVersionId,
    summaryText,
    detectedActions,
    // Les actions masquées portent `show: false` — elles restent en base.
    visibleActions: detectedActions.filter((action) => action.show !== false),
    meetingNotes: typeof item?.notes === 'string' ? item.notes : '',
    fallbackMeetingDuration:
      Number.isFinite(storedDuration) && storedDuration > 0 ? storedDuration : 0,
    // `time` VIDE, jamais la date du document : les horodatages par ligne ne
    // survivent pas au stockage (la transcription est un texte plat), et
    // recopier la date ISO de la réunion sur chaque ligne affichait
    // « 2026-08-27T15:01:27.449Z » en colonne — illisible, et une marge morte
    // de ~150 px. L'écran masque la colonne quand la ligne n'a pas d'heure ;
    // la date de la réunion, elle, se lit déjà dans la sidebar.
    transcriptionHistory: !rawTranscription.trim()
      ? [{ time: '', text: '' }]
      : attributed
        ? attributed.map((it) => ({ time: '', ...it }))
        : lines.length > 1
          ? lines.map((line) => ({ time: '', text: line.trim() }))
          : [{ time: '', text: rawTranscription }],
    transcriptionFullText: rawTranscription.trim() ? rawTranscription : '',
  };
}
