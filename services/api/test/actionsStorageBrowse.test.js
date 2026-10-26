/**
 * Fenêtre de navigation, approbation, et dossier par tag.
 *
 * Les trois tiennent ensemble : la fenêtre produit un CHEMIN, l'approbation le
 * montre avant que rien ne parte, et le tag peut le remplacer. Ce qui est
 * vérifié ici est donc surtout ce que le serveur DÉCIDE — le chemin résolu —
 * plutôt que la fidélité d'un fournisseur factice.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTestApp,
  userDoc,
  identityHeaders,
  createFakeDriveBrowser,
  createFakeDriveStore,
} from './helpers.js';

const USER = 'simple@client.fr';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
/** Scope de navigation HISTORIQUE — encore accepté, plus demandé. */
const BROWSE_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';
/** Scope de navigation actuel : lui seul énumère les Drive partagés. */
const READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GRAPH_DRIVE_SCOPE = 'https://graph.microsoft.com/Files.ReadWrite';
const GRAPH_BROWSE_SCOPE = 'https://graph.microsoft.com/Sites.ReadWrite.All';

const seed = ({
  provider = 'google',
  folder = 'CR',
  scopes = [DRIVE_SCOPE, BROWSE_SCOPE],
  storage = {},
  tags = [],
  meetings = [],
  connections = {},
} = {}) => ({
  user: [userDoc(USER)],
  appSettings: [
    {
      key: 'auth',
      google: { enabled: true, clientId: 'id', clientSecret: 'secret' },
      entra: {
        enabled: true,
        clientId: 'id',
        clientSecret: 'secret',
        discoveryUrl: 'https://login.microsoftonline.com/t/v2.0/.well-known/openid-configuration',
      },
    },
    {
      key: 'actions',
      connections: { provider, ...connections },
      storage: { provider: '', folder },
    },
  ],
  userConnections: [
    {
      emailLower: USER,
      provider,
      account: provider === 'google' ? 'perso@gmail.com' : 'perso@societe.fr',
      refreshToken: 'rt-123',
      scopes,
    },
  ],
  userActionSettings: Object.keys(storage).length
    ? [{ email: USER, emailLower: USER, storage }]
    : [],
  userTags: tags,
  resume: meetings,
});

const get = (app, url) => app.inject({ method: 'GET', url, headers: identityHeaders(USER) });

const postJson = (app, url, payload) =>
  app.inject({ method: 'POST', url, payload, headers: identityHeaders(USER) });

const DOCUMENT = { kind: 'summary', title: 'Point client', content: '<h1>x</h1>', lang: 'fr' };
const PDF = {
  filename: '2026-08-08-point-client.pdf',
  contentType: 'application/pdf',
  content: '%PDF faux',
};

