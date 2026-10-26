/**
 * Envoi de mail et dépôt de fichier via Microsoft Graph, au nom d'un
 * utilisateur qui a relié son compte.
 *
 * Pas de SDK (@microsoft/microsoft-graph-client, msal) : les quelques appels
 * REST nécessaires tiennent dans ce fichier, alors que ces bibliothèques
 * pèsent plus que tout le reste de l'API — même parti pris que lib/gmail.js.
 *
 * Le token endpoint dépend du TENANT : il vient de la découverte OIDC des
 * réglages Entra, jamais d'une URL devinée — la deviner enverrait les
 * identifiants au mauvais annuaire.
 */
import { withRetry } from '../retry.js';
import { getEndpoints } from '../auth/oidcClient.js';
import { ConnectionAuthError } from './errors.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

/**
 * Taille des tranches d'un envoi fragmenté. Graph impose un multiple de
 * 320 Kio ; 10 tranches de 320 Kio est la valeur recommandée.
 */
const CHUNK_SIZE = 10 * 320 * 1024;

/** Au-delà, `sendMail` refuse la requête (limite ~4 Mo, base64 compris). */
const INLINE_ATTACHMENT_LIMIT = 3 * 1024 * 1024;

/**
 * Erreurs d'autorisation d'Entra. `invalid_grant` couvre le retrait d'accès et
 * l'expiration du refresh token (~90 jours glissants) ; les deux autres
 * signalent qu'une action de l'utilisateur est requise — dans les trois cas,
 * seule une reconnexion débloque.
 */
const AUTH_ERRORS = new Set(['invalid_grant', 'interaction_required', 'consent_required']);

/**
 * @param {{clientId: string, clientSecret: string, discoveryUrl?: string}} credentials
 * @param {string} refreshToken
 * @param {Function} [fetchImpl]
 * @returns {Promise<string>} access token frais
 * @throws {ConnectionAuthError}
 */
export async function refreshGraphAccessToken({ credentials, refreshToken, fetchImpl = fetch }) {
  const endpoints = await getEndpoints({
    discoveryUrl: credentials.discoveryUrl || '',
    fallback: null,
    fetchImpl,
  });

  // Seul appel relançable de la chaîne : demander un jeton ne consomme rien.
  return withRetry(async () => {
    const res = await fetchImpl(endpoints.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      let payload = null;
      try {
        payload = await res.json();
      } catch (_) {
        /* corps non JSON */
      }
      if (AUTH_ERRORS.has(payload?.error)) {
        throw new ConnectionAuthError('microsoft_auth_revoked', { provider: 'microsoft' });
      }
      throw new Error(`graph_token_refresh_failed_${res.status}`);
    }
    const data = await res.json();
    if (!data.access_token) throw new Error('graph_token_refresh_empty');
    return data.access_token;
  });
}

/**
 * Appel Graph authentifié. 401 = accès retiré ; le reste est transitoire, y
 * compris 403 (quota, limitation) et 429 — les confondre supprimerait la
 * connexion de l'utilisateur pour un incident de quelques minutes.
 */
async function graphFetch(fetchImpl, url, options, action) {
  const res = await fetchImpl(url, options);
  if (res.ok) return res;
  if (res.status === 401) {
    throw new ConnectionAuthError('microsoft_auth_revoked', { provider: 'microsoft' });
  }
  throw new Error(`graph_${action}_failed_${res.status}`);
}

