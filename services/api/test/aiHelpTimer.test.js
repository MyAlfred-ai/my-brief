/**
 * Le minuteur demandé à l'Aide IA (lib/aiHelp/timer.js, et ses passages par
 * engine.js, prompts.js, session.js, routes/aiHelp.js) — faux modèle, aucun
 * réseau.
 *
 * Garanties tenues ici :
 *   - le modèle ne fait que NOMMER le geste : une durée hors bornes, un geste
 *     inconnu, un second minuteur dans la même réponse sont jetés ;
 *   - il n'y a jamais qu'un minuteur : en lancer un remplace celui qui tourne ;
 *   - « ajoute deux minutes » sans minuteur ne crée rien, et la réponse le dit ;
 *   - l'écran reçoit ce qui RESTE, jamais une heure du serveur ;
 *   - gardé avec la réunion : une session relue le retrouve ; arrivé à zéro, il
 *     n'existe plus, sans que personne l'efface ;
 *   - son bouton l'arrête sans passer par le modèle, sur la réunion du compte
 *     seulement ;
 *   - questions-réponses coupées, il se demande encore : c'est un geste.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, groupDoc, defaultGroupDoc } from './helpers.js';
import {
  TIMER_SECONDS_MAX,
  moveTimer,
  publicTimer,
  readTimer,
  timerLeft,
} from '../lib/aiHelp/timer.js';

const TALKER = 'hugo@client.fr';
const OTHER = 'lea@client.fr';
const MEETING = 'live-talker';
const ALL_ON = { project: true, qa: true, agenda: true, ideas: true };

const owned = (email, fields) => ({ email, emailLower: email, ...fields });

const seed = () => ({
  user: [userDoc(TALKER, { groupIds: ['talkers'] }), userDoc(OTHER, { groupIds: ['talkers'] })],
  userGroups: [defaultGroupDoc(), groupDoc('talkers', { aiHelpAllowed: true })],
  resume: [
    owned(TALKER, { _id: 'r1', meetingId: MEETING, status: 'recording' }),
    owned(OTHER, { _id: 'r2', meetingId: 'live-other', status: 'recording' }),
  ],
});

/** Le modèle rend ces gestes, dans l'ordre des questions. */
function build(...replies) {
  let turn = 0;
  return buildTestApp({
    seed: seed(),
    openai: {
      chat: () => {
        const body = replies[Math.min(turn, replies.length - 1)];
        turn += 1;
        return JSON.stringify(body);
      },
    },
  });
}

