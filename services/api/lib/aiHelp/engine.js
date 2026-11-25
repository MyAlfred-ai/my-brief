/**
 * Aide IA d'une réunion — le travail : lire myBrain, interroger le modèle,
 * garder ce qu'il dit.
 *
 *   watchMeeting     une LECTURE du passage qui vient d'être dit : au plus deux
 *                    interventions, l'état de l'ordre du jour, les points
 *                    qu'on vient d'y annoncer, et — tant que le projet de la
 *                    réunion n'est pas connu — le nom entendu.
 *   answerQuestion   la réponse à une question posée à l'IA — dont « quel est
 *                    l'ordre du jour », « a-t-il été tenu », « ajoute-y… » — et
 *                    les GESTES qu'on lui demande : poser un tag, noter, rappeler
 *                    dans dix minutes, lancer un minuteur (le rallonger,
 *                    l'arrêter), fermer sa fenêtre, mettre la réunion en
 *                    pause, la reprendre, la terminer, en rédiger le compte
 *                    rendu, en corriger la transcription.
 *   resolveProject   un nom → la fiche du projet, ou des candidats.
 *
 * ── Partis pris ──────────────────────────────────────────────────────────────
 * - C'est le modèle de MYBRIEF qui rédige ; myBrain ne fournit que la matière
 *   (fiche du projet, contexte d'une question). Son `/question` — un tour
 *   d'agent, jusqu'à quatre minutes — est hors de portée d'une réunion.
 * - myBrain en panne ne casse pas la réunion : la lecture continue sans le
 *   garde-fou du projet, la question reçoit une réponse tirée de la réunion,
 *   et la réponse porte un `notice` (le slug de la panne) que l'écran affiche
 *   une fois. Seule une panne du MODÈLE est une erreur de la route.
 * - La fiche du projet est gardée cinq minutes en mémoire, par installation :
 *   une réunion la relit à chaque passage, et myBrain n'a pas à la resservir
 *   trente fois de suite. Elle est lue au nom de l'application — la même pour
 *   tous les comptes qui y ont droit —, donc partageable entre eux.
 * - La transcription vient du CORPS de la requête, comme pour la détection
 *   d'actions : la copie en base a jusqu'à vingt secondes de retard sur ce qui
 *   se dit. Elle n'est qu'un texte donné au modèle ; ce qui est écrit en base
 *   l'est sous le compte du demandeur, sur une réunion qui est la sienne.
 * - L'ordre du jour ne RÉGRESSE pas : un point vu « en cours » ou « traité » ne
 *   redevient jamais « pas encore abordé ». Le modèle ne lit que la fin de la
 *   transcription ; sans ce cliquet, le premier point d'une longue réunion
 *   finirait compté parmi les oubliés.
 * - Un geste demandé à l'IA n'est jamais exécuté par le modèle : il le NOMME,
 *   myBrief le vérifie et le fait. Le tag doit exister chez ce compte (la
 *   réponse dit sinon qu'il n'existe pas — elle n'en crée pas : trente tags au
 *   plus, et un nom mal transcrit en userait un) ; le rappel est une
 *   intervention datée, gardée avec la réunion, que l'écran tait jusqu'à son
 *   heure. Poser le tag et écrire la note reviennent à l'ÉCRAN : c'est lui qui
 *   tient les notes de la réunion en cours, et la base les suit.
 * - Pause, reprise, fin, compte rendu, correction de la transcription : l'écran
 *   les fait aussi — l'enregistrement et la transcription du direct ne vivent
 *   que là. Le serveur ne laisse passer que ce qui a un sens : « reprends » sur
 *   une réunion qui n'est pas en pause, un template qu'aucun ne porte, un
 *   passage qui n'est pas dans la transcription sont DITS sur la réponse et ne
 *   partent pas. Terminer range la réunion sans compte rendu : rien n'est
 *   perdu, et aucun geste de l'IA ne supprime quoi que ce soit.
 * - Le rappel de fin de réunion ne se fie pas au seul modèle. Qu'il dise « la
 *   réunion se termine » et qu'il reste un point jamais abordé : l'intervention
 *   part, écrite par lui s'il l'a écrite, réduite à la liste des points sinon
 *   (l'écran lui donne son titre). Elle ne se répète pas pour les mêmes points
 *   avant dix minutes — un « merci à tous » n'est pas toujours la fin.
 */
import { ownerFilter } from '../ownerScope.js';
import { MyBrainError } from '../myBrain/client.js';
import { foldKey } from '../transcriptCorrections.js';
import { AI_HELP_AGENDA_HEARD_MAX, addAgendaPoints, agendaKey, agendaPoints } from './domains.js';
import {
  answerPrompt,
  parseAnswerOutput,
  parseSearchPlan,
  parseWatchOutput,
  searchPlanPrompt,
  watchPrompt,
} from './prompts.js';
import { searchBrain } from './brainSearch.js';
import { IDEAS_RECALLED_MAX, ideaDue, repeatsIdea } from './ideas.js';
import { closestName } from './soundsLike.js';
import { readTagContext, tagContextTerms } from '../tagContext.js';
import { moveTimer, publicTimer, timerLeft } from './timer.js';
import {
  AI_HELP_ITEMS_MAX,
  newItem,
  publicItem,
  readSession,
  refreshMyBrainRights,
  withHeard,
} from './session.js';

const SHEET_CACHE_TTL_MS = 5 * 60 * 1000;
const SHEET_CACHE_MAX = 200;
/** Extraits demandés à myBrain pour une question : de quoi répondre, vite. */
const ANSWER_CONTEXT_BUDGET = 8000;
/** Titres rappelés au modèle pour qu'il ne se répète pas. */
const ALREADY_SAID_MAX = 12;
const PERSON_CACHE_TTL_MS = 10 * 60 * 1000;
/** Questions précédentes rappelées, à myBrain comme au modèle. */
const HISTORY_TURNS = 3;
/**
 * Ce qu'on garde d'une fiche trouvée par la recherche élargie (brainSearch.js) :
 * 2 000 caractères quand le contexte de myBrain a déjà rendu de la matière,
 * 3 500 quand elle est tout ce qu'on a.
 */
