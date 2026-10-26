/**
 * Client Microsoft Graph (lib/connections/msGraph.js).
 *
 * Trois points valent des tests plutôt qu'une relecture :
 *   - ce qui compte comme une révocation (purger la connexion d'un utilisateur
 *     pour un dépassement de quota lui infligerait une reconnexion pour rien) ;
 *   - le passage au brouillon quand la pièce jointe dépasse la limite de
 *     `sendMail`, sans quoi l'envoi échoue silencieusement au-delà de ~4 Mo ;
 *   - l'absence d'en-tête Authorization sur les URL de session d'envoi, que
 *     Graph refuse.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  refreshGraphAccessToken,
  sendViaGraph,
  ensureFolderPath,
  storeOnOneDrive,
  listDrives,
  listFolders,
  searchFolders,
} from '../lib/connections/msGraph.js';
import { ConnectionAuthError } from '../lib/connections/errors.js';
import { resetDiscoveryCache } from '../lib/auth/oidcClient.js';

const DISCOVERY = 'https://login.microsoftonline.test/tenant/v2.0/.well-known/openid-configuration';
const CREDENTIALS = { clientId: 'id', clientSecret: 'secret', discoveryUrl: DISCOVERY };
const MESSAGE = { to: 'user@client.fr', subject: 'CR', text: 'texte', html: '<p>html</p>' };

const discoveryResponse = {
  ok: true,
  json: async () => ({
    authorization_endpoint: 'https://login.microsoftonline.test/tenant/authorize',
    token_endpoint: 'https://login.microsoftonline.test/tenant/token',
    userinfo_endpoint: 'https://graph.microsoftonline.test/userinfo',
  }),
};

/** Graph factice : découverte + jeton toujours bons, le reste est scripté. */
function mockGraph(handler = () => null) {
  return vi.fn(async (url, options = {}) => {
    const target = String(url);
    if (target.includes('.well-known')) return discoveryResponse;
    if (target.includes('/tenant/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'at-ms' }) };
    }
    const scripted = await handler(target, options);
    if (scripted) return scripted;
    return { ok: true, status: 200, json: async () => ({ id: 'obj-1' }) };
  });
}

beforeEach(() => resetDiscoveryCache());

describe('refreshGraphAccessToken', () => {
  it('traduit les erreurs de consentement en révocation', async () => {
    for (const error of ['invalid_grant', 'interaction_required', 'consent_required']) {
      const fetchImpl = vi.fn(async (url) => {
        if (String(url).includes('.well-known')) return discoveryResponse;
        return { ok: false, status: 400, json: async () => ({ error }) };
      });
      await expect(
        refreshGraphAccessToken({ credentials: CREDENTIALS, refreshToken: 'rt', fetchImpl }),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
    }
  });

  it("ne prend pas une panne du service pour un retrait d'accès", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('.well-known')) return discoveryResponse;
      return { ok: false, status: 503, json: async () => ({ error: 'temporarily_unavailable' }) };
    });
    const err = await refreshGraphAccessToken({
      credentials: CREDENTIALS,
      refreshToken: 'rt',
      fetchImpl,
    }).catch((e) => e);

    expect(err).not.toBeInstanceOf(ConnectionAuthError);
    expect(err.message).toBe('graph_token_refresh_failed_503');
  });

  it('refuse de deviner le token endpoint sans URL de découverte', async () => {
    // Les endpoints d'Entra dépendent du tenant : les deviner enverrait les
    // identifiants au mauvais annuaire.
    await expect(
      refreshGraphAccessToken({
        credentials: { clientId: 'id', clientSecret: 'secret' },
        refreshToken: 'rt',
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow('discovery_url_missing');
  });
});

describe('sendViaGraph', () => {
  it('envoie en un appel quand il n’y a pas de pièce jointe', async () => {
    const fetchImpl = mockGraph();
    await sendViaGraph({ credentials: CREDENTIALS, refreshToken: 'rt', ...MESSAGE, fetchImpl });

    const sent = fetchImpl.mock.calls.find(([url]) => String(url).endsWith('/me/sendMail'));
    expect(sent).toBeTruthy();
    const body = JSON.parse(sent[1].body);
    expect(body.message.toRecipients[0].emailAddress.address).toBe(MESSAGE.to);
    expect(body.message.body.content).toBe(MESSAGE.html);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/me/messages'))).toBe(false);
  });

  it('joint un petit fichier directement dans sendMail', async () => {
    const fetchImpl = mockGraph();
    await sendViaGraph({
      credentials: CREDENTIALS,
      refreshToken: 'rt',
      ...MESSAGE,
      attachments: [
        { filename: 'cr.pdf', content: Buffer.from('%PDF'), contentType: 'application/pdf' },
      ],
      fetchImpl,
    });

    const sent = fetchImpl.mock.calls.find(([url]) => String(url).endsWith('/me/sendMail'));
    const attachment = JSON.parse(sent[1].body).message.attachments[0];
    expect(attachment['@odata.type']).toBe('#microsoft.graph.fileAttachment');
    expect(Buffer.from(attachment.contentBytes, 'base64').toString()).toBe('%PDF');
  });

  it('passe par un brouillon et un envoi fragmenté au-delà de la limite', async () => {
    // sendMail plafonne la requête à ~4 Mo, base64 compris : au-delà, la seule
    // voie est brouillon → session d'envoi → send.
    const gros = Buffer.alloc(4 * 1024 * 1024, 1);
    const fetchImpl = mockGraph((url) => {
      if (url.includes('createUploadSession')) {
        return { ok: true, status: 200, json: async () => ({ uploadUrl: 'https://up.test/s1' }) };
      }
      if (url.includes('up.test'))
        return { ok: true, status: 201, json: async () => ({ id: 'a' }) };
      return null;
    });

    await sendViaGraph({
      credentials: CREDENTIALS,
      refreshToken: 'rt',
      ...MESSAGE,
      attachments: [{ filename: 'gros.pdf', content: gros, contentType: 'application/pdf' }],
      fetchImpl,
    });

    const urls = fetchImpl.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.endsWith('/me/messages'))).toBe(true);
    expect(urls.some((u) => u.includes('createUploadSession'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/send'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/me/sendMail'))).toBe(false);

    // L'URL de session porte déjà son autorisation : un en-tête Authorization
    // en plus fait échouer l'envoi côté Graph.
    const chunks = fetchImpl.mock.calls.filter(([url]) => String(url).includes('up.test'));
    expect(chunks.length).toBeGreaterThan(1);
    for (const [, options] of chunks) {
      expect(options.headers.authorization).toBeUndefined();
      expect(options.headers['content-range']).toMatch(/^bytes \d+-\d+\/\d+$/);
    }
  });

  it('un 403 (quota) ne compte pas comme une révocation', async () => {
    const fetchImpl = mockGraph((url) =>
      url.endsWith('/me/sendMail') ? { ok: false, status: 403, json: async () => ({}) } : null,
    );
    const err = await sendViaGraph({
      credentials: CREDENTIALS,
      refreshToken: 'rt',
      ...MESSAGE,
      fetchImpl,
    }).catch((e) => e);

    expect(err).not.toBeInstanceOf(ConnectionAuthError);
    expect(err.message).toBe('graph_send_mail_failed_403');
  });

  it('un 401 compte comme une révocation', async () => {
    const fetchImpl = mockGraph((url) =>
      url.endsWith('/me/sendMail') ? { ok: false, status: 401, json: async () => ({}) } : null,
    );
    await expect(
      sendViaGraph({ credentials: CREDENTIALS, refreshToken: 'rt', ...MESSAGE, fetchImpl }),
    ).rejects.toBeInstanceOf(ConnectionAuthError);
  });
});

