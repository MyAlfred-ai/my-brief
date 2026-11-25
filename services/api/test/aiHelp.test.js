/**
 * Aide IA d'une réunion (routes/aiHelp.js, lib/aiHelp/) — faux modèle, faux
 * myBrain, aucun réseau.
 *
 * Garanties tenues ici :
 *   - personne n'a l'Aide IA sans le droit de son groupe, ni la lecture de
 *     myBrain sans le second droit ET une clé qui porte « lire » ;
 *   - le modèle n'est appelé que pour une réunion du compte, en cours, où
 *     l'Aide IA est allumée ;
 *   - la fiche d'un projet n'entre dans un prompt que pour un compte qui a le
 *     droit de lire myBrain ;
 *   - myBrain en panne ne casse pas la réunion ;
 *   - une intervention d'un domaine éteint est jetée, même si le modèle la rend ;
 *   - l'ordre du jour annoncé à voix haute est retenu, un point retiré par
 *     l'utilisateur n'y revient pas tout seul, un point traité le reste, et le
 *     rappel de fin de réunion ne part qu'avec des points jamais abordés ;
 *   - un geste sur la réunion (pause, fin, compte rendu, correction de la
 *     transcription) n'est relayé à l'écran que s'il a un sens : sinon il est
 *     dit sur la réponse, et rien ne part.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTestApp,
  identityHeaders,
  userDoc,
  groupDoc,
  defaultGroupDoc,
  createFakeMyBrain,
} from './helpers.js';
import { MyBrainError } from '../lib/myBrain/client.js';
import { UpstreamError } from '../lib/openai.js';

const PILOT = 'camille@client.fr'; // Aide IA + myBrain
const TALKER = 'hugo@client.fr'; // Aide IA seule
const NOBODY = 'intrus@client.fr'; // groupe par défaut : aucun droit
const ADMIN = 'patron@client.fr';
const API_KEY = `mbk_${'k'.repeat(40)}`;

const owned = (email, fields) => ({ email, emailLower: email, ...fields });

const seed = (extra = {}) => ({
  user: [
    userDoc(ADMIN, { role: 'admin' }),
    userDoc(PILOT, { groupIds: ['pilots'] }),
    userDoc(TALKER, { groupIds: ['talkers'] }),
    userDoc(NOBODY),
  ],
  userGroups: [
    defaultGroupDoc(),
    groupDoc('pilots', { aiHelpAllowed: true, aiHelpMyBrainAllowed: true }),
    groupDoc('talkers', { aiHelpAllowed: true }),
  ],
  resume: [
    owned(PILOT, {
      _id: 'r1',
      meetingId: 'live-pilot',
      status: 'recording',
      notes: 'Lot 2 = espace client',
    }),
    owned(PILOT, { _id: 'r2', meetingId: 'ended-pilot', status: 'ended' }),
    owned(TALKER, { _id: 'r3', meetingId: 'live-talker', status: 'recording' }),
  ],
  ...extra,
});

/** Branche myBrain. La politique d'ENVOI est `off` exprès : lire n'en dépend pas. */
async function plug(app, droits = ['lire', 'nourrir']) {
  await app.myBrainSettings.update(
    { url: 'https://cerveau.example.test', apiKey: API_KEY, policy: 'off' },
    {
      actor: ADMIN,
      verified: {
        application: 'myBrief',
        droits,
        publicUrl: 'https://cerveau.example.test',
        at: new Date().toISOString(),
      },
    },
  );
}

async function build({
  openai = { chat: '{"interventions":[]}' },
  myBrain,
  seed: seeded,
  droits,
} = {}) {
  // `myBrain` est un SCRIPT (réponses ou pannes par méthode), pas un client.
  // Le « qui suis-je » rend les droits que la clé a VRAIMENT : ceux de `droits`,
  // à moins qu'un test ne dise autre chose (une photo périmée, justement).
  const built = buildTestApp({
    seed: seeded || seed(),
    openai,
    myBrain: createFakeMyBrain({
      whoami: {
        application: 'myBrief',
        droits: droits || ['lire', 'nourrir'],
        api: 'https://cerveau.example.test/api/v1',
      },
      ...myBrain,
    }),
  });
  if (droits !== null) await plug(built.app, droits);
  return built;
}

const post = (app, url, body, email = PILOT) =>
  app.inject({
    method: 'POST',
    url: `/api${url}`,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const get = (app, url, email = PILOT) =>
  app.inject({ method: 'GET', url: `/api${url}`, headers: identityHeaders(email) });

const lastPrompt = (ai) => ai.calls.at(-1).params.messages[0].content;
/** La préparation d'une recherche myBrain : un appel au modèle AVANT la réponse. */
const isSearchPlan = (params) =>
  String(params?.messages?.[0]?.content || '').startsWith('Tu prépares une recherche');
const planPrompt = (ai) =>
  ai.calls.find((call) => call.method === 'chat' && isSearchPlan(call.params))?.params.messages[0]
    .content;
const chatCalls = (ai) => ai.calls.filter((call) => call.method === 'chat').length;
const meetingOf = (db, meetingId) => db.collection('resume').findOne({ meetingId });

const ALL_ON = { project: true, qa: true, agenda: true, ideas: true };

/** Allume l'Aide IA sur une réunion. */
const open = (app, meetingId = 'live-pilot', email = PILOT, extra = {}) =>
  post(app, '/ai-help/session', { meetingId, enabled: true, domains: ALL_ON, ...extra }, email);

describe('Aide IA — qui y a droit', () => {
  it("sans le droit du groupe, rien n'est proposé — même avec myBrain branché", async () => {
    const { app } = await build();
    const res = await get(app, '/ai-help', NOBODY);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      available: false,
      myBrain: false,
      domains: { project: false, qa: false, agenda: false, ideas: false },
      wakeWord: '',
      myBrainUrl: '',
    });
  });

  it('le droit « Aide IA » seul : tout, sauf ce qui lit myBrain', async () => {
    const { app } = await build();
    expect((await get(app, '/ai-help', TALKER)).json()).toMatchObject({
      available: true,
      myBrain: false,
      domains: { project: false, qa: true, agenda: true, ideas: true },
      wakeWord: 'Alfred',
      myBrainUrl: '',
    });
  });

  it('les deux droits et une clé « lire » : myBrain, quelle que soit la politique d’envoi', async () => {
    const { app } = await build();
    expect((await get(app, '/ai-help')).json()).toMatchObject({
      available: true,
      myBrain: true,
      domains: ALL_ON,
      myBrainUrl: 'https://cerveau.example.test',
    });
  });

  it('une clé sans « lire », ou pas de myBrain : le garde-fou du projet disparaît', async () => {
    const noRead = await build({ droits: ['nourrir'] });
    expect((await get(noRead.app, '/ai-help')).json()).toMatchObject({
      available: true,
      myBrain: false,
      domains: { project: false, qa: true },
    });
    const unplugged = await build({ droits: null });
    expect((await get(unplugged.app, '/ai-help')).json().myBrain).toBe(false);
  });

  it("un domaine coupé par l'administration n'existe pour personne", async () => {
    const { app } = await build();
    const saved = await post(app, '/admin/settings/ai-help', { domains: { ideas: false } }, ADMIN);
    expect(saved.json().settings.domains).toEqual({ ...ALL_ON, ideas: false });
    expect((await get(app, '/ai-help')).json().domains.ideas).toBe(false);
  });

  it('une réunion démarre allumée, tous domaines permis ; rien de la réunion ne suit à la suivante', async () => {
    const { app } = await build();
    expect((await get(app, '/ai-help')).json().defaults).toEqual({
      enabled: true,
      domains: ALL_ON,
    });
    // Sans le droit myBrain : tout, sauf le garde-fou du projet.
    expect((await get(app, '/ai-help', TALKER)).json().defaults.domains).toEqual({
      ...ALL_ON,
      project: false,
    });
    // Ni un domaine coupé pendant une réunion, ni son son coupé : les
    // préférences se règlent dans Réglages → Aide IA (aiHelpVoice.test.js).
    await post(app, '/ai-help/session', {
      meetingId: 'live-pilot',
      enabled: false,
      domains: { ideas: false },
      sound: false,
    });
    const after = (await get(app, '/ai-help')).json();
    expect(after.defaults).toEqual({ enabled: true, domains: ALL_ON });
    expect(after.preferences.sounds).toEqual({
      alerts: true,
      ideas: true,
      actions: true,
      timer: true,
    });
  });
});

describe('Aide IA — le réglage d’une réunion', () => {
  it('une réunion sans réglage le reçoit à la première lecture : allumée, tout ; ensuite on relit', async () => {
    const { app } = await build();
    const read = async (email = PILOT, meetingId = 'live-pilot') =>
      (await post(app, '/ai-help/session', { meetingId }, email)).json().session;

    expect(await read()).toMatchObject({ enabled: true, domains: ALL_ON });
    expect((await read(TALKER, 'live-talker')).domains).toEqual({ ...ALL_ON, project: false });

    // Coupée en partie pendant la réunion : une relecture (page rechargée) ne rallume rien.
    await post(app, '/ai-help/session', { meetingId: 'live-pilot', domains: { ideas: false } });
    expect((await read()).domains).toEqual({ ...ALL_ON, ideas: false });
    await post(app, '/ai-help/session', { meetingId: 'live-pilot', enabled: false });
    expect(await read()).toMatchObject({ enabled: false, domains: { ...ALL_ON, ideas: false } });
  });

  it('refusé sans le droit (409, jamais 403), introuvable pour la réunion d’un autre', async () => {
    const { app } = await build();
    const refused = await open(app, 'live-pilot', NOBODY);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('ai_help_not_allowed');
    const foreign = await open(app, 'live-pilot', TALKER);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error).toBe('meeting_not_found');
  });

  it('enregistre le réglage ; un domaine sans droit reste éteint à la lecture', async () => {
    const { app, db } = await build();
    const res = await open(app, 'live-talker', TALKER, { agenda: '- Avancement\n2. Risques\n\n' });
    expect(res.statusCode).toBe(200);
    expect(res.json().session).toMatchObject({
      enabled: true,
      domains: { project: false, qa: true, agenda: true, ideas: true },
      agenda: 'Avancement\nRisques',
      agendaState: [
        { label: 'Avancement', state: 'todo' },
        { label: 'Risques', state: 'todo' },
      ],
      project: null,
      items: [],
    });
    expect((await meetingOf(db, 'live-talker')).aiHelp.enabled).toBe(true);
  });

  it('le projet vient de la fiche reliée au tag de la réunion', async () => {
    const seeded = seed();
    seeded.resume[0].tagId = 'tag-atlas';
    seeded.userTags = [
      owned(PILOT, {
        id: 'tag-atlas',
        label: 'Atlas',
        labelLower: 'atlas',
        myBrainProject: { path: 'wiki/projets/atlas.md', title: 'Projet Atlas' },
      }),
    ];
    const { app, myBrain } = await build({ seed: seeded });
    const res = await open(app);
    expect(res.json().session.project).toEqual({
      path: 'wiki/projets/atlas.md',
      title: 'Projet Atlas',
      source: 'tag',
    });
    // Le lien du tag suffit : myBrain n'est pas interrogé.
    expect(myBrain.calls.filter((call) => call.method === 'sheet')).toHaveLength(0);
  });

  it('à défaut de lien, le NOM du tag est demandé à myBrain ; ambigu, il rend des candidats', async () => {
    const seeded = seed();
    seeded.resume[0].tagId = 'tag-atlas';
    seeded.userTags = [owned(PILOT, { id: 'tag-atlas', label: 'Atlas', labelLower: 'atlas' })];

    const found = await build({ seed: structuredClone(seeded) });
    expect((await open(found.app)).json().session.project).toMatchObject({
      title: 'Projet Atlas',
      source: 'tag',
    });
    expect(found.myBrain.calls.at(-1)).toMatchObject({ method: 'sheet', name: 'Atlas' });

    const candidates = [
      { path: 'wiki/projets/atlas.md', title: 'Projet Atlas' },
      { path: 'wiki/projets/atlas-lot-1.md', title: 'Projet Atlas — lot 1' },
    ];
    const ambiguous = await build({
      seed: structuredClone(seeded),
      myBrain: {
        sheet: () => {
          const err = new MyBrainError('mybrain_not_found', { status: 404 });
          err.candidates = candidates;
          throw err;
        },
      },
    });
    const res = await open(ambiguous.app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ session: { project: null }, candidates });
  });

  it('un projet choisi est relu dans myBrain : son titre vient de là, pas du client', async () => {
    const { app, myBrain } = await build();
    const res = await post(app, '/ai-help/session', {
      meetingId: 'live-pilot',
      projectPath: 'wiki/projets/atlas.md',
    });
    expect(res.json().session.project).toEqual({
      path: 'wiki/projets/atlas.md',
      title: 'Projet Atlas',
      source: 'chosen',
    });
    expect(myBrain.calls.at(-1)).toMatchObject({
      method: 'sheet',
      path: 'wiki/projets/atlas.md',
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
    });

    const none = await post(app, '/ai-help/session', {
      meetingId: 'live-pilot',
      projectMode: 'none',
    });
    expect(none.json().session).toMatchObject({ project: null, projectDeclined: true });
  });

  it('choisir un projet sans le droit myBrain : 409 ; myBrain en panne : 502 et son slug', async () => {
    const { app } = await build();
    const refused = await post(
      app,
      '/ai-help/session',
      { meetingId: 'live-talker', projectPath: 'wiki/projets/atlas.md' },
      TALKER,
    );
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('ai_help_mybrain_not_allowed');

    const down = await build({
      myBrain: {
        sheet: () => {
          throw new MyBrainError('mybrain_unreachable', { retryable: true });
        },
      },
    });
    const failed = await post(down.app, '/ai-help/session', {
      meetingId: 'live-pilot',
      projectPath: 'wiki/projets/atlas.md',
    });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error).toBe('mybrain_unreachable');
  });
});

