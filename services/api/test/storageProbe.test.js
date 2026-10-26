/**
 * Sondes de destination (`probeFolderPath` chez Google et Graph, `probe` de
 * lib/connections/browse.js) — ce que lit le diagnostic de configuration.
 *
 * Trois garanties :
 *   - une sonde ne CRÉE jamais rien : le dépôt recrée un dossier manquant, le
 *     diagnostic, lui, le signale ;
 *   - « introuvable » et « bibliothèque disparue » se distinguent, et seul un
 *     404 fait conclure à une disparition — 403 et 5xx sont `unknown` ;
 *   - un accès retiré (401, invalid_grant) remonte, il vaut pour tout.
 */
import { describe, it, expect, vi } from 'vitest';
import { probeFolderPath as probeGoogle } from '../lib/connections/googleDrive.js';
import { probeFolderPath as probeGraph } from '../lib/connections/msGraph.js';
import { createDriveBrowser } from '../lib/connections/browse.js';
import { ConnectionAuthError } from '../lib/connections/errors.js';

const answer = (status, body = {}) => ({ ok: status < 300, status, json: async () => body });

/** Google factice : `folders` = `{ 'parent/nom': id }`, `drives` = statut par Drive partagé. */
function googleFetch({ folders = {}, drives = {}, status } = {}) {
  return vi.fn(async (url, options = {}) => {
    const target = String(url);
    // Le jeton se demande en POST ; tout autre POST serait une création.
    if (target.includes('oauth2.googleapis.com/token')) {
      return answer(200, { access_token: 'at-frais' });
    }
    if (options.method && options.method !== 'GET') throw new Error('une sonde ne crée rien');
    if (status) return answer(status);
    const params = new URL(target).searchParams;
    const driveId = params.get('driveId');
    if (driveId && drives[driveId]) return answer(drives[driveId]);
    const query = params.get('q');
    const name = query.match(/name = '([^']*)'/)?.[1];
    const parent = query.match(/'([^']*)' in parents/)?.[1];
    if (!name) return answer(200, { files: [] });
    const id = folders[`${parent}/${name}`];
    return answer(200, { files: id ? [{ id }] : [] });
  });
}

describe('Google — probeFolderPath', () => {
  const probe = (folderPath, fetchImpl, driveId = '') =>
    probeGoogle({ accessToken: 'at', folderPath, driveId, fetchImpl });

  it('descend le chemin segment par segment, sans rien créer', async () => {
    const fetchImpl = googleFetch({ folders: { 'root/Clients': 'c1', 'c1/Acme': 'a1' } });
    expect(await probe('Clients/Acme', fetchImpl)).toBe('found');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await probe('Clients/Beta', fetchImpl)).toBe('missing');
    expect(await probe('Archives/Acme', fetchImpl)).toBe('missing');
  });

  it('distingue un Drive partagé disparu (404) d’un dossier manquant', async () => {
    const fetchImpl = googleFetch({ drives: { 'drive-parti': 404 } });
    expect(await probe('CR', fetchImpl, 'drive-parti')).toBe('drive_missing');
    // Racine d'un Drive partagé : une requête, qui ne cherche que le Drive.
    expect(await probe('', fetchImpl, 'drive-parti')).toBe('drive_missing');
    expect(await probe('', googleFetch(), 'drive-la')).toBe('found');
  });

  it('le dossier intégré de Mon Drive : rien à chercher', async () => {
    const fetchImpl = googleFetch();
    expect(await probe('', fetchImpl)).toBe('found');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('403 et 5xx ne concluent rien ; 401 est un accès retiré', async () => {
    expect(await probe('CR', googleFetch({ status: 403 }))).toBe('unknown');
    expect(await probe('CR', googleFetch({ status: 503 }))).toBe('unknown');
    await expect(probe('CR', googleFetch({ status: 401 }))).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
  });
});

describe('Graph — probeFolderPath', () => {
  /** `paths` : statut par URL relative au drive ; tout le reste répond 200. */
  function graphFetch(paths = {}) {
    return vi.fn(async (url, options = {}) => {
      if (options.method && options.method !== 'GET') throw new Error('une sonde ne crée rien');
      const target = decodeURIComponent(String(url)).replace(
        'https://graph.microsoft.com/v1.0',
        '',
      );
      const hit = Object.entries(paths).find(([prefix]) => target.startsWith(prefix));
      return answer(hit ? hit[1] : 200, { id: 'x' });
    });
  }
  const probe = (folderPath, fetchImpl, driveId = '') =>
    probeGraph({ accessToken: 'at', folderPath, driveId, fetchImpl });

  it('un chemin trouvé ne coûte qu’une requête', async () => {
    const fetchImpl = graphFetch();
    expect(await probe('Clients/Acme', fetchImpl)).toBe('found');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('chemin absent : c’est le drive qui dit s’il manque le dossier ou la bibliothèque', async () => {
    expect(await probe('CR', graphFetch({ '/me/drive/root:/CR': 404 }))).toBe('missing');
    expect(
      await probe(
        'CR',
        graphFetch({ '/drives/site-parti/root:/CR': 404, '/drives/site-parti': 404 }),
        'site-parti',
      ),
    ).toBe('drive_missing');
    expect(await probe('', graphFetch({ '/drives/site-parti': 404 }), 'site-parti')).toBe(
      'drive_missing',
    );
  });

  it('403 est une limitation, pas une disparition ; 401 est un accès retiré', async () => {
    expect(await probe('CR', graphFetch({ '/me/drive/root:/CR': 403 }))).toBe('unknown');
    await expect(probe('CR', graphFetch({ '/me/drive/root:/CR': 401 }))).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
  });
});

describe('createDriveBrowser().probe', () => {
  const credentials = { clientId: 'id', clientSecret: 'secret' };
  const connection = { refreshToken: 'rt-123' };

  it('un seul jeton pour toutes les destinations, verdicts dans l’ordre reçu', async () => {
    const fetchImpl = googleFetch({ folders: { 'root/CR': 'cr' } });
    const verdicts = await createDriveBrowser().probe({
      provider: 'google',
      credentials,
      connection,
      targets: [
        { folder: 'CR', driveId: '' },
        { folder: 'Absent', driveId: '' },
      ],
      fetchImpl,
    });
    expect(verdicts).toEqual(['found', 'missing']);
    const tokenCalls = fetchImpl.mock.calls.filter(([url]) => String(url).includes('/token'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('un jeton refusé (invalid_grant) interrompt tout', async () => {
    const fetchImpl = vi.fn(async () => answer(400, { error: 'invalid_grant' }));
    await expect(
      createDriveBrowser().probe({
        provider: 'google',
        credentials,
        connection,
        targets: [{ folder: 'CR', driveId: '' }],
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(ConnectionAuthError);
  });
});
