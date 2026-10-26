/**
 * Transcription attribuée pour le résumé — dit QUI parle quand la réunion a
 * tourné sur les DEUX flux audio (micro tag 'local' + audio système de la
 * visio tag 'remote', cf. lib/realtime/channel.js). Sans cela, generateSummary
 * aplatissait tout en texte brut : le modèle ne pouvait pas distinguer une
 * phrase de l'utilisateur d'une phrase venue de la visio, et le compte rendu
 * n'attribuait rien.
 *
 * Format script : une ligne d'étiquette `[Nom]` / `[Visio]` à CHAQUE
 * changement de locuteur, puis les lignes de ce locuteur. Les marqueurs de gap
 * hors ligne (offlineGapId) n'appartiennent à personne : ils passent tels
 * quels et ne cassent pas le groupement.
 *
 * Participants de la visio NOMMÉS par l'utilisateur (utils/transcriptSpeakers.js) :
 * une ligne distante porte alors `speaker: 'Marie'` et son étiquette devient
 * `[Marie]`. Une ligne distante SANS nom hérite du dernier nom distant posé
 * avant elle (en direct, ce que Marie continue de dire reste à Marie) ; sans
 * aucun nom, elle reste `[Visio]`. Le canal audio (`source`) reste ce qui
 * distingue « moi » de « eux » : un nom ne change jamais la couleur.
 *
 * Réunion mono-flux (micro seul — Firefox, mobile, visio sans partage
 * d'onglet) : texte plat IDENTIQUE à l'ancien join, aucune étiquette, et
 * `attribution: null` pour que le prompt n'en parle pas.
 */
import { isValidUserName } from './userIdentity.js';

/** Étiquette du flux audio système (participants entendus via la visio). */
export const REMOTE_SPEAKER_LABEL = 'Visio';

/** Repli quand le nom de l'utilisateur est absent ou sentinelle. */
const SELF_FALLBACK_LABEL = 'Moi';

/**
 * Étiquette du flux micro : le nom réel de l'utilisateur si exploitable,
 * sinon « Moi ». Les crochets sont retirés du nom — ils délimitent les
 * étiquettes dans la transcription.
 * @param {string|undefined|null} rawName - userInfo.name, non validé
 */
export function selfSpeakerLabel(rawName) {
  if (!isValidUserName(rawName)) return SELF_FALLBACK_LABEL;
  const cleaned = rawName
    .trim()
    .replace(/[\[\]]/g, '')
    .trim();
  return cleaned || SELF_FALLBACK_LABEL;
}

/**
 * Une ligne réduite à une étiquette : `[Alex]`, `[Visio]`. Bornée à 60
 * caractères et sans crochet interne — une phrase de réunion ne prend pas
 * cette forme, et le double garde-fou (≥ 2 étiquettes distinctes, ci-dessous)
 * empêche de prendre une réplique entre crochets pour un locuteur.
 */
const LABEL_RE = /^\[([^[\]\n]{1,60})\]$/;

function sourceOfLabel(label, selfLabel) {
  if (label === REMOTE_SPEAKER_LABEL) return 'remote';
  if (typeof selfLabel === 'string' && selfLabel) return label === selfLabel ? 'local' : 'remote';
  return 'local';
}

/**
 * Lecture inverse : la transcription STOCKÉE (étiquetée par
 * buildAttributedTranscript, puis éventuellement corrigée à la main) redevient
 * un historique de lignes portant leur `source`. Sans cela, rouvrir une
 * réunion archivée afficherait les étiquettes comme des lignes de transcript,
 * et régénérer son compte rendu perdrait l'attribution.
 *
 * L'étiquette lue est conservée dans `speaker` et pilote l'affichage ; la
 * `source` (couleur, canal) est déduite de l'étiquette : `[Visio]` est
 * toujours le canal distant, l'étiquette de l'utilisateur (`selfLabel`) le
 * micro, et tout AUTRE nom un participant de la visio nommé par l'utilisateur.
 * Sans `selfLabel` (ancien appelant), seule `[Visio]` est distante — c'est le
 * comportement d'avant, à l'octet près.
 *
 * @param {string} rawText - transcription stockée
 * @param {string} [selfLabel] - étiquette du canal micro (selfSpeakerLabel)
 * @returns {Array<{text: string, source: string, speaker: string}>|null} null
 *   si le texte n'est PAS étiqueté : l'appelant garde son traitement d'avant.
 */
