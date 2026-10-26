/**
 * Test de sécurité central de l'authentification native.
 *
 * Les routeurs Traefik qui n'appliquent pas le middleware OIDC (/api/auth, et
 * /api quand un cookie natif est présent) atteignent l'API sans qu'aucun
 * middleware n'ait écrasé les en-têtes d'identité. Sans la parade de
 * lib/auth/resolve.js, ceci suffirait à lire les données de n'importe qui :
 *
 *   curl -H 'X-User-Email: victime@…' -H 'Cookie: mybrief_sess=nimporte' /api/history
 *
 * Le middleware `noident` efface ces en-têtes ET pose X-Mybrief-Auth-Path:
 * native. Sa seule présence doit disqualifier l'identité par en-tête, même si
 * l'effacement venait à ne pas fonctionner.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, userDoc } from './helpers.js';

const VICTIME = 'victime@myalfred.ai';

const seed = {
  user: [userDoc(VICTIME, { role: 'admin' })],
  resume: [{ meetingId: 'm1', email: VICTIME, title: 'Réunion confidentielle', now: '2026-01-01' }],
};

describe('usurpation par en-tête sur le chemin natif', () => {
  it('en-tête d identité + cookie bidon → 401, aucune donnée lue', async () => {
    const { app, db } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: {
        'x-user-email': VICTIME,
        cookie: 'mybrief_sess=poubelle',
        'x-mybrief-auth-path': 'native',
      },
    });
    expect(res.statusCode).toBe(401);
    const leaked = db.calls.filter((c) => c.collection === 'resume');
    expect(leaked).toHaveLength(0);
  });

  it('en-tête d identité seul, marqueur natif, sans cookie → 401', async () => {
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: { 'x-user-email': VICTIME, 'x-mybrief-auth-path': 'native' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('le repli x-auth-request-user est lui aussi neutralisé', async () => {
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: { 'x-auth-request-user': VICTIME, 'x-mybrief-auth-path': 'native' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('le marqueur natif n empêche pas une VRAIE session de fonctionner', async () => {
    const { app, db } = buildTestApp({ seed });
    const { token } = await app.sessions.create(VICTIME.toLowerCase());
    const res = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: { cookie: `mybrief_sess=${token}`, 'x-mybrief-auth-path': 'native' },
    });
    expect(res.statusCode).toBe(200);
    expect(db.calls.some((c) => c.collection === 'resume')).toBe(true);
  });

  it('un rôle admin ne peut pas être obtenu par en-tête sur le chemin natif', async () => {
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { 'x-user-email': VICTIME, 'x-mybrief-auth-path': 'native' },
    });
    expect(res.statusCode).toBe(401);
  });
});
