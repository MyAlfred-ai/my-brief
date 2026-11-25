/**
 * Composant chargé à la demande. Ce qui compte : rien ne se charge avant
 * qu'on le demande, un seul chargement même demandé plusieurs fois, et un
 * échec (fichier retiré par un déploiement, réseau) se signale et se retente.
 */
import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { lazyComponent } from './lazyComponent.js';

const Fake = function FakeComponent() {};

describe('lazyComponent', () => {
  it('ne charge rien tant qu’on ne le demande pas', () => {
    const load = vi.fn(async () => ({ default: Fake }));
    const lazy = lazyComponent(load);
    expect(get(lazy)).toBe(null);
    expect(load).not.toHaveBeenCalled();
  });

  it('un seul chargement, puis le composant reste là', async () => {
    const load = vi.fn(async () => ({ default: Fake }));
    const lazy = lazyComponent(load);
    const [a, b] = await Promise.all([lazy.preload(), lazy.preload()]);
    expect(a).toBe(Fake);
    expect(b).toBe(Fake);
    expect(get(lazy)).toBe(Fake);
    await lazy.preload();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('échec : signalé, puis retenté à la demande suivante', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new Error('Failed to fetch dynamically imported module');
      return { default: Fake };
    });
    const lazy = lazyComponent(load);
    expect(await lazy.preload()).toBe(null);
    expect(get(lazy.failed)).toBe(true);
    expect(get(lazy)).toBe(null);
    fail = false;
    expect(await lazy.preload()).toBe(Fake);
    expect(get(lazy.failed)).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
