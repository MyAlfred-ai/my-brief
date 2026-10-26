import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { toasts, showToast, removeToast, notifyApiError } from './toasts.js';

beforeEach(() => {
  vi.useFakeTimers();
  toasts.set([]);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('toasts store', () => {
  it('empile, plafonne à 5 (le plus ancien saute)', () => {
    for (let i = 1; i <= 6; i += 1) showToast(`m${i}`, 'info', 0);
    const list = get(toasts);
    expect(list).toHaveLength(5);
    expect(list[0].message).toBe('m2');
    expect(list[4].message).toBe('m6');
  });

  it('auto-fermeture : exiting après duration, retrait 300 ms plus tard', () => {
    showToast('bye', 'info', 1000);
    expect(get(toasts)).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(get(toasts)[0].exiting).toBe(true);
    vi.advanceTimersByTime(300);
    expect(get(toasts)).toHaveLength(0);
  });

  it('duration 0 = persistant', () => {
    showToast('reste', 'warning', 0);
    vi.advanceTimersByTime(60_000);
    expect(get(toasts)).toHaveLength(1);
  });

  it('removeToast anticipé par id', () => {
    const id = showToast('x', 'info', 0);
    removeToast(id);
    vi.advanceTimersByTime(300);
    expect(get(toasts)).toHaveLength(0);
  });
});

describe('notifyApiError', () => {
  it('succès : aucun toast', () => {
    expect(notifyApiError({ ok: true, status: 200, data: {} }, {})).toBe(false);
    expect(get(toasts)).toHaveLength(0);
  });

  it('slug connu → message traduit, type error', () => {
    notifyApiError(
      { ok: false, status: 0, data: { error: 'network' } },
      { network: 'Connexion impossible', unknown: 'Erreur' },
    );
    const [t] = get(toasts);
    expect(t.message).toBe('Connexion impossible');
    expect(t.type).toBe('error');
  });

  it('slug inconnu → repli `unknown`', () => {
    notifyApiError(
      { ok: false, status: 500, data: { error: 'weird_slug' } },
      { unknown: 'Une erreur est survenue' },
    );
    expect(get(toasts)[0].message).toBe('Une erreur est survenue');
  });
});
