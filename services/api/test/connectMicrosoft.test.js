/**
 * Connexion d'un compte Microsoft — le cas qui partage son URI de retour avec
 * le login Entra.
 *
 * `/oauth2/callback` est la seule URI déclarable sur les installations on-prem
 * (cf. lib/connections/providers.js). Deux flux y reviennent donc, et le
 * dispatcher doit envoyer chacun au bon handler sans jamais confondre : router
 * un retour de connexion vers le login ouvrirait une session à la place d'un
 * enregistrement de jeton, et router un login vers la connexion l'échouerait.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, userDoc, identityHeaders } from './helpers.js';
import { resetDiscoveryCache } from '../lib/auth/oidcClient.js';
import { CONNECT_PROVIDERS } from '../lib/connections/providers.js';
import { OAUTH_STATE_COOKIE } from '../lib/auth/oauthState.js';

const CLIENT_ID = 'entra-client';
const CLIENT_SECRET = 'entra-secret';
const DISCOVERY = 'https://login.microsoftonline.test/tenant/v2.0/.well-known/openid-configuration';
const USER = 'simple@client.fr';
const MS_ACCOUNT = 'simple@client.fr';
const DRIVE_SCOPE = CONNECT_PROVIDERS.microsoft.driveScope;

const seed = (provider = 'microsoft', connections = {}) => ({
  user: [userDoc(USER)],
  appSettings: [
    {
      key: 'auth',
      entra: {
        enabled: true,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        discoveryUrl: DISCOVERY,
      },
      allowedDomains: ['client.fr'],
    },
    { key: 'actions', connections: { provider, ...connections } },
  ],
});

function mockEntra({ refreshToken = 'rt-ms', scope = `openid email ${DRIVE_SCOPE}` } = {}) {
  return vi.fn(async (url) => {
    const target = String(url);
    if (target.includes('.well-known/openid-configuration')) {
      return {
        ok: true,
        json: async () => ({
          authorization_endpoint: 'https://login.microsoftonline.test/tenant/authorize',
          token_endpoint: 'https://login.microsoftonline.test/tenant/token',
          userinfo_endpoint: 'https://graph.microsoftonline.test/userinfo',
        }),
      };
    }
    if (target.includes('/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'at-ms',
          scope,
          ...(refreshToken ? { refresh_token: refreshToken } : {}),
        }),
      };
    }
    if (target.includes('/userinfo')) {
      return { ok: true, json: async () => ({ sub: '7', preferred_username: MS_ACCOUNT }) };
    }
    throw new Error(`URL inattendue: ${target}`);
  });
}

async function startFlow(app) {
  const res = await app.inject({
    method: 'GET',
    url: '/api/connect/start',
    headers: identityHeaders(USER),
  });
  const setCookie = String(res.headers['set-cookie']);
  const state = new RegExp(`${OAUTH_STATE_COOKIE}=([^;]*)`).exec(setCookie)?.[1] || '';
  return { res, state, location: res.headers.location };
}

const callback = (app, { state, email = USER }) =>
  app.inject({
    method: 'GET',
    url: `/oauth2/callback?state=${encodeURIComponent(state)}&code=code-ms`,
    headers: {
      ...identityHeaders(email),
      cookie: `${OAUTH_STATE_COOKIE}=${state}`,
    },
  });

beforeEach(() => resetDiscoveryCache());
afterEach(() => vi.unstubAllGlobals());

describe('connexion d’un compte Microsoft', () => {
  it('demande Mail.Send, Files.ReadWrite et offline_access', async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app } = buildTestApp({ seed: seed() });
    const { location } = await startFlow(app);

    const url = new URL(location);
    const scopes = url.searchParams.get('scope');
    expect(scopes).toContain('Mail.Send');
    expect(scopes).toContain('Files.ReadWrite');
    // Sans offline_access, Microsoft n'émet aucun refresh token et la connexion
    // mourrait à l'expiration du premier access token.
    expect(scopes).toContain('offline_access');
    expect(url.searchParams.get('redirect_uri')).toContain('/oauth2/callback');
  });

  it('demande Sites.ReadWrite.All tant que l’administration ne l’a pas coupé', async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app } = buildTestApp({ seed: seed() });
    const { location } = await startFlow(app);

    expect(new URL(location).searchParams.get('scope')).toContain('Sites.ReadWrite.All');
  });

  it('retire Sites.ReadWrite.All de la demande quand l’administration le coupe', async () => {
    // Un annuaire qui refuse ce droit refuse la liaison ENTIÈRE (AADSTS90094) :
    // le retirer est ce qui rend le OneDrive atteignable chez lui.
    vi.stubGlobal('fetch', mockEntra());
    const { app } = buildTestApp({ seed: seed('microsoft', { sharepoint: false }) });
    const { location } = await startFlow(app);

    const scopes = new URL(location).searchParams.get('scope');
    expect(scopes).not.toContain('Sites.ReadWrite.All');
    expect(scopes).toContain('Mail.Send');
    expect(scopes).toContain('Files.ReadWrite');
    expect(scopes).toContain('offline_access');
  });

  it('enregistre la connexion au retour sur le callback partagé', async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app, db } = buildTestApp({ seed: seed() });
    const { state } = await startFlow(app);
    const res = await callback(app, { state });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/#config');
    const doc = db.data.get('userConnections')[0];
    expect(doc.provider).toBe('microsoft');
    expect(doc.account).toBe(MS_ACCOUNT);
    expect(doc.refreshToken).toBe('rt-ms');
    expect(doc.scopes).toContain(DRIVE_SCOPE);
  });

  it("n'ouvre PAS de session : une connexion n'est pas un login", async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app, db } = buildTestApp({ seed: seed() });
    const { state } = await startFlow(app);
    const res = await callback(app, { state });

    // Le flux de login poserait un cookie de session et créerait un document
    // authSession. Ici, rien : on n'a fait qu'enregistrer un jeton.
    expect(String(res.headers['set-cookie'] || '')).not.toContain('mybrief_sess=');
    expect(db.data.get('authSession') || []).toHaveLength(0);
  });

  it('un login Entra reste routé vers le login malgré le partage d’URI', async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app, db } = buildTestApp({ seed: seed() });

    // Départ d'un LOGIN (et non d'une connexion) : même cookie, autre marqueur.
    const start = await app.inject({ method: 'GET', url: '/api/auth/entra/start' });
    const state =
      new RegExp(`${OAUTH_STATE_COOKIE}=([^;]*)`).exec(String(start.headers['set-cookie']))?.[1] ||
      '';

    const res = await app.inject({
      method: 'GET',
      url: `/oauth2/callback?state=${encodeURIComponent(state)}&code=code-login`,
      headers: { cookie: `${OAUTH_STATE_COOKIE}=${state}` },
    });

    // Le login, lui, ouvre bien une session native.
    expect(String(res.headers['set-cookie'] || '')).toContain('mybrief_sess=');
    expect(db.data.get('authSession')).toHaveLength(1);
    expect(db.data.get('userConnections') || []).toHaveLength(0);
  });

  it('refuse une session différente de celle qui a démarré le flux', async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app, db } = buildTestApp({
      seed: {
        ...seed(),
        user: [userDoc(USER), userDoc('autre@client.fr')],
      },
    });
    const { state } = await startFlow(app);
    const res = await callback(app, { state, email: 'autre@client.fr' });

    expect(res.headers.location).toContain('connectError=connect_session_mismatch');
    expect(db.data.get('userConnections') || []).toHaveLength(0);
  });

  it('envoie le mail via Graph quand la connexion est Microsoft', async () => {
    const { app, graphSend, gmailSend, mailer } = buildTestApp({
      seed: {
        ...seed(),
        userConnections: [
          {
            emailLower: USER,
            provider: 'microsoft',
            account: MS_ACCOUNT,
            refreshToken: 'rt-ms',
            scopes: ['openid', 'email', DRIVE_SCOPE],
          },
        ],
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions/email',
      headers: { ...identityHeaders(USER), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'summary', title: 'CR', content: '<p>x</p>', lang: 'fr' }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().via).toBe('microsoft');
    expect(graphSend.calls).toHaveLength(1);
    expect(graphSend.calls[0].refreshToken).toBe('rt-ms');
    expect(graphSend.calls[0].credentials.clientId).toBe(CLIENT_ID);
    expect(graphSend.calls[0].to).toEqual([USER]);
    // Ni Gmail ni le relais SMTP ne sont sollicités.
    expect(gmailSend.calls).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("le fournisseur vient de l'installation, pas du client", async () => {
    // Installation réglée sur Google : demander une connexion doit partir chez
    // Google, quoi qu'il arrive — un client ne choisit pas son fournisseur.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const target = String(url);
        if (target.includes('.well-known')) {
          return {
            ok: true,
            json: async () => ({
              authorization_endpoint: 'https://accounts.google.test/auth',
              token_endpoint: 'https://oauth2.google.test/token',
              userinfo_endpoint: 'https://openid.google.test/userinfo',
            }),
          };
        }
        throw new Error(`URL inattendue: ${target}`);
      }),
    );
    const withGoogle = seed('google');
    withGoogle.appSettings[0].google = {
      enabled: true,
      clientId: 'g-id',
      clientSecret: 'g-secret',
    };
    const { app } = buildTestApp({ seed: withGoogle });
    const { location } = await startFlow(app);

    expect(location).toContain('accounts.google.test');
    expect(new URL(location).searchParams.get('scope')).toContain('gmail.send');
  });
});

/**
 * Le cas des installations restées sur le plugin OIDC Traefik — Fabrikam,
 * Globex.
 *
 * Leurs utilisateurs sont authentifiés PAR EN-TÊTE et n'ont pas de cookie
 * `mybrief_sess`. Or le routeur qui amène sur `/oauth2/callback` porte
 * `noident`, qui efface ces en-têtes et pose `x-mybrief-auth-path: native`.
 * Le callback n'y voit donc AUCUNE session.
 *
 * Les tests ci-dessus ne reproduisaient pas cette condition : ils passent tous
 * `identityHeaders`, donc une identité était toujours résolue. C'est ce trou qui
 * a laissé passer une régression où la connexion d'une boîte Microsoft était
 * impossible pour tous les comptes SSO de ces installations.
 */