describe('ensureFolderPath', () => {
  it('retrouve un chemin existant en une seule requête', async () => {
    // `Files.ReadWrite` voit TOUT le drive, contrairement au `drive.file` de
    // Google : un dossier créé par l'utilisateur est retrouvé, pas dupliqué.
    const fetchImpl = mockGraph((url) =>
      url.includes('/me/drive/root:/CR/2026')
        ? { ok: true, status: 200, json: async () => ({ id: 'id-existant' }) }
        : null,
    );
    const id = await ensureFolderPath({ accessToken: 'at', folderPath: 'CR/2026', fetchImpl });

    expect(id).toBe('id-existant');
    expect(fetchImpl.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(0);
  });

  it('crée les segments manquants un par un', async () => {
    const created = [];
    const fetchImpl = mockGraph((url, options) => {
      if (options?.method === 'POST' && url.includes('children')) {
        created.push(JSON.parse(options.body).name);
        return { ok: true, status: 201, json: async () => ({ id: `id-${created.length}` }) };
      }
      if (url.includes('/me/drive/root:/'))
        return { ok: false, status: 404, json: async () => ({}) };
      return null;
    });

    await ensureFolderPath({ accessToken: 'at', folderPath: 'CR/2026', fetchImpl });
    expect(created).toEqual(['CR', '2026']);
  });

  it('retombe sur un dossier nommé quand aucun chemin n’est configuré', async () => {
    const created = [];
    const fetchImpl = mockGraph((url, options) => {
      if (options?.method === 'POST' && url.includes('children')) {
        created.push(JSON.parse(options.body).name);
        return { ok: true, status: 201, json: async () => ({ id: 'id-1' }) };
      }
      if (url.includes('/me/drive/root:/'))
        return { ok: false, status: 404, json: async () => ({}) };
      return null;
    });

    await ensureFolderPath({ accessToken: 'at', folderPath: '', fetchImpl });
    expect(created).toEqual(['myBrief']);
  });
});

describe('storeOnOneDrive', () => {
  const FILE = {
    filename: 'cr.pdf',
    content: Buffer.from('%PDF-1.4'),
    contentType: 'application/pdf',
  };

  it('ouvre une session puis pousse le contenu', async () => {
    const fetchImpl = mockGraph((url) => {
      if (url.includes('createUploadSession')) {
        return { ok: true, status: 200, json: async () => ({ uploadUrl: 'https://up.test/s1' }) };
      }
      if (url.includes('up.test')) {
        return { ok: true, status: 201, json: async () => ({ id: 'file-42' }) };
      }
      if (url.includes('/me/drive/root:/CR')) {
        return { ok: true, status: 200, json: async () => ({ id: 'id-CR' }) };
      }
      return null;
    });

    const res = await storeOnOneDrive({
      credentials: CREDENTIALS,
      connection: { refreshToken: 'rt', drive: null },
      folderPath: 'CR',
      file: FILE,
      fetchImpl,
    });

    expect(res).toMatchObject({ fileId: 'file-42', folderId: 'id-CR', cacheUsed: false });
    // `rename` : deux comptes rendus du même jour ne doivent pas s'écraser.
    const session = fetchImpl.mock.calls.find(([url]) =>
      String(url).includes('createUploadSession'),
    );
    expect(JSON.parse(session[1].body).item['@microsoft.graph.conflictBehavior']).toBe('rename');
  });

  it('réutilise le dossier mémorisé', async () => {
    const fetchImpl = mockGraph((url) => {
      if (url.includes('createUploadSession')) {
        return { ok: true, status: 200, json: async () => ({ uploadUrl: 'https://up.test/s1' }) };
      }
      if (url.includes('up.test')) {
        return { ok: true, status: 201, json: async () => ({ id: 'file-42' }) };
      }
      return null;
    });

    const res = await storeOnOneDrive({
      credentials: CREDENTIALS,
      connection: { refreshToken: 'rt', drive: { folderPath: 'CR', folderId: 'id-connu' } },
      folderPath: 'CR',
      file: FILE,
      fetchImpl,
    });

    expect(res.cacheUsed).toBe(true);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('root:/CR'))).toBe(false);
  });

  it('refait la résolution quand le dossier mémorisé a disparu', async () => {
    let premiere = true;
    const fetchImpl = mockGraph((url) => {
      if (url.includes('createUploadSession')) {
        if (premiere) {
          premiere = false;
          return { ok: false, status: 404, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({ uploadUrl: 'https://up.test/s1' }) };
      }
      if (url.includes('up.test')) {
        return { ok: true, status: 201, json: async () => ({ id: 'file-42' }) };
      }
      if (url.includes('/me/drive/root:/CR')) {
        return { ok: true, status: 200, json: async () => ({ id: 'id-recree' }) };
      }
      return null;
    });

    const res = await storeOnOneDrive({
      credentials: CREDENTIALS,
      connection: { refreshToken: 'rt', drive: { folderPath: 'CR', folderId: 'id-disparu' } },
      folderPath: 'CR',
      file: FILE,
      fetchImpl,
    });

    expect(res.fileId).toBe('file-42');
    expect(res.folderId).toBe('id-recree');
  });
});

