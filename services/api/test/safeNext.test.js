import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTestApp } from './helpers.js';
import { safeNext } from '../lib/auth/safeNext.js';
import { safeNext as safeNextFront } from '../../../src/utils/safeNext.js';
import { resetDiscoveryCache } from '../lib/auth/oidcClient.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const ACCEPTED = [
  ['/auth/mobile/start?cc=abc', '/auth/mobile/start?cc=abc'],
  ['/', '/'],
  ['/a/b?x=1#f', '/a/b?x=1#f'],
  ['  /espaces  ', '/espaces'],
];

/** Chacune de ces formes ressemble à un chemin mais change d'origine. */
const REJECTED = [
  'https://phishing.tld',
  'http://phishing.tld',
  '//phishing.tld',
  '/\\phishing.tld',
  '/a\\b',
  'javascript:alert(1)',
  'mybrief://auth/callback',
  '/a\nb',
  '/a\rb',
  '/a\tb',
  'auth/mobile/start',
  '',
  null,
  undefined,
  42,
];

describe('destination de retour (?next=)', () => {
  it.each(ACCEPTED)('accepte %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each(REJECTED)('ramène %s à la racine', (input) => {
    expect(safeNext(input)).toBe('/');
  });

  it('applique la MÊME règle côté navigateur', () => {
    // Les deux implémentations gouvernent deux moitiés du même parcours : une
    // divergence ouvrirait une redirection ouverte du côté le plus permissif.
    for (const [input, expected] of ACCEPTED) expect(safeNextFront(input)).toBe(expected);
    for (const input of REJECTED) expect(safeNextFront(input)).toBe('/');
  });
});

describe('retour après connexion SSO', () => {
  const settingsSeed = () => [
    {
      key: 'auth',
      google: { enabled: true, clientId: 'gid', clientSecret: 'gsecret' },
      allowedDomains: ['client.fr'],
    },
  ];

  function mockIdp(email = 'qui@client.fr') {
    return vi.fn(async (url) => {
      const target = String(url);
      if (target.includes('.well-known')) {
        return {
          ok: true,
          json: async () => ({
            authorization_endpoint: 'https://idp.test/auth',
            token_endpoint: 'https://idp.test/token',
            userinfo_endpoint: 'https://idp.test/userinfo',
          }),
        };
      }
      if (target.includes('/token'))
        return { ok: true, json: async () => ({ access_token: 'at' }) };
      return {
        ok: true,
        json: async () => ({ sub: '1', email, email_verified: true, name: 'Qui' }),
      };
    });
  }

  async function roundTrip(app, nextParam) {
    const query = nextParam === undefined ? '' : `?next=${encodeURIComponent(nextParam)}`;
    const start = await app.inject({ method: 'GET', url: `/api/auth/google/start${query}` });
    const state = /mybrief_oauth=([^;]*)/.exec(String(start.headers['set-cookie']))?.[1] || '';
    const back = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?state=${state}&code=c`,
      headers: { cookie: `mybrief_oauth=${state}` },
    });
    return { start, back };
  }

  beforeEach(() => {
    resetDiscoveryCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetDiscoveryCache();
  });

  it('ramène le navigateur sur la destination demandée', async () => {
    vi.stubGlobal('fetch', mockIdp());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const { start, back } = await roundTrip(app, '/auth/mobile/start?cc=abcdefghijklmnopqrstuvwx');

    // Le `next` ne part JAMAIS chez l'IdP : il vit dans l'état en base.
    expect(start.headers.location).not.toContain('next');
    expect(back.headers.location).toBe('/auth/mobile/start?cc=abcdefghijklmnopqrstuvwx');
    expect(String(back.headers['set-cookie'])).toContain('mybrief_sess=');
  });

  it('ignore une destination hors du site', async () => {
    vi.stubGlobal('fetch', mockIdp());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const { back } = await roundTrip(app, 'https://phishing.tld/');
    expect(back.headers.location).toBe('/');
  });

  it('revient à la racine sans destination', async () => {
    vi.stubGlobal('fetch', mockIdp());
    const { app } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const { back } = await roundTrip(app);
    expect(back.headers.location).toBe('/');
  });

  it("n'obéit pas à un `next` empoisonné directement en base", async () => {
    // La base n'est pas un périmètre de confiance pour une redirection : le
    // callback revalide au lieu de faire confiance à ce qu'il relit.
    vi.stubGlobal('fetch', mockIdp());
    const { app, db } = buildTestApp({ seed: { appSettings: settingsSeed() } });
    const start = await app.inject({ method: 'GET', url: '/api/auth/google/start' });
    const state = /mybrief_oauth=([^;]*)/.exec(String(start.headers['set-cookie']))?.[1] || '';
    db.data.get('authOAuthState')[0].next = '//phishing.tld';

    const back = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?state=${state}&code=c`,
      headers: { cookie: `mybrief_oauth=${state}` },
    });
    expect(back.headers.location).toBe('/');
  });
});

describe('câblage du départ de flux mobile', () => {
  const sidecar = readFileSync(join(ROOT, 'services/mobile-auth/server.js'), 'utf8');

  it('ignore les en-têtes d identité en mode session', () => {
    // Le mode est EXPLICITE, jamais déduit de la présence d'en-têtes : sinon un
    // client qui forge `X-User-Email` obtiendrait un jeton pour ce compte.
    const startBlock = sidecar.slice(
      sidecar.indexOf("path === '/auth/mobile/start'"),
      sidecar.indexOf('2. Échange OTT'),
    );
    const sessionBranch = startBlock.slice(
      startBlock.indexOf("IDENTITY_MODE === 'session'"),
      startBlock.indexOf('} else {'),
    );
    expect(sessionBranch).not.toMatch(/x-user-email|x-auth-request-user/i);
    expect(sessionBranch).toContain('resolveSession');
  });

  it('renvoie vers la connexion avec un retour sur lui-même', () => {
    expect(sidecar).toContain('/signin?next=');
    expect(sidecar).toContain('/auth/mobile/start?cc=');
  });

  it('ne transmet que le cookie de session à l API', () => {
    // Relayer les en-têtes du client permettrait d'y glisser une identité.
    const fn = sidecar.slice(
      sidecar.indexOf('async function resolveSession'),
      sidecar.indexOf('/** Page de redirection'),
    );
    expect(fn).toContain('headers: { cookie:');
    expect(fn).not.toMatch(/\.\.\.req\.headers/);
  });
});

describe('routage Traefik du départ mobile', () => {
  const COMPOSES = [
    { file: 'docker/docker-compose.yml', router: 'mauth-start-dev', noident: 'noident-dev' },
  ];

  it.each(COMPOSES)(
    '$file : le routeur est pilotable et documente noident',
    ({ file, router, noident }) => {
      const yaml = readFileSync(join(ROOT, file), 'utf8');
      const line = yaml.split('\n').find((l) => l.includes(`routers.${router}.middlewares=`));
      expect(line).toContain('${MOBILE_START_MIDDLEWARES:-');
      // Défaut inchangé : déployer ne bascule rien.
      expect(line).toMatch(/:-oidc(-dev)?\}/);
      // La valeur de bascule est nommée juste au-dessus, là où on la cherchera.
      expect(yaml).toContain(noident);
    },
  );
});
