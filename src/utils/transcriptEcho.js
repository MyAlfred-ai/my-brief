/**
 * Déduplication croisée micro ↔ audio système (écho de visio).
 *
 * Pourquoi : la transcription tourne sur DEUX flux séparés — le micro (tag
 * 'local', texte noir) et le partage d'audio système (tag 'remote', texte
 * orange). Quand la visio sort par les haut-parleurs, sa voix revient dans le
 * micro : la même phrase part dans les deux flux et s'affiche deux fois.
 *
 * `echoCancellation: true` est bien demandé sur le micro (audioConstraints.js),
 * mais l'AEC de Chrome n'est pas fiable dans tous les montages : selon la sortie
 * choisie (setSinkId, périphérique non par défaut), le volume, et le fait que
 * l'onglet visio ait déjà ouvert le même micro avec ses propres contraintes, il
 * reste de l'écho parfaitement intelligible. Constaté sur Microsoft Teams (web)
 * et pas sur Google Meet ni YouTube : le chemin exact dépend du poste, pas de
 * notre code — les deux flux sont bien distincts côté application.
 *
 * Cette déduplication traite donc le SYMPTÔME (la même phrase sur les deux
 * flux), indépendamment du chemin acoustique. Le casque reste la correction à
 * la source.
 *
 * Règle retenue : une seule ligne survit, taguée 'remote' — c'est bien la
 * personne distante qui parle, l'entrée micro n'est que son écho.
 */

/** Fenêtre de rapprochement, en secondes d'enregistrement écoulées. */
const WINDOW_S = 12;

/** En dessous : trop générique ("oui", "ok", "hmm") — jamais dédupliqué. */
const MIN_LEN = 6;

/** À partir de cette longueur, un rapprochement flou est autorisé. */
const FUZZY_LEN = 16;

/** Similarité minimale (Levenshtein normalisé) pour le rapprochement flou. */
const FUZZY_THRESHOLD = 0.82;

/** Borne le coût du Levenshtein sur les très longues phrases. */
const MAX_COMPARE_LEN = 400;

/**
 * Forme canonique pour comparaison : minuscules, sans accents ni ponctuation,
 * espaces normalisés. Les deux flux passent par le même modèle, mais la
 * ponctuation et la casse varient d'un passage à l'autre.
 * @param {string} text
 * @returns {string}
 */
export function normalizeForCompare(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[b.length];
}

/**
 * Similarité 0..1 entre deux textes déjà normalisés.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  // Pré-filtre : deux phrases de longueurs très différentes ne peuvent pas
  // passer le seuil — évite le Levenshtein dans la majorité des cas.
  if (Math.min(a.length, b.length) / Math.max(a.length, b.length) < FUZZY_THRESHOLD) return 0;

  const sa = a.slice(0, MAX_COMPARE_LEN);
  const sb = b.slice(0, MAX_COMPARE_LEN);
  return 1 - levenshtein(sa, sb) / Math.max(sa.length, sb.length);
}

/**
 * Convertit un `time` d'item ("HH:MM:SS" écoulé) en secondes.
 * @param {string} time
 * @returns {number} secondes, ou NaN si non parsable
 */
export function parseElapsedSeconds(time) {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(String(time ?? '').trim());
  if (!m) return NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function sourceOf(item) {
  return item?.source || 'local';
}

/**
 * Cherche, dans l'historique, une ligne FINALE de l'AUTRE source qui dit la
 * même chose que le candidat dans la même fenêtre temporelle.
 *
 * @param {Array<Object>} history - transcriptionHistory
 * @param {Object} candidate
 * @param {string} candidate.text
 * @param {string} candidate.source - 'local' | 'remote'
 * @param {number} candidate.elapsedS - secondes écoulées du candidat
 * @param {number} [candidate.selfIndex] - index du candidat s'il est déjà dans
 *   l'historique (finalisation d'un delta en place), sinon -1
 * @returns {number} index du doublon, ou -1
 */
export function findEchoDuplicate(history, candidate) {
  const { text, source = 'local', elapsedS, selfIndex = -1 } = candidate || {};
  const norm = normalizeForCompare(text);
  if (norm.length < MIN_LEN) return -1;
  if (!Array.isArray(history) || history.length === 0) return -1;

  const hasWindow = Number.isFinite(elapsedS);

  // Remontée depuis la fin : le doublon d'écho est forcément récent.
  for (let i = history.length - 1; i >= 0; i--) {
    if (i === selfIndex) continue;
    const item = history[i];
    if (!item || item.isDelta) continue;
    if (sourceOf(item) === source) continue;

    const itemElapsed = parseElapsedSeconds(item.time);
    if (hasWindow && Number.isFinite(itemElapsed)) {
      if (elapsedS - itemElapsed > WINDOW_S) break; // trop ancien → et tout ce qui précède aussi
      if (Math.abs(elapsedS - itemElapsed) > WINDOW_S) continue;
    }

    const other = normalizeForCompare(item.text);
    if (other.length < MIN_LEN) continue;
    if (other === norm) return i;
    if (
      norm.length >= FUZZY_LEN &&
      other.length >= FUZZY_LEN &&
      similarity(norm, other) >= FUZZY_THRESHOLD
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Applique la déduplication d'écho à un historique.
 *
 * Si le candidat est un doublon d'une ligne de l'autre source :
 *  - la ligne conservée est promue en 'remote' si le candidat vient du système
 *    (l'écho micro était mal attribué) ;
 *  - le candidat est retiré de l'historique quand il y était déjà (`selfIndex`).
 *
 * @param {Array<Object>} history
 * @param {Object} candidate - voir findEchoDuplicate
 * @returns {{history: Array<Object>, dropped: boolean}} `dropped` = le candidat
 *   ne doit PAS être ajouté / compté dans le texte complet.
 */
export function applyEchoDedup(history, candidate) {
  const dupIdx = findEchoDuplicate(history, candidate);
  if (dupIdx === -1) return { history, dropped: false };

  let next = history;
  const kept = next[dupIdx];
  if ((candidate.source || 'local') === 'remote' && sourceOf(kept) === 'local') {
    next = [...next.slice(0, dupIdx), { ...kept, source: 'remote' }, ...next.slice(dupIdx + 1)];
  }

  const selfIndex = candidate.selfIndex ?? -1;
  if (selfIndex >= 0 && selfIndex < next.length) {
    next = [...next.slice(0, selfIndex), ...next.slice(selfIndex + 1)];
  }

  return { history: next, dropped: true };
}
