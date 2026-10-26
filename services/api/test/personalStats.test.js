/**
 * « Mes statistiques » : l'usage d'un compte et son crédit de temps du mois
 * (lib/personalStats.js, routes/stats.js), le crédit de chaque compte pour
 * l'administration (lib/teamCredits.js, routes/admin/stats.js), et le crédit
 * jour par jour qu'ils partagent (lib/quota.js).
 *
 * Ce qui se vérifie ici : la somme des jours vaut toujours le consommé du
 * compteur ; le jour d'une réunion se lit à l'heure de Paris ; l'alerte de
 * rythme ne part qu'au-delà de 15 points d'avance ; la page ne montre que les
 * réunions du compte, et jamais leur contenu ; l'équipe se trie par urgence.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, groupDoc, defaultGroupDoc } from './helpers.js';
import {
  buildQuotaStatus,
  creditPace,
  currentPeriod,
  dailyUsage,
  exhaustedDay,
  sumDurations,
  DELETED_USAGE_COLLECTION,
} from '../lib/quota.js';

const USER = 'camille@client.fr';
const ADMIN = 'patron@client.fr';
const PROD = 'g-prod';
const SMALL = 'g-small';
// Lundi 12 octobre 2026, midi à Paris.
const NOW = new Date('2026-10-12T10:00:00.000Z');
const OCTOBER = currentPeriod(NOW);

let seq = 0;
/** Une réunion du compte : date de début, minutes, et ce qu'on veut en plus. */
const meeting = (email, date, minutes, extra = {}) => ({
  meetingId: `m-${(seq += 1)}`,
  email,
  emailLower: email.toLowerCase(),
  lastConnecion: date,
  now: date,
  meetingDuration: minutes * 60,
  template: 'standard',
  versions: [{ generatedAt: date }],
  ...extra,
});

/** Le mois de Camille : 340 min dans l'historique, 12 min d'une réunion supprimée. */
const camilleMeetings = () => [
  meeting(USER, '2026-10-01T08:00:00.000Z', 28),
  meeting(USER, '2026-10-02T08:00:00.000Z', 47, { template: 'atelier' }),
  meeting(USER, '2026-10-05T08:00:00.000Z', 31),
  // 22 h 30 UTC le 5 = 0 h 30 le 6 à Paris : c'est le 6 qu'elle compte.
  meeting(USER, '2026-10-05T22:30:00.000Z', 78, {
    template: 'comite',
    versions: [
      { generatedAt: '2026-10-06T08:00:00.000Z' },
      { generatedAt: '2026-10-07T08:00:00Z' },
    ],
    // Le contenu ne doit jamais sortir de la route.
    title: 'Comité secret',
    transcription: 'Ce qui a été dit en comité',
  }),
  meeting(USER, '2026-10-07T08:00:00.000Z', 22),
  meeting(USER, '2026-10-08T08:00:00.000Z', 19),
  meeting(USER, '2026-10-08T13:00:00.000Z', 54),
  meeting(USER, '2026-10-12T06:00:00.000Z', 26),
  // Jamais résumée : aucun compte rendu.
  meeting(USER, '2026-10-12T08:00:00.000Z', 35, { versions: [] }),
  // Le mois dernier : hors du crédit, dans « 3 mois ».
  meeting(USER, '2026-09-20T08:00:00.000Z', 60),
];

const deletedTrace = (email, date, minutes) => ({
  meetingId: `del-${(seq += 1)}`,
  email,
  emailLower: email.toLowerCase(),
  lastConnecion: date,
  meetingDuration: minutes * 60,
  expiresAt: new Date(OCTOBER.end),
});

