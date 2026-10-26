/**
 * Registre des fournisseurs de COMPTES EXTERNES — les comptes qu'un utilisateur
 * relie à myBrief pour que l'application agisse en son nom (envoyer un mail,
 * déposer un document sur son Drive).
 *
 * ── Pourquoi un registre distinct de lib/auth/providers.js ──────────────────
 * Ce sont deux questions différentes. L'identité répond « qui es-tu » et se
 * termine par une session ; une connexion répond « à quel compte myBrief
 * a-t-il accès » et se termine par un refresh token. Les axes ne coïncident
 * même pas : côté identité le fournisseur Microsoft s'appelle `entra` et sert à
 * ouvrir une session ; côté connexions il s'appelle `microsoft` et sert à
 * appeler Graph. Mêmes identifiants OAuth, scopes et cycle de vie différents.
 *
 * Surtout, « utilisable » ne veut pas dire la même chose des deux côtés :
 * `isProviderUsable` (identité) exige `enabled`, parce qu'afficher un bouton de
 * connexion qui échouerait est pire que ne rien afficher. Ici `enabled` est
 * IGNORÉ à dessein : un exploitant peut vouloir que ses utilisateurs relient
 * leur compte Google sans pour autant ouvrir le login Google. Cette divergence
 * existait déjà, cachée dans une fonction locale de routes/mail.js ; elle est
 * désormais nommée.
 *
 * Les endpoints, eux, ne sont pas dupliqués : même IdP, donc délégation au
 * registre d'identité.
 */
import { PROVIDERS } from '../auth/providers.js';
import { OAUTH_STATE_COOKIE } from '../auth/oauthState.js';

/**
 * Envoi seul, et fichiers créés par l'application seulement.
 *
 * `drive.file` ne donne accès qu'aux fichiers et dossiers que myBrief a créés —
 * jamais au reste du Drive. C'est le scope minimal qui permette de déposer un
 * document, et le seul qui n'impose pas la procédure de vérification lourde de
 * Google. Sa contrepartie est décrite dans lib/connections/googleDrive.js.
 */
/**
 * Lecture des NOMS de dossiers, sans le contenu d'aucun fichier.
 *
 * C'est ce qui rend possible la fenêtre de navigation : `drive.file` seul ne
 * montre que ce que myBrief a créé, donc un utilisateur ne pourrait pas
 * désigner un dossier qui existe déjà dans son Drive — il en obtiendrait un
 * homonyme, ce que l'ancien commentaire de lib/connections/googleDrive.js
 * décrivait comme une contrepartie assumée.
 *
 * Ce que ça coûte : c'est un scope « restricted » chez Google. Une app publiée
 * en INTERNE à un tenant Workspace n'a aucune démarche à faire ; une app
 * publique doit passer l'évaluation de sécurité. Une installation qui refuse
 * cette démarche garde une connexion sans ce scope : la navigation lui répond
 * `browse_scope_missing` et l'écran retombe sur la saisie du chemin, qui n'a pas
 * disparu.
 *
 * Ce scope n'est plus DEMANDÉ (cf. `GOOGLE_READONLY_SCOPE` ci-dessous), mais il
 * reste accepté : toutes les connexions nouées avant continuent de parcourir.
 */
const GOOGLE_METADATA_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';

/**
 * Ce qu'exige `drives.list`, la seule API qui ÉNUMÈRE les Drive partagés.
 *
 * Google ne l'ouvre qu'à `drive` (lecture-écriture totale) ou `drive.readonly` :
 * `drive.metadata.readonly` ne suffit pas, quoi qu'il permette par ailleurs. On
 * prend le moindre des deux — lecture seule.
 *
 * Ce que ça change par rapport à `drive.metadata.readonly` : la lecture du
 * CONTENU des fichiers devient possible (myBrief ne le fait pas, mais le
 * consentement l'annonce). Ce que ça ne change pas : les deux sont « restricted »
 * chez Google, donc le palier de vérification de l'installation est le même.
 *
 * Il remplace `GOOGLE_METADATA_SCOPE` dans la demande — les demander tous les
 * deux afficherait deux lignes redondantes sur l'écran de consentement.
 * Conséquence assumée : une connexion existante ne porte pas ce scope, donc la
 * fenêtre ne lui montre QUE « Mon Drive » jusqu'à reconnexion. Elle continue de
 * parcourir et de déposer — c'est la même dégradation silencieuse que côté
 * Microsoft pour les sites SharePoint.
 */
