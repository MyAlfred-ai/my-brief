/**
 * Aide IA — la boîte à idées : quand une idée est permise, et ce qui en fait
 * une redite.
 *
 * Signalé en recette le 2026-11-25 : des idées « trop nombreuses et pas
 * toujours pertinentes ». Trois causes, lues dans le code :
 *   - une lecture part toutes les vingt secondes, et chacune pouvait rendre
 *     une idée — rien ne les espaçait ;
 *   - le niveau d'intervention ne les touchait pas : la consigne « idée »
 *     partait en « Discrètes » comme en « Soutenues » ;
 *   - la consigne les tirait du NOUVEAU passage, vingt secondes de parole :
 *     l'IA rebondissait sur la dernière phrase, pas sur le sujet.
 *
 * L'espacement est donc tenu ICI, par le serveur, et non demandé au modèle :
 * tant qu'une idée n'est pas permise, sa consigne n'entre pas dans le prompt
 * (lib/aiHelp/engine.js), et une idée rendue quand même est jetée. Écarté :
 * « une idée de temps en temps » écrit dans la consigne — le modèle ne voit
 * pas l'heure de ses idées précédentes, et chaque lecture est une nouvelle
 * chance d'en sortir une moyenne.
 *
 * Fonctions pures : ni base, ni réseau, ni horloge implicite (`now`).
 */
import { agendaKey } from './domains.js';

/**
 * Le temps minimal entre deux idées, par niveau d'intervention. Un niveau
 * absent (« Discrètes ») n'en propose aucune : c'est ce que l'administration
 * annonce (« Seulement les contradictions nettes »).
 */
export const IDEA_GAP_MS = { normal: 10 * 60 * 1000, busy: 5 * 60 * 1000 };

/**
 * Une idée demandée sans réponse n'est redemandée qu'après ce délai : la
 * redemander à chaque lecture, c'était tirer au sort jusqu'à ce qu'il en
 * sorte une, et la plus faible finissait par passer.
 */
export const IDEA_LOOK_MS = 2 * 60 * 1000;

/**
 * Pas d'idée avant que la réunion ait de quoi la nourrir : environ trois
 * minutes de parole (≈ 900 caractères par minute). Avant, la première idée
 * tombait sur les salutations.
 */
export const IDEA_MIN_CHARS = 3000;

/** Idées déjà proposées rappelées au modèle, en plus des dernières interventions. */
export const IDEAS_RECALLED_MAX = 20;

/** L'heure d'une date ISO, ou `NaN`. */
const timeOf = (iso) => (typeof iso === 'string' ? Date.parse(iso) : NaN);

/**
 * Une idée est-elle permise à cette lecture ?
 * @param {{pace: string, items?: {kind: string, at?: string}[], lookedAt?: string,
 *   material?: number, now?: number}} input - `items` : les interventions de la
 *   réunion ; `lookedAt` : la dernière fois qu'une idée a été demandée ;
 *   `material` : ce que la lecture porte de transcription, en caractères.
 * @returns {boolean}
 */
export function ideaDue({ pace, items = [], lookedAt = '', material = 0, now = Date.now() }) {
  const gap = IDEA_GAP_MS[pace];
  if (!gap || material < IDEA_MIN_CHARS) return false;
  const asked = timeOf(lookedAt);
  if (now - asked < IDEA_LOOK_MS) return false;
  const last = items.reduce(
    (latest, item) => (item?.kind === 'idea' ? Math.max(latest, timeOf(item.at) || 0) : latest),
    0,
  );
  return !(now - last < gap);
}

/** Des mots trop communs pour rapprocher deux idées. */
const STOP_WORDS = new Set(
  (
    'avec pour dans sans plus mais cette entre avant apres leur leurs nous vous sont tout tous ' +
    'toute toutes faire etre avoir comme quand faut peut bien aussi encore deja chez vers ' +
    'with from that this they them their have about into more than also'
  ).split(' '),
);

/** Les mots qui portent une idée : sans accents ni casse, au singulier grossier. */
function wordsOf(title) {
  return new Set(
    agendaKey(title)
      .split(' ')
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
      .map((word) => (word.length > 4 ? word.replace(/[sx]$/, '') : word)),
  );
}

/**
 * Cette idée a-t-elle déjà été proposée, dite autrement ? Même titre — à la
 * casse, aux accents et à la ponctuation près —, ou au moins deux mots
 * porteurs en commun formant les trois cinquièmes du plus court des deux.
 * Un filet sous la consigne : le modèle a la liste de ce qu'il a dit, et la
 * redit quand même d'une autre tournure.
 * @param {string} title
 * @param {string[]} previous - les titres des idées déjà proposées
 * @returns {boolean}
 */
export function repeatsIdea(title, previous) {
  const key = agendaKey(title);
  const words = wordsOf(title);
  return previous.some((other) => {
    if (agendaKey(other) === key) return true;
    const theirs = wordsOf(other);
    const shared = [...words].filter((word) => theirs.has(word)).length;
    return shared >= 2 && shared / Math.min(words.size, theirs.size) >= 0.6;
  });
}
