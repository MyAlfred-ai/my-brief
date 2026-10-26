import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';

const USER = 'simple@client.fr';
const ADMIN = 'patron@client.fr';

const seed = {
  user: [userDoc(USER), userDoc(ADMIN, { role: 'admin' })],
  templates: [{ value: 'compta' }],
};

function postJson(app, url, body, email) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('templates transverses — écriture réservée aux admins', () => {
  // NON-RÉGRESSION : avant l'introduction des rôles, ces deux routes n'avaient
  // AUCUN contrôle serveur. Tout compte authentifié pouvait réécrire ou
  // supprimer les templates partagés de toute l'organisation.
  it('POST /api/templates/save refuse un utilisateur simple', async () => {
    const { app, db } = buildTestApp({ seed });
    const res = await postJson(app, '/api/templates/save', { value: 'pirate' }, USER);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
    expect(db.data.get('templates')).toHaveLength(1);
  });

  it('POST /api/templates/delete refuse un utilisateur simple', async () => {
    const { app, db } = buildTestApp({ seed });
    const res = await postJson(app, '/api/templates/delete', { value: 'compta' }, USER);
    expect(res.statusCode).toBe(403);
    expect(db.data.get('templates')).toHaveLength(1);
  });

  it('un admin peut écrire', async () => {
    const { app } = buildTestApp({ seed });
    expect((await postJson(app, '/api/templates/save', { value: 'rh' }, ADMIN)).statusCode).toBe(
      200,
    );
    expect(
      (await postJson(app, '/api/templates/delete', { value: 'compta' }, ADMIN)).statusCode,
    ).toBe(200);
  });

  it('la LECTURE reste ouverte à tout compte authentifié', async () => {
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/templates',
      headers: identityHeaders(USER),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().templates).toHaveLength(1);
  });

  it('mais pas à un anonyme', async () => {
    const { app } = buildTestApp({ seed });
    expect((await app.inject({ method: 'GET', url: '/api/templates' })).statusCode).toBe(401);
  });
});

describe('routes d administration', () => {
  it('un utilisateur simple reçoit 403', async () => {
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: identityHeaders(USER),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
  });

  it('un anonyme reçoit 401', async () => {
    const { app } = buildTestApp({ seed });
    expect((await app.inject({ method: 'GET', url: '/api/admin/users' })).statusCode).toBe(401);
  });

  it('un admin passe', async () => {
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: identityHeaders(ADMIN),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(2);
  });

  it('un compte OIDC inconnu de la base n est jamais admin', async () => {
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: identityHeaders('inconnu@myalfred.ai'),
    });
    // Le rôle vient du document en base, jamais du suffixe de l'email.
    expect(res.statusCode).toBe(403);
  });
});
