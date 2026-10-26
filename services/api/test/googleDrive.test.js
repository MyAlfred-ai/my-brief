/**
 * Client Google Drive (lib/connections/googleDrive.js).
 *
 * Deux points méritent des tests plutôt qu'une relecture : la marche par
 * segments (chaque dossier du chemin doit être cherché AVANT d'être créé, sans
 * quoi chaque dépôt empilerait des homonymes), et le cache de dossier, qui doit
 * accélérer le cas courant sans jamais faire échouer le cas où l'utilisateur a
 * supprimé le dossier entre deux dépôts.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  folderSegments,
  ensureFolderPath,
  storeOnDrive,
  listFolders,
  listSharedDrives,
  folderPathSegments,
  ensureChildFolder,
  DEFAULT_FOLDER,
} from '../lib/connections/googleDrive.js';
import { ConnectionAuthError } from '../lib/connections/errors.js';

const CREDENTIALS = { clientId: 'id', clientSecret: 'secret' };
const CONNECTION = { refreshToken: 'rt-123', drive: null };
const FILE = {
  filename: '2026-08-08-point.pdf',
  content: Buffer.from('%PDF-1.4'),
  contentType: 'application/pdf',
};

/**
 * Google factice. `existing` liste les dossiers déjà créés PAR L'APPLICATION,
 * seuls visibles avec le scope `drive.file`.
 */
function mockDrive({ existing = {}, uploadStatus = 200 } = {}) {
  const created = [];
  const impl = vi.fn(async (url, options = {}) => {
    const target = String(url);

    if (target.includes('oauth2.googleapis.com/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'at-frais' }) };
    }

    // Recherche d'un dossier : `q` porte le nom et le parent. `+` remis en
    // espace — c'est ainsi qu'URLSearchParams sérialise, et Google le relit
    // comme un espace (même normalisation que `readableQuery` plus bas).
    if (target.includes('/drive/v3/files?q=')) {
      const query = decodeURIComponent(target).replace(/\+/g, ' ');
      const name = query.match(/name = '([^']*)'/)?.[1];
      const parent = query.match(/'([^']*)' in parents/)?.[1];
      const id = existing[`${parent}/${name}`];
      return { ok: true, status: 200, json: async () => ({ files: id ? [{ id }] : [] }) };
    }

    if (target.includes('/drive/v3/files?fields=id')) {
      const body = JSON.parse(options.body);
      created.push(body);
      const id = `id-${body.name}`;
      existing[`${body.parents[0]}/${body.name}`] = id;
      return { ok: true, status: 200, json: async () => ({ id }) };
    }

    if (target.includes('/upload/drive/v3/files')) {
      return {
        ok: true,
        status: 200,
        headers: { get: (h) => (h === 'location' ? 'https://upload.google.test/session-1' : null) },
        json: async () => ({}),
      };
    }

    if (target.includes('upload.google.test')) {
      return {
        ok: uploadStatus === 200,
        status: uploadStatus,
        json: async () => ({ id: 'file-42', name: FILE.filename }),
      };
    }

    throw new Error(`URL inattendue: ${target}`);
  });
  impl.created = created;
  return impl;
}

describe('folderSegments', () => {
  it('découpe un chemin et ignore les segments vides', () => {
    expect(folderSegments('CR/2026//Client ')).toEqual(['CR', '2026', 'Client']);
  });

  it('retombe sur un dossier nommé plutôt que sur la racine du Drive', () => {
    // Déposer à la racine mêlerait les comptes rendus à tout le Drive de
    // l'utilisateur, sans moyen simple de revenir en arrière.
    expect(folderSegments('')).toEqual([DEFAULT_FOLDER]);
    expect(folderSegments('   ')).toEqual([DEFAULT_FOLDER]);
    expect(folderSegments(undefined)).toEqual([DEFAULT_FOLDER]);
  });
});

