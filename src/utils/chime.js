/**
 * Les sons de l'Aide IA — quatre, un par sens, pour qu'on sache sans regarder
 * ce qui arrive :
 *   playChime  trois notes montantes, douces : une ALERTE (contradiction,
 *              rappel, points oubliés en fin de réunion) ;
 *   playBell   un coup de sonnette de comptoir, bref : une IDÉE. C'est le
 *              visage de l'IA (une sonnette d'hôtel dans l'orbe) : elle
 *              « sonne à l'accueil », on l'écoute si on veut ;
 *   playAck    deux touches feutrées, la seconde plus haute : « compris,
 *              c'est fait » — un GESTE demandé qu'elle exécute ;
 *   playTimerMelody  une phrase de boîte à musique, trois secondes et
 *              demie : le MINUTEUR est arrivé à zéro.
 *
 * Synthétisés (Web Audio) plutôt que joués depuis un fichier : rien à charger,
 * rien à mettre en cache, et des sons qui restent les mêmes hors ligne.
 *
 * Volontairement faibles : la réunion continue, et le micro de l'ordinateur
 * les entend — un signal fort repasserait dans la transcription des
 * participants à distance. La sonnette l'est un peu moins que les autres
 * (demande du 2026-11-13 : « courte mais audible ») ; le geste, le moins de
 * tous — il répond à quelqu'un qui vient de parler et regarde l'écran. La
 * mélodie du minuteur est la plus présente : on l'a demandée, souvent pour une
 * pause, et ceux qu'elle rappelle ne sont pas devant l'écran.
 *
 * Ne lève jamais : un navigateur sans Web Audio reste simplement silencieux.
 *
 * ── Le son VERROUILLÉ par le navigateur ──────────────────────────────────────
 * Constaté le 2026-11-13 (« aucun son depuis l'application web ») : Chrome ne
 * laisse jouer une page qu'après un premier geste DANS cette page — un clic,
 * une touche. Avant, le contexte audio naît « suspendu » et `resume()` ne rend
 * jamais la main (mesuré dans Chrome : rien après 1,5 s ; joue, une fois la
 * page cliquée, même sept secondes plus tard). Or une réunion peut démarrer
 * sans aucun clic dans l'onglet — l'extension et son raccourci ouvrent
 * `#record` — puis se mener toute à la voix : la page de test, où chaque son
 * partait d'un clic, sonnait ; l'application, jamais.
 *   - `armAiHelpAudio` écoute le PREMIER geste de la page (clic, touche,
 *     toucher) et y crée le contexte : c'est le seul moment où Safari l'accepte
 *     aussi ;
 *   - un son dû pendant que le contexte est verrouillé n'est PAS mis en
 *     attente — il éclaterait d'un coup au premier clic, en retard sur ce
 *     qu'il annonçait : il est tu, et `aiHelpAudioLocked` le dit. Le bouton du
 *     son de l'Aide IA s'en sert pour proposer « cliquer pour activer le son ».
 */
import { writable } from 'svelte/store';

/** Le contexte attend un geste de la page : le dernier son dû a été tu. */
export const aiHelpAudioLocked = writable(false);

/** Le temps de voir un contexte suspendu repartir — au-delà, il est verrouillé. */
const RESUME_GRACE_MS = 250;
const GESTURES = ['pointerdown', 'keydown', 'touchend'];

let context = null;
let armed = false;

/** Le contexte audio, créé au premier besoin ; null si le navigateur n'en a pas. */
function audio() {
  if (context) return context;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  context = new AudioContextClass();
  return context;
}

/**
 * Le contexte, prêt à jouer : `null` s'il reste verrouillé (pas de geste dans
 * la page) ou si le navigateur n'a pas de Web Audio. Partagé avec la voix de
 * l'Aide IA (lib/aiHelp/voice.js), qui joue l'audio d'OpenAI et de Mistral.
 * @returns {Promise<AudioContext|null>}
 */
export async function readyAudioContext() {
  try {
    const ctx = audio();
    if (!ctx) return null;
    if (ctx.state !== 'running') {
      await Promise.race([
        ctx.resume().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, RESUME_GRACE_MS)),
      ]);
    }
    const running = ctx.state === 'running';
    aiHelpAudioLocked.set(!running);
    return running ? ctx : null;
  } catch {
    return null;
  }
}

/**
 * Déverrouille le son — à appeler PENDANT un geste de l'utilisateur. Rend
 * vrai si le contexte joue.
 */
export async function unlockAiHelpAudio() {
  try {
    const ctx = audio();
    if (!ctx) return false;
    if (ctx.state !== 'running') await ctx.resume();
    const running = ctx.state === 'running';
    if (running) aiHelpAudioLocked.set(false);
    return running;
  } catch {
    return false;
  }
}

/**
 * Écoute le premier geste de la page pour déverrouiller le son, une fois pour
 * toutes ; les écouteurs partent dès que le contexte joue. Sans effet hors
 * navigateur.
 */
export function armAiHelpAudio(target = typeof window === 'undefined' ? null : window) {
  if (armed || !target) return;
  armed = true;
  const onGesture = async () => {
    if (!(await unlockAiHelpAudio())) return;
    GESTURES.forEach((type) => target.removeEventListener(type, onGesture, true));
  };
  GESTURES.forEach((type) => target.addEventListener(type, onGesture, true));
}

/** Joue un son, ou rien : le signal est un confort, jamais une condition. */
async function play(sound) {
  const ctx = await readyAudioContext();
  if (!ctx) return;
  try {
    sound(ctx, ctx.currentTime);
  } catch {
    // Silence.
  }
}