const EXTRA_SHEET_CHARS = 2000;
const LONE_SHEET_CHARS = 3500;
/** La préparation de la recherche n'attend pas : au-delà, on cherche sans elle. */
const PLAN_TIMEOUT_MS = 8000;
/** Le même rappel de fin de réunion ne revient pas avant ce délai. */
const CLOSING_AGAIN_MS = 10 * 60 * 1000;

/** Une mémoire par application : les tests ne partagent rien, la production n'en a qu'une. */
const caches = new WeakMap();
function sheetCacheOf(app) {
  if (!caches.has(app)) caches.set(app, new Map());
  return caches.get(app);
}

/** La fiche d'un projet, relue au plus toutes les cinq minutes. */
async function projectSheet(app, brain, path) {
  const cache = sheetCacheOf(app);
  const key = `${brain.url}\n${path}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < SHEET_CACHE_TTL_MS) return hit.sheet;
  const sheet = await app.myBrain.sheet({ url: brain.url, apiKey: brain.apiKey, path });
  if (cache.size >= SHEET_CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), sheet });
  return sheet;
}

const fold = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

const isBrainFailure = (err) => err instanceof MyBrainError;

/** myBrain refuse la CLÉ : ce que myBrief croit de ses droits est périmé. */
const KEY_REFUSALS = new Set(['mybrain_right_missing', 'mybrain_key_rejected']);

/**
 * Une lecture de myBrain a échoué. Si c'est la clé qu'il refuse, ses droits
 * sont relus aussitôt : la prochaine requête dira « la clé n'a pas le droit
 * lire » au lieu de retomber sur le même refus, réunion après réunion.
 */
async function brainFailed(app, log, err, what) {
  log.warn({ code: err.code, status: err.status }, `aide IA : ${what}`);
  if (KEY_REFUSALS.has(err.code)) await refreshMyBrainRights(app, { force: true, log });
  return err.code;
}

/** Pourquoi une réponse s'est passée de myBrain (cf. KNOWLEDGE_STATES). */
const NO_BRAIN_KNOWLEDGE = { no_group_right: 'no_right', no_read_right: 'no_key_right' };

/**
 * Pour qui l'IA travaille : le nom du compte, ce qu'il dit de lui dans « Ma
 * configuration », et le vocabulaire de l'organisation. Lu en base sous le
 * compte du demandeur — rien de tout cela ne vient du corps de la requête.
 *
 * Sans ce bloc, l'IA répondait sans savoir à qui : ni le poste, ni
 * l'entreprise, ni même le nom (constaté en recette, 2026-11-12).
 *
 * @param {object} app
 * @param {{email: string, name?: string}} user
 * @returns {Promise<{user: {name: string, context: string, sheet: object|null}, orgContext: string}>}
 */
async function whoIsAsking(app, user) {
  const [orgContext, config] = await Promise.all([
    app.settings.orgContextText(),
    app.db
      .collection('userConfig')
      .findOne(ownerFilter(user.email), { projection: { _id: 0, context: 1 } }),
  ]);
  return {
    orgContext,
    user: {
      name: String(user.name || '').trim(),
      context: typeof config?.context === 'string' ? config.context.trim() : '',
      sheet: null,
    },
  };
}

/**
 * La fiche que myBrain tient sur la personne, cherchée par son NOM. myBrain ne
 * rend une fiche que s'il en est sûr ; un nom ambigu ou inconnu ne donne rien,
 * et ce « rien » est retenu lui aussi, pour ne pas reposer la question à chaque
 * réponse. Gardée dix minutes, comme une fiche de projet.
 */
async function personSheet(app, brain, user) {
  const name = String(user.name || '').trim();
  if (!name || name.includes('@')) return null;
  const cache = sheetCacheOf(app);
  const key = `${brain.url}\nperson\n${fold(name)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < PERSON_CACHE_TTL_MS) return hit.sheet;
  let sheet = null;
  try {
    sheet = await app.myBrain.sheet({ url: brain.url, apiKey: brain.apiKey, name });
  } catch (err) {
    if (!isBrainFailure(err)) throw err;
    // Introuvable ou ambigu : retenu. Une panne, elle, sera retentée.
    if (err.code !== 'mybrain_not_found') return null;
  }
  if (cache.size >= SHEET_CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), sheet });
  return sheet;
}

/** Mots qui ne disent pas de QUOI parle une question. */
const QUESTION_WORDS = new Set(
  'rappelle rappeler donne donner peux pouvez quelle quelles quels comment pourquoi quand combien cette notre votre leurs avons sommes about which where what when please could would remind'.split(
    ' ',
  ),
);

/**
 * Les mots-clés d'une question, pour la recherche plein texte de myBrain (qui
 * veut « 2 à 6 mots », pas une phrase) : les noms propres et les sigles s'il y
 * en a — « AMBRE », « Marquet » —, sinon les mots longs.
 */
