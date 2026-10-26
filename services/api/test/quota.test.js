/**
 * Quota de minutes de réunion par groupe (lib/quota.js, routes/quota.js, et
 * les portes de routes/ai.js).
 *
 * Ce qui se vérifie ici et nulle part ailleurs : le plus généreux des groupes
 * l'emporte et « illimité » gagne ; seules les réunions du mois civil en cours,
 * à l'heure de Paris, comptent, par leur durée au chronomètre ; « atteint » = moins d'une minute
 * pleine ; /tempkey et l'import refusent en 409 avec l'état, jamais les
 * segments hors ligne ; /init et GET /quota rendent la même forme ; une
 * réunion supprimée garde ses minutes jusqu'à la fin de son mois, et ne compte
 * qu'une fois.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildTestApp,
  createFakeDb,
  identityHeaders,
  multipartBody,
  userDoc,
  groupDoc,
  defaultGroupDoc,
} from './helpers.js';
import {
  currentPeriod,
  effectiveLimit,
  buildQuotaStatus,
  sumDurations,
  deletedUsageTrace,
  DELETED_USAGE_COLLECTION,
} from '../lib/quota.js';
import { bootstrap } from '../lib/bootstrap.js';

const USER = 'simple@client.fr';
const ADMIN = 'patron@client.fr';
const SALES = 'g-sales';

/** Une réunion du compte, datée dans le mois voulu, avec sa durée en secondes. */
const meeting = (email, date, seconds, extra = {}) => ({
  meetingId: `m-${date}-${seconds}`,
  email,
  emailLower: email.toLowerCase(),
  lastConnecion: date,
  now: date,
  meetingDuration: seconds,
  ...extra,
});

const NOW = new Date('2026-09-25T10:00:00.000Z');

const getAs = (app, url, email = USER) =>
  app.inject({ method: 'GET', url, headers: identityHeaders(email) });