/** Segments d'un chemin, encodés pour l'adressage `root:/a/b:` de Graph. */
function pathSegments(folderPath) {
  return String(folderPath || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * URL de la page suivante d'une liste, telle que le client la renvoie.
 *
 * Chez Graph, le jeton de pagination EST une URL complète (`@odata.nextLink`),
 * et c'est le client qui nous la rend. La suivre sans la vérifier reviendrait à
 * appeler N'IMPORTE QUELLE adresse fournie par le navigateur avec le jeton
 * d'accès de l'utilisateur en en-tête — un `pageToken` forgé suffirait à
 * l'envoyer à un hôte tiers. On n'accepte donc qu'une URL de Graph.
 */
function pageUrl(pageToken) {
  const url = String(pageToken || '');
  if (!url) return '';
  if (!url.startsWith(`${GRAPH}/`)) throw new Error('graph_page_token_invalid');
  return url;
}

/**
 * Chemin du PARENT d'un résultat de recherche, depuis `parentReference.path`.
 *
 * Graph rend ce chemin sous la forme `/drive/root:/Clients/Acme` (OneDrive) ou
 * `/drives/{id}/root:/Clients/Acme` (bibliothèque) ; un enfant direct de la
 * racine porte `/drive/root:` sans rien derrière. Selon les tenants les
 * segments arrivent percent-encodés (`Comptes%20rendus`) : on décode, sans
 * échouer sur un « % » littéral.
 *
 * @returns {string} chemin relatif à la racine, `''` pour la racine
 */
function parentPathOf(path) {
  const raw = String(path || '');
  const marker = raw.indexOf('root:');
  if (marker === -1) return '';
  let rest = raw.slice(marker + 'root:'.length);
  try {
    rest = decodeURIComponent(rest);
  } catch (_) {
    // Pas un encodage : le chemin est pris tel quel.
  }
  return pathSegments(rest).join('/');
}

/**
 * Racine d'adressage d'un drive.
 *
 * Sans `driveId`, c'est le OneDrive de l'utilisateur — le seul cas qui existait
 * avant SharePoint, et le repli de toute connexion qui n'a pas choisi de
 * bibliothèque. Avec, c'est une bibliothèque de document quelconque : celle
 * d'un site SharePoint le plus souvent. Le reste du code n'a pas à savoir
 * laquelle des deux il manipule.
 */
function driveRoot(driveId) {
  return driveId ? `${GRAPH}/drives/${encodeURIComponent(driveId)}` : `${GRAPH}/me/drive`;
}

// ── Navigation (fenêtre de sélection de dossier) ────────────────────────────

/**
 * Bibliothèques où l'utilisateur peut déposer : son OneDrive, puis celles des
 * sites SharePoint qu'il SUIT.
 *
 * `followedSites` et non une recherche sur tout le tenant : dans une grande
 * organisation, `/sites?search=*` rend des centaines d'entrées sans ordre utile,
 * là où les sites suivis sont exactement ceux que la personne fréquente. Un
 * site absent de la liste se règle du côté SharePoint, en le suivant — un geste
 * d'un clic, et qui persiste.
 *
 * Sans le scope `Sites.ReadWrite.All`, Graph refuse `followedSites` : on rend
 * alors le seul OneDrive plutôt que d'échouer, la navigation reste utilisable.
 *
 * @returns {Promise<Array<{id: string, name: string, site: string}>>}
 */
export async function listDrives({ accessToken, fetchImpl = fetch }) {
  const auth = { authorization: `Bearer ${accessToken}` };
  const drives = [];

  const mine = await graphFetch(
    fetchImpl,
    `${GRAPH}/me/drive?$select=id,name`,
    { headers: auth, signal: AbortSignal.timeout(15000) },
    'drive_get',
  );
  const own = await mine.json();
  // `id` explicite plutôt que '' : la sélection doit rester valable même si le
  // OneDrive cesse un jour d'être le drive par défaut de l'utilisateur.
  drives.push({ id: own.id || '', name: own.name || 'OneDrive', site: '' });

  const sites = await fetchImpl(`${GRAPH}/me/followedSites?$select=id,displayName`, {
    headers: auth,
    signal: AbortSignal.timeout(15000),
  });
  if (sites.status === 401) {
    throw new ConnectionAuthError('microsoft_auth_revoked', { provider: 'microsoft' });
  }
  if (!sites.ok) return drives;

  for (const site of (await sites.json()).value || []) {
    const libraries = await fetchImpl(
      `${GRAPH}/sites/${encodeURIComponent(site.id)}/drives?$select=id,name`,
      { headers: auth, signal: AbortSignal.timeout(15000) },
    );
    // Un site dont les bibliothèques sont fermées à cette personne ne doit pas
    // faire disparaître les autres de la fenêtre.
    if (!libraries.ok) continue;
    for (const library of (await libraries.json()).value || []) {
      drives.push({
        id: library.id,
        name: library.name || 'Documents',
        site: site.displayName || '',
      });
    }
  }
  return drives;
}

/**
 * Sous-dossiers d'un dossier, désignés par leur CHEMIN (et non par un id) :
 * c'est ce chemin qui sera enregistré comme destination, et la même adresse
 * sert ensuite au dépôt.
 *
 * @returns {Promise<{folders: Array<{name: string}>, nextPageToken: string}>}
 */
export async function listFolders({
  accessToken,
  driveId = '',
  folderPath = '',
  pageToken = '',
  fetchImpl = fetch,
}) {
  const base = driveRoot(driveId);
  const segments = pathSegments(folderPath);
  const target = segments.length
    ? `${base}/root:/${segments.map(encodeURIComponent).join('/')}:/children`
    : `${base}/root/children`;
  // `$top` généreux : la pagination existe (nextLink, que la fenêtre suit par
  // « Afficher plus ») mais un dossier de travail dépasse rarement quelques
  // dizaines d'entrées.
  const url = pageUrl(pageToken) || `${target}?$select=id,name,folder&$top=200`;

  const res = await graphFetch(
    fetchImpl,
    url,
    { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) },
    'folder_list',
  );
  const body = await res.json();
  return {
    folders: (body.value || []).filter((item) => item.folder).map((item) => ({ name: item.name })),
    nextPageToken: body['@odata.nextLink'] || '',
  };
}

/**
 * Dossiers dont le nom contient `term`, dans TOUT le drive — l'équivalent de
 * la recherche que la fenêtre offre déjà chez Google.
 *
 * `search(q=…)` rend fichiers ET dossiers, sans filtre serveur possible sur la
 * facette : les fichiers sont retirés ici. Chaque dossier est rendu avec le
 * chemin de son parent, parce qu'un résultat de recherche n'a pas été
 * traversé : sans son chemin, la fenêtre enregistrerait « Acme » sans savoir
 * lequel — et c'est ce chemin qui devient son curseur (cf. browse.js).
 *
 * @returns {Promise<{folders: Array<{name: string, parentPath: string}>, nextPageToken: string}>}
 */
export async function searchFolders({
  accessToken,
  driveId = '',
  term,
  pageToken = '',
  fetchImpl = fetch,
}) {
  // Une apostrophe dans le terme fermerait le littéral OData : elle se double.
  const query = encodeURIComponent(String(term || '').replace(/'/g, "''"));
  const url =
    pageUrl(pageToken) ||
    `${driveRoot(driveId)}/root/search(q='${query}')?$select=id,name,folder,parentReference&$top=200`;

  const res = await graphFetch(
    fetchImpl,
    url,
    { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) },
    'folder_search',
  );
  const body = await res.json();
  return {
    folders: (body.value || [])
      .filter((item) => item.folder)
      .map((item) => ({ name: item.name, parentPath: parentPathOf(item.parentReference?.path) })),
    nextPageToken: body['@odata.nextLink'] || '',
  };
}

/**
 * Où en est une destination de dépôt, SANS rien créer — ce que lit le
 * diagnostic de configuration (lib/configChecks.js).
 *
 * Un chemin absent ne suffit pas à conclure : la bibliothèque elle-même a pu
 * disparaître (site SharePoint supprimé, compte retiré du site). Le drive n'est
 * donc interrogé qu'en second, quand le chemin manque — le cas courant ne coûte
 * qu'une requête.
 *
 * Un chemin vide désigne le dossier intégré, que le premier dépôt crée. Seul 404
 * conclut à une disparition : 403 est ici une limitation (cf. `graphFetch`).
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
  const base = driveRoot(driveId);
  const segments = pathSegments(folderPath);
  const read = async (url) => {
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401) {
      throw new ConnectionAuthError('microsoft_auth_revoked', { provider: 'microsoft' });
    }
    return res;
  };

  if (segments.length) {
    const found = await read(`${base}/root:/${segments.map(encodeURIComponent).join('/')}`);
    if (found.ok) return 'found';
    if (found.status !== 404) return 'unknown';
  } else if (!driveId) {
    return 'found';
  }

  const drive = await read(`${base}?$select=id`);
  if (drive.status === 404) return 'drive_missing';
  if (!drive.ok) return 'unknown';
  return segments.length ? 'missing' : 'found';
}

/** Crée le dossier s'il n'existe pas déjà — `ensureFolderPath` sur un cran. */
export async function ensureChildFolder({
  accessToken,
  driveId = '',
  folderPath = '',
  name,
  fetchImpl = fetch,
}) {
  const childPath = [...pathSegments(folderPath), name].join('/');
  await ensureFolderPath({ accessToken, folderPath: childPath, driveId, fetchImpl });
  return { name };
}

/**
 * Identifiant du dossier cible dans le OneDrive de l'utilisateur, créé si
 * nécessaire.
 *
 * Contrairement à Google, le scope `Files.ReadWrite` voit TOUT le drive : un
 * dossier que l'utilisateur a créé lui-même est retrouvé, pas dupliqué.
 *
 * @returns {Promise<string>} id du dossier le plus profond
 */
export async function ensureFolderPath({
  accessToken,
  folderPath,
  driveId = '',
  fetchImpl = fetch,
  defaultFolder = 'myBrief',
}) {
  const segments = pathSegments(folderPath);
  const wanted = segments.length ? segments : [defaultFolder];
  const auth = { authorization: `Bearer ${accessToken}` };
  const base = driveRoot(driveId);

  // Le chemin complet existe le plus souvent déjà : une seule requête suffit.
  const full = wanted.map(encodeURIComponent).join('/');
  const existing = await fetchImpl(`${base}/root:/${full}`, {
    headers: auth,
    signal: AbortSignal.timeout(10000),
  });
  if (existing.ok) return (await existing.json()).id;
  if (existing.status === 401) {
    throw new ConnectionAuthError('microsoft_auth_revoked', { provider: 'microsoft' });
  }
  if (existing.status !== 404) throw new Error(`graph_folder_lookup_failed_${existing.status}`);

  // Sinon on descend segment par segment : Graph ne crée pas les parents
  // manquants d'un chemin, il faut les poser un à un.
  let parentPath = '';
  let folderId = '';
  for (const segment of wanted) {
    const childPath = parentPath ? `${parentPath}/${segment}` : segment;
    const encoded = childPath.split('/').map(encodeURIComponent).join('/');

    const found = await fetchImpl(`${base}/root:/${encoded}`, {
      headers: auth,
      signal: AbortSignal.timeout(10000),
    });
    if (found.ok) {
      folderId = (await found.json()).id;
      parentPath = childPath;
      continue;
    }
    if (found.status === 401) {
      throw new ConnectionAuthError('microsoft_auth_revoked', { provider: 'microsoft' });
    }
    if (found.status !== 404) throw new Error(`graph_folder_lookup_failed_${found.status}`);

    const parentUrl = parentPath
      ? `${base}/root:/${parentPath.split('/').map(encodeURIComponent).join('/')}:/children`
      : `${base}/root/children`;
    const created = await fetchImpl(parentUrl, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: segment,
        folder: {},
        // Une création concurrente ne doit pas écraser le dossier existant.
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (created.ok) {
      folderId = (await created.json()).id;
      parentPath = childPath;
      continue;
    }
    // 409 : quelqu'un vient de le créer — on relit au lieu d'échouer.
    if (created.status === 409) {
      const again = await graphFetch(
        fetchImpl,
        `${base}/root:/${encoded}`,
        { headers: auth, signal: AbortSignal.timeout(10000) },
        'folder_lookup',
      );
      folderId = (await again.json()).id;
      parentPath = childPath;
      continue;
    }
    if (created.status === 401) {
      throw new ConnectionAuthError('microsoft_auth_revoked', { provider: 'microsoft' });
    }
    throw new Error(`graph_folder_create_failed_${created.status}`);
  }

  return folderId;
}

/**
 * Pousse un contenu vers une URL de session d'envoi, tranche par tranche.
 *
 * L'URL de session porte déjà son autorisation : y ajouter un en-tête
 * Authorization fait échouer l'envoi côté Graph.
 *
 * @returns {Promise<object|null>} dernière réponse JSON exploitable
 */
async function uploadInChunks({ fetchImpl, uploadUrl, content, action }) {
  const total = content.length;
  let offset = 0;
  let last = null;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = content.subarray(offset, end);
    const res = await fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: {
        'content-length': String(chunk.length),
        'content-range': `bytes ${offset}-${end - 1}/${total}`,
      },
      body: chunk,
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`graph_${action}_failed_${res.status}`);
    try {
      last = await res.json();
    } catch (_) {
      // 202 entre deux tranches : corps vide, ce n'est pas une erreur.
    }
    offset = end;
  }
  return last;
}

/**
 * Adresses au format attendu par Graph.
 *
 * Accepte une chaîne ou un tableau : les appelants historiques passent une
 * adresse unique, les destinataires paramétrables en passent plusieurs.
 */
function recipientList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map((address) => String(address || '').trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

/**
 * Envoie un message depuis la boîte du compte relié.
 *
 * Deux chemins, imposés par Graph : sans pièce jointe (ou avec une petite),
 * `sendMail` suffit en un appel ; au-delà, il faut créer un brouillon, y
 * pousser la pièce jointe par tranches, puis l'envoyer.
 *
 * @param {{credentials: object, refreshToken: string, to: string|string[],
 *   cc?: string|string[], replyTo?: string|string[], subject: string,
 *   text: string, html: string,
 *   attachments?: Array<{filename: string, content: Buffer, contentType: string}>,
 *   fetchImpl?: Function}} params
 */
export async function sendViaGraph({
  credentials,
  refreshToken,
  to,
  cc,
  replyTo,
  subject,
  html,
  attachments = [],
  fetchImpl = fetch,
}) {
  const accessToken = await refreshGraphAccessToken({ credentials, refreshToken, fetchImpl });
  const auth = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
  // `message` est PARTAGÉ par les trois branches d'envoi ci-dessous (sans pièce
  // jointe, pièce jointe en ligne, brouillon par tranches) : ajouter un champ
  // ici le couvre partout, l'ajouter dans une branche l'oublie dans deux.
  const message = {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: recipientList(to),
    ...(recipientList(cc).length ? { ccRecipients: recipientList(cc) } : {}),
    ...(recipientList(replyTo).length ? { replyTo: recipientList(replyTo) } : {}),
  };

  const file = attachments[0];
  if (!file) {
    await graphFetch(
      fetchImpl,
      `${GRAPH}/me/sendMail`,
      {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ message, saveToSentItems: true }),
        signal: AbortSignal.timeout(30000),
      },
      'send_mail',
    );
    return;
  }

  if (file.content.length <= INLINE_ATTACHMENT_LIMIT) {
    await graphFetch(
      fetchImpl,
      `${GRAPH}/me/sendMail`,
      {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          message: {
            ...message,
            attachments: [
              {
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: file.filename,
                contentType: file.contentType,
                contentBytes: file.content.toString('base64'),
              },
            ],
          },
          saveToSentItems: true,
        }),
        signal: AbortSignal.timeout(60000),
      },
      'send_mail',
    );
    return;
  }

  const draft = await graphFetch(
    fetchImpl,
    `${GRAPH}/me/messages`,
    {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(30000),
    },
    'draft_create',
  );
  const messageId = (await draft.json()).id;

  const session = await graphFetch(
    fetchImpl,
    `${GRAPH}/me/messages/${messageId}/attachments/createUploadSession`,
    {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        AttachmentItem: {
          attachmentType: 'file',
          name: file.filename,
          size: file.content.length,
          contentType: file.contentType,
        },
      }),
      signal: AbortSignal.timeout(30000),
    },
    'attachment_session',
  );
  const uploadUrl = (await session.json()).uploadUrl;
  if (!uploadUrl) throw new Error('graph_attachment_session_empty');

  await uploadInChunks({
    fetchImpl,
    uploadUrl,
    content: file.content,
    action: 'attachment_upload',
  });

  await graphFetch(
    fetchImpl,
    `${GRAPH}/me/messages/${messageId}/send`,
    { method: 'POST', headers: auth, signal: AbortSignal.timeout(30000) },
    'send_draft',
  );
}

