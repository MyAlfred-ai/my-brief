import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTestApp,
  createFakeDb,
  userDoc,
  identityHeaders,
  sessionCookieHeaders,
} from './helpers.js';
import { resetDiscoveryCache } from '../lib/auth/oidcClient.js';
import { createSettingsRepo, toPublicSettings } from '../lib/repositories/settings.js';
import { isProviderUsable } from '../lib/auth/providers.js';

const TENANT = '11111111-2222-3333-4444-555555555555';
const DISCOVERY_URL = `https://login.microsoftonline.com/${TENANT}/v2.0/.well-known/openid-configuration`;
const CLIENT_ID = 'app-registration-client-id';
const CLIENT_SECRET = 'entra-secret-value';

const settingsSeed = (overrides = {}) => [
  {
    key: 'auth',
    entra: {
      enabled: true,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      discoveryUrl: DISCOVERY_URL,
    },
    allowedDomains: ['client.fr'],
    ...overrides,
  },
];

/**
 * id_token tel que le rend le token endpoint. Non signé : l'API ne vérifie pas
 * la signature d'un jeton reçu directement de l'IdP (cf. readIdTokenClaims).
 */
const idToken = (claims) =>
  [{ alg: 'none', typ: 'JWT' }, claims]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .concat('')
    .join('.');

/**
 * Entra factice. Volontairement SANS `email_verified` : l'annuaire ne publie pas
 * ce claim, et l'exiger refuserait toutes les connexions en production.
 *
 * `profile` est la réponse de `userinfo` — qui chez Microsoft ne porte JAMAIS
 * `preferred_username` ni `upn` : ceux-là passent par `idClaims`, l'id_token.
 */
function mockEntra({
  profile = { sub: 'oid-42', email: 'nouveau@client.fr', name: 'Nouveau' },
  idClaims = null,
  tokenStatus = 200,
  discoveryStatus = 200,
} = {}) {
  return vi.fn(async (url) => {
    const target = String(url);
    if (target.includes('.well-known/openid-configuration')) {
      if (discoveryStatus !== 200)
        return { ok: false, status: discoveryStatus, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          authorization_endpoint: `https://login.microsoftonline.test/${TENANT}/oauth2/v2.0/authorize`,
          token_endpoint: `https://login.microsoftonline.test/${TENANT}/oauth2/v2.0/token`,
          userinfo_endpoint: 'https://graph.microsoft.test/oidc/userinfo',
        }),
      };
    }
    if (target.includes('/token')) {
      return {
        ok: tokenStatus === 200,
        status: tokenStatus,
        json: async () => ({
          access_token: 'at-entra',
          ...(idClaims ? { id_token: idToken(idClaims) } : {}),
        }),
      };
    }
    if (target.includes('/userinfo')) return { ok: true, json: async () => profile };
    throw new Error(`URL inattendue: ${target}`);
  });
}

async function startFlow(app, url = '/api/auth/entra/start') {
  const res = await app.inject({ method: 'GET', url });
  const state = /mybrief_oauth=([^;]*)/.exec(String(res.headers['set-cookie']))?.[1] || '';
  return { res, state, location: res.headers.location };
}

/** Le retour passe par l'URI HÉRITÉE du plugin, hors du préfixe /api. */
function callback(app, { state, cookieState, code = 'code-entra', error } = {}) {
  const params = new URLSearchParams();
  if (state) params.set('state', state);
  if (code) params.set('code', code);
  if (error) params.set('error', error);
  return app.inject({
    method: 'GET',
    url: `/oauth2/callback?${params.toString()}`,
    headers: cookieState === null ? {} : { cookie: `mybrief_oauth=${cookieState ?? state}` },
  });
}

/** Adresse du compte connecté par le cookie que pose le callback — la preuve de bout en bout. */
async function sessionEmail(app, res) {
  const token = /mybrief_sess=([^;]*)/.exec(String(res.headers['set-cookie']))?.[1];
  if (!token) return null;
  const session = await app.inject({
    method: 'GET',
    url: '/api/auth/session',
    headers: sessionCookieHeaders(token),
  });
  return session.json().user?.email || null;
}

