/**
 * Connexion d'un compte externe (routes/connect.js) et envoi de document via le
 * compte connecté (routes/actions.js).
 *
 * Garanties à tenir :
 *   - le refresh token ne sort JAMAIS par les routes JSON ;
 *   - le flux d'autorisation exige un state cohérent (URL == cookie == base)
 *     ET la même session que celle qui l'a initié ;
 *   - l'envoi part du compte connecté quand il existe, retombe sur le relais
 *     SMTP quand la connexion est révoquée, et purge la connexion morte ;
 *   - les connexions reprises de l'ancienne collection continuent d'envoyer
 *     sans re-consentement, mais ne prétendent pas savoir déposer sur un Drive.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTestApp,
  userDoc,
  identityHeaders,
  createFakeMailer,
  createFakeGmailSend,
} from './helpers.js';
import { resetDiscoveryCache } from '../lib/auth/oidcClient.js';
import { GmailAuthError } from '../lib/gmail.js';
import { CONNECT_PROVIDERS } from '../lib/connections/providers.js';

const CLIENT_ID = 'client-abc.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-secret';
const USER = 'simple@client.fr';
const GMAIL_ACCOUNT = 'perso@gmail.com';
const STATE_COOKIE = CONNECT_PROVIDERS.google.stateCookieName;
const DRIVE_SCOPE = CONNECT_PROVIDERS.google.driveScope;

const authSeed = (google = { enabled: true, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }) => [
  {
    key: 'auth',
    google,
    allowedDomains: ['client.fr'],
  },
];

const connectedSeed = (scopes = ['openid', 'email', 'gmail.send', DRIVE_SCOPE]) => [
  {
    emailLower: USER,
    provider: 'google',
    account: GMAIL_ACCOUNT,
    refreshToken: 'rt-secret-123',
    scopes,
  },
];

/** Google factice : découverte, échange de code (refresh token inclus), userinfo. */
function mockGoogle({
  account = GMAIL_ACCOUNT,
  refreshToken = 'rt-fresh',
  scope = `openid email https://www.googleapis.com/auth/gmail.send ${DRIVE_SCOPE}`,
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
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'at-123',
          scope,
          ...(refreshToken ? { refresh_token: refreshToken } : {}),
        }),
      };
    }
    if (target.includes('/userinfo')) {
      return { ok: true, json: async () => ({ sub: '42', email: account, email_verified: true }) };
    }
    throw new Error(`URL inattendue: ${target}`);
  });
}

/** Joue /connect/start (session USER) et renvoie le state. */
async function startFlow(app) {
  const res = await app.inject({
    method: 'GET',
    url: '/api/connect/start',
    headers: identityHeaders(USER),
  });
  const setCookie = String(res.headers['set-cookie']);
  const state = new RegExp(`${STATE_COOKIE}=([^;]*)`).exec(setCookie)?.[1] || '';
  return { res, state, location: res.headers.location };
}

function callback(app, { state, cookieState, code = 'code-xyz', email = USER } = {}) {
  const params = new URLSearchParams();
  if (state) params.set('state', state);
  if (code) params.set('code', code);
  return app.inject({
    method: 'GET',
    url: `${CONNECT_PROVIDERS.google.callbackPath}?${params.toString()}`,
    headers: {
      ...identityHeaders(email),
      ...(cookieState === null ? {} : { cookie: `${STATE_COOKIE}=${cookieState ?? state}` }),
    },
  });
}

