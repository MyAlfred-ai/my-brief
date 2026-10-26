import { describe, it, expect, vi } from 'vitest';
import { withRetry, isNetworkError } from '../lib/retry.js';
import { UpstreamError } from '../lib/openai.js';

/** sleep instantané qui journalise les délais demandés. */
function instantSleep() {
  const delays = [];
  return { delays, sleep: async (ms) => void delays.push(ms) };
}

describe('withRetry', () => {
  it('succès immédiat : une seule tentative, aucun délai', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const { delays, sleep } = instantSleep();
    expect(await withRetry(fn, { sleep })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it('panne réseau transitoire : relance puis succès', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue('ok');
    const { sleep } = instantSleep();
    expect(await withRetry(fn, { sleep })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('erreur non relançable : échec immédiat sans seconde tentative', async () => {
    const fatal = new Error('invalid_grant');
    const fn = vi.fn().mockRejectedValue(fatal);
    const { sleep } = instantSleep();
    await expect(withRetry(fn, { sleep })).rejects.toBe(fatal);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('épuise les tentatives puis relance la dernière erreur', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { delays, sleep } = instantSleep();
    await expect(withRetry(fn, { attempts: 3, sleep })).rejects.toThrow('fetch failed');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays).toHaveLength(2); // pas de délai après la dernière tentative
  });

  it('backoff exponentiel plafonné, avec jitter borné [cap/2, cap)', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { delays, sleep } = instantSleep();
    await expect(
      withRetry(fn, { attempts: 4, baseMs: 1000, maxMs: 3000, sleep, random: () => 0 }),
    ).rejects.toThrow();
    // random()=0 → délai = cap/2 exactement : 500, 1000, 1500 (cap 3000/2)
    expect(delays).toEqual([500, 1000, 1500]);
  });

  it('retryOn personnalisé : relance les 5xx amont, pas les 4xx', async () => {
    const retryOn = (err) => err instanceof UpstreamError && err.status >= 500;
    const { sleep } = instantSleep();

    const on500 = vi
      .fn()
      .mockRejectedValueOnce(new UpstreamError(503, 'oops'))
      .mockResolvedValue('ok');
    expect(await withRetry(on500, { retryOn, sleep })).toBe('ok');
    expect(on500).toHaveBeenCalledTimes(2);

    const on402 = vi.fn().mockRejectedValue(new UpstreamError(402, 'billing'));
    await expect(withRetry(on402, { retryOn, sleep })).rejects.toThrow();
    expect(on402).toHaveBeenCalledTimes(1);
  });
});

describe('isNetworkError', () => {
  it('réseau oui, timeout non, métier non', () => {
    expect(isNetworkError(new TypeError('fetch failed'))).toBe(true);
    expect(isNetworkError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(true);
    const timeout = new Error('t');
    timeout.name = 'TimeoutError';
    expect(isNetworkError(timeout)).toBe(false);
    expect(isNetworkError(new Error('métier'))).toBe(false);
  });
});