/**
 * Une note frappée : montée en `attack`, puis extinction exponentielle jusqu'à
 * `at + length`.
 */
function tone(ctx, { at, frequency, peak, length, attack, type = 'sine' }) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
}

// ── Alerte ──────────────────────────────────────────────────────────────────

const CHIME_HZ = [587, 784, 988];
const CHIME_GAP_S = 0.11;
const CHIME_LENGTH_S = 0.36;
const CHIME_PEAK = 0.09;

export function playChime() {
  return play((ctx, start) =>
    CHIME_HZ.forEach((frequency, index) =>
      tone(ctx, {
        at: start + index * CHIME_GAP_S,
        frequency,
        peak: CHIME_PEAK,
        length: CHIME_LENGTH_S,
        attack: 0.02,
      }),
    ),
  );
}

// ── Idée : la sonnette de comptoir ──────────────────────────────────────────

/**
 * Un timbre de cloche : des partiels INHARMONIQUES (ni octave ni quinte : c'est
 * ce qui distingue un métal frappé d'une note de piano), les aigus s'éteignant
 * les premiers. Le jumeau du fondamental, désaccordé de quelques hertz, fait
 * battre le son comme une vraie sonnette. Un peu plus d'une seconde en tout.
 */
const BELL_HZ = 1976; // si 6 : de la famille de l'alerte (sol majeur)
const BELL_PARTIALS = [
  { ratio: 1, peak: 0.1, length: 1.1 },
  { ratio: 1.0035, peak: 0.04, length: 0.95 },
  { ratio: 2.76, peak: 0.035, length: 0.45 },
  { ratio: 5.4, peak: 0.018, length: 0.18 },
];
// Le battant : un souffle très bref, filtré dans l'aigu.
const STRIKE_LENGTH_S = 0.012;
const STRIKE_PEAK = 0.04;
const STRIKE_HZ = 4800;

export function playBell() {
  return play((ctx, start) => {
    for (const partial of BELL_PARTIALS) {
      tone(ctx, {
        at: start,
        frequency: BELL_HZ * partial.ratio,
        peak: partial.peak,
        length: partial.length,
        attack: 0.003,
      });
    }
    const samples = Math.ceil(ctx.sampleRate * STRIKE_LENGTH_S);
    const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < samples; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    noise.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = STRIKE_HZ;
    gain.gain.value = STRIKE_PEAK;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(start);
  });
}

// ── Geste : « compris, c'est fait » ─────────────────────────────────────────

/**
 * Deux frappes de maillet, à la quinte montante (do 5 → sol 5) : la montée dit
 * « oui », la brièveté dit « c'est fait ». Plus grave et plus sèche que
 * l'alerte, pour ne pas s'y confondre : chaque frappe est un fondamental et son
 * partiel à ×4 qui s'éteint aussitôt — le « toc » d'un marimba.
 */
const ACK_HZ = [523, 784];
const ACK_GAP_S = 0.08;
const ACK_LENGTH_S = 0.16;
const ACK_PEAK = 0.08;

export function playAck() {
  return play((ctx, start) =>
    ACK_HZ.forEach((frequency, index) => {
      const at = start + index * ACK_GAP_S;
      tone(ctx, { at, frequency, peak: ACK_PEAK, length: ACK_LENGTH_S, attack: 0.006 });
      tone(ctx, { at, frequency: frequency * 4, peak: ACK_PEAK / 4, length: 0.04, attack: 0.002 });
    }),
  );
}

// ── Minuteur : la fin du décompte ───────────────────────────────────────────

/**
 * Une petite phrase de boîte à musique, en sol majeur comme l'alerte : un
 * arpège qui monte, trois notes qui redescendent, et l'accord de sol tenu —
 * elle se termine sur la tonique, c'est ce qui dit « fini » sans un mot.
 * Mesurée dans Chromium (rendu hors temps réel) : audible près de trois
 * secondes et demie, sans jamais saturer — assez pour qu'on lève la tête,
 * pas assez pour couvrir la phrase de quelqu'un.
 *
 * Chaque note est un fondamental et son octave, plus brève et quatre fois
 * plus faible : le timbre d'une lame de métal, pas d'un bip. L'accord final
 * joue chaque note un peu moins fort : trois notes ensemble s'additionnent.
 */
const MELODY = [
  { at: 0, hz: 784, length: 0.5 }, // sol 5
  { at: 0.2, hz: 988, length: 0.5 }, // si 5
  { at: 0.4, hz: 1175, length: 0.5 }, // ré 6
  { at: 0.6, hz: 1568, length: 0.7 }, // sol 6
  { at: 1, hz: 1319, length: 0.5 }, // mi 6
  { at: 1.2, hz: 1175, length: 0.5 }, // ré 6
  { at: 1.4, hz: 988, length: 0.5 }, // si 5
  { at: 1.6, hz: 1175, length: 0.6 }, // ré 6
  // L'accord de sol, tenu.
  { at: 2, hz: 784, length: 2.4, level: 0.7 },
  { at: 2, hz: 1175, length: 2.4, level: 0.7 },
  { at: 2, hz: 1568, length: 2.4, level: 0.7 },
];
const MELODY_PEAK = 0.11;

export function playTimerMelody() {
  return play((ctx, start) =>
    MELODY.forEach(({ at, hz, length, level = 1 }) => {
      const peak = MELODY_PEAK * level;
      tone(ctx, { at: start + at, frequency: hz, peak, length, attack: 0.008 });
      tone(ctx, {
        at: start + at,
        frequency: hz * 2,
        peak: peak / 4,
        length: length / 2,
        attack: 0.004,
      });
    }),
  );
}