/**
 * Dépose un document dans le OneDrive du compte relié.
 *
 * Toujours une session d'envoi, jamais le PUT simple : celui-ci est plafonné à
 * 4 Mo, qu'un PDF de compte rendu dépasse sans peine. Une seule branche vaut
 * mieux qu'une bascule par taille éprouvée d'un seul côté.
 *
 * @returns {Promise<{fileId: string, folderId: string, folderPath: string, cacheUsed: boolean}>}
 */
export async function storeOnOneDrive({
  credentials,
  connection,
  folderPath,
  driveId = '',
  file,
  fetchImpl = fetch,
}) {
  const accessToken = await refreshGraphAccessToken({
    credentials,
    refreshToken: connection.refreshToken,
    fetchImpl,
  });

  const base = driveRoot(driveId);
  // Le cache porte AUSSI sur la bibliothèque : le même chemin « CR/2026 »
  // désigne deux dossiers différents dans deux bibliothèques, et réutiliser
  // l'identifiant de l'une pour l'autre déposerait au mauvais endroit.
  const sameTarget =
    connection.drive?.folderPath === folderPath && (connection.drive?.driveId || '') === driveId;
  const cached = sameTarget ? connection.drive.folderId : '';
  let folderId =
    cached || (await ensureFolderPath({ accessToken, folderPath, driveId, fetchImpl }));

  const openSession = () =>
    fetchImpl(
      `${base}/items/${folderId}:/${encodeURIComponent(file.filename)}:/createUploadSession`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          // Renommer plutôt qu'écraser : deux comptes rendus du même jour ne
          // doivent pas se remplacer silencieusement.
          item: { '@microsoft.graph.conflictBehavior': 'rename' },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

  let session = await openSession();
  // Dossier disparu depuis le dernier dépôt : on le recrée et on réessaie. Sûr,
  // l'échec précède la création du moindre fichier.
  if (session.status === 404 && cached) {
    folderId = await ensureFolderPath({ accessToken, folderPath, driveId, fetchImpl });
    session = await openSession();
  }
  if (!session.ok) {
    if (session.status === 401) {
      throw new ConnectionAuthError('microsoft_auth_revoked', { provider: 'microsoft' });
    }
    throw new Error(`graph_upload_session_failed_${session.status}`);
  }

  const uploadUrl = (await session.json()).uploadUrl;
  if (!uploadUrl) throw new Error('graph_upload_session_empty');

  const created = await uploadInChunks({
    fetchImpl,
    uploadUrl,
    content: file.content,
    action: 'upload',
  });

  return {
    fileId: created?.id || '',
    folderId,
    // `folderPath` = la valeur demandée, qui sert de clé au cache de dossier.
    // `resolvedPath` = ce qui a réellement été écrit ; les deux diffèrent quand
    // le chemin est vide et que le dossier intégré s'applique (cf. googleDrive).
    folderPath,
    resolvedPath: (pathSegments(folderPath).length ? pathSegments(folderPath) : ['myBrief']).join(
      '/',
    ),
    driveId,
    cacheUsed: folderId === cached,
  };
}
