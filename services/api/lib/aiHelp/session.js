/**
 * Aide IA d'une réunion — ce qu'elle laisse sur le document `resume`, et qui y
 * a droit.
 *
 * ── Le sous-document `aiHelp` d'une réunion ──────────────────────────────────
 *   { enabled, domains, agenda,             le réglage de CETTE réunion
 *     project: { path, title, source },     la fiche myBrain du projet, ou null
 *     projectDeclined,                      « sans projet » : ne plus demander
 *     lastGuess,                            dernier nom entendu et non résolu
 *     agendaState: [{ label, state }],      l'ordre du jour, tel que suivi
 *     agendaHeard: [clé, …],                points que l'IA ne (re)met pas d'elle-même
 *     closing: { at, todo },                dernier rappel de fin de réunion
 *     ideasLookedAt,                        dernière lecture qui a demandé une idée
 *                                           (lib/aiHelp/ideas.js)
 *     items: [{ id, kind, at, … }],         les interventions, dans l'ordre —
 *                                           dont les rappels (`reminder`), qui
 *                                           portent leur échéance (`dueAt`)
 *     states: { <id>: 'acknowledged' },     ce que l'utilisateur en a fait
 *     timer: { endsAt, seconds, label },    le minuteur qui tourne, ou null
 *                                           (lib/aiHelp/timer.js)
 *     calls: { watch, ask } }               appels au modèle (coût, plus tard)
 *
 * Les interventions RESTENT avec la réunion — relisibles dans l'historique —
 * mais n'entrent dans aucun compte rendu : ni /resume ni le dépôt dans myBrain
 * ne lisent ce sous-document. C'est une décision de produit, pas un oubli.
 *
 * `states` est une table à part, et non un champ de chaque intervention : une
 * intervention s'ajoute par `$push` pendant que l'utilisateur en acquitte une
 * autre, et réécrire le tableau entier pour changer un état en perdrait une.
 * L'identifiant sert de CLÉ de champ Mongo : il est produit ici, en
 * hexadécimal, et revérifié (`ITEM_ID_PATTERN`) avant tout usage venu d'un
 * corps de requête.
 *
 * ── L'ordre du jour : un texte, et deux mémoires ─────────────────────────────
 * `agenda` reste UN texte, un point par ligne, quelle que soit l'origine d'un
 * point — saisi avant la réunion, ajouté au pupitre, ou annoncé à voix haute et
 * retenu par l'IA. `agendaHeard` garde les clés (`agendaKey`) des points venus
 * de la réunion ET de ceux que l'utilisateur a retirés : l'IA ne remet jamais
 * d'elle-même un point qu'on lui a ôté, même si on le redit. À l'écran, un
 * point présent dont la clé y figure porte la marque « entendu ».
 * `closing` retient le dernier rappel de fin de réunion (cf. engine.js) : on ne
 * redit pas les mêmes points oubliés à chaque « merci, au revoir ».
 *
 * ── Qui y a droit : `aiHelpAccess` ───────────────────────────────────────────
 * Trois étages, tous nécessaires : le domaine est proposé par l'installation
 * (Administration → Aide IA), le groupe du compte a le droit « Aide IA », et —
 * pour ce qui lit myBrain — le droit « avec myBrain » ET une clé myBrain qui
 * porte « lire ». La lecture ne dépend PAS de la politique d'envoi des
 * réunions (`off` / `optin` / `forced`) : nourrir le cerveau et le consulter
 * sont deux décisions.
 *
 * Quand myBrain n'est pas lu, `brainReason` dit POURQUOI — l'écran le répète
 * tel quel. Sans cela, « l'IA ne cherche pas dans myBrain » avait quatre causes
 * possibles et aucune n'était visible (recette, 2026-11-12).
 *
 * ── Les droits de la clé sont une PHOTO ──────────────────────────────────────
 * `verified.droits` date du dernier test de connexion. Une clé créée pour
 * nourrir le cerveau, à laquelle un administrateur de myBrain AJOUTE ensuite
 * « lire », garde ici son ancienne photo : myBrief concluait « pas de lecture »
 * sans jamais reposer la question. `refreshMyBrainRights` la repose à myBrain —
 * de lui-même quand un compte qui a droit à myBrain bute sur une clé « sans
 * lire » (au plus toutes les dix minutes), et à chaque fois qu'un
 * administrateur ouvre l'onglet Aide IA.
 */
