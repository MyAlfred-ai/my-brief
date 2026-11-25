/**
 * Aide IA d'une réunion, côté utilisateur.
 *
 *   GET  /ai-help              ce que le compte peut faire, ses préférences,
 *                              et ce avec quoi une réunion démarre
 *   POST /ai-help/preferences  Réglages → Aide IA : démarrage, sons, voix
 *   GET  /ai-help/voices       les moteurs de voix proposables — ESSAYÉS
 *   POST /ai-help/speech       dire un texte avec la voix choisie (mp3)
 *   POST /ai-help/session      le réglage de CETTE réunion : allumée ou non,
 *                              domaines, ordre du jour (entier, ou un point
 *                              ajouté / retiré), projet — et l'arrêt du
 *                              minuteur, par son bouton
 *   POST /ai-help/watch        une lecture du passage qui vient d'être dit
 *   POST /ai-help/ask          une question posée à l'IA — ou un geste qu'on
 *                              lui demande (tag, note, rappel, minuteur,
 *                              pause, fin, compte rendu, correction de la
 *                              transcription).
 *                              Questions-réponses coupées : les gestes
 *                              seulement ; une question rend 409
 *                              `ai_help_domain_off`
 *   POST /ai-help/item         acquitter ou écarter une intervention
 *   GET  /ai-help/projects     chercher la fiche d'un projet dans myBrain
 *   POST /ai-help/tag-project  relier un tag à la fiche d'un projet
 *
 * ── Ce que ces routes tiennent ───────────────────────────────────────────────
 * - Le droit se relit à CHAQUE appel (`aiHelpAccess`) : un droit de groupe
 *   retiré pendant une réunion éteint l'Aide IA à la lecture suivante. Un refus
 *   est un 409 — un état de l'installation —, jamais un 401/403 que le
 *   frontend lirait comme une perte de session.
 * - `watch` et `ask` dépensent le modèle de l'installation : ils n'opèrent que
 *   sur une réunion du compte EN COURS d'enregistrement (son quota a été
 *   vérifié au démarrage), et sont plafonnés par compte.
 * - Le projet n'est jamais cru sur parole : un chemin reçu du client est relu
 *   dans myBrain avant d'être enregistré, et c'est le titre que myBrain rend
 *   qui est gardé.
 * - Un geste demandé à l'IA est fait par l'ÉCRAN, jamais ici : la route le
 *   vérifie et le rend (`actions`). `templates` et `paused`, lus dans le corps
 *   d'une question, ne sont donc pas des données qu'on croit — ce sont celles
 *   de l'écran qui fera le geste, bornées par le schéma, et elles ne décident
 *   que de ce que ce même écran s'entendra demander.
 * - Une panne de myBrain pendant une lecture ou une question ne casse rien
 *   (`notice`, cf. lib/aiHelp/engine.js). Quand c'est l'utilisateur qui demande
 *   myBrain — chercher un projet, en choisir un —, elle répond 502 avec son
 *   slug : une panne EN AMONT.
 */
import { requireUser } from '../lib/rbac.js';
import { fail } from '../lib/errors.js';
import { isSameOrigin } from '../lib/auth/originCheck.js';
import { createRateLimiter } from '../lib/auth/rateLimit.js';
import { ownerFilter } from '../lib/ownerScope.js';
import { normalizeLang } from '../lib/text.js';
import { UpstreamError, replyUpstreamError } from '../lib/openai.js';
import { MyBrainError } from '../lib/myBrain/client.js';
import {
  AI_HELP_AGENDA_HEARD_MAX,
  AI_HELP_AGENDA_MAX,
  AI_HELP_AGENDA_POINT_MAX,
  AI_HELP_DOMAINS,
  addAgendaPoints,
  agendaKey,
  normalizeAgenda,
  normalizeDomains,
  removeAgendaPoint,
} from '../lib/aiHelp/domains.js';
import { ACTION_TEMPLATE_MAX, ASK_QUESTION_MAX, ASK_TEMPLATES_MAX } from '../lib/aiHelp/prompts.js';
import {
  ITEM_ID_PATTERN,
  ITEM_STATES,
  aiHelpAccess,
  publicSession,
  readSession,
} from '../lib/aiHelp/session.js';
import { answerQuestion, resolveProject, watchMeeting } from '../lib/aiHelp/engine.js';
import { mergePreferences, preferencesBody } from '../lib/aiHelp/preferences.js';
import { SPEECH_TEXT_MAX, synthesize, voiceCatalog, voiceProblem } from '../lib/aiHelp/voices.js';
import { TAGS_COLLECTION } from './tags.js';