const post = (app, url, body, email = TALKER) =>
  app.inject({
    method: 'POST',
    url: `/api${url}`,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const open = (app, extra = {}) =>
  post(app, '/ai-help/session', { meetingId: MEETING, enabled: true, domains: ALL_ON, ...extra });
const ask = (app, question = 'Fais-le.') =>
  post(app, '/ai-help/ask', { meetingId: MEETING, question });
const session = async (app) =>
  (await post(app, '/ai-help/session', { meetingId: MEETING })).json().session;
const stored = async (db) => (await db.collection('resume').findOne({ meetingId: MEETING })).aiHelp;
const lastPrompt = (ai) => ai.calls.at(-1).params.messages[0].content;
const gesture = (...actions) => ({ answer: '', actions });

const NOW = Date.parse('2026-11-17T10:00:00.000Z');
const at = (seconds) => new Date(NOW + seconds * 1000).toISOString();

describe('minuteur — la règle, sans rien autour', () => {
  it('lancer : une échéance, sa durée, son libellé rogné', () => {
    const { timer, act, touched } = moveTimer(
      null,
      { do: 'start', seconds: 300, label: '  Pause   café ' },
      NOW,
    );
    expect(timer).toEqual({ endsAt: at(300), seconds: 300, label: 'Pause café' });
    expect(act).toEqual({
      type: 'timer',
      do: 'start',
      seconds: 300,
      label: 'Pause café',
      ok: true,
    });
    expect(touched).toBe(true);
  });

  it('lancer remplace celui qui tourne : il n’y en a jamais deux', () => {
    const running = { endsAt: at(120), seconds: 300, label: 'Pause' };
    const { timer } = moveTimer(running, { do: 'start', seconds: 600, label: 'Atelier' }, NOW);
    expect(timer).toEqual({ endsAt: at(600), seconds: 600, label: 'Atelier' });
  });

  it('rallonger : l’échéance recule, la durée totale suit, le libellé reste', () => {
    const running = { endsAt: at(90), seconds: 300, label: 'Pause' };
    const { timer, act } = moveTimer(running, { do: 'add', seconds: 120 }, NOW);
    expect(timer).toEqual({ endsAt: at(210), seconds: 420, label: 'Pause' });
    expect(act).toEqual({
      type: 'timer',
      do: 'add',
      seconds: 120,
      left: 210,
      label: 'Pause',
      ok: true,
    });
  });

  it('raccourcir de plus qu’il ne reste : il sonne tout de suite, il ne recule pas', () => {
    const running = { endsAt: at(40), seconds: 300, label: '' };
    const { timer, act } = moveTimer(running, { do: 'add', seconds: -300 }, NOW);
    expect(timer.endsAt).toBe(at(1));
    expect(act).toMatchObject({ do: 'add', seconds: -300, left: 1, ok: true });
  });

  it('rallonger ne dépasse pas la borne', () => {
    const running = { endsAt: at(TIMER_SECONDS_MAX - 10), seconds: TIMER_SECONDS_MAX, label: '' };
    const { timer } = moveTimer(running, { do: 'add', seconds: 3600 }, NOW);
    expect(timer.endsAt).toBe(at(TIMER_SECONDS_MAX));
    expect(timer.seconds).toBe(TIMER_SECONDS_MAX);
  });

  it('rallonger sans minuteur : rien n’est créé, et c’est dit', () => {
    expect(moveTimer(null, { do: 'add', seconds: 120 }, NOW)).toEqual({
      timer: null,
      act: { type: 'timer', do: 'add', seconds: 120, ok: false },
      touched: false,
    });
  });

  it('arrêter : toujours relayé à l’écran, qui range aussi celui qui vient de sonner', () => {
    const running = { endsAt: at(90), seconds: 300, label: 'Pause' };
    expect(moveTimer(running, { do: 'stop' }, NOW)).toEqual({
      timer: null,
      act: { type: 'timer', do: 'stop', ok: true },
      touched: true,
    });
    expect(moveTimer(null, { do: 'stop' }, NOW)).toMatchObject({
      act: { type: 'timer', do: 'stop', ok: false },
      touched: true,
    });
  });

  it('arrivé à zéro, ou illisible : il n’existe plus', () => {
    expect(readTimer({ endsAt: at(-1), seconds: 300 }, NOW)).toBeNull();
    expect(readTimer({ endsAt: at(0), seconds: 300 }, NOW)).toBeNull();
    expect(readTimer({ endsAt: 'demain', seconds: 300 }, NOW)).toBeNull();
    expect(readTimer({ endsAt: at(TIMER_SECONDS_MAX + 60), seconds: 60 }, NOW)).toBeNull();
    expect(readTimer(null, NOW)).toBeNull();
    expect(readTimer('5 minutes', NOW)).toBeNull();
  });

  it('la durée totale n’est jamais sous le reste ; l’écran reçoit le reste, pas une heure', () => {
    const timer = readTimer({ endsAt: at(200), seconds: 5, label: 'Tour de table' }, NOW);
    expect(timer).toEqual({ endsAt: at(200), seconds: 200, label: 'Tour de table' });
    expect(timerLeft(timer, NOW)).toBe(200);
    expect(publicTimer(timer, NOW + 500)).toEqual({
      seconds: 200,
      label: 'Tour de table',
      remainingMs: 199_500,
    });
    expect(publicTimer(timer, NOW + 200_000)).toBeNull();
    expect(publicTimer(null, NOW)).toBeNull();
  });
});

describe('minuteur — demandé à l’Aide IA', () => {
  it('« lance un minuteur de cinq minutes » : dit sur la réponse, rendu à l’écran, gardé avec la réunion', async () => {
    const { app, ai, db } = build(
      gesture({ type: 'timer', do: 'start', seconds: 300, label: 'Pause café' }),
    );
    await open(app);
    const before = Date.now();
    const res = await ask(app, 'Lance un minuteur de cinq minutes pour la pause café');
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.item.acts).toEqual([
      { type: 'timer', do: 'start', ok: true, seconds: 300, label: 'Pause café' },
    ]);
    // Rien à faire pour l'écran dans `actions` : le minuteur a son champ.
    expect(body.actions).toEqual([]);
    expect(body.timer).toMatchObject({ seconds: 300, label: 'Pause café' });
    expect(body.timer.remainingMs).toBeGreaterThan(295_000);
    expect(body.timer.remainingMs).toBeLessThanOrEqual(300_000);
    expect(body.timer.endsAt).toBeUndefined();

    const end = Date.parse((await stored(db)).timer.endsAt);
    expect(end).toBeGreaterThanOrEqual(before + 300_000);
    expect(end).toBeLessThan(before + 305_000);

    // Le modèle savait le geste, et qu'aucun minuteur ne tournait.
    expect(lastPrompt(ai)).toContain('{"type":"timer","do":"start","seconds":300,"label":"…"}');
    expect(lastPrompt(ai)).toContain('Aucun minuteur ne tourne en ce moment.');

    // Une page rechargée le retrouve, avec ce qui lui reste.
    const reread = (await session(app)).timer;
    expect(reread).toMatchObject({ seconds: 300, label: 'Pause café' });
    expect(reread.remainingMs).toBeGreaterThan(295_000);
  });

  it('« ajoute deux minutes », puis « arrête-le » : le modèle sait où il en est', async () => {
    const { app, ai, db } = build(
      gesture({ type: 'timer', do: 'start', seconds: 300, label: 'Pause' }),
      gesture({ type: 'timer', do: 'add', seconds: 120 }),
      gesture({ type: 'timer', do: 'stop' }),
    );
    await open(app);
    await ask(app, 'Minuteur de cinq minutes');

    const longer = (await ask(app, 'Ajoute deux minutes')).json();
    expect(lastPrompt(ai)).toMatch(/Un minuteur tourne en ce moment : il reste (5 min|4 min 59 s)/);
    expect(lastPrompt(ai)).toContain('(« Pause »)');
    expect(longer.item.acts).toEqual([
      { type: 'timer', do: 'add', ok: true, seconds: 120, left: 420, label: 'Pause' },
    ]);
    expect(longer.timer).toMatchObject({ seconds: 420, label: 'Pause' });
    expect(longer.timer.remainingMs).toBeGreaterThan(415_000);

    const stopped = (await ask(app, 'Arrête le minuteur')).json();
    expect(stopped.item.acts).toEqual([{ type: 'timer', do: 'stop', ok: true }]);
    expect(stopped.timer).toBeNull();
    expect((await stored(db)).timer).toBeNull();
    expect((await session(app)).timer).toBeNull();
  });

  it('rallonger ou arrêter sans minuteur : dit sur la réponse, rien n’est créé', async () => {
    const { app, db } = build(
      gesture({ type: 'timer', do: 'add', seconds: 120 }),
      gesture({ type: 'timer', do: 'stop' }),
    );
    await open(app);

    const added = (await ask(app, 'Ajoute deux minutes au minuteur')).json();
    expect(added.item.acts).toEqual([{ type: 'timer', do: 'add', ok: false, seconds: 120 }]);
    // Pas de champ `timer` : l'écran n'a rien à changer.
    expect('timer' in added).toBe(false);
    expect((await stored(db)).timer).toBeUndefined();

    // « Arrête » part quand même à l'écran : il y range celui qui vient de sonner.
    const stopped = (await ask(app, 'Arrête le minuteur')).json();
    expect(stopped.item.acts).toEqual([{ type: 'timer', do: 'stop', ok: false }]);
    expect(stopped.timer).toBeNull();
  });

  it('un geste hors bornes ou inconnu est jeté ; un seul minuteur par réponse', async () => {
    const { app } = build(
      {
        answer: 'Voilà.',
        actions: [
          { type: 'timer', do: 'start', seconds: 2, label: 'trop court' },
          { type: 'timer', do: 'start', seconds: TIMER_SECONDS_MAX + 1, label: 'trop long' },
          { type: 'timer', do: 'start', seconds: 'beaucoup' },
          { type: 'timer', do: 'add', seconds: 0 },
          { type: 'timer', do: 'pause' },
          { type: 'timer' },
        ],
      },
      gesture(
        { type: 'timer', do: 'start', seconds: 60, label: 'Le premier' },
        { type: 'timer', do: 'start', seconds: 600, label: 'Le second' },
      ),
    );
    await open(app);

    const thrown = (await ask(app)).json();
    expect(thrown.item.acts).toBeUndefined();
    expect('timer' in thrown).toBe(false);

    const once = (await ask(app)).json();
    expect(once.item.acts).toEqual([
      { type: 'timer', do: 'start', ok: true, seconds: 60, label: 'Le premier' },
    ]);
    expect(once.timer).toMatchObject({ seconds: 60, label: 'Le premier' });
  });

  it('des minutes rendues à la place des secondes sont comprises', async () => {
    const { app } = build(gesture({ type: 'timer', do: 'start', minutes: 10 }));
    await open(app);
    const body = (await ask(app, 'Dix minutes de pause')).json();
    expect(body.item.acts).toEqual([{ type: 'timer', do: 'start', ok: true, seconds: 600 }]);
    expect(body.timer).toMatchObject({ seconds: 600, label: '' });
  });

  it('arrivé à zéro sans personne pour le voir : il n’existe plus, pour l’écran comme pour le modèle', async () => {
    const { app, ai, db } = build({ answer: 'Aucun minuteur ne tourne.', actions: [] });
    await open(app);
    await db.collection('resume').updateOne(
      { meetingId: MEETING },
      {
        $set: {
          'aiHelp.timer': {
            endsAt: new Date(Date.now() - 1000).toISOString(),
            seconds: 300,
            label: 'Pause',
          },
        },
      },
    );
    expect((await session(app)).timer).toBeNull();
    await ask(app, 'Il reste combien au minuteur ?');
    expect(lastPrompt(ai)).toContain('Aucun minuteur ne tourne en ce moment.');
  });

  it('questions-réponses coupées : le minuteur se demande encore — c’est un geste', async () => {
    const { app, ai } = build({
      command: true,
      answer: '',
      actions: [{ type: 'timer', do: 'start', seconds: 90, label: '' }],
    });
    await open(app, { domains: { ...ALL_ON, qa: false } });
    const res = await ask(app, 'Minuteur, une minute trente');
    expect(res.statusCode).toBe(200);
    expect(res.json().timer).toMatchObject({ seconds: 90 });
    expect(lastPrompt(ai)).toContain('QUESTIONS-RÉPONSES SONT COUPÉES');
    expect(lastPrompt(ai)).toContain('"type":"timer"');
  });
});

describe('minuteur — son bouton', () => {
  it('l’arrête sans passer par le modèle', async () => {
    const { app, ai, db } = build(gesture({ type: 'timer', do: 'start', seconds: 300 }));
    await open(app);
    await ask(app, 'Minuteur de cinq minutes');
    const calls = ai.calls.length;

    const res = await post(app, '/ai-help/session', { meetingId: MEETING, timer: 'stop' });
    expect(res.statusCode).toBe(200);
    expect(res.json().session.timer).toBeNull();
    expect((await stored(db)).timer).toBeNull();
    expect(ai.calls.length).toBe(calls);
    // Le reste du réglage n'a pas bougé.
    expect(res.json().session).toMatchObject({ enabled: true, domains: { qa: true } });
  });

  it('ne touche que la réunion du compte, et ne sait qu’arrêter', async () => {
    const { app, db } = build(gesture({ type: 'timer', do: 'start', seconds: 300 }));
    await open(app);
    await ask(app, 'Minuteur de cinq minutes');

    const intruder = await post(
      app,
      '/ai-help/session',
      { meetingId: MEETING, timer: 'stop' },
      OTHER,
    );
    expect(intruder.statusCode).toBe(404);
    expect((await stored(db)).timer).toMatchObject({ seconds: 300 });

    const start = await post(app, '/ai-help/session', { meetingId: MEETING, timer: 'start' });
    expect(start.statusCode).toBe(400);
  });
});
