/**
 * Diagnostic de configuration (lib/configChecks.js, routes /config-checks).
 *
 * Garanties tenues ici :
 *   - chaque constat nomme la SECTION où il se corrige, et le niveau qui dit
 *     s'il s'agit d'une panne, d'un réglage inopérant ou d'un conseil ;
 *   - une clé, une connexion, un dossier sont ÉPROUVÉS, pas seulement lus — et
 *     une panne passagère ne donne jamais de constat ;
 *   - un verdict est mémorisé, mais une clé remplacée ou un dossier rechoisi
 *     repart à neuf ;
 *   - le périmètre d'organisation est réservé aux administrateurs, celui du
 *     compte ne lit que les réglages et les tags du demandeur ;
 *   - un compte qui n'a rien réglé ne reçoit aucune alerte de dépôt.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { CATALOG_CHECKED_AT } from '../lib/costs/catalog.js';
import {
  buildTestApp,
  identityHeaders,
  userDoc,
  createFakeKeyVerifier,
  createFakeMailer,
  createFakeMyBrain,
  createFakeDriveBrowser,
} from './helpers.js';
import { MyBrainError } from '../lib/myBrain/client.js';
import { ConnectionAuthError } from '../lib/connections/errors.js';
import { organizationChecks, accountChecks, createVerdictCache } from '../lib/configChecks.js';

const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';
const OTHER = 'autre@client.fr';
const OPENAI_KEY = 'sk-proj-une-cle-de-test-assez-longue';
const MYBRAIN_KEY = `mbk_AbCd${'x'.repeat(32)}wxyz`;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_AUTH = {
  key: 'auth',
  google: { enabled: true, clientId: 'id', clientSecret: 'secret' },
};

/** Configuration sans clé d'environnement : seule la base décide. */
const NO_ENV_KEY = { openai: { apiKey: '', models: {} } };

const get = (app, url, email = ADMIN) =>
  app.inject({ method: 'GET', url, headers: identityHeaders(email) });

const codes = (issues) => issues.map((i) => i.code);

