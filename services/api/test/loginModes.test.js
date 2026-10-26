/**
 * Modes de l'écran de connexion — pilotés depuis l'administration.
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - chaque mode servi par /api/auth/config est un ET à deux étages :
 *     déclaré par l'environnement (PASSWORD_LOGIN_ENABLED, OIDC_ENABLED)
 *     ET affiché par le réglage d'administration ;
 *   - un document `auth` d'avant ces réglages (sans `passwordLogin` ni
 *     `legacySso`) vaut « affiché » — déployer ne change rien de visible ;
 *   - masquer le mot de passe ferme AUSSI la route /api/auth/login : l'API ne
 *     se fie jamais à ce que l'écran affiche ;
 *   - la garde anti-verrouillage juge l'état d'ARRIVÉE : impossible
 *     d'enregistrer un état qui ne laisserait plus aucun mode affiché.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, userDoc, identityHeaders } from './helpers.js';
import { hashPassword } from '../lib/auth/password.js';

const ADMIN = 'patron@client.fr';
const CLIENT_ID = 'client-abc.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-secret';

const authDoc = (overrides = {}) => ({
  key: 'auth',
  google: { enabled: true, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
  allowedDomains: ['client.fr'],
  ...overrides,
});

const seed = (settingsOverrides = {}, users = []) => ({
  user: [userDoc(ADMIN, { role: 'admin' }), ...users],
  appSettings: [authDoc(settingsOverrides)],
});

const getConfig = async (app) =>
  (await app.inject({ method: 'GET', url: '/api/auth/config' })).json();

const postSettings = (app, body) =>
  app.inject({
    method: 'POST',
    url: '/api/admin/settings/auth',
    headers: { ...identityHeaders(ADMIN), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('GET /api/auth/config — modes de connexion', () => {
  it('un document d avant ces réglages affiche tout (comportement historique)', async () => {
    const { app } = buildTestApp({
      seed: seed(),
      config: { passwordLoginEnabled: true, oidcEnabled: true },
    });
    expect(await getConfig(app)).toMatchObject({
      passwordLoginEnabled: true,
      oidcEnabled: true,
      googleEnabled: true,
    });
  });

  it('un mode masqué depuis l administration disparaît de la sonde', async () => {
    const { app } = buildTestApp({
      seed: seed({ passwordLogin: { enabled: false }, legacySso: { enabled: false } }),
      config: { passwordLoginEnabled: true, oidcEnabled: true },
    });
    expect(await getConfig(app)).toMatchObject({
      passwordLoginEnabled: false,
      oidcEnabled: false,
      googleEnabled: true,
    });
  });

  it('l environnement reste le coupe-circuit : réglage affiché mais env à faux ⇒ masqué', async () => {
    const { app } = buildTestApp({
      seed: seed({ passwordLogin: { enabled: true }, legacySso: { enabled: true } }),
      config: { passwordLoginEnabled: false, oidcEnabled: false },
    });
    expect(await getConfig(app)).toMatchObject({
      passwordLoginEnabled: false,
      oidcEnabled: false,
    });
  });
});

describe('POST /api/auth/login — mode masqué', () => {
  it('répond 501 quand le mot de passe est masqué depuis l administration', async () => {
    const user = userDoc('user@client.fr', {
      passwordHash: await hashPassword('un-mot-de-passe-solide'),
      authProviders: ['password'],
    });
    const { app } = buildTestApp({
      seed: seed({ passwordLogin: { enabled: false } }, [user]),
      config: { passwordLoginEnabled: true },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@client.fr', password: 'un-mot-de-passe-solide' }),
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toBe('password_login_disabled');
  });
});

describe('réglages des modes via /api/admin/settings/auth', () => {
  it('la projection porte le réglage ET le drapeau d environnement de chaque mode', async () => {
    const { app } = buildTestApp({
      seed: seed({ legacySso: { enabled: false } }),
      config: { passwordLoginEnabled: false, oidcEnabled: true },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/auth',
      headers: identityHeaders(ADMIN),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.passwordLogin).toEqual({ enabled: true, envEnabled: false });
    expect(res.json().settings.legacySso).toEqual({ enabled: false, envEnabled: true });
  });

  it('masquer le mot de passe est accepté tant qu un SSO natif utilisable reste', async () => {
    const { app, db } = buildTestApp({
      seed: seed(),
      config: { passwordLoginEnabled: true, oidcEnabled: false },
    });
    const res = await postSettings(app, { passwordLogin: { enabled: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.passwordLogin.enabled).toBe(false);
    expect(db.data.get('appSettings')[0].passwordLogin.enabled).toBe(false);
    // Et la sonde publique suit.
    expect((await getConfig(app)).passwordLoginEnabled).toBe(false);
  });

  it('le SSO historique déclaré par l environnement compte comme mode restant', async () => {
    const { app } = buildTestApp({
      seed: seed({ google: { enabled: false, clientId: '', clientSecret: '' } }),
      config: { passwordLoginEnabled: true, oidcEnabled: true },
    });
    expect((await postSettings(app, { passwordLogin: { enabled: false } })).statusCode).toBe(200);
  });

  it('refuse un enregistrement qui ne laisserait plus aucun mode affiché', async () => {
    const { app, db } = buildTestApp({
      seed: seed({ google: { enabled: false, clientId: '', clientSecret: '' } }),
      config: { passwordLoginEnabled: true, oidcEnabled: false },
    });
    const res = await postSettings(app, { passwordLogin: { enabled: false } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('no_login_mode_left');
    // Rien n'a été écrit : le refus précède l'écriture.
    expect(db.data.get('appSettings')[0].passwordLogin).toBeUndefined();
  });

  it('la garde juge l état d arrivée : couper le dernier SSO et le mot de passe en un envoi', async () => {
    const { app } = buildTestApp({
      seed: seed(),
      config: { passwordLoginEnabled: true, oidcEnabled: false },
    });
    const res = await postSettings(app, {
      google: { enabled: false },
      passwordLogin: { enabled: false },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('no_login_mode_left');
  });
});
