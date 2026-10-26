/**
 * Nommer les participants de la visio dans la transcription.
 *
 * Les deux flux audio séparent « moi » (micro) de « eux » (audio système de
 * la visio, étiquette « Visio »), pas les participants distants entre eux.
 * Ici, l'utilisateur pose lui-même un nom sur une prise de parole distante,
 * pendant la réunion ou après : la pastille « Visio » devient « Marie », et le
 * compte rendu peut attribuer les propos (cf. utils/transcriptAttribution.js).
 *
 * Deux portées, calquées sur le format stocké (une étiquette vaut jusqu'à la
 * suivante) :
 *  - « à partir d'ici » : la ligne visée et les lignes distantes qui la
 *    suivent tant qu'elles portent la MÊME étiquette effective — jusqu'au
 *    prochain participant déjà nommé. Les tours de parole de l'utilisateur
 *    entre deux ne coupent pas la portée : en tête-à-tête, nommer la première
 *    réplique nomme toute la réunion ; à plusieurs, on nomme chaque changement
 *    de voix.
 *  - « partout » : toutes les lignes distantes de la réunion qui portent
 *    l'étiquette effective de la ligne visée (renommer « Marie » en
 *    « Marie Dupont », ou tout « Visio » d'un coup).
 *
 * Le nom est posé EXPLICITEMENT sur chaque ligne de la portée (pas seulement
 * sur la première) : une réunion rouverte relit chaque ligne avec son
 * étiquette, l'héritage ne joue que pour les lignes qui arrivent en direct.
 */
import { REMOTE_SPEAKER_LABEL, effectiveSpeakerLabels } from './transcriptAttribution.js';

/** Longueur maximale d'un nom : celle d'une étiquette relisible (LABEL_RE). */
const MAX_NAME_LENGTH = 60;

/**
 * Nom saisi → étiquette sûre : trim, crochets retirés (ils délimitent les
 * étiquettes), sauts de ligne aplatis, bornée. '' si rien d'exploitable.
 * @param {string} raw
 */
export function normalizeSpeakerName(raw) {
  return String(raw || '')
    .replace(/[\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

const isRemote = (item) => !!item && !item.offlineGapId && (item.source || 'local') === 'remote';

/**
 * Noms déjà posés sur des voix distantes, dans l'ordre d'apparition, sans
 * « Visio » : ce sont les raccourcis proposés quand on nomme une autre prise
 * de parole.
 * @param {Array} history
 * @param {string|undefined|null} rawSelfName
 * @returns {string[]}
 */
export function knownRemoteSpeakers(history, rawSelfName) {
  const labels = effectiveSpeakerLabels(history, rawSelfName);
  const names = [];
  (history || []).forEach((item, i) => {
    const label = labels[i];
    if (isRemote(item) && label && label !== REMOTE_SPEAKER_LABEL && !names.includes(label)) {
      names.push(label);
    }
  });
  return names;
}

/**
 * Pose `name` sur la ligne `index` (distante) et sur sa portée. Renvoie un
 * NOUVEL historique (immutable, comme editTranscription) ; renvoie l'entrée
 * telle quelle si la ligne n'est pas distante ou si le nom est vide.
 *
 * @param {Array} history
 * @param {number} index - ligne distante visée
 * @param {string} name - nom saisi (ou « Visio » pour retirer un nom)
 * @param {{everywhere?: boolean, selfName?: string}} [opts]
 * @returns {Array}
 */
export function assignSpeaker(history, index, name, { everywhere = false, selfName } = {}) {
  const list = Array.isArray(history) ? history : [];
  const target = list[index];
  const clean = normalizeSpeakerName(name);
  if (!isRemote(target) || !clean) return list;

  const labels = effectiveSpeakerLabels(list, selfName);
  const from = labels[index];
  const picked = new Set();

  if (everywhere) {
    list.forEach((item, i) => {
      if (isRemote(item) && labels[i] === from) picked.add(i);
    });
  } else {
    picked.add(index);
    for (let i = index + 1; i < list.length; i += 1) {
      if (!isRemote(list[i])) continue;
      if (labels[i] !== from) break;
      picked.add(i);
    }
  }

  return list.map((item, i) => (picked.has(i) ? { ...item, speaker: clean } : item));
}