function multipart(fields, file = PDF) {
  const boundary = '----mybriefbrowse';
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
  }
  chunks.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n${file.content}\r\n`,
  );
  chunks.push(`--${boundary}--\r\n`);
  return { body: Buffer.from(chunks.join(''), 'utf8'), boundary };
}

function store(app, fields = DOCUMENT) {
  const { body, boundary } = multipart(fields);
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

describe('navigation dans le stockage', () => {
  it('liste les sous-dossiers avec leur curseur', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await get(app, '/api/actions/storage/folders');

    expect(res.statusCode).toBe(200);
    expect(res.json().folders).toEqual([
      { name: 'Clients', cursor: 'Clients' },
      { name: 'Archives', cursor: 'Archives' },
    ]);
  });

  it('descend d’un niveau avec le curseur rendu par le niveau précédent', async () => {
    const { app, driveBrowser } = buildTestApp({ seed: seed() });
    const res = await get(app, '/api/actions/storage/folders?cursor=Clients');

    expect(res.json().folders).toEqual([{ name: 'Acme', cursor: 'Clients/Acme' }]);
    expect(driveBrowser.calls.at(-1)).toMatchObject({ method: 'list', cursor: 'Clients' });
  });

  it('résout le chemin absolu d’un résultat de recherche', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await get(app, '/api/actions/storage/path?cursor=Clients/Acme');
    expect(res.json()).toEqual({ ok: true, path: 'Clients/Acme' });
  });

  it('crée un dossier et rend son curseur', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await postJson(app, '/api/actions/storage/folders', {
      cursor: 'Clients',
      name: 'Nouveau',
    });
    expect(res.json().folder).toEqual({ name: 'Nouveau', cursor: 'Clients/Nouveau' });
  });

  it('refuse un nom de dossier contenant une barre oblique', async () => {
    // Il ferait deux niveaux là où l'utilisateur en demande un, et ne
    // survivrait pas à l'aller-retour par un chemin.
    const { app } = buildTestApp({ seed: seed() });
    const res = await postJson(app, '/api/actions/storage/folders', { name: 'a/b' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('folder_name_invalid');
  });

  it('nomme le scope manquant d’une connexion nouée avant la navigation', async () => {
    // Elle DÉPOSE toujours : l'écran doit proposer une reconnexion, pas laisser
    // croire que le dépôt est cassé.
    const { app } = buildTestApp({ seed: seed({ scopes: [DRIVE_SCOPE] }) });
    const res = await get(app, '/api/actions/storage/folders');
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toBe('browse_scope_missing');
  });

  it('distingue « compte non relié » de « scope manquant »', async () => {
    const { app } = buildTestApp({ seed: { ...seed(), userConnections: [] } });
    const res = await get(app, '/api/actions/storage/folders');
    expect(res.json().error).toBe('storage_not_connected');
  });

  it('ne supprime PAS la connexion quand la navigation échoue', async () => {
    // Contrairement au dépôt : parcourir est du confort, casser la connexion
    // pour un incident de trente secondes serait disproportionné.
    const { app, db } = buildTestApp({
      seed: seed(),
      driveBrowser: createFakeDriveBrowser({ fail: new Error('graph_folder_list_failed_500') }),
    });
    const res = await get(app, '/api/actions/storage/folders');
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('browse_failed');
    expect(db.data.get('userConnections')).toHaveLength(1);
  });

  it('annonce les bibliothèques SharePoint côté Microsoft', async () => {
    const { app } = buildTestApp({
      seed: seed({ provider: 'microsoft', scopes: [GRAPH_DRIVE_SCOPE, GRAPH_BROWSE_SCOPE] }),
      driveBrowser: createFakeDriveBrowser({
        drives: [
          { id: 'd-onedrive', name: 'OneDrive', site: '' },
          { id: 'd-marketing', name: 'Documents', site: 'Marketing' },
        ],
      }),
    });
    const res = await get(app, '/api/actions/storage/drives');
    expect(res.json()).toMatchObject({ provider: 'microsoft', multiDrive: true });
    expect(res.json().drives).toHaveLength(2);
  });

  it('annonce plusieurs racines côté Google — Mon Drive et les Drive partagés', async () => {
    const { app } = buildTestApp({
      seed: seed(),
      driveBrowser: createFakeDriveBrowser({
        drives: [
          { id: '', name: 'Mon Drive', site: '' },
          { id: 'd-equipe', name: 'Drive Équipe', site: '' },
        ],
      }),
    });
    const res = await get(app, '/api/actions/storage/drives');
    expect(res.json()).toMatchObject({ provider: 'google', multiDrive: true });
    expect(res.json().drives).toHaveLength(2);
  });

  it('une connexion nouée avant drive.readonly navigue encore — sans Drive partagés', async () => {
    // `drive.metadata.readonly` a été remplacé par `drive.readonly` dans la
    // demande : les connexions d'avant ne doivent PAS perdre la navigation,
    // elles perdent seulement l'énumération des Drive partagés.
    const { app } = buildTestApp({ seed: seed({ scopes: [DRIVE_SCOPE, BROWSE_SCOPE] }) });
    const res = await get(app, '/api/actions/storage/folders');
    expect(res.statusCode).toBe(200);
  });

  it('dit que la liste est TRONQUÉE faute de scope, plutôt que de la laisser croire complète', async () => {
    // Sans ce drapeau, l'écran affirmerait qu'il n'y a aucun Drive partagé là
    // où il y en a — et personne ne devinerait qu'une reconnexion les montre.
    const { app } = buildTestApp({ seed: seed({ scopes: [DRIVE_SCOPE, BROWSE_SCOPE] }) });
    const res = await get(app, '/api/actions/storage/drives');
    expect(res.json().sharedDrivesMissing).toBe(true);
  });

  it('ne signale rien quand le scope est là', async () => {
    const { app } = buildTestApp({ seed: seed({ scopes: [DRIVE_SCOPE, READONLY_SCOPE] }) });
    const res = await get(app, '/api/actions/storage/drives');
    expect(res.json().sharedDrivesMissing).toBe(false);
  });

  it('une connexion portant drive.readonly navigue aussi', async () => {
    const { app } = buildTestApp({ seed: seed({ scopes: [DRIVE_SCOPE, READONLY_SCOPE] }) });
    const res = await get(app, '/api/actions/storage/folders');
    expect(res.statusCode).toBe(200);
  });
});

describe('dossier choisi dans la fenêtre', () => {
  it('enregistre le chemin ET sa bibliothèque', async () => {
    // Les deux ensemble : un chemin sans sa bibliothèque déposerait dans un
    // homonyme de l'ancienne.
    const { app } = buildTestApp({
      seed: seed({ provider: 'microsoft', scopes: [GRAPH_DRIVE_SCOPE, GRAPH_BROWSE_SCOPE] }),
    });
    const res = await postJson(app, '/api/actions/settings', {
      storage: {
        folder: 'Clients/Acme',
        driveId: 'd-marketing',
        driveName: 'Marketing / Documents',
      },
    });
    expect(res.json().settings.storage).toMatchObject({
      folder: 'Clients/Acme',
      driveId: 'd-marketing',
      driveName: 'Marketing / Documents',
    });
  });

  it('un patch partiel ne vide pas le dossier déjà choisi', async () => {
    const { app } = buildTestApp({ seed: seed({ storage: { folder: 'CR/2026' } }) });
    const res = await postJson(app, '/api/actions/settings', {
      storage: { requireApproval: true },
    });
    expect(res.json().settings.storage).toMatchObject({
      folder: 'CR/2026',
      requireApproval: true,
    });
  });

  it('dépose dans la bibliothèque enregistrée', async () => {
    const { app, driveStore } = buildTestApp({
      seed: seed({
        provider: 'microsoft',
        scopes: [GRAPH_DRIVE_SCOPE, GRAPH_BROWSE_SCOPE],
        storage: { folder: 'Clients/Acme', driveId: 'd-marketing' },
      }),
    });
    const res = await store(app);
    expect(res.statusCode).toBe(200);
    expect(driveStore.calls[0]).toMatchObject({
      folderPath: 'Clients/Acme',
      driveId: 'd-marketing',
    });
  });

  it('mémorise la bibliothèque avec le dossier résolu', async () => {
    const { app, db } = buildTestApp({
      seed: seed({
        provider: 'microsoft',
        scopes: [GRAPH_DRIVE_SCOPE, GRAPH_BROWSE_SCOPE],
        storage: { folder: 'CR', driveId: 'd-marketing' },
      }),
    });
    await store(app);
    expect(db.data.get('userConnections')[0].drive).toMatchObject({ driveId: 'd-marketing' });
  });
});

describe('approbation avant dépôt', () => {
  const withApproval = (extra = {}) =>
    seed({ storage: { folder: 'CR', requireApproval: true, ...extra } });

  it('rend la destination et n’écrit RIEN tant qu’elle n’est pas approuvée', async () => {
    const { app, driveStore } = buildTestApp({ seed: withApproval() });
    const res = await store(app);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: 'approval_required',
      plan: {
        provider: 'google',
        account: 'perso@gmail.com',
        folder: 'CR',
        filename: PDF.filename,
      },
    });
    expect(driveStore.calls).toHaveLength(0);
  });

  it('dépose une fois l’accord donné', async () => {
    const { app, driveStore } = buildTestApp({ seed: withApproval() });
    const res = await store(app, { ...DOCUMENT, approved: 'true' });

    expect(res.statusCode).toBe(200);
    expect(driveStore.calls).toHaveLength(1);
  });

  it('reste inerte pour qui ne l’a pas activée', async () => {
    const { app, driveStore } = buildTestApp({ seed: seed() });
    const res = await store(app);
    expect(res.statusCode).toBe(200);
    expect(driveStore.calls).toHaveLength(1);
  });
});

describe('un dossier par tag', () => {
  const TAG = { email: USER, emailLower: USER, id: 't-acme', label: 'Acme', color: 'blue' };
  const MEETING = { email: USER, emailLower: USER, meetingId: 'm-1', tagId: 't-acme' };
  const tagged = { ...DOCUMENT, meetingId: 'm-1' };

  it('suit la destination explicite du tag, bibliothèque comprise', async () => {
    const { app, driveStore } = buildTestApp({
      seed: seed({
        storage: {
          folder: 'CR',
          tagFolders: [{ tagId: 't-acme', folder: 'Clients/Acme', driveId: 'd-acme' }],
        },
        tags: [TAG],
        meetings: [MEETING],
      }),
    });
    const res = await store(app, tagged);

    expect(res.json()).toMatchObject({ folder: 'Clients/Acme', tag: 'Acme' });
    expect(driveStore.calls[0]).toMatchObject({ folderPath: 'Clients/Acme', driveId: 'd-acme' });
  });

  it('suit la RACINE d’un Drive partagé — une bibliothèque sans chemin est une destination', async () => {
    // Le bug : choisir « ce Drive partagé, à sa racine » rend `folder: ''` avec
    // un `driveId`. Testée sur le seul chemin, la destination était jetée et le
    // document partait dans Mon Drive — sous un chemin de repli qui existait,
    // donc avec un message de confirmation parfaitement crédible.
    const { app, driveStore } = buildTestApp({
      seed: seed({
        storage: {
          folder: 'CR',
          tagSubfolders: true,
          tagFolders: [{ tagId: 't-acme', folder: '', driveId: 'd-acme', driveName: 'Drive Acme' }],
        },
        tags: [TAG],
        meetings: [MEETING],
      }),
    });
    const res = await store(app, tagged);

    expect(driveStore.calls[0]).toMatchObject({ folderPath: '', driveId: 'd-acme' });
    // La bibliothèque est NOMMÉE dans la réponse : c'est ce qui rend un dépôt
    // au mauvais endroit visible au lieu d'être indiscernable du bon.
    expect(res.json()).toMatchObject({ driveName: 'Drive Acme' });
  });

  it('le sous-dossier automatique ne l’emporte pas sur une bibliothèque choisie', async () => {
    // `tagSubfolders` est actif ET le tag vise la racine d'un Drive partagé :
    // la destination EXPLICITE gagne, sinon le réglage global ramènerait le
    // document dans Mon Drive.
    const { app, driveStore } = buildTestApp({
      seed: seed({
        storage: {
          folder: 'CR',
          driveId: '',
          tagSubfolders: true,
          tagFolders: [{ tagId: 't-acme', folder: '', driveId: 'd-acme' }],
        },
        tags: [TAG],
        meetings: [MEETING],
      }),
    });
    await store(app, tagged);
    expect(driveStore.calls[0].driveId).toBe('d-acme');
    expect(driveStore.calls[0].folderPath).not.toBe('CR/Acme');
  });

  it('une bibliothèque personnelle sans chemin n’emprunte PAS le dossier de l’organisation', async () => {
    // Mélanger le chemin de l'administration et la bibliothèque de la personne
    // déposerait le dossier de l'organisation dans son Drive partagé.
    const { app, driveStore } = buildTestApp({
      seed: seed({ folder: 'DossierAdmin', storage: { folder: '', driveId: 'd-perso' } }),
    });
    await store(app);
    expect(driveStore.calls[0]).toMatchObject({ folderPath: '', driveId: 'd-perso' });
  });

  it('crée un sous-dossier au nom du tag quand l’utilisateur l’a demandé', async () => {
    const { app, driveStore } = buildTestApp({
      seed: seed({
        storage: { folder: 'CR', tagSubfolders: true },
        tags: [TAG],
        meetings: [MEETING],
      }),
    });
    await store(app, tagged);
    expect(driveStore.calls[0].folderPath).toBe('CR/Acme');
  });

  it('la destination explicite l’emporte sur le sous-dossier automatique', async () => {
    const { app, driveStore } = buildTestApp({
      seed: seed({
        storage: {
          folder: 'CR',
          tagSubfolders: true,
          tagFolders: [{ tagId: 't-acme', folder: 'Ailleurs' }],
        },
        tags: [TAG],
        meetings: [MEETING],
      }),
    });
    await store(app, tagged);
    expect(driveStore.calls[0].folderPath).toBe('Ailleurs');
  });

  it('ignore le tag quand rien ne le route', async () => {
    const { app, driveStore } = buildTestApp({
      seed: seed({ storage: { folder: 'CR' }, tags: [TAG], meetings: [MEETING] }),
    });
    await store(app, tagged);
    expect(driveStore.calls[0].folderPath).toBe('CR');
  });

  it('neutralise une barre oblique dans le libellé du tag', async () => {
    // Elle créerait un niveau fantôme sous le dossier de base.
    const { app, driveStore } = buildTestApp({
      seed: seed({
        storage: { folder: 'CR', tagSubfolders: true },
        tags: [{ ...TAG, label: 'Acme/Nord' }],
        meetings: [MEETING],
      }),
    });
    await store(app, tagged);
    expect(driveStore.calls[0].folderPath).toBe('CR/Acme-Nord');
  });

  it('ne lit pas le tag de la conversation de quelqu’un d’autre', async () => {
    const { app, driveStore } = buildTestApp({
      seed: seed({
        storage: { folder: 'CR', tagFolders: [{ tagId: 't-acme', folder: 'Clients/Acme' }] },
        tags: [TAG],
        meetings: [{ ...MEETING, email: 'autre@client.fr', emailLower: 'autre@client.fr' }],
      }),
    });
    await store(app, tagged);
    expect(driveStore.calls[0].folderPath).toBe('CR');
  });

  it('retombe sur le dossier de base quand le tag a été supprimé', async () => {
    // Un tag manquant ne doit jamais faire échouer un dépôt.
    const { app, driveStore } = buildTestApp({
      seed: seed({
        storage: { folder: 'CR', tagSubfolders: true },
        tags: [],
        meetings: [MEETING],
      }),
    });
    const res = await store(app, tagged);
    expect(res.statusCode).toBe(200);
    expect(driveStore.calls[0].folderPath).toBe('CR');
  });

  it('annonce le dossier du tag dans l’écran d’approbation', async () => {
    const { app } = buildTestApp({
      seed: seed({
        storage: {
          folder: 'CR',
          requireApproval: true,
          tagFolders: [{ tagId: 't-acme', folder: 'Clients/Acme' }],
        },
        tags: [TAG],
        meetings: [MEETING],
      }),
      driveStore: createFakeDriveStore(),
    });
    const res = await store(app, tagged);
    expect(res.json().plan).toMatchObject({ folder: 'Clients/Acme', tag: 'Acme' });
  });
});

/**
 * Le cas Microsoft — OneDrive et bibliothèques SharePoint — sans compte de
 * test réel : ce que le serveur DÉCIDE quand la connexion ne ressemble pas à
 * ce que les autres tests écrivent.
 */
describe('connexion Microsoft', () => {
  /** Ce qu'Entra rend en pratique : les noms COURTS, sans le préfixe Graph. */
  const SHORT_SCOPES = ['openid', 'email', 'offline_access', 'Mail.Send', 'Files.ReadWrite'];

  it('parcourt et dépose avec les scopes courts rendus par Entra', async () => {
    const { app, driveStore } = buildTestApp({
      seed: seed({ provider: 'microsoft', scopes: SHORT_SCOPES }),
    });

    const folders = await get(app, '/api/actions/storage/folders');
    expect(folders.statusCode).toBe(200);

    const stored = await store(app);
    expect(stored.statusCode).toBe(200);
    expect(driveStore.calls).toHaveLength(1);
    expect(driveStore.calls[0].provider).toBe('microsoft');
  });

  it('navigue dans le OneDrive SANS le scope SharePoint — et dit que les sites manquent', async () => {
    // Avant : `browse_scope_missing`, fenêtre fermée, alors que Files.ReadWrite
    // suffit à parcourir le OneDrive. Le scope Sites n'ajoute que des
    // bibliothèques ; son absence tronque la liste, elle ne la ferme pas.
    const { app } = buildTestApp({
      seed: seed({ provider: 'microsoft', scopes: [GRAPH_DRIVE_SCOPE] }),
      driveBrowser: createFakeDriveBrowser({
        drives: [{ id: 'd-onedrive', name: 'OneDrive', site: '' }],
      }),
    });

    const folders = await get(app, '/api/actions/storage/folders');
    expect(folders.statusCode).toBe(200);

    const drives = await get(app, '/api/actions/storage/drives');
    expect(drives.json()).toMatchObject({ provider: 'microsoft', sharedDrivesMissing: true });
  });

  it('ne signale rien quand le scope SharePoint est là, sous sa forme courte', async () => {
    const { app } = buildTestApp({
      seed: seed({ provider: 'microsoft', scopes: [...SHORT_SCOPES, 'Sites.ReadWrite.All'] }),
    });
    const drives = await get(app, '/api/actions/storage/drives');
    expect(drives.json().sharedDrivesMissing).toBe(false);
  });

  it('ne signale rien quand l’administration ne demande pas SharePoint', async () => {
    // Le message invite à reconnecter son compte : il mentirait ici, puisque
    // la liaison suivante ne demanderait pas davantage. Rien ne MANQUE —
    // SharePoint ne fait pas partie de cette installation.
    const { app } = buildTestApp({
      seed: seed({
        provider: 'microsoft',
        scopes: SHORT_SCOPES,
        connections: { sharepoint: false },
      }),
      driveBrowser: createFakeDriveBrowser({
        drives: [{ id: 'd-onedrive', name: 'OneDrive', site: '' }],
      }),
    });
    const drives = await get(app, '/api/actions/storage/drives');
    expect(drives.statusCode).toBe(200);
    expect(drives.json().sharedDrivesMissing).toBe(false);
  });

  it('transmet la recherche au fournisseur, bibliothèque comprise', async () => {
    const { app, driveBrowser } = buildTestApp({
      seed: seed({ provider: 'microsoft', scopes: SHORT_SCOPES }),
      driveBrowser: createFakeDriveBrowser({ searchResults: ['Acme'] }),
    });
    const res = await get(app, '/api/actions/storage/folders?driveId=d-doc&search=Acme');
    expect(res.statusCode).toBe(200);
    expect(driveBrowser.calls.at(-1)).toMatchObject({
      method: 'list',
      provider: 'microsoft',
      driveId: 'd-doc',
      search: 'Acme',
    });
  });

  it('dépose dans la bibliothèque du tag avec une connexion aux scopes courts', async () => {
    const TAG = { email: USER, emailLower: USER, id: 't-acme', label: 'Acme', color: 'blue' };
    const MEETING = { email: USER, emailLower: USER, meetingId: 'm-1', tagId: 't-acme' };
    const { app, driveStore } = buildTestApp({
      seed: seed({
        provider: 'microsoft',
        scopes: SHORT_SCOPES,
        storage: {
          folder: 'CR',
          tagFolders: [
            {
              tagId: 't-acme',
              folder: 'Clients/Acme',
              driveId: 'd-acme',
              driveName: 'Acme / Documents',
            },
          ],
        },
        tags: [TAG],
        meetings: [MEETING],
      }),
    });
    const res = await store(app, { ...DOCUMENT, meetingId: 'm-1' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      provider: 'microsoft',
      folder: 'Clients/Acme',
      driveName: 'Acme / Documents',
      tag: 'Acme',
    });
    expect(driveStore.calls[0]).toMatchObject({
      provider: 'microsoft',
      folderPath: 'Clients/Acme',
      driveId: 'd-acme',
    });
  });
});
