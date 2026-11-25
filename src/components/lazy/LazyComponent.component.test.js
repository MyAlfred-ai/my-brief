/**
 * Écran chargé à la demande. Ce qui compte : le chargement part au montage,
 * les props arrivent au composant, et un échec affiche une phrase — avec
 * « Recharger » hors réunion, sans bouton pendant une réunion (recharger
 * couperait l'enregistrement).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { lazyComponent } from '../../utils/lazyComponent.js';
import { isRecordingStore } from '../../stores/recording.js';

const LazyComponent = (await import('./LazyComponent.svelte')).default;
const Probe = (await import('./LazyProbe.test.svelte')).default;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => isRecordingStore.set(false));

describe('LazyComponent', () => {
  it('charge au montage et transmet les props', async () => {
    let loads = 0;
    const lazy = lazyComponent(async () => {
      loads += 1;
      return { default: Probe };
    });
    expect(loads).toBe(0);
    render(LazyComponent, { props: { component: lazy, label: 'Administration' } });
    await settle();
    await tick();
    expect(loads).toBe(1);
    expect(screen.getByText('Sonde : Administration')).toBeTruthy();
  });

  it('échec hors réunion : une phrase et « Recharger »', async () => {
    const lazy = lazyComponent(async () => {
      throw new Error('404');
    });
    render(LazyComponent, { props: { component: lazy } });
    await settle();
    await tick();
    expect(screen.getByRole('alert').textContent).toMatch(/n'a pas pu se charger/);
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeTruthy();
  });

  it('échec pendant une réunion : pas de bouton qui couperait l’enregistrement', async () => {
    isRecordingStore.set(true);
    const lazy = lazyComponent(async () => {
      throw new Error('404');
    });
    render(LazyComponent, { props: { component: lazy } });
    await settle();
    await tick();
    expect(screen.getByRole('alert').textContent).toMatch(/à la fin de la réunion/);
    expect(screen.queryByRole('button')).toBe(null);
  });
});