describe('lib/quota — fonctions pures', () => {
  it('le mois civil en cours à l heure de Paris, en instants UTC, borne haute exclue', () => {
    // Septembre à Paris : du 1er à 0 h — 22 h UTC la veille, heure d'été — au 1er octobre 0 h.
    expect(currentPeriod(NOW)).toEqual({
      start: '2026-08-31T22:00:00.000Z',
      end: '2026-09-30T22:00:00.000Z',
      timeZone: 'Europe/Paris',
    });
    // Le 31 décembre à 23 h 30 UTC, c'est déjà janvier à Paris (heure d'hiver).
    expect(currentPeriod(new Date('2026-12-31T23:30:00.000Z'))).toMatchObject({
      start: '2026-12-31T23:00:00.000Z',
      end: '2027-01-31T23:00:00.000Z',
    });
    // Octobre change d'heure en route : il commence en heure d'été, finit en heure d'hiver.
    expect(currentPeriod(new Date('2026-10-15T12:00:00.000Z'))).toMatchObject({
      start: '2026-09-30T22:00:00.000Z',
      end: '2026-10-31T23:00:00.000Z',
    });
  });

  it('le quota le plus généreux des groupes s applique, et « illimité » l emporte', () => {
    const small = groupDoc('a', { meetingMinutesPerMonth: 60 });
    const big = groupDoc('b', { meetingMinutesPerMonth: 300 });
    const free = groupDoc('c', { meetingMinutesPerMonth: null });
    expect(effectiveLimit([small, big])).toEqual({ minutes: 300, group: big });
    expect(effectiveLimit([big, small])).toEqual({ minutes: 300, group: big });
    expect(effectiveLimit([small, free, big])).toEqual({ minutes: null, group: free });
    expect(effectiveLimit([])).toEqual({ minutes: null, group: null });
  });

  it('une valeur de quota écrite autrement vaut « illimité », zéro vaut zéro', () => {
    expect(effectiveLimit([groupDoc('a', { meetingMinutesPerMonth: '90' })]).minutes).toBe(null);
    expect(effectiveLimit([groupDoc('a', { meetingMinutesPerMonth: -5 })]).minutes).toBe(null);
    expect(effectiveLimit([groupDoc('a', { meetingMinutesPerMonth: 0 })]).minutes).toBe(0);
  });

  it('additionne les durées exploitables et ignore les autres', () => {
    expect(
      sumDurations([
        { meetingDuration: 600 },
        { meetingDuration: null },
        { meetingDuration: 'abc' },
        { meetingDuration: 0 },
        {},
        { meetingDuration: 30 },
      ]),
    ).toBe(630);
  });

  it('compte une réunion une fois, pour sa plus longue durée connue', () => {
    expect(
      sumDurations([
        { meetingId: 'a', meetingDuration: 600 },
        // La même réunion, tracée à sa suppression puis recréée : une seule fois.
        { meetingId: 'a', meetingDuration: 900 },
        { meetingId: 'b', meetingDuration: 300 },
        { meetingId: 'b', meetingDuration: null },
        // Sans identifiant (n8n) : chacune compte pour elle seule.
        { meetingDuration: 60 },
        { meetingDuration: 60 },
      ]),
    ).toBe(900 + 300 + 120);
  });

  it('la trace d une réunion supprimée : propriétaire, date et durée, jusqu à la fin de son mois', () => {
    const doc = {
      meetingId: 'm1',
      lastConnecion: '2026-09-02T08:00:00.000Z',
      meetingDuration: 40 * 60,
      status: 'ended',
    };
    expect(deletedUsageTrace('Simple@Client.fr', doc, NOW)).toEqual({
      email: 'Simple@Client.fr',
      emailLower: USER,
      meetingId: 'm1',
      lastConnecion: '2026-09-02T08:00:00.000Z',
      meetingDuration: 40 * 60,
      deletedAt: NOW.toISOString(),
      // 1er octobre, 0 h à Paris : le renouvellement, où elle cesse de compter.
      expiresAt: new Date('2026-09-30T22:00:00.000Z'),
    });
    // En cours d'enregistrement : pas encore de durée, l'arrêt l'écrira.
    expect(
      deletedUsageTrace(USER, { ...doc, meetingDuration: null, status: 'recording' }, NOW),
    ).toMatchObject({ meetingId: 'm1', meetingDuration: null });
    // Rien à garder : aucune durée et aucun arrêt à venir (import, réunion
    // close sans chronomètre), un mois fini, une date illisible.
    expect(deletedUsageTrace(USER, { ...doc, meetingDuration: null }, NOW)).toBe(null);
    expect(
      deletedUsageTrace(USER, { ...doc, lastConnecion: '2026-08-31T21:59:59.000Z' }, NOW),
    ).toBe(null);
    expect(deletedUsageTrace(USER, { ...doc, lastConnecion: 'hier' }, NOW)).toBe(null);
    expect(deletedUsageTrace(USER, { ...doc, lastConnecion: undefined }, NOW)).toBe(null);
  });

  it('« atteint » quand il reste moins d une minute pleine, jamais en illimité', () => {
    const period = currentPeriod(NOW);
    const limited = buildQuotaStatus({ minutes: 120, group: null, usedSeconds: 45 * 60, period });
    expect(limited).toMatchObject({
      unlimited: false,
      limitMinutes: 120,
      usedMinutes: 45,
      remainingMinutes: 75,
      exhausted: false,
    });
    // 119 min 30 s consommées : 30 s restantes, l'écran dit « 0 min », le serveur refuse.
    expect(
      buildQuotaStatus({ minutes: 120, group: null, usedSeconds: 119 * 60 + 30, period }),
    ).toMatchObject({ remainingMinutes: 0, exhausted: true });
    // Dépassement : jamais de reste négatif.
    expect(
      buildQuotaStatus({ minutes: 60, group: null, usedSeconds: 61 * 60, period }),
    ).toMatchObject({ usedMinutes: 61, remainingMinutes: 0, exhausted: true });
    expect(buildQuotaStatus({ minutes: null, group: null, usedSeconds: 0, period })).toMatchObject({
      unlimited: true,
      limitMinutes: null,
      remainingMinutes: null,
      exhausted: false,
    });
  });
});