describe('Aide IA — la lecture du passage', () => {
  const ALERT = JSON.stringify({
    interventions: [
      {
        kind: 'alert',
        title: 'La signature électronique fait partie du lot 2',
        body: 'Vous venez de la retirer ; la fiche l’inscrit au périmètre.',
        quote: '« On retire la signature électronique. » — Camille',
      },
    ],
  });
  const watch = (app, meetingId = 'live-pilot', email = PILOT, extra = {}) =>
    post(
      app,
      '/ai-help/watch',
      {
        meetingId,
        before: 'Point sur le lot 2.',
        fresh: 'On retire la signature électronique.',
        ...extra,
      },
      email,
    );

  it('ne lit que la réunion du compte, en cours, Aide IA allumée — sinon aucun appel au modèle', async () => {
    const { app, ai } = await build({ openai: { chat: ALERT } });
    expect((await watch(app)).json().error).toBe('ai_help_off');
    await open(app);
    await open(app, 'ended-pilot');
    expect((await watch(app, 'ended-pilot')).json().error).toBe('meeting_not_recording');
    expect((await watch(app, 'live-pilot', TALKER)).statusCode).toBe(404);
    expect((await watch(app, 'live-pilot', NOBODY)).json().error).toBe('ai_help_not_allowed');
    expect(chatCalls(ai)).toBe(0);
  });

  it('donne la fiche du projet au modèle, garde l’alerte et la rattache à la fiche', async () => {
    const { app, ai, db, myBrain } = await build({ openai: { chat: ALERT } });
    await open(app, 'live-pilot', PILOT, { projectPath: 'wiki/projets/atlas.md' });
    const res = await watch(app);

    expect(res.statusCode).toBe(200);
    const [item] = res.json().items;
    expect(item).toMatchObject({
      kind: 'alert',
      title: 'La signature électronique fait partie du lot 2',
      source: { path: 'wiki/projets/atlas.md', title: 'Projet Atlas' },
      state: 'open',
    });
    expect(item.id).toMatch(/^[a-f0-9]{32}$/);

    const prompt = lastPrompt(ai);
    expect(prompt).toContain('<projet titre="Projet Atlas">');
    expect(prompt).toContain('Périmètre du lot 2 : espace client, signature électronique.');
    expect(prompt).toContain('<transcription_nouveau>\nOn retire la signature électronique.');
    expect(prompt).toContain('Lot 2 = espace client'); // les notes de la réunion
    expect(ai.calls.at(-1).params.model).toBe(app.config.openai.models.aiHelp);

    const stored = (await meetingOf(db, 'live-pilot')).aiHelp;
    expect(stored.items).toHaveLength(1);
    expect(stored.calls.watch).toBe(1);

    // La fiche est gardée en mémoire : une seconde lecture ne la redemande pas,
    // et le titre déjà signalé est rappelé au modèle.
    const sheetCalls = () => myBrain.calls.filter((call) => call.method === 'sheet').length;
    const before = sheetCalls();
    await watch(app);
    expect(sheetCalls()).toBe(before);
    expect(lastPrompt(ai)).toContain(
      '<deja_signale>\n- La signature électronique fait partie du lot 2',
    );
  });

  it('sans le droit myBrain, la fiche n’entre jamais dans le prompt', async () => {
    const { app, ai, myBrain } = await build({ openai: { chat: ALERT } });
    await open(app, 'live-talker', TALKER, { agenda: 'Avancement' });
    const res = await watch(app, 'live-talker', TALKER);

    expect(res.json().items).toEqual([]); // l'alerte rendue par le modèle est jetée
    expect(lastPrompt(ai)).not.toContain('<projet');
    expect(myBrain.calls.filter((call) => call.method !== 'whoami')).toHaveLength(0);
  });

  it('rien à surveiller — seules les questions sont allumées : pas d’appel au modèle', async () => {
    const { app, ai } = await build({ openai: { chat: ALERT } });
    await post(app, '/ai-help/session', {
      meetingId: 'live-pilot',
      enabled: true,
      domains: { project: false, qa: true, agenda: false, ideas: false },
    });
    const res = await watch(app);
    expect(res.json()).toMatchObject({ items: [], notice: '' });
    expect(chatCalls(ai)).toBe(0);
  });

  it('suit l’ordre du jour et jette ce que le modèle rend de travers', async () => {
    const { app, db } = await build({
      openai: {
        chat: `\`\`\`json\n${JSON.stringify({
          interventions: [
            {
              kind: 'agenda',
              title: 'Le budget n’a pas été abordé',
              body: 'Il reste deux points.',
            },
            { kind: 'idea', title: '' },
            { kind: 'inconnu', title: 'à jeter' },
          ],
          agenda: [
            { point: 1, state: 'done' },
            { point: 2, state: 'now' },
            { point: 9, state: 'done' },
            { point: 3, state: 'bizarre' },
          ],
        })}\n\`\`\``,
      },
    });
    await open(app, 'live-pilot', PILOT, {
      agenda: 'Avancement\nRisques\nBudget',
      projectMode: 'none',
    });
    const res = await watch(app);

    const agenda = [
      { label: 'Avancement', state: 'done' },
      { label: 'Risques', state: 'now' },
      { label: 'Budget', state: 'todo' },
    ];
    expect(res.json().agenda).toEqual(agenda.map((point) => ({ ...point, heard: false })));
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0]).toMatchObject({ kind: 'agenda', points: agenda, source: null });
    expect((await meetingOf(db, 'live-pilot')).aiHelp.agendaState).toEqual(agenda);
  });

  it('myBrain en panne : la lecture continue sans le projet, et le dit', async () => {
    const { app, ai } = await build({
      openai: { chat: ALERT },
      myBrain: {
        sheet: (payload) => {
          if (payload.name)
            return { path: 'wiki/projets/atlas.md', title: 'Projet Atlas', content: 'x' };
          throw new MyBrainError('mybrain_timeout', { ambiguous: true });
        },
      },
    });
    // Le projet est déjà connu de la réunion ; c'est sa RELECTURE qui échoue.
    await app.db
      .collection('resume')
      .updateOne(
        { meetingId: 'live-pilot' },
        { $set: { 'aiHelp.project': { path: 'wiki/projets/atlas.md', title: 'Projet Atlas' } } },
      );
    await open(app, 'live-pilot', PILOT, { agenda: 'Avancement' });
    const res = await watch(app);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ items: [], notice: 'mybrain_timeout' });
    expect(lastPrompt(ai)).not.toContain('<projet');
  });

  it('projet inconnu : le nom entendu est demandé UNE fois à myBrain, puis retenu', async () => {
    const { app, db, myBrain } = await build({
      openai: { chat: JSON.stringify({ interventions: [], project: 'Atlas' }) },
    });
    await open(app);
    const res = await watch(app);
    expect(res.json().project).toEqual({
      path: 'wiki/projets/atlas.md',
      title: 'Projet Atlas',
      source: 'guess',
    });
    expect((await meetingOf(db, 'live-pilot')).aiHelp.project.source).toBe('guess');
    expect(myBrain.calls.at(-1)).toMatchObject({ method: 'sheet', name: 'Atlas' });
  });

  it('le projet reconnu, le MÊME passage est relu contre sa fiche : la contradiction n’est pas perdue', async () => {
    const { app, ai, db } = await build({
      openai: {
        // Sans la fiche, le modèle ne peut que nommer le projet ; avec, il alerte.
        chat: (params) =>
          params.messages[0].content.includes('<projet')
            ? ALERT
            : JSON.stringify({ interventions: [], project: 'Atlas' }),
      },
    });
    await open(app);
    const res = await watch(app);

    expect(res.json().project).toMatchObject({ title: 'Projet Atlas', source: 'guess' });
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0]).toMatchObject({
      kind: 'alert',
      source: { path: 'wiki/projets/atlas.md', title: 'Projet Atlas' },
    });
    expect(chatCalls(ai)).toBe(2);
    expect((await meetingOf(db, 'live-pilot')).aiHelp.items).toHaveLength(1);
    // La relecture ne porte que sur le garde-fou du projet.
    expect(lastPrompt(ai)).not.toContain('"idea"');
  });

  it('un nom entendu que myBrain ne résout pas n’est pas redemandé à chaque passage', async () => {
    const candidates = [{ path: 'wiki/projets/atlas.md', title: 'Projet Atlas' }];
    const { app, myBrain } = await build({
      openai: { chat: JSON.stringify({ interventions: [], project: 'Atlas' }) },
      myBrain: {
        sheet: () => {
          const err = new MyBrainError('mybrain_not_found', { status: 404 });
          err.candidates = candidates;
          throw err;
        },
      },
    });
    await open(app);
    expect((await watch(app)).json()).toMatchObject({ project: null, candidates });
    const asked = myBrain.calls.filter((call) => call.method === 'sheet').length;
    expect((await watch(app)).json().candidates).toEqual([]);
    expect(myBrain.calls.filter((call) => call.method === 'sheet')).toHaveLength(asked);
  });

  it('une panne du modèle est relayée, rien n’est écrit', async () => {
    const { app, db } = await build({
      openai: {
        chat: () => {
          throw new UpstreamError(429, '{"error":{"message":"quota"}}', 'application/json');
        },
      },
    });
    await open(app, 'live-pilot', PILOT, { agenda: 'Avancement' });
    const res = await watch(app);
    expect(res.statusCode).toBe(429);
    expect((await meetingOf(db, 'live-pilot')).aiHelp.items).toBeUndefined();
  });
});

