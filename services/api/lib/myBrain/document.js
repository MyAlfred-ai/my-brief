/**
 * Ce que myBrain reçoit d'une réunion — fonctions PURES, testées sans réseau.
 *
 * Un dépôt myBrain est un `{ titre, texte, pour }` : l'ingesteur de myBrain lit
 * le texte comme n'importe quelle source (un compte rendu collé, une note), en
 * tire une page source et des faits datés vers les bonnes fiches, et TOUT part
 * en proposition dans sa revue. Le texte est donc écrit pour un LECTEUR — son
 * modèle —, en Markdown : les métadonnées en tête (date, durée, auteur, tag),
 * puis les notes, les actions, le compte rendu, et la transcription intégrale.
 *
 * ── Ce qui n'y est PAS, exprès ───────────────────────────────────────────────
 * Le nom de l'outil. myBrain pose lui-même la provenance (« transmis par »,
 * en frontmatter de la page source, d'après la clé) : écrite dans le texte, la
 * mention devenait une ENTITÉ pour son modèle — leçon payée côté myBrain
 * (cf. le commentaire de analyserSource dans son ingesteur).
 *
 * ── Le plafond de 120 000 caractères ─────────────────────────────────────────
 * C'est celui de l'API de myBrain par texte (MAX_TEXTE_DEPOT) ; au-delà elle
 * répond 413 et demande d'envoyer « en plusieurs parties ». Une réunion d'une
 * heure en fait la moitié ; une journée d'atelier, plusieurs fois. La
 * transcription est alors découpée AUX FINS DE LIGNE (une prise de parole n'est
 * jamais coupée en deux, sauf si elle dépasse à elle seule une partie), et
 * chaque partie reprend l'en-tête : myBrain analyse chaque dépôt sans voir les
 * autres, une partie sans date ni auteur serait une source orpheline. Les
 * notes, les actions et le compte rendu ne voyagent qu'avec la première.
 *
 * Une reprise après un échec en partie 2 ne RECALCULE pas le découpage : elle
 * rejoue les positions de coupe gardées en base au premier dépôt accepté
 * (`cuts`, cf. lib/myBrain/feed.js). Recalculé, il glisserait avec tout ce qui
 * a bougé entre-temps — le compte rendu régénéré change la place laissée à la
 * transcription dans la partie 1 —, et des répliques seraient perdues ou
 * doublées sans que rien ne le signale.
 */
import { UNTITLED_MEETING } from '../prompts.js';
import { isLegacyActionPlaceholder } from '../notesActions.js';

/** Plafond de l'API myBrain par texte (MAX_TEXTE_DEPOT de applications.ts). */
export const MYBRAIN_TEXT_MAX = 120_000;
/**
 * Parties au plus : 8 × 120 000 caractères, l'horizon que l'ingesteur de
 * myBrain sait analyser pour une source (MAX_SEGMENTS). Au-delà — plus de
 * quinze heures de parole —, la fin n'est pas envoyée, et le texte le dit.
 */
export const MYBRAIN_PARTS_MAX = 8;
/** Plafond du titre côté myBrain (il coupe au-delà). */
export const MYBRAIN_TITLE_MAX = 300;

/**
 * Bornes des sections d'appoint : elles voyagent avec la PREMIÈRE partie, et
 * doivent y laisser la place d'un vrai morceau de transcription.
 */
const NOTES_MAX = 20_000;
const ACTIONS_MAX = 15_000;
const SUMMARY_MAX = 40_000;
/** Réserve pour la ligne « partie k sur n » : sa longueur dépend de n. */
const PART_LABEL_RESERVE = 200;

/** Fuseau des dates écrites — celui des prompts (lib/prompts.js, parité n8n). */
const TIME_ZONE = 'Europe/Paris';

function clean(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function oneLine(value) {
  return clean(value).replace(/\s+/g, ' ');
}

/**
 * Texte utile, ou vide. Les textes de remplacement que l'écran des actions
 * ENREGISTRAIT comme valeurs (un porteur « À définir »…) ne disent rien, et
 * « À définir » finirait en personne dans le cerveau — liste unique côté
 * serveur, dans lib/notesActions.js.
 */
function meaningful(value) {
  const text = oneLine(value);
  return text && !isLegacyActionPlaceholder(text) ? text : '';
}

function decodeEntity(entity, code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return entity;
  }
}

