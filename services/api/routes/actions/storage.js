/**
 * Navigation dans le stockage du compte relié — ce qui alimente la fenêtre de
 * sélection de dossier de « Ma configuration ».
 *
 * ── Pourquoi ces routes existent côté serveur ──────────────────────────────
 * Le jeton d'accès au Drive ne descend JAMAIS dans le navigateur. Google et
 * Microsoft proposent tous deux un sélecteur côté client (Picker, File Picker
 * v8) ; l'un comme l'autre suppose de livrer un jeton à la page, où n'importe
 * quelle extension le lit. Le listage passe donc par l'API, qui a déjà le
 * refresh token et sait le rafraîchir.
 *
 * ── Le curseur ─────────────────────────────────────────────────────────────
 * Ce que ces routes rendent n'est pas une arborescence d'identifiants mais des
 * couples `{ name, cursor }`. Le client accumule les NOMS pour composer le
 * chemin qu'il enregistrera, et renvoie le CURSEUR pour descendre. C'est ce qui
 * permet à Google (qui descend par id) et à Graph (qui descend par chemin) de
 * servir la même fenêtre — cf. l'en-tête de lib/connections/browse.js.
 *
 * Toutes en GET sauf la création, et toutes en lecture seule côté fournisseur :
 * parcourir ne crée rien, y compris chez Google où `ensureFolderPath` créerait.
 */
import { requireUser } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { isSameOrigin } from '../../lib/auth/originCheck.js';
import { ConnectionAuthError } from '../../lib/connections/errors.js';
import { resolveStorageAccess } from '../../lib/connections/access.js';
import { hasScope, sharedDrivesOffered } from '../../lib/connections/providers.js';

/** Bornes de transport — la fenêtre n'envoie jamais rien de long. */
const CURSOR_MAX = 1000;
const NAME_MAX = 200;

const listQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    driveId: { type: 'string', maxLength: 300 },
    cursor: { type: 'string', maxLength: CURSOR_MAX },
    search: { type: 'string', maxLength: 100 },
    pageToken: { type: 'string', maxLength: 2000 },
  },
};

const createBody = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    driveId: { type: 'string', maxLength: 300 },
    cursor: { type: 'string', maxLength: CURSOR_MAX },
    name: { type: 'string', minLength: 1, maxLength: NAME_MAX },
  },
};