beforeEach(() => resetDiscoveryCache());
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/connect/status', () => {
  it('exige une session', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)] } });
    const res = await app.inject({ method: 'GET', url: '/api/connect/status' });
    expect(res.statusCode).toBe(401);
  });

  it("reflète la disponibilité du fournisseur et l'état non connecté", async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)], appSettings: authSeed() } });
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/status',
      headers: identityHeaders(USER),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provider).toEqual({
      id: 'google',
      label: 'Google',
      available: true,
      connected: false,
      account: '',
      driveReady: false,
    });
    expect(body.smtpAvailable).toBe(true); // fake mailer activé par défaut
    expect(body.actionEnabled).toEqual({ transcription: true, summary: true });
  });

  it('fournisseur indisponible sans identifiants — mais `enabled` du LOGIN est ignoré', async () => {
    const withoutSecret = buildTestApp({
      seed: {
        user: [userDoc(USER)],
        appSettings: authSeed({ enabled: true, clientId: CLIENT_ID, clientSecret: '' }),
      },
    });
    const res1 = await withoutSecret.app.inject({
      method: 'GET',
      url: '/api/connect/status',
      headers: identityHeaders(USER),
    });
    expect(res1.json().provider.available).toBe(false);

    // `enabled: false` ne gouverne que le bouton de connexion à l'application,
    // pas la possibilité de relier son compte.
    const loginDisabled = buildTestApp({
      seed: {
        user: [userDoc(USER)],
        appSettings: authSeed({ enabled: false, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
      },
    });
    const res2 = await loginDisabled.app.inject({
      method: 'GET',
      url: '/api/connect/status',
      headers: identityHeaders(USER),
    });
    expect(res2.json().provider.available).toBe(true);
  });

  it('expose le compte connecté mais JAMAIS le refresh token', async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(USER)], appSettings: authSeed(), userConnections: connectedSeed() },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/status',
      headers: identityHeaders(USER),
    });
    expect(res.json().provider).toMatchObject({
      connected: true,
      account: GMAIL_ACCOUNT,
      driveReady: true,
    });
    expect(res.body).not.toContain('rt-secret-123');
  });

  it('une connexion héritée est connectée, mais pas prête pour le Drive', async () => {
    // Reprise de l'ancienne collection : scopes « Gmail seul ». Elle doit
    // continuer d'envoyer des mails sans re-consentement, et ne pas promettre
    // un dépôt qui échouerait au premier clic.
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(USER)],
        appSettings: authSeed(),
        userConnections: connectedSeed([
          'openid',
          'email',
          'https://www.googleapis.com/auth/gmail.send',
        ]),
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/status',
      headers: identityHeaders(USER),
    });
    expect(res.json().provider).toMatchObject({ connected: true, driveReady: false });
  });
});