describe('app.quota.statusFor', () => {
  it('ne compte que les réunions du mois en cours, par leur durée au chronomètre', async () => {
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(USER, { groupIds: [SALES] })],
        userGroups: [defaultGroupDoc(), groupDoc(SALES, { meetingMinutesPerMonth: 120 })],
        resume: [
          meeting(USER, '2026-09-03T09:00:00.000Z', 30 * 60),
          meeting(USER, '2026-09-20T14:00:00.000Z', 15 * 60),
          // Le mois dernier et le mois prochain, à l'heure de Paris : hors période.
          meeting(USER, '2026-08-31T21:59:59.000Z', 60 * 60), // 31 août, 23:59:59
          meeting(USER, '2026-09-30T22:00:00.000Z', 60 * 60), // 1er octobre, 0 h
          // La réunion d'un autre compte ne compte pas.
          meeting(ADMIN, '2026-09-10T09:00:00.000Z', 60 * 60),
          // Une réunion en cours n'a pas encore de durée : rien à compter.
          meeting(USER, '2026-09-25T09:30:00.000Z', null, { status: 'recording' }),
        ],
      },
    });
    const status = await app.quota.statusFor({ email: USER }, NOW);
    expect(status).toMatchObject({
      unlimited: false,
      limitMinutes: 120,
      usedMinutes: 45,
      remainingMinutes: 75,
      exhausted: false,
      group: { id: SALES, name: SALES },
    });
    expect(status.period.start).toBe('2026-08-31T22:00:00.000Z');
  });

  it('retrouve les réunions par emailLower, quelle que soit la casse de l adresse', async () => {
    // Le cas réel : compte en minuscules, réunions écrites avec l'adresse telle
    // que l'annuaire la renvoie — et `emailLower` posé par ownerFields ou par
    // le backfill du démarrage (cf. lib/ownerScope.js).
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(USER, { groupIds: [SALES] })],
        userGroups: [defaultGroupDoc(), groupDoc(SALES, { meetingMinutesPerMonth: 60 })],
        resume: [
          {
            meetingId: 'mixed',
            email: 'Simple@Client.fr',
            emailLower: USER,
            lastConnecion: '2026-09-05T09:00:00.000Z',
            meetingDuration: 600,
          },
        ],
      },
    });
    const status = await app.quota.statusFor({ email: 'Simple@Client.fr' }, NOW);
    expect(status.usedMinutes).toBe(10);
  });

  it('un compte sans champ de groupe est dans le groupe par défaut, illimité à sa naissance', async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(USER)], userGroups: [defaultGroupDoc()] },
    });
    expect(await app.quota.statusFor({ email: USER }, NOW)).toMatchObject({
      unlimited: true,
      group: { id: 'default' },
    });
  });

  it('un quota posé sur le groupe par défaut vaut pour tout le monde', async () => {
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(USER)],
        userGroups: [defaultGroupDoc({ meetingMinutesPerMonth: 90 })],
      },
    });
    expect(await app.quota.statusFor({ email: USER }, NOW)).toMatchObject({
      unlimited: false,
      limitMinutes: 90,
      remainingMinutes: 90,
    });
  });
});

