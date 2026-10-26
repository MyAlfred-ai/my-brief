/**
 * Deltas et transcriptions finales : qui écrit la ligne ?
 *
 * Les modèles de transcription Realtime n'ont pas tous le même flux
 * d'événements — vérifié modèle par modèle sur l'API (cf.
 * services/api/lib/transcriptionModels.js) :
 *
 *   - `gpt-realtime-whisper`, `gpt-live-transcribe` : deltas incrémentaux, et
 *     JAMAIS de `conversation.item.input_audio_transcription.completed`. La
 *     ligne est bouclée par l'application à la ponctuation de fin de phrase.
 *   - `gpt-transcribe` : les mêmes deltas, PUIS un `completed` par segment —
 *     comme `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` et `whisper-1`,
 *     qu'il remplace depuis leur retrait par OpenAI (26/02/2027).
 *
 * L'application a été écrite pour le premier groupe. Sous le second, un
 * « Bonjour. » terminé par sa ponctuation était affiché par les deltas, puis
 * RÉAFFICHÉ par le `completed` qui suivait : chaque phrase en double dans la
 * transcription, donc dans le résumé et dans le compte-rendu envoyé.
 *
 * Ce suiveur retient ce que les deltas ont déjà écrit depuis le dernier
 * `completed`, par flux (micro / audio système, qui s'entrelacent). Quand le
 * `completed` dit la même chose, il n'y a rien à ajouter.
 */
import { normalizeForCompare } from './transcriptEcho.js';

/**
 * Index de la ligne EN COURS d'un flux (delta non encore bouclé), ou -1.
 *
 * Cherchée en REMONTANT, et filtrée par flux : le micro et l'audio système
 * s'entrelacent, la ligne en cours d'un flux n'est donc pas forcément la
 * dernière de l'historique. Ne regarder que la fin produisait une ligne par mot
 * côté Teams (aucune fusion) et laissait des doublons à la finalisation.
 *
 * @param {Array<{isDelta?: boolean, source?: string}>} history
 * @param {string} source
 * @returns {number}
 */
export function findPendingDeltaIndex(history, source) {
  if (!Array.isArray(history)) return -1;
  const key = source || 'local';
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (item?.isDelta && (item.source || 'local') === key) return i;
  }
  return -1;
}

/**
 * Un `completed` peut arriver APRÈS que le flux a basculé sur le segment
 * suivant (whisper-1 livrait parfois dans le désordre, et rien ne garantit
 * l'ordre sous ses successeurs) : le suivi est donc tenu
 * PAR SEGMENT (item_id), pas par flux. Borné — au-delà, le `completed` d'un
 * segment aussi ancien ne viendra plus.
 */
const MAX_TRACKED_ITEMS_PER_SOURCE = 4;

/**
 * @returns {{onDelta: (source: string, itemId: string, text: string) => void,
 *            takeCompleted: (source: string, itemId: string, transcript: string) => boolean,
 *            reset: () => void}}
 */
export function createTranscriptDeltaTracker() {
  /** flux → Map(item_id → texte accumulé par les deltas de ce segment). */
  const pending = new Map();

  return {
    /** Un delta vient d'être affiché pour ce flux. */
    onDelta(source, itemId, text) {
      const key = source || 'local';
      let items = pending.get(key);
      if (!items) {
        items = new Map();
        pending.set(key, items);
      }
      const id = itemId || '';
      items.set(id, (items.get(id) || '') + (text || ''));
      while (items.size > MAX_TRACKED_ITEMS_PER_SOURCE) {
        items.delete(items.keys().next().value);
      }
    },

    /**
     * Consomme le suivi du segment et dit si la transcription finale a DÉJÀ
     * été écrite par ses deltas. Toujours appeler à la réception d'un
     * `completed`, même si l'appelant compte l'ajouter : le suivi du segment
     * ne doit pas survivre à son final.
     *
     * @returns {boolean} vrai = ne rien ajouter, la ligne est déjà à l'écran
     */
    takeCompleted(source, itemId, transcript) {
      const key = source || 'local';
      const items = pending.get(key);
      if (!items) return false;
      // Repli sans item_id (événements legacy) : le tampon anonyme du flux.
      const bucket = items.has(itemId || '') ? itemId || '' : '';
      const buffered = normalizeForCompare(items.get(bucket) || '');
      items.delete(bucket);
      const final = normalizeForCompare(transcript);
      return !!final && buffered === final;
    },

    /** Nouvel enregistrement : aucun delta en attente ne doit survivre. */
    reset() {
      pending.clear();
    },
  };
}