/** Types de fiche myBrain qu'une réunion peut prendre pour « projet ». */
const PROJECT_TYPES = ['projet', 'chantier'];
const PROJECTS_MAX = 8;

const meetingId = { type: 'string', minLength: 1, maxLength: 64 };
const domainFlags = {
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(AI_HELP_DOMAINS.map((key) => [key, { type: 'boolean' }])),
};
/** Transcription jointe à une lecture ou à une question : bornée au transport, recoupée dans le prompt. */
const transcriptText = { type: 'string', maxLength: 60_000 };

const sessionBody = {
  type: 'object',
  required: ['meetingId'],
  additionalProperties: false,
  properties: {
    meetingId,
    enabled: { type: 'boolean' },
    domains: domainFlags,
    agenda: { type: 'string', maxLength: AI_HELP_AGENDA_MAX * 2 },
    // Un point à la fois, pendant la réunion : le client n'envoie pas la liste
    // entière, qui écraserait un point que l'IA vient de retenir.
    agendaAdd: { type: 'string', minLength: 1, maxLength: AI_HELP_AGENDA_POINT_MAX * 2 },
    agendaRemove: { type: 'string', minLength: 1, maxLength: AI_HELP_AGENDA_POINT_MAX * 2 },
    // Ignoré depuis le 2026-11-13 : le son se coupe pour UNE réunion à
    // l'écran, et se règle pour toutes dans Réglages → Aide IA. Toujours
    // accepté — un onglet resté ouvert sur l'ancienne version l'envoie encore.
    sound: { type: 'boolean' },
    // Le projet : `projectPath` en choisit un ; `projectMode` 'none' = « sans
    // projet » (ne plus demander), 'auto' = oublier le choix et reconnaître.
    projectPath: { type: 'string', minLength: 1, maxLength: 400 },
    projectMode: { type: 'string', enum: ['auto', 'none'] },
    // Le bouton du minuteur : l'arrêter. Le lancer ou le rallonger se DEMANDE à
    // l'IA (`ask`) — l'écran n'a pas de quoi fixer une durée.
    timer: { type: 'string', enum: ['stop'] },
  },
};

const watchBody = {
  type: 'object',
  required: ['meetingId', 'fresh'],
  additionalProperties: false,
  properties: {
    meetingId,
    fresh: { ...transcriptText, minLength: 1 },
    before: transcriptText,
    language: { type: 'string', maxLength: 16 },
  },
};

const askBody = {
  type: 'object',
  required: ['meetingId', 'question'],
  additionalProperties: false,
  properties: {
    meetingId,
    question: { type: 'string', minLength: 1, maxLength: ASK_QUESTION_MAX },
    voice: { type: 'boolean' },
    transcript: transcriptText,
    language: { type: 'string', maxLength: 16 },
    // Les templates de compte rendu que l'écran propose, par leur nom : l'IA
    // n'en commande qu'un qui s'y trouve.
    templates: {
      type: 'array',
      maxItems: ASK_TEMPLATES_MAX,
      items: { type: 'string', maxLength: ACTION_TEMPLATE_MAX },
    },
    // La réunion est en pause : « reprends » n'a de sens que là.
    paused: { type: 'boolean' },
  },
};