export function parseAttributedTranscript(rawText, selfLabel) {
  const lines = String(rawText || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const labels = new Set();
  for (const line of lines) {
    const m = LABEL_RE.exec(line);
    if (m) labels.add(m[1].trim());
  }
  // Une seule étiquette ne prouve rien (une réplique isolée entre crochets
  // suffirait) ; deux locuteurs distincts, si.
  if (labels.size < 2) return null;

  const items = [];
  let speaker = '';
  for (const line of lines) {
    const m = LABEL_RE.exec(line);
    if (m) {
      speaker = m[1].trim();
      continue;
    }
    items.push({ text: line, source: sourceOfLabel(speaker, selfLabel), speaker });
  }
  // Que des étiquettes, aucun texte : rien d'exploitable.
  return items.length ? items : null;
}

/**
 * Étiquette effective de chaque ligne, dans l'ordre de l'historique.
 * Ligne micro : `speaker` relu d'une archive, sinon le nom courant. Ligne
 * distante : son `speaker` s'il est posé, sinon le dernier nom distant posé
 * avant elle (héritage — cf. en-tête), sinon « Visio ». Marqueur de gap : ''.
 *
 * Un seul calcul partagé par le texte envoyé au modèle (ci-dessous) et par les
 * pastilles de l'écran (EditableTranscript) : ce que l'utilisateur voit est ce
 * que le modèle reçoit.
 *
 * @param {Array<{speaker?: string, source?: string, offlineGapId?: string}>} history
 * @param {string|undefined|null} rawSelfName - userInfo.name, non validé
 * @returns {string[]}
 */
export function effectiveSpeakerLabels(history, rawSelfName) {
  const selfLabel = selfSpeakerLabel(rawSelfName);
  let lastRemote = REMOTE_SPEAKER_LABEL;
  return (history || []).map((item) => {
    if (!item || item.offlineGapId) return '';
    const explicit = String(item.speaker || '').trim();
    if ((item.source || 'local') !== 'remote') return explicit || selfLabel;
    if (explicit) lastRemote = explicit;
    return lastRemote;
  });
}

/**
 * @param {Array<{text?: string, source?: string, speaker?: string, offlineGapId?: string}>} history
 * @param {string|undefined|null} rawSelfName - userInfo.name, non validé
 * @returns {{text: string, attribution: {selfLabel: string, remoteLabel: string, remoteLabels: string[]}|null}}
 *   `attribution` est non-nul seulement si les deux sources sont réellement
 *   présentes — c'est le signal pour injecter le bloc d'explication dans le
 *   prompt (config/templates.js, buildAttributionBlock). `remoteLabels` liste
 *   les étiquettes distantes rencontrées, dans l'ordre (noms posés, et
 *   « Visio » s'il reste des voix non identifiées).
 */
export function buildAttributedTranscript(history, rawSelfName) {
  const items = [];
  for (const item of history || []) {
    const text = (item?.text || '').trim();
    if (text) items.push({ ...item, text });
  }

  const sources = new Set();
  for (const item of items) {
    if (!item.offlineGapId) sources.add(item.source || 'local');
  }
  if (!(sources.has('local') && sources.has('remote'))) {
    return { text: items.map((i) => i.text).join('\n'), attribution: null };
  }

  const selfLabel = selfSpeakerLabel(rawSelfName);
  const effective = effectiveSpeakerLabels(items, rawSelfName);
  const remoteLabels = [];
  const lines = [];
  let lastLabel = null;
  items.forEach((item, i) => {
    if (item.offlineGapId) {
      lines.push(item.text);
      return;
    }
    // Le texte envoyé au modèle étiquette le micro du nom COURANT, jamais
    // d'un nom relu : c'est ce nom que le bloc d'attribution explique.
    const label = (item.source || 'local') === 'remote' ? effective[i] : selfLabel;
    if (label !== lastLabel) {
      lines.push(`[${label}]`);
      lastLabel = label;
    }
    if ((item.source || 'local') === 'remote' && !remoteLabels.includes(label)) {
      remoteLabels.push(label);
    }
    lines.push(item.text);
  });
  return {
    text: lines.join('\n'),
    attribution: { selfLabel, remoteLabel: REMOTE_SPEAKER_LABEL, remoteLabels },
  };
}