import { randomUUID } from 'node:crypto';
import { MyBrainError } from '../myBrain/client.js';
import { normalizeMyBrainUrl } from '../repositories/myBrainSettings.js';
import { TIMER_MOVES, publicTimer, readTimer } from './timer.js';
import {
  AI_HELP_AGENDA_HEARD_MAX,
  AI_HELP_DOMAINS,
  AI_HELP_MYBRAIN_DOMAIN,
  agendaKey,
  agendaPoints,
  normalizeAgenda,
  normalizeDomains,
} from './domains.js';

/** Interventions gardées par réunion : au-delà, les lectures ne produisent plus rien. */
export const AI_HELP_ITEMS_MAX = 120;

export const ITEM_ID_PATTERN = /^[a-f0-9]{32}$/;
export const ITEM_STATES = ['open', 'acknowledged', 'dismissed'];
export const ITEM_KINDS = ['alert', 'agenda', 'idea', 'answer', 'reminder'];

/**
 * Ce que l'IA a FAIT à la demande, gardé sur la réponse : l'écran l'énonce
 * lui-même (« Tag … posé », « Note ajoutée »…) au lieu de croire la phrase du
 * modèle, qui peut annoncer un tag qui n'existe pas.
 *   tag       { label, tagId, ok }   `ok` faux : aucun tag du compte ne porte ce nom
 *   note      { text }
 *   reminder  { minutes, label }
 *   timer     { do, seconds, left, label, ok }  le minuteur : lancé (`seconds`,
 *                                    sa durée), rallongé ou raccourci
 *                                    (`seconds`, l'écart ; `left`, ce qui
 *                                    reste), arrêté ; `ok` faux : aucun
 *                                    minuteur ne tournait
 *   meeting   { do, ok }             pause, reprise, fin ; `ok` faux : rien à
 *                                    faire (déjà en pause, ou pas en pause)
 *   summary   { template, when, ok } le compte rendu, tout de suite ou commandé
 *                                    pour la fin ; `ok` faux : aucun template
 *                                    ne porte ce nom
 *   replace   { find, with, all, ok } une correction de la transcription ;
 *                                    `ok` faux : le passage n'y est pas
 */
export const ACT_TYPES = ['tag', 'note', 'reminder', 'timer', 'meeting', 'summary', 'replace'];
export const MEETING_MOVES = ['pause', 'resume', 'end'];
const ACTS_MAX = 4;

/** Les actions d'une réponse, telles qu'on les garde et qu'on les rend. */
function cleanActs(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((act) => act && ACT_TYPES.includes(act.type))
    .slice(0, ACTS_MAX)
    .map((act) => {
      if (act.type === 'tag') {
        return {
          type: 'tag',
          label: String(act.label || '').slice(0, 200),
          ok: act.ok === true,
          ...(act.ok === true ? { tagId: String(act.tagId || '').slice(0, 64) } : {}),
        };
      }
      if (act.type === 'note') return { type: 'note', text: String(act.text || '').slice(0, 600) };
      if (act.type === 'timer') {
        const move = TIMER_MOVES.includes(act.do) ? act.do : 'stop';
        return {
          type: 'timer',
          do: move,
          ok: act.ok === true,
          ...(move === 'stop' ? {} : { seconds: Math.round(Number(act.seconds)) || 0 }),
          ...(move === 'add' && act.ok === true ? { left: Math.round(Number(act.left)) || 0 } : {}),
          ...(act.label ? { label: String(act.label).slice(0, 200) } : {}),
        };
      }
      if (act.type === 'meeting') {
        return {
          type: 'meeting',
          do: MEETING_MOVES.includes(act.do) ? act.do : 'pause',
          ok: act.ok === true,
        };
      }
      if (act.type === 'summary') {
        return {
          type: 'summary',
          template: String(act.template || '').slice(0, 200),
          when: act.when === 'end' ? 'end' : 'now',
          ok: act.ok === true,
        };
      }
      if (act.type === 'replace') {
        return {
          type: 'replace',
          find: String(act.find || '').slice(0, 400),
          with: String(act.with || '').slice(0, 600),
          all: act.all === true,
          ok: act.ok === true,
        };
      }
      return {
        type: 'reminder',
        minutes: Number(act.minutes) || 0,
        label: String(act.label || '').slice(0, 200),
      };
    });
}
const AGENDA_STATES = ['done', 'now', 'todo'];
/**
 * Ce qu'une intervention d'ordre du jour ANNONCE, quand ce n'est pas un oubli
 * signalé en cours de route : `noted` (des points viennent d'être retenus),
 * `closing` (la réunion se termine, il en reste). L'écran en tire le titre
 * quand le modèle n'en a pas écrit — un texte de l'IHM, pas du serveur.
 */