export default function actionsStorageRoutes(app) {
  /**
   * Accès au stockage pour NAVIGUER, ou l'erreur qui explique ce qui manque.
   * Le fournisseur vient de l'administration, jamais de la requête.
   */
  async function access(req, reply) {
    const user = requireUser(req, reply);
    if (!user) return null;
    const admin = await app.settings.getActions();
    const resolved = await resolveStorageAccess(app, {
      user,
      providerId: admin.connections.provider,
      requireBrowse: true,
    });
    if (resolved.error) {
      fail(reply, resolved.status, resolved.error, resolved.extra);
      return null;
    }
    // Les réglages suivent : ils disent ce que l'installation DEMANDE, ce qui
    // n'est pas ce que la connexion PORTE (cf. `sharedDrivesMissing`).
    return { ...resolved, connections: admin.connections };
  }

  /**
   * Un échec de navigation ne doit jamais supprimer la connexion de
   * l'utilisateur — contrairement au dépôt, où un accès retiré est définitif et
   * mérite la purge. Ici on le NOMME et on laisse l'écran proposer la
   * reconnexion : parcourir est une opération de confort, la casser pour un
   * incident réseau de trente secondes serait disproportionné.
   */
  async function guard(reply, action) {
    try {
      return await action();
    } catch (err) {
      if (err instanceof ConnectionAuthError) {
        fail(reply, 502, 'storage_auth_revoked');
        return null;
      }
      reply.log?.warn({ err: err.message }, 'navigation dans le stockage en échec');
      fail(reply, 502, 'browse_failed');
      return null;
    }
  }

  /**
   * Bibliothèques où déposer. Chez Google, « Mon Drive » PUIS les Drive partagés
   * où l'utilisateur peut déposer ; chez Microsoft, le OneDrive personnel PUIS
   * les bibliothèques des sites SharePoint qu'il suit.
   *
   * `sharedDrivesMissing` dit que la liste est TRONQUÉE faute de scope, et non
   * qu'il n'y a rien à montrer. Sans lui, une connexion nouée avant
   * `drive.readonly` (Google) ou sans `Sites.ReadWrite.All` (Microsoft) verrait
   * ses Drive partagés ou ses sites simplement absents — l'écran affirmerait
   * qu'ils n'existent pas. Le client choisit le texte selon `provider`.
   *
   * ⚠️ Il reste FAUX quand l'installation ne demande pas le scope
   * (`sharedDrivesOffered`) : le message invite à reconnecter son compte, ce
   * qui ne rendrait rien. Rien ne manque — SharePoint ne fait pas partie de
   * cette installation, et c'est à l'administration de le dire, pas ici.
   */
  app.get('/actions/storage/drives', async (req, reply) => {
    const ctx = await access(req, reply);
    if (!ctx) return undefined;
    const drives = await guard(reply, () =>
      app.driveBrowser.drives({
        provider: ctx.providerId,
        credentials: ctx.credentials,
        connection: ctx.connection,
      }),
    );
    if (!drives) return undefined;
    const sharedScope = ctx.provider.sharedDrivesScope;
    const offered = sharedDrivesOffered(ctx.provider, ctx.connections);
    return {
      provider: ctx.providerId,
      multiDrive: !!ctx.provider.multiDrive,
      sharedDrivesMissing: offered && !hasScope(ctx.connection.scopes, sharedScope),
      drives,
    };
  });

  /** Sous-dossiers du dossier courant, ou résultats d'une recherche. */
  app.get(
    '/actions/storage/folders',
    { schema: { querystring: listQuery } },
    async (req, reply) => {
      const ctx = await access(req, reply);
      if (!ctx) return undefined;
      const result = await guard(reply, () =>
        app.driveBrowser.list({
          provider: ctx.providerId,
          credentials: ctx.credentials,
          connection: ctx.connection,
          driveId: req.query.driveId || '',
          cursor: req.query.cursor || '',
          search: req.query.search || '',
          pageToken: req.query.pageToken || '',
        }),
      );
      if (!result) return undefined;
      return { ok: true, ...result };
    },
  );

  /**
   * Chemin absolu d'un dossier atteint par la RECHERCHE.
   *
   * La navigation pas à pas n'en a pas besoin — le client connaît les noms
   * qu'il a traversés. Un résultat de recherche, lui, tombe du ciel : sans son
   * chemin, l'utilisateur enregistrerait « Acme » sans savoir lequel.
   */
  app.get('/actions/storage/path', { schema: { querystring: listQuery } }, async (req, reply) => {
    const ctx = await access(req, reply);
    if (!ctx) return undefined;
    const path = await guard(reply, () =>
      app.driveBrowser.pathOf({
        provider: ctx.providerId,
        credentials: ctx.credentials,
        connection: ctx.connection,
        driveId: req.query.driveId || '',
        cursor: req.query.cursor || '',
      }),
    );
    if (path === null) return undefined;
    return { ok: true, path };
  });

  /**
   * Crée un dossier depuis la fenêtre. Seule route MUTANTE du fichier, donc la
   * seule à porter la barrière d'origine — les GET ne changent rien chez le
   * fournisseur.
   */
  app.post('/actions/storage/folders', { schema: { body: createBody } }, async (req, reply) => {
    const ctx = await access(req, reply);
    if (!ctx) return undefined;
    if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');

    // Un « / » ferait deux niveaux là où l'utilisateur en demande un, et le nom
    // ne survivrait pas à l'aller-retour par un chemin (cf. browse.js).
    if (req.body.name.includes('/')) return fail(reply, 400, 'folder_name_invalid');

    const folder = await guard(reply, () =>
      app.driveBrowser.create({
        provider: ctx.providerId,
        credentials: ctx.credentials,
        connection: ctx.connection,
        driveId: req.body.driveId || '',
        cursor: req.body.cursor || '',
        name: req.body.name.trim(),
      }),
    );
    if (!folder) return undefined;
    return { ok: true, folder };
  });
}
