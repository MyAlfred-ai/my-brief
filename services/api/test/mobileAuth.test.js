/**
 * Flux d'authentification mobile (OTT → JWT → ForwardAuth), rapatrié du
 * sidecar services/mobile-auth qui n'avait AUCUN test.
 *
 * Trois choses tiennent la sécurité de ce flux, et ont chacune leur test
 * nommé ici :
 *   1. pas d'OTT sans identité réellement établie (et surtout pas depuis un
 *      en-tête forgé quand le chemin est natif) ;
 *   2. l'OTT est à usage unique et lié au verifier PKCE ;
 *   3. /auth/verify n'accepte que du HS256 signé par NOUS — ni `alg: none`,
 *      ni un autre émetteur, ni un jeton expiré.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { buildTestApp, userDoc, identityHeaders, sessionCookieHeaders } from './helpers.js';
import { MOBILE_JWT_ISSUER } from '../lib/auth/mobileJwt.js';
import { loadConfig } from '../lib/config.js';

const SECRET = 'x'.repeat(48);
const EMAIL = 'mobile@example.com';
const VERIFIER = 'a'.repeat(64);
const CC = createHash('sha256').update(VERIFIER, 'utf8').digest('base64url');

const mobileConfig = (over = {}) => ({
  jwtSecret: SECRET,
  jwtTtlDays: 30,
  ottTtlMs: 60_000,
  appCallback: 'mybrief://auth/callback',
  ...over,
});

function makeApp({ mobile = mobileConfig(), users = [userDoc(EMAIL)] } = {}) {
  return buildTestApp({ seed: { user: users }, config: { mobile } });
}

/** Extrait l'OTT du deep link contenu dans la page de rebond. */
function ottOf(html) {
  return /ott=([A-Za-z0-9_-]+)/.exec(html)?.[1] || '';
}

let app;
afterEach(async () => {
  if (app) await app.close();
  app = null;
});

