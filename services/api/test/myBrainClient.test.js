/**
 * Client de l'API myBrain (lib/myBrain/client.js), contre un fetch simulé.
 *
 * Garanties tenues ici :
 *   - la clé part dans un en-tête, jamais ailleurs, et n'apparaît dans aucune
 *     erreur ;
 *   - une redirection n'est pas suivie (elle emporterait la clé ailleurs) ;
 *   - le code d'erreur dit si une relance est SÛRE : oui après une panne réseau,
 *     un 429 ou un 5xx ; jamais après un délai dépassé, où le dépôt a pu
 *     arriver.
 */
import { describe, it, expect } from 'vitest';
import { createMyBrainClient, MyBrainError } from '../lib/myBrain/client.js';

const URL_BASE = 'https://cerveau.example.test';
const API_KEY = `mbk_${'a'.repeat(40)}`;

function jsonResponse(status, body, headers = {}) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** fetch scripté : journal des appels, une réponse (ou une panne) par appel. */
function fakeFetch(respond) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  impl.calls = calls;
  return impl;
}

async function failureOf(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('aucune erreur levée');
}

describe('client myBrain — les appels', () => {
  it('whoami : GET /api/v1, clé en Bearer, redirections non suivies', async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse(200, {
        application: 'myBrief',
        droits: ['lire', 'nourrir'],
        api: `${URL_BASE}/api/v1`,
      }),
    );
    const client = createMyBrainClient({ fetchImpl });
    const who = await client.whoami({ url: URL_BASE, apiKey: API_KEY });

    expect(who).toEqual({
      application: 'myBrief',
      droits: ['lire', 'nourrir'],
      api: `${URL_BASE}/api/v1`,
    });
    const [{ url, init }] = fetchImpl.calls;
    expect(url).toBe(`${URL_BASE}/api/v1`);
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('manual');
    expect(init.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(url).not.toContain(API_KEY);
  });

  it('feed : POST /api/v1/nourrir, le dépôt en JSON', async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse(202, {
        job: 'job-1',
        statut: 'en-attente',
        pour: 'alex@client.fr',
        avertissements: [],
      }),
    );
    const client = createMyBrainClient({ fetchImpl });
    const deposit = {
      titre: 'Réunion',
      texte: 'Du texte assez long pour myBrain.',
      pour: 'alex@client.fr',
    };
    const accepted = await client.feed({ url: URL_BASE, apiKey: API_KEY, deposit });

    expect(accepted).toEqual({ job: 'job-1', pour: 'alex@client.fr', avertissements: [] });
    const [{ url, init }] = fetchImpl.calls;
    expect(url).toBe(`${URL_BASE}/api/v1/nourrir`);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(deposit);
  });
});

