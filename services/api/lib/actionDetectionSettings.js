/**
 * Réglages de la détection d'actions : bornes, valeurs par défaut, et la
 * normalisation qui les fait respecter.
 *
 * Ils vivaient dans lib/repositories/settings.js, du temps où ils étaient un
 * réglage d'INSTALLATION. Ils appartiennent désormais à chaque utilisateur
 * (collection `userActionSettings`), et ce module est ce que les deux bouts
 * partagent : le dépôt qui écrit, les schémas de route qui valident, et le banc
 * d'essai qui exerce des valeurs jamais enregistrées.
 *
 * Les valeurs par défaut sont celles qui étaient codées en dur avant tout
 * écran de réglage : un compte qui ne touche à rien vit exactement ce qu'il
 * vivait avant.
 *
 * Le VOCABULAIRE de l'organisation n'est pas ici : il a sa propre vie
 * (`appSettings/orgContext`, onglet Configuration de l'administration) parce qu'il
 * sert AUSSI à chaque compte rendu. La détection le reçoit au moment de
 * composer sa consigne, pas au moment de lire les réglages.
 */

export const DETECTION_SENSITIVITIES = ['explicit', 'balanced', 'wide'];
export const DETECTION_WINDOW_MIN = 3;
export const DETECTION_WINDOW_MAX = 30;
export const DETECTION_INTERVAL_MIN = 1;
export const DETECTION_INTERVAL_MAX = 10;
export const DETECTION_TRIGGER_WORDS_MAX = 20;
export const DETECTION_TRIGGER_WORD_MAX = 40;

/** Comportement d'avant tout écran de réglage — le déploiement est inerte. */
export const DEFAULT_ACTION_DETECTION = {
  enabled: true,
  sensitivity: 'balanced',
  triggerWords: ['action'],
  allowUpdates: true,
  windowSize: 8,
  minSentences: 1,
};

/**
 * Borne un entier À LA LECTURE aussi : le schéma de route protège la saisie,
 * ceci protège contre un document écrit autrement (import, script, version
 * antérieure). Une fenêtre de 5 000 phrases ne doit jamais atteindre le
 * navigateur.
 */
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Mots déclencheurs : liste dédoublonnée, bornée en nombre et en longueur.
 * `undefined` rend le repli — c'est ce qui distingue « je n'ai rien dit » de
 * « je veux une liste vide ».
 */
export function normalizeTriggerWords(words, fallback) {
  if (words === undefined) return fallback;
  const list = Array.isArray(words) ? words : String(words ?? '').split(',');
  const seen = new Set();
  for (const raw of list) {
    const word = String(raw ?? '')
      .trim()
      .slice(0, DETECTION_TRIGGER_WORD_MAX);
    if (word) seen.add(word);
    if (seen.size >= DETECTION_TRIGGER_WORDS_MAX) break;
  }
  return [...seen];
}

/**
 * Réglages complets et bornés, à partir d'un document partiel (ou absent).
 *
 * @param {object|null} doc - sous-document `detection` d'un compte
 * @returns {{enabled: boolean, sensitivity: string, triggerWords: string[],
 *            allowUpdates: boolean, windowSize: number, minSentences: number}}
 */
export function normalizeActionDetection(doc) {
  return {
    enabled: doc?.enabled !== false,
    sensitivity: DETECTION_SENSITIVITIES.includes(doc?.sensitivity)
      ? doc.sensitivity
      : DEFAULT_ACTION_DETECTION.sensitivity,
    triggerWords: normalizeTriggerWords(doc?.triggerWords, DEFAULT_ACTION_DETECTION.triggerWords),
    allowUpdates: doc?.allowUpdates !== false,
    windowSize: clampInt(
      doc?.windowSize,
      DEFAULT_ACTION_DETECTION.windowSize,
      DETECTION_WINDOW_MIN,
      DETECTION_WINDOW_MAX,
    ),
    minSentences: clampInt(
      doc?.minSentences,
      DEFAULT_ACTION_DETECTION.minSentences,
      DETECTION_INTERVAL_MIN,
      DETECTION_INTERVAL_MAX,
    ),
  };
}

/**
 * Applique un patch sur des réglages existants.
 *
 * Contrat, identique à celui des autres écrans : champ ABSENT = inchangé,
 * champ présent mais VIDE = retour au défaut (`triggerWords: []` remet le seul
 * mot « action »). Chaque champ est relayé EXPLICITEMENT — un champ accepté par
 * le schéma de route mais oublié ici serait ignoré en silence, et l'écran
 * annoncerait « Enregistré » sans que rien ne change.
 *
 * @param {object} current - réglages normalisés
 * @param {object} patch
 */
export function mergeActionDetectionPatch(current, patch = {}) {
  const next = { ...current };

  if (patch.enabled !== undefined) next.enabled = !!patch.enabled;
  if (patch.allowUpdates !== undefined) next.allowUpdates = !!patch.allowUpdates;

  if (patch.sensitivity !== undefined) {
    const value = String(patch.sensitivity).trim();
    // Refusé ici AUSSI : ce module est appelé par les tests et par le banc
    // d'essai, il ne peut pas dépendre d'une validation qui vit dans un schéma.
    if (value && !DETECTION_SENSITIVITIES.includes(value)) {
      throw new Error(`sensibilité de détection inconnue: ${value}`);
    }
    next.sensitivity = value || DEFAULT_ACTION_DETECTION.sensitivity;
  }

  if (patch.triggerWords !== undefined) {
    const words = normalizeTriggerWords(patch.triggerWords, []);
    next.triggerWords = words.length ? words : DEFAULT_ACTION_DETECTION.triggerWords;
  }

  if (patch.windowSize !== undefined) {
    next.windowSize = clampInt(
      patch.windowSize,
      DEFAULT_ACTION_DETECTION.windowSize,
      DETECTION_WINDOW_MIN,
      DETECTION_WINDOW_MAX,
    );
  }

  if (patch.minSentences !== undefined) {
    next.minSentences = clampInt(
      patch.minSentences,
      DEFAULT_ACTION_DETECTION.minSentences,
      DETECTION_INTERVAL_MIN,
      DETECTION_INTERVAL_MAX,
    );
  }

  return next;
}