const speechBody = {
  type: 'object',
  required: ['text', 'provider', 'model', 'voice'],
  additionalProperties: false,
  properties: {
    text: { type: 'string', minLength: 1, maxLength: SPEECH_TEXT_MAX },
    // La synthèse du navigateur ne passe jamais par ici.
    provider: { type: 'string', enum: ['openai', 'mistral'] },
    model: { type: 'string', minLength: 1, maxLength: 80 },
    voice: { type: 'string', minLength: 1, maxLength: 80 },
    language: { type: 'string', maxLength: 16 },
    // La réunion qui parle : ses caractères lus y sont comptés. Absente : un
    // « Écouter » des Réglages.
    meetingId,
  },
};

const itemBody = {
  type: 'object',
  required: ['meetingId', 'itemId', 'state'],
  additionalProperties: false,
  properties: {
    meetingId,
    itemId: { type: 'string', minLength: 32, maxLength: 32 },
    state: { type: 'string', enum: ITEM_STATES },
  },
};

const projectsQuery = {
  type: 'object',
  properties: { q: { type: 'string', maxLength: 120 } },
};

const tagProjectBody = {
  type: 'object',
  required: ['tagId'],
  additionalProperties: false,
  properties: {
    tagId: { type: 'string', minLength: 1, maxLength: 64 },
    // Absent ou vide : délier.
    path: { type: 'string', maxLength: 400 },
  },
};

/** Champs d'une réunion dont l'Aide IA a besoin — jamais sa transcription ni son compte rendu. */
const MEETING_FIELDS = {
  _id: 0,
  meetingId: 1,
  status: 1,
  tagId: 1,
  notes: 1,
  actions: 1,
  aiHelp: 1,
};