describe('Aide IA — la boîte à idées : rare, et seulement si elle sert', () => {
  // Plus de trois mille caractères : la réunion a de quoi nourrir une idée.
  const LONG = 'On compare les deux offres pour le pilote, prix et délais. '.repeat(60);
  const MIN = 60 * 1000;
  const ideaOf = (title) => ({ kind: 'idea', title, body: 'Pourquoi maintenant.', quote: '' });
  const says = (...titles) => JSON.stringify({ interventions: titles.map(ideaOf) });
  /** Un modèle qui rend ses sorties dans l'ordre, puis répète la dernière. */
  const inTurn = (...outputs) => {
    let next = 0;
    return () => outputs[Math.min(next++, outputs.length - 1)];
  };
  const watch = (app, before = LONG, fresh = 'On signe avec Atlas ?') =>
    post(app, '/ai-help/watch', { meetingId: 'live-pilot', before, fresh });
  const start = (app, domains = ALL_ON) =>
    open(app, 'live-pilot', PILOT, { domains, projectMode: 'none' });
  const askedForIdeas = (ai) => lastPrompt(ai).includes('"idea"');
  /** Recule les horloges de la réunion : ses interventions, la dernière demande d'idée. */
  async function age(db, ms) {
    const { aiHelp } = await meetingOf(db, 'live-pilot');
    const back = (iso) => new Date(Date.parse(iso) - ms).toISOString();
    await db.collection('resume').updateOne(
      { meetingId: 'live-pilot' },
      {
        $set: {
          'aiHelp.items': (aiHelp.items || []).map((item) => ({ ...item, at: back(item.at) })),
          ...(aiHelp.ideasLookedAt ? { 'aiHelp.ideasLookedAt': back(aiHelp.ideasLookedAt) } : {}),
        },
      },
    );
  }

  it('début de réunion : aucune idée demandée, et celle que le modèle rend quand même est jetée', async () => {
    const { app, ai } = await build({ openai: { chat: says('Comparer les pénalités de retard') } });
    await start(app);
    const res = await watch(app, 'Bonjour à tous.');
    expect(res.json().items).toEqual([]);
    expect(askedForIdeas(ai)).toBe(false);
  });

  it('réunion engagée : une idée demandée, réfléchie davantage — une seule gardée', async () => {
    const { app, ai, db } = await build({
      openai: {
        chat: says('Comparer les pénalités de retard des deux offres', 'Demander une référence'),
      },
    });
    await start(app);
    const res = await watch(app);

    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0]).toMatchObject({
      kind: 'idea',
      title: 'Comparer les pénalités de retard des deux offres',
    });
    expect(askedForIdeas(ai)).toBe(true);
    expect(lastPrompt(ai)).toContain('le plus souvent aucune');
    expect(ai.calls.at(-1).params.reasoningEffort).toBe('medium');
    expect(typeof (await meetingOf(db, 'live-pilot')).aiHelp.ideasLookedAt).toBe('string');
  });

  it('« Normales » : rien d’autre avant dix minutes après une idée', async () => {
    const { app, ai, db } = await build({
      openai: {
        chat: inTurn(
          says('Comparer les pénalités de retard des deux offres'),
          says('Demander une référence client à Atlas'),
        ),
      },
    });
    await start(app);
    expect((await watch(app)).json().items).toHaveLength(1);

    expect((await watch(app)).json().items).toEqual([]);
    expect(askedForIdeas(ai)).toBe(false);
    expect(ai.calls.at(-1).params.reasoningEffort).toBe('low');

    await age(db, 9 * MIN);
    expect((await watch(app)).json().items).toEqual([]);
    expect(askedForIdeas(ai)).toBe(false);

    await age(db, 2 * MIN);
    const res = await watch(app);
    expect(askedForIdeas(ai)).toBe(true);
    expect(res.json().items).toEqual([
      expect.objectContaining({ kind: 'idea', title: 'Demander une référence client à Atlas' }),
    ]);
  });

  it('demandée sans réponse, l’idée n’est redemandée que deux minutes plus tard', async () => {
    const { app, ai, db } = await build({ openai: { chat: '{"interventions":[]}' } });
    await start(app);
    await watch(app);
    expect(askedForIdeas(ai)).toBe(true);
    await watch(app);
    expect(askedForIdeas(ai)).toBe(false);
    await age(db, 2 * MIN);
    await watch(app);
    expect(askedForIdeas(ai)).toBe(true);
  });

  it('la même idée, dite autrement, n’est pas reproposée — et le modèle la voit déjà dite', async () => {
    const { app, ai, db } = await build({
      openai: {
        chat: inTurn(
          says('Vérifier le délai de livraison du fournisseur'),
          says('Délais de livraison : vérifier auprès du fournisseur'),
        ),
      },
    });
    await start(app);
    await watch(app);
    await age(db, 11 * MIN);
    const res = await watch(app);
    expect(res.json().items).toEqual([]);
    expect(lastPrompt(ai)).toContain(
      '<deja_signale>\n- Vérifier le délai de livraison du fournisseur',
    );
    expect((await meetingOf(db, 'live-pilot')).aiHelp.items).toHaveLength(1);
  });

  it('une idée ancienne reste rappelée au modèle, même après douze autres interventions', async () => {
    const { app, ai, db } = await build({ openai: { chat: '{"interventions":[]}' } });
    await start(app);
    const at = new Date(Date.now() - 60 * MIN).toISOString();
    const item = (n, kind, title) => ({ id: n.toString(16).padStart(32, '0'), kind, at, title });
    await db.collection('resume').updateOne(
      { meetingId: 'live-pilot' },
      {
        $set: {
          'aiHelp.items': [
            item(1, 'idea', 'Mutualiser le transport avec le site de Nantes'),
            ...Array.from({ length: 12 }, (_, i) => item(i + 2, 'alert', `Alerte ${i + 1}`)),
          ],
        },
      },
    );
    await watch(app);
    expect(askedForIdeas(ai)).toBe(true);
    expect(lastPrompt(ai)).toContain('- Mutualiser le transport avec le site de Nantes');
  });

  it('« Discrètes » : jamais d’idée ; « Soutenues » : cinq minutes suffisent', async () => {
    const quiet = await build({ openai: { chat: says('Comparer les pénalités de retard') } });
    await post(quiet.app, '/admin/settings/ai-help', { pace: 'quiet' }, ADMIN);
    await start(quiet.app);
    expect((await watch(quiet.app)).json().items).toEqual([]);
    expect(askedForIdeas(quiet.ai)).toBe(false);

    const busy = await build({
      openai: {
        chat: inTurn(
          says('Comparer les pénalités de retard des deux offres'),
          says('Demander une référence client à Atlas'),
        ),
      },
    });
    await post(busy.app, '/admin/settings/ai-help', { pace: 'busy' }, ADMIN);
    await start(busy.app);
    await watch(busy.app);
    await age(busy.db, 6 * MIN);
    expect((await watch(busy.app)).json().items).toHaveLength(1);
  });

  it('seule la boîte à idées allumée, et aucune idée permise : pas d’appel au modèle', async () => {
    const { app, ai } = await build({ openai: { chat: says('Comparer les pénalités de retard') } });
    await start(app, { project: false, qa: true, agenda: false, ideas: true });
    await watch(app, 'Bonjour à tous.');
    expect(chatCalls(ai)).toBe(0);
    await watch(app);
    expect(chatCalls(ai)).toBe(1);
  });
});

describe('Aide IA — l’ordre du jour dicté pendant la réunion', () => {
  const watch = (app, fresh = 'On continue.') =>
    post(app, '/ai-help/watch', { meetingId: 'live-pilot', before: 'Bonjour à tous.', fresh });
  const ask = (app, question) =>
    post(app, '/ai-help/ask', { meetingId: 'live-pilot', question, voice: true });
  /**
   * Un modèle qui rend ses réponses dans l'ordre, puis se tait. La préparation
   * d'une recherche myBrain n'en consomme aucune : elle ne rend rien d'utile ici.
   */
  const script = (...replies) => ({
    chat: (params) =>
      isSearchPlan(params) ? '{}' : JSON.stringify(replies.shift() || { interventions: [] }),
  });
  const start = (app, agenda) =>
    open(app, 'live-pilot', PILOT, { projectMode: 'none', ...(agenda ? { agenda } : {}) });
  const point = (label, state = 'todo', heard = false) => ({ label, state, heard });

  it('retient les points annoncés à voix haute, sans rien de saisi, et le dit', async () => {
    const { app, ai, db } = await build({
      openai: script({
        interventions: [],
        agenda_new: ['Budget 2027', '- Recrutement', '', 'Planning du lot 2'],
        // Non demandé tant qu'aucun point n'existe : ignoré, pas de rappel de
        // fin sur des points annoncés dans la même phrase.
        ending: true,
      }),
    });
    await start(app);
    const res = await watch(
      app,
      'À l’ordre du jour : le budget 2027, le recrutement, le planning.',
    );

    expect(res.json().agenda).toEqual([
      point('Budget 2027', 'todo', true),
      point('Recrutement', 'todo', true),
      point('Planning du lot 2', 'todo', true),
    ]);
    // Elle le dit — une intervention sans texte : l'écran en fait le titre.
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0]).toMatchObject({
      kind: 'agenda',
      event: 'noted',
      title: '',
      points: [
        { label: 'Budget 2027', state: 'todo' },
        { label: 'Recrutement', state: 'todo' },
        { label: 'Planning du lot 2', state: 'todo' },
      ],
    });
    const stored = (await meetingOf(db, 'live-pilot')).aiHelp;
    expect(stored.agenda).toBe('Budget 2027\nRecrutement\nPlanning du lot 2');
    expect(stored.agendaHeard).toEqual(['budget 2027', 'recrutement', 'planning du lot 2']);

    // Sans point, la consigne écoute — et ne parle ni d'oubli ni de fin.
    const prompt = lastPrompt(ai);
    expect(prompt).toContain("<ordre_du_jour>\n(aucun point pour l'instant)\n</ordre_du_jour>");
    expect(prompt).toContain('"agenda_new"');
    expect(prompt).not.toContain('"ending"');
    expect(prompt).not.toContain('"agenda" (ordre du jour)');
  });

  it('ne remet ni un point déjà là, ni un point que l’utilisateur a retiré', async () => {
    const { app } = await build({
      openai: script(
        { interventions: [], agenda_new: ['BUDGET.', 'Recrutement'] },
        { interventions: [], agenda_new: ['Recrutement'] },
        { answer: 'C’est ajouté.', agenda_add: ['Recrutement'] },
      ),
    });
    await start(app, 'Budget');
    expect((await watch(app)).json().agenda).toEqual([
      point('Budget'),
      point('Recrutement', 'todo', true),
    ]);

    const removed = await post(app, '/ai-help/session', {
      meetingId: 'live-pilot',
      agendaRemove: 'recrutement',
    });
    expect(removed.json().session.agendaState).toEqual([point('Budget')]);

    // Redit en réunion : il ne revient pas, et rien n'est annoncé.
    const again = await watch(app);
    expect(again.json().agenda).toEqual([point('Budget')]);
    expect(again.json().items).toEqual([]);

    // Demandé expressément à l'IA : il revient.
    const asked = await ask(app, 'Ajoute le recrutement à l’ordre du jour');
    expect(asked.json().agenda).toEqual([point('Budget'), point('Recrutement', 'todo', true)]);
    expect(asked.json().item.points).toEqual([
      { label: 'Budget', state: 'todo' },
      { label: 'Recrutement', state: 'todo' },
    ]);
  });

  it('un point traité le reste, même si une lecture suivante ne le voit plus', async () => {
    const { app, ai } = await build({
      openai: script(
        {
          interventions: [],
          agenda: [
            { point: 1, state: 'done' },
            { point: 2, state: 'now' },
          ],
        },
        {
          interventions: [],
          agenda: [
            { point: 1, state: 'todo' },
            { point: 2, state: 'todo' },
            { point: 3, state: 'now' },
          ],
        },
      ),
    });
    await start(app, 'Avancement\nRisques\nBudget');
    await watch(app);
    const res = await watch(app);

    expect(res.json().agenda).toEqual([
      point('Avancement', 'done'),
      point('Risques', 'now'),
      point('Budget', 'now'),
    ]);
    // Le modèle relit l'état connu de chaque point.
    expect(lastPrompt(ai)).toContain(
      '1. Avancement — traité\n2. Risques — en cours\n3. Budget — pas encore abordé',
    );
  });

  it('la réunion se termine : rappelle ce qui n’a jamais été abordé, une seule fois', async () => {
    const closing = {
      interventions: [
        {
          kind: 'agenda',
          title: 'Risques et budget n’ont pas été abordés',
          body: 'À traiter maintenant, ou à reporter à jeudi.',
        },
      ],
      agenda: [{ point: 1, state: 'done' }],
      ending: true,
    };
    const { app, ai, db } = await build({ openai: script(closing, closing) });
    await start(app, 'Avancement\nRisques\nBudget');
    const res = await watch(app, 'Merci à tous, on s’arrête là.');

    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0]).toMatchObject({
      kind: 'agenda',
      event: 'closing',
      title: 'Risques et budget n’ont pas été abordés',
      points: [
        { label: 'Avancement', state: 'done' },
        { label: 'Risques', state: 'todo' },
        { label: 'Budget', state: 'todo' },
      ],
    });
    expect(lastPrompt(ai)).toContain('"ending"');
    expect((await meetingOf(db, 'live-pilot')).aiHelp.closing.todo).toBe('budget|risques');

    // « Bonne journée » juste après : les mêmes points ne sont pas redits.
    expect((await watch(app, 'Bonne journée.')).json().items).toEqual([]);
  });

  it('fin de réunion sans un mot du modèle : la liste des points part quand même', async () => {
    const { app } = await build({
      openai: script({ interventions: [], agenda: [{ point: 1, state: 'done' }], ending: true }),
    });
    await start(app, 'Avancement\nRisques');
    const [item] = (await watch(app, 'Merci, à la semaine prochaine.')).json().items;
    expect(item).toMatchObject({ kind: 'agenda', event: 'closing', title: '', body: '' });
    expect(item.points).toEqual([
      { label: 'Avancement', state: 'done' },
      { label: 'Risques', state: 'todo' },
    ]);
  });

  it('tout a été traité, ou interventions « Discrètes » : aucun rappel de fin', async () => {
    const done = await build({
      openai: script({
        interventions: [{ kind: 'agenda', title: 'Il reste des points', body: 'Faux.' }],
        agenda: [
          { point: 1, state: 'done' },
          { point: 2, state: 'done' },
        ],
        ending: true,
      }),
    });
    await start(done.app, 'Avancement\nRisques');
    expect((await watch(done.app, 'Merci à tous.')).json().items).toEqual([]);

    const quiet = await build({
      openai: script({ interventions: [], agenda: [{ point: 1, state: 'done' }], ending: true }),
    });
    await post(quiet.app, '/admin/settings/ai-help', { pace: 'quiet' }, ADMIN);
    await start(quiet.app, 'Avancement\nRisques');
    expect((await watch(quiet.app, 'Merci à tous.')).json().items).toEqual([]);
    expect(lastPrompt(quiet.ai)).not.toContain('"ending"');
  });

  it('restitue l’ordre du jour et dit s’il a été tenu', async () => {
    const { app, ai, db } = await build({
      openai: script({
        answer: 'Non : les risques n’ont pas été abordés.',
        source: '',
        agenda: [{ point: 1, state: 'done' }],
      }),
    });
    await start(app, 'Avancement\nRisques');
    const res = await ask(app, 'L’ordre du jour a-t-il été tenu ?');

    expect(res.json().item).toMatchObject({
      kind: 'answer',
      body: 'Non : les risques n’ont pas été abordés.',
      points: [
        { label: 'Avancement', state: 'done' },
        { label: 'Risques', state: 'todo' },
      ],
    });
    expect(res.json().agenda).toEqual([point('Avancement', 'done'), point('Risques')]);
    expect((await meetingOf(db, 'live-pilot')).aiHelp.agendaState).toEqual([
      { label: 'Avancement', state: 'done' },
      { label: 'Risques', state: 'todo' },
    ]);
    const prompt = lastPrompt(ai);
    expect(prompt).toContain(
      '<ordre_du_jour>\n1. Avancement — pas encore abordé\n2. Risques — pas encore abordé',
    );
    expect(prompt).toContain("On te demande s'il a été tenu");
  });

  it('« Alfred, à l’ordre du jour : … » : les points dictés sont retenus', async () => {
    const { app, db } = await build({
      openai: script({
        answer: 'C’est noté : trois points.',
        agenda_add: ['Budget', 'Planning', 'Recrutement'],
      }),
    });
    await start(app);
    const res = await ask(app, 'À l’ordre du jour : le budget, le planning et le recrutement');

    expect(res.json().agenda).toEqual([
      point('Budget', 'todo', true),
      point('Planning', 'todo', true),
      point('Recrutement', 'todo', true),
    ]);
    expect(res.json().item.points).toHaveLength(3);
    expect((await meetingOf(db, 'live-pilot')).aiHelp.agenda).toBe('Budget\nPlanning\nRecrutement');
  });

  it('une question sans rapport ne touche pas à l’ordre du jour', async () => {
    const { app } = await build({ openai: script({ answer: 'Le 15 mars 2027.', source: '' }) });
    await start(app, 'Avancement');
    const res = await ask(app, 'Rappelle-moi la date de livraison');
    expect(res.json().agenda).toBeUndefined();
    expect(res.json().item.points).toBeUndefined();
  });

  it('domaine éteint : rien n’est retenu, ni lu, ni restitué', async () => {
    const { app, ai, db } = await build({
      openai: script(
        { interventions: [], agenda_new: ['Budget'], ending: true },
        { answer: 'Je ne suis pas l’ordre du jour.', agenda_add: ['Budget'] },
      ),
    });
    await post(app, '/ai-help/session', {
      meetingId: 'live-pilot',
      enabled: true,
      domains: { ...ALL_ON, agenda: false },
      projectMode: 'none',
    });
    // Une réunion engagée : la boîte à idées, seule allumée, fait partir la lecture.
    const res = await post(app, '/ai-help/watch', {
      meetingId: 'live-pilot',
      before: 'On fait le point sur le lot 2. '.repeat(120),
      fresh: 'À l’ordre du jour : le budget.',
    });
    expect(res.json()).toMatchObject({ agenda: [], items: [] });
    expect(chatCalls(ai)).toBe(1);
    expect(lastPrompt(ai)).not.toContain('<ordre_du_jour>');

    const asked = await ask(app, 'Ajoute le budget à l’ordre du jour');
    expect(asked.json().agenda).toBeUndefined();
    expect(lastPrompt(ai)).not.toContain('agenda_add');
    expect((await meetingOf(db, 'live-pilot')).aiHelp.agenda).toBeUndefined();
  });

  it('au pupitre : un point ajouté ou retiré à la fois, sans doublon', async () => {
    const { app } = await build();
    await start(app);
    const edit = async (body) =>
      (await post(app, '/ai-help/session', { meetingId: 'live-pilot', ...body })).json().session;

    expect((await edit({ agendaAdd: '  Budget  ' })).agendaState).toEqual([point('Budget')]);
    expect((await edit({ agendaAdd: 'budget !' })).agenda).toBe('Budget');
    expect((await edit({ agendaAdd: 'Risques' })).agenda).toBe('Budget\nRisques');
    expect((await edit({ agendaRemove: 'BUDGET' })).agendaState).toEqual([point('Risques')]);
  });
});

