/**
 * Le compilateur de schémas partagé de test/helpers.js : il rend les tests
 * d'API ~2,5 fois plus rapides, à condition de valider EXACTEMENT comme la
 * production. Ces tests tiennent les deux bouts de ce contrat.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp } from './helpers.js';

const body = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: { name: { type: 'string', minLength: 1 } },
};

function withRoute(schema) {
  const { app } = buildTestApp();
  app.post('/api/__schema', { schema }, async (req) => ({ got: req.body }));
  return app;
}

describe('compilateur de schémas partagé des tests', () => {
  it('valide comme la production, y compris pour un schéma déjà compilé par une autre application', async () => {
    for (let i = 0; i < 2; i++) {
      // Un littéral neuf à chaque tour : le second passe par le cache « par forme ».
      const app = withRoute({ body: structuredClone(body) });
      const ok = await app.inject({ method: 'POST', url: '/api/__schema', payload: { name: 'a' } });
      expect(ok.statusCode).toBe(200);
      const ko = await app.inject({ method: 'POST', url: '/api/__schema', payload: { name: '' } });
      expect(ko.statusCode).toBe(400);
      await app.close();
    }
  });

  it("refuse un schéma d'en-têtes, que la production validerait autrement", async () => {
    const app = withRoute({
      headers: { type: 'object', properties: { 'X-Trace': { type: 'string' } } },
    });
    await expect(app.ready()).rejects.toThrow(/schéma d'en-têtes/);
  });
});
