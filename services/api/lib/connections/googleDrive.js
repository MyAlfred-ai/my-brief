/**
 * Dépôt d'un document sur le Google Drive de l'utilisateur.
 *
 * Pas de SDK googleapis : trois appels REST suffisent (résoudre le dossier,
 * ouvrir une session d'upload, pousser les octets), et le SDK pèse plus que
 * tout le reste de l'API.
 *
 * ── Ce que `drive.file` voit, et ce qu'il ne voit pas ───────────────────────
 * Le scope demandé est `drive.file` : myBrief n'a accès QU'AUX fichiers et
 * dossiers qu'il a lui-même créés. C'est le scope minimal permettant de
 * déposer, et le seul qui n'impose pas à chaque installation la procédure de
 * vérification lourde de Google.
 *
 * Sa contrepartie est visible pour l'utilisateur : si son Drive contient déjà
 * un dossier « Comptes rendus » qu'il a créé lui-même, myBrief ne le voit pas
 * et en crée un homonyme (Drive autorise les doublons de nom). Le dossier de
 * dépôt canonique est donc celui créé par l'application. C'est dit dans l'aide
 * de l'administration, pour que personne ne cherche ses fichiers dans l'autre.
 */
import { ConnectionAuthError } from './errors.js';
import { refreshGoogleAccessToken } from './googleTokens.js';

const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVES_ENDPOINT = 'https://www.googleapis.com/drive/v3/drives';
const UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Dossier de dépôt quand l'administration n'en a pas nommé un. */
export const DEFAULT_FOLDER = 'myBrief';

/**
 * Segments d'un chemin saisi par l'administrateur (« CR/2026 »).
 * Un chemin vide donne le dossier par défaut : jamais la racine du Drive, où
 * les dépôts se mêleraient à tout le reste sans être réversibles.
 */
export function folderSegments(folderPath) {
  const segments = String(folderPath || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length ? segments : [DEFAULT_FOLDER];
}

/** Toute réponse d'API : 401 = accès retiré, le reste est transitoire. */
async function ensureOk(res, action) {
  if (res.ok) return res;
  if (res.status === 401) {
    throw new ConnectionAuthError('google_auth_revoked', { provider: 'google' });
  }
  throw new Error(`google_drive_${action}_failed_${res.status}`);
}

/** Échappe une valeur insérée dans une requête `q` de l'API Drive. */
function escapeQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Paramètres qui font qu'une requête `files.*` VOIT les Drive partagés.
 *
 * Sans `supportsAllDrives`, l'API répond comme avant leur existence : un
 * dossier de Drive partagé est introuvable et un dépôt dedans échoue. Avec un
 * `driveId`, `corpora=drive` restreint en plus la recherche à CE Drive — sinon
 * chercher « Comptes rendus » depuis un Drive partagé ramènerait aussi les
 * homonymes de Mon Drive, qu'on ne saurait pas distinguer dans la liste.
 *
 * @param {string} driveId - '' = Mon Drive
 */
function allDrivesParams(driveId = '') {
  const params = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' };
  if (driveId) return { ...params, corpora: 'drive', driveId };
  return params;
}

/**
 * Racine à laquelle commencer : celle du Drive partagé, ou « Mon Drive ».
 *
 * Chez Google l'identifiant d'un Drive partagé EST celui de son dossier racine,
 * ce qui rend la descente identique dans les deux cas.
 */
function driveRoot(driveId = '') {
  return driveId || 'root';
}

/**
 * Drive partagés où l'utilisateur peut DÉPOSER.
 *
 * Exige `drive.readonly` (cf. lib/connections/providers.js) : `drives.list` est
 * la seule API qui les énumère, et Google ne l'ouvre pas à
 * `drive.metadata.readonly`. Une connexion sans ce scope n'appelle jamais cette
 * fonction — la fenêtre lui montre « Mon Drive » seul.
 *
 * Les Drive en LECTURE SEULE sont retirés (`capabilities.canAddChildren`) : les
 * proposer reviendrait à offrir un choix dont on sait qu'il échouera au premier
 * dépôt, des jours plus tard, loin du geste qui l'a causé.
 *
 * @returns {Promise<Array<{id: string, name: string, site: string}>>}
 */
export async function listSharedDrives({ accessToken, fetchImpl = fetch, pageSize = 100 }) {
  const drives = [];
  let pageToken = '';

  // Pagination bornée : Google plafonne à 100 par page, et une organisation qui
  // dépasse 500 Drive partagés a un problème que cette fenêtre ne résout pas.
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      fields: 'nextPageToken, drives(id, name, capabilities/canAddChildren)',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await ensureOk(
      await fetchImpl(`${DRIVES_ENDPOINT}?${params}`, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15000),
      }),
      'shared_drives_list',
    );
    const body = await res.json();
    for (const drive of body.drives || []) {
      if (!drive.id || drive.capabilities?.canAddChildren === false) continue;
      drives.push({ id: drive.id, name: drive.name || drive.id, site: '' });
    }
    pageToken = body.nextPageToken || '';
    if (!pageToken) break;
  }
  return drives;
}