describe('ensureFolderPath', () => {
  it('crée chaque segment manquant sous son parent', async () => {
    const fetchImpl = mockDrive();
    const id = await ensureFolderPath({ accessToken: 'at', folderPath: 'CR/2026', fetchImpl });

    expect(id).toBe('id-2026');
    expect(fetchImpl.created).toEqual([
      { name: 'CR', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] },
      { name: '2026', mimeType: 'application/vnd.google-apps.folder', parents: ['id-CR'] },
    ]);
  });

  it('réutilise les dossiers déjà créés au lieu de les dupliquer', async () => {
    const fetchImpl = mockDrive({ existing: { 'root/CR': 'id-CR-existant' } });
    const id = await ensureFolderPath({ accessToken: 'at', folderPath: 'CR/2026', fetchImpl });

    expect(id).toBe('id-2026');
    // Seul le segment manquant est créé.
    expect(fetchImpl.created).toHaveLength(1);
    expect(fetchImpl.created[0].parents).toEqual(['id-CR-existant']);
  });

  it('traduit un 401 en révocation, pas en panne', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(
      ensureFolderPath({ accessToken: 'at', folderPath: 'CR', fetchImpl }),
    ).rejects.toBeInstanceOf(ConnectionAuthError);
  });
});

describe('storeOnDrive', () => {
  it('résout le dossier puis pousse les octets', async () => {
    const fetchImpl = mockDrive();
    const res = await storeOnDrive({
      credentials: CREDENTIALS,
      connection: CONNECTION,
      folderPath: 'CR',
      file: FILE,
      fetchImpl,
    });

    expect(res).toMatchObject({ fileId: 'file-42', folderId: 'id-CR', folderPath: 'CR' });
    expect(res.cacheUsed).toBe(false);

    // L'URL de session porte déjà l'autorisation : envoyer un en-tête
    // Authorization en plus fait échouer l'upload chez Google.
    const put = fetchImpl.mock.calls.find(([url]) => String(url).includes('upload.google.test'));
    expect(put[1].headers.authorization).toBeUndefined();
    expect(put[1].method).toBe('PUT');
  });

  it('réutilise le dossier mémorisé sans le rechercher', async () => {
    const fetchImpl = mockDrive();
    const res = await storeOnDrive({
      credentials: CREDENTIALS,
      connection: { ...CONNECTION, drive: { folderPath: 'CR', folderId: 'id-connu' } },
      folderPath: 'CR',
      file: FILE,
      fetchImpl,
    });

    expect(res.cacheUsed).toBe(true);
    expect(res.folderId).toBe('id-connu');
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('files?q='))).toBe(false);
  });

  it('ignore un cache portant sur un AUTRE chemin', async () => {
    // L'administrateur a changé le dossier cible : le dossier mémorisé n'est
    // plus celui voulu.
    const fetchImpl = mockDrive();
    const res = await storeOnDrive({
      credentials: CREDENTIALS,
      connection: { ...CONNECTION, drive: { folderPath: 'Ancien', folderId: 'id-ancien' } },
      folderPath: 'CR',
      file: FILE,
      fetchImpl,
    });

    expect(res.folderId).toBe('id-CR');
    expect(res.cacheUsed).toBe(false);
  });

  it('refait la résolution quand le dossier mémorisé a disparu', async () => {
    // Cas réel : l'utilisateur met le dossier à la corbeille entre deux dépôts.
    // Rejouer est sans risque — l'échec précède la création du fichier.
    let premierUpload = true;
    const base = mockDrive();
    const fetchImpl = vi.fn(async (url, options) => {
      if (String(url).includes('/upload/drive/v3/files') && premierUpload) {
        premierUpload = false;
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return base(url, options);
    });

    const res = await storeOnDrive({
      credentials: CREDENTIALS,
      connection: { ...CONNECTION, drive: { folderPath: 'CR', folderId: 'id-disparu' } },
      folderPath: 'CR',
      file: FILE,
      fetchImpl,
    });

    expect(res.fileId).toBe('file-42');
    expect(res.folderId).toBe('id-CR');
  });

  it("ne rejoue pas quand aucun dossier n'était mémorisé", async () => {
    // Sans cache, un 404 ne s'explique pas par un dossier périmé : le rejouer
    // masquerait la vraie cause.
    const base = mockDrive();
    const fetchImpl = vi.fn(async (url, options) => {
      if (String(url).includes('/upload/drive/v3/files')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return base(url, options);
    });

    await expect(
      storeOnDrive({
        credentials: CREDENTIALS,
        connection: CONNECTION,
        folderPath: 'CR',
        file: FILE,
        fetchImpl,
      }),
    ).rejects.toThrow(/upload_session_failed_404/);
  });

  it('remonte une révocation du rafraîchissement telle quelle', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    }));
    await expect(
      storeOnDrive({
        credentials: CREDENTIALS,
        connection: CONNECTION,
        folderPath: 'CR',
        file: FILE,
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(ConnectionAuthError);
  });
});