describe('client myBrain — les refus', () => {
  // [statut, slug, relance sûre, peut-être arrivé]
  const cases = [
    [400, 'mybrain_rejected', false, false],
    [401, 'mybrain_key_rejected', false, false],
    [403, 'mybrain_right_missing', false, false],
    [404, 'mybrain_not_found', false, false],
    [409, 'mybrain_unavailable', false, false],
    [413, 'mybrain_too_long', false, false],
    [422, 'mybrain_rejected', false, false],
    // Compté par myBrain AVANT de créer le job : rien n'est arrivé.
    [429, 'mybrain_rate_limited', true, false],
    // myBrain lui-même, après avoir peut-être créé le job.
    [500, 'mybrain_error', false, true],
    [502, 'mybrain_error', true, false],
    [503, 'mybrain_error', true, false],
  ];

  it.each(cases)(
    'HTTP %i → %s (relance sûre : %s, peut-être arrivé : %s)',
    async (status, code, retryable, ambiguous) => {
      const client = createMyBrainClient({
        fetchImpl: fakeFetch(() => jsonResponse(status, { erreur: 'le message de myBrain' })),
      });
      const err = await failureOf(client.whoami({ url: URL_BASE, apiKey: API_KEY }));
      expect(err).toBeInstanceOf(MyBrainError);
      expect(err.code).toBe(code);
      expect(err.status).toBe(status);
      expect(err.retryable).toBe(retryable);
      expect(err.ambiguous).toBe(ambiguous);
      expect(err.upstreamMessage).toBe('le message de myBrain');
    },
  );

  it("une redirection n'est pas suivie : l'écran reçoit l'adresse finale", async () => {
    const client = createMyBrainClient({
      fetchImpl: fakeFetch(
        () => new Response(null, { status: 301, headers: { location: `${URL_BASE}/api/v1` } }),
      ),
    });
    const err = await failureOf(
      client.whoami({ url: 'http://cerveau.example.test', apiKey: API_KEY }),
    );
    expect(err.code).toBe('mybrain_redirected');
    expect(err.details()).toMatchObject({ upstreamStatus: 301, location: `${URL_BASE}/api/v1` });
  });

  /** Une panne de fetch telle que la rend undici : TypeError, la vraie cause dessous. */
  const fetchFailed = (code) => Object.assign(new TypeError('fetch failed'), { cause: { code } });

  it.each([
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'CERT_HAS_EXPIRED',
  ])('connexion jamais établie (%s) : injoignable, relance sûre', async (code) => {
    const client = createMyBrainClient({
      fetchImpl: fakeFetch(() => {
        throw fetchFailed(code);
      }),
    });
    const err = await failureOf(client.feed({ url: URL_BASE, apiKey: API_KEY, deposit: {} }));
    expect(err.code).toBe('mybrain_unreachable');
    expect(err.retryable).toBe(true);
    expect(err.ambiguous).toBe(false);
  });

  it.each(['ECONNRESET', 'UND_ERR_SOCKET', undefined])(
    'connexion coupée en route (%s) : AMBIGU — le job a pu être créé',
    async (code) => {
      const client = createMyBrainClient({
        fetchImpl: fakeFetch(() => {
          throw code ? fetchFailed(code) : new TypeError('fetch failed');
        }),
      });
      const err = await failureOf(client.feed({ url: URL_BASE, apiKey: API_KEY, deposit: {} }));
      expect(err.code).toBe('mybrain_connection_lost');
      expect(err.retryable).toBe(false);
      expect(err.ambiguous).toBe(true);
    },
  );

  it('délai dépassé : AMBIGU, jamais relancé automatiquement', async () => {
    const client = createMyBrainClient({
      fetchImpl: fakeFetch(() => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }),
    });
    const err = await failureOf(client.feed({ url: URL_BASE, apiKey: API_KEY, deposit: {} }));
    expect(err.code).toBe('mybrain_timeout');
    expect(err.retryable).toBe(false);
    expect(err.ambiguous).toBe(true);
  });

  it('un dépôt accepté au corps illisible reste ACCEPTÉ : ne pas le redéposer', async () => {
    const client = createMyBrainClient({
      fetchImpl: fakeFetch(() => new Response('{"job": "tronq', { status: 202 })),
    });
    const accepted = await client.feed({ url: URL_BASE, apiKey: API_KEY, deposit: {} });
    expect(accepted).toEqual({ job: '', pour: undefined, avertissements: [] });
  });

  it("une page qui n'est pas du JSON n'est pas un myBrain", async () => {
    const client = createMyBrainClient({
      fetchImpl: fakeFetch(() => new Response('<html>portail</html>', { status: 200 })),
    });
    const err = await failureOf(client.whoami({ url: URL_BASE, apiKey: API_KEY }));
    expect(err.code).toBe('mybrain_invalid_response');
  });

  it("la clé n'apparaît dans aucune erreur", async () => {
    const client = createMyBrainClient({
      fetchImpl: fakeFetch(() => jsonResponse(401, { erreur: 'clé invalide' })),
    });
    const err = await failureOf(client.whoami({ url: URL_BASE, apiKey: API_KEY }));
    expect(JSON.stringify({ ...err, message: err.message, details: err.details() })).not.toContain(
      API_KEY,
    );
  });
});