describe('connexion Microsoft derrière le plugin OIDC (noident)', () => {
  beforeEach(() => resetDiscoveryCache());
  afterEach(() => vi.unstubAllGlobals());

  /** Retour tel que Traefik le présente sous `noident` : aucune identité. */
  const callbackWithoutIdentity = (app, state) =>
    app.inject({
      method: 'GET',
      url: `/oauth2/callback?state=${encodeURIComponent(state)}&code=code-ms`,
      headers: {
        // Posé par le middleware `noident` : disqualifie l'identité par en-tête
        // (cf. lib/auth/resolve.js). Aucun cookie de session par ailleurs.
        'x-mybrief-auth-path': 'native',
        cookie: `${OAUTH_STATE_COOKIE}=${state}`,
      },
    });

  it('enregistre la connexion malgré l’absence de session', async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app, db } = buildTestApp({ seed: seed() });
    const { state } = await startFlow(app);

    const res = await callbackWithoutIdentity(app, state);

    expect(res.headers.location).toBe('/#config');
    const docs = db.data.get('userConnections') || [];
    expect(docs).toHaveLength(1);
    // Rattachée au compte qui a DÉMARRÉ le flux, lu dans le document d'état.
    expect(docs[0].emailLower).toBe(USER);
    expect(docs[0].account).toBe(MS_ACCOUNT);
  });

  it('refuse un state dépourvu de propriétaire', async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app, db } = buildTestApp({ seed: seed() });
    // Un state de connexion sans `meta.emailLower` ne peut pas venir de
    // /connect/start : il n'y a personne à qui rattacher la boîte.
    const { state } = await app.oauthStates.issue({
      codeVerifier: 'v',
      redirectUri: 'https://x/oauth2/callback',
      provider: CONNECT_PROVIDERS.microsoft.flow,
    });

    const res = await callbackWithoutIdentity(app, state);

    expect(res.headers.location).toContain('connectError=connect_state_mismatch');
    expect(db.data.get('userConnections') || []).toHaveLength(0);
  });

  it('refuse toujours une session DIFFÉRENTE quand il y en a une', async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app, db } = buildTestApp({
      seed: { ...seed(), user: [userDoc(USER), userDoc('autre@client.fr')] },
    });
    const { state } = await startFlow(app);

    // Le garde-fou reste utile — onglet resté ouvert sur un poste partagé — il
    // ne conditionne simplement plus la fonctionnalité.
    const res = await callback(app, { state, email: 'autre@client.fr' });

    expect(res.headers.location).toContain('connectError=connect_session_mismatch');
    expect(db.data.get('userConnections') || []).toHaveLength(0);
  });
});