describe('Aide IA — les questions', () => {
  const ask = (app, body = {}, meetingId = 'live-pilot', email = PILOT) =>
    post(
      app,
      '/ai-help/ask',
      { meetingId, question: 'Rappelle-moi la date de livraison du lot 2', voice: true, ...body },
      email,
    );
  const ANSWER = JSON.stringify({
    answer: 'Le lot 2 est attendu le 15 mars 2027.',
    source: 'projet atlas',
  });

  it('répond avec ce que myBrain sait, situe la question par le projet, cite la fiche', async () => {
    const { app, ai, db, myBrain } = await build({ openai: { chat: ANSWER } });
    await open(app, 'live-pilot', PILOT, { projectPath: 'wiki/projets/atlas.md' });
    const res = await ask(app, { transcript: 'Hugo : le prestataire tient la mi-mars.' });

    expect(res.statusCode).toBe(200);
    expect(res.json().item).toMatchObject({
      kind: 'answer',
      question: 'Rappelle-moi la date de livraison du lot 2',
      voice: true,
      body: 'Le lot 2 est attendu le 15 mars 2027.',
      source: { path: 'wiki/projets/atlas.md', title: 'Projet Atlas' },
    });
    expect(myBrain.calls.find((call) => call.method === 'context')).toMatchObject({
      method: 'context',
      question: 'Rappelle-moi la date de livraison du lot 2 — Projet Atlas',
    });
    const prompt = lastPrompt(ai);
    expect(prompt).toContain('<connaissances fiches="Projet Atlas">');
    expect(prompt).toContain('livraison du lot 2 : 15 mars 2027');
    expect(prompt).toContain('le prestataire tient la mi-mars');
    expect((await meetingOf(db, 'live-pilot')).aiHelp.calls.ask).toBe(1);
  });

  it('une source que myBrain n’a pas rendue n’est pas citée', async () => {
    const { app } = await build({
      openai: { chat: JSON.stringify({ answer: 'Mi-mars.', source: 'Fiche inventée' }) },
    });
    await open(app);
    expect((await ask(app)).json().item.source).toBeNull();
  });

  it('sans myBrain : la réunion pour seule source, aucun appel au cerveau', async () => {
    const { app, ai, myBrain } = await build({ openai: { chat: ANSWER } });
    await open(app, 'live-talker', TALKER);
    const res = await ask(app, { voice: false }, 'live-talker', TALKER);

    expect(res.json().item).toMatchObject({ voice: false, source: null });
    expect(lastPrompt(ai)).not.toContain('<connaissances');
    expect(lastPrompt(ai)).toContain("Tu n'as pas accès au wiki de l'organisation");
    // Le compte n'a pas le droit « avec myBrain » : la réponse le dit.
    expect(res.json().item.knowledge).toBe('no_right');
    expect(myBrain.calls.filter((call) => call.method === 'context')).toHaveLength(0);
  });

  it('myBrain en panne : une réponse quand même, tirée de la réunion', async () => {
    const { app } = await build({
      openai: { chat: ANSWER },
      myBrain: {
        context: () => {
          throw new MyBrainError('mybrain_rate_limited', { status: 429, retryable: true });
        },
      },
    });
    await open(app);
    const res = await ask(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ notice: 'mybrain_rate_limited', item: { source: null } });
  });

  it('réponse vide du modèle : 502', async () => {
    const mute = await build({ openai: { chat: '{"answer":""}' } });
    await open(mute.app);
    const empty = await ask(mute.app);
    expect(empty.statusCode).toBe(502);
    expect(empty.json().error).toBe('ai_help_no_answer');
  });
});

describe('Aide IA — le dossier du tag de la réunion', () => {
  const CONTEXT = 'Rénovation du siège. Cliente : Claire Martin. PAC = pompe à chaleur.';
  /** La réunion de TALKER (sans myBrain : rien d'autre ne s'en mêle) porte le tag `t-atlas`. */
  const tagged = (tagOwner = TALKER, context = CONTEXT) => {
    const seeded = seed();
    seeded.resume = seeded.resume.map((doc) =>
      doc.meetingId === 'live-talker' ? { ...doc, tagId: 't-atlas' } : doc,
    );
    seeded.userTags = [
      owned(tagOwner, {
        id: 't-atlas',
        label: 'Projet Atlas',
        labelLower: 'projet atlas',
        ...(context ? { context } : {}),
      }),
    ];
    return seeded;
  };
  const watch = (app) =>
    post(app, '/ai-help/watch', { meetingId: 'live-talker', fresh: 'On parle de la PAC.' }, TALKER);
  const ask = (app) =>
    post(
      app,
      '/ai-help/ask',
      { meetingId: 'live-talker', question: 'Qui est la cliente ?', voice: false },
      TALKER,
    );

  it('la lecture du passage reçoit le dossier, déclaré éclairage et non fait de la réunion', async () => {
    const { app, ai } = await build({ seed: tagged() });
    await open(app, 'live-talker', TALKER);
    expect((await watch(app)).statusCode).toBe(200);
    const prompt = lastPrompt(ai);
    expect(prompt).toContain('<dossier titre="Projet Atlas">');
    expect(prompt).toContain('Cliente : Claire Martin.');
    expect(prompt).toContain('ne le présente jamais comme dit en réunion');
  });

  it('une question peut y trouver sa réponse : le dossier rejoint les sources', async () => {
    const { app, ai } = await build({
      seed: tagged(),
      openai: { chat: JSON.stringify({ answer: 'Claire Martin.', source: '' }) },
    });
    await open(app, 'live-talker', TALKER);
    expect((await ask(app)).statusCode).toBe(200);
    const prompt = lastPrompt(ai);
    expect(prompt).toContain('<dossier titre="Projet Atlas">');
    expect(prompt).toContain('cette réunion, <organisation>, <dossier> et <utilisateur>');
  });

  it('le tag d’un AUTRE compte, même d’id identique, ne prête rien', async () => {
    const { app, ai } = await build({ seed: tagged(PILOT) });
    await open(app, 'live-talker', TALKER);
    await watch(app);
    expect(lastPrompt(ai)).not.toContain('<dossier');
    expect(lastPrompt(ai)).not.toContain('Claire Martin');
  });

  it('avec myBrain : les noms du dossier préparent la recherche, sans appel de plus', async () => {
    const seeded = seed();
    seeded.resume = seeded.resume.map((doc) =>
      doc.meetingId === 'live-pilot' ? { ...doc, tagId: 't-atlas' } : doc,
    );
    seeded.userTags = [
      owned(PILOT, {
        id: 't-atlas',
        label: 'Projet Atlas',
        labelLower: 'projet atlas',
        context: 'Acteurs : Claire Martin, cliente ; Hugo Bernard. PAC = pompe à chaleur.',
      }),
    ];
    const { app, ai } = await build({
      seed: seeded,
      openai: { chat: JSON.stringify({ answer: 'Hugo Bernard.', source: '' }) },
    });
    await open(app);
    const before = chatCalls(ai);
    await post(app, '/ai-help/ask', {
      meetingId: 'live-pilot',
      question: 'Que doit envoyer Hugo Bernar ?',
      voice: true,
    });
    const plan = planPrompt(ai);
    expect(plan).toContain('Claire Martin');
    expect(plan).toContain('Hugo Bernard');
    expect(plan).toContain('PAC');
    // Deux appels comme avant : la préparation de la recherche, puis la réponse.
    expect(chatCalls(ai) - before).toBe(2);
  });

  it('un tag sans contexte : ni bloc ni consigne', async () => {
    const { app, ai } = await build({ seed: tagged(TALKER, '') });
    await open(app, 'live-talker', TALKER);
    await ask(app);
    expect(lastPrompt(ai)).not.toContain('<dossier');
    expect(lastPrompt(ai)).toContain('cette réunion, <organisation> et <utilisateur>');
  });
});