describe('le renouvellement, le 1er du mois à minuit, heure de Paris', () => {
  // Aucun compteur n'est stocké : le mois est recalculé à chaque lecture, c'est
  // ce qui fait le renouvellement. Un compte à 60 min, tout consommé en septembre.
  // Heure d'été : minuit à Paris, c'est 22 h UTC la veille.
  const septemberSpent = () => ({
    user: [userDoc(USER, { groupIds: [SALES] })],
    userGroups: [defaultGroupDoc(), groupDoc(SALES, { meetingMinutesPerMonth: 60 })],
    resume: [
      meeting(USER, '2026-09-02T08:00:00.000Z', 40 * 60),
      meeting(USER, '2026-09-30T21:00:00.000Z', 20 * 60), // 30 septembre, 23 h
    ],
  });

  it('atteint jusqu à la dernière milliseconde du mois, plein à minuit', async () => {
    const { app } = buildTestApp({ seed: septemberSpent() });
    const lastInstant = new Date('2026-09-30T21:59:59.999Z'); // 30 septembre, 23:59:59.999
    expect(await app.quota.statusFor({ email: USER }, lastInstant)).toMatchObject({
      exhausted: true,
      remainingMinutes: 0,
    });
    const renewal = await app.quota.statusFor(
      { email: USER },
      new Date('2026-09-30T22:00:00.000Z'), // 1er octobre, 0 h
    );
    expect(renewal).toMatchObject({
      exhausted: false,
      usedSeconds: 0,
      remainingMinutes: 60,
      period: {
        start: '2026-09-30T22:00:00.000Z',
        end: '2026-10-31T23:00:00.000Z', // heure d'hiver le 1er novembre
        timeZone: 'Europe/Paris',
      },
    });
  });

  it('/tempkey refuse le 30 à 23:59:59 et ouvre la session le 1er à minuit', async () => {
    // Seule la date est simulée : la porte lit l'horloge, rien ne lui est injecté.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { app } = buildTestApp({ seed: septemberSpent() });
      vi.setSystemTime(new Date('2026-09-30T21:59:59.000Z'));
      expect((await getAs(app, '/api/tempkey')).statusCode).toBe(409);
      vi.setSystemTime(new Date('2026-09-30T22:00:00.000Z'));
      expect((await getAs(app, '/api/tempkey')).statusCode).toBe(200);
      expect((await getAs(app, '/api/quota')).json()).toMatchObject({ remainingMinutes: 60 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('une réunion commencée le 1er à 0 h 30 compte pour le nouveau mois, pas l ancien', async () => {
    // 22 h 30 UTC le 30 septembre : en UTC, elle aurait compté pour septembre.
    const seed = septemberSpent();
    seed.resume.push(meeting(USER, '2026-09-30T22:30:00.000Z', 25 * 60));
    const { app } = buildTestApp({ seed });
    expect(
      await app.quota.statusFor({ email: USER }, new Date('2026-10-15T12:00:00.000Z')),
    ).toMatchObject({ usedMinutes: 25, remainingMinutes: 35 });
    expect(
      await app.quota.statusFor({ email: USER }, new Date('2026-09-30T21:30:00.000Z')),
    ).toMatchObject({ usedMinutes: 60 });
  });

  it('des mois du 1er au 1er à minuit, sans trou ni chevauchement, sur trois années', () => {
    const HOUR = 3600000;
    for (let day = Date.UTC(2027, 0, 1); day < Date.UTC(2030, 0, 1); day += 24 * HOUR) {
      // Autour de minuit à Paris — 22 h ou 23 h UTC selon la saison —, à la milliseconde.
      const around = [22 * HOUR - 1, 22 * HOUR, 23 * HOUR - 1, 23 * HOUR].map((h) => day + h);
      for (const at of around) {
        const iso = new Date(at).toISOString();
        const { start, end } = currentPeriod(new Date(at));
        expect(start <= iso && iso < end, iso).toBe(true);
        expect(currentPeriod(new Date(end)).start).toBe(end);
        // Le 1er à 0 h à Paris : heure d'été d'avril à octobre (22 h UTC la
        // veille), d'hiver de novembre à mars (23 h UTC) — l'heure change le
        // dernier dimanche de mars et d'octobre, jamais un 1er.
        const month = new Date(Date.parse(start) + 2 * HOUR).getUTCMonth() + 1;
        const summer = month >= 4 && month <= 10;
        expect(start.slice(10), iso).toBe(summer ? 'T22:00:00.000Z' : 'T23:00:00.000Z');
        expect(new Date(Date.parse(start) + (summer ? 2 : 1) * HOUR).getUTCDate()).toBe(1);
      }
    }
  });
});

describe('GET /api/quota et /api/init', () => {
  it('rendent le même état, avec le groupe qui donne le quota', async () => {
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(USER, { groupIds: ['default', SALES] })],
        userGroups: [
          defaultGroupDoc({ meetingMinutesPerMonth: 30 }),
          groupDoc(SALES, { name: 'Commerciaux', color: 'blue', meetingMinutesPerMonth: 120 }),
        ],
        resume: [meeting(USER, new Date().toISOString(), 20 * 60)],
      },
    });
    const quota = (await getAs(app, '/api/quota')).json();
    expect(quota).toMatchObject({
      unlimited: false,
      limitMinutes: 120,
      usedMinutes: 20,
      remainingMinutes: 100,
      exhausted: false,
      group: { id: SALES, name: 'Commerciaux', color: 'blue' },
    });
    const init = (await getAs(app, '/api/init')).json();
    expect(init.quota).toEqual(quota);
  });

  it('GET /api/quota exige une identité', async () => {
    const { app } = buildTestApp();
    expect((await app.inject({ method: 'GET', url: '/api/quota' })).statusCode).toBe(401);
  });
});