const GOOGLE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.file',
  GOOGLE_READONLY_SCOPE,
].join(' ');

/**
 * Bibliothèques SharePoint, en lecture ET en écriture.
 *
 * `Files.ReadWrite` s'arrête au OneDrive personnel : sans ce scope, ni les
 * sites ni leurs bibliothèques ne sont visibles, et un dépôt vers l'un d'eux
 * échoue en 403.
 *
 * ⚠️ Il est demandé à CHAQUE liaison, et Entra ne consent pas à moitié : un
 * annuaire qui ne l'a pas consenti refuse la liaison ENTIÈRE (AADSTS90094,
 * AADSTS65001), OneDrive compris. Et son réglage par défaut — « Laisser
 * Microsoft gérer vos paramètres de consentement » — le réserve aux
 * administrateurs, donc le consentement administrateur est la règle, pas le cas
 * particulier. Le repli vers le seul OneDrive (`sharedDrivesScope` ci-dessous)
 * ne décrit donc PAS un tenant qui refuse — il n'y a chez lui aucune connexion
 * vivante — mais les seules connexions nouées AVANT l'ajout de ce scope.
 */
const MICROSOFT_BROWSE_SCOPE = 'https://graph.microsoft.com/Sites.ReadWrite.All';

export const CONNECT_PROVIDERS = {
  google: {
    id: 'google',
    label: 'Google',

    /** Marqueur relu au retour : un state émis par un autre flux ne vaut pas ici. */
    flow: 'connect-google',

    /**
     * Cookie d'état propre aux connexions : le login peut être en vol dans le
     * même navigateur, les deux ne doivent pas s'écraser. Nom libre — contrairement
     * au flux Microsoft, ce callback vit sous `/api` et n'est routé par aucune
     * règle Traefik qui inspecterait les cookies.
     */
    stateCookieName: 'mybrief_oauth_connect',

    /**
     * URI de redirection HISTORIQUE. Elle est déjà déclarée dans la console
     * Google Cloud de chaque installation ; la renommer casserait la connexion
     * de tout le monde jusqu'à ce que chaque console soit mise à jour, pour un
     * gain purement cosmétique. Le chemin dit « mail », la connexion couvre
     * aussi le Drive — c'est le prix d'une URI publiée.
     */
    callbackPath: '/api/mail/google/callback',

    scopes: GOOGLE_SCOPES,

    /** Présence de ce scope dans une connexion = le dépôt Drive est possible. */
    driveScope: 'https://www.googleapis.com/auth/drive.file',

    /**
     * Présence de L'UN de ces scopes = la fenêtre de navigation peut montrer
     * les dossiers EXISTANTS. Distinct de `driveScope` parce qu'une connexion
     * peut parfaitement déposer sans pouvoir parcourir — c'est le cas de toutes
     * celles nouées avant l'arrivée de la fenêtre.
     *
     * Une LISTE et non une valeur : `drive.readonly` a remplacé
     * `drive.metadata.readonly` dans la demande, et les connexions nouées avant
     * ce changement ne doivent pas perdre la navigation pour autant.
     */
    browseScopes: [GOOGLE_METADATA_SCOPE, GOOGLE_READONLY_SCOPE],

    /**
     * Présence de ce scope = `drives.list` répond, donc les Drive partagés
     * peuvent être ÉNUMÉRÉS. Sans lui la fenêtre n'offre que « Mon Drive ».
     */
    sharedDrivesScope: GOOGLE_READONLY_SCOPE,

    /** « Mon Drive » PUIS les Drive partagés où l'utilisateur peut déposer. */
    multiDrive: true,

    /**
     * Sans `access_type=offline`, Google n'émet aucun refresh token ; sans
     * `prompt=consent`, il ne le renvoie qu'à la toute première autorisation —
     * se reconnecter après une déconnexion ne rendrait alors rien.
     */
    extraParams: { access_type: 'offline', prompt: 'consent' },

    /** Clé des identifiants OAuth dans `appSettings` (document `auth`). */
    credentialsKey: 'google',

    /**
     * Google expose un endpoint de révocation. Tous les fournisseurs n'en ont
     * pas — chez Microsoft, seul l'utilisateur peut retirer l'accès depuis son
     * compte, et myBrief ne peut qu'oublier le jeton de son côté.
     */
    revocable: true,

    // Même IdP que le login Google : un seul endroit décrit ses endpoints.
    discoveryUrlOf: (conf) => PROVIDERS.google.discoveryUrlOf(conf),
    fallbackEndpoints: PROVIDERS.google.fallbackEndpoints,
    emailOf: (profile) => PROVIDERS.google.emailOf(profile),
  },

  microsoft: {
    id: 'microsoft',
    label: 'Microsoft',

    flow: 'connect-microsoft',

    /**
     * MÊME cookie que le login, contrairement à Google — et ce n'est pas un
     * oubli.
     *
     * Le callback Microsoft doit reprendre `/oauth2/callback` (voir ci-dessous),
     * et le routeur Traefik qui amène cette URI à l'API la reconnaît à la
     * présence du cookie `mybrief_oauth` :
     *
     *   HeaderRegexp(`Cookie`, `(^|;\s*)mybrief_oauth=`)
     *
     * L'ancre se termine par `=` : un cookie nommé `mybrief_oauth_connect` ne
     * matcherait PAS, et le retour d'autorisation tomberait sur le plugin OIDC
     * au lieu de l'API. Élargir la règle demanderait de toucher les labels des
     * composes, dont ceux en Traefik v2.11 où une erreur de matcher retire
     * le routeur SILENCIEUSEMENT. On préfère partager le cookie.
     *
     * Ce que ça coûte : si un login Entra et une connexion Microsoft sont en vol
     * dans le même navigateur au même instant, le second cookie écrase le
     * premier et l'un des deux flux échoue en `state_mismatch` — re-tentable
     * d'un clic. Le cas suppose de démarrer une connexion alors qu'on n'est pas
     * encore connecté, ce que l'interface ne propose pas.
     *
     * Les deux flux restent distingués côté serveur par le marqueur de flux
     * inscrit en base (cf. routes/oauth2.js).
     */
    stateCookieName: OAUTH_STATE_COOKIE,

    /**
     * URI héritée, imposée par les installations on-prem : elle est la seule
     * enregistrée dans leur app registration Entra, et nous n'avons pas les
     * droits d'en déclarer une autre (cf. lib/auth/providers.js).
     */
    callbackPath: '/oauth2/callback',

    /**
     * `offline_access` est ce qui déclenche l'émission d'un refresh token chez
     * Microsoft — l'équivalent d'`access_type=offline` chez Google. Entra
     * redemande le consentement de lui-même quand les scopes changent : pas
     * besoin de forcer `prompt`.
     */
    scopes: [
      'openid',
      'email',
      'offline_access',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/Files.ReadWrite',
      MICROSOFT_BROWSE_SCOPE,
    ].join(' '),

    driveScope: 'https://graph.microsoft.com/Files.ReadWrite',

    /**
     * VIDE, et ce n'est pas un oubli — contrairement à Google, parcourir
     * n'exige rien de plus que déposer : `Files.ReadWrite` n'est pas restreint
     * aux fichiers créés par l'app, il voit tout le OneDrive personnel.
     *
     * `Sites.ReadWrite.All` était listé ici, et c'était une erreur de sens :
     * `resolveStorageAccess` en faisait une CONDITION de la fenêtre, qui
     * répondait `browse_scope_missing` — donc fermée — à toute connexion sans
     * ce scope (consentement administrateur refusé par le tenant, ou connexion
     * antérieure à son ajout), alors que le OneDrive était parfaitement
     * parcourable. Le scope SharePoint n'ajoute que des bibliothèques à la
     * liste : c'est le rôle de `sharedDrivesScope`, ci-dessous.
     */
    browseScopes: [],

    /**
     * Présence de ce scope = `followedSites` répond, donc les bibliothèques
     * SharePoint peuvent être ÉNUMÉRÉES. Sans lui la fenêtre n'offre que le
     * OneDrive — et le DIT (`sharedDrivesMissing`), au lieu de laisser croire
     * que la personne ne suit aucun site.
     */
    sharedDrivesScope: MICROSOFT_BROWSE_SCOPE,

    /**
     * Le seul scope que l'administration peut RETIRER de la demande
     * (`actions.connections.sharepoint`), et il n'y en a pas d'autre.
     *
     * C'est le seul dont un annuaire refuse couramment le consentement — il
     * ouvre « tous les sites SharePoint auxquels la personne a accès », ce
     * qu'une DSI lit comme un droit très large —, et le seul dont l'absence
     * dégrade sans casser : le OneDrive reste entier. Le retirer rend possible
     * une liaison chez qui refuse ce droit, au prix des bibliothèques.
     */
    optionalScope: MICROSOFT_BROWSE_SCOPE,

    /** OneDrive personnel ET bibliothèques des sites SharePoint : il faut choisir. */
    multiDrive: true,

    extraParams: {},

    /** Mêmes identifiants que le login Entra : une seule app registration. */
    credentialsKey: 'entra',

    /**
     * Microsoft n'expose aucun endpoint de révocation de refresh token : seul
     * l'utilisateur peut retirer l'accès, depuis myaccount.microsoft.com.
     * Déconnecter ne peut donc qu'oublier le jeton côté myBrief.
     */
    revocable: false,

    // Même annuaire que le login Entra : endpoints et lecture du profil délégués.
    discoveryUrlOf: (conf) => PROVIDERS.entra.discoveryUrlOf(conf),
    fallbackEndpoints: PROVIDERS.entra.fallbackEndpoints,
    emailOf: (profile) => PROVIDERS.entra.emailOf(profile),
  },
};

