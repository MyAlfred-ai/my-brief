/**
 * Reconnaissance des scopes accordés (lib/connections/providers.js).
 *
 * Le registre décrit chaque scope sous sa forme LONGUE ; ce que le fournisseur
 * renvoie au token endpoint — et que la connexion mémorise — ne l'est pas
 * toujours. Entra rend selon les tenants le nom court de la permission, l'URI
 * complète, ou cette URI encodée. Une comparaison à l'identique rendait
 * `driveReady` faux pour une connexion Microsoft pourtant complète, sans
 * qu'aucun test ne le voie : ils écrivent tous la forme longue.
 */
import { describe, it, expect } from 'vitest';
import {
  hasScope,
  hasAnyScope,
  connectScopes,
  connectScopeList,
  sharedDrivesOffered,
  CONNECT_PROVIDERS,
} from '../lib/connections/providers.js';

const GRAPH_FILES = CONNECT_PROVIDERS.microsoft.driveScope;
const GRAPH_SITES = CONNECT_PROVIDERS.microsoft.sharedDrivesScope;
const GOOGLE_FILE = CONNECT_PROVIDERS.google.driveScope;

describe('hasScope', () => {
  it('reconnaît la forme longue, telle que le registre la demande', () => {
    expect(hasScope(['openid', GRAPH_FILES], GRAPH_FILES)).toBe(true);
    expect(hasScope(['openid', GOOGLE_FILE], GOOGLE_FILE)).toBe(true);
  });

  it('reconnaît le nom COURT rendu par Entra', () => {
    // `scope: "openid email Mail.Send Files.ReadWrite"` — sans le préfixe
    // https://graph.microsoft.com/ de la demande.
    expect(hasScope(['openid', 'email', 'Mail.Send', 'Files.ReadWrite'], GRAPH_FILES)).toBe(true);
  });

  it('reconnaît l’URI encodée', () => {
    expect(hasScope(['https%3A%2F%2Fgraph.microsoft.com%2FFiles.ReadWrite'], GRAPH_FILES)).toBe(
      true,
    );
  });

  it('ignore la casse', () => {
    expect(hasScope(['files.readwrite'], GRAPH_FILES)).toBe(true);
    expect(hasScope(['HTTPS://GRAPH.MICROSOFT.COM/FILES.READWRITE'], GRAPH_FILES)).toBe(true);
  });

  it('ne confond pas un scope avec son voisin de nom', () => {
    // `.All` n'est pas `Files.ReadWrite` ; `drive.readonly` n'est pas `drive.file`.
    expect(hasScope(['Files.ReadWrite.All'], GRAPH_FILES)).toBe(false);
    expect(hasScope([GRAPH_FILES], GRAPH_SITES)).toBe(false);
    expect(hasScope(['https://www.googleapis.com/auth/drive.readonly'], GOOGLE_FILE)).toBe(false);
    expect(hasScope(['https://www.googleapis.com/auth/drive.metadata.readonly'], GOOGLE_FILE)).toBe(
      false,
    );
  });

  it('reconnaît une connexion Gmail historique qui n’a mémorisé que `gmail.send`', () => {
    expect(hasScope(['gmail.send'], 'https://www.googleapis.com/auth/gmail.send')).toBe(true);
  });

  it('rend faux sur une liste absente, vide, ou un scope attendu vide', () => {
    expect(hasScope(undefined, GRAPH_FILES)).toBe(false);
    expect(hasScope(null, GRAPH_FILES)).toBe(false);
    expect(hasScope([], GRAPH_FILES)).toBe(false);
    expect(hasScope([GRAPH_FILES], '')).toBe(false);
    expect(hasScope(['%E0%A4%A'], GRAPH_FILES)).toBe(false);
  });
});

describe('hasAnyScope', () => {
  it('accepte l’UN des scopes de la liste — navigation Google historique comprise', () => {
    const browse = CONNECT_PROVIDERS.google.browseScopes;
    expect(hasAnyScope(['https://www.googleapis.com/auth/drive.metadata.readonly'], browse)).toBe(
      true,
    );
    expect(hasAnyScope(['https://www.googleapis.com/auth/drive.readonly'], browse)).toBe(true);
    expect(hasAnyScope([GOOGLE_FILE], browse)).toBe(false);
    expect(hasAnyScope([GOOGLE_FILE], [])).toBe(false);
  });
});

describe('registre Microsoft', () => {
  it('ne conditionne pas la navigation au scope SharePoint : OneDrive suffit', () => {
    // Exiger Sites.ReadWrite.All fermait la fenêtre (`browse_scope_missing`)
    // à toute connexion qui ne l'avait pas obtenu, alors que le OneDrive était
    // parcourable. Le scope ne fait qu'ALLONGER la liste des bibliothèques.
    expect(CONNECT_PROVIDERS.microsoft.browseScopes).toEqual([]);
    expect(CONNECT_PROVIDERS.microsoft.sharedDrivesScope).toBe(
      'https://graph.microsoft.com/Sites.ReadWrite.All',
    );
    expect(CONNECT_PROVIDERS.microsoft.scopes).toContain('Sites.ReadWrite.All');
  });
});

describe('connectScopes — ce que CETTE installation demande', () => {
  const microsoft = CONNECT_PROVIDERS.microsoft;
  const google = CONNECT_PROVIDERS.google;

  it('demande tout par défaut, y compris pour un document antérieur au réglage', () => {
    // Le champ absent vaut « demander » : déployer cette version ne retire
    // SharePoint à aucune installation en service.
    expect(connectScopes(microsoft, {})).toBe(microsoft.scopes);
    expect(connectScopes(microsoft, undefined)).toBe(microsoft.scopes);
    expect(connectScopes(microsoft, { provider: 'microsoft' })).toBe(microsoft.scopes);
    expect(connectScopes(microsoft, { sharepoint: true })).toBe(microsoft.scopes);
  });

  it('retire Sites.ReadWrite.All à FAUX explicite, et lui seul', () => {
    const asked = connectScopeList(microsoft, { sharepoint: false });
    expect(asked).not.toContain(GRAPH_SITES);
    expect(asked).toContain(GRAPH_FILES);
    expect(asked).toContain('https://graph.microsoft.com/Mail.Send');
    expect(asked).toContain('offline_access');
  });

  it('ne touche à rien chez Google : aucun scope n’y est retirable', () => {
    expect(google.optionalScope).toBeUndefined();
    expect(connectScopes(google, { sharepoint: false })).toBe(google.scopes);
  });
});

describe('sharedDrivesOffered — « demandé » n’est pas « accordé »', () => {
  it('distingue le réglage de l’administration du scope de la connexion', () => {
    // Faux quand l'installation ne demande pas le scope : inviter à
    // reconnecter son compte ne rendrait rien, il n'y a rien à signaler.
    expect(sharedDrivesOffered(CONNECT_PROVIDERS.microsoft, { sharepoint: false })).toBe(false);
    expect(sharedDrivesOffered(CONNECT_PROVIDERS.microsoft, {})).toBe(true);
    // Google n'a pas de réglage : ses Drive partagés restent proposés.
    expect(sharedDrivesOffered(CONNECT_PROVIDERS.google, { sharepoint: false })).toBe(true);
  });
});