describe('Aide IA — questions-réponses coupées : les gestes restent', () => {
  const NO_QA = { ...ALL_ON, qa: false };
  const reply = (body) => ({ openai: { chat: JSON.stringify(body) } });
  const withTags = () => {
    const seeded = seed();
    seeded.userTags = [owned(PILOT, { id: 'tag-atlas', label: 'Atlas', labelLower: 'atlas' })];
    return seeded;
  };
  const ask = (app, question) =>
    post(app, '/ai-help/ask', { meetingId: 'live-pilot', question, voice: true });

  it('« ajoute le tag » passe — sans myBrain, avec une consigne qui ne permet que les gestes', async () => {
    const { app, ai, myBrain } = await build({
      seed: withTags(),
      ...reply({ command: true, answer: '', actions: [{ type: 'tag', name: 'Atlas' }] }),
    });
    await open(app, 'live-pilot', PILOT, { domains: NO_QA });
    const res = await ask(app, 'Ajoute le tag Atlas');

    expect(res.statusCode).toBe(200);
    expect(res.json().actions).toEqual([{ type: 'tag', tagId: 'tag-atlas' }]);
    expect(res.json().item).toMatchObject({
      acts: [{ type: 'tag', label: 'Atlas', ok: true, tagId: 'tag-atlas' }],
      knowledge: 'none',
    });
    // Un seul appel : ni préparation de recherche, ni lecture de myBrain.
    expect(chatCalls(ai)).toBe(1);
    expect(myBrain.calls.filter((call) => call.method !== 'whoami')).toHaveLength(0);
    const prompt = lastPrompt(ai);
    expect(prompt).toContain('QUESTIONS-RÉPONSES SONT COUPÉES');
    expect(prompt).toContain('<demande>\nAjoute le tag Atlas\n</demande>');
    expect(prompt).toContain('"command"');
    expect(prompt).not.toContain('<connaissances');
  });

  it('une question : 409 « coupées », l’appel compté, rien de gardé ni de montré', async () => {
    const { app, ai, db } = await build(
      reply({ command: false, answer: 'Le lot 2 est attendu le 15 mars.', actions: [] }),
    );
    await open(app, 'live-pilot', PILOT, { domains: NO_QA });
    const res = await ask(app, 'Quand est attendu le lot 2 ?');

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('ai_help_domain_off');
    expect(chatCalls(ai)).toBe(1);
    const { aiHelp } = await meetingOf(db, 'live-pilot');
    expect(aiHelp.calls.ask).toBe(1);
    expect(aiHelp.items || []).toHaveLength(0);
  });

  it('le modèle qui répond quand même — en clair, ou sans se dire geste — n’est pas cru', async () => {
    const plain = await build({ openai: { chat: 'Le lot 2 est attendu le 15 mars.' } });
    await open(plain.app, 'live-pilot', PILOT, { domains: NO_QA });
    expect((await ask(plain.app, 'Et le lot 2 ?')).statusCode).toBe(409);

    // « command » oublié, mais un geste nommé : le geste compte, la réponse non.
    const mixed = await build({
      seed: withTags(),
      ...reply({ answer: 'Le lot 2 est en retard.', actions: [{ type: 'tag', name: 'Atlas' }] }),
    });
    await open(mixed.app, 'live-pilot', PILOT, { domains: NO_QA });
    const res = await ask(mixed.app, 'Ajoute le tag Atlas et dis-moi pour le lot 2');
    expect(res.statusCode).toBe(200);
    expect(res.json().item.body).toBe('');
    expect(res.json().actions).toEqual([{ type: 'tag', tagId: 'tag-atlas' }]);
  });

  it('« ferme » : un geste sans carte ; dicter l’ordre du jour reste, l’interroger non', async () => {
    const close = await build(reply({ command: true, answer: '', actions: [{ type: 'close' }] }));
    await open(close.app, 'live-pilot', PILOT, { domains: NO_QA });
    const closed = await ask(close.app, 'Ferme');
    expect(closed.statusCode).toBe(200);
    expect(closed.json()).toMatchObject({ item: null, actions: [{ type: 'close' }] });

    const dictate = await build(
      reply({
        command: true,
        answer: 'C’est noté.',
        agenda_add: ['Budget'],
        agenda: [{ point: 1, state: 'done' }],
        actions: [],
      }),
    );
    await open(dictate.app, 'live-pilot', PILOT, { domains: NO_QA });
    const res = await ask(dictate.app, 'À l’ordre du jour : le budget');
    expect(res.statusCode).toBe(200);
    expect(res.json().item).toMatchObject({ body: 'C’est noté.' });
    expect(res.json().agenda).toMatchObject([{ label: 'Budget', state: 'todo' }]);
    const prompt = lastPrompt(dictate.ai);
    expect(prompt).toContain("ce sont des questions, tu n'y réponds pas");
    expect(prompt).not.toContain('restitue-le');
  });
});

describe('Aide IA — les interventions gardées', () => {
  async function withItem() {
    const built = await build({
      openai: {
        chat: JSON.stringify({ interventions: [{ kind: 'idea', title: 'Un lot 2 bis ?' }] }),
      },
    });
    await open(built.app, 'live-pilot', PILOT, { projectMode: 'none' });
    // Une idée ne se demande qu'à une réunion engagée : de la matière avant.
    const res = await post(built.app, '/ai-help/watch', {
      meetingId: 'live-pilot',
      before: 'On fait le point sur le lot 2. '.repeat(120),
      fresh: 'On en parle.',
    });
    return { ...built, item: res.json().items[0] };
  }

  it('acquitter une intervention ; elle revient ainsi à la relecture de la session', async () => {
    const { app, item } = await withItem();
    const res = await post(app, '/ai-help/item', {
      meetingId: 'live-pilot',
      itemId: item.id,
      state: 'acknowledged',
    });
    expect(res.json()).toEqual({ ok: true, itemId: item.id, state: 'acknowledged' });
    const session = (await post(app, '/ai-help/session', { meetingId: 'live-pilot' })).json()
      .session;
    expect(session.items).toEqual([{ ...item, state: 'acknowledged' }]);
  });

  it('un identifiant inconnu, mal formé, ou la réunion d’un autre : refusé', async () => {
    const { app, item } = await withItem();
    const body = { meetingId: 'live-pilot', itemId: item.id, state: 'dismissed' };
    expect((await post(app, '/ai-help/item', { ...body, itemId: 'f'.repeat(32) })).statusCode).toBe(
      404,
    );
    expect(
      (await post(app, '/ai-help/item', { ...body, itemId: `${'a'.repeat(27)}.$set` })).statusCode,
    ).toBe(400);
    expect((await post(app, '/ai-help/item', body, TALKER)).statusCode).toBe(404);
  });
});

describe('Aide IA — projets et tags', () => {
  it('cherche un projet : les fiches de projet d’abord', async () => {
    const { app, myBrain } = await build({
      myBrain: {
        search: () => [
          { path: 'wiki/clients/atlas-sa.md', title: 'Atlas SA', type: 'client', excerpt: '' },
          { path: 'wiki/projets/atlas.md', title: 'Projet Atlas', type: 'projet', excerpt: '' },
        ],
      },
    });
    const res = await get(app, '/ai-help/projects?q=atlas');
    expect(res.json().projects).toEqual([
      { path: 'wiki/projets/atlas.md', title: 'Projet Atlas', type: 'projet' },
    ]);
    expect(myBrain.calls.at(-1)).toMatchObject({ method: 'search', query: 'atlas' });

    expect((await get(app, '/ai-help/projects?q=a')).json().projects).toEqual([]);
    expect((await get(app, '/ai-help/projects?q=atlas', TALKER)).statusCode).toBe(409);
  });

  it('relier un tag à un projet, le voir dans /tags, le garder à un renommage, le délier', async () => {
    const seeded = seed({
      userTags: [
        owned(PILOT, {
          id: 'tag-atlas',
          label: 'Atlas',
          labelLower: 'atlas',
          color: 'teal',
          shape: 'circle',
        }),
      ],
    });
    const { app } = await build({ seed: seeded });
    const linked = await post(app, '/ai-help/tag-project', {
      tagId: 'tag-atlas',
      path: 'wiki/projets/atlas.md',
    });
    const project = { path: 'wiki/projets/atlas.md', title: 'Projet Atlas' };
    expect(linked.json()).toEqual({ tagId: 'tag-atlas', project });

    await post(app, '/tags/save', { id: 'tag-atlas', label: 'Projet Atlas', color: 'teal' });
    expect((await get(app, '/tags')).json().tags[0]).toMatchObject({
      label: 'Projet Atlas',
      myBrainProject: project,
    });

    const foreign = await post(app, '/ai-help/tag-project', { tagId: 'tag-atlas' }, TALKER);
    expect(foreign.statusCode).toBe(404);
    expect(
      (await post(app, '/ai-help/tag-project', { tagId: 'tag-atlas' })).json().project,
    ).toBeNull();
    expect((await get(app, '/tags')).json().tags[0].myBrainProject).toBeUndefined();
  });
});

describe('Aide IA — administration', () => {
  it('réservé aux administrateurs ; mot d’appel nettoyé, vide = défaut', async () => {
    const { app } = await build({ droits: ['nourrir'] });
    expect((await get(app, '/admin/settings/ai-help', PILOT)).statusCode).toBe(403);

    const view = (await get(app, '/admin/settings/ai-help', ADMIN)).json();
    expect(view.settings).toMatchObject({ domains: ALL_ON, wakeWord: 'Alfred', pace: 'normal' });
    expect(view.myBrain).toEqual({ connected: true, canRead: false });

    const saved = await post(
      app,
      '/admin/settings/ai-help',
      { wakeWord: '  Jarvis !! ', pace: 'quiet' },
      ADMIN,
    );
    expect(saved.json().settings).toMatchObject({
      wakeWord: 'Jarvis',
      pace: 'quiet',
      updatedBy: ADMIN,
    });
    const cleared = await post(app, '/admin/settings/ai-help', { wakeWord: '' }, ADMIN);
    expect(cleared.json().settings.wakeWord).toBe('Alfred');
  });
});

describe('Aide IA — ce qu’elle sait de celui qui l’utilise', () => {
  const ANSWER = JSON.stringify({ answer: 'Vous pilotez le projet Atlas.', source: '' });
  const ask = (app, question, email = PILOT, meetingId = 'live-pilot') =>
    post(app, '/ai-help/ask', { meetingId, question }, email);

  it('son nom, son contexte personnel et celui de l’organisation entrent dans les deux consignes', async () => {
    const seeded = seed({
      userConfig: [owned(PILOT, { context: 'Directrice de projet, pilote le portail client.' })],
    });
    const { app, ai } = await build({ seed: seeded, openai: { chat: ANSWER } });
    await app.settings.updateOrgContext({ context: 'Éditeur de logiciels pour le bâtiment.' });
    await open(app, 'live-pilot', PILOT, { agenda: 'Avancement' });

    await ask(app, 'Qui suis-je ?');
    for (const expected of [
      'Tu assistes camille, qui a lancé cette réunion',
      '<utilisateur nom="camille">',
      'Directrice de projet, pilote le portail client.',
      '<organisation>\nÉditeur de logiciels pour le bâtiment.',
    ]) {
      expect(lastPrompt(ai)).toContain(expected);
    }

    await post(app, '/ai-help/watch', { meetingId: 'live-pilot', fresh: 'On avance.' });
    expect(lastPrompt(ai)).toContain('<utilisateur nom="camille">');
    expect(lastPrompt(ai)).toContain('Directrice de projet, pilote le portail client.');
  });

  it('le contexte d’un autre compte n’entre jamais dans la consigne', async () => {
    const seeded = seed({ userConfig: [owned(TALKER, { context: 'Secret de Hugo.' })] });
    const { app, ai } = await build({ seed: seeded, openai: { chat: ANSWER } });
    await open(app);
    await ask(app, 'Qui suis-je ?');
    expect(lastPrompt(ai)).not.toContain('Secret de Hugo.');
  });

  it('avec myBrain : sa fiche est cherchée par son nom, une fois, et jointe', async () => {
    const { app, ai, myBrain } = await build({
      openai: { chat: ANSWER },
      myBrain: {
        sheet: (payload) =>
          payload.name === 'camille'
            ? {
                path: 'wiki/personnes/camille.md',
                title: 'Camille',
                content: 'Responsable du lot 2.',
              }
            : {
                path: payload.path || 'wiki/projets/atlas.md',
                title: 'Projet Atlas',
                content: 'x',
              },
      },
    });
    await open(app, 'live-pilot', PILOT, { projectMode: 'none' });
    await ask(app, 'Qui suis-je ?');
    expect(lastPrompt(ai)).toContain(
      "Sa fiche dans le wiki de l'organisation :\nResponsable du lot 2.",
    );
    await ask(app, 'Et mon rôle ?');
    expect(
      myBrain.calls.filter((call) => call.method === 'sheet' && call.name === 'camille'),
    ).toHaveLength(1);
  });
});