// ── Navigation (fenêtre de sélection de dossier) ────────────────────────────
// Ces trois fonctions ne servent QU'À la fenêtre de navigation. Elles exigent
// le scope `drive.metadata.readonly` (cf. lib/connections/providers.js) : avec
// `drive.file` seul, `files.list` ne renvoie que ce que myBrief a créé et la
// fenêtre paraîtrait vide sans raison visible.

/**
 * Sous-dossiers d'un dossier. Les FICHIERS sont exclus : on désigne une
 * destination, les documents ne feraient que du bruit.
 *
 * `search` porte sur tout le Drive et ignore alors `parentId` — chercher dans
 * le seul dossier courant n'aiderait personne à retrouver un dossier enfoui.
 *
 * @returns {Promise<{folders: Array<{id: string, name: string}>, nextPageToken: string}>}
 */
export async function listFolders({
  accessToken,
  driveId = '',
  parentId = '',
  search = '',
  pageToken = '',
  pageSize = 100,
  fetchImpl = fetch,
}) {
  const clauses = [`mimeType = '${FOLDER_MIME}'`, 'trashed = false'];
  if (search) clauses.push(`name contains '${escapeQueryValue(search)}'`);
  else clauses.push(`'${escapeQueryValue(parentId || driveRoot(driveId))}' in parents`);

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'nextPageToken, files(id, name)',
    orderBy: 'name_natural',
    pageSize: String(pageSize),
    ...allDrivesParams(driveId),
  });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await ensureOk(
    await fetchImpl(`${FILES_ENDPOINT}?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    }),
    'folder_list',
  );
  const body = await res.json();
  return { folders: body.files || [], nextPageToken: body.nextPageToken || '' };
}

/**
 * Segments du chemin d'un dossier, de la racine vers lui (`['Clients','Acme']`).
 *
 * C'est ce que la fenêtre de navigation renvoie comme sélection : le réglage
 * enregistré reste un CHEMIN, exactement comme celui qu'on saisissait au
 * clavier. Tout le dépôt (ensureFolderPath, cache, invalidation) continue donc
 * de fonctionner sans rien connaître de la navigation.
 *
 * La remontée est bornée : au-delà, on rend le chemin partiel plutôt que de
 * multiplier les appels sur une hiérarchie pathologique.
 */
export async function folderPathSegments({
  accessToken,
  folderId,
  driveId = '',
  fetchImpl = fetch,
  maxDepth = 12,
}) {
  const segments = [];
  const root = driveRoot(driveId);
  let current = folderId;
  // La remontée s'arrête à la racine du Drive concerné : dans un Drive partagé
  // c'est le Drive lui-même, et son nom n'appartient pas au chemin (il est déjà
  // porté par la bibliothèque choisie, comme chez Microsoft).
  const climbing = () => current && current !== 'root' && current !== root;
  for (let depth = 0; depth < maxDepth && climbing(); depth += 1) {
    const params = new URLSearchParams({ fields: 'id, name, parents', supportsAllDrives: 'true' });
    let doc;
    try {
      const res = await ensureOk(
        await fetchImpl(`${FILES_ENDPOINT}/${encodeURIComponent(current)}?${params}`, {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15000),
        }),
        'folder_get',
      );
      doc = await res.json();
    } catch (err) {
      // Un accès retiré doit remonter ; un dossier devenu invisible en cours de
      // remontée ne doit pas faire échouer l'affichage du chemin déjà obtenu.
      if (err instanceof ConnectionAuthError) throw err;
      break;
    }
    segments.unshift(doc.name);
    current = doc.parents?.[0] || '';
  }
  return segments;
}

/** Crée le dossier s'il n'existe pas déjà sous ce parent. */
export async function ensureChildFolder({
  accessToken,
  driveId = '',
  parentId = '',
  name,
  fetchImpl = fetch,
}) {
  const parent = parentId || driveRoot(driveId);
  const { folders } = await listFolders({
    accessToken,
    driveId,
    parentId: parent,
    fetchImpl,
    pageSize: 1000,
  });
  const existing = folders.find((folder) => folder.name === name);
  if (existing) return { ...existing, created: false };

  const created = await ensureOk(
    await fetchImpl(`${FILES_ENDPOINT}?fields=id, name&supportsAllDrives=true`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
      signal: AbortSignal.timeout(15000),
    }),
    'folder_create',
  );
  return { ...(await created.json()), created: true };
}

/**
 * Identifiant du dossier cible, créé si nécessaire, segment par segment.
 *
 * @returns {Promise<string>} id du dossier le plus profond
 */
export async function ensureFolderPath({
  accessToken,
  folderPath,
  driveId = '',
  fetchImpl = fetch,
}) {
  let parent = driveRoot(driveId);

  for (const segment of folderSegments(folderPath)) {
    const query = [
      `name = '${escapeQueryValue(segment)}'`,
      `mimeType = '${FOLDER_MIME}'`,
      `'${escapeQueryValue(parent)}' in parents`,
      'trashed = false',
    ].join(' and ');

    // `allDrivesParams` est indispensable ici : sans lui l'API répond comme
    // avant l'existence des Drive partagés, donc ne trouve JAMAIS un dossier
    // qui s'y trouve — et en recrée un homonyme dans Mon Drive à chaque dépôt.
    const lookup = new URLSearchParams({
      q: query,
      fields: 'files(id)',
      ...allDrivesParams(driveId),
    });

    const found = await ensureOk(
      await fetchImpl(`${FILES_ENDPOINT}?${lookup}`, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      }),
      'folder_lookup',
    );
    const existing = (await found.json())?.files?.[0]?.id;
    if (existing) {
      parent = existing;
      continue;
    }

    const created = await ensureOk(
      await fetchImpl(`${FILES_ENDPOINT}?fields=id&supportsAllDrives=true`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: segment, mimeType: FOLDER_MIME, parents: [parent] }),
        signal: AbortSignal.timeout(10000),
      }),
      'folder_create',
    );
    const id = (await created.json())?.id;
    if (!id) throw new Error('google_drive_folder_create_empty');
    parent = id;
  }

  return parent;
}

/**
 * Où en est une destination de dépôt, SANS rien créer — ce que lit le
 * diagnostic de configuration (lib/configChecks.js).
 *
 * Même requête que `ensureFolderPath`, segment par segment : le verdict dit donc
 * exactement si le prochain dépôt TROUVERA le dossier ou le recréera. Avec
 * `drive.file`, un dossier créé à la main est aussi invisible ici qu'au dépôt —
 * « introuvable » reste vrai : c'est un homonyme que le dépôt créerait.
 *
 * Un chemin vide désigne le dossier intégré, que le premier dépôt crée : rien à
 * chercher, sinon l'existence du Drive partagé visé.
 *
 * Seul 404 conclut à un Drive disparu : un 403 chez Google est aussi bien une
 * limitation de débit — le signaler inquiéterait pour un incident passager.
 *
 * @returns {Promise<'found'|'missing'|'drive_missing'|'unknown'>}
 * @throws {ConnectionAuthError} accès retiré
 */
export async function probeFolderPath({
  accessToken,
  folderPath,
  driveId = '',
  fetchImpl = fetch,
}) {
  const segments = String(folderPath || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  // Racine d'un Drive partagé : UNE requête, qui ne cherche que le Drive.
  const steps = segments.length ? segments : driveId ? [null] : [];
  let parent = driveRoot(driveId);

  for (const segment of steps) {
    const clauses = [
      `mimeType = '${FOLDER_MIME}'`,
      `'${escapeQueryValue(parent)}' in parents`,
      'trashed = false',
    ];
    if (segment !== null) clauses.unshift(`name = '${escapeQueryValue(segment)}'`);
    const params = new URLSearchParams({
      q: clauses.join(' and '),
      fields: 'files(id)',
      pageSize: '1',
      ...allDrivesParams(driveId),
    });
    const res = await fetchImpl(`${FILES_ENDPOINT}?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401) {
      throw new ConnectionAuthError('google_auth_revoked', { provider: 'google' });
    }
    if (res.status === 404) return 'drive_missing';
    if (!res.ok) return 'unknown';
    if (segment === null) return 'found';
    const id = (await res.json())?.files?.[0]?.id;
    if (!id) return 'missing';
    parent = id;
  }
  return 'found';
}