/** Une installation « bien réglée » : ce qui reste doit venir du test. */
const tidySettings = (over = {}) => [
  { key: 'ai', apiKey: OPENAI_KEY },
  GOOGLE_AUTH,
  { key: 'actions', connections: { provider: 'google' } },
  { key: 'branding', logo: 'data:image/png;base64,AAAA' },
  { key: 'orgContext', context: 'Vocabulaire maison : CRM, BU, comex.' },
  ...(over.extra || []),
];

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/admin/config-checks — l'organisation", () => {
  // Horloge figée quinze jours après le relevé de tarifs intégré : sans elle,
  // chaque test gagnait le conseil « tarifs anciens » trente jours après ce
  // relevé (le 2026-10-25), et la suite cassait au calendrier, sans un
  // changement de code. Seul `Date` est simulé : les sondes gardent leurs
  // vrais minuteurs. Le test des tarifs anciens règle sa propre date.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.parse(CATALOG_CHECKED_AT) + 15 * 86400000));
  });

  it('est réservé aux administrateurs', async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER)] },
      config: NO_ENV_KEY,
    });
    expect((await get(app, '/api/admin/config-checks', USER)).statusCode).toBe(403);
    const res = await get(app, '/api/admin/config-checks');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().issues)).toBe(true);
  });

  it("une installation neuve : pas de clé, pas de fournisseur, identité jamais réglée — les pannes d'abord", async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(ADMIN, { role: 'admin' })] },
      config: NO_ENV_KEY,
    });
    const { issues } = (await get(app, '/api/admin/config-checks')).json();
    expect(issues).toEqual([
      { section: 'ai', code: 'ai_key_missing', level: 'error' },
      { section: 'actions', code: 'storage_provider_missing', level: 'warning' },
      { section: 'branding', code: 'branding_default', level: 'tip' },
      { section: 'branding', code: 'org_context_empty', level: 'tip' },
    ]);
  });

  it('une installation bien réglée ne porte aucune pastille', async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(ADMIN, { role: 'admin' })], appSettings: tidySettings() },
      config: NO_ENV_KEY,
    });
    expect((await get(app, '/api/admin/config-checks')).json().issues).toEqual([]);
  });

  it("la clé de l'environnement compte comme une clé", async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(ADMIN, { role: 'admin' })] },
      config: { openai: { apiKey: OPENAI_KEY, models: {} } },
    });
    const { issues } = (await get(app, '/api/admin/config-checks')).json();
    expect(codes(issues)).not.toContain('ai_key_missing');
  });

  it('une clé refusée par OpenAI (401) est une panne ; un 403 ne dit rien', async () => {
    const rejected = buildTestApp({
      seed: { user: [userDoc(ADMIN, { role: 'admin' })], appSettings: tidySettings() },
      config: NO_ENV_KEY,
      verifyApiKey: createFakeKeyVerifier({ reject: { status: 401 } }),
    });
    expect((await get(rejected.app, '/api/admin/config-checks')).json().issues).toEqual([
      { section: 'ai', code: 'ai_key_rejected', level: 'error' },
    ]);

    // Clé à droits restreints : /models refusé, transcription et résumé en état de marche.
    const restricted = buildTestApp({
      seed: { user: [userDoc(ADMIN, { role: 'admin' })], appSettings: tidySettings() },
      config: NO_ENV_KEY,
      verifyApiKey: createFakeKeyVerifier({ reject: { status: 403 } }),
    });
    expect((await get(restricted.app, '/api/admin/config-checks')).json().issues).toEqual([]);
  });

  it('mémorise le verdict — mais une clé remplacée est éprouvée à nouveau', async () => {
    const { app, db, verifyApiKey } = buildTestApp({
      seed: { user: [userDoc(ADMIN, { role: 'admin' })], appSettings: tidySettings() },
      config: NO_ENV_KEY,
    });
    await get(app, '/api/admin/config-checks');
    await get(app, '/api/admin/config-checks');
    expect(verifyApiKey.calls).toEqual([OPENAI_KEY]);

    const ai = db.data.get('appSettings').find((doc) => doc.key === 'ai');
    ai.apiKey = 'sk-proj-une-autre-cle-de-test';
    await get(app, '/api/admin/config-checks');
    expect(verifyApiKey.calls).toEqual([OPENAI_KEY, 'sk-proj-une-autre-cle-de-test']);
  });

  it("une sonde trop lente n'est pas attendue : pas de constat plutôt qu'un doute", async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(ADMIN, { role: 'admin' })], appSettings: tidySettings() },
      config: NO_ENV_KEY,
      verifyApiKey: () => new Promise(() => {}),
    });
    const issues = await organizationChecks(app, { cache: createVerdictCache(), budgetMs: 20 });
    expect(issues).toEqual([]);
  });

  it("« Envoyer par mail » coché sans relais SMTP ni compte reliable : le bouton n'apparaîtra chez personne", async () => {
    const withoutMail = (appSettings) =>
      buildTestApp({
        seed: { user: [userDoc(ADMIN, { role: 'admin' })], appSettings },
        config: NO_ENV_KEY,
        mailer: createFakeMailer({ enabled: false }),
      });
    const noCredentials = tidySettings().filter((doc) => doc.key !== 'auth');
    const blocked = withoutMail(noCredentials);
    const { issues } = (await get(blocked.app, '/api/admin/config-checks')).json();
    expect(issues).toContainEqual({
      section: 'actions',
      code: 'mail_unavailable',
      level: 'warning',
    });

    // Le compte relié suffit à faire partir un mail.
    const linkable = withoutMail(tidySettings());
    expect((await get(linkable.app, '/api/admin/config-checks')).json().issues).toEqual([]);
  });

  it('un fournisseur choisi sans ses identifiants OAuth : personne ne peut relier son compte', async () => {
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(ADMIN, { role: 'admin' })],
        appSettings: tidySettings().map((doc) =>
          doc.key === 'actions' ? { key: 'actions', connections: { provider: 'microsoft' } } : doc,
        ),
      },
      config: NO_ENV_KEY,
    });
    const { issues } = (await get(app, '/api/admin/config-checks')).json();
    expect(issues).toEqual([
      {
        section: 'auth',
        code: 'connect_credentials_missing',
        level: 'error',
        vars: { provider: 'Microsoft' },
      },
    ]);
  });

  it('les interrupteurs coupés ne réclament rien', async () => {
    const off = { email: false, storage: false, download: true };
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(ADMIN, { role: 'admin' })],
        appSettings: [
          ...tidySettings().filter((doc) => doc.key !== 'actions' && doc.key !== 'auth'),
          { key: 'actions', transcription: off, summary: off },
        ],
      },
      config: NO_ENV_KEY,
      mailer: createFakeMailer({ enabled: false }),
    });
    expect((await get(app, '/api/admin/config-checks')).json().issues).toEqual([]);
  });

  describe('MyBrain', () => {
    function plugged(whoami) {
      return buildTestApp({
        seed: { user: [userDoc(ADMIN, { role: 'admin' })], appSettings: tidySettings() },
        config: NO_ENV_KEY,
        myBrain: createFakeMyBrain(whoami ? { whoami } : {}),
      });
    }

    async function checksOf(built, policy = 'forced') {
      await built.app.myBrainSettings.update(
        { url: 'https://cerveau.example.test', apiKey: MYBRAIN_KEY, policy },
        { actor: ADMIN },
      );
      return (await get(built.app, '/api/admin/config-checks')).json().issues;
    }

    it('branché et joignable : rien à dire', async () => {
      expect(await checksOf(plugged())).toEqual([]);
    });

    it('une clé refusée, un droit « nourrir » retiré, un cerveau injoignable', async () => {
      const refuse = (code) => () => {
        throw new MyBrainError(code);
      };
      expect(codes(await checksOf(plugged(refuse('mybrain_key_rejected'))))).toEqual([
        'mybrain_key_rejected',
      ]);
      expect(
        codes(await checksOf(plugged(() => ({ application: 'myBrief', droits: ['lire'] })))),
      ).toEqual(['mybrain_right_missing']);
      expect(codes(await checksOf(plugged(refuse('mybrain_unreachable'))))).toEqual([
        'mybrain_unreachable',
      ]);
      // Délai dépassé : passager, pas de pastille.
      expect(await checksOf(plugged(refuse('mybrain_timeout')))).toEqual([]);
    });

    it('fermé par la politique : ni sonde, ni constat', async () => {
      const built = plugged(() => {
        throw new MyBrainError('mybrain_key_rejected');
      });
      expect(await checksOf(built, 'off')).toEqual([]);
      expect(built.myBrain.calls.filter((c) => c.method === 'whoami')).toHaveLength(0);
    });

    it('une clé qui ne se déchiffre plus est à recoller', async () => {
      const { app } = buildTestApp({
        seed: {
          user: [userDoc(ADMIN, { role: 'admin' })],
          appSettings: [
            ...tidySettings(),
            {
              key: 'myBrain',
              url: 'https://cerveau.example.test',
              apiKey: { v: 1, iv: 'x', tag: 'y', data: 'z' },
              policy: 'optin',
            },
          ],
        },
        config: NO_ENV_KEY,
      });
      expect((await get(app, '/api/admin/config-checks')).json().issues).toEqual([
        { section: 'mybrain', code: 'mybrain_key_unreadable', level: 'error' },
      ]);
    });
  });

  it('des tarifs relevés il y a plus de trente jours sont signalés, avec leur âge', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-15T12:00:00Z'));
    const { app } = buildTestApp({
      seed: { user: [userDoc(ADMIN, { role: 'admin' })], appSettings: tidySettings() },
      config: NO_ENV_KEY,
    });
    const { issues } = (await get(app, '/api/admin/config-checks')).json();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ section: 'stats', code: 'prices_stale', level: 'tip' });
    expect(issues[0].vars.days).toBeGreaterThan(30);
  });
});