describe('Aide IA — ce que myBrain apporte à une réponse', () => {
  const ask = (app, question) => post(app, '/ai-help/ask', { meetingId: 'live-pilot', question });
  const reply = (source = '') =>
    JSON.stringify({ answer: 'AMBRE est le projet de portail de Marquet.', source });

  it('contexte vide : la recherche par mots-clés prend le relais et lit les fiches trouvées', async () => {
    const { app, ai, myBrain } = await build({
      openai: { chat: reply('Projet AMBRE') },
      myBrain: {
        context: () => ({ context: '', truncated: false, sheets: [] }),
        search: () => [
          { path: 'wiki/projets/ambre.md', title: 'Projet AMBRE', type: 'projet', excerpt: '' },
        ],
        sheet: (payload) => {
          if (payload.name) throw new MyBrainError('mybrain_not_found', { status: 404 });
          return {
            path: payload.path,
            title: 'Projet AMBRE',
            content: 'Refonte du portail client de Marquet.',
          };
        },
      },
    });
    await open(app, 'live-pilot', PILOT, { projectMode: 'none' });
    const res = await ask(app, 'C’est quoi le projet AMBRE ?');

    expect(myBrain.calls.find((call) => call.method === 'search')).toMatchObject({
      query: 'AMBRE',
    });
    expect(lastPrompt(ai)).toContain('Refonte du portail client de Marquet.');
    expect(res.json().item).toMatchObject({
      knowledge: 'used',
      source: { path: 'wiki/projets/ambre.md', title: 'Projet AMBRE' },
    });
  });

  it('myBrain ne sait rien : la réponse le porte, et la consigne ne prétend pas avoir cherché', async () => {
    const { app, ai } = await build({
      openai: { chat: reply() },
      myBrain: {
        context: () => ({ context: '', truncated: false, sheets: [] }),
        search: () => [],
        sheet: () => {
          throw new MyBrainError('mybrain_not_found', { status: 404 });
        },
      },
    });
    await open(app, 'live-pilot', PILOT, { projectMode: 'none' });
    const res = await ask(app, 'C’est quoi le projet AMBRE ?');
    expect(res.json().item.knowledge).toBe('empty');
    expect(lastPrompt(ai)).toContain(
      "Le wiki de l'organisation ne t'a rien fourni sur cette question",
    );
  });

  it('matière fournie mais aucune fiche citée : « offered » ; myBrain en panne : « down »', async () => {
    const offered = await build({ openai: { chat: reply() } });
    await open(offered.app);
    expect((await ask(offered.app, 'Où en est-on ?')).json().item.knowledge).toBe('offered');

    const down = await build({
      openai: { chat: reply() },
      myBrain: {
        context: () => {
          throw new MyBrainError('mybrain_timeout', { ambiguous: true });
        },
      },
    });
    await open(down.app);
    const res = await ask(down.app, 'Où en est-on ?');
    expect(res.json()).toMatchObject({ notice: 'mybrain_timeout', item: { knowledge: 'down' } });
  });

  it('une question de suite part avec les précédentes, vers myBrain comme vers le modèle', async () => {
    const { app, ai, myBrain } = await build({ openai: { chat: reply() } });
    await open(app);
    await ask(app, 'C’est quoi le projet AMBRE ?');
    await ask(app, 'Et son budget ?');

    const second = myBrain.calls.filter((call) => call.method === 'context').at(-1);
    expect(second.history).toEqual([
      { role: 'user', content: 'C’est quoi le projet AMBRE ?' },
      { role: 'assistant', content: 'AMBRE est le projet de portail de Marquet.' },
    ]);
    expect(lastPrompt(ai)).toContain(
      '<questions_precedentes>\n- C’est quoi le projet AMBRE ?\n  → AMBRE est le projet de portail de Marquet.',
    );
  });
});

describe('Aide IA — la recherche élargie dans myBrain', () => {
  const AMBRE = {
    path: 'wiki/projets/ambre.md',
    title: 'Projet AMBRE',
    type: 'projet',
    excerpt: '',
  };
  const MARQUET = {
    path: 'wiki/clients/marquet.md',
    title: 'Marquet',
    type: 'client',
    excerpt: '',
  };
  const CONTENT = {
    [AMBRE.path]: 'Refonte du portail client de Marquet. Livraison : mars 2027.',
    [MARQUET.path]: 'Client de la logistique. Interlocuteur : la DSI.',
  };
  const notFound = () => new MyBrainError('mybrain_not_found', { status: 404 });
  const ask = (app, question, extra = {}) =>
    post(app, '/ai-help/ask', { meetingId: 'live-pilot', question, voice: true, ...extra });
  /** Un modèle qui prépare la recherche avec `plan`, puis répond. */
  const model = (plan, answer = { answer: 'Voici.', source: '' }) => ({
    chat: (params) => JSON.stringify(isSearchPlan(params) ? plan : answer),
  });
  /** Un myBrain strict, comme le vrai : plein texte par préfixe, aucune faute tolérée. */
  const brain = (sheets, over = {}) => ({
    context: () => ({ context: '', truncated: false, sheets: [] }),
    search: ({ query }) => {
      const words = query.toLowerCase().split(/\s+/);
      return sheets.filter((sheet) =>
        words.every((word) =>
          `${sheet.title} ${CONTENT[sheet.path]}`
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .some((token) => token.startsWith(word)),
        ),
      );
    },
    sheet: (payload) => {
      if (payload.name) throw notFound();
      const sheet = sheets.find((entry) => entry.path === payload.path);
      if (!sheet) throw notFound();
      return { path: sheet.path, title: sheet.title, content: CONTENT[sheet.path] };
    },
    ...over,
  });
  const searches = (myBrain) =>
    myBrain.calls.filter((call) => call.method === 'search').map((call) => call.query);

  it('un nom écorché par la transcription : la graphie préparée par le modèle retrouve la fiche', async () => {
    const { app, ai, db, myBrain } = await build({
      openai: model(
        { question: 'C’est quoi le projet AMBRE ?', names: ['AMBRE', 'Ambre'], topics: [] },
        { answer: 'AMBRE est la refonte du portail de Marquet.', source: 'Projet AMBRE' },
      ),
      myBrain: brain([AMBRE, MARQUET]),
    });
    await open(app, 'live-pilot', PILOT, { projectMode: 'none' });
    const res = await ask(app, 'C’est quoi le projet Arbre ?');

    expect(searches(myBrain)).toContain('AMBRE');
    const prompt = lastPrompt(ai);
    expect(prompt).toContain('Refonte du portail client de Marquet.');
    // La lecture de la question est donnée comme telle, à côté de la question.
    expect(prompt).toContain('<question>\nC’est quoi le projet Arbre ?\n</question>');
    expect(prompt).toContain('<question_comprise>\nC’est quoi le projet AMBRE ?');
    expect(res.json().item).toMatchObject({
      knowledge: 'used',
      source: { path: AMBRE.path, title: 'Projet AMBRE' },
    });
    // Un appel de plus au modèle, compté à part.
    expect((await meetingOf(db, 'live-pilot')).aiHelp.calls).toMatchObject({ ask: 1, plan: 1 });
  });

  it('la préparation lit la fin de la réunion et son vocabulaire, jamais pour répondre', async () => {
    const seeded = seed({
      userTags: [owned(PILOT, { id: 't1', label: 'Marquet', labelLower: 'marquet' })],
    });
    const { app, ai } = await build({
      seed: seeded,
      openai: model({ question: '', names: [], topics: [] }),
      myBrain: brain([AMBRE]),
    });
    await open(app, 'live-pilot', PILOT, { projectMode: 'none' });
    await ask(app, 'Et lui, il en pense quoi ?', {
      transcript: 'Camille : On attend le retour de Marquet sur le lot 2.',
    });
    const prompt = planPrompt(ai);
    expect(prompt).toContain('Tu ne réponds PAS à la question');
    expect(prompt).toContain('On attend le retour de Marquet sur le lot 2.');
    expect(prompt).toContain('<vocabulaire>\n- Marquet\n</vocabulaire>');
    expect(prompt).toContain('Lot 2 = espace client'); // les notes de la réunion
  });

  it('sans préparation (modèle muet) : le nom tel qu’écrit, puis son préfixe et l’oreille', async () => {
    const { app, ai, myBrain } = await build({
      openai: model({}, { answer: 'Marquet est un client de la logistique.', source: 'Marquet' }),
      myBrain: brain([AMBRE, MARQUET]),
    });
    await open(app, 'live-pilot', PILOT, { projectMode: 'none' });
    const res = await ask(app, 'Que sait-on du client Market ?');

    // « Market » ne trouve rien en plein texte ; « mar » rend Marquet, qui sonne pareil.
    expect(searches(myBrain)).toEqual(expect.arrayContaining(['Market', 'mar']));
    const prompt = lastPrompt(ai);
    expect(prompt).toContain('Client de la logistique.');
    expect(prompt).toContain('« Market » → « Marquet »');
    expect(res.json().item.knowledge).toBe('used');
  });

  it('les fiches trouvées par leur nom s’ajoutent au contexte de myBrain, sans doublon', async () => {
    const { app, ai } = await build({
      openai: model({ question: '', names: ['Marquet', 'AMBRE'], topics: [] }),
      myBrain: brain([AMBRE, MARQUET], {
        context: () => ({
          context: 'AMBRE — jalon de mars.',
          truncated: false,
          sheets: [{ path: AMBRE.path, title: AMBRE.title }],
        }),
      }),
    });
    await open(app, 'live-pilot', PILOT, { projectMode: 'none' });
    await ask(app, 'Où en est AMBRE chez Marquet ?');
    const prompt = lastPrompt(ai);
    expect(prompt).toContain('AMBRE — jalon de mars.');
    expect(prompt).toContain('## Marquet\nClient de la logistique.');
    // Déjà dans le contexte : pas relue en entier une seconde fois.
    expect(prompt).not.toContain('## Projet AMBRE');
    expect(prompt).toMatch(/<connaissances fiches="Marquet ; Projet AMBRE">/);
  });

  it('contexte vide : il est redemandé sur la question telle qu’elle a été comprise', async () => {
    const asked = [];
    const { app } = await build({
      openai: model({
        question: 'Quelle est la date de livraison de AMBRE ?',
        names: [],
        topics: [],
      }),
      myBrain: brain([], {
        context: ({ question }) => {
          asked.push(question);
          return { context: '', truncated: false, sheets: [] };
        },
      }),
    });
    await open(app, 'live-pilot', PILOT, { projectMode: 'none' });
    await ask(app, 'Et la date de livraison ?');
    expect(asked).toEqual([
      'Et la date de livraison ?',
      'Quelle est la date de livraison de AMBRE ?',
    ]);
  });

  it('myBrain en panne dès le premier appel : aucune recherche de plus, et la réponse le dit', async () => {
    const { app, myBrain } = await build({
      openai: model({ question: '', names: ['AMBRE'], topics: ['livraison'] }),
      myBrain: {
        context: () => {
          throw new MyBrainError('mybrain_unreachable', { status: 0 });
        },
      },
    });
    await open(app, 'live-pilot', PILOT, { projectMode: 'none' });
    const res = await ask(app, 'C’est quoi le projet AMBRE ?');
    expect(searches(myBrain)).toEqual([]);
    expect(res.json().item.knowledge).toBe('down');
  });

  it('sans le droit myBrain : ni préparation, ni recherche — un seul appel au modèle', async () => {
    const { app, ai, myBrain } = await build({ openai: model({ names: ['AMBRE'] }) });
    await open(app, 'live-talker', TALKER);
    await post(
      app,
      '/ai-help/ask',
      { meetingId: 'live-talker', question: 'C’est quoi le projet AMBRE ?', voice: true },
      TALKER,
    );
    expect(chatCalls(ai)).toBe(1);
    expect(planPrompt(ai)).toBeUndefined();
    expect(myBrain.calls.filter((call) => call.method !== 'whoami')).toEqual([]);
  });

  it('une question dictée : la consigne demande de relire ce qui précède et de rapprocher les noms', async () => {
    const { app, ai } = await build({ openai: model({}) });
    await open(app, 'live-talker', TALKER);
    const body = { meetingId: 'live-talker', question: 'Tu peux me dire ça ?' };
    await post(app, '/ai-help/ask', { ...body, voice: true }, TALKER);
    expect(lastPrompt(ai)).toContain('relis les dernières répliques de <transcription>');
    expect(lastPrompt(ai)).toContain("À L'OREILLE");
    // Écrite, la question est ce qu'on a tapé : rien de tout cela.
    await post(app, '/ai-help/ask', body, TALKER);
    expect(lastPrompt(ai)).not.toContain('relis les dernières répliques');
  });
});