describe('navigation SharePoint', () => {
  it('rend le OneDrive puis les bibliothèques des sites suivis', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.includes('/me/drive?')) {
        return { ok: true, status: 200, json: async () => ({ id: 'd-me', name: 'OneDrive' }) };
      }
      if (target.includes('/me/followedSites')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ value: [{ id: 'site-1', displayName: 'Marketing' }] }),
        };
      }
      if (target.includes('/sites/site-1/drives')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ value: [{ id: 'd-doc', name: 'Documents' }] }),
        };
      }
      throw new Error(`URL inattendue: ${target}`);
    });

    const drives = await listDrives({ accessToken: 'at', fetchImpl });
    expect(drives).toEqual([
      { id: 'd-me', name: 'OneDrive', site: '' },
      { id: 'd-doc', name: 'Documents', site: 'Marketing' },
    ]);
  });

  it('rend le seul OneDrive quand le scope SharePoint manque', async () => {
    // Sans Sites.ReadWrite.All, Graph refuse followedSites : la navigation doit
    // rester utilisable, pas échouer.
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.includes('/me/drive?')) {
        return { ok: true, status: 200, json: async () => ({ id: 'd-me', name: 'OneDrive' }) };
      }
      return { ok: false, status: 403, json: async () => ({}) };
    });

    const drives = await listDrives({ accessToken: 'at', fetchImpl });
    expect(drives).toHaveLength(1);
  });

  it('ne fait pas disparaître les autres sites quand l’un d’eux est fermé', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const target = String(url);
      if (target.includes('/me/drive?')) {
        return { ok: true, status: 200, json: async () => ({ id: 'd-me', name: 'OneDrive' }) };
      }
      if (target.includes('/me/followedSites')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            value: [
              { id: 'ferme', displayName: 'Direction' },
              { id: 'ouvert', displayName: 'Marketing' },
            ],
          }),
        };
      }
      if (target.includes('/sites/ferme/drives')) {
        return { ok: false, status: 403, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ value: [{ id: 'd-doc', name: 'Documents' }] }),
      };
    });

    const drives = await listDrives({ accessToken: 'at', fetchImpl });
    expect(drives.map((d) => d.name)).toEqual(['OneDrive', 'Documents']);
  });

  it('adresse la bibliothèque choisie, et non /me/drive', async () => {
    const seen = [];
    const fetchImpl = vi.fn(async (url) => {
      seen.push(String(url));
      return { ok: true, status: 200, json: async () => ({ value: [] }) };
    });

    await listFolders({ accessToken: 'at', driveId: 'd-doc', folderPath: 'CR', fetchImpl });
    expect(seen[0]).toContain('/drives/d-doc/root:/CR:/children');
    expect(seen[0]).not.toContain('/me/drive');
  });

  it('ne renvoie que les dossiers, jamais les fichiers', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        value: [
          { id: '1', name: 'Acme', folder: { childCount: 0 } },
          { id: '2', name: 'note.docx' },
        ],
      }),
    }));

    const { folders } = await listFolders({ accessToken: 'at', fetchImpl });
    expect(folders).toEqual([{ name: 'Acme' }]);
  });
});

