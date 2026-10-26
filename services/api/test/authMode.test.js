/**
 * `authMode` — ce que le frontend en déduit.
 *
 * Deux décisions en dépendent, et elles se trompaient toutes les deux pour les
 * comptes connectés via Google ou Entra :
 *   - proposer « changer de mot de passe » : un compte SSO n'en a pas, le
 *     formulaire ne pouvait qu'échouer ;
 *   - se déconnecter par le RP-logout de l'IdP : à réserver au SSO porté par
 *     Traefik, sinon on ferme aussi la session Google du navigateur.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, userDoc, identityHeaders, sessionCookieHeaders } from './helpers.js';
import { authModeOf, authProviderOf } from '../lib/auth/resolve.js';
import { hashPassword } from '../lib/auth/password.js';

const SSO_USER = 'google@client.fr';
const PWD_USER = 'motdepasse@client.fr';

describe('authModeOf', () => {
  it('identité par en-tête = oidc (seul cas de RP-logout)', () => {
    expect(authModeOf({ source: 'headers', doc: null })).toBe('oidc');
  });

  it('session native sans mot de passe = sso', () => {
    expect(authModeOf({ source: 'session', doc: { email: SSO_USER } })).toBe('sso');
  });

  it('session native avec mot de passe = password', () => {
    expect(authModeOf({ source: 'session', doc: { passwordHash: 'scrypt$x' } })).toBe('password');
  });

  it('aucune identité = oidc, jamais un mode natif par défaut', () => {
    expect(authModeOf(null)).toBe('oidc');
  });
});

describe('GET /api/auth/session', () => {
  it('un compte connecté via Google n annonce PAS le mode mot de passe', async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(SSO_USER, { authProviders: ['google'] })] },
    });
    const { token } = await app.sessions.create(SSO_USER);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: sessionCookieHeaders(token),
    });
    expect(res.json().user.authMode).toBe('sso');
  });

  it('un compte avec mot de passe annonce le mode mot de passe', async () => {
    const seed = {
      user: [userDoc(PWD_USER, { passwordHash: await hashPassword('secret-du-compte') })],
    };
    const { app } = buildTestApp({ seed });
    const { token } = await app.sessions.create(PWD_USER);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: sessionCookieHeaders(token),
    });
    expect(res.json().user.authMode).toBe('password');
  });
});

describe('GET /api/init', () => {
  it('reporte le même mode que /api/auth/session pour un compte SSO', async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(SSO_USER, { authProviders: ['google'] })] },
    });
    const { token } = await app.sessions.create(SSO_USER);

    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: sessionCookieHeaders(token),
    });
    expect(res.json().authMode).toBe('sso');
  });

  it('reste « oidc » derrière le plugin Traefik', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(SSO_USER)] } });
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: identityHeaders(SSO_USER),
    });
    expect(res.json().authMode).toBe('oidc');
  });
});

/**
 * `authProvider` — le raffinement dont dépend l'AVATAR (logo Google, logo
 * Microsoft, clé, badge SSO). Il se lit sur la SESSION et non sur le compte :
 * `authProviders` dit ce qui est lié, pas ce qui a servi à ouvrir celle-ci.
 */
describe('authProviderOf', () => {
  it('identité par en-tête = oidc', () => {
    expect(authProviderOf({ source: 'headers', doc: null })).toBe('oidc');
  });

  it('prend le fournisseur enregistré sur la session', () => {
    expect(authProviderOf({ source: 'session', sessionProvider: 'entra', doc: {} })).toBe('entra');
  });

  it('la session prime sur le compte : un mot de passe posé ne change pas le logo', () => {
    const user = {
      source: 'session',
      sessionProvider: 'google',
      doc: { passwordHash: 'scrypt$x', authProviders: ['google', 'password'] },
    };
    expect(authProviderOf(user)).toBe('google');
    // …et le compte garde bien le droit de changer son mot de passe.
    expect(authModeOf(user)).toBe('password');
  });

  it('refuse une valeur hors liste plutôt que de la relayer au frontend', () => {
    expect(authProviderOf({ source: 'session', sessionProvider: 'evil', doc: {} })).toBe('sso');
  });

  it('session antérieure au champ : repli sur le compte', () => {
    expect(authProviderOf({ source: 'session', doc: { passwordHash: 'scrypt$x' } })).toBe(
      'password',
    );
    expect(authProviderOf({ source: 'session', doc: { authProviders: ['entra'] } })).toBe('entra');
    expect(authProviderOf({ source: 'session', doc: {} })).toBe('sso');
  });
});

describe('authProvider de bout en bout', () => {
  it('une session ouverte par mot de passe annonce « password »', async () => {
    const seed = {
      user: [userDoc(PWD_USER, { passwordHash: await hashPassword('secret-du-compte') })],
    };
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: PWD_USER, password: 'secret-du-compte' },
    });
    expect(res.json().user.authProvider).toBe('password');
  });

  it('une session Google annonce « google » sur /api/init et /api/auth/session', async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(SSO_USER, { authProviders: ['google'] })] },
    });
    const { token } = await app.sessions.create(SSO_USER, { provider: 'google' });
    const headers = sessionCookieHeaders(token);

    const session = await app.inject({ method: 'GET', url: '/api/auth/session', headers });
    expect(session.json().user.authProvider).toBe('google');

    const init = await app.inject({ method: 'GET', url: '/api/init', headers });
    expect(init.json().authProvider).toBe('google');
  });

  it('derrière le plugin Traefik, aucun fournisseur natif n est inventé', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(SSO_USER)] } });
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: identityHeaders(SSO_USER),
    });
    expect(res.json().authProvider).toBe('oidc');
  });
});