describe('Aide IA — une synthèse, les actions : la réunion entière', () => {
  const ask = (app, body = {}) =>
    post(app, '/ai-help/ask', { meetingId: 'live-pilot', question: 'Fais une synthèse', ...body });

  it('une réponse en liste garde ses lignes ; les actions relevées entrent dans la consigne', async () => {
    const seeded = seed();
    seeded.resume[0].actions = [
      { id: 1, title: 'Envoyer le devis', owner: 'Hugo', dueDate: 'vendredi', show: true },
      { id: 2, title: 'Action masquée', show: false },
      { id: 3, title: '   ' },
    ];
    const { app, ai } = await build({
      seed: seeded,
      openai: {
        chat: JSON.stringify({
          answer: 'En bref :\n- Budget validé.\n\n-   Livraison   fin mars.\n- Devis à envoyer.',
          source: '',
        }),
      },
    });
    await open(app);
    const res = await ask(app);

    expect(res.json().item.body).toBe(
      'En bref :\n- Budget validé.\n- Livraison fin mars.\n- Devis à envoyer.',
    );
    const prompt = lastPrompt(ai);
    expect(prompt).toContain(
      '<actions_relevees>\n- Envoyer le devis (porteur : Hugo) (échéance : vendredi)\n</actions_relevees>',
    );
    expect(prompt).not.toContain('Action masquée');
    expect(prompt).toContain('une courte liste');
  });

  it('la transcription d’une longue réunion part presque entière, pas son dernier quart d’heure', async () => {
    const { app, ai } = await build({ openai: { chat: '{"answer":"Voilà.","source":""}' } });
    await open(app);
    const start = 'DÉBUT DE LA RÉUNION : on ouvre sur le budget.';
    const transcript = `${start}\n${'Une phrase de réunion ordinaire. '.repeat(1200)}`; // ~40 000 caractères
    await ask(app, { transcript });
    expect(lastPrompt(ai)).toContain(start);
  });
});

describe('Aide IA — les gestes qu’on lui demande', () => {
  const ask = (app, question = 'Fais-le.') =>
    post(app, '/ai-help/ask', { meetingId: 'live-pilot', question, voice: true });
  const reply = (body) => ({ openai: { chat: JSON.stringify(body) } });
  const withTags = () => {
    const seeded = seed();
    seeded.userTags = [
      owned(PILOT, { id: 'tag-atlas', label: 'Atlas', labelLower: 'atlas' }),
      owned(TALKER, { id: 'tag-hugo', label: 'Ambre', labelLower: 'ambre' }),
    ];
    return seeded;
  };

  it('pose un tag du compte par son nom ; un tag inconnu, ou celui d’un autre, est dit — jamais créé', async () => {
    const { app, ai, db } = await build({
      seed: withTags(),
      ...reply({
        answer: '',
        actions: [
          { type: 'tag', name: 'atlas' },
          { type: 'tag', name: 'Ambre' },
        ],
      }),
    });
    await open(app);
    const res = await ask(app, 'Ajoute le tag Atlas, et le tag Ambre');

    expect(res.statusCode).toBe(200);
    expect(res.json().item.acts).toEqual([
      { type: 'tag', label: 'Atlas', ok: true, tagId: 'tag-atlas' },
      { type: 'tag', label: 'Ambre', ok: false },
    ]);
    // L'écran pose le tag (il tient l'état de la réunion) : une seule action à faire.
    expect(res.json().actions).toEqual([{ type: 'tag', tagId: 'tag-atlas' }]);
    // Le modèle ne voit que les tags du compte.
    expect(lastPrompt(ai)).toContain('<tags>\n- Atlas\n</tags>');
    expect(await db.collection('userTags').find({}).toArray()).toHaveLength(2);
  });

  it('un nom de tag ou de template écorché désigne celui qui se prononce pareil — s’il est seul', async () => {
    const { app } = await build({
      seed: withTags(),
      ...reply({
        answer: '',
        actions: [
          { type: 'tag', name: 'Atlasse' },
          { type: 'summary', template: 'comité de pilotaje', when: 'end' },
        ],
      }),
    });
    await open(app);
    const res = await post(app, '/ai-help/ask', {
      meetingId: 'live-pilot',
      question: 'Ajoute le tag Atlasse, et le compte rendu avec le template comité de pilotage',
      voice: true,
      templates: ['Standard', 'Comité de pilotage', 'Comité de direction'],
    });
    expect(res.json().item.acts).toEqual([
      { type: 'tag', label: 'Atlas', ok: true, tagId: 'tag-atlas' },
      { type: 'summary', template: 'Comité de pilotage', when: 'end', ok: true },
    ]);
  });

  it('deux templates qui pourraient convenir : aucun n’est pris au hasard', async () => {
    const { app } = await build({
      ...reply({ answer: '', actions: [{ type: 'summary', template: 'Comité', when: 'now' }] }),
    });
    await open(app);
    const res = await post(app, '/ai-help/ask', {
      meetingId: 'live-pilot',
      question: 'Termine avec le template Comité',
      templates: ['Comité de pilotage', 'Comité de direction'],
    });
    expect(res.json().item.acts).toEqual([
      { type: 'summary', template: 'Comité', when: 'now', ok: false },
    ]);
    expect(res.json().actions).toEqual([]);
  });

  it('note, rappel : gardés sur la réponse ; le rappel est une intervention datée', async () => {
    const { app, db } = await build(
      reply({
        answer: 'C’est fait.',
        actions: [
          { type: 'note', text: 'Budget validé à 120 000 euros.' },
          { type: 'reminder', minutes: 10, label: 'Parler du recrutement' },
        ],
      }),
    );
    await open(app);
    const before = Date.now();
    const res = await ask(
      app,
      'Note que le budget est validé, et rappelle-moi le recrutement dans dix minutes',
    );

    expect(res.json().item).toMatchObject({
      body: 'C’est fait.',
      acts: [
        { type: 'note', text: 'Budget validé à 120 000 euros.' },
        { type: 'reminder', minutes: 10, label: 'Parler du recrutement' },
      ],
    });
    expect(res.json().actions).toEqual([{ type: 'note', text: 'Budget validé à 120 000 euros.' }]);
    const [reminder] = res.json().reminders;
    expect(reminder).toMatchObject({
      kind: 'reminder',
      title: 'Parler du recrutement',
      state: 'open',
    });
    const due = Date.parse(reminder.dueAt);
    expect(due).toBeGreaterThanOrEqual(before + 10 * 60_000);
    expect(due).toBeLessThan(before + 10 * 60_000 + 5000);
    // Gardé avec la réunion : une page rechargée le retrouve, et le fera sonner.
    const stored = (await meetingOf(db, 'live-pilot')).aiHelp.items;
    expect(stored.map((item) => item.kind)).toEqual(['answer', 'reminder']);
    const session = (await post(app, '/ai-help/session', { meetingId: 'live-pilot' })).json()
      .session;
    expect(session.items[1]).toMatchObject({ kind: 'reminder', dueAt: reminder.dueAt });
  });

  it('« ferme ta fenêtre » : rien à afficher, une action à faire — pas une panne', async () => {
    const { app, db } = await build(reply({ answer: '', actions: [{ type: 'close' }] }));
    await open(app);
    const res = await ask(app, 'Ferme ta fenêtre');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ item: null, actions: [{ type: 'close' }], reminders: [] });
    expect((await meetingOf(db, 'live-pilot')).aiHelp.items).toBeUndefined();
  });

  it('« agrandis ta fenêtre » : un geste de l’écran — relayé, sans carte ni trace', async () => {
    const { app, ai, db } = await build(
      reply({
        answer: '',
        actions: [
          { type: 'size', direction: 'up' },
          { type: 'size', direction: 'down' }, // un seul changement de taille par demande
          { type: 'size', direction: 'énorme' },
        ],
      }),
    );
    await open(app);
    const res = await ask(app, 'J’ai du mal à te lire');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ item: null, actions: [{ type: 'size', direction: 'up' }] });
    expect(lastPrompt(ai)).toContain('{"type":"size","direction":"up"}');
    expect((await meetingOf(db, 'live-pilot')).aiHelp.items).toBeUndefined();
  });

  it('un geste mal formé ou inconnu est jeté ; sans réponse ni geste, c’est une panne', async () => {
    const { app } = await build(
      reply({
        answer: 'Voilà.',
        actions: [
          { type: 'reminder', minutes: 0, label: 'trop tôt' },
          { type: 'reminder', minutes: 9999, label: 'trop tard' },
          { type: 'mail', to: 'quelqu’un' },
          { type: 'note', text: '' },
          'ferme',
        ],
      }),
    );
    await open(app);
    const res = await ask(app);
    expect(res.json()).toMatchObject({ actions: [], reminders: [] });
    expect(res.json().item.acts).toBeUndefined();

    const mute = await build(reply({ answer: '', actions: [] }));
    await open(mute.app);
    expect((await ask(mute.app)).statusCode).toBe(502);
  });

  const askWith = (app, extra, question = 'Fais-le.') =>
    post(app, '/ai-help/ask', { meetingId: 'live-pilot', question, ...extra });

  it('pause, reprise, fin : relayées à l’écran ; sans objet, le geste est dit et ne part pas', async () => {
    const pause = await build(reply({ answer: '', actions: [{ type: 'meeting', do: 'pause' }] }));
    await open(pause.app);
    const running = (await askWith(pause.app, { paused: false }, 'Mets en pause')).json();
    expect(running.item.acts).toEqual([{ type: 'meeting', do: 'pause', ok: true }]);
    expect(running.actions).toEqual([{ type: 'meeting', do: 'pause' }]);
    expect(lastPrompt(pause.ai)).toContain("La réunion s'enregistre en ce moment.");
    // Déjà en pause : rien à faire — la réponse le porte, l'écran ne reçoit rien.
    const already = (await askWith(pause.app, { paused: true }, 'Mets en pause')).json();
    expect(already.item.acts).toEqual([{ type: 'meeting', do: 'pause', ok: false }]);
    expect(already.actions).toEqual([]);
    expect(lastPrompt(pause.ai)).toContain('La réunion est EN PAUSE en ce moment');

    const resume = await build(reply({ answer: '', actions: [{ type: 'meeting', do: 'resume' }] }));
    await open(resume.app);
    expect((await askWith(resume.app, { paused: true })).json().actions).toEqual([
      { type: 'meeting', do: 'resume' },
    ]);
    expect((await askWith(resume.app, { paused: false })).json().actions).toEqual([]);
    // Sans le champ (un écran plus ancien) : la réunion est réputée tourner.
    expect((await askWith(resume.app, {})).json().actions).toEqual([]);

    const end = await build(
      reply({
        answer: '',
        actions: [
          { type: 'meeting', do: 'end' },
          { type: 'meeting', do: 'pause' }, // un seul geste sur la réunion par demande
          { type: 'meeting', do: 'delete' }, // supprimer n'existe pas
        ],
      }),
    );
    await open(end.app);
    const ended = (await askWith(end.app, { paused: true }, 'Termine la réunion')).json();
    expect(ended.actions).toEqual([{ type: 'meeting', do: 'end' }]);
    expect(ended.item.acts).toEqual([{ type: 'meeting', do: 'end', ok: true }]);
    // Gardé avec la réunion : l'historique dira que c'est l'IA qui l'a terminée.
    const stored = (await meetingOf(end.db, 'live-pilot')).aiHelp.items;
    expect(stored[0].acts).toEqual([{ type: 'meeting', do: 'end', ok: true }]);
  });

  it('le compte rendu : un template par son nom ; un nom inconnu ne termine pas la réunion', async () => {
    const templates = ['Standard', 'Comité de pilotage', '  '];
    const named = await build(
      reply({
        answer: '',
        actions: [{ type: 'summary', template: 'comite de pilotage', when: 'now' }],
      }),
    );
    await open(named.app);
    const res = (await askWith(named.app, { templates }, 'Fais le compte rendu')).json();
    // Le nom rendu est celui de l'écran, pas l'approximation du modèle.
    expect(res.actions).toEqual([{ type: 'summary', template: 'Comité de pilotage', when: 'now' }]);
    expect(res.item.acts).toEqual([
      { type: 'summary', template: 'Comité de pilotage', when: 'now', ok: true },
    ]);
    expect(lastPrompt(named.ai)).toContain(
      '<templates>\n- Standard\n- Comité de pilotage\n</templates>',
    );

    const unknown = await build(
      reply({ answer: '', actions: [{ type: 'summary', template: 'Codir', when: 'now' }] }),
    );
    await open(unknown.app);
    const refused = (await askWith(unknown.app, { templates })).json();
    expect(refused.actions).toEqual([]);
    expect(refused.item.acts).toEqual([
      { type: 'summary', template: 'Codir', when: 'now', ok: false },
    ]);

    // Sans nom : le template déjà choisi à l'écran. Commandé pour la fin : la
    // réunion continue.
    const later = await build(
      reply({ answer: 'Noté.', actions: [{ type: 'summary', template: '', when: 'end' }] }),
    );
    await open(later.app);
    expect((await askWith(later.app, { templates })).json().actions).toEqual([
      { type: 'summary', template: '', when: 'end' },
    ]);
  });

  it('« termine et fais le compte rendu » : une seule fin, celle qui rédige', async () => {
    const both = await build(
      reply({
        answer: '',
        actions: [
          { type: 'meeting', do: 'end' },
          { type: 'summary', template: 'Standard', when: 'end' },
          { type: 'summary', template: 'Autre', when: 'now' }, // un seul compte rendu
        ],
      }),
    );
    await open(both.app);
    const res = (await askWith(both.app, { templates: ['Standard'] })).json();
    expect(res.actions).toEqual([{ type: 'summary', template: 'Standard', when: 'now' }]);
    expect(res.item.acts).toEqual([
      { type: 'summary', template: 'Standard', when: 'now', ok: true },
    ]);
  });

  it('corrige la transcription : seulement un passage qui s’y trouve, hors la demande elle-même', async () => {
    const transcript = [
      'Camille : On livre chez Market le 12 mars.',
      'Hugo : Market a validé le devis, Paulette aussi.',
      'Camille : Alfred, remplace partout Market par Marquet.',
    ].join('\n');
    const question = 'remplace partout Market par Marquet.';
    const fix = await build(
      reply({
        answer: '',
        actions: [{ type: 'replace', find: 'market', with: 'Marquet', all: true }],
      }),
    );
    await open(fix.app);
    const res = (await askWith(fix.app, { transcript, voice: true }, question)).json();
    expect(res.actions).toEqual([{ type: 'replace', find: 'market', with: 'Marquet', all: true }]);
    expect(res.item.acts).toEqual([
      { type: 'replace', find: 'market', with: 'Marquet', all: true, ok: true },
    ]);
    expect(lastPrompt(fix.ai)).toContain('{"type":"replace","find":"…","with":"…","all":false}');

    // Un mot ENTIER : « Paul » n'est pas dans « Paulette ». Et un nom qui ne
    // figure que dans la demande dictée n'est nulle part à corriger.
    for (const [find, asked] of [
      ['Paul', 'remplace Paul par Pol'],
      ['Globex', 'remplace Globex par Initech'],
    ]) {
      const miss = await build(
        reply({ answer: '', actions: [{ type: 'replace', find, with: 'x', all: false }] }),
      );
      await open(miss.app);
      const said = `${transcript}\nCamille : Alfred, ${asked}`;
      const out = (await askWith(miss.app, { transcript: said, voice: true }, asked)).json();
      expect(out.actions).toEqual([]);
      expect(out.item.acts).toEqual([{ type: 'replace', find, with: 'x', all: false, ok: false }]);
    }

    // Rien à changer (même texte), ou un passage d'une lettre : jeté dès la relecture.
    const idle = await build(
      reply({
        answer: 'Rien à corriger.',
        actions: [
          { type: 'replace', find: 'Market', with: 'Market', all: true },
          { type: 'replace', find: 'W', with: 'V', all: true },
        ],
      }),
    );
    await open(idle.app);
    const none = (await askWith(idle.app, { transcript })).json();
    expect(none.actions).toEqual([]);
    expect(none.item.acts).toBeUndefined();
  });

  it('le corps d’une question reste borné : trop de templates, ou un champ inconnu, est refusé', async () => {
    const { app, ai } = await build(reply({ answer: 'Voilà.', actions: [] }));
    await open(app);
    const tooMany = Array.from({ length: 61 }, (_, i) => `Template ${i}`);
    expect((await askWith(app, { templates: tooMany })).statusCode).toBe(400);
    expect((await askWith(app, { templates: ['x'.repeat(121)] })).statusCode).toBe(400);
    expect((await askWith(app, { paused: 'oui' })).statusCode).toBe(400);
    expect((await askWith(app, { templates: { $ne: '' } })).statusCode).toBe(400);
    expect(chatCalls(ai)).toBe(0);
  });
});

