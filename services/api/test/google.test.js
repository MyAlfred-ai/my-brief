import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestApp, userDoc, identityHeaders, sessionCookieHeaders } from './helpers.js';
import { resetDiscoveryCache } from '../lib/auth/oidcClient.js';
import {
  normalizeDomain,
  domainOf,
  sanitizeDomainList,
  isDomainAllowed,
} from '../lib/auth/domains.js';
import { toPublicSettings } from '../lib/repositories/settings.js';

const CLIENT_ID = 'client-abc.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-secret';
const ADMIN = 'patron@client.fr';

const settingsSeed = (overrides = {}) => [
  {
    key: 'auth',
    google: { enabled: true, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    allowedDomains: ['client.fr'],
    ...overrides,
  },
];

/** Google factice : découverte, échange de code (id_token facultatif), userinfo. */
function mockGoogle({
  email = 'nouveau@client.fr',
  emailVerified = true,
  name = 'Nouveau',
  picture = '',
  tokenStatus = 200,
  idClaims = null,
} = {}) {
  return vi.fn(async (url) => {
    const target = String(url);
    if (target.includes('.well-known/openid-configuration')) {
      return {
        ok: true,
        json: async () => ({
          authorization_endpoint: 'https://accounts.google.test/auth',
          token_endpoint: 'https://oauth2.google.test/token',
          userinfo_endpoint: 'https://openid.google.test/userinfo',
        }),
      };
    }
    if (target.includes('/token')) {
      return {
        ok: tokenStatus === 200,
        status: tokenStatus,
        json: async () => ({
          access_token: 'at-123',
          ...(idClaims
            ? {
                id_token: [{ alg: 'none' }, idClaims]
                  .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
                  .concat('')
                  .join('.'),
              }
            : {}),
        }),
      };
    }
    if (target.includes('/userinfo')) {
      return {
        ok: true,
        json: async () => ({
          sub: '42',
          email,
          email_verified: emailVerified,
          name,
          ...(picture ? { picture } : {}),
        }),
      };
    }
    throw new Error(`URL inattendue: ${target}`);
  });
}

/** Joue /google/start et renvoie le state (cookie + URL Google). */
async function startFlow(app) {
  const res = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
  const setCookie = String(res.headers['set-cookie']);
  const state = /mybrief_oauth=([^;]*)/.exec(setCookie)?.[1] || '';
  return { res, state, location: res.headers.location };
}

function callback(app, { state, cookieState, code = 'code-xyz', error } = {}) {
  const params = new URLSearchParams();
  if (state) params.set('state', state);
  if (code) params.set('code', code);
  if (error) params.set('error', error);
  return app.inject({
    method: 'GET',
    url: `/api/auth/google/callback?${params.toString()}`,
    headers: cookieState === null ? {} : { cookie: `mybrief_oauth=${cookieState ?? state}` },
  });
}

describe('domaines autorisés', () => {
  it('normalise les formes courantes saisies par un admin', () => {
    expect(normalizeDomain(' @MyAlfred.AI ')).toBe('myalfred.ai');
    expect(normalizeDomain('https://client.fr/path')).toBe('client.fr');
  });

  it('extrait le domaine même avec un + dans la partie locale', () => {
    expect(domainOf('alex+test@Client.FR')).toBe('client.fr');
    expect(domainOf('pas-un-email')).toBe('');
  });

  it('déduplique, trie et écarte les entrées sans point', () => {
    expect(sanitizeDomainList([' Client.fr ', 'client.fr', 'localhost', '', 'a.io'])).toEqual([
      'a.io',
      'client.fr',
    ]);
  });

  it('une liste VIDE n autorise personne', () => {
    // Sinon activer Google ouvrirait l'application à n'importe quel compte
    // Google de la planète.
    expect(isDomainAllowed('qui@que.fr', [])).toBe(false);
    expect(isDomainAllowed('qui@que.fr', undefined)).toBe(false);
  });

  it('compare sur le domaine exact, pas sur un suffixe', () => {
    expect(isDomainAllowed('a@client.fr', ['client.fr'])).toBe(true);
    expect(isDomainAllowed('a@CLIENT.FR', ['client.fr'])).toBe(true);
    // « evil-client.fr » ne doit pas passer parce qu'il se termine par « client.fr »
    expect(isDomainAllowed('a@evil-client.fr', ['client.fr'])).toBe(false);
    expect(isDomainAllowed('a@sub.client.fr', ['client.fr'])).toBe(false);
  });
});

describe('projection des réglages', () => {
  it('ne laisse jamais fuir le clientSecret', () => {
    const pub = toPublicSettings({
      google: { enabled: true, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
      allowedDomains: ['client.fr'],
    });
    expect(JSON.stringify(pub)).not.toContain(CLIENT_SECRET);
    expect(pub.google.hasSecret).toBe(true);
    expect(pub.google.clientId).toBe(CLIENT_ID);
  });
});

describe('flux OAuth Google', () => {
  beforeEach(() => {
    resetDiscoveryCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetDiscoveryCache();
  });

  it('redirige vers Google avec PKCE S256 et un state', async () => {
    vi.stubGlobal('fetch', mockGoogle());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { res, state, location } = await startFlow(app);
    expect(res.statusCode).toBe(302);
    expect(state).toBeTruthy();

    const url = new URL(location);
    expect(url.origin + url.pathname).toBe('https://accounts.google.test/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('redirect_uri')).toContain('/api/auth/google/callback');
    // Le code_verifier ne doit JAMAIS partir vers le navigateur.
    expect(location).not.toContain('code_verifier');
  });

  it('refuse de démarrer si Google n est pas configuré', async () => {
    const { app } = buildTestApp({
      seed: { appSettings: [{ key: 'auth', google: { enabled: false } }] },
    });
    const res = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
    expect(res.headers.location).toBe('/signin?error=google_disabled');
  });

  it('crée le compte et ouvre une session pour un domaine autorisé', async () => {
    vi.stubGlobal('fetch', mockGoogle({ email: 'nouveau@client.fr' }));
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(String(res.headers['set-cookie'])).toContain('mybrief_sess=');

    const created = db.data.get('user').find((u) => u.emailLower === 'nouveau@client.fr');
    expect(created).toMatchObject({ role: 'user', disabled: false });
    expect(created.authProviders).toEqual(['google']);
    // Compte SSO : aucun mot de passe, et donc rien à changer à la connexion.
    expect(created.passwordHash).toBeUndefined();
    expect(created.mustChangePassword).toBe(false);
  });

  it('garde la photo Google et la renvoie avec la session', async () => {
    const photo = 'https://lh3.googleusercontent.com/a/photo=s96-c';
    vi.stubGlobal('fetch', mockGoogle({ email: 'nouveau@client.fr', picture: photo }));
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });

    const created = db.data.get('user').find((u) => u.emailLower === 'nouveau@client.fr');
    expect(created.picture).toBe(photo);
    const token = /mybrief_sess=([^;]*)/.exec(String(res.headers['set-cookie']))?.[1];
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: sessionCookieHeaders(token),
    });
    expect(session.json().user.picture).toBe(photo);
  });

  it('remplace la photo d un compte existant à chaque connexion', async () => {
    // La photo change chez Google sans que myBrief en soit prévenu.
    const photo = 'https://lh3.googleusercontent.com/a/nouvelle';
    vi.stubGlobal('fetch', mockGoogle({ email: 'ancien@client.fr', picture: photo }));
    const { app, db } = buildTestApp({
      seed: {
        appSettings: settingsSeed(),
        user: [
          userDoc('ancien@client.fr', { picture: 'https://lh3.googleusercontent.com/a/vieille' }),
        ],
      },
    });

    const { state } = await startFlow(app);
    await callback(app, { state });
    expect(db.data.get('user')[0].picture).toBe(photo);
  });

  it('écarte une photo qui n est pas en HTTPS', async () => {
    vi.stubGlobal(
      'fetch',
      mockGoogle({ email: 'nouveau@client.fr', picture: 'http://exemple.test/photo.png' }),
    );
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    await callback(app, { state });
    expect(db.data.get('user')[0]).not.toHaveProperty('picture');
  });

  it('refuse un domaine hors liste sans créer de compte', async () => {
    vi.stubGlobal('fetch', mockGoogle({ email: 'intrus@ailleurs.com' }));
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });

    expect(res.headers.location).toBe('/signin?error=domain_not_allowed');
    expect(String(res.headers['set-cookie'])).not.toContain('mybrief_sess=');
    expect(db.data.get('user') || []).toHaveLength(0);
  });

  it('connecte un compte existant même hors des domaines autorisés', async () => {
    // La liste régit la CRÉATION, pas les comptes déjà provisionnés par l'admin.
    vi.stubGlobal('fetch', mockGoogle({ email: 'ancien@ailleurs.com' }));
    const { app } = buildTestApp({
      seed: { appSettings: settingsSeed(), user: [userDoc('ancien@ailleurs.com')] },
    });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });
    expect(res.headers.location).toBe('/');
  });

  it('refuse une adresse Google non vérifiée', async () => {
    vi.stubGlobal('fetch', mockGoogle({ email: 'douteux@client.fr', emailVerified: false }));
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });
    expect(res.headers.location).toBe('/signin?error=google_email_unverified');
    expect(db.data.get('user') || []).toHaveLength(0);
  });

  it('l id_token ne rattrape pas une adresse que userinfo dit non vérifiée', async () => {
    // L'id_token complète userinfo, il ne le contredit jamais : une attestation
    // « vérifiée » ne doit pas pouvoir venir d'ailleurs que de l'adresse lue.
    vi.stubGlobal(
      'fetch',
      mockGoogle({
        email: 'douteux@client.fr',
        emailVerified: false,
        idClaims: { aud: CLIENT_ID, sub: '42', email: 'douteux@client.fr', email_verified: true },
      }),
    );
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });
    expect(res.headers.location).toBe('/signin?error=google_email_unverified');
    expect(db.data.get('user') || []).toHaveLength(0);
  });

  it('refuse un compte désactivé', async () => {
    vi.stubGlobal('fetch', mockGoogle({ email: 'banni@client.fr' }));
    const { app } = buildTestApp({
      seed: { appSettings: settingsSeed(), user: [userDoc('banni@client.fr', { disabled: true })] },
    });

    const { state } = await startFlow(app);
    const res = await callback(app, { state });
    expect(res.headers.location).toBe('/signin?error=account_disabled');
  });

  it('refuse un state qui ne correspond pas au cookie (login CSRF)', async () => {
    vi.stubGlobal('fetch', mockGoogle());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    // L'attaquant fait consommer SON code par la victime : le state de l'URL
    // n'est pas celui déposé dans le navigateur de la victime.
    const res = await callback(app, { state, cookieState: 'state-de-lattaquant' });
    expect(res.headers.location).toBe('/signin?error=google_state_mismatch');
    expect(String(res.headers['set-cookie'])).not.toContain('mybrief_sess=');
  });

  it('refuse un callback sans cookie d état', async () => {
    vi.stubGlobal('fetch', mockGoogle());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const { state } = await startFlow(app);
    const res = await callback(app, { state, cookieState: null });
    expect(res.headers.location).toBe('/signin?error=google_state_mismatch');
  });

  it('interdit le rejeu d un state déjà consommé', async () => {
    vi.stubGlobal('fetch', mockGoogle());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });

    const { state } = await startFlow(app);
    expect((await callback(app, { state })).headers.location).toBe('/');
    expect((await callback(app, { state })).headers.location).toBe(
      '/signin?error=google_state_mismatch',
    );
  });

  it('traduit un refus de l utilisateur côté Google', async () => {
    vi.stubGlobal('fetch', mockGoogle());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const { state } = await startFlow(app);
    const res = await callback(app, { state, code: null, error: 'access_denied' });
    expect(res.headers.location).toBe('/signin?error=google_cancelled');
  });

  it("n'expose jamais le secret quand l'échange de code échoue", async () => {
    vi.stubGlobal('fetch', mockGoogle({ tokenStatus: 400 }));
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const { state } = await startFlow(app);
    const res = await callback(app, { state });
    expect(res.headers.location).toBe('/signin?error=google_failed');
    expect(res.payload).not.toContain(CLIENT_SECRET);
  });

  it('GET /api/auth/config annonce googleEnabled', async () => {
    const configured = buildTestApp({ seed: { appSettings: settingsSeed() } });
    expect(
      (await configured.app.inject({ method: 'GET', url: '/api/auth/config' })).json()
        .googleEnabled,
    ).toBe(true);

    const bare = buildTestApp();
    expect(
      (await bare.app.inject({ method: 'GET', url: '/api/auth/config' })).json().googleEnabled,
    ).toBe(false);
  });
});

