/**
 * Actions après réunion / résumé — réglages d'administration et routes
 * d'exécution (/api/actions/*).
 *
 * Garanties à tenir :
 *   - la visibilité des boutons est un réglage, pas un contrôle d'accès : les
 *     routes d'exécution revérifient les réglages côté serveur ;
 *   - l'email part TOUJOURS vers le compte authentifié, jamais vers un champ
 *     du client ;
 *   - le dossier cible d'entreposage ne sort que par les routes admin.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, createFakeMailer } from './helpers.js';
import { toPublicActionsSettings } from '../lib/repositories/settings.js';

const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';

const seed = () => ({ user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER)] });

function get(app, url, email = ADMIN) {
  return app.inject({ method: 'GET', url, headers: identityHeaders(email) });
}

function post(app, url, body, email = ADMIN) {
  return app.inject({
    method: 'POST',
    url,
    headers: {
      ...identityHeaders(email),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('projection publique des actions', () => {
  it("ne sort le dossier cible que pour l'administration", () => {
    const doc = { storage: { provider: 'gdrive', folder: 'Clients/CR' } };
    expect(JSON.stringify(toPublicActionsSettings(doc))).not.toContain('Clients/CR');
    expect(toPublicActionsSettings(doc, { withFolder: true }).storage.folder).toBe('Clients/CR');
  });

  it('un fournisseur inconnu en base est neutralisé, pas relayé', () => {
    const doc = { storage: { provider: 'dropbox' } };
    expect(toPublicActionsSettings(doc).storage.provider).toBe('');
  });

  it('emailAvailable reflète le mailer, pas le document', () => {
    expect(toPublicActionsSettings({}, { mailerEnabled: true }).emailAvailable).toBe(true);
    expect(toPublicActionsSettings({}, { mailerEnabled: false }).emailAvailable).toBe(false);
  });
});

describe('GET /api/admin/settings/actions', () => {
  it('exige le rôle admin', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await get(app, '/api/admin/settings/actions', USER);
    expect(res.statusCode).toBe(403);
  });

  it("par défaut, toutes les actions sont proposées et aucun fournisseur n'est choisi", async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await get(app, '/api/admin/settings/actions');
    expect(res.statusCode).toBe(200);
    const { settings } = res.json();
    expect(settings.transcription).toEqual({ email: true, storage: true, download: true });
    expect(settings.summary).toEqual({ email: true, storage: true, download: true });
    expect(settings.storage).toEqual({ provider: '', folder: '' });
    expect(settings.emailAvailable).toBe(true); // fake mailer activé par défaut
  });

  it('sert les variables de gabarit admises', async () => {
    // Même liste qu'à l'écran utilisateur, et pour la même raison : une copie
    // côté client divergerait au premier ajout, et l'écran d'administration
    // proposerait une variable que l'enregistrement refuse.
    const { app } = buildTestApp({ seed: seed() });
    const res = await get(app, '/api/admin/settings/actions');
    expect(res.json().variables).toEqual(['titre', 'date', 'type', 'compte']);
  });
});

describe('POST /api/admin/settings/actions', () => {
  it("enregistre les interrupteurs et la destination, et trace l'auteur", async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/actions', {
      transcription: { email: false },
      storage: { provider: 'gdrive', folder: '  myBrief/CR  ' },
    });
    expect(res.statusCode).toBe(200);
    const { settings } = res.json();
    // Patch partiel : seul transcription.email bouge, le reste est conservé.
    expect(settings.transcription).toEqual({ email: false, storage: true, download: true });
    expect(settings.summary).toEqual({ email: true, storage: true, download: true });
    expect(settings.storage).toEqual({ provider: 'gdrive', folder: 'myBrief/CR' });

    const doc = db.data.get('appSettings').find((d) => d.key === 'actions');
    expect(doc.updatedBy).toBe(ADMIN);
  });

  it('refuse un fournisseur inconnu', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/actions', {
      storage: { provider: 'dropbox' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
  });
});

describe('GET /api/auth/config — capacités publiques', () => {
  it('expose la visibilité des boutons, sans le dossier cible', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/actions', {
      summary: { storage: false },
      storage: { provider: 'sharepoint', folder: 'Secret/Interne' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.statusCode).toBe(200);
    const { actions } = res.json();
    expect(actions.summary.storage).toBe(false);
    expect(actions.storage.provider).toBe('sharepoint');
    expect(JSON.stringify(actions)).not.toContain('Secret/Interne');
  });

  it('emailAvailable tombe à faux sans relais SMTP', async () => {
    const { app } = buildTestApp({ seed: seed(), mailer: createFakeMailer({ enabled: false }) });
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.json().actions.emailAvailable).toBe(false);
  });
});

describe('POST /api/actions/email', () => {
  const body = { kind: 'transcription', title: 'Point client', content: 'Bonjour à tous.' };

  it('exige une identité', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions/email',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.statusCode).toBe(401);
  });

  it("envoie le document AU compte connecté — le destinataire n'est pas un champ du corps", async () => {
    const { app, mailer } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/actions/email', body, USER);
    expect(res.statusCode).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    // `to` est une LISTE depuis les destinataires paramétrables : sans réglage
    // personnel, elle ne contient que le compte connecté — le comportement
    // d'avant, exprimé dans la forme d'après.
    expect(mailer.sent[0]).toMatchObject({
      to: [USER],
      kind: 'transcription',
      title: 'Point client',
    });
  });

  it("ignore un destinataire fourni par le client — l'email part quand même vers le compte connecté", async () => {
    // ajv (removeAdditional, défaut Fastify) retire les champs non déclarés :
    // `to` n'atteint jamais le handler. Et il n'atteindrait pas davantage la
    // branche multipart, qui ne lit aucun champ de destination.
    const { app, mailer } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/actions/email', { ...body, to: 'pirate@ailleurs.com' }, USER);
    expect(res.statusCode).toBe(200);
    expect(mailer.sent[0].to).toEqual([USER]);
  });

  it("revérifie le réglage côté serveur : masquer un bouton n'est pas un contrôle d'accès", async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/actions', { transcription: { email: false } });
    const res = await post(app, '/api/actions/email', body, USER);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('action_disabled');
  });

  it('répond 501 sans relais SMTP', async () => {
    const { app } = buildTestApp({ seed: seed(), mailer: createFakeMailer({ enabled: false }) });
    const res = await post(app, '/api/actions/email', body, USER);
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toBe('mailer_disabled');
  });
});

describe('réglage du fournisseur de connexion', () => {
  it('lit les valeurs historiques sans migration de données', async () => {
    // Une installation configurée avant le renommage porte `gdrive` en base.
    // Elle doit désigner Google dès le premier démarrage : sans cette lecture,
    // le bouton « Entreposer » disparaîtrait de toutes les installations
    // existantes le jour du déploiement.
    const { app } = buildTestApp({
      seed: {
        ...seed(),
        appSettings: [{ key: 'actions', storage: { provider: 'sharepoint', folder: 'CR' } }],
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/config',
    });
    expect(res.json().actions.connections.provider).toBe('microsoft');
  });

  it("enregistre le nouveau nom et garde le miroir de l'ancien", async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/actions', {
      connections: { provider: 'google' },
      storage: { folder: 'CR/2026' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.connections.provider).toBe('google');
    // Miroir : un retour arrière du code relit un document cohérent.
    expect(res.json().settings.storage.provider).toBe('gdrive');
  });

  it('accepte encore un patch au nom historique', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/actions', {
      storage: { provider: 'sharepoint' },
    });
    expect(res.json().settings.connections.provider).toBe('microsoft');
  });

  it('propose SharePoint par défaut, y compris sur un document antérieur au réglage', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, '/api/admin/settings/actions', {
      connections: { provider: 'microsoft' },
    });
    expect(res.json().settings.connections.sharepoint).toBe(true);
  });

  it('enregistre le refus de SharePoint, et le garde quand le patch n’en parle pas', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const coupe = await post(app, '/api/admin/settings/actions', {
      connections: { provider: 'microsoft', sharepoint: false },
    });
    expect(coupe.json().settings.connections.sharepoint).toBe(false);

    // Un écran d'une version antérieure enregistre `connections: { provider }`
    // seul : il ne doit pas rendre SharePoint à qui l'a coupé.
    const apres = await post(app, '/api/admin/settings/actions', {
      connections: { provider: 'microsoft' },
    });
    expect(apres.json().settings.connections.sharepoint).toBe(false);
  });

  it('ne sert pas le réglage à la sonde publique', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await post(app, '/api/admin/settings/actions', {
      connections: { provider: 'microsoft', sharepoint: false },
    });
    const res = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(res.json().actions.connections).not.toHaveProperty('sharepoint');
  });
});
