/**
 * Barre de réunion du téléphone — quatre commandes nommées.
 *
 * Ce qui compte ici : chaque commande porte son NOM (un téléphone n'a pas
 * d'infobulle), la troisième place bascule « Pause » ⇄ « Reprendre » avec
 * l'état, « Terminer » est toujours là, et en pause la ligne d'état dit que
 * la réunion n'est PAS terminée — c'est le contresens que la barre lève.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const MobileMeetingBar = (await import('./MobileMeetingBar.svelte')).default;
const { aiHelp } = await import('../stores/aiHelp.js');

describe('MobileMeetingBar', () => {
  it('en enregistrement : Notes, Actions, Pause et Terminer, chacun nommé et relié', async () => {
    const onNotes = vi.fn();
    const onActions = vi.fn();
    const onPause = vi.fn();
    const onEnd = vi.fn();
    render(MobileMeetingBar, { props: { onNotes, onActions, onPause, onEnd } });

    const names = screen.getAllByRole('button').map((b) => b.textContent.trim());
    expect(names).toEqual(['Notes', 'Actions', 'Pause', 'Terminer']);
    expect(screen.queryByRole('button', { name: 'Reprendre' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(onNotes).toHaveBeenCalledTimes(1);
    expect(onActions).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('en pause : « Reprendre » prend la place de « Pause », et l’état dit que ce n’est pas fini', async () => {
    const onResume = vi.fn();
    const onPause = vi.fn();
    render(MobileMeetingBar, { props: { isPaused: true, onResume, onPause } });

    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('n’est pas terminée');
    // « Terminer » reste : la sortie ne dépend pas de l'état.
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Reprendre' }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onPause).not.toHaveBeenCalled();
  });

  it('le compteur d’actions n’apparaît qu’à partir d’une action ; le point des notes, qu’avec un brouillon', async () => {
    const { container, rerender } = render(MobileMeetingBar, {
      props: { actionsCount: 0, hasNotes: false },
    });
    expect(container.querySelector('.mmb-count')).toBeNull();
    expect(container.querySelector('.mmb-dot')).toBeNull();

    await rerender({ actionsCount: 3, hasNotes: true });
    expect(container.querySelector('.mmb-count').textContent).toBe('3');
    expect(container.querySelector('.mmb-dot')).toBeTruthy();
  });

  it('avec l’Aide IA : une cinquième commande, qui porte le MOT D’APPEL tant qu’il déclenche quelque chose', async () => {
    const ALL = { project: true, qa: true, agenda: true, ideas: true };
    const on = { available: true, enabled: true, allowed: ALL, domains: ALL, wakeWord: 'Alfred' };
    aiHelp.update((s) => ({ ...s, ...on }));
    const { container } = render(MobileMeetingBar);
    const label = () => container.querySelector('.mmb-label-wake').textContent.trim();

    // Le mot d'appel à l'écran, « Aide IA » et le mode d'emploi pour le lecteur d'écran.
    expect(label()).toBe('« Alfred »');
    expect(
      screen.getByRole('button', {
        name: 'Aide IA. Pour lui parler, commencez votre phrase par « Alfred »',
      }),
    ).toBeTruthy();

    // Questions coupées : il déclenche encore les gestes — le mot d'appel reste.
    aiHelp.update((s) => ({ ...s, domains: { ...ALL, qa: false } }));
    await Promise.resolve();
    expect(label()).toBe('« Alfred »');
    // Aide IA éteinte : il ne déclenche rien — « Aide IA ».
    aiHelp.update((s) => ({ ...s, domains: ALL, enabled: false }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Aide IA' })).toBeTruthy());

    aiHelp.update((s) => ({ ...s, available: false, enabled: false }));
  });

  it('sans analyser, l’onde ondule quand même (barres CSS) — MyBrief écoute', () => {
    const { container } = render(MobileMeetingBar, { props: { analyser: null } });
    expect(container.querySelectorAll('.wave-bar-css').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'Enregistrement en cours' })).toBeTruthy();
  });
});