describe('réglages via /api/admin/settings/auth', () => {
  const seed = () => ({ user: [userDoc(ADMIN, { role: 'admin' })], appSettings: settingsSeed() });

  const post = (app, body, email = ADMIN) =>
    app.inject({
      method: 'POST',
      url: '/api/admin/settings/auth',
      headers: { ...identityHeaders(email), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('la lecture ne renvoie pas le secret', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/auth',
      headers: identityHeaders(ADMIN),
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toContain(CLIENT_SECRET);
    expect(res.json().settings.google.hasSecret).toBe(true);
  });

  it('un utilisateur simple ne peut ni lire ni écrire', async () => {
    const s = seed();
    s.user.push(userDoc('simple@client.fr'));
    const { app } = buildTestApp({ seed: s });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/settings/auth',
          headers: identityHeaders('simple@client.fr'),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await post(app, { allowedDomains: ['pirate.fr'] }, 'simple@client.fr')).statusCode,
    ).toBe(403);
  });

  it('modifier le clientId sans renvoyer le secret le conserve', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await post(app, { google: { clientId: 'nouveau-id' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.google.clientId).toBe('nouveau-id');
    expect(res.json().settings.google.hasSecret).toBe(true);
    expect(db.data.get('appSettings')[0].google.clientSecret).toBe(CLIENT_SECRET);
  });

  it('nettoie la liste de domaines à l enregistrement', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, {
      allowedDomains: [' @Client.FR ', 'client.fr', 'localhost', 'autre.io'],
    });
    expect(res.json().settings.allowedDomains).toEqual(['autre.io', 'client.fr']);
  });

  it('écarte les champs inconnus au lieu de les enregistrer', async () => {
    // Fastify active `removeAdditional` par défaut : avec
    // `additionalProperties: false`, un champ hors schéma est SUPPRIMÉ avant
    // d'atteindre le handler — il ne peut donc pas être injecté en base.
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await post(app, { google: { clientId: 'x', inconnu: true }, pirate: 1 });
    expect(res.statusCode).toBe(200);
    expect(db.data.get('appSettings')[0].google).not.toHaveProperty('inconnu');
    expect(db.data.get('appSettings')[0]).not.toHaveProperty('pirate');
  });

  it('refuse un type inexploitable', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, { google: 'pas-un-objet' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
  });

  it('accepte un domaine unique envoyé hors tableau', async () => {
    // Fastify active `coerceTypes: 'array'` : un scalaire est promu en tableau
    // d'un élément. Comportement pratique côté API, à connaître pour ne pas
    // écrire un test qui attend un 400 ici.
    const { app } = buildTestApp({ seed: seed() });
    const res = await post(app, { allowedDomains: 'Solo.fr' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.allowedDomains).toEqual(['solo.fr']);
  });
});