describe("flux d'autorisation d'un compte externe", () => {
  it('start exige une session', async () => {
    const { app } = buildTestApp({ seed: { appSettings: authSeed() } });
    const res = await app.inject({ method: 'GET', url: '/api/connect/start' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('start redirige vers Google avec gmail.send, drive.file, offline et consent', async () => {
    vi.stubGlobal('fetch', mockGoogle());
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)], appSettings: authSeed() } });
    const { res, state, location } = await startFlow(app);
    expect(res.statusCode).toBe(302);
    expect(state).toBeTruthy();
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe('https://accounts.google.test/auth');
    expect(url.searchParams.get('scope')).toContain('gmail.send');
    expect(url.searchParams.get('scope')).toContain('drive.file');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('redirect_uri')).toContain(CONNECT_PROVIDERS.google.callbackPath);
  });

  it('callback complet : enregistre le compte, son refresh token et ses scopes', async () => {
    vi.stubGlobal('fetch', mockGoogle({ account: GMAIL_ACCOUNT, refreshToken: 'rt-fresh' }));
    const { app, db } = buildTestApp({ seed: { user: [userDoc(USER)], appSettings: authSeed() } });
    const { state } = await startFlow(app);
    const res = await callback(app, { state });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/#config');
    const doc = db.data.get('userConnections').find((d) => d.emailLower === USER);
    expect(doc.account).toBe(GMAIL_ACCOUNT);
    expect(doc.refreshToken).toBe('rt-fresh');
    expect(doc.provider).toBe('google');
    // Les scopes ENREGISTRÉS sont ceux que Google a accordés, pas ceux demandés.
    expect(doc.scopes).toContain(DRIVE_SCOPE);
  });

  it("n'enregistre pas le Drive si Google ne l'a pas accordé", async () => {
    vi.stubGlobal(
      'fetch',
      mockGoogle({ scope: 'openid email https://www.googleapis.com/auth/gmail.send' }),
    );
    const { app, db } = buildTestApp({ seed: { user: [userDoc(USER)], appSettings: authSeed() } });
    const { state } = await startFlow(app);
    await callback(app, { state });
    expect(db.data.get('userConnections')[0].scopes).not.toContain(DRIVE_SCOPE);
  });

  it('callback refuse un state sans cookie, et une session différente de celle du départ', async () => {
    vi.stubGlobal('fetch', mockGoogle());
    const { app, db } = buildTestApp({
      seed: { user: [userDoc(USER), userDoc('autre@client.fr')], appSettings: authSeed() },
    });
    const first = await startFlow(app);
    const noCookie = await callback(app, { state: first.state, cookieState: null });
    expect(noCookie.headers.location).toContain('connectError=connect_state_mismatch');

    const second = await startFlow(app);
    const wrongSession = await callback(app, { state: second.state, email: 'autre@client.fr' });
    expect(wrongSession.headers.location).toContain('connectError=connect_session_mismatch');
    expect(db.data.get('userConnections') || []).toHaveLength(0);
  });

  it("callback sans refresh token n'enregistre rien et rend l'autorisation", async () => {
    vi.stubGlobal('fetch', mockGoogle({ refreshToken: '' }));
    const { app, db, gmailRevoke } = buildTestApp({
      seed: { user: [userDoc(USER)], appSettings: authSeed() },
    });
    const { state } = await startFlow(app);
    const res = await callback(app, { state });
    expect(res.headers.location).toContain('connectError=connect_no_refresh_token');
    expect(db.data.get('userConnections') || []).toHaveLength(0);
    // L'accès a bien été accordé côté Google : ne rien enregistrer ET ne rien
    // révoquer laisserait myBrief autorisé sur le compte, sans trace ici.
    expect(gmailRevoke.calls).toHaveLength(1);
    expect(gmailRevoke.calls[0].accessToken).toBe('at-123');
  });

  it('reconnexion sur un AUTRE compte : révoque le jeton devenu orphelin', async () => {
    vi.stubGlobal('fetch', mockGoogle({ account: 'nouveau@gmail.com', refreshToken: 'rt-neuf' }));
    const { app, db, gmailRevoke } = buildTestApp({
      seed: {
        user: [userDoc(USER)],
        appSettings: authSeed(),
        userConnections: connectedSeed(),
      },
    });
    const { state } = await startFlow(app);
    await callback(app, { state });

    expect(gmailRevoke.calls).toHaveLength(1);
    expect(gmailRevoke.calls[0].refreshToken).toBe('rt-secret-123');
    const docs = db.data.get('userConnections');
    expect(docs).toHaveLength(1);
    expect(docs[0].account).toBe('nouveau@gmail.com');
    expect(docs[0].refreshToken).toBe('rt-neuf');
  });

  it('reconnexion sur le MÊME compte : ne révoque rien — ce serait tuer le jeton neuf', async () => {
    // Google révoque le GRANT entier, pas le jeton passé : révoquer l'ancien
    // refresh token du même compte invaliderait celui qui vient d'être émis.
    vi.stubGlobal('fetch', mockGoogle({ account: GMAIL_ACCOUNT, refreshToken: 'rt-neuf' }));
    const { app, db, gmailRevoke } = buildTestApp({
      seed: {
        user: [userDoc(USER)],
        appSettings: authSeed(),
        userConnections: connectedSeed(),
      },
    });
    const { state } = await startFlow(app);
    await callback(app, { state });

    expect(gmailRevoke.calls).toHaveLength(0);
    expect(db.data.get('userConnections')[0].refreshToken).toBe('rt-neuf');
  });
});

