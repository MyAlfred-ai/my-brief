/**
 * Routes IA — aucune ne sert une requête sans identité.
 *
 * Le routeur Traefik de la session native laisse passer toute requête qui
 * porte un cookie `mybrief_sess`, valide ou non : c'est l'API qui juge. Ce qui
 * casserait sans ces tests : un cookie inventé obtiendrait un jeton Realtime,
 * une transcription ou un appel de chat sur la clé OpenAI de l'installation,
 * sans quota — la porte du quota ne voit pas un anonyme.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, multipartBody, sessionCookieHeaders } from './helpers.js';

const json = { 'content-type': 'application/json' };

const ROUTES = [
  { name: '/tempkey', request: () => ({ method: 'GET', url: '/api/tempkey?lang=fr' }) },
  {
    name: '/record',
    request: () => {
      const { body, headers } = multipartBody();
      return { method: 'POST', url: '/api/record', headers, body };
    },
  },
  {
    name: '/record?source=offline',
    request: () => {
      const { body, headers } = multipartBody();
      return { method: 'POST', url: '/api/record?source=offline', headers, body };
    },
  },
  {
    name: '/actions',
    request: () => ({
      method: 'POST',
      url: '/api/actions',
      headers: json,
      body: JSON.stringify({ content: 'Alex relance le client lundi.' }),
    }),
  },
  {
    name: '/refine-transcript',
    request: () => ({
      method: 'POST',
      url: '/api/refine-transcript',
      headers: json,
      body: JSON.stringify({ notes: 'INITECH', sentences: ['On appelle Initech.'] }),
    }),
  },
];

describe('routes IA sans identité', () => {
  for (const route of ROUTES) {
    it(`${route.name} : 401 sans identité, aucun appel OpenAI`, async () => {
      const { app, ai } = buildTestApp();
      const res = await app.inject(route.request());
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'unauthenticated' });
      expect(ai.calls).toHaveLength(0);
    });

    it(`${route.name} : 401 avec un cookie de session inventé`, async () => {
      const { app, ai } = buildTestApp();
      const req = route.request();
      const res = await app.inject({
        ...req,
        headers: { ...req.headers, ...sessionCookieHeaders('jeton-invente') },
      });
      expect(res.statusCode).toBe(401);
      expect(ai.calls).toHaveLength(0);
    });
  }
});
