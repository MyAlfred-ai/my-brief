/**
 * Avatar cerclé du crédit de temps (capsule de compte, barre d'app mobile).
 *
 * Ce qui casserait sans ces tests : un anneau montré sans quota ; un anneau
 * qui montre le consommé au lieu du reste ; un anneau figé pendant qu'on
 * enregistre ; une couleur qui ne suit plus ce qui reste ; un avatar qui
 * change de taille à l'arrivée du quota.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { tick } from 'svelte';
import { render } from '@testing-library/svelte';

const { default: CreditAvatar } = await import('./CreditAvatar.svelte');
const { applyQuota, resetQuota } = await import('../../stores/quota.js');
const { liveElapsedStore } = await import('../../stores/recording.js');

const limited = (usedMinutes) => ({
  unlimited: false,
  limitMinutes: 120,
  usedSeconds: usedMinutes * 60,
  usedMinutes,
  remainingMinutes: 120 - usedMinutes,
  exhausted: usedMinutes >= 120,
  period: { start: '2026-09-01T00:00:00.000Z', end: '2026-10-01T00:00:00.000Z' },
  group: null,
});

const circumference = (size) => 2 * Math.PI * ((size + 8 - 2.5) / 2);
const offset = () => Number.parseFloat(document.querySelector('.cav-fill').style.strokeDashoffset);
const avatar = () => document.querySelector('.cav');

beforeEach(() => {
  resetQuota();
  liveElapsedStore.set(0);
});

describe('CreditAvatar', () => {
  it('sans quota : les initiales, sans anneau, dans une boîte de la même taille', async () => {
    render(CreditAvatar, { props: { initials: 'DL', size: 32 } });
    expect(document.querySelector('.cav-ring')).toBeNull();
    expect(document.querySelector('.ua-disc').textContent.trim()).toBe('DL');
    expect(avatar().style.getPropertyValue('--cav-box')).toBe('40px');

    applyQuota(limited(45));
    await tick();
    expect(document.querySelector('.cav-ring')).toBeTruthy();
    expect(avatar().style.getPropertyValue('--cav-box')).toBe('40px');
  });

  it('l’anneau montre ce qui RESTE, et descend pendant la réunion', async () => {
    applyQuota(limited(45));
    render(CreditAvatar, { props: { initials: 'DL', size: 32 } });
    await tick();
    // 75 min restantes sur 120 : 37,5 % de l'anneau est vide.
    expect(offset()).toBeCloseTo(circumference(32) * 0.375, 3);

    liveElapsedStore.set(15 * 60);
    await tick();
    expect(offset()).toBeCloseTo(circumference(32) * 0.5, 3);
  });

  it('vert, ambre sous la moitié, orange sous un cinquième, rouge épuisé', async () => {
    applyQuota(limited(45));
    render(CreditAvatar, { props: { initials: 'DL' } });
    await tick();
    expect(avatar().className).toContain('cav-high');

    applyQuota(limited(70));
    await tick();
    expect(avatar().className).toContain('cav-mid');

    applyQuota(limited(100));
    await tick();
    expect(avatar().className).toContain('cav-low');

    applyQuota(limited(120));
    await tick();
    expect(avatar().className).toContain('cav-out');
  });
});