describe('POST /api/connect/disconnect', () => {
  it('404 sans connexion', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)] } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/connect/disconnect',
      headers: identityHeaders(USER),
    });
    expect(res.statusCode).toBe(404);
  });

  it('révoque chez le fournisseur puis supprime la connexion', async () => {
    const { app, db, gmailRevoke } = buildTestApp({
      seed: { user: [userDoc(USER)], userConnections: connectedSeed() },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/connect/disconnect',
      headers: identityHeaders(USER),
    });
    expect(res.statusCode).toBe(200);
    expect(gmailRevoke.calls).toHaveLength(1);
    expect(gmailRevoke.calls[0].refreshToken).toBe('rt-secret-123');
    expect(db.data.get('userConnections')).toHaveLength(0);
  });

  it("refuse une origine tierce — comme toutes les routes mutantes d'auth", async () => {
    const { app, db } = buildTestApp({
      seed: { user: [userDoc(USER)], userConnections: connectedSeed() },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/connect/disconnect',
      headers: {
        ...identityHeaders(USER),
        host: 'mybrief.test',
        origin: 'https://attaquant.test',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(db.data.get('userConnections')).toHaveLength(1);
  });
});

describe('POST /api/actions/email avec un compte connecté', () => {
  const body = { kind: 'summary', title: 'CR', content: '<p>Bonjour</p>', lang: 'fr' };
  const post = (app) =>
    app.inject({
      method: 'POST',
      url: '/api/actions/email',
      headers: { ...identityHeaders(USER), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('part du compte connecté, vers le compte authentifié', async () => {
    const { app, gmailSend, mailer } = buildTestApp({
      seed: { user: [userDoc(USER)], appSettings: authSeed(), userConnections: connectedSeed() },
    });
    const res = await post(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().via).toBe('gmail');
    expect(gmailSend.calls).toHaveLength(1);
    expect(gmailSend.calls[0].from).toBe(GMAIL_ACCOUNT);
    // Liste depuis les destinataires paramétrables ; sans réglage personnel,
    // elle se réduit au compte connecté.
    expect(gmailSend.calls[0].to).toEqual([USER]);
    expect(gmailSend.calls[0].refreshToken).toBe('rt-secret-123');
    expect(gmailSend.calls[0].subject).toContain('CR');
    expect(mailer.sent).toHaveLength(0); // le relais SMTP n'est pas sollicité
  });

  it('une connexion héritée envoie sans re-consentement', async () => {
    // La garantie de compatibilité de la reprise : pas de scope Drive, mais
    // l'envoi de mail continue exactement comme avant.
    const { app, gmailSend } = buildTestApp({
      seed: {
        user: [userDoc(USER)],
        appSettings: authSeed(),
        userConnections: connectedSeed([
          'openid',
          'email',
          'https://www.googleapis.com/auth/gmail.send',
        ]),
      },
    });
    const res = await post(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().via).toBe('gmail');
    expect(gmailSend.calls).toHaveLength(1);
  });

  it('connexion révoquée : purge et retombe sur le relais SMTP', async () => {
    const { app, db, mailer } = buildTestApp({
      seed: { user: [userDoc(USER)], appSettings: authSeed(), userConnections: connectedSeed() },
      gmailSend: createFakeGmailSend({ fail: new GmailAuthError() }),
    });
    const res = await post(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().via).toBe('smtp');
    expect(db.data.get('userConnections')).toHaveLength(0);
    expect(mailer.sent).toHaveLength(1);
  });

  it('connexion révoquée SANS relais SMTP : 502 gmail_disconnected, connexion purgée', async () => {
    const { app, db } = buildTestApp({
      seed: { user: [userDoc(USER)], appSettings: authSeed(), userConnections: connectedSeed() },
      gmailSend: createFakeGmailSend({ fail: new GmailAuthError() }),
      mailer: createFakeMailer({ enabled: false }),
    });
    const res = await post(app);
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('gmail_disconnected');
    expect(db.data.get('userConnections')).toHaveLength(0);
  });

  it('échec NON auth : 502 sans purger la connexion ni retomber sur SMTP', async () => {
    const { app, db, mailer } = buildTestApp({
      seed: { user: [userDoc(USER)], appSettings: authSeed(), userConnections: connectedSeed() },
      gmailSend: createFakeGmailSend({ fail: new Error('gmail_send_failed_500') }),
    });
    const res = await post(app);
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('mail_send_failed');
    expect(db.data.get('userConnections')).toHaveLength(1);
    expect(mailer.sent).toHaveLength(0);
  });

  it('un quota Gmail ne purge PAS la connexion', async () => {
    // Le correctif de fond : `gmail_rate_limited` n'est pas une révocation
    // (cf. lib/gmail.js). L'utilisateur retente dans quelques minutes au lieu
    // de devoir refaire tout le flux d'autorisation.
    const { app, db } = buildTestApp({
      seed: { user: [userDoc(USER)], appSettings: authSeed(), userConnections: connectedSeed() },
      gmailSend: createFakeGmailSend({ fail: new Error('gmail_rate_limited') }),
      mailer: createFakeMailer({ enabled: false }),
    });
    const res = await post(app);
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('mail_send_failed');
    expect(db.data.get('userConnections')).toHaveLength(1);
  });

  it('sans compte connecté ni relais SMTP : 501 mailer_disabled', async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(USER)] },
      mailer: createFakeMailer({ enabled: false }),
    });
    const res = await post(app);
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toBe('mailer_disabled');
  });
});