describe('les portes de la transcription', () => {
  const exhaustedSeed = () => ({
    user: [userDoc(USER, { groupIds: [SALES] })],
    userGroups: [defaultGroupDoc(), groupDoc(SALES, { meetingMinutesPerMonth: 60 })],
    resume: [meeting(USER, new Date().toISOString(), 60 * 60)],
  });

  it('/tempkey refuse en 409 quota_exhausted, avec l état, sans appeler OpenAI', async () => {
    const { app, ai } = buildTestApp({ seed: exhaustedSeed() });
    const res = await getAs(app, '/api/tempkey?lang=fr');
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('quota_exhausted');
    expect(res.json().quota).toMatchObject({ exhausted: true, remainingMinutes: 0 });
    expect(ai.calls).toHaveLength(0);
  });

  it('/tempkey ouvre la session tant qu il reste au moins une minute', async () => {
    const seed = exhaustedSeed();
    seed.resume = [meeting(USER, new Date().toISOString(), 58 * 60)];
    const { app, ai } = buildTestApp({ seed });
    expect((await getAs(app, '/api/tempkey?lang=fr')).statusCode).toBe(200);
    expect(ai.calls[0].method).toBe('realtimeClientSecret');
  });

  it('/tempkey laisse passer un compte illimité, et un compte sans quota posé', async () => {
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(USER, { groupIds: [SALES, 'g-free'] })],
        userGroups: [
          defaultGroupDoc(),
          groupDoc(SALES, { meetingMinutesPerMonth: 0 }),
          groupDoc('g-free', { meetingMinutesPerMonth: null }),
        ],
      },
    });
    expect((await getAs(app, '/api/tempkey')).statusCode).toBe(200);
  });

  it('un quota à zéro interdit tout démarrage', async () => {
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(USER)],
        userGroups: [defaultGroupDoc({ meetingMinutesPerMonth: 0 })],
      },
    });
    expect((await getAs(app, '/api/tempkey')).statusCode).toBe(409);
  });

  it('/record refuse un import quand le quota est atteint, mais jamais un segment hors ligne', async () => {
    const { app, ai } = buildTestApp({
      seed: exhaustedSeed(),
      openai: { transcribe: { text: 'Bonjour' } },
    });
    const { body, headers } = multipartBody('fake-bytes', 'import.webm');
    const refused = await app.inject({
      method: 'POST',
      url: '/api/record',
      headers: { ...identityHeaders(USER), ...headers },
      body,
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('quota_exhausted');
    expect(ai.calls).toHaveLength(0);

    const offline = await app.inject({
      method: 'POST',
      url: '/api/record?source=offline',
      headers: { ...identityHeaders(USER), ...headers },
      body,
    });
    expect(offline.statusCode).toBe(200);
    expect(offline.json()).toEqual({ text: 'Bonjour' });
  });
});

