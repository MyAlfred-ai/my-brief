/**
 * Verdict de /tempkey au démarrage d'une réunion (utils/tempKeyStart.js).
 *
 * Ce qui casserait sans ces tests : un 409 quota_exhausted pris pour une
 * panne de l'IA (message faux, et l'app native partirait enregistrer hors
 * ligne alors que le serveur a répondu) ; une redirection de session lue
 * comme une erreur ; une panne réseau qui lèverait au lieu de rendre un
 * verdict que la plateforme arbitre.
 */
import { describe, it, expect, vi } from 'vitest';
import { acquireStartTempKey } from './tempKeyStart.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const run = (res) =>
  acquireStartTempKey({ lang: 'fr', fetchRaw: typeof res === 'function' ? res : async () => res });

describe('acquireStartTempKey', () => {
  it('ok : jeton et modèle, langue transmise', async () => {
    const fetchRaw = vi.fn(async () => json(200, { value: 'ek_1', transcriptionModel: 'm-1' }));
    const verdict = await acquireStartTempKey({ lang: 'en', fetchRaw });
    expect(verdict).toEqual({ kind: 'ok', secret: 'ek_1', model: 'm-1' });
    expect(fetchRaw).toHaveBeenCalledWith('/tempkey?lang=en');
  });

  it('quota : 409 quota_exhausted, avec l état à afficher', async () => {
    const quota = { exhausted: true, remainingMinutes: 0, limitMinutes: 60 };
    expect(await run(json(409, { error: 'quota_exhausted', quota }))).toEqual({
      kind: 'quota',
      quota,
    });
  });

  it('un autre 409 reste une erreur de service, pas un quota', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const verdict = await run(json(409, { error: 'autre_chose' }));
    expect(verdict.kind).toBe('ai_error');
    expect(verdict.info).toMatchObject({ status: 409, isCredit: false });
  });

  it('ai_error : le corps est inspecté, un crédit épuisé est reconnu', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const verdict = await run(
      json(429, {
        error: { message: 'You exceeded your current quota', type: 'insufficient_quota' },
      }),
    );
    expect(verdict.kind).toBe('ai_error');
    expect(verdict.info).toMatchObject({ status: 429, isCredit: true, provider: '' });
  });

  it('auth : une redirection de session, ou un statut 0', async () => {
    expect((await run({ type: 'opaqueredirect', status: 0 })).kind).toBe('auth');
  });

  it('unreachable : fetch rejeté, ou aucune réponse', async () => {
    const thrown = await run(async () => {
      throw new Error('Failed to fetch');
    });
    expect(thrown.kind).toBe('unreachable');
    expect(thrown.error.message).toBe('Failed to fetch');
    expect((await run(null)).kind).toBe('unreachable');
  });
});