/**
 * Envoie les octets dans un dossier connu.
 *
 * Toujours une session « resumable », jamais l'upload multipart : celui-ci est
 * plafonné à 5 Mo, et un PDF de compte rendu en images (le repli de
 * src/utils/pdf.js) le dépasse sans peine. Une seule branche vaut mieux
 * qu'une bascule par taille qui ne serait éprouvée que d'un côté.
 *
 * @returns {Promise<{id: string, name: string}>}
 */
export async function uploadToFolder({
  accessToken,
  folderId,
  filename,
  content,
  contentType = 'application/pdf',
  fetchImpl = fetch,
}) {
  const session = await ensureOk(
    await fetchImpl(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'x-upload-content-type': contentType,
      },
      body: JSON.stringify({ name: filename, parents: [folderId], mimeType: contentType }),
      signal: AbortSignal.timeout(15000),
    }),
    'upload_session',
  );

  const location = session.headers?.get?.('location');
  if (!location) throw new Error('google_drive_upload_session_empty');

  // L'URL de session porte déjà l'autorisation : pas d'en-tête Authorization.
  const uploaded = await ensureOk(
    await fetchImpl(location, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: content,
      signal: AbortSignal.timeout(120000),
    }),
    'upload',
  );
  return uploaded.json();
}

/**
 * Dépose un document, en réutilisant le dossier déjà résolu quand c'est possible.
 *
 * Le cache évite deux appels par dépôt, mais il n'est jamais tenu pour acquis :
 * un dossier mis à la corbeille entre deux dépôts se traduit par un 404, et on
 * refait alors la résolution UNE fois. Rejouer est sans risque ici — l'échec se
 * produit avant que le moindre fichier n'ait été créé.
 *
 * @param {object} params
 * @param {{clientId: string, clientSecret: string}} params.credentials
 * @param {{refreshToken: string, drive: object|null}} params.connection
 * @param {string} params.folderPath - chemin voulu par l'administration
 * @param {string} [params.driveId] - Drive partagé visé ; '' = Mon Drive
 * @param {{filename: string, content: Buffer, contentType: string}} params.file
 * @param {Function} [params.fetchImpl]
 * @returns {Promise<{fileId: string, folderId: string, folderPath: string,
 *   driveId: string, cacheUsed: boolean}>}
 */
