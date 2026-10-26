import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';

describe('routes cœur', () => {
  it('GET /api/init upserte le compte et renvoie {email, name, role, lastConnecion}', async () => {
    const { app, db } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: identityHeaders('alex@myalfred.ai'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe('alex@myalfred.ai');
    expect(body.name).toBe('alex'); // partie locale de l'email, comme n8n
    expect(body.role).toBe('user');
    expect(body.authMode).toBe('oidc');
    expect(typeof body.lastConnecion).toBe('string'); // la faute de frappe est le nom de champ historique

    const upsert = db.calls.find((c) => c.op === 'updateOne' && c.collection === 'user');
    // Le compte SERVI (emailLower texte) : jamais un doublon inerte de même adresse.
    expect(upsert.filter).toEqual({ email: 'alex@myalfred.ai', emailLower: { $type: 'string' } });
    expect(upsert.options.upsert).toBe(true);
    // ⚠️ Non-régression : /init tourne à CHAQUE ouverture de l'app. Un
    // remplacement complet, ou un $set touchant ces champs, effacerait le mot
    // de passe et le rôle du compte à chaque connexion.
    expect(db.calls.find((c) => c.op === 'findOneAndReplace')).toBeUndefined();
    expect(upsert.update.$set).not.toHaveProperty('passwordHash');
    expect(upsert.update.$set).not.toHaveProperty('role');
    expect(upsert.update.$setOnInsert.role).toBe('user');
  });

  it('GET /api/init ne réécrit pas un nom posé par un administrateur', async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc('alex@myalfred.ai', { name: 'Alex Dupont', role: 'admin' })] },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: identityHeaders('alex@myalfred.ai'),
    });
    expect(res.json().name).toBe('Alex Dupont');
    expect(res.json().role).toBe('admin');
  });

  it('GET /api/init renvoie et garde la photo posée par le plugin OIDC', async () => {
    const photo = 'https://lh3.googleusercontent.com/a/photo';
    const { app, db } = buildTestApp({ seed: { user: [userDoc('alex@myalfred.ai')] } });
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: { ...identityHeaders('alex@myalfred.ai'), 'x-user-picture': photo },
    });
    expect(res.json().picture).toBe(photo);
    // Sur le compte : une connexion par mot de passe la retrouvera.
    expect(db.data.get('user')[0].picture).toBe(photo);
  });

  it('GET /api/init sans photo renvoie une chaîne vide, pas une adresse inventée', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: { ...identityHeaders('alex@myalfred.ai'), 'x-user-picture': 'javascript:alert(1)' },
    });
    expect(res.json().picture).toBe('');
  });

  it('GET /api/init sans identité → 401 unauthenticated', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/init' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('repli x-auth-request-user quand x-user-email est absent (Entra)', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/init',
      headers: { 'x-auth-request-user': 'entra@client.fr' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe('entra@client.fr');
  });

  it('GET /api/ping répond {ok:true}', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/ping' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('POST /api/logout répond 204', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/logout' });
    expect(res.statusCode).toBe(204);
  });
});
