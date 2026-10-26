/**
 * Navigation dans le stockage du compte relié — ce qui alimente la fenêtre de
 * sélection de dossier.
 *
 * Un seul point d'entrée pour la route, comme `store.js` pour le dépôt : elle
 * ne connaît que « liste-moi les dossiers d'ici », sans savoir que Google
 * interroge `files.list` avec une requête `q` là où Graph adresse un chemin.
 *
 * ── Ce que la fenêtre renvoie est un CHEMIN, pas un identifiant ─────────────
 * C'est la décision structurante de tout ce fichier. Le réglage enregistré
 * reste `storage.folder`, la même chaîne « Clients/Acme » qu'on saisissait au
 * clavier avant l'existence de cette fenêtre. Tout le dépôt — `ensureFolderPath`
 * chez les deux fournisseurs, le cache de dossier, son invalidation — continue
 * donc de fonctionner sans rien connaître de la navigation, et un utilisateur
 * qui préfère taper son chemin le peut encore.
 *
 * Le prix à payer est un `cursor` : Google descend par identifiant de dossier,
 * Graph par chemin. Le curseur est opaque pour le client, qui se contente de
 * renvoyer celui de l'entrée sur laquelle il a cliqué.
 */
import * as googleDrive from './googleDrive.js';
import * as msGraph from './msGraph.js';
import { refreshGoogleAccessToken } from './googleTokens.js';
import { refreshGraphAccessToken } from './msGraph.js';
import { CONNECT_PROVIDERS, hasScope } from './providers.js';
import { ConnectionAuthError } from './errors.js';

/**
 * Un nom de dossier contenant « / » ne survit pas à l'aller-retour par un
 * chemin : « A/B » relu donnerait deux niveaux. Plutôt que de déposer
 * silencieusement au mauvais endroit, ces dossiers sont retirés de la fenêtre.
 * Rare — Drive l'autorise, presque personne ne le fait.
 */
const addressable = (folder) => !String(folder.name || '').includes('/');

/** Chemin lisible, à partir des segments accumulés par le client. */
export function joinPath(segments) {
  return (segments || [])
    .map((segment) => String(segment || '').trim())
    .filter(Boolean)
    .join('/');
}

/**
 * Verdict de chaque destination, dans l'ordre reçu, quatre à la fois : un
 * utilisateur peut régler un dossier par tag, et vingt sondes en file
 * retarderaient la réponse d'autant.
 *
 * Un accès retiré interrompt tout — il vaut pour toutes les destinations. Toute
 * autre panne ne coûte que SON verdict (`unknown`) : un dossier injoignable ne
 * dit rien des autres.
 */