/**
 * Scopes que CETTE installation demande, une fois son réglage appliqué.
 *
 * Le registre décrit ce que myBrief sait faire ; cette fonction décrit ce que
 * l'organisation a choisi de demander. La distinction compte : `provider.scopes`
 * reste la liste complète, et sert de référence à qui veut savoir ce qui est
 * retirable.
 *
 * `sharepoint` n'est honoré qu'à FAUX explicite. Un document `actions` antérieur
 * à ce réglage n'a pas le champ : il vaut « demander », donc une installation
 * déjà en service ne perd rien au déploiement.
 *
 * @param {object} provider - entrée de CONNECT_PROVIDERS
 * @param {{sharepoint?: boolean}} [connections] - `actions.connections`
 * @returns {string[]}
 */
export function connectScopeList(provider, connections = {}) {
  const asked = String(provider?.scopes || '')
    .split(' ')
    .filter(Boolean);
  const optional = provider?.optionalScope;
  if (!optional || connections?.sharepoint !== false) return asked;
  return asked.filter((scope) => scope !== optional);
}

/** Même chose, sous la forme attendue par le point d'autorisation. */
export function connectScopes(provider, connections = {}) {
  return connectScopeList(provider, connections).join(' ');
}

/**
 * Les bibliothèques partagées sont-elles PROPOSÉES par cette installation ?
 *
 * Ce qui distingue « l'administration ne les demande pas » de « la connexion
 * n'a pas le scope » : dans le premier cas il n'y a rien à signaler à
 * l'utilisateur — SharePoint ne fait pas partie de cette installation —, dans
 * le second une reconnexion les rendrait (cf. `sharedDrivesMissing`).
 *
 * @param {object} provider - entrée de CONNECT_PROVIDERS
 * @param {{sharepoint?: boolean}} [connections] - `actions.connections`
 */
