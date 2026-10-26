/**
 * Handler d'erreur RACINE (lib/errors.js slugErrorHandler, posé par app.js).
 *
 * Avant lui, les routes hors auth/admin/actions retombaient sur le défaut
 * Fastify, qui RELAIE err.message dans le corps du 500 — détail interne
 * (chemins, erreurs Mongo) exposé au client, et hors contrat de slugs.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders } from './helpers.js';

const EMAIL = 'alex@myalfred.ai';

describe('handler erreur racine', () => {
  it("un throw interne sur une route héritée → 500 {error:'internal_error'}, message NON fuité", async () => {
    const { app } = buildTestApp({
      openai: {
        chat: () => {
          // Erreur générique (≠ UpstreamError) : le détail ne doit JAMAIS
          // atteindre le client.
          throw new Error('détail interne mongodb://root:pass@mongo');
        },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/resume',
      headers: { ...identityHeaders(EMAIL), 'content-type': 'application/json' },
      body: JSON.stringify({ transcription: 'x', systemPrompt: 'y' }),
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal_error' });
    expect(res.body).not.toContain('mongodb://');
    expect(res.body).not.toContain('détail interne');
  });

  it('la normalisation ajv reste active dans les sous-contextes (héritage racine)', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions/email',
      headers: { ...identityHeaders(EMAIL), 'content-type': 'application/json' },
      body: JSON.stringify({}), // kind + content requis
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('invalid_body');
    expect(body.fields).toContain('kind');
  });
});