export default function aiHelpRoutes(app) {
  const limits = app.config.rateLimits;
  const watchByAccount = createRateLimiter(limits.aiHelpWatchByAccount);
  const askByAccount = createRateLimiter(limits.aiHelpAskByAccount);
  const projectsByAccount = createRateLimiter(limits.aiHelpProjectsByAccount);
  const speechByAccount = createRateLimiter(limits.aiHelpSpeechByAccount);
  const voicesByAccount = createRateLimiter(limits.aiHelpVoicesByAccount);
  app.addHook('onClose', async () => {
    watchByAccount.stop();
    askByAccount.stop();
    projectsByAccount.stop();
    speechByAccount.stop();
    voicesByAccount.stop();
  });

  const resume = () => app.db.collection('resume');
  const tags = () => app.db.collection(TAGS_COLLECTION);
  const findMeeting = (email, id) =>
    resume().findOne(ownerFilter(email, { meetingId: id }), { projection: MEETING_FIELDS });

  /** Refus de plafond, ou `false`. */
  function overLimit(limiter, user, reply) {
    const quota = limiter.hit(user.emailLower);
    if (quota.allowed) return false;
    fail(reply, 429, 'too_many_requests', { retryAfter: quota.retryAfterSec });
    return true;
  }

  /** Une panne de myBrain demandée par l'utilisateur : 502 et son slug. */
  const upstreamBrain = (reply, err) =>
    fail(reply, 502, err.code || 'mybrain_error', err.details());

  app.get('/ai-help', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    const [access, preferences] = await Promise.all([
      aiHelpAccess(app, user, { log: req.log }),
      app.userActions.getAiHelpPreferences(user.email),
    ]);
    const startDomains = {};
    for (const key of AI_HELP_DOMAINS) {
      startDomains[key] = preferences.start.domains[key] === true && access.domains[key] === true;
    }
    return {
      available: access.available,
      myBrain: access.myBrain,
      // Pourquoi myBrain est lu, ou ne l'est pas : l'écran le dit tel quel.
      myBrainReason: access.brainReason,
      domains: access.domains,
      wakeWord: access.available ? access.wakeWord : '',
      // Où ouvrir une fiche citée — l'adresse que myBrain annonce pour lui-même.
      myBrainUrl: access.brain?.publicUrl || '',
      // Ce avec quoi une réunion démarre : les préférences du compte, bornées
      // à ce qu'il peut utiliser. Sans préférence enregistrée : tout allumé.
      defaults: {
        enabled: access.available && preferences.start.enabled,
        domains: startDomains,
      },
      preferences,
    };
  });

  /**
   * Réglages → Aide IA. Tout champ est facultatif ; un moteur de voix
   * incohérent (modèle inconnu, voix d'un autre modèle) est refusé en 400 —
   * l'écran ne le propose pas, un client qui l'envoie quand même se trompe.
   */
  app.post(
    '/ai-help/preferences',
    { schema: { body: preferencesBody(AI_HELP_DOMAINS) } },
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return undefined;
      if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');
      const access = await aiHelpAccess(app, user, { log: req.log });
      if (!access.available) return fail(reply, 409, 'ai_help_not_allowed');
      const current = await app.userActions.getAiHelpPreferences(user.email);
      const merged = mergePreferences(current, req.body);
      if (merged.problem) return fail(reply, 400, merged.problem);
      const preferences = await app.userActions.saveAiHelpPreferences(
        user.email,
        merged.preferences,
      );
      return { preferences };
    },
  );

  /** Les moteurs de voix proposables, chacun ESSAYÉ (lib/aiHelp/voices.js). */
  app.get('/ai-help/voices', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    const access = await aiHelpAccess(app, user, { log: req.log });
    if (!access.available) return fail(reply, 409, 'ai_help_not_allowed');
    if (overLimit(voicesByAccount, user, reply)) return undefined;
    return voiceCatalog(app, { log: req.log });
  });

  /**
   * Dire un texte : l'audio (mp3), tel quel. Une panne du fournisseur est
   * relayée comme les autres appels d'IA (`replyUpstreamError`) — l'écran se
   * tait alors, la carte reste.
   */
  app.post('/ai-help/speech', { schema: { body: speechBody } }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');
    const access = await aiHelpAccess(app, user, { log: req.log });
    if (!access.available) return fail(reply, 409, 'ai_help_not_allowed');
    const { provider, model, voice, text, language } = req.body;
    const problem = voiceProblem({ provider, model, voice });
    if (problem) return fail(reply, 400, problem);
    if (overLimit(speechByAccount, user, reply)) return undefined;
    let spoken;
    try {
      spoken = await synthesize(app, { provider, model, voice, text, language });
    } catch (err) {
      if (!(err instanceof UpstreamError)) throw err;
      return replyUpstreamError(reply, err);
    }
    if (req.body.meetingId) {
      // Compté sur la réunion, comme les appels au modèle : de quoi chiffrer
      // un jour ce que la voix coûte.
      await resume().updateOne(ownerFilter(user.email, { meetingId: req.body.meetingId }), {
        $inc: {
          [`aiHelp.speech.${provider}.calls`]: 1,
          [`aiHelp.speech.${provider}.chars`]: text.length,
        },
      });
    }
    reply.header('cache-control', 'no-store');
    return reply.type(spoken.type).send(spoken.audio);
  });

  /**
   * Le réglage d'une réunion. Tout champ est facultatif : un corps réduit à
   * `meetingId` ne change rien et sert à RELIRE la session — le client le fait
   * à l'ouverture de la réunion, et quand son tag change pour que le projet
   * soit reconnu.
   *
   * Une réunion qui n'a encore AUCUN réglage le reçoit ici : celui des
   * préférences du compte (Réglages → Aide IA), tout allumé par défaut. C'est
   * le serveur qui le pose, pas l'écran : une page rechargée en pleine réunion
   * relit ce qu'on y avait coupé au lieu de tout rallumer.
   */
  app.post('/ai-help/session', { schema: { body: sessionBody } }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');
    const access = await aiHelpAccess(app, user, { log: req.log });
    if (!access.available) return fail(reply, 409, 'ai_help_not_allowed');

    const { enabled, domains, agenda, agendaAdd, agendaRemove, projectPath, projectMode } =
      req.body;
    const meeting = await findMeeting(user.email, req.body.meetingId);
    if (!meeting) return fail(reply, 404, 'meeting_not_found');
    const filter = ownerFilter(user.email, { meetingId: meeting.meetingId });
    const current = readSession(meeting);

    const untouched = meeting.aiHelp?.enabled === undefined;
    const start = untouched ? (await app.userActions.getAiHelpPreferences(user.email)).start : null;
    const $set = { 'aiHelp.updatedAt': new Date().toISOString() };
    if (enabled !== undefined) $set['aiHelp.enabled'] = enabled;
    else if (untouched) $set['aiHelp.enabled'] = start.enabled;
    if (domains !== undefined || untouched) {
      $set['aiHelp.domains'] = normalizeDomains(
        domains,
        untouched ? start.domains : current.domains,
      );
    }
    if (agenda !== undefined) $set['aiHelp.agenda'] = normalizeAgenda(agenda);
    if (agendaAdd !== undefined || agendaRemove !== undefined) {
      let text = $set['aiHelp.agenda'] ?? current.agenda;
      let heard = current.agendaHeard;
      if (agendaRemove !== undefined) {
        text = removeAgendaPoint(text, agendaRemove);
        // Retiré à la main : l'IA ne le remettra pas d'elle-même, même redit.
        heard = [...new Set([...heard, agendaKey(agendaRemove)])];
      }
      if (agendaAdd !== undefined) {
        const { agenda: withPoint, added } = addAgendaPoints(text, [agendaAdd]);
        text = withPoint;
        // Ajouté à la main : ce point n'est plus « entendu ».
        const typed = new Set(added.map(agendaKey));
        heard = heard.filter((key) => !typed.has(key));
      }
      $set['aiHelp.agenda'] = text;
      $set['aiHelp.agendaHeard'] = heard.filter(Boolean).slice(-AI_HELP_AGENDA_HEARD_MAX);
    }
    if (projectPath !== undefined) {
      if (!access.brain) return fail(reply, 409, 'ai_help_mybrain_not_allowed');
      try {
        const sheet = await app.myBrain.sheet({
          url: access.brain.url,
          apiKey: access.brain.apiKey,
          path: projectPath,
        });
        $set['aiHelp.project'] = {
          path: sheet.path,
          title: sheet.title || sheet.path,
          source: 'chosen',
        };
        $set['aiHelp.projectDeclined'] = false;
      } catch (err) {
        if (!(err instanceof MyBrainError)) throw err;
        return upstreamBrain(reply, err);
      }
    } else if (projectMode !== undefined) {
      $set['aiHelp.project'] = null;
      $set['aiHelp.projectDeclined'] = projectMode === 'none';
      $set['aiHelp.lastGuess'] = '';
    }
    if (req.body.timer === 'stop') $set['aiHelp.timer'] = null;
    await resume().updateOne(filter, { $set });

    // Le projet, s'il manque : d'abord la fiche reliée au tag de la réunion,
    // sinon le nom du tag demandé à myBrain. Une panne de myBrain ici ne fait
    // pas échouer le réglage : l'IA demandera le projet pendant la réunion.
    let session = readSession(await findMeeting(user.email, meeting.meetingId));
    let candidates = [];
    const wantsProject =
      session.enabled && session.domains.project && access.domains.project && access.brain !== null;
    if (wantsProject && !session.project && !session.projectDeclined && meeting.tagId) {
      const tag = await tags().findOne(ownerFilter(user.email, { id: meeting.tagId }), {
        projection: { _id: 0, label: 1, myBrainProject: 1 },
      });
      let project = null;
      if (typeof tag?.myBrainProject?.path === 'string' && tag.myBrainProject.path) {
        project = { path: tag.myBrainProject.path, title: String(tag.myBrainProject.title || '') };
      } else if (tag?.label) {
        try {
          ({ project, candidates } = await resolveProject(app, access.brain, tag.label));
        } catch (err) {
          if (!(err instanceof MyBrainError)) throw err;
          req.log.warn(
            { code: err.code, status: err.status },
            'aide IA : projet du tag non résolu',
          );
        }
      }
      if (project) {
        await resume().updateOne(filter, {
          $set: { 'aiHelp.project': { ...project, source: 'tag' } },
        });
        session = readSession(await findMeeting(user.email, meeting.meetingId));
      }
    }

    return { session: publicSession(session, access), candidates };
  });

  /**
   * Une réunion du compte, en cours, où l'Aide IA est allumée — ou le refus
   * parti. Commun à `watch` et `ask`.
   */
  async function liveSession(req, reply, limiter) {
    const user = requireUser(req, reply);
    if (!user) return null;
    if (!isSameOrigin(req)) {
      fail(reply, 403, 'bad_origin');
      return null;
    }
    if (overLimit(limiter, user, reply)) return null;
    const access = await aiHelpAccess(app, user, { log: req.log });
    if (!access.available) {
      fail(reply, 409, 'ai_help_not_allowed');
      return null;
    }
    const meeting = await findMeeting(user.email, req.body.meetingId);
    if (!meeting) {
      fail(reply, 404, 'meeting_not_found');
      return null;
    }
    if (meeting.status !== 'recording') {
      fail(reply, 409, 'meeting_not_recording');
      return null;
    }
    if (!readSession(meeting).enabled) {
      fail(reply, 409, 'ai_help_off');
      return null;
    }
    return { user, access, meeting };
  }

  app.post('/ai-help/watch', { schema: { body: watchBody } }, async (req, reply) => {
    const live = await liveSession(req, reply, watchByAccount);
    if (!live) return undefined;
    try {
      return await watchMeeting({
        app,
        log: req.log,
        email: live.user.email,
        user: live.user,
        access: live.access,
        meeting: live.meeting,
        before: req.body.before || '',
        fresh: req.body.fresh,
        language: normalizeLang(req.body.language),
      });
    } catch (err) {
      req.log.warn({ status: err?.status }, 'aide IA : lecture en échec');
      return replyUpstreamError(reply, err);
    }
  });

  app.post('/ai-help/ask', { schema: { body: askBody } }, async (req, reply) => {
    const live = await liveSession(req, reply, askByAccount);
    if (!live) return undefined;
    const session = readSession(live.meeting);
    // Questions-réponses coupées : on lui parle encore, pour des GESTES
    // (lib/aiHelp/engine.js, `answerQuestion`). Une question reçoit le 409.
    const answers = session.domains.qa === true && live.access.domains.qa === true;
    const question = req.body.question.replace(/\s+/g, ' ').trim();
    if (!question) return fail(reply, 400, 'question_required');
    try {
      // Les tags du compte : l'IA n'en pose qu'un qui existe, par son nom.
      const owned = await tags()
        .find(ownerFilter(live.user.email), { projection: { _id: 0, id: 1, label: 1 } })
        .toArray();
      const answered = await answerQuestion({
        app,
        log: req.log,
        email: live.user.email,
        user: live.user,
        access: live.access,
        meeting: live.meeting,
        tags: owned.filter((tag) => typeof tag?.id === 'string' && typeof tag?.label === 'string'),
        question,
        voice: req.body.voice === true,
        transcript: req.body.transcript || '',
        language: normalizeLang(req.body.language),
        templates: (req.body.templates || []).map((name) => name.trim()).filter(Boolean),
        paused: req.body.paused === true,
        answers,
      });
      const { item, notice, agenda, actions, reminders, declined } = answered;
      if (declined) return fail(reply, 409, 'ai_help_domain_off');
      // Le modèle a répondu, mais rien d'exploitable : une panne en amont.
      if (!item && !actions.length) return fail(reply, 502, 'ai_help_no_answer');
      // `agenda` : présent seulement si la réponse a touché à l'ordre du jour.
      // `item` null avec des `actions` : « ferme ta fenêtre », rien à afficher.
      // `timer` : présent seulement si la demande a touché au minuteur.
      return {
        item,
        notice,
        ...(agenda ? { agenda } : {}),
        actions,
        reminders,
        ...(answered.timer !== undefined ? { timer: answered.timer } : {}),
      };
    } catch (err) {
      req.log.warn({ status: err?.status }, 'aide IA : question en échec');
      return replyUpstreamError(reply, err);
    }
  });

  /**
   * « Compris », « Écarter », ou rouvrir. Possible après la réunion : on relit
   * ses interventions depuis l'historique.
   */
  app.post('/ai-help/item', { schema: { body: itemBody } }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');
    const { itemId, state } = req.body;
    // L'identifiant devient une CLÉ de champ : hexadécimal, rien d'autre.
    if (!ITEM_ID_PATTERN.test(itemId)) return fail(reply, 400, 'invalid_body');
    const meeting = await findMeeting(user.email, req.body.meetingId);
    if (!meeting) return fail(reply, 404, 'meeting_not_found');
    if (!readSession(meeting).items.some((item) => item.id === itemId)) {
      return fail(reply, 404, 'item_not_found');
    }
    await resume().updateOne(ownerFilter(user.email, { meetingId: meeting.meetingId }), {
      $set: { [`aiHelp.states.${itemId}`]: state },
    });
    return { ok: true, itemId, state };
  });

  app.get('/ai-help/projects', { schema: { querystring: projectsQuery } }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    if (overLimit(projectsByAccount, user, reply)) return undefined;
    const access = await aiHelpAccess(app, user);
    if (!access.brain) return fail(reply, 409, 'ai_help_mybrain_not_allowed');
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return { projects: [] };
    try {
      const found = await app.myBrain.search({
        url: access.brain.url,
        apiKey: access.brain.apiKey,
        query,
        limit: 12,
      });
      // Les fiches de projet d'abord ; aucune : ce que myBrain a trouvé, pour
      // qu'un cerveau qui type autrement ses fiches reste utilisable.
      const typed = found.filter((sheet) => PROJECT_TYPES.includes(sheet.type.toLowerCase()));
      return {
        projects: (typed.length ? typed : found).slice(0, PROJECTS_MAX).map((sheet) => ({
          path: sheet.path,
          title: sheet.title || sheet.path,
          type: sheet.type,
        })),
      };
    } catch (err) {
      if (!(err instanceof MyBrainError)) throw err;
      return upstreamBrain(reply, err);
    }
  });

  /**
   * Relier un tag à la fiche d'un projet : toute réunion qui porte ce tag sait
   * alors de quel projet elle parle. Délier (`path` absent ou vide) reste
   * possible sans myBrain — on doit pouvoir retirer un lien devenu inutile.
   */
  app.post('/ai-help/tag-project', { schema: { body: tagProjectBody } }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');
    const { tagId, path = '' } = req.body;
    const filter = ownerFilter(user.email, { id: tagId });
    if (!(await tags().findOne(filter, { projection: { _id: 0, id: 1 } }))) {
      return fail(reply, 404, 'tag_not_found');
    }
    if (!path) {
      await tags().updateOne(filter, { $unset: { myBrainProject: '' } });
      return { tagId, project: null };
    }
    const access = await aiHelpAccess(app, user);
    if (!access.brain) return fail(reply, 409, 'ai_help_mybrain_not_allowed');
    try {
      const sheet = await app.myBrain.sheet({
        url: access.brain.url,
        apiKey: access.brain.apiKey,
        path,
      });
      const project = { path: sheet.path, title: sheet.title || sheet.path };
      await tags().updateOne(filter, { $set: { myBrainProject: project } });
      return { tagId, project };
    } catch (err) {
      if (!(err instanceof MyBrainError)) throw err;
      return upstreamBrain(reply, err);
    }
  });
}
