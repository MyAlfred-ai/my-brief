/**
 * « Reprendre l'enregistrement » en fin de transcription : un bouton nommé
 * (un écran tactile n'a pas d'infobulle), qui attend pendant la demande du
 * micro au lieu de disparaître.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const ResumeMeetingCta = (await import('./ResumeMeetingCta.svelte')).default;

describe('ResumeMeetingCta', () => {
  it('nommé en toutes lettres, il relaie le geste', async () => {
    const onResume = vi.fn();
    render(ResumeMeetingCta, { props: { onResume } });
    const button = screen.getByRole('button', { name: 'Reprendre l’enregistrement' });
    expect(button.title).toBe('La suite s’ajoutera à la fin de cette transcription');
    await userEvent.click(button);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('un seul bouton : le fantôme qui troue le trait de fin est muet', () => {
    const { container } = render(ResumeMeetingCta);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const ghost = container.querySelector('.rmc-ghost');
    expect(ghost.tagName).toBe('SPAN');
    expect(ghost.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('micro en cours de demande : inactif et occupé, toujours là', () => {
    render(ResumeMeetingCta, { props: { busy: true } });
    const button = screen.getByRole('button', { name: 'Reprendre l’enregistrement' });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});