describe('flux OIDC Entra ID', () => {
  beforeEach(() => {
    resetDiscoveryCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetDiscoveryCache();
  });

  it("part vers le tenant et REPREND l'URI de redirection du plugin", async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { res, state, location } = await startFlow(app);
    expect(res.statusCode).toBe(302);

    const url = new URL(location);
    expect(url.pathname).toContain(`/${TENANT}/oauth2/v2.0/authorize`);
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe(state);
    // Contrat non négociable : cette URI est celle déjà enregistrée côté Entra,
    // et nous n'avons pas les droits pour en déclarer une autre.
    const redirectUri = url.searchParams.get('redirect_uri');
    expect(redirectUri.endsWith('/oauth2/callback')).toBe(true);
    expect(redirectUri).not.toContain('/api/');
    expect(location).not.toContain('code_verifier');
  });

  it('ouvre une session sans exiger email_verified', async () => {
    // Entra ne publie pas ce claim : l'exiger casserait toutes les connexions.
    vi.stubGlobal('fetch', mockEntra());
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });

    expect(res.headers.location).toBe('/');
    expect(String(res.headers['set-cookie'])).toContain('mybrief_sess=');
    const created = db.data.get('user').find((u) => u.emailLower === 'nouveau@client.fr');
    expect(created.authProviders).toEqual(['entra']);
    expect(created.passwordHash).toBeUndefined();
  });

  it('ne garde pas la photo Graph, et laisse en place celle de Google', async () => {
    // Le `picture` d'Entra exige un jeton : un <img> ne l'afficherait jamais.
    const google = 'https://lh3.googleusercontent.com/a/photo';
    vi.stubGlobal(
      'fetch',
      mockEntra({
        profile: {
          sub: 'oid-42',
          email: 'nouveau@client.fr',
          picture: 'https://graph.microsoft.com/v1.0/me/photo/$value',
        },
      }),
    );
    const { app, db } = buildTestApp({
      seed: {
        appSettings: settingsSeed(),
        user: [userDoc('nouveau@client.fr', { picture: google })],
      },
    });

    const { state } = await startFlow(app);
    await callback(app, { state });
    expect(db.data.get('user')[0].picture).toBe(google);
  });

  it("connecte par l'identifiant de connexion un compte sans adresse dans l'annuaire", async () => {
    // Régression : `userinfo` ne porte jamais preferred_username chez Microsoft.
    // Le repli ne lisait que lui, et un tel compte ne pouvait pas entrer malgré
    // un domaine autorisé. C'est le mapping du compose Fabrikam.
    vi.stubGlobal(
      'fetch',
      mockEntra({
        profile: { sub: 'oid-7', name: 'Jean' },
        idClaims: { aud: CLIENT_ID, sub: 'oid-7', preferred_username: 'Jean.Dupont@Client.fr' },
      }),
    );
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });

    expect(res.headers.location).toBe('/');
    expect(await sessionEmail(app, res)).toBe('Jean.Dupont@Client.fr');
    const created = db.data.get('user').find((u) => u.emailLower === 'jean.dupont@client.fr');
    expect(created).toMatchObject({ role: 'user', name: 'Jean', authProviders: ['entra'] });
  });

  it("n'emprunte rien à un id_token destiné à une autre application", async () => {
    vi.stubGlobal(
      'fetch',
      mockEntra({
        profile: { sub: 'oid-7' },
        idClaims: { aud: 'autre-application', sub: 'oid-7', preferred_username: 'jean@client.fr' },
      }),
    );
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    expect((await callback(app, { state })).headers.location).toBe(
      '/signin?error=sso_email_missing',
    );
    expect(db.data.get('user') || []).toHaveLength(0);
  });

  it("n'emprunte rien à l'id_token d'une autre personne", async () => {
    // Deux `sub` différents : deux identités, qu'on ne mélange pas.
    vi.stubGlobal(
      'fetch',
      mockEntra({
        profile: { sub: 'oid-7' },
        idClaims: { aud: CLIENT_ID, sub: 'oid-autre', preferred_username: 'autre@client.fr' },
      }),
    );
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    expect((await callback(app, { state })).headers.location).toBe(
      '/signin?error=sso_email_missing',
    );
    expect(db.data.get('user') || []).toHaveLength(0);
  });

  it('crée le compte sous l identifiant de connexion quand seul son domaine est autorisé', async () => {
    // L'adresse de messagerie est sur une marque, l'identifiant sur le domaine
    // autorisé : la personne appartient bien à l'organisation.
    vi.stubGlobal(
      'fetch',
      mockEntra({
        profile: { sub: 'oid-8', email: 'jean@marque.com' },
        idClaims: { aud: CLIENT_ID, sub: 'oid-8', preferred_username: 'jean@client.fr' },
      }),
    );
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });

    expect(res.headers.location).toBe('/');
    expect(await sessionEmail(app, res)).toBe('jean@client.fr');
    expect(db.data.get('user').map((u) => u.emailLower)).toEqual(['jean@client.fr']);
  });

  it('retrouve le compte existant sous l identifiant de connexion, sans en créer un second', async () => {
    // Installation passée par le plugin mappé sur preferred_username : le compte
    // et son historique sont rangés sous l'identifiant, pas sous l'adresse.
    vi.stubGlobal(
      'fetch',
      mockEntra({
        profile: { sub: 'oid-9', email: 'j.dupont@client.fr' },
        idClaims: { aud: CLIENT_ID, sub: 'oid-9', preferred_username: 'jean.dupont@client.fr' },
      }),
    );
    const { app, db } = buildTestApp({
      seed: { appSettings: settingsSeed(), user: [userDoc('jean.dupont@client.fr')] },
    });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });

    expect(res.headers.location).toBe('/');
    expect(await sessionEmail(app, res)).toBe('jean.dupont@client.fr');
    const users = db.data.get('user');
    expect(users).toHaveLength(1);
    expect(users[0].authProviders).toEqual(['oidc', 'entra']);
  });

  it('refuse dès que l un des comptes de la personne est désactivé', async () => {
    vi.stubGlobal(
      'fetch',
      mockEntra({
        profile: { sub: 'oid-10', email: 'nouvelle-adresse@client.fr' },
        idClaims: { aud: CLIENT_ID, sub: 'oid-10', preferred_username: 'banni@client.fr' },
      }),
    );
    const { app, db } = buildTestApp({
      seed: {
        appSettings: settingsSeed(),
        user: [userDoc('banni@client.fr', { disabled: true })],
      },
    });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });

    expect(res.headers.location).toBe('/signin?error=account_disabled');
    // Surtout pas de compte neuf sous l'autre adresse : ce serait contourner
    // la désactivation.
    expect(db.data.get('user')).toHaveLength(1);
  });

  it("écarte un identifiant de connexion qui n'a pas la forme d'une adresse", async () => {
    vi.stubGlobal(
      'fetch',
      mockEntra({
        profile: { sub: 'oid-11' },
        idClaims: {
          aud: CLIENT_ID,
          sub: 'oid-11',
          preferred_username: '+33612345678',
          upn: 'standard@client.fr',
        },
      }),
    );
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    expect((await callback(app, { state })).headers.location).toBe('/');
    expect(db.data.get('user').map((u) => u.emailLower)).toEqual(['standard@client.fr']);
  });

  it('refuse un profil sans aucun claim exploitable', async () => {
    vi.stubGlobal('fetch', mockEntra({ profile: { sub: 'oid-9', name: 'Anonyme' } }));
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    expect((await callback(app, { state })).headers.location).toBe(
      '/signin?error=sso_email_missing',
    );
    expect(db.data.get('user') || []).toHaveLength(0);
  });

  it('refuse de démarrer sans identifiants ou sans annuaire', async () => {
    const off = buildTestApp({
      seed: { appSettings: [{ key: 'auth', entra: { enabled: false } }] },
    });
    expect(
      (await off.app.inject({ method: 'GET', url: '/api/auth/entra/start' })).headers.location,
    ).toBe('/signin?error=sso_disabled');

    // Activé et complet côté identifiants, mais aucun annuaire à interroger.
    const noDiscovery = buildTestApp({
      seed: {
        appSettings: settingsSeed({
          entra: {
            enabled: true,
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            discoveryUrl: '',
          },
        }),
      },
    });
    expect(
      (await noDiscovery.app.inject({ method: 'GET', url: '/api/auth/entra/start' })).headers
        .location,
    ).toBe('/signin?error=sso_disabled');
  });

  it('échoue proprement si la découverte est injoignable', async () => {
    // Pas de repli codé en dur pour Entra : deviner les endpoints enverrait vers
    // le mauvais annuaire.
    vi.stubGlobal('fetch', mockEntra({ discoveryStatus: 503 }));
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    expect((await startFlow(app)).location).toBe('/signin?error=sso_failed');
  });

  it('refuse un state qui ne correspond pas au cookie (login CSRF)', async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const { state } = await startFlow(app);
    const res = await callback(app, { state, cookieState: 'state-de-lattaquant' });
    expect(res.headers.location).toBe('/signin?error=sso_state_mismatch');
    expect(String(res.headers['set-cookie'])).not.toContain('mybrief_sess=');
  });

  it('interdit le rejeu d un state déjà consommé', async () => {
    vi.stubGlobal('fetch', mockEntra());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const { state } = await startFlow(app);
    expect((await callback(app, { state })).headers.location).toBe('/');
    expect((await callback(app, { state })).headers.location).toBe(
      '/signin?error=sso_state_mismatch',
    );
  });

  it('refuse un state émis pour un AUTRE fournisseur', async () => {
    // Sinon un code obtenu chez Google pourrait être présenté au callback Entra.
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
    const { app } = buildTestApp({
      seed: {
        appSettings: settingsSeed({ google: { enabled: true, clientId: 'g', clientSecret: 's' } }),
      },
    });

    const { state } = await startFlow(app, '/api/auth/google/start');
    expect((await callback(app, { state })).headers.location).toBe(
      '/signin?error=sso_state_mismatch',
    );
  });

  it('applique les mêmes règles de domaine et de compte désactivé que Google', async () => {
    vi.stubGlobal('fetch', mockEntra({ profile: { sub: 'x', email: 'intrus@ailleurs.com' } }));
    const horsDomaine = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const s1 = await startFlow(horsDomaine.app);
    expect((await callback(horsDomaine.app, { state: s1.state })).headers.location).toBe(
      '/signin?error=domain_not_allowed',
    );
    expect(horsDomaine.db.data.get('user') || []).toHaveLength(0);

    vi.unstubAllGlobals();
    resetDiscoveryCache();
    vi.stubGlobal('fetch', mockEntra({ profile: { sub: 'y', email: 'banni@client.fr' } }));
    const banni = buildTestApp({
      seed: { appSettings: settingsSeed(), user: [userDoc('banni@client.fr', { disabled: true })] },
    });
    const s2 = await startFlow(banni.app);
    expect((await callback(banni.app, { state: s2.state })).headers.location).toBe(
      '/signin?error=account_disabled',
    );
  });

  it("n'expose jamais le secret quand l'échange de code échoue", async () => {
    vi.stubGlobal('fetch', mockEntra({ tokenStatus: 400 }));
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const { state } = await startFlow(app);
    const res = await callback(app, { state });
    expect(res.headers.location).toBe('/signin?error=sso_failed');
    expect(res.payload).not.toContain(CLIENT_SECRET);
  });

  it('GET /api/auth/config annonce entraEnabled', async () => {
    const on = buildTestApp({ seed: { appSettings: settingsSeed() } });
    expect(
      (await on.app.inject({ method: 'GET', url: '/api/auth/config' })).json().entraEnabled,
    ).toBe(true);
    const off = buildTestApp();
    expect(
      (await off.app.inject({ method: 'GET', url: '/api/auth/config' })).json().entraEnabled,
    ).toBe(false);
  });
});

