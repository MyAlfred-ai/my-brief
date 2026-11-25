/**
 * Corps de requête anonymes : refusés AVANT d'être lus.
 *
 * Ce qui compte ici : `bodyLimit` vaut 32 Mo (une transcription de 8 h), et
 * `requireEmail` refusait dans le handler — donc APRÈS la lecture et
 * l'analyse du corps. Cinq requêtes anonymes de 32 Mo suffisaient à faire
 * tuer le conteneur de l'API (256 Mo). Désormais authPlugin répond 401 dès
 * `onRequest`, sauf pour la courte liste des routes publiques, qui ont chacune
 * une limite de quelques Ko.
 *
 * Le test énumère TOUTES les routes enregistrées : une route ajoutée demain
 * est couverte sans y penser.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders } from './helpers.js';
import { ANONYMOUS_BODY_PATHS } from '../lib/authPlugin.js';

const BODY_METHODS = /^(POST|PUT|PATCH|DELETE)$/;

async function appWithRoutes() {
  const { app } = buildTestApp();
  const routes = [];
  app.addHook('onRoute', (r) => {
    for (const method of [].concat(r.method)) {
      if (BODY_METHODS.test(method)) routes.push({ method, url: r.url });
    }
  });
  await app.ready();
  return { app, routes: routes.filter((r) => r.url.startsWith('/api/')) };
}

describe('corps anonymes', () => {
  it('toute route /api qui n’est pas publique répond 401 sans lire le corps', async () => {
    const { app, routes } = await appWithRoutes();
    const protectedRoutes = routes.filter((r) => !ANONYMOUS_BODY_PATHS.has(r.url));
    expect(protectedRoutes.length).toBeGreaterThan(50);
    // Un corps invalide : s'il était lu, l'analyse JSON répondrait 400.
    for (const { method, url } of protectedRoutes) {
      const res = await app.inject({
        method,
        url,
        headers: { 'content-type': 'application/json' },
        payload: '{ pas du json',
      });
      expect([url, res.statusCode, res.json().error]).toEqual([url, 401, 'unauthenticated']);
    }
  });

  it('les routes publiques existent toutes, et lisent leur corps (400 de validation)', async () => {
    const { app, routes } = await appWithRoutes();
    const urls = new Set(routes.map((r) => r.url));
    for (const url of ANONYMOUS_BODY_PATHS) expect(urls.has(url), url).toBe(true);
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('routes publiques : un gros corps est refusé par leur limite (413), pas lu en entier', async () => {
    const { app } = await appWithRoutes();
    const big = JSON.stringify({ email: 'a@b.test', password: 'x'.repeat(64 * 1024) });
    for (const url of [
      '/api/auth/login',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
    ]) {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { 'content-type': 'application/json' },
        payload: big,
      });
      expect([url, res.statusCode]).toEqual([url, 413]);
    }
    for (const url of ['/api/logout', '/api/auth/logout']) {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ pad: 'x'.repeat(4096) }),
      });
      expect([url, res.statusCode]).toEqual([url, 413]);
    }
  });

  it('avec une identité, rien ne change : le corps est lu (le 401 vient du handler ou pas du tout)', async () => {
    const { app } = await appWithRoutes();
    const res = await app.inject({
      method: 'POST',
      url: '/api/tags/save',
      headers: { ...identityHeaders('alice@example.com'), 'content-type': 'application/json' },
      payload: '{ pas du json',
    });
    expect(res.statusCode).toBe(400);
  });

  it('les lectures (GET) anonymes ne sont pas concernées : le handler décide', async () => {
    const { app } = await appWithRoutes();
    expect((await app.inject({ method: 'GET', url: '/api/ping' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/config' })).statusCode).toBe(200);
  });
});