export const AGENDA_EVENTS = ['noted', 'closing'];

/** `[{ label, state }]` → la même liste, chaque point disant s'il vient de la réunion. */
export function withHeard(agenda, heardKeys) {
  const heard = new Set(heardKeys);
  return agenda.map(({ label, state }) => ({ label, state, heard: heard.has(agendaKey(label)) }));
}

/** La clé myBrain de l'installation permet-elle de LIRE le cerveau ? */
export function myBrainReadable(settings) {
  return !!(
    settings?.url &&
    settings?.apiKey &&
    Array.isArray(settings.verified?.droits) &&
    settings.verified.droits.includes('lire')
  );
}

/** Une relecture spontanée des droits de la clé, au plus, par installation et par période. */
const RIGHTS_RECHECK_MS = 10 * 60 * 1000;
/** Elle se fait pendant une requête d'utilisateur : elle n'attend pas longtemps. */
const RIGHTS_RECHECK_TIMEOUT_MS = 5000;
const lastRightsCheck = new WeakMap();

/**
 * Redemande à myBrain les droits de la clé, et corrige ce que myBrief en avait
 * retenu s'ils ont changé (cf. l'en-tête). La clé ne part qu'à l'adresse déjà
 * enregistrée. Une panne de myBrain ne change rien : la photo reste.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{force?: boolean, log?: object}} [options] - `force` : sans attendre
 *   la période (un administrateur regarde, ou myBrain vient de refuser la clé)
 * @returns {Promise<object>} les réglages myBrain, à jour
 */
export async function refreshMyBrainRights(app, { force = false, log } = {}) {
  const connection = await app.myBrainSettings.get();
  if (!connection.url || !connection.apiKey) return connection;
  if (!force && Date.now() - (lastRightsCheck.get(app) || 0) < RIGHTS_RECHECK_MS) return connection;
  lastRightsCheck.set(app, Date.now());
  try {
    const who = await app.myBrain.whoami({
      url: connection.url,
      apiKey: connection.apiKey,
      timeoutMs: RIGHTS_RECHECK_TIMEOUT_MS,
    });
    const known = connection.verified?.droits || [];
    const same = known.length === who.droits.length && who.droits.every((d) => known.includes(d));
    if (same) return connection;
    await app.myBrainSettings.saveVerification({
      application: who.application,
      droits: who.droits,
      publicUrl: normalizeMyBrainUrl(who.api).url || connection.verified?.publicUrl || '',
      at: new Date().toISOString(),
    });
    log?.info?.({ droits: who.droits }, 'aide IA : droits de la clé myBrain relus');
    return app.myBrainSettings.get();
  } catch (err) {
    if (!(err instanceof MyBrainError)) throw err;
    log?.warn?.({ code: err.code, status: err.status }, 'aide IA : droits de la clé non relus');
    return connection;
  }
}

/**
 * Pourquoi l'Aide IA d'un compte lit — ou ne lit pas — myBrain :
 *   ok              elle le lit
 *   not_connected   myBrain n'est pas relié à myBrief
 *   no_read_right   il l'est, mais sa clé n'a pas le droit « lire »
 *   no_group_right  tout est prêt, sauf le droit « avec myBrain » du groupe
 *   no_aihelp       le compte n'a pas l'Aide IA du tout
 * L'ordre va de l'installation au compte : inutile de renvoyer vers les groupes
 * quand c'est la clé qui manque.
 */
export const BRAIN_REASONS = [
  'ok',
  'not_connected',
  'no_read_right',
  'no_group_right',
  'no_aihelp',
];

/**
 * Ce que l'Aide IA peut faire pour CE compte.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{email: string, doc?: object}} user - `req.user`
 * @param {{log?: object}} [options]
 * @returns {Promise<{available: boolean, myBrain: boolean, brainReason: string,
 *   domains: Record<string, boolean>, wakeWord: string, pace: string,
 *   brain: {url: string, apiKey: string, publicUrl: string}|null}>} `brain`
 *   porte la clé EN CLAIR : usage serveur seulement, jamais dans une réponse.
 */
