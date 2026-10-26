/**
 * Envoi des réunions à myBrain (lib/myBrain/feed.js, routes/myBrain.js).
 *
 * Garanties tenues ici :
 *   - une réunion part au geste qui la TERMINE (« Générer », « Enregistrer »),
 *     après son titre, et une seule fois — une régénération ne renvoie rien ;
 *   - la politique de l'administration décide : personne, chacun selon son
 *     choix (non par défaut), ou tout le monde ;
 *   - un échec transitoire est relancé à l'heure dite ; un échec AMBIGU (délai
 *     dépassé, envoi interrompu) jamais sans l'utilisateur ;
 *   - une réunion en plusieurs parties reprend là où elle a échoué ;
 *   - tout est scopé par le propriétaire, et l'écran de l'utilisateur ne voit
 *     jamais le contenu des réunions, seulement l'état de leur envoi.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, createFakeMyBrain } from './helpers.js';
import { MyBrainError } from '../lib/myBrain/client.js';
import {
  feedMeetingToMyBrain,
  retryMyBrainFeeds,
  MYBRAIN_SENDING_STALE_MS,
} from '../lib/myBrain/feed.js';
import { TITLE_RULES } from '../lib/prompts.js';
import { loadConfig } from '../lib/config.js';

const EMAIL = 'alex@client.fr';
const OTHER = 'intrus@client.fr';
const ADMIN = 'patron@client.fr';
const API_KEY = `mbk_${'k'.repeat(40)}`;
const MINUTE = 60_000;

const seed = (extra = {}) => ({
  user: [
    userDoc(ADMIN, { role: 'admin' }),
    userDoc(EMAIL, { name: 'Alex Dupont' }),
    userDoc(OTHER),
  ],
  ...extra,
});

/** Résumé et titre scriptés : le titre généré doit nommer la source dans le cerveau. */
const openai = {
  chat: (params) =>
    params.messages?.[0]?.content === TITLE_RULES
      ? 'Budget 2026 validé'
      : '<h2>Décisions</h2><p>Budget validé.</p>',
};

function build({ myBrain, seed: seeded } = {}) {
  return buildTestApp({ seed: seeded || seed(), openai, myBrain });
}

/** Date d'activation par défaut du jeu d'essai : avant les réunions semées. */
const LONG_AGO = '2026-01-01T00:00:00.000Z';

/**
 * Branche myBrain. `since` antidate l'activation : les réunions du jeu
 * d'essai (15/09) sont alors postérieures, comme dans la vraie vie. `since:
 * null` garde l'heure réelle du branchement — pour les tests de rétroactivité.
 */
async function plug(app, policy = 'forced', { since = LONG_AGO } = {}) {
  await app.myBrainSettings.update(
    { url: 'https://cerveau.example.test', apiKey: API_KEY, policy },
    {
      actor: ADMIN,
      verified: {
        application: 'myBrief',
        droits: ['lire', 'nourrir'],
        publicUrl: 'https://cerveau.example.test',
        at: new Date().toISOString(),
      },
    },
  );
  if (since) {
    await app.db
      .collection('appSettings')
      .updateOne({ key: 'myBrain' }, { $set: { activeSince: since } });
  }
}

function postJson(app, url, body, email = EMAIL) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email, 'Alex Dupont'), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const getJson = (app, url, email = EMAIL) =>
  app.inject({ method: 'GET', url, headers: identityHeaders(email) });

const resumePayload = (over = {}) => ({
  transcription: '[Alex] On valide le budget 2026.\n[Marie] Je relance le fournisseur vendredi.',
  systemPrompt: 'Tu es un rédacteur de comptes rendus.',
  template: 'standard',
  language: 'fr',
  actions: [{ id: 1, title: 'Relancer le fournisseur', owner: 'Marie', dueDate: '2026-09-18' }],
  notes: 'INITECH en capitales.',
  versionId: 'v1',
  meetingId: null,
  ...over,
});

/** Génère un compte rendu et attend la fin des travaux de fond (titre, envoi). */
async function summarize(app, over = {}, email = EMAIL) {
  const res = await postJson(app, '/api/resume', resumePayload(over), email);
  expect(res.statusCode).toBe(200);
  await app.background.drain();
  return res.json().meetingId;
}