export function keywordsOf(question) {
  const words = String(question || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const proper = words.filter(
    (word, index) =>
      word.length >= 2 && /^\p{Lu}/u.test(word) && (index > 0 || word === word.toUpperCase()),
  );
  const long = words.filter((word) => word.length >= 5 && !QUESTION_WORDS.has(fold(word)));
  return [...new Set(proper.length ? proper : long)].slice(0, 5).join(' ');
}

/** Les noms propres et sigles d'une question, tels qu'écrits — à défaut de mieux. */
export function properNamesOf(question) {
  const words = String(question || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return [
    ...new Set(
      words.filter(
        (word, index) =>
          word.length >= 2 && /^\p{Lu}/u.test(word) && (index > 0 || word === word.toUpperCase()),
      ),
    ),
  ].slice(0, 5);
}

/**
 * Ce qu'on a voulu demander, et les noms à chercher (prompts.js,
 * `searchPlanPrompt`). Ne lève jamais : sans le modèle — panne, délai, sortie
 * illisible — la recherche part des noms propres de la question telle qu'elle
 * est écrite, comme avant.
 *
 * @returns {Promise<{question: string, names: string[], topics: string[], planned: boolean}>}
 */
async function planSearch({
  app,
  log,
  question,
  transcript,
  vocabulary,
  history,
  notes,
  orgContext,
}) {
  const keywords = keywordsOf(question);
  const plain = {
    question: '',
    names: properNamesOf(question),
    topics: keywords ? [keywords] : [],
    planned: false,
  };
  try {
    const raw = await app.openai.chat({
      model: app.config.openai.models.aiHelp,
      reasoningEffort: 'low',
      timeoutMs: PLAN_TIMEOUT_MS,
      messages: [
        {
          role: 'user',
          content: searchPlanPrompt({
            question,
            transcript,
            vocabulary,
            history,
            notes,
            orgContext,
          }),
        },
      ],
    });
    const plan = parseSearchPlan(raw);
    if (!plan.question && !plan.names.length && !plan.topics.length) return plain;
    return {
      question: plan.question,
      // Les noms tels qu'écrits restent cherchés : le modèle peut en oublier un.
      names: [...plan.names, ...plain.names],
      topics: plan.topics.length ? plan.topics : plain.topics,
      planned: true,
    };
  } catch (err) {
    log.warn({ status: err?.status }, 'aide IA : préparation de la recherche en échec');
    return plain;
  }
}

/**
 * Ce que myBrain sait pour répondre à une question. Deux temps :
 *
 * 1. ensemble — le contexte que myBrain assemble autour de la question (avec
 *    le fil des questions précédentes, pour qu'une question de suite retrouve
 *    son sujet), la fiche du projet de la réunion, la fiche de la personne, et
 *    la PRÉPARATION de la recherche (`planSearch`) ;
 * 2. la recherche élargie (brainSearch.js) : chaque nom de la question, dans
 *    ses graphies plausibles, puis ses sujets — et, si le premier contexte n'a
 *    rien rendu, un second sur la question telle qu'elle a été comprise.
 *
 * Avant, le second temps n'existait que si le contexte ne rendait AUCUNE
 * fiche, et ne lisait que les deux premières d'une recherche sur les mots tels
 * qu'écrits : un nom écorché ne trouvait rien, un nom bien écrit trouvait peu
 * (« il trouve très peu d'informations », 2026-11-13). Les fiches désignées
 * par leur NOM passent maintenant devant les extraits assemblés : c'est
 * d'elles que la question parle.
 *
 * @returns {Promise<{knowledge: string, sheets: object[], project: object|null,
 *   person: object|null, notice: string, understood: string,
 *   matched: {heard: string, title: string}[], planned: boolean}>}
 */
async function gatherKnowledge({
  app,
  log,
  brain,
  session,
  user,
  question,
  transcript = '',
  vocabulary = [],
  notes = '',
  orgContext = '',
}) {
  const found = {
    knowledge: '',
    sheets: [],
    project: null,
    person: null,
    notice: '',
    understood: '',
    matched: [],
    planned: false,
  };
  if (!brain) return found;
  const link = { url: brain.url, apiKey: brain.apiKey };
  const history = session.items
    .filter((item) => item.kind === 'answer' && item.question && item.body)
    .slice(-HISTORY_TURNS)
    .flatMap((item) => [
      { role: 'user', content: item.question },
      { role: 'assistant', content: item.body },
    ]);
  // Le projet de la réunion situe la question : « la date de livraison » ne
  // dit pas de quoi sans lui.
  const situated = (text) => (session.project ? `${text} — ${session.project.title}` : text);
  const contextOf = (text) =>
    app.myBrain.context({
      ...link,
      question: situated(text),
      budget: ANSWER_CONTEXT_BUDGET,
      history,
    });

  const [context, project, person, plan] = await Promise.allSettled([
    contextOf(question),
    session.project ? projectSheet(app, brain, session.project.path) : null,
    personSheet(app, brain, user),
    planSearch({
      app,
      log,
      question,
      transcript,
      vocabulary,
      notes,
      orgContext,
      history: session.items
        .filter((item) => item.kind === 'answer' && item.question)
        .slice(-HISTORY_TURNS),
    }),
  ]);
  for (const outcome of [context, project, person]) {
    if (outcome.status === 'rejected' && !isBrainFailure(outcome.reason)) throw outcome.reason;
  }

  if (context.status === 'fulfilled') {
    found.knowledge = context.value.context;
    found.sheets = context.value.sheets;
  } else {
    found.notice = await brainFailed(app, log, context.reason, 'contexte myBrain illisible');
  }
  if (project.status === 'fulfilled' && project.value) {
    found.project = {
      title: project.value.title || session.project.title,
      content: project.value.content,
    };
  }
  if (person.status === 'fulfilled') found.person = person.value;
  // myBrain vient de refuser ou de tomber : inutile de lui poser dix questions de plus.
  if (found.notice) return found;

  const planned = plan.value;
  found.understood = planned.question;
  found.planned = planned.planned;
  const retold =
    found.sheets.length === 0 && planned.question && fold(planned.question) !== fold(question);
  const [again, wider] = await Promise.all([
    retold
      ? contextOf(planned.question).catch((err) => {
          if (!isBrainFailure(err)) throw err;
          log.warn({ code: err.code, status: err.status }, 'aide IA : contexte myBrain illisible');
          return null;
        })
      : null,
    searchBrain({
      search: (query, limit) => app.myBrain.search({ ...link, query, limit }),
      sheetByName: async (name) => {
        const sheet = await app.myBrain.sheet({ ...link, name });
        sheetCacheOf(app).set(`${brain.url}\n${sheet.path}`, { at: Date.now(), sheet });
        return sheet;
      },
      readSheet: (path) => projectSheet(app, brain, path),
      isBrainFailure,
      names: planned.names,
      topics: planned.topics,
      // La fiche du projet est déjà jointe à part (<projet>) : pas deux fois.
      known: session.project ? [session.project.path] : [],
    }),
  ]);
  if (again?.sheets.length) {
    found.knowledge = again.context;
    found.sheets = again.sheets;
  }

  const given = new Set(found.sheets.map((sheet) => sheet.path));
  const extra = wider.sheets.filter((sheet) => !given.has(sheet.path));
  if (extra.length) {
    const room = found.knowledge ? EXTRA_SHEET_CHARS : LONE_SHEET_CHARS;
    found.knowledge = [
      extra.map((sheet) => `## ${sheet.title}\n${sheet.content.slice(0, room)}`).join('\n\n'),
      found.knowledge,
    ]
      .filter(Boolean)
      .join('\n\n');
    found.sheets = [
      ...extra.map((sheet) => ({ path: sheet.path, title: sheet.title })),
      ...found.sheets,
    ];
  }
  found.matched = wider.matched;
  return found;
}

/**
 * Un nom — celui d'un tag, ou celui que le modèle a entendu — vers la fiche
 * du projet. myBrain tranche : une fiche sûre, ou des candidats.
 *
 * @returns {Promise<{project: {path: string, title: string}|null,
 *   candidates: {path: string, title: string}[]}>}
 * @throws {MyBrainError} toute panne autre que « introuvable »
 */
export async function resolveProject(app, brain, name) {
  try {
    const sheet = await app.myBrain.sheet({ url: brain.url, apiKey: brain.apiKey, name });
    sheetCacheOf(app).set(`${brain.url}\n${sheet.path}`, { at: Date.now(), sheet });
    return { project: { path: sheet.path, title: sheet.title || name }, candidates: [] };
  } catch (err) {
    if (err instanceof MyBrainError && err.code === 'mybrain_not_found') {
      return { project: null, candidates: err.candidates.slice(0, 6) };
    }
    throw err;
  }
}

const resume = (app) => app.db.collection('resume');

/** Ce qui fait qu'un mot continue : une lettre, un chiffre. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Le passage à corriger est-il dans la transcription ? Même lecture que
 * l'écran, qui fera la correction (src/utils/transcriptReplace.js) : mot
 * ENTIER, casse, accents et espaces indifférents.
 *
 * La question elle-même est écartée : dictée, elle est la dernière phrase de
 * la transcription, et « remplace Market par Marquet » y trouverait toujours
 * « Market » — l'IA dirait avoir corrigé ce qui n'existe nulle part ailleurs.
 *
 * @param {string} transcript - la transcription jointe à la question
 * @param {string} find - le passage que le modèle veut remplacer
 * @param {string} [question]
 */
export function saidInMeeting(transcript, find, question = '') {
  const needle = foldKey(find);
  if (!needle) return false;
  let hay = foldKey(transcript);
  const asked = foldKey(question);
  const at = asked ? hay.lastIndexOf(asked) : -1;
  if (at >= 0) hay = `${hay.slice(0, at)} ${hay.slice(at + asked.length)}`;
  for (let from = hay.indexOf(needle); from >= 0; from = hay.indexOf(needle, from + 1)) {
    const before = hay[from - 1];
    const after = hay[from + needle.length];
    if (!(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after))) return true;
  }
  return false;
}

/** `todo` ne défait ni `now` ni `done` (cf. l'en-tête) ; tout autre verdict fait foi. */
const settle = (previous, verdict) =>
  verdict && !(verdict === 'todo' && previous !== 'todo') ? verdict : previous;

/**
 * L'ordre du jour après un appel au modèle : les états qu'il rend, et les
 * points qu'il a entendus ou qu'on lui a dictés.
 *
 * L'ordre du jour est RELU en base à cet instant : l'appel a duré plusieurs
 * secondes, pendant lesquelles l'utilisateur a pu ajouter ou retirer un point
 * au pupitre. Repartir de la copie lue avant l'appel effacerait son geste.
 *
 * @param {{app: object, email: string, meetingId: string,
 *   session: ReturnType<typeof readSession>,
 *   verdicts: {point: number, state: string}[], heard: string[],
 *   asked?: boolean}} input - `verdicts` numérote les points de `session`
 *   (ceux que le modèle a lus) ; `asked` : ajout DEMANDÉ par quelqu'un, qui
 *   passe outre un retrait antérieur.
 * @returns {Promise<{agenda: {label: string, state: string}[], added: string[],
 *   heardKeys: string[], $set: object}>}
 */
async function nextAgenda({ app, email, meetingId, session, verdicts, heard, asked = false }) {
  const live = readSession(
    await resume(app).findOne(ownerFilter(email, { meetingId }), {
      projection: { _id: 0, aiHelp: 1 },
    }),
  );
  const { agenda: text, added } = addAgendaPoints(live.agenda, heard, {
    skip: asked ? [] : live.agendaHeard,
  });
  const heardKeys = [...new Set([...live.agendaHeard, ...added.map(agendaKey)])].slice(
    -AI_HELP_AGENDA_HEARD_MAX,
  );
  const verdictOf = new Map(verdicts.map((entry) => [entry.point, entry.state]));
  const stateOf = new Map(
    session.agendaState.map((entry, index) => [
      agendaKey(entry.label),
      settle(entry.state, verdictOf.get(index + 1)),
    ]),
  );
  const agenda = agendaPoints(text).map((label) => ({
    label,
    state: stateOf.get(agendaKey(label)) || 'todo',
  }));
  return {
    agenda,
    added,
    heardKeys,
    $set: {
      'aiHelp.agendaState': agenda,
      ...(added.length ? { 'aiHelp.agenda': text, 'aiHelp.agendaHeard': heardKeys } : {}),
    },
  };
}

/** Les points jamais abordés, en une clé : « les mêmes qu'au dernier rappel ? ». */
const todoKey = (agenda) =>
  agenda
    .filter((point) => point.state === 'todo')
    .map((point) => agendaKey(point.label))
    .sort()
    .join('|');

/** Un rappel de fin de réunion est-il dû — des points restent, et on ne vient pas de le dire ? */
function closingDue(last, agenda) {
  const key = todoKey(agenda);
  if (!key) return false;
  if (!last || last.todo !== key) return true;
  return Date.now() - Date.parse(last.at) > CLOSING_AGAIN_MS;
}

/**
 * Ce que le modèle ne doit pas redire : les dernières interventions, et les
 * idées plus anciennes — espacées de dix minutes, elles sortiraient vite des
 * douze dernières, et reviendraient.
 */
function alreadySaid(items) {
  const ideas = items
    .slice(0, -ALREADY_SAID_MAX)
    .filter((item) => item.kind === 'idea')
    .slice(-IDEAS_RECALLED_MAX);
  return [...ideas, ...items.slice(-ALREADY_SAID_MAX)]
    .map((item) => item.title || item.question || '')
    .filter(Boolean);
}

/**
 * Une idée au plus par lecture, et jamais celle qu'on a déjà proposée dite
 * autrement (lib/aiHelp/ideas.js). Les autres interventions passent telles quelles.
 */
function oneNewIdea(entries, items) {
  const proposed = items.filter((item) => item.kind === 'idea').map((item) => item.title);
  let kept = false;
  return entries.filter((entry) => {
    if (entry.kind !== 'idea') return true;
    if (kept || repeatsIdea(entry.title, proposed)) return false;
    kept = true;
    return true;
  });
}

/** Ajoute des interventions à la réunion, une écriture par intervention. */
async function appendItems(app, email, meetingId, items) {
  for (const item of items) {
    await resume(app).updateOne(ownerFilter(email, { meetingId }), {
      $push: { 'aiHelp.items': item },
    });
  }
}

/**
 * Une lecture du passage qui vient d'être dit.
 *
 * @param {{app: object, log: object, email: string, access: object,
 *   meeting: object, before?: string, fresh: string, language?: string}} input
 * @returns {Promise<{items: object[], agenda: object[], project: object|null,
 *   candidates: object[], notice: string}>}
 * @throws {import('../openai.js').UpstreamError} panne du modèle
 */
export async function watchMeeting({
  app,
  log,
  email,
  access,
  meeting,
  before = '',
  fresh,
  language,
  only = null,
  user = { email },
}) {
  const session = readSession(meeting);
  const meetingId = meeting.meetingId;
  // `only` : une relecture limitée à un domaine (cf. la fin de la fonction).
  const on = (key) =>
    (!only || key === only) && session.domains[key] === true && access.domains[key] === true;
  // Le domaine ÉCOUTE dès qu'il est allumé : un ordre du jour peut naître de ce
  // qui se dit, il n'a pas besoin d'avoir été saisi.
  const tracksAgenda = on('agenda');
  const known = tracksAgenda ? session.agendaState : [];
  // Le rappel de fin suppose des points DÉJÀ connus avant ce passage : ceux
  // qu'on vient d'annoncer ne peuvent pas être « oubliés » dans la même phrase.
  const mayClose = tracksAgenda && access.pace !== 'quiet' && known.length > 0;
  const wantsProject = on('project') && access.brain !== null;
  const needProject = wantsProject && !session.project && !session.projectDeclined;
  const unchanged = {
    items: [],
    agenda: session.agendaState,
    project: null,
    candidates: [],
    notice: '',
  };

  if (session.items.length >= AI_HELP_ITEMS_MAX) return unchanged;

  let notice = '';
  let sheet = null;
  if (wantsProject && session.project) {
    try {
      sheet = await projectSheet(app, access.brain, session.project.path);
    } catch (err) {
      if (!(err instanceof MyBrainError)) throw err;
      notice = await brainFailed(app, log, err, 'fiche du projet illisible');
    }
  }

  // Une idée n'est DEMANDÉE que lorsqu'elle est permise — assez de réunion
  // derrière, assez de temps depuis la dernière, et jamais en « Discrètes ».
  // Sinon sa consigne n'entre pas dans le prompt, et une seule boîte à idées
  // allumée ne coûte aucun appel.
  const ideas =
    on('ideas') &&
    ideaDue({
      pace: access.pace,
      items: session.items,
      lookedAt: session.ideasLookedAt,
      material: before.length + fresh.length,
    });
  const domains = { project: sheet !== null, agenda: tracksAgenda, ideas };
  if (!domains.project && !domains.agenda && !domains.ideas && !needProject) {
    return { ...unchanged, notice };
  }

  // Le dossier de la réunion — le contexte de SON tag, relu sous le compte du
  // demandeur (lib/tagContext.js) — lu EN MÊME TEMPS que le reste : il
  // n'ajoute aucune attente, et une réunion sans domaine actif, sortie plus
  // haut, ne le lit pas.
  const [asking, dossier] = await Promise.all([
    whoIsAsking(app, user),
    readTagContext(app, email, meeting.tagId),
  ]);
  const raw = await app.openai.chat({
    model: app.config.openai.models.aiHelp,
    // Juger qu'une idée sert vraiment — et qu'aucun participant ne l'a eue —
    // demande plus qu'un repérage : un effort de plus, mais au plus une lecture
    // toutes les deux minutes (`IDEA_LOOK_MS`).
    reasoningEffort: ideas ? 'medium' : 'low',
    messages: [
      {
        role: 'user',
        content: watchPrompt({
          wakeWord: access.wakeWord,
          language,
          pace: access.pace,
          domains,
          project: sheet
            ? { title: sheet.title || session.project.title, content: sheet.content }
            : null,
          needProject,
          agenda: known,
          closing: mayClose,
          orgContext: asking.orgContext,
          user: asking.user,
          dossier,
          notes: typeof meeting.notes === 'string' ? meeting.notes : '',
          already: alreadySaid(session.items),
          before,
          fresh,
        }),
      },
    ],
  });
  const parsed = parseWatchOutput(raw, {
    domains,
    agendaSize: known.length,
    closing: mayClose,
  });

  const next = tracksAgenda
    ? await nextAgenda({
        app,
        email,
        meetingId,
        session,
        verdicts: parsed.agenda,
        heard: parsed.agendaNew,
      })
    : { agenda: session.agendaState, added: [], heardKeys: session.agendaHeard, $set: {} };
  const { agenda } = next;

  // La réunion se termine : le rappel part s'il reste des points jamais
  // abordés et qu'on ne vient pas de le dire. Sinon — tout est traité, ou c'est
  // déjà dit — ce que le modèle écrit sur l'ordre du jour à ce moment est jeté.
  const closing = parsed.ending && closingDue(session.closing, agenda);
  const kept = oneNewIdea(parsed.items, session.items).filter(
    (entry) => entry.kind !== 'agenda' || (agenda.length > 0 && (!parsed.ending || closing)),
  );
  const closingIndex = closing ? kept.findIndex((entry) => entry.kind === 'agenda') : -1;

  const room = AI_HELP_ITEMS_MAX - session.items.length;
  const items = kept.slice(0, room).map((entry, index) =>
    newItem({
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      quote: entry.quote,
      source: entry.kind === 'alert' ? session.project : null,
      points: entry.kind === 'agenda' ? agenda : undefined,
      event: index === closingIndex ? 'closing' : undefined,
    }),
  );
  // Le modèle a vu la fin sans rien écrire : la liste des points parle pour lui.
  if (closing && closingIndex < 0 && items.length < room) {
    items.push(newItem({ kind: 'agenda', event: 'closing', points: agenda }));
  }
  const closed = items.some((item) => item.event === 'closing');
  // Des points viennent d'être retenus : l'IA le dit, pour qu'on puisse la
  // corriger. Placée AVANT les autres — la scène montre la plus récente, et
  // une alerte passe devant un accusé de réception.
  if (next.added.length && items.length < room) {
    items.unshift(newItem({ kind: 'agenda', event: 'noted', points: agenda }));
  }

  // Le projet, tant qu'on ne le connaît pas : un nom entendu, demandé une fois
  // à myBrain — le même nom non résolu n'est pas redemandé à chaque passage.
  let project = null;
  let candidates = [];
  const guess = fold(parsed.project);
  if (needProject && guess && guess !== session.lastGuess) {
    try {
      ({ project, candidates } = await resolveProject(app, access.brain, parsed.project));
    } catch (err) {
      if (!(err instanceof MyBrainError)) throw err;
      log.warn({ code: err.code, status: err.status }, 'aide IA : projet non résolu');
      notice = notice || err.code;
    }
  }

  await resume(app).updateOne(ownerFilter(email, { meetingId }), {
    $set: {
      ...next.$set,
      ...(closed
        ? { 'aiHelp.closing': { at: new Date().toISOString(), todo: todoKey(agenda) } }
        : {}),
      ...(guess && needProject ? { 'aiHelp.lastGuess': guess } : {}),
      ...(ideas ? { 'aiHelp.ideasLookedAt': new Date().toISOString() } : {}),
      ...(project ? { 'aiHelp.project': { ...project, source: 'guess' } } : {}),
    },
    $inc: { 'aiHelp.calls.watch': 1 },
  });
  await appendItems(app, email, meetingId, items);

  // Le projet vient d'être reconnu : ce passage a donc été lu SANS sa fiche.
  // On le relit aussitôt contre elle, pour le seul garde-fou du projet — sinon
  // une contradiction dite pendant qu'on cherchait le projet passerait
  // inaperçue, et elle ne serait jamais relue. Un appel de plus, une fois par
  // réunion. Son échec ne défait pas la première lecture.
  let late = [];
  if (project && !only) {
    try {
      const again = await watchMeeting({
        app,
        log,
        email,
        access,
        meeting: await resume(app).findOne(ownerFilter(email, { meetingId })),
        before,
        fresh,
        language,
        only: 'project',
        user,
      });
      late = again.items;
      notice = notice || again.notice;
    } catch (err) {
      log.warn({ status: err?.status }, 'aide IA : relecture avec la fiche en échec');
    }
  }

  return {
    items: [...items.map((item) => publicItem(item)), ...late],
    agenda: withHeard(agenda, next.heardKeys),
    project: project ? { ...project, source: 'guess' } : null,
    candidates,
    notice,
  };
}

/**
 * La réponse à une question posée à l'IA.
 *
 * ── Questions-réponses coupées : les gestes restent (2026-11-14) ─────────────
 * « Alfred, … » est la seule façon de lui parler, à voix haute ou par écrit :
 * poser un tag, noter, mettre en pause, terminer, dicter l'ordre du jour
 * passent par cette fonction comme une question. Quand le domaine `qa` les
 * gardait toutes, couper les RÉPONSES coupait aussi les GESTES, sans que
 * l'écran le dise (« Répond à « Alfred, … » »). Désormais, `answers` faux :
 * ni myBrain ni historique, une consigne qui n'autorise que les gestes, et une
 * demande qui n'en est pas un rend `declined` — la route en fait le 409 qui
 * disait déjà « questions-réponses coupées ». Le modèle tranche, et l'appel
 * est compté : une règle écrite ne sait pas qu'« Alfred, on fait une pause ? »
 * est un geste et « Alfred, c'est quoi la pause ? » une question.
 *
 * @param {{app: object, log: object, email: string, access: object,
 *   meeting: object, question: string, voice?: boolean, transcript?: string,
 *   language?: string, templates?: string[], paused?: boolean,
 *   answers?: boolean}} input -
 *   `templates` et `paused` viennent de l'ÉCRAN, qui tient les templates
 *   proposés et l'état de l'enregistrement : ils ne servent qu'à vérifier un
 *   geste que ce même écran fera. `answers` : le domaine des questions-réponses
 *   est ouvert à cette réunion — faux, elle ne fait que les gestes.
 * @returns {Promise<{item: object|null, notice: string, agenda: object[]|null,
 *   actions: object[], reminders: object[], timer?: object|null,
 *   declined?: boolean}>} `item` null :
 *   rien à afficher — une panne si `actions` est vide aussi. `agenda` : l'ordre
 *   du jour, quand la réponse l'a touché ; sinon null. `actions` : ce que
 *   l'écran doit faire (poser un tag, écrire une note, fermer la fenêtre,
 *   mettre en pause, terminer, rédiger le compte rendu, corriger la
 *   transcription). `reminders` : les rappels posés, à faire sonner à leur
 *   heure. `timer` : présent seulement si la demande a touché au minuteur — ce
 *   qu'il vaut désormais (ce qui lui reste), ou `null` : arrêté.
 *   `declined` : une question, alors que les réponses sont coupées.
 * @throws {import('../openai.js').UpstreamError} panne du modèle
 */
export async function answerQuestion({
  app,
  log,
  email,
  access,
  meeting,
  question,
  voice = false,
  transcript = '',
  language,
  user = { email },
  tags = [],
  templates = [],
  paused = false,
  answers = true,
}) {
  const session = readSession(meeting);
  const tracksAgenda = session.domains.agenda && access.domains.agenda === true;
  const known = tracksAgenda ? session.agendaState : [];
  // Lus d'abord, ensemble : le vocabulaire de l'organisation et les noms du
  // dossier (le tag de la réunion) servent à préparer la recherche. Un geste
  // seul (questions-réponses coupées) ne lit pas le dossier.
  const [asking, dossier] = await Promise.all([
    whoIsAsking(app, user),
    answers ? readTagContext(app, email, meeting.tagId) : null,
  ]);
  const notes = typeof meeting.notes === 'string' ? meeting.notes : '';
  // Un geste ne se cherche pas dans myBrain : sans réponses, rien n'y est lu.
  const found = await gatherKnowledge({
    app,
    log,
    brain: answers ? access.brain : null,
    session,
    user,
    question,
    transcript,
    // Les noms que la réunion connaît déjà : le projet, les tags du compte, les
    // fiches que les réponses précédentes ont citées.
    vocabulary: [
      ...(session.project ? [session.project.title] : []),
      // Les acteurs et sigles du dossier : « Bernar », dicté, se cherche
      // « Bernard » dans myBrain.
      ...tagContextTerms(dossier?.context),
      ...tags.map((tag) => tag.label),
      ...session.items.map((item) => item.source?.title).filter(Boolean),
    ],
    notes,
    orgContext: asking.orgContext,
  });
  const { knowledge, sheets, notice } = found;
  const history = answers
    ? session.items
        .filter((item) => item.kind === 'answer' && item.question && item.body)
        .slice(-HISTORY_TURNS)
        .map((item) => ({ question: item.question, answer: item.body }))
    : [];

  const raw = await app.openai.chat({
    model: app.config.openai.models.aiHelp,
    reasoningEffort: 'low',
    messages: [
      {
        role: 'user',
        content: answerPrompt({
          wakeWord: access.wakeWord,
          language,
          question,
          voice,
          knowledge,
          sheets,
          project: found.project,
          history,
          agenda: known,
          agendaOn: tracksAgenda,
          tags: tags.map((tag) => tag.label),
          templates,
          paused,
          timer: session.timer
            ? { left: timerLeft(session.timer), label: session.timer.label }
            : null,
          // Les actions déjà relevées, telles que le panneau les montre.
          actions: (Array.isArray(meeting.actions) ? meeting.actions : []).filter(
            (action) =>
              action &&
              action.show !== false &&
              typeof action.title === 'string' &&
              action.title.trim(),
          ),
          orgContext: asking.orgContext,
          user: { ...asking.user, sheet: found.person },
          dossier,
          notes,
          transcript,
          wiki: access.brain !== null,
          understood: found.understood,
          matched: found.matched,
          answers,
        }),
      },
    ],
  });
  const parsed = parseAnswerOutput(raw, {
    agendaOn: tracksAgenda,
    agendaSize: known.length,
    commandsOnly: !answers,
  });
  // La question portait sur l'ordre du jour : ce que le modèle en dit est
  // gardé — les états qu'il vient de relire, les points qu'on lui a dictés.
  const next =
    parsed.answer && (parsed.agenda.length || parsed.agendaAdd.length)
      ? await nextAgenda({
          app,
          email,
          meetingId: meeting.meetingId,
          session,
          verdicts: parsed.agenda,
          heard: parsed.agendaAdd,
          asked: true,
        })
      : null;
  await resume(app).updateOne(ownerFilter(email, { meetingId: meeting.meetingId }), {
    ...(next ? { $set: next.$set } : {}),
    // La préparation de la recherche est un appel de plus au modèle : compté à part.
    $inc: { 'aiHelp.calls.ask': 1, ...(found.planned ? { 'aiHelp.calls.plan': 1 } : {}) },
  });

  // Les gestes demandés : vérifiés ici, exécutés par myBrief (cf. l'en-tête).
  // `acts` : ce qui est gardé sur la réponse et dit à l'écran ; `actions` : ce
  // que l'écran doit faire maintenant.
  const acts = [];
  const actions = [];
  const reminders = [];
  // Le minuteur vit sur la réunion : le geste est fait ICI, l'écran s'y conforme.
  let timer = session.timer;
  let timerTouched = false;
  for (const action of parsed.actions) {
    if (action.type === 'tag') {
      // Le nom tel qu'on l'a dit, ou — s'il n'en désigne qu'un — celui qui se
      // prononce pareil : « Atlasse » pose le tag Atlas (soundsLike.js).
      const label = closestName(
        tags.map((known) => known.label),
        action.name,
      );
      const tag = label ? tags.find((known) => known.label === label) : undefined;
      acts.push(
        tag
          ? { type: 'tag', label: tag.label, tagId: tag.id, ok: true }
          : { type: 'tag', label: action.name, ok: false },
      );
      if (tag) actions.push({ type: 'tag', tagId: tag.id });
    } else if (action.type === 'note') {
      acts.push({ type: 'note', text: action.text });
      actions.push({ type: 'note', text: action.text });
    } else if (action.type === 'reminder') {
      acts.push({ type: 'reminder', minutes: action.minutes, label: action.label });
      reminders.push(
        newItem({
          kind: 'reminder',
          title: action.label,
          dueAt: new Date(Date.now() + action.minutes * 60_000).toISOString(),
        }),
      );
    } else if (action.type === 'timer') {
      const moved = moveTimer(timer, action);
      acts.push(moved.act);
      if (moved.touched) {
        timer = moved.timer;
        timerTouched = true;
      }
    } else if (action.type === 'close') {
      actions.push({ type: 'close' });
    } else if (action.type === 'size') {
      // La taille de la fenêtre est un réglage de l'ÉCRAN : rien à garder ici.
      actions.push({ type: 'size', direction: action.direction });
    } else if (action.type === 'meeting') {
      // « Pause » sur une réunion en pause, « reprends » sur une réunion qui
      // tourne : rien à faire, et la réponse le dit plutôt que de le taire.
      const ok = action.do === 'end' || (action.do === 'resume') === paused;
      acts.push({ type: 'meeting', do: action.do, ok });
      if (ok) actions.push({ type: 'meeting', do: action.do });
    } else if (action.type === 'summary') {
      // Sans nom : le template déjà choisi à l'écran. Avec un nom qu'aucun
      // template ne porte : rien ne part — on ne termine pas une réunion sur
      // un nom mal transcrit.
      const template = action.template
        ? (closestName(templates, action.template) ?? undefined)
        : undefined;
      const ok = !action.template || template !== undefined;
      const named = template || action.template;
      acts.push({ type: 'summary', template: named, when: action.when, ok });
      if (ok) actions.push({ type: 'summary', template: named, when: action.when });
    } else if (action.type === 'replace') {
      const ok = saidInMeeting(transcript, action.find, question);
      acts.push({ ...action, ok });
      if (ok) actions.push(action);
    }
  }
  if (!answers && !parsed.command && !acts.length && !actions.length) {
    // Une question, alors que les réponses sont coupées : rien n'est gardé, la
    // route dit pourquoi elle ne répond pas.
    return { item: null, notice: '', agenda: null, actions: [], reminders: [], declined: true };
  }
  const room = Math.max(0, AI_HELP_ITEMS_MAX - session.items.length);
  const kept = reminders.slice(0, Math.max(0, room - 1));
  if (!parsed.answer && !acts.length) {
    // Rien à dire, rien de fait — sauf, peut-être, « ferme ta fenêtre ».
    return { item: null, notice, agenda: null, actions, reminders: [] };
  }

  // Le titre que cite le modèle n'est cru que s'il désigne une fiche que
  // myBrain a réellement rendue : celles du contexte, ou celle du projet.
  const citable = [...sheets, ...(found.project && session.project ? [session.project] : [])];
  const source = parsed.source
    ? citable.find((sheet) => fold(sheet.title) === fold(parsed.source)) || null
    : null;
  // « myBrain avait de quoi répondre » : des fiches sur la question, ou celle
  // du projet. La fiche de la PERSONNE n'en fait pas partie — elle est jointe à
  // toutes ses questions, et la compter masquait « myBrain n'a rien sur cette
  // question » chaque fois que le compte avait sa fiche (recette, 2026-11-12).
  const offered = sheets.length > 0 || found.project !== null;
  const item = newItem({
    kind: 'answer',
    question,
    voice,
    body: parsed.answer,
    source,
    acts,
    // L'ordre du jour s'affiche sous la réponse qui en parle.
    points: next && next.agenda.length ? next.agenda : undefined,
    // Ce que myBrain a apporté — dit sur la carte (cf. KNOWLEDGE_STATES). Un
    // geste, réponses coupées : myBrain n'a pas été lu, la carte n'en dit rien.
    knowledge: !answers
      ? 'none'
      : !access.brain
        ? NO_BRAIN_KNOWLEDGE[access.brainReason] || 'none'
        : notice
          ? 'down'
          : source
            ? 'used'
            : offered
              ? 'offered'
              : 'empty',
  });
  if (room > 0) await appendItems(app, email, meeting.meetingId, [item, ...kept]);
  if (timerTouched) {
    await resume(app).updateOne(ownerFilter(email, { meetingId: meeting.meetingId }), {
      $set: { 'aiHelp.timer': timer },
    });
  }
  return {
    item: publicItem(item),
    notice,
    agenda: next ? withHeard(next.agenda, next.heardKeys) : null,
    actions,
    reminders: kept.map((reminder) => publicItem(reminder)),
    ...(timerTouched ? { timer: publicTimer(timer) } : {}),
  };
}
