import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildTestApp, defaultGroupDoc, groupDoc, identityHeaders, userDoc } from './helpers.js';
import { computeUsageStats, statsWindow, templateCounts } from '../lib/stats.js';

const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';
const NOW = new Date('2026-08-18T10:00:00.000Z');

/** Réunion projetée telle que la route la lit (voir MEETING_FIELDS). */
function meeting({ email = USER, daysAgo = 1, duration = 1800, template = 'standard', ...rest }) {
  const date = new Date(NOW.getTime() - daysAgo * 86400000);
  return {
    email,
    emailLower: email.toLowerCase(),
    name: 'Simple',
    lastConnecion: date.toISOString(),
    now: date.toISOString(),
    meetingDuration: duration,
    transcriptionChars: 4200,
    template,
    ...rest,
  };
}

describe('lib/stats — computeUsageStats', () => {
  it('exclut des moyennes les réunions sans durée, et le dit dans coverage', async () => {
    const stats = computeUsageStats({
      now: NOW,
      days: 30,
      users: [userDoc(USER)],
      meetings: [
        meeting({ daysAgo: 1, duration: 600 }),
        meeting({ daysAgo: 2, duration: 1800 }),
        // Réunion antérieure à la persistance de la durée : elle compte comme
        // réunion, mais une moyenne à 800 s au lieu de 1200 s serait un mensonge.
        meeting({ daysAgo: 3, duration: null }),
      ],
    });
    expect(stats.totals.meetingsInRange).toBe(3);
    expect(stats.coverage.withDuration).toBe(2);
    expect(stats.totals.avgDurationSeconds).toBe(1200);
    expect(stats.totals.durationSeconds).toBe(2400);
    expect(stats.totals.longestDurationSeconds).toBe(1800);
  });

  it('rend les compartiments VIDES de la période, en ordre chronologique', () => {
    const stats = computeUsageStats({
      now: NOW,
      days: 7,
      users: [],
      meetings: [meeting({ daysAgo: 0 }), meeting({ daysAgo: 6 })],
    });
    expect(stats.range.granularity).toBe('day');
    expect(stats.series).toHaveLength(8); // 7 jours pleins + le jour courant
    expect(stats.series.map((p) => p.key)).toEqual([...stats.series.map((p) => p.key)].sort());
    // Les jours creux valent 0 : sans eux, deux réunions espacées d'une semaine
    // dessineraient la même courbe que deux réunions consécutives.
    expect(stats.series.filter((p) => p.meetings === 0).length).toBe(6);
  });

  it('bascule au mois au-delà de six mois', () => {
    const stats = computeUsageStats({ now: NOW, days: 365, users: [], meetings: [] });
    expect(stats.range.granularity).toBe('month');
    expect(stats.series).toHaveLength(13);
  });

  it('classe les comptes par réunions de la période, comptes désactivés inactifs exclus', () => {
    const stats = computeUsageStats({
      now: NOW,
      days: 30,
      users: [
        userDoc(USER),
        userDoc('dormeur@client.fr'),
        userDoc('parti@client.fr', { disabled: true }),
      ],
      meetings: [
        meeting({ daysAgo: 1 }),
        meeting({ daysAgo: 2 }),
        // Réunion ancienne : hors période, mais elle date la dernière activité.
        meeting({ email: 'dormeur@client.fr', daysAgo: 200 }),
        meeting({ email: 'parti@client.fr', daysAgo: 300 }),
      ],
    });
    expect(stats.totals.activeUsers).toBe(1);
    // Le compte DÉSACTIVÉ n'y figure pas : il est fermé, pas inactif.
    expect(stats.accounts.map((u) => u.email)).toEqual([USER, 'dormeur@client.fr']);
    expect(stats.accounts[0]).toMatchObject({ meetings: 2, durationSeconds: 3600 });
    expect(stats.accounts[1]).toMatchObject({ meetings: 0, meetingsTotal: 1, status: 'dormant' });
    expect(stats.accounts[1].lastMeetingAt).not.toBeNull();
    expect(stats.totals).toMatchObject({ enabledUsers: 2, activeAccounts: 1 });
  });

  it('garde au tableau un compte désactivé qui a enregistré, hors de l’adoption', () => {
    // Ses réunions sont dans les totaux : le tableau doit pouvoir les attribuer.
    const stats = computeUsageStats({
      now: NOW,
      days: 30,
      users: [userDoc(USER), userDoc('parti@client.fr', { disabled: true })],
      meetings: [meeting({ daysAgo: 1 }), meeting({ email: 'parti@client.fr', daysAgo: 3 })],
    });
    expect(stats.accounts.find((u) => u.email === 'parti@client.fr')).toMatchObject({
      disabled: true,
      meetings: 1,
    });
    expect(stats.totals.enabledUsers).toBe(1);
    expect(Object.values(stats.adoption).reduce((sum, n) => sum + n, 0)).toBe(1);
  });

  it('dit qui est régulier : une semaine sur deux, comptée depuis la création du compte', () => {
    // 30 jours avant le mardi 18 août : six semaines ISO touchées.
    const created = new Date(NOW.getTime() - 5 * 86400000).toISOString();
    const stats = computeUsageStats({
      now: NOW,
      days: 30,
      users: [
        userDoc('assidu@client.fr'),
        userDoc('nouveau@client.fr', { createdAt: created }),
        userDoc('rare@client.fr'),
        userDoc('jamais@client.fr'),
      ],
      meetings: [
        meeting({ email: 'assidu@client.fr', daysAgo: 1 }),
        meeting({ email: 'assidu@client.fr', daysAgo: 8 }),
        meeting({ email: 'assidu@client.fr', daysAgo: 15 }),
        // Ouvert il y a cinq jours : deux semaines à tenir, pas six.
        meeting({ email: 'nouveau@client.fr', daysAgo: 1 }),
        meeting({ email: 'rare@client.fr', daysAgo: 1 }),
      ],
    });
    const by = Object.fromEntries(stats.accounts.map((u) => [u.email, u]));
    expect(by['assidu@client.fr']).toMatchObject({ status: 'regular', activeWeeks: 3, weeks: 6 });
    expect(by['nouveau@client.fr']).toMatchObject({ status: 'regular', activeWeeks: 1, weeks: 2 });
    expect(by['rare@client.fr']).toMatchObject({ status: 'occasional', activeWeeks: 1, weeks: 6 });
    expect(by['jamais@client.fr']).toMatchObject({ status: 'never', lastMeetingAt: null });
    expect(stats.adoption).toEqual({ regular: 2, occasional: 1, dormant: 0, never: 1 });
    expect(stats.totals.newUsers).toBe(1);
  });

  it('sur une période passée, juge les comptes tels qu’ils étaient à sa fin', () => {
    const stats = computeUsageStats({
      now: NOW,
      days: 31,
      since: new Date('2026-07-01T00:00:00.000Z'),
      until: new Date('2026-07-31T23:59:59.999Z'),
      users: [
        userDoc('tardif@client.fr', { createdAt: '2026-06-01T00:00:00.000Z' }),
        // Créé après la période : il n'existait pas encore.
        userDoc('recrue@client.fr', { createdAt: '2026-08-05T00:00:00.000Z' }),
      ],
      // Première réunion le 10 août : en juillet, il n'avait jamais démarré.
      meetings: [meeting({ email: 'tardif@client.fr', daysAgo: 8 })],
    });
    expect(stats.range.to).toBe('2026-07-31T23:59:59.999Z');
    expect(stats.accounts.map((u) => u.email)).toEqual(['tardif@client.fr']);
    expect(stats.accounts[0]).toMatchObject({ status: 'never', meetingsTotal: 1 });
    expect(stats.totals.enabledUsers).toBe(1);
  });

  it('regroupe par casse d’email : emailLower et email désignent le même compte', () => {
    const stats = computeUsageStats({
      now: NOW,
      days: 30,
      users: [userDoc('Alex@Client.fr')],
      // Document ancien, non backfillé : il n'a que `email`, en casse d'origine.
      meetings: [
        { email: 'Alex@Client.fr', lastConnecion: NOW.toISOString(), meetingDuration: 60 },
        meeting({ email: 'alex@client.fr', daysAgo: 1, duration: 60 }),
      ],
    });
    expect(stats.totals.activeUsers).toBe(1);
    expect(stats.accounts).toHaveLength(1);
    expect(stats.accounts[0].meetings).toBe(2);
  });

  it('compare à la période précédente de même longueur, sauf « depuis toujours »', () => {
    const meetings = [
      meeting({ daysAgo: 1 }),
      meeting({ daysAgo: 2 }),
      meeting({ daysAgo: 8, duration: 600 }),
      meeting({ daysAgo: 9, duration: 600 }),
      meeting({ daysAgo: 10, duration: null }),
    ];
    const week = computeUsageStats({ now: NOW, days: 7, users: [userDoc(USER)], meetings });
    expect(week.previous).toMatchObject({
      meetings: 3,
      durationSeconds: 1200,
      avgDurationSeconds: 600,
      activeUsers: 1,
      activeAccounts: 1,
      enabledUsers: 1,
    });
    expect(week.accounts[0].previousMeetings).toBe(3);
    const all = computeUsageStats({ now: NOW, days: 0, users: [userDoc(USER)], meetings });
    expect(all.previous).toBeNull();
    expect(all.accounts[0].previousMeetings).toBeNull();
  });

  it('compte les réunions qui aboutissent à un compte rendu et à une infographie', () => {
    const stats = computeUsageStats({
      now: NOW,
      days: 30,
      users: [userDoc(USER)],
      meetings: [
        // Document d'avant les versions : il porte un compte rendu.
        meeting({ daysAgo: 1 }),
        meeting({ daysAgo: 2, versions: [{ generatedAt: NOW.toISOString() }] }),
        // Réunion arrêtée sans compte rendu.
        meeting({ daysAgo: 3, versions: [] }),
        meeting({ daysAgo: 4, versions: [{}], infographic: { status: 'ready' } }),
        meeting({ daysAgo: 5, versions: [], infographic: { status: 'error' } }),
      ],
    });
    expect(stats.totals).toMatchObject({ withSummary: 3, withInfographic: 1 });
    expect(stats.accounts[0].summaries).toBe(3);
  });

  describe('périmètre', () => {
    const groups = [defaultGroupDoc(), groupDoc('ventes', { name: 'Ventes', color: 'teal' })];
    const users = [
      userDoc('vendeur@client.fr', { groupIds: ['ventes'] }),
      userDoc('autre@client.fr'),
    ];
    const meetings = [
      meeting({ email: 'vendeur@client.fr', daysAgo: 1, template: 'decision' }),
      meeting({ email: 'vendeur@client.fr', daysAgo: 2 }),
      meeting({ email: 'autre@client.fr', daysAgo: 3, template: 'decision' }),
      // Compte supprimé depuis : ses réunions n'ont plus de propriétaire.
      meeting({ email: 'ancien@client.fr', daysAgo: 4 }),
    ];
    const run = (scope) =>
      computeUsageStats({ now: NOW, days: 30, users, groups, meetings, scope });

    it('sans filtre : toutes les réunions, les groupes de chaque compte', () => {
      const stats = run({});
      expect(stats.totals.meetingsInRange).toBe(4);
      expect(stats.accounts.map((u) => u.email)).toEqual(['vendeur@client.fr', 'autre@client.fr']);
      expect(stats.accounts[0].groups).toEqual([{ id: 'ventes', name: 'Ventes', color: 'teal' }]);
      // Sans groupe désigné : le groupe par défaut, comme le veut l'invariant.
      expect(stats.accounts[1].groups.map((g) => g.id)).toEqual(['default']);
    });

    it('un groupe : ses comptes et leurs réunions, rien d’autre', () => {
      const stats = run({ group: 'ventes' });
      expect(stats.totals.meetingsInRange).toBe(2);
      expect(stats.totals.meetings).toBe(2);
      expect(stats.accounts.map((u) => u.email)).toEqual(['vendeur@client.fr']);
      expect(stats.totals).toMatchObject({ users: 1, enabledUsers: 1 });
    });

    it('un compte, sans égard à la casse', () => {
      const stats = run({ user: 'Autre@Client.fr' });
      expect(stats.totals.meetingsInRange).toBe(1);
      expect(stats.accounts.map((u) => u.email)).toEqual(['autre@client.fr']);
    });

    it('un template : ses réunions, tous les comptes', () => {
      const stats = run({ template: 'decision' });
      expect(stats.totals.meetingsInRange).toBe(2);
      expect(stats.templates).toEqual([{ template: 'decision', meetings: 2 }]);
      expect(stats.accounts.map((u) => u.meetings)).toEqual([1, 1]);
    });

    it('un groupe inconnu : une population vide, pas une erreur', () => {
      const stats = run({ group: 'supprime' });
      expect(stats.totals.meetingsInRange).toBe(0);
      expect(stats.accounts).toEqual([]);
    });

    it('les options du filtre de template ne dépendent d’aucun filtre', () => {
      // À égalité, l'ordre alphabétique : la liste ne saute pas d'un appel à l'autre.
      expect(templateCounts(meetings)).toEqual([
        { template: 'decision', meetings: 2 },
        { template: 'standard', meetings: 2 },
      ]);
    });
  });

  it('tranche les durées et compte les jours de la semaine', () => {
    const stats = computeUsageStats({
      now: NOW,
      days: 30,
      users: [],
      meetings: [
        meeting({ daysAgo: 1, duration: 300 }),
        meeting({ daysAgo: 2, duration: 1500 }),
        meeting({ daysAgo: 3, duration: 5400 }),
        meeting({ daysAgo: 4, duration: 9000 }),
      ],
    });
    expect(stats.durationBuckets).toEqual([
      { id: 'lt15', count: 1 },
      { id: 'lt30', count: 1 },
      { id: 'lt60', count: 0 },
      { id: 'lt120', count: 1 },
      { id: 'gte120', count: 1 },
    ]);
    expect(stats.weekdays.reduce((sum, d) => sum + d.meetings, 0)).toBe(4);
  });

  it('survit à une date illisible sans perdre le document des totaux', () => {
    const stats = computeUsageStats({
      now: NOW,
      days: 30,
      users: [],
      meetings: [meeting({ daysAgo: 1 }), { email: USER, lastConnecion: 'pas-une-date' }],
    });
    expect(stats.totals.meetings).toBe(2);
    expect(stats.totals.meetingsInRange).toBe(1);
  });
});