const meetingDoc = (db, meetingId) =>
  (db.data.get('resume') || []).find((d) => d.meetingId === meetingId);

/** Brouillon terminé sans compte rendu, tel que /history/stop le laisse. */
const draft = (over = {}) => ({
  email: EMAIL,
  emailLower: EMAIL,
  meetingId: 'draft-1',
  name: 'Alex Dupont',
  resume: '',
  transcription: '[Alex] Point rapide sur le chantier Alpha.',
  actions: [],
  notes: '',
  versions: [],
  lastConnecion: '2026-09-15T08:00:00.000Z',
  meetingStartTime: '2026-09-15T08:00:00.000Z',
  now: '2026-09-15T08:00:00.000Z',
  status: 'ended',
  ...over,
});

describe('quand une réunion part', () => {
  it("rien ne part tant que l'administration n'a pas branché myBrain", async () => {
    const { app, myBrain } = build();
    await summarize(app);
    expect(myBrain.calls).toHaveLength(0);
  });

  it('politique « off » : rien ne part, même branché', async () => {
    const { app, myBrain } = build();
    await plug(app, 'off');
    await summarize(app);
    expect(myBrain.calls).toHaveLength(0);
  });

  it('au choix de chacun : rien sans accord, la réunion part une fois l’envoi activé', async () => {
    const { app, db, myBrain } = build();
    await plug(app, 'optin');
    await summarize(app);
    expect(myBrain.calls).toHaveLength(0);

    const toggled = await postJson(app, '/api/mybrain/settings', { enabled: true });
    expect(toggled.statusCode).toBe(200);
    expect(toggled.json()).toMatchObject({
      available: true,
      policy: 'optin',
      enabled: true,
      active: true,
    });

    const meetingId = await summarize(app);
    expect(myBrain.calls).toHaveLength(1);
    const [call] = myBrain.calls;
    expect(call).toMatchObject({
      method: 'feed',
      url: 'https://cerveau.example.test',
      apiKey: API_KEY,
    });
    // Après le titre : c'est lui qui nomme la source dans le cerveau.
    expect(call.deposit.titre).toMatch(/^Budget 2026 validé — réunion du /);
    expect(call.deposit.pour).toBe(EMAIL);
    expect(call.deposit.texte).toContain('- Auteur : Alex Dupont (alex@client.fr)');
    expect(call.deposit.texte).toContain('INITECH en capitales.');
    expect(call.deposit.texte).toContain('Relancer le fournisseur');
    expect(call.deposit.texte).toContain('### Décisions');
    expect(call.deposit.texte).toContain('[Marie] Je relance le fournisseur vendredi.');
    expect(meetingDoc(db, meetingId).myBrain).toMatchObject({
      status: 'sent',
      jobs: ['job-1'],
      parts: 1,
    });
  });

  it('imposé par l’administration : part sans rien demander à l’utilisateur', async () => {
    const { app, myBrain } = build();
    await plug(app, 'forced');
    await summarize(app);
    expect(myBrain.calls).toHaveLength(1);
  });

  it('« Enregistrer » (sans compte rendu) : la réunion part aussi, après son titre', async () => {
    const { app, db, myBrain } = build({ seed: seed({ resume: [draft()] }) });
    await plug(app);
    const res = await postJson(app, '/api/history/title', { meetingId: 'draft-1' });
    expect(res.json()).toMatchObject({ titlePending: true });
    await app.background.drain();

    expect(myBrain.calls).toHaveLength(1);
    expect(myBrain.calls[0].deposit.titre).toMatch(
      /^Budget 2026 validé — réunion du 15\/09\/2026$/,
    );
    expect(myBrain.calls[0].deposit.texte).toContain('Point rapide sur le chantier Alpha.');
    expect(meetingDoc(db, 'draft-1').myBrain.status).toBe('sent');
  });

  it('« Enregistrer » une réunion déjà nommée : rien à générer, elle part quand même', async () => {
    const { app, myBrain } = build({
      seed: seed({ resume: [draft({ title: 'Chantier Alpha' })] }),
    });
    await plug(app);
    const res = await postJson(app, '/api/history/title', { meetingId: 'draft-1' });
    expect(res.json()).toMatchObject({ titlePending: false });
    await app.background.drain();
    expect(myBrain.calls).toHaveLength(1);
    expect(myBrain.calls[0].deposit.titre).toBe('Chantier Alpha — réunion du 15/09/2026');
  });

  it('une seule fois : régénérer le compte rendu ne renvoie rien', async () => {
    const { app, myBrain } = build();
    await plug(app);
    const meetingId = await summarize(app);
    await summarize(app, { meetingId, versionId: 'v2' });
    expect(myBrain.calls).toHaveLength(1);
  });

  it("une réunion en cours d'enregistrement ne part pas", async () => {
    const { app, myBrain } = build({ seed: seed({ resume: [draft({ status: 'recording' })] }) });
    await plug(app);
    const result = await feedMeetingToMyBrain({ app, email: EMAIL, meetingId: 'draft-1' });
    expect(result.status).toBe('skipped');
    expect(myBrain.calls).toHaveLength(0);
  });

  it('une réunion sans rien à apprendre ne part pas, et ne garde aucune trace', async () => {
    const { app, db, myBrain } = build({ seed: seed({ resume: [draft({ transcription: '' })] }) });
    await plug(app);
    expect((await feedMeetingToMyBrain({ app, email: EMAIL, meetingId: 'draft-1' })).status).toBe(
      'empty',
    );
    expect(myBrain.calls).toHaveLength(0);
    expect(meetingDoc(db, 'draft-1').myBrain).toBeUndefined();
  });

  it('le tag de la réunion part avec elle, le nom du compte à défaut de celui de la réunion', async () => {
    const { app, myBrain } = build({
      seed: seed({
        resume: [draft({ name: '', tagId: 'tag-1' })],
        userTags: [
          { email: EMAIL, emailLower: EMAIL, id: 'tag-1', label: 'Client Dupont', color: 'blue' },
        ],
      }),
    });
    await plug(app);
    await feedMeetingToMyBrain({ app, email: EMAIL, meetingId: 'draft-1' });
    expect(myBrain.calls[0].deposit.texte).toContain('- Tag : Client Dupont');
    expect(myBrain.calls[0].deposit.texte).toContain('- Auteur : Alex Dupont (alex@client.fr)');
  });

  it('une adresse inconnue de myBrain est notée : la revue ira aux curateurs', async () => {
    const { app, db } = build({
      seed: seed({ resume: [draft()] }),
      myBrain: createFakeMyBrain({
        feed: { job: 'job-9', pour: null, avertissements: ['inconnu'] },
      }),
    });
    await plug(app);
    await feedMeetingToMyBrain({ app, email: EMAIL, meetingId: 'draft-1' });
    expect(meetingDoc(db, 'draft-1').myBrain).toMatchObject({
      status: 'sent',
      recipientUnknown: true,
    });
  });
});

