/**
 * Bouton « Tester » (/api/actions/test).
 *
 * Le test le plus important de ce fichier est celui qu'on appelle
 * « anti-simulacre » : changer les réglages persistés, relancer le test, et
 * vérifier que le TRANSPORT voit la nouvelle valeur. C'est la seule preuve
 * qu'un bouton de test partage bien la chaîne de l'action réelle — un bouton qui
 * résoudrait ses paramètres à sa façon passerait tous les autres tests d'ici
 * sans rien garantir.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, createFakeMailer } from './helpers.js';
import { loadConfig } from '../lib/config.js';

const USER = 'moi@client.fr';
const ADMIN = 'patron@client.fr';
const TIERS = 'compta@partenaire.com';

const connected = () => [
  {
    emailLower: USER,
    provider: 'google',
    account: 'perso@gmail.com',
    refreshToken: 'rt',
    scopes: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/drive.file',
    ],
  },
];

const authSeed = () => [
  { key: 'auth', google: { enabled: true, clientId: 'id', clientSecret: 'secret' } },
];

function seed(extra = {}) {
  return { user: [userDoc(USER), userDoc(ADMIN, { role: 'admin' })], ...extra };
}

function runTest(app, body, email = USER) {
  return app.inject({
    method: 'POST',
    url: '/api/actions/test',
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function saveSettings(app, body, email = USER) {
  return app.inject({
    method: 'POST',
    url: '/api/actions/settings',
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/actions/test — garde-fous', () => {
  it('exige une identité', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions/test',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'email' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('refuse une cible inconnue', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await runTest(app, { target: 'sms' });
    expect(res.statusCode).toBe(400);
  });

  it("respecte l'interrupteur d'administration, comme l'action réelle", async () => {
    const { app, mailer } = buildTestApp({
      seed: seed({ appSettings: [{ key: 'actions', summary: { email: false } }] }),
    });
    const res = await runTest(app, { target: 'email' });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('action_disabled');
    expect(mailer.sent).toHaveLength(0);
  });

  it('réserve le scope « admin » aux administrateurs', async () => {
    const { app } = buildTestApp({ seed: seed() });
    expect((await runTest(app, { target: 'email', scope: 'admin' })).statusCode).toBe(403);
    expect((await runTest(app, { target: 'email', scope: 'admin' }, ADMIN)).statusCode).toBe(200);
  });

  it('plafonne le nombre de tests', async () => {
    // `configOverride` est une fusion de SURFACE : remplacer `rateLimits` en
    // entier priverait les autres routes de la leur, d'où le spread.
    const { rateLimits } = loadConfig();
    const { app } = buildTestApp({
      seed: seed(),
      config: {
        rateLimits: { ...rateLimits, actionTestByAccount: { windowMs: 60_000, max: 1 } },
      },
    });
    expect((await runTest(app, { target: 'email' })).statusCode).toBe(200);
    const bloque = await runTest(app, { target: 'email' });
    expect(bloque.statusCode).toBe(429);
    expect(bloque.json().error).toBe('too_many_requests');
  });
});

describe('POST /api/actions/test — target: email', () => {
  it('envoie RÉELLEMENT, et renvoie de quoi diagnostiquer', async () => {
    const { app, mailer } = buildTestApp({ seed: seed() });
    const res = await runTest(app, { target: 'email' });

    expect(res.statusCode).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(res.json()).toMatchObject({
      ok: true,
      target: 'email',
      via: 'smtp',
      recipients: { to: [USER], cc: [] },
      recipientsSource: 'account',
      subjectSource: 'builtin',
    });
    // Le document factice ne porte aucune donnée de réunion.
    expect(mailer.sent[0].title).toContain('test');
  });

  it('joint un fichier texte, jamais un PDF', async () => {
    // Le PDF est tiré de la mise en page du navigateur : il n'existe pas côté
    // serveur. Un `.txt` valide tout ce que le test doit prouver.
    const { app, mailer } = buildTestApp({ seed: seed() });
    await runTest(app, { target: 'email' });

    const [file] = mailer.sent[0].attachments;
    expect(file.filename).toMatch(/\.txt$/);
    expect(file.contentType).toContain('text/plain');
  });

  it('passe par le compte relié quand il existe', async () => {
    const { app, gmailSend } = buildTestApp({
      seed: seed({ appSettings: authSeed(), userConnections: connected() }),
    });
    const res = await runTest(app, { target: 'email' });

    expect(gmailSend.calls).toHaveLength(1);
    expect(res.json()).toMatchObject({ via: 'gmail', from: 'perso@gmail.com' });
  });

  it('remonte la panne du transport telle quelle', async () => {
    const { app } = buildTestApp({
      seed: seed(),
      mailer: createFakeMailer({ enabled: false }),
    });
    const res = await runTest(app, { target: 'email' });
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toBe('mailer_disabled');
  });
});

describe('POST /api/actions/test — target: storage', () => {
  it('dépose RÉELLEMENT, et dit où', async () => {
    const { app, driveStore } = buildTestApp({
      seed: seed({
        appSettings: [
          ...authSeed(),
          { key: 'actions', connections: { provider: 'google' }, storage: { folder: 'CR' } },
        ],
        userConnections: connected(),
      }),
    });
    const res = await runTest(app, { target: 'storage' });

    expect(driveStore.calls).toHaveLength(1);
    expect(driveStore.calls[0].folderPath).toBe('CR');
    expect(res.json()).toMatchObject({
      ok: true,
      target: 'storage',
      provider: 'google',
      folderPath: 'CR',
      folderSource: 'admin',
    });
  });

  it('distingue les causes d’échec comme le dépôt réel', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await runTest(app, { target: 'storage' });
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toBe('storage_not_configured');
  });
});

describe('anti-simulacre : le test partage la chaîne de l’action réelle', () => {
  it('un destinataire enregistré atteint le transport au test suivant', async () => {
    const { app, gmailSend } = buildTestApp({
      seed: seed({ appSettings: authSeed(), userConnections: connected() }),
    });

    // 1. Sans réglage : le compte connecté, seul.
    await runTest(app, { target: 'email' });
    expect(gmailSend.calls[0].to).toEqual([USER]);
    expect(gmailSend.calls[0].cc).toEqual([]);

    // 2. On enregistre un destinataire par la route de réglages…
    expect((await saveSettings(app, { mail: { recipients: [TIERS] } })).statusCode).toBe(200);

    // 3. …et le TRANSPORT le voit au test suivant. Si le bouton résolvait ses
    // paramètres par un autre chemin, cette assertion tomberait.
    const res = await runTest(app, { target: 'email' });
    expect(gmailSend.calls[1].to).toEqual([TIERS]);
    expect(gmailSend.calls[1].cc).toEqual([USER]);
    expect(res.json().recipientsSource).toBe('user');
  });

  it('un dossier enregistré atteint le fournisseur au test suivant', async () => {
    const { app, driveStore } = buildTestApp({
      seed: seed({
        appSettings: [
          ...authSeed(),
          { key: 'actions', connections: { provider: 'google' }, storage: { folder: 'CR' } },
        ],
        userConnections: connected(),
      }),
    });

    await saveSettings(app, { storage: { folder: 'Clients/Acme' } });
    const res = await runTest(app, { target: 'storage' });

    expect(driveStore.calls[0].folderPath).toBe('Clients/Acme');
    expect(res.json().folderSource).toBe('user');
  });

  it('un gabarit enregistré nomme le fichier — sans en changer l’extension', async () => {
    const { app, driveStore } = buildTestApp({
      seed: seed({
        appSettings: [...authSeed(), { key: 'actions', connections: { provider: 'google' } }],
        userConnections: connected(),
      }),
    });

    await saveSettings(app, { naming: { filenameTemplate: 'CR-{{titre}}' } });
    const res = await runTest(app, { target: 'storage' });

    // Le gabarit d'un résumé prévoit `.pdf` ; les octets déposés sont du texte.
    // L'extension suit les octets.
    expect(driveStore.calls[0].file.filename).toBe('cr-mybrief-test-de-configuration.txt');
    expect(res.json().filename).toMatch(/\.txt$/);
  });

  it('le scope « admin » ignore la surcharge personnelle du demandeur', async () => {
    const { app, mailer } = buildTestApp({ seed: seed() });
    await saveSettings(app, { mail: { recipients: [TIERS] } }, ADMIN);

    const perso = await runTest(app, { target: 'email' }, ADMIN);
    expect(perso.json().recipientsSource).toBe('user');

    const orga = await runTest(app, { target: 'email', scope: 'admin' }, ADMIN);
    expect(orga.json().recipientsSource).toBe('account');
    expect(mailer.sent.at(-1).to).toEqual([ADMIN]);
  });
});