export async function storeOnDrive({
  credentials,
  connection,
  folderPath,
  driveId = '',
  file,
  fetchImpl = fetch,
}) {
  const accessToken = await refreshGoogleAccessToken({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: connection.refreshToken,
    fetchImpl,
  });

  // Le Drive fait partie de la CLÉ du cache, pas seulement le chemin : deux
  // Drive peuvent porter le même « Comptes rendus », et réutiliser l'id de
  // l'un déposerait dans l'autre sans que rien ne le signale.
  const sameTarget =
    connection.drive?.folderPath === folderPath && (connection.drive?.driveId || '') === driveId;
  const cached = sameTarget ? connection.drive.folderId : '';
  let folderId = cached;
  if (!folderId) folderId = await ensureFolderPath({ accessToken, folderPath, driveId, fetchImpl });

  const upload = () =>
    uploadToFolder({
      accessToken,
      folderId,
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
      fetchImpl,
    });

  let created;
  try {
    created = await upload();
  } catch (err) {
    // Dossier disparu depuis la dernière fois : on le recrée et on réessaie.
    if (!cached || !/_404$/.test(err.message || '')) throw err;
    folderId = await ensureFolderPath({ accessToken, folderPath, driveId, fetchImpl });
    created = await upload();
  }

  return {
    fileId: created?.id || '',
    folderId,
    // `folderPath` reste la valeur DEMANDÉE : c'est la clé du cache de dossier,
    // et la comparer à autre chose le rendrait inutilisable. `resolvedPath` est
    // ce qui a réellement été écrit — les deux diffèrent quand le chemin est
    // vide (racine d'un Drive partagé) et que le dossier intégré s'applique.
    // Sans lui, la confirmation annonçait « déposé dans «  » ».
    folderPath,
    resolvedPath: folderSegments(folderPath).join('/'),
    driveId,
    cacheUsed: folderId === cached,
  };
}