describe('dépôt dans une bibliothèque SharePoint', () => {
  it('ouvre la session d’envoi sur la bibliothèque visée', async () => {
    const seen = [];
    const fetchImpl = mockGraph(async (target) => {
      seen.push(target);
      if (target.includes('createUploadSession')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ uploadUrl: 'https://upload.test/session' }),
        };
      }
      if (target.startsWith('https://upload.test/')) {
        return { ok: true, status: 201, json: async () => ({ id: 'file-1' }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 'folder-1' }) };
    });

    const res = await storeOnOneDrive({
      credentials: CREDENTIALS,
      connection: { refreshToken: 'rt', drive: null },
      folderPath: 'CR',
      driveId: 'd-doc',
      file: { filename: 'cr.pdf', content: Buffer.from('x'), contentType: 'application/pdf' },
      fetchImpl,
    });

    expect(res).toMatchObject({ fileId: 'file-1', driveId: 'd-doc' });
    expect(seen.some((url) => url.includes('/drives/d-doc/'))).toBe(true);
    expect(seen.some((url) => url.includes('/me/drive/'))).toBe(false);
  });

  it('ignore un dossier mémorisé pour une AUTRE bibliothèque', async () => {
    // Le même chemin « CR » désigne deux dossiers différents dans deux
    // bibliothèques : réutiliser l'identifiant de l'une déposerait au mauvais
    // endroit, en silence.
    const seen = [];
    const fetchImpl = mockGraph(async (target) => {
      seen.push(target);
      if (target.includes('createUploadSession')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ uploadUrl: 'https://upload.test/session' }),
        };
      }
      if (target.startsWith('https://upload.test/')) {
        return { ok: true, status: 201, json: async () => ({ id: 'file-1' }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 'folder-neuf' }) };
    });

    const res = await storeOnOneDrive({
      credentials: CREDENTIALS,
      connection: {
        refreshToken: 'rt',
        drive: { folderPath: 'CR', folderId: 'id-autre-bibliotheque', driveId: 'd-ancienne' },
      },
      folderPath: 'CR',
      driveId: 'd-doc',
      file: { filename: 'cr.pdf', content: Buffer.from('x'), contentType: 'application/pdf' },
      fetchImpl,
    });

    expect(res.cacheUsed).toBe(false);
    expect(seen.some((url) => url.includes('/drives/d-doc/root:/CR'))).toBe(true);
  });
});