/**
 * Compte rendu HTML → texte Markdown. Le résumé est stocké en HTML (les
 * templates le demandent ainsi) ; myBrain lit du texte, et les balises
 * coûteraient une part non négligeable des 120 000 caractères. On garde la
 * STRUCTURE — titres, puces, tableaux —, pas la mise en forme.
 *
 * Un texte sans balise (un compte rendu déjà en Markdown) passe tel quel.
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  const raw = String(html || '');
  if (!/<[a-z!/][^>]*>/i.test(raw)) return clean(raw);
  return clean(
    raw
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // Les titres du compte rendu passent SOUS la section « Compte rendu » du
      // dépôt (niveau 2) : un <h1> devient ###.
      .replace(
        /<h([1-6])[^>]*>/gi,
        (_, level) => `\n\n${'#'.repeat(Math.min(6, Number(level) + 2))} `,
      )
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/(p|div|ul|ol|table|blockquote|section|article|header|footer)>/gi, '\n\n')
      .replace(/<(strong|b)(\s[^>]*)?>|<\/(strong|b)>/gi, '**')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&(#39|apos);/g, "'")
      .replace(/&#(\d+);/g, (entity, code) => decodeEntity(entity, Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (entity, code) => decodeEntity(entity, parseInt(code, 16)))
      // En dernier : `&amp;lt;` doit rester `&lt;` à la lecture.
      .replace(/&amp;/g, '&')
      .replace(/ \| *\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n'),
  );
}

/**
 * Durée lisible (« 1 h 05 », « 42 min ») depuis des secondes. '' si inconnue :
 * une durée absente n'est pas une durée nulle (cf. lib/meetingDuration.js).
 * @param {number|null|undefined} seconds
 */
export function formatMeetingDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '';
  const minutes = Math.round(value / 60);
  if (minutes < 1) return 'moins d’une minute';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

