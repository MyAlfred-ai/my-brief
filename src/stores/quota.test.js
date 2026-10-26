/**
 * Store du quota de minutes — ce que l'écran lit, jamais ce qu'il calcule.
 *
 * Ce qui casserait sans ces tests : un état partiel qui rendrait le compteur
 * « illimité » par défaut de champ manquant (le serveur dit `unlimited:
 * false`, l'écran doit le croire) ; une relecture en échec qui effacerait le
 * compteur ; et `quotaExhausted` vrai avant que le serveur ait parlé — ce qui
 * retiendrait « Démarrer » au chargement.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

const fetchQuota = vi.fn();
vi.mock('../services/quotaApi.js', () => ({ fetchQuota: (...a) => fetchQuota(...a) }));

const { quota, quotaExhausted, applyQuota, refreshQuota, confirmQuotaExhausted, resetQuota } =
  await import('./quota.js');

const LIMITED = {
  unlimited: false,
  limitMinutes: 120,
  usedSeconds: 45 * 60,
  usedMinutes: 45,
  remainingMinutes: 75,
  exhausted: false,
  // Septembre à l'heure de Paris : minuit le 1er, c'est 22 h UTC la veille (heure d'été).
  period: {
    start: '2026-08-31T22:00:00.000Z',
    end: '2026-09-30T22:00:00.000Z',
    timeZone: 'Europe/Paris',
  },
  group: { id: 'g-sales', name: 'Commerciaux', color: 'blue' },
};
const SPENT = {
  ...LIMITED,
  usedSeconds: 120 * 60,
  usedMinutes: 120,
  remainingMinutes: 0,
  exhausted: true,
};
const OCTOBER = {
  ...LIMITED,
  usedSeconds: 0,
  usedMinutes: 0,
  remainingMinutes: 120,
  period: {
    start: '2026-09-30T22:00:00.000Z',
    end: '2026-10-31T23:00:00.000Z',
    timeZone: 'Europe/Paris',
  },
};
const MINUTE = 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  resetQuota();
});

describe('applyQuota', () => {
  it('prend l état du serveur tel quel, et le marque chargé', () => {
    applyQuota(LIMITED);
    expect(get(quota)).toMatchObject({ ...LIMITED, loaded: true });
    expect(get(quotaExhausted)).toBe(false);
  });

  it('ignore une charge illisible et garde l état courant', () => {
    applyQuota(LIMITED);
    applyQuota(null);
    applyQuota('oups');
    expect(get(quota).limitMinutes).toBe(120);
  });

  it('un état sans limite ne retient jamais « Démarrer »', () => {
    applyQuota({
      unlimited: true,
      limitMinutes: null,
      exhausted: false,
      period: null,
      group: null,
    });
    expect(get(quota)).toMatchObject({ loaded: true, unlimited: true, exhausted: false });
    expect(get(quotaExhausted)).toBe(false);
  });

  it('quota atteint : dérivé vrai seulement une fois le serveur entendu', () => {
    expect(get(quotaExhausted)).toBe(false);
    applyQuota({ ...LIMITED, usedSeconds: 120 * 60, remainingMinutes: 0, exhausted: true });
    expect(get(quotaExhausted)).toBe(true);
  });
});

describe('refreshQuota', () => {
  it('relit et applique l état', async () => {
    fetchQuota.mockResolvedValue({ ok: true, status: 200, data: LIMITED });
    expect(await refreshQuota()).toEqual({ ok: true });
    expect(get(quota).remainingMinutes).toBe(75);
  });

  it('en échec, rend le slug et garde le compteur affiché', async () => {
    applyQuota(LIMITED);
    fetchQuota.mockResolvedValue({ ok: false, status: 0, data: { error: 'network' } });
    expect(await refreshQuota()).toEqual({ ok: false, error: 'network' });
    expect(get(quota)).toMatchObject({ loaded: true, remainingMinutes: 75 });
  });
});

describe('resetQuota', () => {
  it('revient à l état initial, non chargé', () => {
    applyQuota(LIMITED);
    resetQuota();
    expect(get(quota)).toMatchObject({ loaded: false, unlimited: true, limitMinutes: null });
  });
});

describe('le renouvellement du 1er du mois, onglet resté ouvert', () => {
  const renewed = { ok: true, status: 200, data: OCTOBER };

  beforeEach(() => {
    fetchQuota.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T20:00:00.000Z')); // 22 h à Paris
  });
  afterEach(() => {
    resetQuota();
    vi.useRealTimers();
  });

  it('se relit passé minuit à Paris : « Démarrer » n est plus retenu', async () => {
    fetchQuota.mockResolvedValue(renewed);
    applyQuota(SPENT);
    expect(get(quotaExhausted)).toBe(true);
    await vi.advanceTimersByTimeAsync(2 * 60 * MINUTE); // minuit à Paris, pile
    expect(fetchQuota).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(fetchQuota).toHaveBeenCalledTimes(1);
    expect(get(quotaExhausted)).toBe(false);
    expect(get(quota)).toMatchObject({ remainingMinutes: 120, period: OCTOBER.period });
    // Réarmé sur le 1er novembre : plus rien à relire d'ici là.
    await vi.advanceTimersByTimeAsync(24 * 60 * MINUTE);
    expect(fetchQuota).toHaveBeenCalledTimes(1);
  });

  it('au réveil d un poste mis en veille avant minuit, se relit dans la minute', async () => {
    fetchQuota.mockResolvedValue(renewed);
    applyQuota(SPENT);
    // La veille : l'horloge saute, aucun minuteur n'a tourné pendant ce temps.
    vi.setSystemTime(new Date('2026-10-01T05:30:00.000Z'));
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(fetchQuota).toHaveBeenCalledTimes(1);
    expect(get(quotaExhausted)).toBe(false);
  });

  it('serveur injoignable : réessaie chaque minute, sans empiler les appels', async () => {
    let answer;
    fetchQuota
      .mockResolvedValueOnce({ ok: false, status: 0, data: { error: 'network' } })
      .mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    applyQuota(SPENT);
    vi.setSystemTime(new Date('2026-09-30T22:01:00.000Z'));
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(fetchQuota).toHaveBeenCalledTimes(1);
    expect(get(quotaExhausted)).toBe(true); // l'état affiché reste en échec
    await vi.advanceTimersByTimeAsync(MINUTE); // second essai, sans réponse
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(fetchQuota).toHaveBeenCalledTimes(2);
    answer(renewed);
    await vi.advanceTimersByTimeAsync(0);
    expect(get(quotaExhausted)).toBe(false);
  });

  it('horloge du poste en avance sur le serveur : pas de relecture en boucle', async () => {
    // Le serveur, encore en septembre, rend le même mois.
    fetchQuota.mockResolvedValue({ ok: true, status: 200, data: SPENT });
    applyQuota(SPENT);
    vi.setSystemTime(new Date('2026-09-30T22:05:00.000Z'));
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    expect(fetchQuota).toHaveBeenCalledTimes(1);
  });

  it('rien à relire sans limite, ni après la déconnexion', async () => {
    applyQuota({ ...SPENT, unlimited: true, limitMinutes: null, exhausted: false });
    await vi.advanceTimersByTimeAsync(6 * 60 * MINUTE);
    vi.setSystemTime(new Date('2026-09-30T20:00:00.000Z'));
    applyQuota(SPENT);
    resetQuota();
    await vi.advanceTimersByTimeAsync(6 * 60 * MINUTE);
    expect(fetchQuota).not.toHaveBeenCalled();
  });
});

describe('confirmQuotaExhausted — « Démarrer » relit le serveur avant de refuser', () => {
  const unreachable = { ok: false, status: 0, data: { error: 'network' } };

  beforeEach(() => {
    fetchQuota.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T10:00:00.000Z'));
    applyQuota(SPENT);
  });
  afterEach(() => {
    resetQuota();
    vi.useRealTimers();
  });

  it('quota relevé par l administration : « Démarrer » passe, sans recharger la page', async () => {
    const raised = { ...SPENT, limitMinutes: 180, remainingMinutes: 60, exhausted: false };
    fetchQuota.mockResolvedValue({ ok: true, status: 200, data: raised });
    expect(await confirmQuotaExhausted()).toBe(false);
    expect(get(quota)).toMatchObject({ limitMinutes: 180, remainingMinutes: 60 });
    expect(get(quotaExhausted)).toBe(false);
  });

  it('toujours atteint selon le serveur : le refus tient', async () => {
    fetchQuota.mockResolvedValue({ ok: true, status: 200, data: SPENT });
    expect(await confirmQuotaExhausted()).toBe(true);
    expect(fetchQuota).toHaveBeenCalledTimes(1);
  });

  it('serveur injoignable : l état affiché fait foi', async () => {
    fetchQuota.mockResolvedValue(unreachable);
    expect(await confirmQuotaExhausted()).toBe(true);
  });

  it('serveur injoignable, état d un mois écoulé : ne retient plus, /tempkey tranchera', async () => {
    fetchQuota.mockResolvedValue(unreachable);
    vi.setSystemTime(new Date('2026-09-30T22:00:00.000Z')); // 1er octobre, 0 h à Paris
    expect(await confirmQuotaExhausted()).toBe(false);
  });
});