describe('recherche de dossiers', () => {
  const okJson = (value) => ({ ok: true, status: 200, json: async () => value });

  it('interroge search(q=…) sur le drive visé, apostrophe doublée', async () => {
    const seen = [];
    const fetchImpl = vi.fn(async (url) => {
      seen.push(String(url));
      return okJson({ value: [] });
    });

    await searchFolders({ accessToken: 'at', driveId: 'd-doc', term: "l'Acme", fetchImpl });
    expect(seen[0]).toContain("/drives/d-doc/root/search(q='l''Acme')");
    expect(seen[0]).toContain('$select=id,name,folder,parentReference');
  });

  it('rend le chemin du parent de chaque dossier, jamais les fichiers', async () => {
    const fetchImpl = vi.fn(async () =>
      okJson({
        value: [
          {
            id: '1',
            name: 'Acme',
            folder: { childCount: 2 },
            parentReference: { path: '/drive/root:/Clients' },
          },
          {
            id: '2',
            name: 'Acme',
            folder: {},
            // Enfant direct de la racine : Graph ne met rien derrière `root:`.
            parentReference: { path: '/drive/root:' },
          },
          {
            id: '3',
            name: 'Acme.docx',
            file: {},
            parentReference: { path: '/drive/root:/Clients' },
          },
          {
            id: '4',
            name: 'Acme',
            folder: {},
            // Bibliothèque SharePoint, segments percent-encodés selon le tenant.
            parentReference: { path: '/drives/d-doc/root:/Comptes%20rendus/2026' },
          },
        ],
      }),
    );

    const { folders } = await searchFolders({ accessToken: 'at', term: 'Acme', fetchImpl });
    expect(folders).toEqual([
      { name: 'Acme', parentPath: 'Clients' },
      { name: 'Acme', parentPath: '' },
      { name: 'Acme', parentPath: 'Comptes rendus/2026' },
    ]);
  });

  it('suit une page suivante de Graph', async () => {
    const seen = [];
    const fetchImpl = vi.fn(async (url) => {
      seen.push(String(url));
      return okJson({ value: [], '@odata.nextLink': '' });
    });
    const next = 'https://graph.microsoft.com/v1.0/me/drive/root/search(q=%27a%27)?$skiptoken=x';

    await searchFolders({ accessToken: 'at', term: 'a', pageToken: next, fetchImpl });
    await listFolders({ accessToken: 'at', pageToken: next, fetchImpl });
    expect(seen).toEqual([next, next]);
  });

  it('refuse de suivre un jeton de page qui n’est pas une URL de Graph', async () => {
    // Le jeton de pagination est une URL rendue par le client : la suivre sans
    // vérifier enverrait le jeton d'accès de l'utilisateur à l'hôte de son choix.
    const fetchImpl = vi.fn(async () => okJson({ value: [] }));
    const forged = 'https://attacker.example/steal?x=1';

    await expect(listFolders({ accessToken: 'at', pageToken: forged, fetchImpl })).rejects.toThrow(
      'graph_page_token_invalid',
    );
    await expect(
      searchFolders({ accessToken: 'at', term: 'a', pageToken: forged, fetchImpl }),
    ).rejects.toThrow('graph_page_token_invalid');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('un 401 en recherche compte comme une révocation', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(searchFolders({ accessToken: 'at', term: 'a', fetchImpl })).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
  });
});