export function sharedDrivesOffered(provider, connections = {}) {
  const scope = provider?.sharedDrivesScope;
  return !!scope && connectScopeList(provider, connections).includes(scope);
}

/**
 * Forme comparable d'un scope : décodé, en minuscules. Les fournisseurs ne
 * garantissent ni la casse ni l'encodage de ce qu'ils renvoient (cf. `hasScope`).
 */
function scopeKey(scope) {
  let value = String(scope || '').trim();
  try {
    value = decodeURIComponent(value);
  } catch (_) {
    // Un « % » isolé n'est pas un encodage : on compare la chaîne telle quelle.
  }
  return value.toLowerCase();
}

/** Dernier segment d'une URI de scope : `Files.ReadWrite`, `drive.file`. */
const scopeTail = (key) => key.slice(key.lastIndexOf('/') + 1);

/**
 * Un scope ACCORDÉ compte-t-il pour le scope ATTENDU ?
 *
 * Ce que la connexion mémorise est la liste renvoyée par le token endpoint —
 * ce que le fournisseur a réellement accordé — et cette liste ne reprend pas
 * forcément la forme demandée. Google rend l'URI complète
 * (`https://www.googleapis.com/auth/drive.file`). Entra, lui, rend selon les
 * tenants le nom COURT de la permission (`Files.ReadWrite`), l'URI complète,
 * ou cette URI encodée (`https%3A%2F%2Fgraph.microsoft.com%2FFiles.ReadWrite`),
 * sans garantie de casse. Comparer à l'identique (`scopes.includes(...)`)
 * rendait `driveReady` faux pour une connexion Microsoft pourtant complète :
 * « reconnectez votre compte » en boucle, et `storage_scope_missing` à chaque
 * dépôt — un défaut qu'aucun test ne voyait, puisque les tests écrivent la
 * forme longue.
 *
 * D'où deux comparaisons : la forme normalisée, puis le dernier segment de
 * l'URI. Le segment est sans ambiguïté chez les deux fournisseurs
 * (`drive.file` ≠ `drive.readonly` ≠ `drive.metadata.readonly` ;
 * `Files.ReadWrite` ≠ `Files.ReadWrite.All`) — et c'est aussi ce qui fait
 * qu'une connexion Gmail historique, qui n'a mémorisé que `gmail.send`,
 * reste reconnue.
 *
 * @param {string[]|null|undefined} granted - scopes mémorisés sur la connexion
 * @param {string} wanted - scope du registre (forme longue)
 */
