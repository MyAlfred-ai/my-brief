/**
 * Alerte « crédit épuisé » en cours de réunion.
 *
 * Ce qui casserait sans ces tests : une réunion qui épuise le crédit sans un
 * mot ; une alerte répétée à chaque seconde du chronomètre ; une alerte qui
 * disparaît seule pendant que personne ne regarde ; une alerte hors réunion
 * (au chargement d'un compte déjà à zéro, où « Démarrer » le dit déjà) ; une
 * réunion suivante qui ne serait plus prévenue.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { render } from '@testing-library/svelte';

const { default: QuotaLiveAlert } = await import('./QuotaLiveAlert.svelte');
const { applyQuota, resetQuota } = await import('../stores/quota.js');
const { liveElapsedStore, isRecordingStore } = await import('../stores/recording.js');
const { toasts } = await import('../stores/toasts.js');
const { currentLanguageStore } = await import('../store.js');

const limited = (usedMinutes) => ({
  unlimited: false,
  limitMinutes: 120,
  usedSeconds: usedMinutes * 60,
  usedMinutes,
  remainingMinutes: 120 - usedMinutes,
  exhausted: usedMinutes >= 119,
  period: {
    start: '2026-09-30T22:00:00.000Z',
    end: '2026-10-31T23:00:00.000Z',
    timeZone: 'Europe/Paris',
  },
  group: null,
});

const warnings = () => get(toasts).filter((t) => t.type === 'warning');

beforeEach(() => {
  resetQuota();
  liveElapsedStore.set(0);
  isRecordingStore.set(false);
  toasts.set([]);
  currentLanguageStore.set('fr');
});

describe('QuotaLiveAlert', () => {
  it('le crédit s’épuise pendant la réunion : une alerte, qui reste, et dit que ça continue', async () => {
    vi.useFakeTimers();
    try {
      render(QuotaLiveAlert);
      applyQuota(limited(100));
      isRecordingStore.set(true);
      liveElapsedStore.set(18 * 60);
      await tick();
      expect(warnings()).toHaveLength(0);

      liveElapsedStore.set(19 * 60 + 1);
      await tick();
      expect(warnings()).toHaveLength(1);
      expect(warnings()[0].message).toContain("L'enregistrement continue");
      expect(warnings()[0].message).toContain('1er novembre');

      // Le chronomètre continue : pas de seconde alerte, et la première ne part pas seule.
      for (let s = 2; s < 120; s++) liveElapsedStore.set(19 * 60 + s);
      await tick();
      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(warnings()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hors réunion, rien : « Démarrer » dit déjà le quota atteint', async () => {
    render(QuotaLiveAlert);
    applyQuota(limited(120));
    await tick();
    expect(warnings()).toHaveLength(0);
  });

  it('sans limite, rien', async () => {
    render(QuotaLiveAlert);
    applyQuota({ ...limited(0), unlimited: true, limitMinutes: null });
    isRecordingStore.set(true);
    liveElapsedStore.set(10 * 60 * 60);
    await tick();
    expect(warnings()).toHaveLength(0);
  });

  it('réarmée à l’arrêt : la réunion suivante, démarrée hors ligne, est prévenue à son tour', async () => {
    render(QuotaLiveAlert);
    applyQuota(limited(100));
    isRecordingStore.set(true);
    liveElapsedStore.set(20 * 60);
    await tick();
    expect(warnings()).toHaveLength(1);

    isRecordingStore.set(false);
    applyQuota(limited(120));
    liveElapsedStore.set(0);
    await tick();
    expect(warnings()).toHaveLength(1);

    isRecordingStore.set(true);
    liveElapsedStore.set(5);
    await tick();
    expect(warnings()).toHaveLength(2);
  });

  it('en anglais', async () => {
    currentLanguageStore.set('en');
    render(QuotaLiveAlert);
    applyQuota(limited(119));
    isRecordingStore.set(true);
    liveElapsedStore.set(1);
    await tick();
    expect(warnings()[0].message).toContain('Recording continues');
    expect(warnings()[0].message).toContain('1 November');
  });
});