export async function aiHelpAccess(app, user, { log } = {}) {
  const doc = user.doc || (await app.users.findByEmail(user.email));
  const [rights, settings] = await Promise.all([
    app.groups.rightsForUser(doc),
    app.settings.getAiHelp(),
  ]);

  let brain = null;
  let brainReason = 'no_aihelp';
  if (rights.aiHelp) {
    let connection = await app.myBrainSettings.get();
    const connected = !!(connection.url && connection.apiKey);
    // Tout est prêt sauf le « lire » de la clé : la photo est peut-être vieille.
    if (connected && rights.aiHelpMyBrain && !myBrainReadable(connection)) {
      connection = await refreshMyBrainRights(app, { log });
    }
    if (!connected) brainReason = 'not_connected';
    else if (!myBrainReadable(connection)) brainReason = 'no_read_right';
    else if (!rights.aiHelpMyBrain) brainReason = 'no_group_right';
    else {
      brainReason = 'ok';
      brain = {
        url: connection.url,
        apiKey: connection.apiKey,
        publicUrl: connection.verified?.publicUrl || '',
      };
    }
  }

  const domains = {};
  for (const key of AI_HELP_DOMAINS) {
    domains[key] =
      rights.aiHelp === true &&
      settings.domains[key] === true &&
      (key !== AI_HELP_MYBRAIN_DOMAIN || brain !== null);
  }
  const available = AI_HELP_DOMAINS.some((key) => domains[key]);
  return {
    available,
    myBrain: available && brain !== null,
    brainReason: available ? brainReason : 'no_aihelp',
    domains,
    wakeWord: settings.wakeWord,
    pace: settings.pace,
    brain: available ? brain : null,
  };
}

/**
 * Ce que myBrain a apporté à une réponse — dit à l'écran, pour qu'une réponse
 * tirée de la seule réunion ne passe pas pour « myBrain ne sait pas » :
 *   none          myBrain n'est pas relié : personne ne l'attend, rien à dire
 *   no_right      le groupe du compte n'a pas le droit « avec myBrain »
 *   no_key_right  la clé de myBrain n'a pas le droit « lire »
 *   down     myBrain n'a pas répondu
 *   empty    myBrain a répondu, sans rien sur la question
 *   offered  myBrain a fourni de la matière, la réponse ne cite aucune fiche
 *   used     la réponse cite une fiche
 */
export const KNOWLEDGE_STATES = [
  'none',
  'no_right',
  'no_key_right',
  'down',
  'empty',
  'offered',
  'used',
];
const knowledgeState = (value) => (KNOWLEDGE_STATES.includes(value) ? value : 'none');

/** `{ path, title }` d'une fiche, ou `null`. */
function sheetRef(value) {
  if (!value || typeof value.path !== 'string' || !value.path) return null;
  return { path: value.path.slice(0, 400), title: String(value.title || '').slice(0, 200) };
}

/**
 * Le réglage et l'état de l'Aide IA d'une réunion, normalisés — un document
 * sans `aiHelp` rend une Aide IA éteinte, sans intervention.
 * @param {object|null} meeting - document `resume`
 */
export function readSession(meeting) {
  const raw = meeting?.aiHelp && typeof meeting.aiHelp === 'object' ? meeting.aiHelp : {};
  const project = sheetRef(raw.project);
  const points = agendaPoints(raw.agenda);
  const known = Array.isArray(raw.agendaState) ? raw.agendaState : [];
  const agendaHeard = (Array.isArray(raw.agendaHeard) ? raw.agendaHeard : [])
    .filter((key) => typeof key === 'string' && key)
    .slice(-AI_HELP_AGENDA_HEARD_MAX);
  const closing =
    raw.closing && typeof raw.closing.at === 'string' && typeof raw.closing.todo === 'string'
      ? { at: raw.closing.at, todo: raw.closing.todo }
      : null;
  return {
    enabled: raw.enabled === true,
    domains: normalizeDomains(raw.domains),
    agenda: normalizeAgenda(raw.agenda),
    project: project ? { ...project, source: String(raw.project.source || 'chosen') } : null,
    projectDeclined: raw.projectDeclined === true,
    lastGuess: typeof raw.lastGuess === 'string' ? raw.lastGuess : '',
    ideasLookedAt: typeof raw.ideasLookedAt === 'string' ? raw.ideasLookedAt : '',
    // L'état suit les points : un point renommé ou ajouté repart de « todo ».
    agendaState: withHeard(
      points.map((label) => {
        const previous = known.find((entry) => entry?.label === label);
        return { label, state: AGENDA_STATES.includes(previous?.state) ? previous.state : 'todo' };
      }),
      agendaHeard,
    ),
    agendaHeard,
    closing,
    items: Array.isArray(raw.items)
      ? raw.items.filter((item) => ITEM_ID_PATTERN.test(item?.id))
      : [],
    states: raw.states && typeof raw.states === 'object' ? raw.states : {},
    // Arrivé à zéro, il n'existe plus : rien à effacer (cf. timer.js).
    timer: readTimer(raw.timer),
  };
}