export function hasScope(granted, wanted) {
  const want = scopeKey(wanted);
  if (!want) return false;
  const wantTail = scopeTail(want);
  return (Array.isArray(granted) ? granted : []).some((scope) => {
    const key = scopeKey(scope);
    return key === want || scopeTail(key) === wantTail;
  });
}

/** L'UN des scopes attendus est accordé — pour les listes comme `browseScopes`. */
export function hasAnyScope(granted, wanted) {
  return (Array.isArray(wanted) ? wanted : []).some((scope) => hasScope(granted, scope));
}

/**
 * Identifiants OAuth utilisables pour relier un compte.
 *
 * Exige clientId ET clientSecret, mais PAS `enabled` : ce drapeau ne gouverne
 * que le bouton de connexion à l'application (cf. en-tête de fichier).
 *
 * @param {object} provider - entrée de CONNECT_PROVIDERS
 * @param {object} authSettings - document `auth` de appSettings (secrets inclus)
 * @returns {{clientId: string, clientSecret: string}|null}
 */
export function connectionCredentials(provider, authSettings) {
  const conf = authSettings?.[provider?.credentialsKey];
  if (!conf?.clientId || !conf?.clientSecret) return null;
  // Entra sans URL de découverte n'a pas d'annuaire à interroger.
  if (!provider.fallbackEndpoints && !provider.discoveryUrlOf(conf)) return null;
  return conf;
}

/**
 * Fournisseur retenu pour cette installation.
 *
 * `google` par défaut : sur une installation qui n'a jamais rien réglé, c'est
 * le comportement d'avant l'existence de ce réglage — un bouton « Connecter mon
 * compte Google » dès que les identifiants Google sont saisis.
 *
 * @param {string} configured - `actions.connections.provider` (peut être vide)
 * @returns {object} entrée de CONNECT_PROVIDERS
 */
export function effectiveProvider(configured) {
  return CONNECT_PROVIDERS[configured] || CONNECT_PROVIDERS.google;
}