describe('une réunion supprimée garde ses minutes', () => {
  // Le quota mesure ce qui a été transcrit — payé chez OpenAI —, pas ce que
  // l'historique garde. Un compte à 60 min, tout consommé en septembre.
  const spentSeed = () => ({
    user: [userDoc(USER, { groupIds: [SALES] })],
    userGroups: [defaultGroupDoc(), groupDoc(SALES, { meetingMinutesPerMonth: 60 })],
    resume: [
      meeting(USER, '2026-09-02T08:00:00.000Z', 40 * 60),
      meeting(USER, '2026-09-20T14:00:00.000Z', 20 * 60),
    ],
  });
  const postAs = (app, url, body, email = USER) =>
    app.inject({
      method: 'POST',
      url,
      headers: { ...identityHeaders(email), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const traces = (db) => db.data.get(DELETED_USAGE_COLLECTION) || [];
  /** Les routes lisent l'horloge : seule la date est simulée, le 25 septembre. */
  const atNow = async (fn) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(NOW);
      return await fn();
    } finally {
      vi.useRealTimers();
    }
  };

  it('quota atteint : supprimer une réunion du mois ne le fait pas repasser sous la limite', () =>
    atNow(async () => {
      const seed = spentSeed();
      const { app } = buildTestApp({ seed });
      expect((await getAs(app, '/api/quota')).json()).toMatchObject({
        exhausted: true,
        usedMinutes: 60,
      });

      const res = await postAs(app, '/api/history/delete', { meetingId: seed.resume[0].meetingId });
      expect(res.statusCode).toBe(200);
      // La réunion a bien quitté l'historique…
      expect((await getAs(app, '/api/history')).json()).toHaveLength(1);
      // …mais pas le quota : ses 40 minutes restent consommées.
      expect((await getAs(app, '/api/quota')).json()).toMatchObject({
        exhausted: true,
        usedMinutes: 60,
        remainingMinutes: 0,
      });
      expect((await getAs(app, '/api/tempkey')).statusCode).toBe(409);
    }));

  it('la trace ne garde rien de ce qui a été dit', () =>
    atNow(async () => {
      const seed = spentSeed();
      Object.assign(seed.resume[0], {
        title: 'Comité de direction',
        transcription: 'Bonjour à tous',
        resume: '<p>Compte rendu</p>',
        notes: 'Confidentiel',
      });
      const { app, db } = buildTestApp({ seed });
      await postAs(app, '/api/history/delete', { meetingId: seed.resume[0].meetingId });
      expect(traces(db)).toHaveLength(1);
      expect(Object.keys(traces(db)[0]).sort()).toEqual([
        'deletedAt',
        'email',
        'emailLower',
        'expiresAt',
        'lastConnecion',
        'meetingDuration',
        'meetingId',
      ]);
    }));

  it('une réunion d un mois écoulé ne laisse rien, et le mois en cours ne bouge pas', () =>
    atNow(async () => {
      const seed = spentSeed();
      seed.resume.push(meeting(USER, '2026-08-20T09:00:00.000Z', 90 * 60));
      const { app, db } = buildTestApp({ seed });
      await postAs(app, '/api/history/delete', { meetingId: seed.resume[2].meetingId });
      expect(traces(db)).toEqual([]);
      expect((await getAs(app, '/api/quota')).json()).toMatchObject({ usedMinutes: 60 });
    }));

  it('ses minutes comptent jusqu à la fin du mois, plus au renouvellement', async () => {
    const seed = spentSeed();
    const { app } = buildTestApp({ seed });
    await atNow(() => postAs(app, '/api/history/delete', { meetingId: seed.resume[0].meetingId }));
    expect(
      await app.quota.statusFor({ email: USER }, new Date('2026-09-30T21:59:59.999Z')),
    ).toMatchObject({ usedMinutes: 60, exhausted: true });
    expect(
      await app.quota.statusFor({ email: USER }, new Date('2026-09-30T22:00:00.000Z')),
    ).toMatchObject({ usedSeconds: 0, remainingMinutes: 60 });
  });

  it('une réunion recréée après sa suppression, puis supprimée de nouveau, compte une fois', () =>
    atNow(async () => {
      const seed = spentSeed();
      const { app, db } = buildTestApp({ seed });
      const { meetingId } = seed.resume[0];
      await postAs(app, '/api/history/delete', { meetingId });
      // Un onglet resté ouvert sur elle génère son compte rendu : /resume la
      // recrée, même identifiant, même chronomètre.
      const regenerated = await postAs(app, '/api/resume', {
        meetingId,
        versionId: 'v1',
        systemPrompt: 'Résume',
        transcription: 'Bonjour à tous',
        meetingDuration: 40 * 60,
      });
      expect(regenerated.statusCode).toBe(200);
      expect((await getAs(app, '/api/history')).json()).toHaveLength(2);
      expect((await getAs(app, '/api/quota')).json()).toMatchObject({ usedMinutes: 60 });
      await postAs(app, '/api/history/delete', { meetingId });
      expect(traces(db)).toHaveLength(2);
      expect((await getAs(app, '/api/quota')).json()).toMatchObject({ usedMinutes: 60 });
    }));

  it('supprimée pendant l enregistrement, la réunion compte à son arrêt', () =>
    atNow(async () => {
      const { app, db } = buildTestApp({
        seed: { ...spentSeed(), resume: [meeting(USER, '2026-09-02T08:00:00.000Z', 20 * 60)] },
      });
      await postAs(app, '/api/history/start', {
        meetingId: 'live',
        startedAt: '2026-09-25T09:00:00.000Z',
      });
      // « Supprimer la réunion » en fin de réunion : la suppression part AVANT
      // la clôture, qui attend le dernier envoi de transcription.
      await postAs(app, '/api/history/delete', { meetingId: 'live' });
      expect(traces(db)).toMatchObject([{ meetingId: 'live', meetingDuration: null }]);
      const stop = await postAs(app, '/api/history/stop', {
        meetingId: 'live',
        duration: 30 * 60,
        discardIfEmpty: true,
      });
      expect(stop.statusCode).toBe(404);
      expect((await getAs(app, '/api/quota')).json()).toMatchObject({
        usedMinutes: 50,
        remainingMinutes: 10,
      });
      // Arrêt rejoué, ou plus court : la durée inscrite ne bouge pas.
      await postAs(app, '/api/history/stop', { meetingId: 'live', duration: 5 * 60 });
      expect((await getAs(app, '/api/quota')).json()).toMatchObject({ usedMinutes: 50 });
    }));

  it('un enregistrement où rien n a été dit, effacé à l arrêt, ne compte toujours pas', () =>
    atNow(async () => {
      const { app, db } = buildTestApp({
        seed: { ...spentSeed(), resume: [meeting(USER, '2026-09-02T08:00:00.000Z', 20 * 60)] },
      });
      await postAs(app, '/api/history/start', { meetingId: 'vide' });
      const stop = await postAs(app, '/api/history/stop', {
        meetingId: 'vide',
        duration: 30 * 60,
        discardIfEmpty: true,
      });
      expect(stop.json()).toEqual({ ok: true, discarded: true });
      expect(traces(db)).toEqual([]);
      expect((await getAs(app, '/api/quota')).json()).toMatchObject({ usedMinutes: 20 });
    }));

  it('une trace impossible à écrire fait échouer la suppression : la réunion reste', () =>
    atNow(async () => {
      const seed = spentSeed();
      const { app, db } = buildTestApp({ seed });
      db.failNext('insertMany', new Error('écriture refusée'));
      const res = await postAs(app, '/api/history/delete', { meetingId: seed.resume[0].meetingId });
      expect(res.statusCode).toBe(500);
      expect((await getAs(app, '/api/history')).json()).toHaveLength(2);
      expect((await getAs(app, '/api/quota')).json()).toMatchObject({ usedMinutes: 60 });
    }));

  it('le démarrage pose l index qui efface chaque trace à la fin de son mois', async () => {
    const db = createFakeDb();
    const silent = { info() {}, warn() {}, error() {} };
    await bootstrap(
      db,
      {
        adminSeed: { enabled: false, email: '', password: '' },
        legacyAdminDomain: '',
        adminEmails: [],
        adminEmailDomains: [],
      },
      silent,
      {},
    );
    expect(db.calls).toContainEqual(
      expect.objectContaining({
        collection: DELETED_USAGE_COLLECTION,
        op: 'createIndex',
        spec: { expiresAt: 1 },
        options: { expireAfterSeconds: 0 },
      }),
    );
  });
});

describe('le quota dans l administration des groupes', () => {
  const asAdmin = (app, url, body) =>
    app.inject({
      method: 'POST',
      url,
      headers: { ...identityHeaders(ADMIN), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const seed = () => ({
    user: [userDoc(ADMIN, { role: 'admin' })],
    userGroups: [defaultGroupDoc(), groupDoc(SALES, { name: 'Commerciaux' })],
  });

  it('se pose à la création, se lit sur le catalogue, se retire avec null', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const created = await asAdmin(app, '/api/admin/groups/create', {
      name: 'Stagiaires',
      meetingMinutesPerMonth: 120,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().group.meetingMinutesPerMonth).toBe(120);

    const list = (await getAs(app, '/api/admin/groups', ADMIN)).json().groups;
    expect(list.find((g) => g.name === 'Stagiaires').meetingMinutesPerMonth).toBe(120);
    // Sans quota posé : illimité, y compris pour le groupe par défaut.
    expect(list.find((g) => g.id === 'default').meetingMinutesPerMonth).toBe(null);
    expect(list.find((g) => g.id === SALES).meetingMinutesPerMonth).toBe(null);

    const id = created.json().group.id;
    const untouched = await asAdmin(app, '/api/admin/groups/update', { id, name: 'Stagiaires 2' });
    expect(untouched.json().group.meetingMinutesPerMonth).toBe(120);
    const freed = await asAdmin(app, '/api/admin/groups/update', {
      id,
      meetingMinutesPerMonth: null,
    });
    expect(freed.json().group.meetingMinutesPerMonth).toBe(null);
  });

  it('se pose aussi sur le groupe par défaut', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await asAdmin(app, '/api/admin/groups/update', {
      id: 'default',
      meetingMinutesPerMonth: 45,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().group).toMatchObject({ isDefault: true, meetingMinutesPerMonth: 45 });
  });

  it('refuse un quota négatif, décimal ou hors borne', async () => {
    // Une chaîne numérique (« 60 ») est convertie par Fastify avant le
    // schéma : ce n'est pas un refus, c'est 60.
    const { app } = buildTestApp({ seed: seed() });
    for (const value of [-1, 12.5, 100001, 'soixante']) {
      const res = await asAdmin(app, '/api/admin/groups/update', {
        id: SALES,
        meetingMinutesPerMonth: value,
      });
      expect(res.statusCode, String(value)).toBe(400);
      expect(res.json().error).toBe('invalid_body');
    }
  });
});