describe('navigation (scope drive.metadata.readonly)', () => {
  /**
   * URLSearchParams encode l'espace en « + » : sans cette normalisation, les
   * assertions porteraient sur la sérialisation plutôt que sur la requête `q`
   * réellement envoyée à Drive.
   */
  const readableQuery = (url) => decodeURIComponent(String(url)).replace(/\+/g, ' ');

  it('ne liste que des dossiers, jamais des fichiers', async () => {
    let seen = '';
    const fetchImpl = vi.fn(async (url) => {
      seen = readableQuery(url);
      return { ok: true, status: 200, json: async () => ({ files: [{ id: 'f1', name: 'Acme' }] }) };
    });

    const { folders } = await listFolders({ accessToken: 'at', parentId: 'root', fetchImpl });
    expect(folders).toEqual([{ id: 'f1', name: 'Acme' }]);
    expect(seen).toContain("mimeType = 'application/vnd.google-apps.folder'");
    expect(seen).toContain("'root' in parents");
    expect(seen).toContain('trashed = false');
  });

  it('une recherche porte sur tout le Drive, pas sur le dossier courant', async () => {
    // Chercher dans le seul dossier ouvert n'aiderait personne à retrouver un
    // dossier enfoui — c'est précisément pour ça qu'on cherche.
    let seen = '';
    const fetchImpl = vi.fn(async (url) => {
      seen = readableQuery(url);
      return { ok: true, status: 200, json: async () => ({ files: [] }) };
    });

    await listFolders({ accessToken: 'at', parentId: 'F-CR', search: 'Acme', fetchImpl });
    expect(seen).toContain("name contains 'Acme'");
    expect(seen).not.toContain("'F-CR' in parents");
  });

  it('échappe une apostrophe dans le terme cherché', async () => {
    let seen = '';
    const fetchImpl = vi.fn(async (url) => {
      seen = readableQuery(url);
      return { ok: true, status: 200, json: async () => ({ files: [] }) };
    });

    await listFolders({ accessToken: 'at', search: "L'Acme", fetchImpl });
    expect(seen).toContain("name contains 'L\\'Acme'");
  });

  it('remonte le chemin d’un dossier jusqu’à la racine', async () => {
    const tree = {
      'f-acme': { id: 'f-acme', name: 'Acme', parents: ['f-clients'] },
      'f-clients': { id: 'f-clients', name: 'Clients', parents: ['root'] },
    };
    const fetchImpl = vi.fn(async (url) => {
      const id = String(url).match(/files\/([^?]+)/)?.[1];
      return { ok: true, status: 200, json: async () => tree[id] };
    });

    const segments = await folderPathSegments({ accessToken: 'at', folderId: 'f-acme', fetchImpl });
    expect(segments).toEqual(['Clients', 'Acme']);
  });

  it('rend le chemin partiel plutôt que d’échouer sur un parent devenu invisible', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('f-acme')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'f-acme', name: 'Acme', parents: ['disparu'] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const segments = await folderPathSegments({ accessToken: 'at', folderId: 'f-acme', fetchImpl });
    expect(segments).toEqual(['Acme']);
  });

  it('une révocation pendant la remontée remonte, elle', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(
      folderPathSegments({ accessToken: 'at', folderId: 'f-acme', fetchImpl }),
    ).rejects.toBeInstanceOf(ConnectionAuthError);
  });

  it('ne recrée pas un dossier qui existe déjà sous ce parent', async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (options.method === 'POST') throw new Error('création inattendue');
      return {
        ok: true,
        status: 200,
        json: async () => ({ files: [{ id: 'f-acme', name: 'Acme' }] }),
      };
    });

    const folder = await ensureChildFolder({
      accessToken: 'at',
      parentId: 'root',
      name: 'Acme',
      fetchImpl,
    });
    expect(folder).toMatchObject({ id: 'f-acme', created: false });
  });

  it('crée le dossier absent et le signale comme neuf', async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (options.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ id: 'f-neuf', name: 'Neuf' }) };
      }
      return { ok: true, status: 200, json: async () => ({ files: [] }) };
    });

    const folder = await ensureChildFolder({
      accessToken: 'at',
      parentId: 'root',
      name: 'Neuf',
      fetchImpl,
    });
    expect(folder).toMatchObject({ id: 'f-neuf', created: true });
  });
});

