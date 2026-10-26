/**
 * Cadencement de la détection d'actions pendant l'enregistrement.
 *
 * Avant : `finalTranscriptions.length % 5 === 0` déclenchait un appel sur les 5
 * dernières lignes. Trois défauts, tous corrigés ici :
 *
 *  1. L'action n'apparaissait qu'au bout de 5 segments finalisés — plusieurs
 *     dizaines de secondes après la phrase qui la portait.
 *  2. Les fenêtres étaient DISJOINTES (segments 1-5, puis 6-10…) : une action
 *     énoncée à cheval sur deux fenêtres n'était jamais vue en entier. D'où la
 *     fenêtre GLISSANTE d'ACTION_WINDOW_SIZE, recalculée à chaque appel.
 *  3. Rien n'empêchait deux appels de se chevaucher — gpt-5-mini met plusieurs
 *     secondes, et deux réponses concurrentes créaient des doublons.
 *
 * Le raisonnement ne porte JAMAIS sur la longueur de l'historique : la
 * déduplication d'écho (transcriptEcho.js) RETIRE des éléments, donc la
 * longueur peut décroître et repasser sur un seuil déjà franchi. On travaille
 * sur un simple drapeau « du texte est arrivé depuis le dernier appel ».
 */
import { buildAttributedTranscript } from './transcriptAttribution.js';

/**
 * Nombre de segments finalisés envoyés au modèle. Recouvrement de 7 entre deux
 * appels consécutifs : une action à cheval reste entière dans la fenêtre
 * suivante. Le prompt reçoit par ailleurs les actions déjà détectées, ce qui
 * évite que ce recouvrement ne produise des doublons.
 */
export const ACTION_WINDOW_SIZE = 8;

/**
 * Coalesce la rafale : un segment finalisé par OpenAI et la fin de phrase
 * reconstituée depuis les deltas tombent à quelques millisecondes d'écart et
 * notifieraient deux fois pour le même texte.
 */
export const ACTION_DEBOUNCE_MS = 400;

/**
 * Fenêtre glissante de transcription à analyser.
 *
 * Filtre `isDelta` : une ligne en cours de dictée est incomplète et ferait
 * détecter une action sur une phrase tronquée. Le site `stopRecording` ne le
 * faisait pas — il envoyait les deltas au modèle.
 *
 * Étiquetée par locuteur quand la fenêtre elle-même porte les deux canaux
 * audio : « qui s'engage » est justement ce que la détection cherche, et un
 * « je m'en occupe » n'a pas le même propriétaire selon qu'il vient du micro
 * ou de la visio. La fenêtre étant une TRANCHE, la première ligne reçoit son
 * étiquette même si le locuteur parlait déjà avant.
 *
 * @param {Array<{text: string, isDelta?: boolean, source?: string}>} history
 * @param {number} [size]
 * @param {string} [selfName] - userInfo.name, étiquette du canal micro
 * @returns {string} lignes jointes par des sauts de ligne, ou chaîne vide
 */
export function buildActionWindow(history, size = ACTION_WINDOW_SIZE, selfName) {
  if (!Array.isArray(history)) return '';
  const window = history.filter((item) => item && !item.isDelta).slice(-size);
  return buildAttributedTranscript(window, selfName).text;
}

/**
 * Ordonnanceur à un seul appel en vol, avec relance de fin (« trailing ») :
 * pendant qu'une détection tourne, les nouvelles notifications ne s'empilent
 * pas — elles marquent l'état « sale », et UNE seule relance part quand l'appel
 * en cours retombe.
 *
 * @param {object} opts
 * @param {() => string} opts.getContent Évalué AU MOMENT du départ, jamais à la
 *   notification : la relance de fin doit partir avec le texte le plus frais,
 *   pas avec celui qui était disponible quand elle a été demandée.
 * @param {(content: string) => Promise<void>} opts.run
 * @param {(inFlight: boolean) => void} [opts.onStateChange] Pilote l'indicateur
 *   « analyse en cours » de l'interface.
 * @param {() => number} [opts.getMinSentences] Phrases à accumuler avant une
 *   analyse (administration → Détection d'actions). Lu à chaque notification,
 *   et non capturé : un réglage changé pendant la réunion s'applique tout de
 *   suite, sans redémarrer l'enregistrement.
 * @param {() => boolean} [opts.isEnabled] Détection active pour l'installation.
 * @param {number} [opts.debounceMs]
 * @returns {{notify: () => void, flush: () => void, reset: () => void, isInFlight: () => boolean}}
 */
export function createActionScheduler({
  getContent,
  run,
  onStateChange = () => {},
  getMinSentences = () => 1,
  isEnabled = () => true,
  debounceMs = ACTION_DEBOUNCE_MS,
}) {
  let dirty = false;
  let inFlight = false;
  let timer = null;
  // Phrases finalisées depuis la dernière analyse — comparées au réglage
  // d'espacement. Remis à zéro au départ d'une analyse, pas à son retour :
  // ce qui se dit PENDANT l'appel compte pour la relance.
  let sinceLastRun = 0;
  // Analyse réclamée explicitement (fin d'enregistrement) : elle ignore
  // l'espacement, et survit à la retombée de l'appel en cours — sinon un
  // `flush()` tombé pendant une analyse serait purement perdu.
  let forced = false;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function arm() {
    if (timer !== null || inFlight) return;
    timer = setTimeout(() => {
      timer = null;
      fire();
    }, debounceMs);
  }

  async function fire() {
    if (inFlight || !dirty) return;

    dirty = false;
    forced = false;
    sinceLastRun = 0;
    const content = getContent();
    // Rien à analyser (historique vidé, deltas seuls) : ne pas dépenser un
    // appel, mais ne pas rester bloqué non plus.
    if (!content) return;

    inFlight = true;
    onStateChange(true);
    try {
      await run(content);
    } catch {
      // L'appelant journalise et affiche déjà l'erreur (toast). Ici on veut
      // seulement garantir que le verrou est rendu.
    } finally {
      inFlight = false;
      onStateChange(false);
      // Du texte est arrivé pendant l'appel : une seule relance, pas une par
      // notification reçue entre-temps. L'espacement demandé s'applique ici
      // aussi — sans ce test, la retombée d'un appel le contournerait à chaque
      // fois et la détection repartirait sur une seule phrase.
      if (dirty && (forced || sinceLastRun >= Math.max(1, getMinSentences()))) arm();
    }
  }

  return {
    /** Un segment vient d'être finalisé. */
    notify() {
      if (!isEnabled()) return;
      dirty = true;
      sinceLastRun += 1;
      // Espacement demandé par l'administration : on attend d'avoir assez de
      // matière. `dirty` reste vrai, donc rien n'est perdu — la fin
      // d'enregistrement analysera le reliquat.
      if (sinceLastRun < Math.max(1, getMinSentences())) return;
      arm();
    },
    /**
     * Analyse tout de suite (fin d'enregistrement) : on ne peut pas attendre le
     * débounce, l'utilisateur voit l'écran basculer. Si un appel est déjà en
     * vol, la relance de fin s'en charge.
     *
     * Le reliquat est analysé même s'il n'atteint pas l'espacement demandé :
     * une action dite dans la dernière phrase ne doit pas être perdue.
     */
    flush() {
      if (!isEnabled()) return;
      dirty = true;
      forced = true;
      clearTimer();
      fire();
    },
    /** Nouvelle réunion ou consultation d'un historique. */
    reset() {
      clearTimer();
      dirty = false;
      forced = false;
      sinceLastRun = 0;
    },
    isInFlight() {
      return inFlight;
    },
  };
}