describe('Aide IA — pourquoi myBrain est lu, ou ne l’est pas', () => {
  const WHO = (droits) => ({
    application: 'myBrief',
    droits,
    api: 'https://cerveau.example.test/api/v1',
  });
  const whoamiCalls = (myBrain) => myBrain.calls.filter((call) => call.method === 'whoami').length;
  const ask = (app, email = PILOT, meetingId = 'live-pilot') =>
    post(app, '/ai-help/ask', { meetingId, question: 'C’est quoi le projet Atlas ?' }, email);
  const ANSWER = '{"answer":"Un portail client.","source":""}';

  it('dit la raison, de l’installation au compte', async () => {
    const ready = await build();
    expect((await get(ready.app, '/ai-help')).json().myBrainReason).toBe('ok');
    expect((await get(ready.app, '/ai-help', TALKER)).json().myBrainReason).toBe('no_group_right');
    expect((await get(ready.app, '/ai-help', NOBODY)).json().myBrainReason).toBe('no_aihelp');

    const noRead = await build({ droits: ['nourrir'] });
    expect((await get(noRead.app, '/ai-help')).json().myBrainReason).toBe('no_read_right');
    // La clé prime sur le groupe : inutile de renvoyer vers Groupes.
    expect((await get(noRead.app, '/ai-help', TALKER)).json().myBrainReason).toBe('no_read_right');

    const unplugged = await build({ droits: null });
    expect((await get(unplugged.app, '/ai-help')).json().myBrainReason).toBe('not_connected');
  });

  it('« lire » ajouté à la clé APRÈS le dernier test de connexion : relu, sans geste de l’administrateur', async () => {
    // La photo dit « nourrir » ; myBrain, lui, dit désormais « lire » aussi.
    const { app, myBrain } = await build({
      droits: ['nourrir'],
      myBrain: { whoami: WHO(['lire', 'nourrir']) },
    });
    // Un compte sans le droit du groupe ne déclenche rien : la clé n'est pas ce qui lui manque.
    await get(app, '/ai-help', TALKER);
    expect(whoamiCalls(myBrain)).toBe(0);

    expect((await get(app, '/ai-help')).json()).toMatchObject({
      myBrain: true,
      myBrainReason: 'ok',
      domains: { project: true },
    });
    expect(whoamiCalls(myBrain)).toBe(1);
    expect((await app.myBrainSettings.get()).verified.droits).toEqual(['lire', 'nourrir']);
  });

  it('une clé qui n’a vraiment pas « lire » n’est pas redemandée à chaque requête', async () => {
    const { app, myBrain } = await build({ droits: ['nourrir'] });
    await get(app, '/ai-help');
    await get(app, '/ai-help');
    await open(app);
    expect(whoamiCalls(myBrain)).toBe(1);
  });

  it('myBrain refuse la clé en pleine réunion : ses droits sont relus, la raison suit', async () => {
    const { app } = await build({
      openai: { chat: ANSWER },
      myBrain: {
        whoami: WHO(['nourrir']), // « lire » a été RETIRÉ à la clé depuis le dernier test
        context: () => {
          throw new MyBrainError('mybrain_right_missing', { status: 403 });
        },
      },
    });
    await open(app);
    const res = await ask(app);
    expect(res.json()).toMatchObject({
      notice: 'mybrain_right_missing',
      item: { knowledge: 'down' },
    });
    expect((await get(app, '/ai-help')).json()).toMatchObject({
      myBrain: false,
      myBrainReason: 'no_read_right',
    });
  });

  it('la fiche de la personne ne compte pas pour « myBrain avait de quoi répondre »', async () => {
    // Le compte a sa fiche dans myBrain, mais rien n'y parle de la question.
    const { app } = await build({
      openai: { chat: ANSWER },
      myBrain: {
        context: { context: '', truncated: false, sheets: [] },
        search: [],
        sheet: (payload) => {
          // Sa fiche à elle, pas celle de tout nom qu'on demande : la question
          // nomme « Atlas », que la recherche élargie demande aussi par son nom.
          if (/^camille/i.test(payload.name || ''))
            return {
              path: 'wiki/personnes/camille.md',
              title: 'Camille',
              content: 'Cheffe de projet.',
            };
          throw new MyBrainError('mybrain_not_found', { status: 404 });
        },
      },
    });
    await open(app, 'live-pilot', PILOT, { projectMode: 'none' });
    expect((await ask(app)).json().item.knowledge).toBe('empty');
  });

  it('une réponse dit pourquoi elle s’est passée de myBrain', async () => {
    const noRead = await build({ droits: ['nourrir'], openai: { chat: ANSWER } });
    await open(noRead.app);
    expect((await ask(noRead.app)).json().item.knowledge).toBe('no_key_right');

    // myBrain pas relié : personne ne l'attend, rien à dire.
    const unplugged = await build({ droits: null, openai: { chat: ANSWER } });
    await open(unplugged.app);
    expect((await ask(unplugged.app)).json().item.knowledge).toBe('none');
  });

  it('l’onglet d’administration redemande les droits à myBrain, et dit ce que l’administrateur obtient', async () => {
    const seeded = seed();
    seeded.user[0] = userDoc(ADMIN, { role: 'admin', groupIds: ['talkers'] });
    const { app, myBrain } = await build({
      seed: seeded,
      droits: ['nourrir'],
      myBrain: { whoami: WHO(['lire', 'nourrir']) },
    });
    const res = await get(app, '/admin/settings/ai-help', ADMIN);
    expect(res.json()).toMatchObject({
      myBrain: { connected: true, canRead: true },
      // Son groupe a l'Aide IA, pas la lecture de myBrain.
      me: { available: true, myBrain: false, reason: 'no_group_right' },
    });
    // À chaque ouverture de l'onglet, pas une fois toutes les dix minutes.
    await get(app, '/admin/settings/ai-help', ADMIN);
    expect(whoamiCalls(myBrain)).toBe(2);
  });
});

describe('Aide IA — « Tester la lecture » (administration)', () => {
  const probe = (app, question, email = ADMIN) =>
    post(app, '/admin/settings/ai-help/test', { question }, email);

  it('montre ce que myBrain rend : fiches, extrait, et la recherche par mots-clés', async () => {
    const { app, myBrain } = await build();
    const res = await probe(app, 'C’est quoi le projet AMBRE ?');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      canRead: true,
      keywords: 'AMBRE',
      context: { ok: true, sheets: ['Projet Atlas'], truncated: false },
      search: { ok: true, results: [{ title: 'Projet Atlas', type: 'projet' }] },
    });
    expect(res.json().context.excerpt).toContain('livraison du lot 2');
    expect(myBrain.calls.find((call) => call.method === 'search')).toMatchObject({
      query: 'AMBRE',
    });
  });

  it('une lecture refusée par myBrain est un résultat, avec son message — pas une panne', async () => {
    const { app } = await build({
      myBrain: {
        context: () => {
          throw new MyBrainError('mybrain_right_missing', {
            status: 403,
            upstreamMessage: 'cette clé n’a pas le droit « lire »',
          });
        },
      },
    });
    const res = await probe(app, 'Projet AMBRE');
    expect(res.statusCode).toBe(200);
    expect(res.json().context).toEqual({
      ok: false,
      error: 'mybrain_right_missing',
      upstreamStatus: 403,
      upstreamMessage: 'cette clé n’a pas le droit « lire »',
    });
    expect(res.json().search.ok).toBe(true);
  });

  it('réservée aux administrateurs ; sans connexion à myBrain : 409', async () => {
    const { app } = await build();
    expect((await probe(app, 'x', PILOT)).statusCode).toBe(403);
    const unplugged = await build({ droits: null });
    const res = await probe(unplugged.app, 'Projet AMBRE');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('mybrain_not_connected');
  });
});