async function probeEach(targets, probeOne, concurrency = 4) {
  const verdicts = new Array(targets.length).fill('unknown');
  let next = 0;
  async function worker() {
    while (next < targets.length) {
      const index = next;
      next += 1;
      try {
        verdicts[index] = await probeOne(targets[index]);
      } catch (err) {
        if (err instanceof ConnectionAuthError) throw err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return verdicts;
}

async function googleToken({ credentials, connection, fetchImpl }) {
  return refreshGoogleAccessToken({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: connection.refreshToken,
    fetchImpl,
  });
}

const IMPLEMENTATIONS = {
  google: {
    /**
     * « Mon Drive » PUIS les Drive partagés où l'utilisateur peut déposer.
     *
     * `id: ''` pour Mon Drive : c'est la valeur enregistrée par toutes les
     * destinations existantes, et la traiter comme « pas de Drive partagé »
     * garde le dépôt d'avant intact.
     *
     * Sans le scope `drives.list` (connexion nouée avant cette version), les
     * Drive partagés sont simplement ABSENTS — pas une erreur : la fenêtre
     * reste utile pour Mon Drive, exactement comme côté Microsoft quand les
     * sites SharePoint ne sont pas consentis.
     */
    async drives({ credentials, connection, fetchImpl }) {
      const mine = { id: '', name: 'Mon Drive', site: '' };
      if (!hasScope(connection.scopes, CONNECT_PROVIDERS.google.sharedDrivesScope)) return [mine];

      const accessToken = await googleToken({ credentials, connection, fetchImpl });
      const shared = await googleDrive.listSharedDrives({ accessToken, fetchImpl });
      return [mine, ...shared];
    },

    async list({ credentials, connection, driveId, cursor, search, pageToken, fetchImpl }) {
      const accessToken = await googleToken({ credentials, connection, fetchImpl });
      const { folders, nextPageToken } = await googleDrive.listFolders({
        accessToken,
        driveId,
        parentId: cursor,
        search,
        pageToken,
        fetchImpl,
      });
      return {
        folders: folders
          .filter(addressable)
          .map((folder) => ({ name: folder.name, cursor: folder.id })),
        nextPageToken,
      };
    },

    /**
     * Chemin absolu d'un résultat de RECHERCHE : lui seul est atteint sans
     * qu'on ait descendu l'arborescence, donc sans que le client ait pu
     * accumuler ses segments.
     */
    async pathOf({ credentials, connection, driveId, cursor, fetchImpl }) {
      const accessToken = await googleToken({ credentials, connection, fetchImpl });
      const segments = await googleDrive.folderPathSegments({
        accessToken,
        folderId: cursor,
        driveId,
        fetchImpl,
      });
      return joinPath(segments);
    },

    async create({ credentials, connection, driveId, cursor, name, fetchImpl }) {
      const accessToken = await googleToken({ credentials, connection, fetchImpl });
      const folder = await googleDrive.ensureChildFolder({
        accessToken,
        driveId,
        parentId: cursor,
        name,
        fetchImpl,
      });
      return { name: folder.name, cursor: folder.id };
    },

    /**
     * Diagnostic de configuration : où en sont ces destinations, sans rien
     * créer. UN jeton pour toutes — le rafraîchir est aussi ce qui révèle un
     * accès retiré (ConnectionAuthError).
     */
    async probe({ credentials, connection, targets, fetchImpl }) {
      const accessToken = await googleToken({ credentials, connection, fetchImpl });
      return probeEach(targets, (target) =>
        googleDrive.probeFolderPath({
          accessToken,
          folderPath: target.folder,
          driveId: target.driveId,
          fetchImpl,
        }),
      );
    },
  },

  microsoft: {
    async drives({ credentials, connection, fetchImpl }) {
      const accessToken = await refreshGraphAccessToken({
        credentials,
        refreshToken: connection.refreshToken,
        fetchImpl,
      });
      return msGraph.listDrives({ accessToken, fetchImpl });
    },

    async list({ credentials, connection, driveId, cursor, search, pageToken, fetchImpl }) {
      const accessToken = await refreshGraphAccessToken({
        credentials,
        refreshToken: connection.refreshToken,
        fetchImpl,
      });

      // Recherche sur tout le drive, comme chez Google — `search` ignore alors
      // le dossier courant. Avant, ce paramètre était simplement IGNORÉ ici :
      // la fenêtre présentait les sous-dossiers du dossier courant sous le
      // titre « Résultats de recherche ». Chaque résultat arrive avec le chemin
      // de son parent, donc son curseur reste un CHEMIN absolu et `pathOf`
      // n'a rien de plus à résoudre.
      if (search) {
        const { folders, nextPageToken } = await msGraph.searchFolders({
          accessToken,
          driveId,
          term: search,
          pageToken,
          fetchImpl,
        });
        return {
          folders: folders.filter(addressable).map((folder) => ({
            name: folder.name,
            cursor: joinPath([folder.parentPath, folder.name]),
          })),
          nextPageToken,
        };
      }

      const { folders, nextPageToken } = await msGraph.listFolders({
        accessToken,
        driveId,
        folderPath: cursor || '',
        pageToken,
        fetchImpl,
      });
      // Chez Graph le curseur EST le chemin : descendre revient à l'allonger.
      return {
        folders: folders.filter(addressable).map((folder) => ({
          name: folder.name,
          cursor: joinPath([cursor, folder.name]),
        })),
        nextPageToken,
      };
    },

    /** Le curseur est déjà le chemin — résultat de recherche compris. */
    async pathOf({ cursor }) {
      return cursor || '';
    },

    async create({ credentials, connection, driveId, cursor, name, fetchImpl }) {
      const accessToken = await refreshGraphAccessToken({
        credentials,
        refreshToken: connection.refreshToken,
        fetchImpl,
      });
      await msGraph.ensureChildFolder({
        accessToken,
        driveId,
        folderPath: cursor || '',
        name,
        fetchImpl,
      });
      return { name, cursor: joinPath([cursor, name]) };
    },

    /** Cf. l'implémentation Google : un jeton, aucune création. */
    async probe({ credentials, connection, targets, fetchImpl }) {
      const accessToken = await refreshGraphAccessToken({
        credentials,
        refreshToken: connection.refreshToken,
        fetchImpl,
      });
      return probeEach(targets, (target) =>
        msGraph.probeFolderPath({
          accessToken,
          folderPath: target.folder,
          driveId: target.driveId,
          fetchImpl,
        }),
      );
    },
  },
};

/**
 * @returns {{drives: Function, list: Function, pathOf: Function, create: Function,
 *   probe: Function}}
 *   Injectable dans les tests, comme `createDriveStore()` (cf. app.js).
 */
export function createDriveBrowser() {
  const dispatch =
    (method) =>
    async ({ provider, ...params }) => {
      const implementation = IMPLEMENTATIONS[provider];
      // Le fournisseur est validé en amont (registre + réglages) : arriver ici
      // veut dire qu'une entrée du registre n'a pas son implémentation.
      if (!implementation) throw new Error(`storage_provider_unsupported_${provider}`);
      return implementation[method](params);
    };

  return {
    drives: dispatch('drives'),
    list: dispatch('list'),
    pathOf: dispatch('pathOf'),
    create: dispatch('create'),
    probe: dispatch('probe'),
  };
}