/**
 * Une intervention prête à être enregistrée.
 * @param {{kind: string, title?: string, body?: string, quote?: string,
 *   question?: string, voice?: boolean, source?: object|null, points?: object[]}} fields
 */
export function newItem({
  kind,
  title = '',
  body = '',
  quote = '',
  question = '',
  voice = false,
  source = null,
  points,
  knowledge,
  event,
  acts,
  dueAt,
}) {
  const done = cleanActs(acts);
  return {
    id: randomUUID().replace(/-/g, ''),
    kind,
    at: new Date().toISOString(),
    title,
    body,
    quote,
    ...(done.length ? { acts: done } : {}),
    // Un rappel : l'heure à laquelle il doit sonner. Avant, l'écran le tait.
    ...(kind === 'reminder' && dueAt ? { dueAt } : {}),
    ...(kind === 'answer'
      ? { question, voice: voice === true, knowledge: knowledgeState(knowledge) }
      : {}),
    source: sheetRef(source),
    // Une PHOTO de l'ordre du jour à cet instant : la carte relue plus tard
    // montre ce que l'IA voyait, pas l'état d'aujourd'hui.
    ...(Array.isArray(points)
      ? { points: points.map(({ label, state }) => ({ label, state })) }
      : {}),
    ...(AGENDA_EVENTS.includes(event) ? { event } : {}),
  };
}

/** Une intervention telle que l'écran la reçoit. */
export function publicItem(item, states = {}) {
  return {
    id: item.id,
    kind: ITEM_KINDS.includes(item.kind) ? item.kind : 'idea',
    at: item.at || null,
    title: String(item.title || ''),
    body: String(item.body || ''),
    quote: String(item.quote || ''),
    ...(cleanActs(item.acts).length ? { acts: cleanActs(item.acts) } : {}),
    ...(item.kind === 'reminder' && typeof item.dueAt === 'string' ? { dueAt: item.dueAt } : {}),
    ...(item.kind === 'answer'
      ? {
          question: String(item.question || ''),
          voice: item.voice === true,
          knowledge: knowledgeState(item.knowledge),
        }
      : {}),
    source: sheetRef(item.source),
    ...(Array.isArray(item.points) ? { points: item.points } : {}),
    ...(AGENDA_EVENTS.includes(item.event) ? { event: item.event } : {}),
    state: ITEM_STATES.includes(states[item.id]) ? states[item.id] : 'open',
  };
}

/**
 * La session telle que l'écran la reçoit. Les domaines sont ceux que la
 * réunion a CHOISIS, croisés avec ce que le compte peut encore : un droit
 * retiré en cours de réunion éteint le domaine à la lecture suivante.
 * @param {ReturnType<typeof readSession>} session
 * @param {{domains: Record<string, boolean>}} access
 */
export function publicSession(session, access) {
  const domains = {};
  for (const key of AI_HELP_DOMAINS) {
    domains[key] = session.domains[key] === true && access.domains[key] === true;
  }
  return {
    enabled: session.enabled,
    domains,
    agenda: session.agenda,
    agendaState: session.agendaState,
    project: session.project,
    projectDeclined: session.projectDeclined,
    items: session.items.map((item) => publicItem(item, session.states)),
    // Ce qui RESTE au minuteur, pas son heure : l'écran a sa propre horloge.
    timer: publicTimer(session.timer),
  };
}