/** Date de la RÉUNION : son début, sinon la date affichée par l'historique. */
export function meetingDateOf(meeting) {
  for (const raw of [
    meeting?.meetingStartTime,
    meeting?.lastConnecion,
    meeting?.lastConnection,
    meeting?.now,
  ]) {
    if (!raw) continue;
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function longDate(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function shortDate(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function shortTime(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Actions visibles, en lignes Markdown. Une action masquée par l'utilisateur
 * (`show: false`) reste en base mais ne part pas — même règle que l'écran, le
 * compte rendu et l'infographie.
 */
function actionLines(actions) {
  const lines = [];
  for (const action of Array.isArray(actions) ? actions : []) {
    if (!action || typeof action !== 'object' || action.show === false) continue;
    const title = meaningful(action.title || action.text);
    const description = meaningful(action.description);
    const headline = title || description;
    if (!headline) continue;
    const owner = meaningful(action.owner || action.assignee);
    const due = meaningful(action.dueDate);
    const details = [owner && `responsable : ${owner}`, due && `échéance : ${due}`].filter(Boolean);
    lines.push(`- **${headline}**${details.length ? ` — ${details.join(' — ')}` : ''}`);
    if (title && description && description !== title) lines.push(`  ${description}`);
  }
  return lines;
}

function bounded(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}\n\n(… la suite n’a pas été transmise.)`;
}

/**
 * Où couper la transcription : la fin (exclusive) de chaque morceau, en
 * caractères. Coupe à la DERNIÈRE fin de ligne qui tient dans la place ; une
 * ligne plus longue qu'un morceau est coupée net — le seul cas où une prise de
 * parole se retrouve à cheval sur deux parties.
 *
 * Des positions, et non des morceaux : c'est ce qui se garde en base pour
 * qu'une reprise retombe sur les MÊMES frontières, quoi qu'il soit arrivé
 * depuis au compte rendu, aux notes ou au titre (cf. `cuts` ci-dessous).
 */
function cutPoints(text, firstSize, nextSize, maxParts) {
  const cuts = [];
  let start = 0;
  let size = firstSize;
  const cutFrom = (from, room) => {
    const newline = text.lastIndexOf('\n', from + room);
    return newline > from ? newline : from + room;
  };
  while (text.length - start > size && cuts.length < maxParts - 1) {
    const end = cutFrom(start, size);
    cuts.push(end);
    // Le saut de ligne de la frontière n'appartient à aucun des deux morceaux.
    start = text[end] === '\n' ? end + 1 : end;
    size = nextSize;
  }
  // Le dernier morceau va au bout — ou, plafond de parties atteint, jusqu'à la
  // dernière fin de ligne qui tient : la suite est laissée de côté, et le texte
  // le dit.
  cuts.push(text.length - start > size ? cutFrom(start, size) : text.length);
  return cuts;
}

/** Le morceau `index` d'une transcription, d'après ses positions de coupe. */
function sliceAt(text, cuts, index) {
  const from = index === 0 ? 0 : cuts[index - 1];
  return text.slice(from, cuts[index]).replace(/^\n/, '');
}

/**
 * Les dépôts d'une réunion, dans l'ordre. Tableau vide si la réunion n'a rien
 * à apprendre à myBrain : ni transcription, ni compte rendu, ni note, ni action.
 *
 * Chaque dépôt porte `end`, la position de fin de son morceau de transcription.
 * `cuts` rejoue un découpage déjà ENGAGÉ — une réunion dont la partie 1 est
 * arrivée chez myBrain : recalculées sur un contenu qui a bougé (un compte
 * rendu régénéré entre deux essais change la place laissée à la transcription
 * dans la partie 1), les frontières glisseraient, et des répliques seraient
 * perdues ou doublées d'une partie à l'autre.
 *
 * @param {object} meeting - document `resume`
 * @param {{authorName?: string, authorEmail?: string, tagLabel?: string,
 *          maxChars?: number, maxParts?: number, cuts?: number[]}} [context]
 * @returns {{titre: string, texte: string, pour?: string, end: number}[]}
 */
export function buildMyBrainDeposits(
  meeting,
  {
    authorName = '',
    authorEmail = '',
    tagLabel = '',
    maxChars = MYBRAIN_TEXT_MAX,
    maxParts = MYBRAIN_PARTS_MAX,
    cuts: replayed,
  } = {},
) {
  const transcription = clean(meeting?.transcription);
  const notes = clean(meeting?.notes);
  const summary = htmlToText(meeting?.resume);
  const actions = actionLines(meeting?.actions);
  if (!transcription && !notes && !summary && !actions.length) return [];

  const date = meetingDateOf(meeting);
  const rawTitle = oneLine(meeting?.title);
  const hasTitle = !!rawTitle && rawTitle !== UNTITLED_MEETING;
  // Le titre porte la date : c'est lui qui nomme la page source dans le
  // cerveau, et « Point hebdo » n'y distinguerait pas deux semaines.
  const baseTitle = hasTitle
    ? `${rawTitle}${date ? ` — réunion du ${shortDate(date)}` : ''}`
    : date
      ? `Réunion du ${shortDate(date)} à ${shortTime(date)}`
      : 'Réunion';

  const name = oneLine(authorName);
  const email = oneLine(authorEmail);
  const author =
    name && email && name.toLowerCase() !== email.toLowerCase()
      ? `${name} (${email})`
      : name || email;
  const meta = [
    date && `- Date : ${longDate(date)} (heure de Paris)`,
    formatMeetingDuration(meeting?.meetingDuration) &&
      `- Durée : ${formatMeetingDuration(meeting.meetingDuration)}`,
    author && `- Auteur : ${author}`,
    oneLine(tagLabel) && `- Tag : ${oneLine(tagLabel)}`,
  ].filter(Boolean);

  const heading = hasTitle ? rawTitle : baseTitle;
  const head = (label = '') => [`# ${heading}${label}`, '', ...meta].join('\n');

  const extras = [
    notes && `## Notes de réunion\n\n${bounded(notes, NOTES_MAX)}`,
    actions.length && `## Actions\n\n${bounded(actions.join('\n'), ACTIONS_MAX)}`,
    summary &&
      `## Compte rendu (rédigé par l’IA à partir de la transcription)\n\n${bounded(summary, SUMMARY_MAX)}`,
  ].filter(Boolean);

  const transcriptTitle = '## Transcription intégrale';
  const assemble = (label, sections, chunk, continued = false) =>
    [
      head(label),
      ...sections,
      ...(chunk ? [`${transcriptTitle}${continued ? ' (suite)' : ''}\n\n${chunk}`] : []),
    ].join('\n\n');

  const pour = email.includes('@') ? { pour: email } : {};
  const valid =
    Array.isArray(replayed) &&
    replayed.length > 1 &&
    replayed.every((cut, i) => Number.isInteger(cut) && cut >= (i ? replayed[i - 1] : 0));
  if (!valid) {
    const single = assemble('', extras, transcription);
    if (single.length <= maxChars) {
      return [
        {
          titre: baseTitle.slice(0, MYBRAIN_TITLE_MAX),
          texte: single,
          ...pour,
          end: transcription.length,
        },
      ];
    }
  }

  // Plusieurs parties : la première porte les sections d'appoint, les
  // suivantes seulement l'en-tête et la suite de la transcription.
  const firstRoom = maxChars - assemble(' — partie 1', extras, 'x').length - PART_LABEL_RESERVE;
  const nextRoom = maxChars - assemble(' — partie 1', [], 'x', true).length - PART_LABEL_RESERVE;
  const cuts = valid
    ? replayed
    : cutPoints(transcription, Math.max(1_000, firstRoom), Math.max(1_000, nextRoom), maxParts);
  const total = cuts.length;
  // Ce qui dépasse la dernière coupe n'est pas envoyé : le plafond de parties,
  // ou du texte ajouté à la transcription après que le découpage a été engagé.
  const truncated = cuts[total - 1] < transcription.length;
  return cuts.map((end, index) => {
    const label = ` — partie ${index + 1} sur ${total}`;
    const tail =
      truncated && index === total - 1
        ? '\n\n(… la fin de la transcription dépasse ce qui peut être transmis et n’a pas été envoyée.)'
        : '';
    const chunk = sliceAt(transcription, cuts, index);
    const texte = assemble(label, index === 0 ? extras : [], `${chunk}${tail}`, index > 0);
    return {
      titre: `${baseTitle} (partie ${index + 1} sur ${total})`.slice(0, MYBRAIN_TITLE_MAX),
      texte,
      ...pour,
      end,
    };
  });
}