describe('lib/stats — statsWindow', () => {
  it('rend la période glissante demandée, 30 jours par défaut', () => {
    expect(statsWindow({}, NOW)).toEqual({ days: 30, since: null, until: null });
    expect(statsWindow({ days: 7 }, NOW)).toEqual({ days: 7, since: null, until: null });
    expect(statsWindow({ days: 0 }, NOW).days).toBe(0);
  });

  it('lit une période choisie en jours entiers, heure de Paris, bornes comprises', () => {
    const window = statsWindow({ from: '2026-07-01', to: '2026-07-31' }, NOW);
    // Minuit à Paris l'été : 22 h UTC la veille.
    expect(window.since.toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(window.until.toISOString()).toBe('2026-07-31T21:59:59.999Z');
    expect(window.days).toBe(31);
  });

  it('accepte une fin dans le futur : la période s’arrête à maintenant', () => {
    const window = statsWindow({ from: '2026-08-01', to: '2026-12-31' }, NOW);
    expect(window.days).toBe(18);
  });

  it('refuse une période incomplète, inversée, future ou un jour qui n’existe pas', () => {
    expect(statsWindow({ from: '2026-07-01' }, NOW)).toEqual({ error: 'range_invalid' });
    expect(statsWindow({ from: '2026-07-31', to: '2026-07-01' }, NOW).error).toBe('range_invalid');
    expect(statsWindow({ from: '2026-09-01', to: '2026-09-30' }, NOW).error).toBe('range_invalid');
    expect(statsWindow({ from: '2026-02-01', to: '2026-02-31' }, NOW).error).toBe('range_invalid');
  });
});

describe('GET /api/admin/stats', () => {
  // La route calcule sa période sur l'horloge réelle, alors que les réunions
  // semées sont datées par rapport à NOW : sans horloge figée, ce test cassait
  // dès que NOW sortait des 30 derniers jours (le 15/09/2026), et avec lui tout
  // déploiement. Seul `Date` est simulé : Fastify garde ses vrais minuteurs.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const seed = () => ({
    user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER)],
    resume: [meeting({ daysAgo: 1 }), meeting({ daysAgo: 2, duration: 3600 })],
  });

  it('refuse un compte non administrateur', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: identityHeaders(USER),
    });
    expect(res.statusCode).toBe(403);
  });

  it('répond les agrégats à un administrateur', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats?days=30',
      headers: identityHeaders(ADMIN),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals.meetingsInRange).toBe(2);
    expect(body.totals.avgDurationSeconds).toBe(2700);
    expect(body.range.days).toBe(30);
    expect(body.accounts[0].email).toBe(USER);
    expect(body.filters.applied).toMatchObject({ days: 30, from: null, group: '', user: '' });
  });

  it('applique les filtres à toute la réponse, dépenses comprises', async () => {
    const { app } = buildTestApp({
      seed: {
        user: [
          userDoc(ADMIN, { role: 'admin' }),
          userDoc(USER, { groupIds: ['ventes'] }),
          userDoc('autre@client.fr'),
        ],
        userGroups: [defaultGroupDoc(), groupDoc('ventes', { name: 'Ventes', color: 'teal' })],
        resume: [
          meeting({ daysAgo: 1 }),
          meeting({ daysAgo: 2 }),
          meeting({ email: 'autre@client.fr', daysAgo: 3, template: 'decision' }),
        ],
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats?days=30&group=ventes',
      headers: identityHeaders(ADMIN),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totals.meetingsInRange).toBe(2);
    expect(body.accounts.map((u) => u.email)).toEqual([USER]);
    expect(body.costs.usage.meetings).toBe(2);
    // Les options, elles, ne dépendent d'aucun filtre.
    expect(body.filters.options.groups.map((g) => g.id)).toEqual(['default', 'ventes']);
    expect(body.filters.options.templates.map((t) => t.template)).toEqual(['standard', 'decision']);
    expect(body.filters.options.users.map((u) => u.email)).toContain('autre@client.fr');
  });

  it('nomme les templates comme l’organisation les a nommés', async () => {
    const { app } = buildTestApp({
      seed: {
        ...seed(),
        templates: [
          {
            value: 'standard',
            labels: { fr: 'Standard maison', en: 'House standard' },
            prompt: 'secret',
          },
        ],
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: identityHeaders(ADMIN),
    });
    const body = res.json();
    expect(body.templates[0]).toMatchObject({
      template: 'standard',
      labels: { fr: 'Standard maison', en: 'House standard' },
    });
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('accepte une période choisie, et refuse un jour qui n’existe pas', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const ok = await app.inject({
      method: 'GET',
      url: '/api/admin/stats?from=2026-08-01&to=2026-08-31',
      headers: identityHeaders(ADMIN),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().range.from).toBe('2026-07-31T22:00:00.000Z');
    expect(ok.json().filters.applied).toMatchObject({ days: null, from: '2026-08-01' });
    const bad = await app.inject({
      method: 'GET',
      url: '/api/admin/stats?from=2026-02-01&to=2026-02-31',
      headers: identityHeaders(ADMIN),
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('range_invalid');
  });

  it('ne lit AUCUN contenu de réunion : la projection exclut transcription et versions', async () => {
    // Un administrateur voit des volumes, jamais le texte des réunions de ses
    // collègues — la garantie tient à cette projection, pas à la vue.
    const { app, db } = buildTestApp({ seed: seed() });
    await app.inject({ method: 'GET', url: '/api/admin/stats', headers: identityHeaders(ADMIN) });
    const scan = db.calls.find((c) => c.op === 'find' && c.collection === 'resume');
    expect(scan.project.transcription).toBeUndefined();
    expect(scan.project.versions).toBeUndefined();
    expect(scan.project.resume).toBeUndefined();
    expect(scan.project.transcriptionChars).toBe(1);
  });

  it('refuse une période hors de la liste', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats?days=13',
      headers: identityHeaders(ADMIN),
    });
    expect(res.statusCode).toBe(400);
  });
});