describe('/auth/mobile/start', () => {
  it('refuse un code challenge absent ou mal formé', async () => {
    ({ app } = makeApp());
    for (const query of ['', '?cc=', '?cc=trop-court', `?cc=${'x'.repeat(200)}`]) {
      const res = await app.inject({
        method: 'GET',
        url: `/auth/mobile/start${query}`,
        headers: identityHeaders(EMAIL),
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('émet un OTT quand le plugin OIDC a injecté l identité', async () => {
    ({ app } = makeApp());
    const res = await app.inject({
      method: 'GET',
      url: `/auth/mobile/start?cc=${CC}`,
      headers: { ...identityHeaders(EMAIL), 'x-auth-request-user': 'ext-id-42' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('mybrief://auth/callback?ott=');
    expect(ottOf(res.body)).toHaveLength(43); // 32 octets en base64url
  });

  it('émet un OTT sur le chemin natif (cookie de session, en-têtes effacés)', async () => {
    ({ app } = makeApp());
    const { token } = await app.sessions.create(EMAIL);
    const res = await app.inject({
      method: 'GET',
      url: `/auth/mobile/start?cc=${CC}`,
      headers: sessionCookieHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    expect(ottOf(res.body)).not.toBe('');
  });

  it("n'émet JAMAIS d'OTT pour une identité forgée en en-tête sur le chemin natif", async () => {
    // Le scénario que la variable MOBILE_AUTH_IDENTITY du sidecar devait
    // couvrir à la main : routeur sans plugin OIDC (marqueur `noident` posé),
    // client qui s'annonce lui-même. Sans session, il ne doit rien obtenir.
    ({ app } = makeApp({ users: [userDoc(EMAIL), userDoc('victime@example.com')] }));
    const res = await app.inject({
      method: 'GET',
      url: `/auth/mobile/start?cc=${CC}`,
      headers: {
        'x-mybrief-auth-path': 'native',
        'x-user-email': 'victime@example.com',
        'x-auth-request-user': 'victime@example.com',
      },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(
      `/signin?next=${encodeURIComponent('/auth/mobile/start?cc=' + CC)}`,
    );
    expect(res.body).not.toContain('ott=');
  });

  it('renvoie vers la connexion quand personne n est authentifié', async () => {
    ({ app } = makeApp());
    const res = await app.inject({ method: 'GET', url: `/auth/mobile/start?cc=${CC}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('/signin?next=');
  });

  it('reste éteint proprement sans secret configuré', async () => {
    ({ app } = makeApp({ mobile: mobileConfig({ jwtSecret: '' }) }));
    const res = await app.inject({
      method: 'GET',
      url: `/auth/mobile/start?cc=${CC}`,
      headers: identityHeaders(EMAIL),
    });
    expect(res.statusCode).toBe(503);
  });

  it('refuse un secret trop court plutôt que de signer avec', async () => {
    ({ app } = makeApp({ mobile: mobileConfig({ jwtSecret: 'court' }) }));
    const res = await app.inject({
      method: 'GET',
      url: `/auth/mobile/start?cc=${CC}`,
      headers: identityHeaders(EMAIL),
    });
    expect(res.statusCode).toBe(503);
  });

  it('plafonne les demandes d OTT par IP', async () => {
    // `config` est fusionné à plat : il faut repartir des autres fenêtres,
    // sinon les limiteurs des routes voisines naissent sans réglage.
    ({ app } = buildTestApp({
      seed: { user: [userDoc(EMAIL)] },
      config: {
        mobile: mobileConfig(),
        rateLimits: { ...loadConfig().rateLimits, mobileStartByIp: { windowMs: 60_000, max: 2 } },
      },
    }));
    const call = () =>
      app.inject({
        method: 'GET',
        url: `/auth/mobile/start?cc=${CC}`,
        headers: identityHeaders(EMAIL),
      });
    expect((await call()).statusCode).toBe(200);
    expect((await call()).statusCode).toBe(200);
    expect((await call()).statusCode).toBe(429);
  });

  it("échappe le deep link plutôt que de l'injecter tel quel dans la page", async () => {
    ({ app } = makeApp({
      mobile: mobileConfig({ appCallback: 'mybrief://cb"><script>alert(1)</script>' }),
    }));
    const res = await app.inject({
      method: 'GET',
      url: `/auth/mobile/start?cc=${CC}`,
      headers: identityHeaders(EMAIL),
    });
    expect(res.body).not.toContain('"><script>alert(1)');
    expect(res.body).toContain('&quot;&gt;&lt;script&gt;');
  });
});

describe('/auth/mobile/exchange', () => {
  /** Déroule /start et renvoie l'OTT obtenu. */
  async function issueOtt(instance, headers = identityHeaders(EMAIL)) {
    const res = await instance.inject({
      method: 'GET',
      url: `/auth/mobile/start?cc=${CC}`,
      headers,
    });
    return ottOf(res.body);
  }

  const exchange = (instance, payload) =>
    instance.inject({ method: 'POST', url: '/auth/mobile/exchange', payload });

  it('échange un OTT valide contre un JWT porteur de l identité', async () => {
    ({ app } = makeApp());
    const ott = await issueOtt(app);
    const res = await exchange(app, { ott, verifier: VERIFIER });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Le nom vient du document `user` quand il existe — même source que
    // /api/init, alors que le sidecar recopiait l'en-tête brut.
    expect(body.user).toEqual({ email: EMAIL, name: 'mobile', picture: '' });

    const claims = jwt.verify(body.token, SECRET, {
      algorithms: ['HS256'],
      issuer: MOBILE_JWT_ISSUER,
    });
    expect(claims.email).toBe(EMAIL);
    expect(claims.sub).toBe(EMAIL);
    // 30 jours par défaut, à quelques secondes près.
    expect(claims.exp - claims.iat).toBe(30 * 24 * 60 * 60);
  });

  it('refuse un OTT inconnu', async () => {
    ({ app } = makeApp());
    const res = await exchange(app, { ott: 'inexistant', verifier: VERIFIER });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('ott_invalid');
  });

  it('refuse un verifier qui ne correspond pas au challenge', async () => {
    ({ app } = makeApp());
    const ott = await issueOtt(app);
    const res = await exchange(app, { ott, verifier: 'b'.repeat(64) });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('verifier_mismatch');
  });

  it('brûle l OTT même quand le verifier est faux (pas de seconde chance)', async () => {
    ({ app } = makeApp());
    const ott = await issueOtt(app);
    expect((await exchange(app, { ott, verifier: 'mauvais' })).statusCode).toBe(401);
    const retry = await exchange(app, { ott, verifier: VERIFIER });
    expect(retry.statusCode).toBe(401);
    expect(retry.json().error).toBe('ott_invalid');
  });

  it('refuse le rejeu d un OTT déjà échangé', async () => {
    ({ app } = makeApp());
    const ott = await issueOtt(app);
    expect((await exchange(app, { ott, verifier: VERIFIER })).statusCode).toBe(200);
    expect((await exchange(app, { ott, verifier: VERIFIER })).statusCode).toBe(401);
  });

  it('refuse un OTT expiré', async () => {
    ({ app } = makeApp({ mobile: mobileConfig({ ottTtlMs: -1 }) }));
    const ott = await issueOtt(app);
    const res = await exchange(app, { ott, verifier: VERIFIER });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('ott_invalid');
  });

  it('rejette un corps incomplet sans toucher au store', async () => {
    ({ app } = makeApp());
    const res = await exchange(app, { ott: 'seul' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
  });
});

describe('/auth/verify (cible ForwardAuth)', () => {
  const verify = (instance, authorization) =>
    instance.inject({
      method: 'GET',
      url: '/auth/verify',
      headers: authorization ? { authorization } : {},
    });

  const signed = (claims, opts = {}) =>
    jwt.sign(claims, opts.secret || SECRET, {
      algorithm: 'HS256',
      expiresIn: '30d',
      issuer: MOBILE_JWT_ISSUER,
      ...opts.sign,
    });

  beforeEach(() => {
    ({ app } = makeApp());
  });

  it('renvoie les quatre en-têtes d identité pour un jeton valide', async () => {
    const res = await verify(
      app,
      `Bearer ${signed({ sub: EMAIL, user: 'ext-42', email: EMAIL, name: 'Éric Ünicode', picture: 'https://img' })}`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-auth-request-user']).toBe('ext-42');
    expect(res.headers['x-user-email']).toBe(EMAIL);
    expect(res.headers['x-user-picture']).toBe('https://img');
    // Octets UTF-8 transposés en latin1 : c'est ce que le plugin OIDC met sur
    // le fil, et ce que lib/identity.js sait re-décoder.
    expect(Buffer.from(res.headers['x-user-name'], 'latin1').toString('utf8')).toBe('Éric Ünicode');
  });

  it('renvoie les en-têtes MÊME vides (ils doivent écraser toute valeur forgée)', async () => {
    const res = await verify(app, `Bearer ${signed({ sub: EMAIL, email: EMAIL })}`);
    expect(res.statusCode).toBe(200);
    for (const header of ['x-auth-request-user', 'x-user-email', 'x-user-name', 'x-user-picture']) {
      expect(res.headers[header]).toBeDefined();
    }
  });

  it('refuse une requête sans Bearer', async () => {
    expect((await verify(app)).statusCode).toBe(401);
    expect((await verify(app, 'Basic abc')).json().error).toBe('missing_bearer');
  });

  it('refuse un jeton signé avec un autre secret', async () => {
    const res = await verify(app, `Bearer ${signed({ email: EMAIL }, { secret: 'y'.repeat(48) })}`);
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('invalid_token');
  });

  it("refuse un jeton `alg: none` (confusion d'algorithme)", async () => {
    const none = jwt.sign({ email: EMAIL, iss: MOBILE_JWT_ISSUER }, '', { algorithm: 'none' });
    const res = await verify(app, `Bearer ${none}`);
    expect(res.statusCode).toBe(401);
  });

  it('refuse un jeton émis par un autre émetteur', async () => {
    const other = jwt.sign({ email: EMAIL }, SECRET, {
      algorithm: 'HS256',
      expiresIn: '30d',
      issuer: 'quelqun-dautre',
    });
    expect((await verify(app, `Bearer ${other}`)).statusCode).toBe(401);
  });

  it('refuse un jeton expiré', async () => {
    const expired = jwt.sign({ email: EMAIL }, SECRET, {
      algorithm: 'HS256',
      expiresIn: '-1s',
      issuer: MOBILE_JWT_ISSUER,
    });
    expect((await verify(app, `Bearer ${expired}`)).statusCode).toBe(401);
  });

  it('refuse un jeton dont la charge utile a été retouchée', async () => {
    const token = signed({ sub: EMAIL, email: EMAIL });
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url')),
        email: 'admin@example.com',
      }),
    ).toString('base64url');
    const res = await verify(app, `Bearer ${header}.${forged}.${signature}`);
    expect(res.statusCode).toBe(401);
  });

  it("n'autorise rien quand aucun secret n'est configuré", async () => {
    await app.close();
    ({ app } = makeApp({ mobile: mobileConfig({ jwtSecret: '' }) }));
    // Jeton parfaitement formé pour un AUTRE déploiement : sans secret ici,
    // c'est un refus, jamais un laissez-passer.
    expect((await verify(app, `Bearer ${signed({ email: EMAIL })}`)).statusCode).toBe(401);
  });
});
