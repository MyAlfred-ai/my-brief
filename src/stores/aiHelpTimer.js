/**
 * Le minuteur de l'Aide IA — l'horloge, côté écran.
 *
 * On le demande à l'IA (« Alfred, lance un minuteur de cinq minutes ») ; le
 * serveur le garde avec la réunion et dit ce qui lui RESTE (lib/aiHelp/timer.js).
 * Ce module pose l'échéance sur l'horloge de l'appareil, fait vivre le compte
 * à rebours, et prévient quand il tombe à zéro. Il ne sait rien du serveur ni
 * du son : stores/aiHelp.js l'arme, l'arrête, et décide de ce qui s'entend.
 *
 *   aiHelpTimer      ce qui s'affiche : `{ endsAt, seconds, label, done }`, ou
 *                    `null`. `seconds` est la durée totale — de quoi dessiner
 *                    l'avancement ; `done` : arrivé à zéro, encore à l'écran.
 *   aiHelpTimerLeft  les secondes restantes, entières. Un store à part : il
 *                    change chaque seconde, `aiHelpTimer` seulement quand le
 *                    minuteur change.
 *
 * ── Une horloge relue, pas un délai attendu ──────────────────────────────────
 * Le reste est recalculé contre `Date.now()` à chaque battement, jamais
 * décompté : un onglet ralenti ou un battement sauté ne font pas dériver
 * l'affichage. Et la fin n'est pas un `setTimeout` de dix minutes — un poste
 * mis en veille le ferait sonner à son réveil, des minutes après. Au réveil,
 * le battement suivant voit l'heure : en retard de moins d'une minute, le
 * minuteur sonne ; au-delà, il s'efface sans bruit — une mélodie pour une
 * pause finie depuis longtemps ferait sursauter pour rien.
 */
import { writable, get as read } from 'svelte/store';
import { AI_HELP_TIMER_DONE_MS, AI_HELP_TIMER_TICK_MS } from '../config/constants.js';

/**
 * @type {import('svelte/store').Writable<
 *   {endsAt: number, seconds: number, label: string, done: boolean}|null>}
 */
export const aiHelpTimer = writable(null);

/** @type {import('svelte/store').Writable<number>} secondes restantes, arrondies au-dessus */
export const aiHelpTimerLeft = writable(0);

let ticker = null;
let doneTimer = null;
let onEnd = null;

function disarm() {
  clearInterval(ticker);
  clearTimeout(doneTimer);
  ticker = null;
  doneTimer = null;
  onEnd = null;
}

/** Retire le minuteur de l'écran — arrêté, ou sa minute « Temps écoulé » passée. */
export function clearAiHelpTimer() {
  disarm();
  if (read(aiHelpTimer)) aiHelpTimer.set(null);
  aiHelpTimerLeft.set(0);
}

function beat() {
  const timer = read(aiHelpTimer);
  if (!timer || timer.done) return;
  const leftMs = timer.endsAt - Date.now();
  if (leftMs > 0) {
    aiHelpTimerLeft.set(Math.ceil(leftMs / 1000));
    return;
  }
  const late = -leftMs;
  const ring = onEnd;
  clearInterval(ticker);
  ticker = null;
  // Le poste dormait : la fin est passée depuis trop longtemps pour sonner.
  if (late >= AI_HELP_TIMER_DONE_MS) {
    clearAiHelpTimer();
    return;
  }
  aiHelpTimerLeft.set(0);
  aiHelpTimer.set({ ...timer, done: true });
  doneTimer = setTimeout(clearAiHelpTimer, AI_HELP_TIMER_DONE_MS - late);
  ring?.(timer);
}

/**
 * Lance — ou remplace — le minuteur.
 * @param {{remainingMs: number, seconds?: number, label?: string}} timer - tel
 *   que le serveur le rend : ce qui reste, la durée totale, à quoi il sert
 * @param {(timer: object) => void} [whenDone] - appelé une fois, à zéro
 */
export function runAiHelpTimer(timer, whenDone) {
  disarm();
  const leftMs = Number(timer?.remainingMs);
  if (!(leftMs > 0)) {
    clearAiHelpTimer();
    return;
  }
  const left = Math.ceil(leftMs / 1000);
  const total = Math.round(Number(timer.seconds));
  onEnd = whenDone || null;
  aiHelpTimer.set({
    endsAt: Date.now() + leftMs,
    // Jamais sous le reste : l'avancement ne se dessine pas au-delà du plein.
    seconds: Number.isFinite(total) && total >= left ? total : left,
    label: String(timer.label || '').trim(),
    done: false,
  });
  aiHelpTimerLeft.set(left);
  ticker = setInterval(beat, AI_HELP_TIMER_TICK_MS);
}

/** Les millisecondes qui restent au minuteur en cours ; 0 : aucun, ou terminé. */
export function aiHelpTimerLeftMs() {
  const timer = read(aiHelpTimer);
  return timer && !timer.done ? Math.max(0, timer.endsAt - Date.now()) : 0;
}