describe('jamais le passé', () => {
  const anHourAgo = () => new Date(Date.now() - 60 * MINUTE).toISOString();
  const pastMeeting = () =>
    draft({ title: 'Réunion de mars', meetingStartTime: anHourAgo(), lastConnecion: anHourAgo() });

  it("imposé : une réunion commencée avant l'activation ne part pas, même rangée ensuite", async () => {
    const { app, db, myBrain } = build({ seed: seed({ resume: [pastMeeting()] }) });
    await plug(app, 'forced', { since: null });
    await postJson(app, '/api/history/title', { meetingId: 'draft-1' });
    await app.background.drain();
    expect(myBrain.calls).toHaveLength(0);
    expect(meetingDoc(db, 'draft-1').myBrain).toBeUndefined();
  });

  it('au choix : activer l’envoi ne fait pas partir une réunion commencée avant, même régénérée', async () => {
    const { app, myBrain } = build({ seed: seed({ resume: [pastMeeting()] }) });
    await plug(app, 'optin');
    await postJson(app, '/api/mybrain/settings', { enabled: true });

    await summarize(app, { meetingId: 'draft-1', versionId: 'v2' });
    expect(myBrain.calls).toHaveLength(0);

    // Une réunion commencée APRÈS l'activation, elle, part.
    await summarize(app);
    expect(myBrain.calls).toHaveLength(1);
  });

  it('passer de « au choix » à « imposé » n’emporte pas les réunions de ceux qui n’avaient rien demandé', async () => {
    const { app, myBrain } = build({ seed: seed({ resume: [pastMeeting()] }) });
    await plug(app, 'optin');
    await app.myBrainSettings.update({ policy: 'forced' }, { actor: ADMIN });
    await postJson(app, '/api/history/title', { meetingId: 'draft-1' });
    await app.background.drain();
    expect(myBrain.calls).toHaveLength(0);
  });

  it('« Réessayer » ne sert pas de porte au passé : une réunion jamais envoyée est refusée', async () => {
    const { app, myBrain } = build({ seed: seed({ resume: [pastMeeting()] }) });
    await plug(app);
    const res = await postJson(app, '/api/mybrain/send', { meetingId: 'draft-1' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('mybrain_not_retryable');
    expect(myBrain.calls).toHaveLength(0);
  });
});

describe('échecs et relances', () => {
  it('échec transitoire : noté, puis relancé par la boucle à l’heure dite', async () => {
    let failures = 1;
    const { app, db, myBrain } = build({
      seed: seed({ resume: [draft()] }),
      myBrain: createFakeMyBrain({
        feed: () => {
          if (failures-- > 0) throw new MyBrainError('mybrain_unreachable', { retryable: true });
          return { job: 'job-2', pour: EMAIL, avertissements: [] };
        },
      }),
    });
    await plug(app);
    await feedMeetingToMyBrain({ app, email: EMAIL, meetingId: 'draft-1' });
    const failed = meetingDoc(db, 'draft-1').myBrain;
    expect(failed).toMatchObject({
      status: 'error',
      error: 'mybrain_unreachable',
      retryable: true,
      attempts: 1,
    });

    // Pas avant l'heure.
    expect(await retryMyBrainFeeds({ app, now: new Date() })).toBe(0);
    expect(myBrain.calls).toHaveLength(1);

    const later = new Date(new Date(failed.nextAttemptAt).getTime() + MINUTE);
    expect(await retryMyBrainFeeds({ app, now: later })).toBe(1);
    expect(myBrain.calls).toHaveLength(2);
    expect(meetingDoc(db, 'draft-1').myBrain).toMatchObject({
      status: 'sent',
      jobs: ['job-2'],
      attempts: 2,
    });
    expect(meetingDoc(db, 'draft-1').myBrain.error).toBeUndefined();
  });

  it('après cinq tentatives, la main passe à l’utilisateur', async () => {
    const { app, db } = build({
      seed: seed({
        resume: [draft({ myBrain: { status: 'error', attempts: 4, retryable: true } })],
      }),
      myBrain: createFakeMyBrain({
        feed: () => {
          throw new MyBrainError('mybrain_error', { status: 503, retryable: true });
        },
      }),
    });
    await plug(app);
    await feedMeetingToMyBrain({ app, email: EMAIL, meetingId: 'draft-1' });
    expect(meetingDoc(db, 'draft-1').myBrain).toMatchObject({
      status: 'error',
      attempts: 5,
      retryable: false,
    });
  });

  it('délai dépassé : jamais relancé automatiquement, « Réessayer » le peut', async () => {
    let timeouts = 1;
    const { app, db, myBrain } = build({
      myBrain: createFakeMyBrain({
        feed: () => {
          // Tel que le client le lève (lib/myBrain/client.js) : peut-être arrivé.
          if (timeouts-- > 0) throw new MyBrainError('mybrain_timeout', { ambiguous: true });
          return { job: 'job-3', pour: EMAIL, avertissements: [] };
        },
      }),
    });
    await plug(app);
    const meetingId = await summarize(app);
    expect(meetingDoc(db, meetingId).myBrain).toMatchObject({
      status: 'error',
      error: 'mybrain_timeout',
      retryable: false,
      ambiguous: true,
    });

    // Ni la régénération, ni la boucle : le dépôt est peut-être arrivé.
    await summarize(app, { meetingId, versionId: 'v2' });
    await retryMyBrainFeeds({ app, now: new Date(Date.now() + 24 * 60 * MINUTE) });
    expect(myBrain.calls).toHaveLength(1);

    const retried = await postJson(app, '/api/mybrain/send', { meetingId });
    expect(retried.statusCode).toBe(200);
    expect(myBrain.calls).toHaveLength(2);
    expect(meetingDoc(db, meetingId).myBrain).toMatchObject({ status: 'sent', jobs: ['job-3'] });
  });

  it('en plusieurs parties : une reprise repart de la partie en échec', async () => {
    let call = 0;
    const { app, db, myBrain } = build({
      seed: seed({
        resume: [
          draft({
            transcription: Array.from(
              { length: 3000 },
              (_, i) => `[Alex] Réplique ${i} ${'x'.repeat(90)}`,
            ).join('\n'),
          }),
        ],
      }),
      myBrain: createFakeMyBrain({
        feed: () => {
          call += 1;
          if (call === 2)
            throw new MyBrainError('mybrain_rate_limited', { status: 429, retryable: true });
          return { job: `job-${call}`, pour: EMAIL, avertissements: [] };
        },
      }),
    });
    await plug(app);
    await feedMeetingToMyBrain({ app, email: EMAIL, meetingId: 'draft-1' });
    const failed = meetingDoc(db, 'draft-1').myBrain;
    expect(failed.parts).toBeGreaterThanOrEqual(3);
    expect(failed).toMatchObject({
      status: 'error',
      error: 'mybrain_rate_limited',
      jobs: ['job-1'],
    });

    await retryMyBrainFeeds({
      app,
      now: new Date(new Date(failed.nextAttemptAt).getTime() + MINUTE),
    });
    const done = meetingDoc(db, 'draft-1').myBrain;
    expect(done.status).toBe('sent');
    expect(done.jobs).toHaveLength(failed.parts);
    // La partie 1 n'a pas été redéposée : parties + l'essai en échec.
    expect(myBrain.calls).toHaveLength(failed.parts + 1);
    expect(myBrain.calls[2].deposit.titre).toContain(`(partie 2 sur ${failed.parts})`);
  });

  it('en plusieurs parties : un compte rendu régénéré avant la reprise ne perd ni ne double aucune réplique', async () => {
    const transcription = Array.from(
      { length: 3000 },
      (_, i) => `[Alex] Réplique ${i} ${'x'.repeat(90)}`,
    ).join('\n');
    let call = 0;
    const { app, db, myBrain } = build({
      seed: seed({ resume: [draft({ transcription, resume: '<p>Court.</p>' })] }),
      myBrain: createFakeMyBrain({
        feed: () => {
          call += 1;
          if (call === 2)
            throw new MyBrainError('mybrain_rate_limited', { status: 429, retryable: true });
          return { job: `job-${call}`, pour: EMAIL, avertissements: [] };
        },
      }),
    });
    await plug(app);
    await feedMeetingToMyBrain({ app, email: EMAIL, meetingId: 'draft-1' });
    const failed = meetingDoc(db, 'draft-1').myBrain;
    expect(failed.cuts).toHaveLength(failed.parts);

    // Entre les deux essais, le compte rendu change de taille — la place de la
    // transcription dans la partie 1 aussi. Recalculer le découpage perdait
    // des répliques ; il est rejoué.
    meetingDoc(db, 'draft-1').resume = `<p>${'Compte rendu développé. '.repeat(400)}</p>`;
    await retryMyBrainFeeds({
      app,
      now: new Date(new Date(failed.nextAttemptAt).getTime() + MINUTE),
    });
    expect(meetingDoc(db, 'draft-1').myBrain.status).toBe('sent');

    const accepted = myBrain.calls.filter((_, i) => i !== 1);
    const rebuilt = accepted
      .map((c) => c.deposit.texte.split(/## Transcription intégrale(?: \(suite\))?\n\n/)[1])
      .join('\n');
    expect(rebuilt).toBe(transcription);
  });

  it('envoi interrompu en route : la boucle le déclare ambigu, sans rien renvoyer', async () => {
    const old = new Date(Date.now() - MYBRAIN_SENDING_STALE_MS - MINUTE).toISOString();
    const { app, db, myBrain } = build({
      seed: seed({
        resume: [draft({ myBrain: { status: 'sending', updatedAt: old, attempts: 1 } })],
      }),
    });
    await plug(app);
    await retryMyBrainFeeds({ app });
    expect(myBrain.calls).toHaveLength(0);
    expect(meetingDoc(db, 'draft-1').myBrain).toMatchObject({
      status: 'error',
      error: 'mybrain_interrupted',
      retryable: false,
      ambiguous: true,
    });
  });

  it("un compte qui n'envoie plus sort de la file de relance", async () => {
    const { app, db, myBrain } = build({
      seed: seed({
        resume: [
          draft({
            myBrain: {
              status: 'error',
              retryable: true,
              attempts: 1,
              nextAttemptAt: '2026-01-01T00:00:00.000Z',
            },
          }),
        ],
      }),
    });
    await plug(app, 'optin');
    await retryMyBrainFeeds({ app });
    expect(myBrain.calls).toHaveLength(0);
    expect(meetingDoc(db, 'draft-1').myBrain.retryable).toBe(false);
  });
});

describe('Ma configuration → MyBrain', () => {
  it("sans myBrain branché : indisponible, et le choix ne s'écrit pas", async () => {
    const { app } = build();
    expect((await getJson(app, '/api/mybrain/settings')).json()).toMatchObject({
      available: false,
      active: false,
      recent: [],
    });
    const res = await postJson(app, '/api/mybrain/settings', { enabled: true });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('mybrain_disabled');
  });

  it("imposé : le choix de l'utilisateur ne s'écrit pas (409, jamais 403)", async () => {
    const { app } = build();
    await plug(app, 'forced');
    const view = (await getJson(app, '/api/mybrain/settings')).json();
    expect(view).toMatchObject({ available: true, policy: 'forced', enabled: false, active: true });
    const res = await postJson(app, '/api/mybrain/settings', { enabled: false });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('mybrain_policy_forced');
  });

  it('les derniers envois : leur état et de quoi les nommer, jamais leur contenu', async () => {
    const { app } = build();
    await plug(app);
    const meetingId = await summarize(app);
    const view = (await getJson(app, '/api/mybrain/settings')).json();
    expect(view.reviewUrl).toBe('https://cerveau.example.test/revue');
    expect(view.recent).toHaveLength(1);
    expect(view.recent[0]).toMatchObject({
      meetingId,
      title: 'Budget 2026 validé',
      status: 'sent',
      parts: 1,
    });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('Je relance le fournisseur');
    expect(serialized).not.toContain('INITECH');
  });

  it("les envois d'un autre compte ne se voient pas", async () => {
    const { app } = build();
    await plug(app);
    await summarize(app, {}, OTHER);
    expect((await getJson(app, '/api/mybrain/settings')).json().recent).toEqual([]);
  });

  it('« Réessayer » : la réunion d’un autre est introuvable, une réunion arrivée ne repart pas', async () => {
    const { app, myBrain } = build();
    await plug(app);
    const mine = await summarize(app);
    const theirs = await summarize(app, {}, OTHER);
    expect(myBrain.calls).toHaveLength(2);

    const foreign = await postJson(app, '/api/mybrain/send', { meetingId: theirs });
    expect(foreign.statusCode).toBe(404);
    const again = await postJson(app, '/api/mybrain/send', { meetingId: mine });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('mybrain_already_sent');
    expect(myBrain.calls).toHaveLength(2);
  });

  it('« Réessayer » est plafonné par compte : la clé myBrain est partagée par tous', async () => {
    const { app, myBrain } = buildTestApp({
      seed: seed({ resume: [draft({ myBrain: { status: 'error', error: 'mybrain_error' } })] }),
      openai,
      myBrain: createFakeMyBrain({
        feed: () => {
          throw new MyBrainError('mybrain_error', { status: 503, retryable: true });
        },
      }),
      config: {
        rateLimits: {
          ...loadConfig().rateLimits,
          myBrainSendByAccount: { windowMs: 60 * MINUTE, max: 2 },
        },
      },
    });
    await plug(app);
    const statuses = [];
    for (let i = 0; i < 3; i += 1) {
      statuses.push(
        (await postJson(app, '/api/mybrain/send', { meetingId: 'draft-1' })).statusCode,
      );
    }
    expect(statuses).toEqual([502, 502, 429]);
    expect(myBrain.calls).toHaveLength(2);
  });

  it('« Réessayer » qui échoue encore : 502 et le motif, jamais 401/403', async () => {
    const { app } = build({
      seed: seed({
        resume: [draft({ myBrain: { status: 'error', error: 'mybrain_error', attempts: 5 } })],
      }),
      myBrain: createFakeMyBrain({
        feed: () => {
          throw new MyBrainError('mybrain_key_rejected', { status: 401 });
        },
      }),
    });
    await plug(app);
    const res = await postJson(app, '/api/mybrain/send', { meetingId: 'draft-1' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('mybrain_key_rejected');
  });
});