/**
 * Ce qu'Entra rend au token endpoint n'est pas ce que le registre demande :
 * selon les tenants, les scopes reviennent sous leur nom COURT
 * (`Files.ReadWrite`) et non sous l'URI `https://graph.microsoft.com/…`.
 * Sans reconnaissance de cette forme, `driveReady` restait faux pour toute
 * connexion Microsoft complète : « reconnectez votre compte » en boucle.
 */
describe('scopes accordés par Entra, sous leur forme courte', () => {
  beforeEach(() => resetDiscoveryCache());
  afterEach(() => vi.unstubAllGlobals());

  const status = (app) =>
    app.inject({ method: 'GET', url: '/api/connect/status', headers: identityHeaders(USER) });

  it('déclare le dépôt prêt après un callback qui rend les noms courts', async () => {
    vi.stubGlobal(
      'fetch',
      mockEntra({ scope: 'openid email offline_access Mail.Send Files.ReadWrite' }),
    );
    const { app } = buildTestApp({ seed: seed() });
    const { state } = await startFlow(app);
    await callback(app, { state });

    const res = await status(app);
    expect(res.json().provider).toMatchObject({
      id: 'microsoft',
      connected: true,
      account: MS_ACCOUNT,
      driveReady: true,
    });
  });

  it('déclare le dépôt prêt sur une connexion déjà mémorisée avec les noms courts', async () => {
    const { app } = buildTestApp({
      seed: {
        ...seed(),
        userConnections: [
          {
            emailLower: USER,
            provider: 'microsoft',
            account: MS_ACCOUNT,
            refreshToken: 'rt-ms',
            scopes: ['openid', 'email', 'Mail.Send', 'Files.ReadWrite'],
          },
        ],
      },
    });
    const res = await status(app);
    expect(res.json().provider.driveReady).toBe(true);
  });

  it('reste honnête : sans Files.ReadWrite, le dépôt n’est pas prêt', async () => {
    const { app } = buildTestApp({
      seed: {
        ...seed(),
        userConnections: [
          {
            emailLower: USER,
            provider: 'microsoft',
            account: MS_ACCOUNT,
            refreshToken: 'rt-ms',
            scopes: ['openid', 'email', 'Mail.Send'],
          },
        ],
      },
    });
    const res = await status(app);
    expect(res.json().provider).toMatchObject({ connected: true, driveReady: false });
  });
});