describe('GET /api/config-checks — le compte', () => {
  const TAG = { id: 'tag-acme', label: 'Acme', color: 'blue', email: USER, emailLower: USER };

  function account({
    storage = {},
    tags = [TAG],
    connection = { scopes: [DRIVE_SCOPE] },
    actions = { connections: { provider: 'google' } },
    browser,
  } = {}) {
    return buildTestApp({
      seed: {
        user: [userDoc(USER), userDoc(OTHER)],
        appSettings: [GOOGLE_AUTH, { key: 'actions', ...actions }],
        userConnections: connection
          ? [
              {
                emailLower: USER,
                provider: 'google',
                account: 'perso@gmail.com',
                refreshToken: 'rt-123',
                ...connection,
              },
            ]
          : [],
        userActionSettings: [{ email: USER, emailLower: USER, storage }],
        userTags: tags,
      },
      config: NO_ENV_KEY,
      driveBrowser: browser,
    });
  }

  const checks = async (built, email = USER) =>
    (await get(built.app, '/api/config-checks', email)).json().issues;

  it("un compte qui n'a rien réglé ne reçoit aucune alerte", async () => {
    const built = account({ connection: null });
    expect(await checks(built)).toEqual([]);
  });

  it("des dossiers réglés sans compte relié : c'est dans « Connexion » que ça se corrige", async () => {
    const built = account({
      connection: null,
      storage: { tagFolders: [{ tagId: TAG.id, folder: 'Clients/Acme' }] },
    });
    expect(await checks(built)).toEqual([
      {
        section: 'mail',
        code: 'connection_missing',
        level: 'error',
        vars: { provider: 'Google' },
      },
    ]);
  });

  it('un compte relié avant le dépôt, sans le droit d’écrire sur le Drive', async () => {
    const built = account({
      connection: { scopes: ['https://www.googleapis.com/auth/gmail.send'] },
      storage: { folder: 'CR' },
    });
    expect(codes(await checks(built))).toEqual(['connection_scope_missing']);
  });

  it('un dossier de tag disparu, une bibliothèque qui ne répond plus — nommés', async () => {
    const built = account({
      storage: {
        folder: '',
        driveId: 'drive-equipe',
        driveName: 'Équipe commerciale',
        tagFolders: [{ tagId: TAG.id, folder: 'Clients/Acme' }],
      },
      browser: createFakeDriveBrowser({
        probe: { 'Clients/Acme': 'missing', 'drive-equipe': 'drive_missing' },
      }),
    });
    expect(await checks(built)).toEqual([
      {
        section: 'action-storage',
        code: 'storage_drive_missing',
        level: 'error',
        vars: { drive: 'Équipe commerciale' },
      },
      {
        section: 'tags',
        code: 'tag_folder_missing',
        level: 'warning',
        vars: { tag: 'Acme', folder: 'Clients/Acme' },
      },
    ]);
  });

  it('un accès retiré chez le fournisseur : à reconnecter, et la connexion est laissée en place', async () => {
    const built = account({
      storage: { tagSubfolders: true },
      browser: createFakeDriveBrowser({
        fail: new ConnectionAuthError('google_auth_revoked', { provider: 'google' }),
      }),
    });
    expect(await checks(built)).toEqual([
      { section: 'mail', code: 'connection_revoked', level: 'error', vars: { provider: 'Google' } },
    ]);
    expect(built.db.data.get('userConnections')).toHaveLength(1);
  });

  it("une panne du fournisseur n'est pas un constat", async () => {
    const built = account({
      storage: { folder: 'CR' },
      browser: createFakeDriveBrowser({ fail: new Error('google_drive_folder_lookup_failed_503') }),
    });
    expect(await checks(built)).toEqual([]);
  });

  it("le dossier d'un tag supprimé n'est pas sondé ; les tags d'un autre compte ne comptent pas", async () => {
    const foreign = { ...TAG, id: 'tag-autre', email: OTHER, emailLower: OTHER };
    const built = account({
      tags: [foreign],
      storage: {
        folder: 'CR',
        tagFolders: [
          { tagId: 'tag-supprime', folder: 'Anciens' },
          { tagId: 'tag-autre', folder: 'Autre' },
        ],
      },
    });
    expect(await checks(built)).toEqual([]);
    const probes = built.driveBrowser.calls.filter((c) => c.method === 'probe');
    expect(probes).toHaveLength(1);
    expect(probes[0].targets).toEqual([{ folder: 'CR', driveId: '' }]);
  });

  it('mémorise le verdict, et repart à neuf quand le dossier est rechoisi', async () => {
    const built = account({ storage: { folder: 'CR' } });
    await checks(built);
    await checks(built);
    const probes = () => built.driveBrowser.calls.filter((c) => c.method === 'probe');
    expect(probes()).toHaveLength(1);

    built.db.data.get('userActionSettings')[0].storage.folder = 'Comptes rendus';
    await checks(built);
    expect(probes()).toHaveLength(2);
  });

  it("sans fournisseur, ou dépôt fermé par l'administration : rien à sonder", async () => {
    const noProvider = account({ actions: {}, storage: { folder: 'CR' } });
    expect(await checks(noProvider)).toEqual([]);
    const closed = account({
      actions: {
        connections: { provider: 'google' },
        transcription: { storage: false },
        summary: { storage: false },
      },
      storage: { folder: 'CR' },
    });
    expect(await checks(closed)).toEqual([]);
    expect(closed.driveBrowser.calls).toHaveLength(0);
  });

  it('se calcule aussi en direct, sans la route', async () => {
    const built = account({ storage: { folder: 'CR' } });
    const issues = await accountChecks(
      built.app,
      { email: USER, emailLower: USER },
      { cache: createVerdictCache() },
    );
    expect(issues).toEqual([]);
  });
});
