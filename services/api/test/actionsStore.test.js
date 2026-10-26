/**
 * Dépôt d'un document sur le Drive du compte relié (routes/actions.js).
 *
 * Trois conditions doivent être réunies, et l'utilisateur doit pouvoir savoir
 * laquelle manque : l'administration a choisi un fournisseur, l'utilisateur a
 * relié son compte, et ce compte a bien accordé l'accès aux fichiers. Un seul
 * message « ça n'a pas marché » obligerait à ouvrir les logs du serveur pour
 * répondre à « pourquoi ? ».
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, userDoc, identityHeaders, createFakeDriveStore } from './helpers.js';
import { ConnectionAuthError } from '../lib/connections/errors.js';

const USER = 'simple@client.fr';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const baseSeed = ({ provider = 'google', folder = 'CR', scopes = [DRIVE_SCOPE] } = {}) => ({
  user: [userDoc(USER)],
  appSettings: [
    { key: 'auth', google: { enabled: true, clientId: 'id', clientSecret: 'secret' } },
    { key: 'actions', connections: { provider }, storage: { provider: '', folder } },
  ],
  userConnections: scopes
    ? [
        {
          emailLower: USER,
          provider: 'google',
          account: 'perso@gmail.com',
          refreshToken: 'rt-123',
          scopes,
        },
      ]
    : [],
});

const DOCUMENT = { kind: 'summary', title: 'Point client', content: '<h1>Résumé</h1>', lang: 'fr' };
const PDF = {
  filename: '2026-08-08-point-client.pdf',
  contentType: 'application/pdf',
  content: '%PDF-1.4 faux contenu',
};

function multipartBody(fields, file) {
  const boundary = '----mybriefstore';
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
  }
  if (file) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
        `Content-Type: ${file.contentType}\r\n\r\n${file.content}\r\n`,
    );
  }
  chunks.push(`--${boundary}--\r\n`);
  return { body: Buffer.from(chunks.join(''), 'utf8'), boundary };
}

function store(app, { fields = DOCUMENT, file = PDF } = {}) {
  const { body, boundary } = multipartBody(fields, file);
  return app.inject({
    method: 'POST',
    url: '/api/actions/store',
    headers: {
      ...identityHeaders(USER),
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
}

describe('POST /api/actions/store', () => {
  it('dépose le fichier dans le dossier configuré', async () => {
    const { app, driveStore } = buildTestApp({ seed: baseSeed() });
    const res = await store(app);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, provider: 'google', folder: 'CR' });
    expect(driveStore.calls).toHaveLength(1);
    const call = driveStore.calls[0];
    expect(call.provider).toBe('google');
    expect(call.folderPath).toBe('CR');
    expect(call.connection.refreshToken).toBe('rt-123');
    expect(call.file.filename).toBe(PDF.filename);
    expect(call.file.content.toString()).toBe(PDF.content);
  });

  it('mémorise le dossier résolu pour les dépôts suivants', async () => {
    const { app, db } = buildTestApp({ seed: baseSeed() });
    await store(app);

    const connection = db.data.get('userConnections')[0];
    expect(connection.drive).toMatchObject({ folderPath: 'CR', folderId: 'folder-1' });
  });

  it('ne réécrit pas le cache quand le dépôt l’a déjà réutilisé', async () => {
    const { app, db } = buildTestApp({
      seed: baseSeed(),
      driveStore: createFakeDriveStore({ result: { cacheUsed: true } }),
    });
    await store(app);
    expect(db.data.get('userConnections')[0].drive).toBeUndefined();
  });

  it('exige un fichier : le document seul ne suffit pas', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });

    const sansFichier = await store(app, { file: null });
    expect(sansFichier.statusCode).toBe(400);
    expect(sansFichier.json().error).toBe('file_required');

    const enJson = await app.inject({
      method: 'POST',
      url: '/api/actions/store',
      headers: { ...identityHeaders(USER), 'content-type': 'application/json' },
      body: JSON.stringify(DOCUMENT),
    });
    expect(enJson.statusCode).toBe(400);
    expect(enJson.json().error).toBe('file_required');
  });

  it("dit que l'administration n'a choisi aucun fournisseur", async () => {
    const { app, driveStore } = buildTestApp({ seed: baseSeed({ provider: '' }) });
    const res = await store(app);
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toBe('storage_not_configured');
    expect(driveStore.calls).toHaveLength(0);
  });

  it("dit que l'utilisateur n'a relié aucun compte", async () => {
    const { app } = buildTestApp({ seed: baseSeed({ scopes: null }) });
    const res = await store(app);
    expect(res.statusCode).toBe(501);
    expect(res.json()).toMatchObject({ error: 'storage_not_connected', provider: 'google' });
  });

  it("distingue une connexion qui n'a jamais eu l'accès aux fichiers", async () => {
    // Connexion héritée de l'époque « Gmail seul » : elle envoie des mails,
    // mais déposer échouerait chez Google. Le dire ici évite un aller-retour
    // au support pour un problème que l'utilisateur peut régler seul.
    const { app, driveStore } = buildTestApp({
      seed: baseSeed({ scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'] }),
    });
    const res = await store(app);
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toBe('storage_scope_missing');
    expect(driveStore.calls).toHaveLength(0);
  });

  it('refuse un compte relié chez un AUTRE fournisseur que celui retenu', async () => {
    // Après une bascule d'installation Google → Microsoft : le compte Google
    // encore relié ne sait pas écrire sur OneDrive.
    const { app } = buildTestApp({ seed: baseSeed({ provider: 'microsoft' }) });
    const res = await store(app);
    expect(res.statusCode).toBe(501);
    expect(res.json()).toMatchObject({ error: 'storage_not_connected', provider: 'microsoft' });
  });

  it('purge la connexion quand le fournisseur a retiré son accès', async () => {
    const { app, db } = buildTestApp({
      seed: baseSeed(),
      driveStore: createFakeDriveStore({ fail: new ConnectionAuthError('revoked') }),
    });
    const res = await store(app);

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('storage_auth_revoked');
    // Purgée pour que « Ma configuration » montre « non connecté » au lieu
    // d'échouer à chaque dépôt.
    expect(db.data.get('userConnections')).toHaveLength(0);
  });

  it('garde la connexion sur un échec transitoire', async () => {
    const { app, db } = buildTestApp({
      seed: baseSeed(),
      driveStore: createFakeDriveStore({ fail: new Error('google_drive_upload_failed_500') }),
    });
    const res = await store(app);

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('storage_upload_failed');
    expect(db.data.get('userConnections')).toHaveLength(1);
  });

  it("respecte l'interrupteur d'administration", async () => {
    const seed = baseSeed();
    seed.appSettings[1].summary = { storage: false };
    const { app, driveStore } = buildTestApp({ seed });
    const res = await store(app);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('action_disabled');
    expect(driveStore.calls).toHaveLength(0);
  });

  it('exige une session', async () => {
    const { app } = buildTestApp({ seed: baseSeed() });
    const { body, boundary } = multipartBody(DOCUMENT, PDF);
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions/store',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });
});
