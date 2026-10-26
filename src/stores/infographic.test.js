// @vitest-environment jsdom
/**
 * Infographie — machine d'état du store.
 *
 * Les invariants qui comptent :
 *   - l'historique AMORCE (pending → animation, ready → chargement de l'image)
 *     mais un instantané d'historique DATÉ ne rétrograde jamais l'état frais
 *     obtenu de GET /infographic — sinon chaque rechargement de la liste
 *     rejouerait l'animation sur une image déjà affichée ;
 *   - une régénération cochée (nouvel `updatedAt` serveur) relance bien le
 *     cycle, elle ;
 *   - le polling s'arrête sur ready/error/none et à son plafond — jamais de
 *     minuterie orpheline après changement de réunion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

const apiGet = vi.fn(async () => ({ ok: true, status: 200, data: { status: 'none' } }));
const apiPost = vi.fn(async () => ({ ok: true, status: 200, data: { ok: true } }));
vi.mock('../services/apiClient.js', () => ({
  get: (...args) => apiGet(...args),
  post: (...args) => apiPost(...args),
}));

const {
  infographicView,
  syncInfographic,
  resetInfographic,
  regenerateInfographic,
  deleteInfographic,
} = await import('./infographic.js');

// Sous fake timers, un vrai setTimeout ne tirerait jamais : on avance l'horloge factice.
const flush = () => vi.advanceTimersByTimeAsync(0);

const item = (meetingId, infographic) => ({ meetingId, ...(infographic ? { infographic } : {}) });

beforeEach(() => {
  vi.useFakeTimers();
  apiGet.mockClear();
  apiGet.mockImplementation(async () => ({ ok: true, status: 200, data: { status: 'none' } }));
  apiPost.mockClear();
  apiPost.mockImplementation(async () => ({ ok: true, status: 200, data: { ok: true } }));
  resetInfographic();
});

afterEach(() => {
  resetInfographic();
  vi.useRealTimers();
});

describe('amorçage depuis l’historique', () => {
  it('réunion sans infographie → rien, et aucun appel réseau', () => {
    syncInfographic('m-1', [item('m-1')]);
    expect(get(infographicView)).toMatchObject({ meetingId: 'm-1', status: 'none' });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("réunion prête → charge l'image une fois", async () => {
    apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: 'ready', dataUrl: 'data:image/png;base64,AAA', updatedAt: 't1' },
    });
    syncInfographic('m-1', [item('m-1', { status: 'ready', updatedAt: 't1' })]);
    expect(get(infographicView).status).toBe('loading');
    await flush();
    expect(get(infographicView)).toMatchObject({
      meetingId: 'm-1',
      status: 'ready',
      dataUrl: 'data:image/png;base64,AAA',
    });
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0][0]).toBe('/infographic?meetingId=m-1');
  });

  it('aucune réunion affichée → purge', () => {
    syncInfographic('m-1', [item('m-1', { status: 'error', updatedAt: 't1' })]);
    expect(get(infographicView).status).toBe('error');
    syncInfographic(null, []);
    expect(get(infographicView)).toMatchObject({ meetingId: null, status: 'none' });
  });
});

describe('génération en cours', () => {
  it('pending → polling jusqu’au ready, puis arrêt', async () => {
    syncInfographic('m-1', [item('m-1', { status: 'pending', updatedAt: 't1' })]);
    expect(get(infographicView).status).toBe('pending');

    // Premier tour : toujours en cours.
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: { status: 'pending' } });
    await vi.advanceTimersByTimeAsync(4000);
    expect(get(infographicView).status).toBe('pending');

    // Deuxième tour : l'image est là.
    apiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: 'ready', dataUrl: 'data:image/png;base64,BBB', updatedAt: 't2' },
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(get(infographicView)).toMatchObject({
      status: 'ready',
      dataUrl: 'data:image/png;base64,BBB',
    });

    // Plus aucune minuterie : le temps peut filer, rien ne repart.
    const calls = apiGet.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(apiGet.mock.calls.length).toBe(calls);
  });

  it('pending → error : le poll s’arrête et l’état le dit', async () => {
    syncInfographic('m-1', [item('m-1', { status: 'pending', updatedAt: 't1' })]);
    apiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: 'error', updatedAt: 't2' },
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(get(infographicView).status).toBe('error');
  });

  it('changement de réunion en plein poll : la réponse tardive est ignorée', async () => {
    syncInfographic('m-1', [item('m-1', { status: 'pending', updatedAt: 't1' })]);
    syncInfographic('m-2', [item('m-2')]);
    await vi.advanceTimersByTimeAsync(20000);
    expect(get(infographicView)).toMatchObject({ meetingId: 'm-2', status: 'none' });
  });
});

describe('préséance de l’état frais sur l’instantané d’historique', () => {
  it('un rechargement d’historique encore à `pending` ne rétrograde pas une image affichée', async () => {
    syncInfographic('m-1', [item('m-1', { status: 'pending', updatedAt: 't1' })]);
    apiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: 'ready', dataUrl: 'data:image/png;base64,CCC', updatedAt: 't1' },
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(get(infographicView).status).toBe('ready');

    // L'historique rejoue son instantané daté (même updatedAt) : rien ne bouge.
    syncInfographic('m-1', [item('m-1', { status: 'pending', updatedAt: 't1' })]);
    expect(get(infographicView)).toMatchObject({
      status: 'ready',
      dataUrl: 'data:image/png;base64,CCC',
    });
  });

  it('régénérer depuis la miniature : animation immédiate, et un historique PÉRIMÉ ne la tue pas', async () => {
    // Image affichée (cycle t1)…
    apiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: 'ready', dataUrl: 'data:image/png;base64,EEE', updatedAt: 't1' },
    });
    syncInfographic('m-1', [item('m-1', { status: 'ready', updatedAt: 't1' })]);
    await flush();
    expect(get(infographicView).status).toBe('ready');

    // …le bouton relance : le serveur répond un nouveau cycle t5.
    apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: 'pending', updatedAt: 't5' },
    });
    const res = await regenerateInfographic('m-1', 'en');
    expect(res.ok).toBe(true);
    expect(apiPost.mock.calls[0]).toEqual([
      '/infographic/regenerate',
      // La langue de l'interface au moment du clic écrit les textes de l'image.
      { meetingId: 'm-1', language: 'en' },
    ]);
    expect(get(infographicView)).toMatchObject({ status: 'pending', stamp: 't5' });

    // Un rechargement d'historique encore au cycle t1 (ready) arriverait
    // maintenant : il ne doit PAS rétrograder le pending du cycle t5.
    syncInfographic('m-1', [item('m-1', { status: 'ready', updatedAt: 't1' })]);
    expect(get(infographicView).status).toBe('pending');
  });

  it('supprimer : état none conservé, un instantané d’historique daté ne ressuscite pas l’image', async () => {
    apiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: 'ready', dataUrl: 'data:image/png;base64,FFF', updatedAt: 't1' },
    });
    syncInfographic('m-1', [item('m-1', { status: 'ready', updatedAt: 't1' })]);
    await flush();

    const res = await deleteInfographic('m-1');
    expect(res.ok).toBe(true);
    expect(apiPost.mock.calls[0]).toEqual(['/infographic/delete', { meetingId: 'm-1' }]);
    expect(get(infographicView)).toMatchObject({ status: 'none', dataUrl: '' });

    // Historique d'avant la suppression (même stamp t1) : ignoré.
    syncInfographic('m-1', [item('m-1', { status: 'ready', updatedAt: 't1' })]);
    expect(get(infographicView).status).toBe('none');
    // Historique d'APRÈS la suppression (champ retiré, stamp '') : ignoré aussi.
    syncInfographic('m-1', [item('m-1')]);
    expect(get(infographicView).status).toBe('none');
  });

  it('une RÉGÉNÉRATION cochée (nouvel updatedAt) relance bien le cycle', async () => {
    apiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: 'ready', dataUrl: 'data:image/png;base64,DDD', updatedAt: 't1' },
    });
    syncInfographic('m-1', [item('m-1', { status: 'ready', updatedAt: 't1' })]);
    await flush();
    expect(get(infographicView).status).toBe('ready');

    syncInfographic('m-1', [item('m-1', { status: 'pending', updatedAt: 't9' })]);
    expect(get(infographicView).status).toBe('pending');
  });
});
