/**
 * Consommation d'IA d'une période, mesurée dans la base — fonction PURE.
 *
 * Trois horloges, parce que trois dépenses ne tombent pas au même moment :
 *   - la TRANSCRIPTION et la détection d'actions se paient pendant la réunion :
 *     elles suivent la date de la réunion, comme lib/stats.js — les deux écrans
 *     comptent donc les mêmes réunions ;
 *   - un COMPTE RENDU se paie à sa génération : chaque version porte sa date
 *     (`generatedAt`), et régénérer en septembre le compte rendu d'une réunion
 *     de juin est une dépense de septembre ;
 *   - une INFOGRAPHIE se paie à son dessin (`infographic.updatedAt`).
 *
 * Une durée ABSENTE n'est toujours pas une durée nulle (cf. lib/stats.js) :
 * ici elle se DÉDUIT de la longueur du texte transcrit, au débit de parole de
 * l'installation — ne pas compter ces réunions, ce serait les déclarer
 * gratuites. `inferredDurations` dit combien de réunions sont dans ce cas,
 * `unmeasured` combien n'ont ni durée ni texte (et ne coûtent donc rien ici).
 *
 * Bornes connues, assumées : une version de compte rendu supprimée n'est plus
 * comptée, et seule la dernière infographie d'une réunion l'est (chaque
 * nouvelle image remplace la précédente, cf. lib/infographic.js).
 */
import { meetingDate, ownerKey } from '../stats.js';
import { ASSUMPTIONS } from './assumptions.js';

/** Une infographie qui se dessine sera facturée : `pending` compte, `error` non. */
const BILLED_INFOGRAPHIC = new Set(['ready', 'pending']);

/**
 * Débit de parole au-delà duquel un couple durée/texte est une donnée cassée
 * (durée tronquée, texte importé) — il fausserait la moyenne de l'installation.
 */
const PLAUSIBLE_RATE = { min: 2, max: 40 };
/** En dessous d'une heure mesurée au total, le débit de repli est plus fiable. */
const MIN_MEASURED_SECONDS = 3600;

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dateOf(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Débit de parole de l'installation, en caractères par seconde : le rapport
 * texte/durée des réunions qui portent les deux mesures. `null` tant qu'elles
 * ne cumulent pas une heure.
 *
 * @param {Array} meetings
 * @returns {number|null}
 */
export function speechRateOf(meetings) {
  let chars = 0;
  let seconds = 0;
  for (const doc of meetings) {
    const size = positive(doc.transcriptionChars);
    const duration = positive(doc.meetingDuration);
    if (!size || !duration) continue;
    const rate = size / duration;
    if (rate < PLAUSIBLE_RATE.min || rate > PLAUSIBLE_RATE.max) continue;
    chars += size;
    seconds += duration;
  }
  return seconds >= MIN_MEASURED_SECONDS ? chars / seconds : null;
}

/**
 * Dates de génération des comptes rendus d'une réunion.
 *
 * `versions` ABSENT : document d'avant les versions (n8n), qui porte un compte
 * rendu — une génération, à la date de la réunion. `versions: []` : réunion
 * jamais résumée (brouillon, ou arrêtée sans compte rendu) — aucune.
 */
function summaryDates(doc, fallback) {
  if (!Array.isArray(doc.versions)) return fallback ? [fallback] : [];
  return doc.versions.map((version) => dateOf(version?.generatedAt) || fallback).filter(Boolean);
}

/**
 * @param {object} input
 * @param {Array} input.meetings - documents `resume` projetés (cf. routes/admin/stats.js)
 * @param {Date} input.from - début de la période, celui de computeUsageStats
 * @param {Date} input.to
 * @param {Set<string>} [input.detectionOff] - comptes (emailLower) qui ont coupé
 *   la détection d'actions : elle ne leur coûte rien
 * @param {object} [input.assumptions]
 * @returns {{meetings: number, audioSeconds: number, detectionSeconds: number,
 *   inferredDurations: number, unmeasured: number, summaries: number,
 *   summaryTranscriptChars: number, infographics: number,
 *   infographicSourceChars: number, speechCharsPerSecond: number,
 *   measuredSpeechRate: boolean}}
 */
export function measureUsage({
  meetings = [],
  from,
  to,
  detectionOff = new Set(),
  assumptions = ASSUMPTIONS,
}) {
  const measuredRate = speechRateOf(meetings);
  const rate = measuredRate || assumptions.speechCharsPerSecond;
  const inRange = (date) => !!date && date >= from && date <= to;

  const usage = {
    meetings: 0,
    audioSeconds: 0,
    detectionSeconds: 0,
    inferredDurations: 0,
    unmeasured: 0,
    summaries: 0,
    summaryTranscriptChars: 0,
    infographics: 0,
    infographicSourceChars: 0,
  };

  for (const doc of meetings) {
    const date = meetingDate(doc);
    const measured = positive(doc.meetingDuration);
    const chars = positive(doc.transcriptionChars);
    // Chaque mesure manquante se déduit de l'autre, au débit de l'installation.
    const seconds = measured ?? (chars ? chars / rate : null);
    const text = chars ?? (measured ? measured * rate : 0);

    if (inRange(date)) {
      usage.meetings += 1;
      if (seconds) {
        usage.audioSeconds += seconds;
        if (!measured) usage.inferredDurations += 1;
        if (!detectionOff.has(ownerKey(doc))) usage.detectionSeconds += seconds;
      } else {
        usage.unmeasured += 1;
      }
    }

    // La transcription ENTIÈRE est relue à chaque génération (routes/meetings.js).
    for (const generatedAt of summaryDates(doc, date)) {
      if (!inRange(generatedAt)) continue;
      usage.summaries += 1;
      usage.summaryTranscriptChars += text;
    }

    const infographic = doc.infographic;
    if (infographic && BILLED_INFOGRAPHIC.has(infographic.status)) {
      if (inRange(dateOf(infographic.updatedAt) || date)) {
        usage.infographics += 1;
        usage.infographicSourceChars += Math.min(text, assumptions.infographicSourceMaxChars);
      }
    }
  }

  return { ...usage, speechCharsPerSecond: rate, measuredSpeechRate: !!measuredRate };
}
