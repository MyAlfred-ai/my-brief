/**
 * Le minuteur d'une réunion — un compte à rebours VISIBLE à l'écran, que l'on
 * demande à l'Aide IA : « Alfred, lance un minuteur de cinq minutes »,
 * « ajoute-lui deux minutes », « arrête le minuteur ». À zéro, l'écran joue une
 * courte mélodie.
 *
 * ── Pourquoi il est gardé ici, et pas seulement à l'écran ────────────────────
 * Une page rechargée en pleine réunion doit le retrouver, à la seconde près —
 * comme un rappel. Il vit donc sur la réunion (`aiHelp.timer`), et l'écran ne
 * fait que l'afficher et sonner.
 *
 * ── Un seul, et trois gestes ─────────────────────────────────────────────────
 *   start  le lancer — il REMPLACE celui qui tourne : « mets le minuteur à dix
 *          minutes » n'en ouvre pas un second. Deux comptes à rebours à l'écran,
 *          c'est un de trop à lire, et « arrête le minuteur » deviendrait
 *          ambigu ;
 *   add    le rallonger, ou le raccourcir (`seconds` négatif) ;
 *   stop   l'arrêter, et le retirer de l'écran.
 * Le modèle ne fait que NOMMER le geste (prompts.js) ; c'est ici qu'il est
 * vérifié — une durée hors bornes est jetée à la lecture, « ajoute deux
 * minutes » sans minuteur est DIT sur la réponse (`ok` faux) et ne crée rien.
 *
 * ── L'échéance est une heure, le reste se calcule ────────────────────────────
 * `endsAt` est une heure du serveur. L'écran ne la reçoit jamais : il reçoit
 * le temps RESTANT (`remainingMs`), et pose l'échéance sur sa propre horloge.
 * Un poste dont l'heure est décalée de trente secondes afficherait sinon un
 * compte à rebours faux d'autant, et sonnerait trop tôt ou trop tard.
 *
 * Un minuteur arrivé à zéro n'existe plus : `readTimer` le rend `null` sans
 * qu'il faille l'effacer — rien à nettoyer quand personne n'est là pour le voir
 * finir (page fermée, réunion terminée).
 */

/** Cinq secondes : en dessous, la demande est une erreur de transcription. */
export const TIMER_SECONDS_MIN = 5;
/** Quatre heures, comme un rappel : au-delà, ce n'est plus un minuteur de réunion. */
export const TIMER_SECONDS_MAX = 4 * 60 * 60;
export const TIMER_LABEL_MAX = 140;
export const TIMER_MOVES = ['start', 'add', 'stop'];

const labelOf = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TIMER_LABEL_MAX);

/**
 * Le minuteur d'une réunion, tel qu'il vaut à cet instant.
 * @param {unknown} raw - `aiHelp.timer` du document
 * @param {number} [now]
 * @returns {{endsAt: string, seconds: number, label: string}|null} `null` :
 *   aucun, ou arrivé à zéro
 */
export function readTimer(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || typeof raw.endsAt !== 'string') return null;
  const end = Date.parse(raw.endsAt);
  if (!Number.isFinite(end) || end <= now) return null;
  const left = Math.ceil((end - now) / 1000);
  // Une échéance plus lointaine que la borne n'a pas été écrite par ce module.
  if (left > TIMER_SECONDS_MAX) return null;
  const seconds = Math.round(Number(raw.seconds));
  return {
    endsAt: new Date(end).toISOString(),
    // La durée totale ne sert qu'à dessiner l'avancement : jamais sous le reste.
    seconds: Number.isFinite(seconds) && seconds >= left ? seconds : left,
    label: labelOf(raw.label),
  };
}

/** Les secondes qui restent à un minuteur lu (`readTimer`), arrondies au-dessus. */
export const timerLeft = (timer, now = Date.now()) =>
  timer ? Math.max(0, Math.ceil((Date.parse(timer.endsAt) - now) / 1000)) : 0;

/**
 * Le minuteur tel que l'écran le reçoit : ce qui RESTE, pas une heure.
 * @returns {{seconds: number, label: string, remainingMs: number}|null}
 */
export function publicTimer(timer, now = Date.now()) {
  if (!timer) return null;
  const remainingMs = Date.parse(timer.endsAt) - now;
  if (!(remainingMs > 0)) return null;
  return { seconds: timer.seconds, label: timer.label, remainingMs };
}

/**
 * Un geste sur le minuteur, vérifié.
 *
 * @param {ReturnType<typeof readTimer>} current - celui qui tourne, ou `null`
 * @param {{do: 'start'|'add'|'stop', seconds?: number, label?: string}} action -
 *   relu par `actionsOf` (prompts.js) : durée entière, dans les bornes
 * @param {number} [now]
 * @returns {{timer: ReturnType<typeof readTimer>, act: object, touched: boolean}}
 *   `timer` : ce qu'il vaut après le geste ; `act` : ce qui est dit sur la
 *   réponse ; `touched` : l'écran doit s'y conformer. Un « arrête » sans
 *   minuteur touche quand même : l'écran y range celui qui vient de sonner.
 */
export function moveTimer(current, action, now = Date.now()) {
  if (action.do === 'start') {
    const seconds = Math.min(TIMER_SECONDS_MAX, Math.max(TIMER_SECONDS_MIN, action.seconds));
    const label = labelOf(action.label);
    return {
      timer: { endsAt: new Date(now + seconds * 1000).toISOString(), seconds, label },
      act: { type: 'timer', do: 'start', seconds, label, ok: true },
      touched: true,
    };
  }
  if (action.do === 'add') {
    if (!current) {
      return {
        timer: null,
        act: { type: 'timer', do: 'add', seconds: action.seconds, ok: false },
        touched: false,
      };
    }
    // Raccourci de plus qu'il ne reste : il sonne tout de suite, il ne recule pas.
    const leftMs = Math.min(
      TIMER_SECONDS_MAX * 1000,
      Math.max(1000, Date.parse(current.endsAt) - now + action.seconds * 1000),
    );
    const left = Math.ceil(leftMs / 1000);
    return {
      timer: {
        endsAt: new Date(now + leftMs).toISOString(),
        seconds: Math.min(TIMER_SECONDS_MAX, Math.max(left, current.seconds + action.seconds)),
        label: current.label,
      },
      act: {
        type: 'timer',
        do: 'add',
        seconds: action.seconds,
        left,
        label: current.label,
        ok: true,
      },
      touched: true,
    };
  }
  return { timer: null, act: { type: 'timer', do: 'stop', ok: current !== null }, touched: true };
}