describe("connexion d'un compte depuis l'app native", () => {
  /** Départ du flux avec un billet, comme le fait la WebView. */
  async function startWithTicket(app, ticket) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/connect/start?ticket=${encodeURIComponent(ticket)}`,
    });
    const setCookie = String(res.headers['set-cookie']);
    const state = new RegExp(`${STATE_COOKIE}=([^;]*)`).exec(setCookie)?.[1] || '';
    return { res, state };
  }

  const mintTicket = (app, headers = identityHeaders(USER)) =>
    app.inject({ method: 'POST', url: '/api/connect/mobile/ticket', headers });

  it('le billet exige une session — il en est le transport, pas la source', async () => {
    const { app } = buildTestApp({ seed: { appSettings: authSeed() } });
    const res = await mintTicket(app, {});
    expect(res.statusCode).toBe(401);
  });

  it('un billet valide démarre le flux là où une navigation sans identité échouait', async () => {
    vi.stubGlobal('fetch', mockGoogle());
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)], appSettings: authSeed() } });

    // Sans billet : c'est exactement le comportement cassé sur mobile.
    const sansBillet = await app.inject({ method: 'GET', url: '/api/connect/start' });
    expect(sansBillet.headers.location).toBe('/');

    const ticket = mintTicket(app);
    const { res } = await startWithTicket(app, (await ticket).json().ticket);
    expect(res.statusCode).toBe(302);
    expect(new URL(res.headers.location).origin).toBe('https://accounts.google.test');
  });

  it('le billet est à USAGE UNIQUE', async () => {
    vi.stubGlobal('fetch', mockGoogle());
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)], appSettings: authSeed() } });
    const { ticket } = (await mintTicket(app)).json();

    await startWithTicket(app, ticket);
    const rejeu = await startWithTicket(app, ticket);
    expect(rejeu.res.headers.location).toBe('/');
  });

  it('un billet inventé ne démarre rien', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)], appSettings: authSeed() } });
    const { res } = await startWithTicket(app, 'billet-invente');
    expect(res.headers.location).toBe('/');
  });

  it('le retour ramène DANS l’app par un deep link, pas sur le site', async () => {
    // Sur mobile le consentement se déroule dans le navigateur système, où la
    // personne n'a pas de session : l'y abandonner serait un cul-de-sac.
    vi.stubGlobal('fetch', mockGoogle({ account: GMAIL_ACCOUNT, refreshToken: 'rt-fresh' }));
    const { app, db } = buildTestApp({ seed: { user: [userDoc(USER)], appSettings: authSeed() } });
    const { ticket } = (await mintTicket(app)).json();
    const { state } = await startWithTicket(app, ticket);

    const res = await callback(app, { state });
    expect(res.headers.location).toBe('mybrief://auth/connect?status=ok');
    // Le host reste `auth` : l'intent filter Android ne déclare que celui-là.
    expect(res.headers.location.startsWith('mybrief://auth/')).toBe(true);
    expect(db.data.get('userConnections')[0].refreshToken).toBe('rt-fresh');
  });

  it('un échec après consentement revient aussi dans l’app, avec son motif', async () => {
    vi.stubGlobal('fetch', mockGoogle({ refreshToken: null }));
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)], appSettings: authSeed() } });
    const { ticket } = (await mintTicket(app)).json();
    const { state } = await startWithTicket(app, ticket);

    const res = await callback(app, { state });
    expect(res.headers.location).toBe('mybrief://auth/connect?error=connect_no_refresh_token');
  });

  it('le flux WEB continue de revenir sur le site', async () => {
    vi.stubGlobal('fetch', mockGoogle({ account: GMAIL_ACCOUNT, refreshToken: 'rt-fresh' }));
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)], appSettings: authSeed() } });
    const { state } = await startFlow(app);
    const res = await callback(app, { state });
    expect(res.headers.location).toBe('/#config');
  });
});
