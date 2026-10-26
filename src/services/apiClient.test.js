/**
 * Contrat du client HTTP unique — les trois chemins d'erreur que les 25 fetch
 * bruts géraient chacun à sa façon (ou pas du tout) :
 * réseau coupé, redirection OIDC opaque, corps non-JSON.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { get, post, upload, raw } from './apiClient.js';
import { registerAuthTokenProvider } from '../utils/httpErrorHandler.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  registerAuthTokenProvider(null);
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    type: 'basic',
    json: async () => body,
  };
}

describe('apiClient', () => {
  it('GET 200 JSON → {ok:true, status, data}', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { hello: 'world' }));
    expect(await get('/ping')).toEqual({ ok: true, status: 200, data: { hello: 'world' } });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(/\/ping$/);
    expect(init.credentials).toBe('include');
    expect(init.redirect).toBe('manual');
  });

  it('POST sérialise le corps et pose le content-type', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    await post('/x', { a: 1 });
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers.get('content-type')).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });

  it('marque chaque appel comme XHR — sans ça, le plugin OIDC redirige', async () => {
    // Une redirection au lieu d'un 401 fait réécrire le cookie d'état par le
    // plugin : deux appels concurrents sur session expirée = « Invalid state
    // parameter » à l'arrivée. L'en-tête est ce qui l'évite.
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await get('/init');
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
  });

  it("attache le jeton mobile quand l'app native en fournit un", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    registerAuthTokenProvider(() => 'jeton-natif');
    await get('/init');
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.get('Authorization')).toBe('Bearer jeton-natif');
  });

  it("n'invente pas d'Authorization sur le web", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await get('/init');
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.get('Authorization')).toBeNull();
  });

  it('raw() rend la réponse telle quelle (inspection du corps verbatim)', async () => {
    const response = jsonResponse(402, { error: 'insufficient_quota' });
    globalThis.fetch = vi.fn().mockResolvedValue(response);
    const res = await raw('/resume', { method: 'POST', body: { a: 1 } });
    expect(res).toBe(response);
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.headers.get('content-type')).toBe('application/json');
    expect(init.redirect).toBe('manual');
  });

  it('raw() rend null sur panne réseau plutôt que de lever', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(await raw('/resume', { method: 'POST', body: {} })).toBeNull();
  });

  it('panne réseau → {ok:false, status:0, error:network}', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(await get('/x')).toEqual({ ok: false, status: 0, data: { error: 'network' } });
  });

  it('redirection OIDC opaque → error:auth_redirect, JAMAIS suivie ni parsée', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 0,
      type: 'opaqueredirect',
      json: async () => {
        throw new Error('ne doit pas être appelé');
      },
    });
    expect(await get('/user-templates')).toEqual({
      ok: false,
      status: 0,
      data: { error: 'auth_redirect' },
    });
  });

  it('corps non-JSON (page HTML) → data {} sans exception', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      type: 'basic',
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    expect(await get('/x')).toEqual({ ok: false, status: 502, data: {} });
  });

  it('204 → data {} sans tenter de parser', async () => {
    const json = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, type: 'basic', json });
    expect(await get('/x')).toEqual({ ok: true, status: 204, data: {} });
    expect(json).not.toHaveBeenCalled();
  });

  it('upload : multipart sans content-type manuel (boundary navigateur)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { text: 'ok' }));
    const form = { fake: 'formdata' };
    await upload('/transcribe', form);
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.body).toBe(form);
    // Pas de content-type manuel : le navigateur pose le boundary lui-même.
    expect(init.headers.get('content-type')).toBeNull();
    expect(init.credentials).toBe('include');
  });
});