describe('réglages Entra', () => {
  it('ne laisse jamais fuir le clientSecret', () => {
    const pub = toPublicSettings({
      entra: {
        enabled: true,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        discoveryUrl: DISCOVERY_URL,
      },
    });
    expect(JSON.stringify(pub)).not.toContain(CLIENT_SECRET);
    expect(pub.entra.hasSecret).toBe(true);
    expect(pub.entra.discoveryUrl).toBe(DISCOVERY_URL);
  });

  it('un fournisseur incomplet n est jamais utilisable', () => {
    const base = {
      enabled: true,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      discoveryUrl: DISCOVERY_URL,
    };
    expect(isProviderUsable('entra', { entra: base })).toBe(true);
    expect(isProviderUsable('entra', { entra: { ...base, enabled: false } })).toBe(false);
    expect(isProviderUsable('entra', { entra: { ...base, clientSecret: '' } })).toBe(false);
    expect(isProviderUsable('entra', { entra: { ...base, discoveryUrl: '' } })).toBe(false);
  });

  it('amorce Entra depuis les variables du plugin, DÉSACTIVÉ par défaut', async () => {
    // Aucune modification du .env de production n'est demandée : on relit les
    // variables que le plugin Traefik utilise déjà.
    const db = createFakeDb();
    const repo = createSettingsRepo(db);
    await repo.seedFromEnv({
      CLIENT_ID,
      CLIENT_SECRET,
      OIDC_DISCOVERY_URL: DISCOVERY_URL,
      ALLOWED_EMAIL_DOMAINS: 'client.fr',
    });

    const saved = await repo.get();
    expect(saved.entra.clientId).toBe(CLIENT_ID);
    expect(saved.entra.discoveryUrl).toBe(DISCOVERY_URL);
    // Déployer cette version sur une installation encore servie par le plugin
    // ne doit RIEN changer de visible.
    expect(saved.entra.enabled).toBe(false);
    expect(saved.allowedDomains).toEqual(['client.fr']);
  });

  it("déduit l'URL de découverte de PROVIDER_URL et respecte ENTRA_LOGIN_ENABLED", async () => {
    const repo = createSettingsRepo(createFakeDb());
    await repo.seedFromEnv({
      PROVIDER_URL: `https://login.microsoftonline.com/${TENANT}/v2.0`,
      CLIENT_ID,
      CLIENT_SECRET,
      ENTRA_LOGIN_ENABLED: '1',
    });
    const saved = await repo.get();
    expect(saved.entra.discoveryUrl).toBe(DISCOVERY_URL);
    expect(saved.entra.enabled).toBe(true);
  });

  it("n'amorce PAS Entra quand les variables génériques portent du Google", async () => {
    // Sur la stack myalfred, CLIENT_ID/CLIENT_SECRET alimentent le plugin avec
    // des identifiants Google : les prendre pour de l'Entra créerait un
    // fournisseur mensonger.
    const repo = createSettingsRepo(createFakeDb());
    await repo.seedFromEnv({
      CLIENT_ID: 'google-client',
      CLIENT_SECRET: 'google-secret',
      OIDC_DISCOVERY_URL: 'https://accounts.google.com/.well-known/openid-configuration',
    });
    expect((await repo.get()).entra.clientId).toBe('');
  });

  it("la route admin relaie bien le fournisseur Entra jusqu'à la base", async () => {
    // Régression : le schéma acceptait `entra` mais le handler ne transmettait
    // que `google` — l'interface annonçait « Enregistré » sans rien changer.
    const ADMIN = 'patron@client.fr';
    const { app, db } = buildTestApp({
      seed: {
        user: [userDoc(ADMIN, { role: 'admin' })],
        appSettings: settingsSeed({
          entra: {
            enabled: false,
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            discoveryUrl: DISCOVERY_URL,
          },
        }),
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/settings/auth',
      headers: { ...identityHeaders(ADMIN), 'content-type': 'application/json' },
      body: JSON.stringify({ entra: { enabled: true } }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().settings.entra.enabled).toBe(true);
    expect(db.data.get('appSettings')[0].entra.enabled).toBe(true);
    // Ce qui n'était pas envoyé est conservé — surtout le secret.
    expect(db.data.get('appSettings')[0].entra.clientSecret).toBe(CLIENT_SECRET);
    expect(res.payload).not.toContain(CLIENT_SECRET);
  });

  it('amorce un fournisseur manquant sur une installation déjà configurée', async () => {
    // L'ancien amorçage était « tout ou rien » : le document existant faisait
    // sortir immédiatement, et Entra n'aurait jamais pu être amorcé.
    const db = createFakeDb({
      appSettings: [
        {
          key: 'auth',
          google: { enabled: true, clientId: 'g', clientSecret: 's' },
          allowedDomains: ['deja.fr'],
        },
      ],
    });
    const repo = createSettingsRepo(db);
    await repo.seedFromEnv({
      CLIENT_ID,
      CLIENT_SECRET,
      OIDC_DISCOVERY_URL: DISCOVERY_URL,
      ALLOWED_EMAIL_DOMAINS: 'ignore.fr',
    });

    const saved = await repo.get();
    expect(saved.entra.clientId).toBe(CLIENT_ID);
    // Ce qui était déjà saisi n'est jamais écrasé.
    expect(saved.google.clientId).toBe('g');
    expect(saved.allowedDomains).toEqual(['deja.fr']);
  });
});