const baseSeed = () => ({
  user: [userDoc(USER, { groupIds: [PROD] }), userDoc(ADMIN, { role: 'admin' })],
  userGroups: [
    defaultGroupDoc(),
    groupDoc(PROD, { name: 'Équipe produit', meetingMinutesPerMonth: 600 }),
    groupDoc(SMALL, { meetingMinutesPerMonth: 60 }),
  ],
  resume: [...camilleMeetings(), meeting(ADMIN, '2026-10-03T08:00:00.000Z', 90)],
  [DELETED_USAGE_COLLECTION]: [deletedTrace(USER, '2026-10-09T08:00:00.000Z', 12)],
  templates: [{ value: 'comite', labels: { fr: 'Comité de pilotage', en: 'Steering committee' } }],
  userTemplates: [
    { email: USER, emailLower: USER, value: 'atelier', labels: { fr: 'Atelier', en: 'Workshop' } },
  ],
});

/** Les routes lisent l'horloge : seule la date est simulée. */
async function at(now, fn) {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(now);
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}

const getAs = (app, url, email = USER) =>
  app.inject({ method: 'GET', url, headers: identityHeaders(email) });
const accountAs = (app, body, email = ADMIN) =>
  app.inject({
    method: 'POST',
    url: '/api/admin/stats/account',
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('lib/quota — le crédit au fil du mois', () => {
  it('rend tous les jours du mois, et leur somme vaut le consommé du compteur', () => {
    const docs = [...camilleMeetings(), deletedTrace(USER, '2026-10-09T08:00:00.000Z', 12)];
    const inOctober = docs.filter((d) => d.lastConnecion >= OCTOBER.start);
    const days = dailyUsage(inOctober, OCTOBER);
    expect(days).toHaveLength(31);
    expect(days[0]).toEqual({ date: '2026-10-01', usedSeconds: 28 * 60 });
    expect(days.find((d) => d.date === '2026-10-03').usedSeconds).toBe(0);
    // À l'heure de Paris : la réunion de 22 h 30 UTC le 5 tombe le 6.
    expect(days.find((d) => d.date === '2026-10-05').usedSeconds).toBe(31 * 60);
    expect(days.find((d) => d.date === '2026-10-06').usedSeconds).toBe(78 * 60);
    const total = days.reduce((sum, d) => sum + d.usedSeconds, 0);
    expect(total).toBe(sumDurations(inOctober));
    expect(total).toBe(352 * 60);
  });

  it('une réunion présente deux fois (trace et document) compte une fois, au jour de sa plus longue durée', () => {
    const doc = meeting(USER, '2026-10-02T08:00:00.000Z', 30);
    const trace = {
      ...deletedTrace(USER, '2026-10-02T08:00:00.000Z', 45),
      meetingId: doc.meetingId,
    };
    const days = dailyUsage([doc, trace], OCTOBER);
    expect(days.reduce((sum, d) => sum + d.usedSeconds, 0)).toBe(45 * 60);
  });

  it('le jour où le crédit s épuise : moins d une minute pleine restante', () => {
    const days = [
      { date: '2026-10-01', usedSeconds: 40 * 60 },
      // 59 min : il reste une minute pleine, le crédit tient encore.
      { date: '2026-10-02', usedSeconds: 19 * 60 },
      { date: '2026-10-03', usedSeconds: 30 },
    ];
    expect(exhaustedDay(days, 60)).toBe('2026-10-03');
    expect(exhaustedDay(days, 120)).toBeNull();
  });

  it('annonce l épuisement au-delà de 15 points d avance sur le rythme régulier, pas en deçà', () => {
    const status = (usedMinutes) =>
      buildQuotaStatus({
        minutes: 600,
        group: null,
        usedSeconds: usedMinutes * 60,
        period: OCTOBER,
      });
    // 37 % du mois écoulé (11,5 jours sur 31 et une heure).
    const ahead = creditPace(status(352), NOW);
    expect(ahead.elapsedRatio).toBeCloseTo(276 / 745, 5);
    expect(ahead.alert).toBe(true);
    expect(ahead.exhaustsAt.slice(0, 10)).toBe('2026-10-20');
    expect(ahead.expectedRemainingSeconds).toBe(Math.round(600 * 60 * (1 - 276 / 745)));
    // 10 points d'avance : la date se calcule, mais l'écran ne l'annonce pas.
    const close = creditPace(status(Math.round(600 * (276 / 745 + 0.1))), NOW);
    expect(close.exhaustsAt).not.toBeNull();
    expect(close.alert).toBe(false);
    // En retard sur le rythme : rien ne s'épuisera avant le 1er.
    expect(creditPace(status(60), NOW)).toMatchObject({ exhaustsAt: null, alert: false });
  });

  it('ni rythme sans limite, ni prévision une fois le crédit épuisé', () => {
    const unlimited = buildQuotaStatus({
      minutes: null,
      group: null,
      usedSeconds: 0,
      period: OCTOBER,
    });
    expect(creditPace(unlimited, NOW)).toBeNull();
    const spent = buildQuotaStatus({
      minutes: 60,
      group: null,
      usedSeconds: 3600,
      period: OCTOBER,
    });
    expect(creditPace(spent, NOW)).toMatchObject({ exhaustsAt: null, alert: false });
  });
});

describe('GET /api/stats/me', () => {
  it('le mois du crédit : usage, comptes rendus, modèles nommés et crédit jour par jour', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const res = await at(NOW, () => getAs(app, '/api/stats/me'));
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.range).toBe('month');
    expect(stats.from).toBe(OCTOBER.start);
    expect(stats.granularity).toBe('day');
    // Neuf réunions d'octobre dans l'historique ; celle de l'administrateur n'y est pas.
    expect(stats.totals).toMatchObject({
      meetings: 9,
      durationSeconds: 340 * 60,
      longestDurationSeconds: 78 * 60,
      summaries: 9,
      regenerated: 1,
    });
    const labels = Object.fromEntries(stats.templates.map((t) => [t.template, t.labels]));
    expect(labels.comite).toEqual({ fr: 'Comité de pilotage', en: 'Steering committee' });
    expect(labels.atelier).toEqual({ fr: 'Atelier', en: 'Workshop' });
    expect(labels.standard).toBeNull();

    expect(stats.credit).toMatchObject({
      unlimited: false,
      limitMinutes: 600,
      usedSeconds: 352 * 60,
      monthSeconds: 352 * 60,
      remainingMinutes: 248,
      // La réunion supprimée explique l'écart entre 5 h 40 et 5 h 52.
      deletedSeconds: 12 * 60,
      exhausted: false,
      exhaustedOn: null,
      group: { id: PROD, name: 'Équipe produit' },
      pace: { alert: true },
    });
    expect(stats.credit.days).toHaveLength(31);
    expect(stats.credit.pace.exhaustsAt.slice(0, 10)).toBe('2026-10-20');
  });

  it('ne laisse sortir aucun contenu de réunion', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const body = (await at(NOW, () => getAs(app, '/api/stats/me'))).body;
    expect(body).not.toContain('Comité secret');
    expect(body).not.toContain('dit en comité');
  });

  it('trois mois : la fenêtre glissante, le crédit reste celui du mois', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const stats = (await at(NOW, () => getAs(app, '/api/stats/me?range=90'))).json();
    expect(stats.range).toBe('90');
    expect(stats.granularity).toBe('week');
    expect(stats.totals.meetings).toBe(10);
    expect(stats.credit.usedSeconds).toBe(352 * 60);
  });

  it('un compte sans limite : pas de rythme, mais le temps du mois mesuré', async () => {
    const seed = baseSeed();
    seed.user[0] = userDoc(USER);
    const { app } = buildTestApp({ seed });
    const { credit } = (await at(NOW, () => getAs(app, '/api/stats/me'))).json();
    expect(credit).toMatchObject({ unlimited: true, pace: null, monthSeconds: 352 * 60 });
  });

  it('exige une identité et refuse une période inconnue', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    expect((await app.inject({ method: 'GET', url: '/api/stats/me' })).statusCode).toBe(401);
    expect((await getAs(app, '/api/stats/me?range=7')).statusCode).toBe(400);
  });
});