/**
 * Drive PARTAGÉS — pas les dossiers partagés : les espaces d'équipe, dont
 * l'identifiant est aussi celui de leur dossier racine.
 *
 * Ce que ces tests verrouillent tient en une phrase : une requête qui oublie
 * `supportsAllDrives` répond comme avant leur existence, donc ne trouve JAMAIS
 * un dossier qui s'y trouve — et en recrée un homonyme dans Mon Drive à chaque
 * dépôt, sans que rien ne le signale.
 */
describe('Drive partagés', () => {
  const readableQuery = (url) => decodeURIComponent(String(url)).replace(/\+/g, ' ');

  it('n’offre que les Drive où l’utilisateur peut déposer', async () => {
    // Un Drive en lecture seule proposé est un choix dont on sait qu'il
    // échouera au premier dépôt, des jours plus tard.
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        drives: [
          { id: 'd-equipe', name: 'Équipe', capabilities: { canAddChildren: true } },
          { id: 'd-lecture', name: 'Archives', capabilities: { canAddChildren: false } },
        ],
      }),
    }));

    const drives = await listSharedDrives({ accessToken: 'at', fetchImpl });
    expect(drives).toEqual([{ id: 'd-equipe', name: 'Équipe', site: '' }]);
  });

  it('parcourt les pages tant que Google en annonce', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () =>
          call === 1
            ? {
                drives: [{ id: 'd-1', name: 'Un', capabilities: { canAddChildren: true } }],
                nextPageToken: 'p2',
              }
            : { drives: [{ id: 'd-2', name: 'Deux', capabilities: { canAddChildren: true } }] },
      };
    });

    const drives = await listSharedDrives({ accessToken: 'at', fetchImpl });
    expect(drives.map((d) => d.id)).toEqual(['d-1', 'd-2']);
    expect(readableQuery(fetchImpl.mock.calls[1][0])).toContain('pageToken=p2');
  });

  it('traduit un 401 en révocation, pas en panne', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(listSharedDrives({ accessToken: 'at', fetchImpl })).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
  });

  it('liste la racine d’un Drive partagé en le prenant pour parent', async () => {
    let seen = '';
    const fetchImpl = vi.fn(async (url) => {
      seen = readableQuery(url);
      return { ok: true, status: 200, json: async () => ({ files: [] }) };
    });

    await listFolders({ accessToken: 'at', driveId: 'd-equipe', fetchImpl });
    // L'id du Drive EST celui de son dossier racine : rien de spécial à faire
    // pour descendre, sinon le désigner comme parent.
    expect(seen).toContain("'d-equipe' in parents");
    expect(seen).toContain('corpora=drive');
    expect(seen).toContain('driveId=d-equipe');
    expect(seen).toContain('supportsAllDrives=true');
  });

  it('borne la recherche au Drive partagé ouvert', async () => {
    // Sans `corpora=drive`, chercher « Comptes rendus » ramènerait aussi les
    // homonymes de Mon Drive, indistinguables dans la liste des résultats.
    let seen = '';
    const fetchImpl = vi.fn(async (url) => {
      seen = readableQuery(url);
      return { ok: true, status: 200, json: async () => ({ files: [] }) };
    });

    await listFolders({ accessToken: 'at', driveId: 'd-equipe', search: 'CR', fetchImpl });
    expect(seen).toContain("name contains 'CR'");
    expect(seen).toContain('corpora=drive');
  });

  it('arrête la remontée du chemin à la racine du Drive partagé', async () => {
    // Le nom du Drive n'appartient pas au chemin : il est déjà porté par la
    // bibliothèque choisie, comme une bibliothèque SharePoint côté Microsoft.
    const tree = {
      'f-acme': { id: 'f-acme', name: 'Acme', parents: ['f-clients'] },
      'f-clients': { id: 'f-clients', name: 'Clients', parents: ['d-equipe'] },
      'd-equipe': { id: 'd-equipe', name: 'Équipe', parents: [] },
    };
    const fetchImpl = vi.fn(async (url) => {
      const id = String(url).match(/files\/([^?]+)/)?.[1];
      return { ok: true, status: 200, json: async () => tree[id] };
    });

    const segments = await folderPathSegments({
      accessToken: 'at',
      folderId: 'f-acme',
      driveId: 'd-equipe',
      fetchImpl,
    });
    expect(segments).toEqual(['Clients', 'Acme']);
  });

  it('crée le chemin sous la racine du Drive partagé, pas sous Mon Drive', async () => {
    const fetchImpl = mockDrive();
    const id = await ensureFolderPath({
      accessToken: 'at',
      folderPath: 'CR',
      driveId: 'd-equipe',
      fetchImpl,
    });

    expect(id).toBe('id-CR');
    expect(fetchImpl.created[0].parents).toEqual(['d-equipe']);
    const lookup = fetchImpl.mock.calls.find(([url]) => String(url).includes('files?q='));
    expect(readableQuery(lookup[0])).toContain('supportsAllDrives=true');
  });

  it('dépose dans le Drive partagé et le rend avec le résultat', async () => {
    const fetchImpl = mockDrive();
    const res = await storeOnDrive({
      credentials: CREDENTIALS,
      connection: CONNECTION,
      folderPath: 'CR',
      driveId: 'd-equipe',
      file: FILE,
      fetchImpl,
    });

    expect(res).toMatchObject({ fileId: 'file-42', folderPath: 'CR', driveId: 'd-equipe' });
    const session = fetchImpl.mock.calls.find(([url]) =>
      String(url).includes('/upload/drive/v3/files'),
    );
    expect(String(session[0])).toContain('supportsAllDrives=true');
  });

  it('ignore un cache portant sur le même chemin dans un AUTRE Drive', async () => {
    // « Comptes rendus » existe dans les deux : réutiliser l'id de l'un
    // déposerait dans l'autre, sans que rien ne le signale.
    const fetchImpl = mockDrive();
    const res = await storeOnDrive({
      credentials: CREDENTIALS,
      connection: {
        ...CONNECTION,
        drive: { folderPath: 'CR', folderId: 'id-mon-drive', driveId: '' },
      },
      folderPath: 'CR',
      driveId: 'd-equipe',
      file: FILE,
      fetchImpl,
    });

    expect(res.cacheUsed).toBe(false);
    expect(res.folderId).not.toBe('id-mon-drive');
    expect(fetchImpl.created[0].parents).toEqual(['d-equipe']);
  });
});