describe('GET /api/admin/stats/credits', () => {
  const teamSeed = () => {
    const seed = baseSeed();
    seed.user.push(
      userDoc('epuise@client.fr', { groupIds: [SMALL] }),
      userDoc('rapide@client.fr', { groupIds: [PROD] }),
      userDoc('calme@client.fr', { groupIds: [PROD] }),
      userDoc('libre@client.fr'),
      userDoc('parti@client.fr', { groupIds: [SMALL], disabled: true }),
    );
    seed.resume.push(
      meeting('epuise@client.fr', '2026-10-03T08:00:00.000Z', 40),
      meeting('epuise@client.fr', '2026-10-09T08:00:00.000Z', 25),
      meeting('rapide@client.fr', '2026-10-10T08:00:00.000Z', 500),
      meeting('calme@client.fr', '2026-10-06T08:00:00.000Z', 60),
      meeting('calme@client.fr', '2026-08-02T08:00:00.000Z', 30),
      meeting('libre@client.fr', '2026-10-07T08:00:00.000Z', 120),
    );
    return seed;
  };

  it('chaque compte actif, dans l ordre d urgence, avec le résumé de l équipe', async () => {
    const { app } = buildTestApp({ seed: teamSeed() });
    const res = await at(NOW, () => getAs(app, '/api/admin/stats/credits', ADMIN));
    expect(res.statusCode).toBe(200);
    const team = res.json();
    expect(team.accounts.map((a) => a.email)).toEqual([
      'epuise@client.fr', // épuisé
      'rapide@client.fr', // épuisé vers le 14
      USER, // épuisé vers le 20
      'calme@client.fr', // dans le rythme
      'libre@client.fr', // sans limite, 2 h
      ADMIN, // sans limite, 1 h 30
    ]);
    expect(team.summary).toEqual({ accounts: 6, limited: 4, exhausted: 1, atRisk: 2 });
    const byEmail = Object.fromEntries(team.accounts.map((a) => [a.email, a]));
    expect(byEmail['epuise@client.fr']).toMatchObject({
      exhausted: true,
      exhaustedOn: '2026-10-09',
    });
    // La réunion supprimée compte aussi pour l'administrateur.
    expect(byEmail[USER]).toMatchObject({
      usedSeconds: 352 * 60,
      meetings: 9,
      remainingMinutes: 248,
    });
    expect(byEmail['libre@client.fr']).toMatchObject({ unlimited: true, usedSeconds: 120 * 60 });
    expect(byEmail['calme@client.fr'].lastMeetingAt).toBe('2026-10-06T08:00:00.000Z');
    expect(team.groups.map((g) => g.id)).toContain(PROD);
  });

  it('est réservée aux administrateurs', async () => {
    const { app } = buildTestApp({ seed: teamSeed() });
    expect((await getAs(app, '/api/admin/stats/credits')).statusCode).toBe(403);
  });
});

describe('POST /api/admin/stats/account', () => {
  it('la page d un collègue, telle qu il la voit', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const [mine, seen] = await at(NOW, async () => [
      (await getAs(app, '/api/stats/me')).json(),
      (await accountAs(app, { email: USER })).json(),
    ]);
    expect(seen.account).toEqual({ email: USER, name: 'camille' });
    expect(seen.totals).toEqual(mine.totals);
    expect(seen.credit).toEqual(mine.credit);
    expect(JSON.stringify(seen)).not.toContain('Comité secret');
  });

  it('404 pour un compte inconnu, 403 pour un non-administrateur', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    expect((await accountAs(app, { email: 'inconnu@client.fr' })).statusCode).toBe(404);
    expect((await accountAs(app, { email: ADMIN }, USER)).statusCode).toBe(403);
  });
});
