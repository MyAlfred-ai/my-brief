/**
 * « Terminer la réunion ? » — trois fins expliquées, une sortie sans effet.
 *
 * Ce qui compte ici : chaque choix relaie SON callback et lui seul ;
 * « Enregistrer sans résumé » n'existe que si la réunion est en base
 * (`canSave`) ; « Annuler », le fond et Échap referment sans rien déclencher.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const EndMeetingSheet = (await import('./EndMeetingSheet.svelte')).default;

function renderSheet(props = {}) {
  const spies = {
    onSummarize: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onCancel: vi.fn(),
  };
  const utils = render(EndMeetingSheet, { props: { canSave: true, ...spies, ...props } });
  return { ...utils, ...spies };
}

describe('EndMeetingSheet', () => {
  it('trois fins nommées, chacune avec ce qu’elle garde, et chacune reliée', async () => {
    const { onSummarize, onSave, onDelete } = renderSheet();

    expect(screen.getByRole('dialog', { name: 'Terminer la réunion ?' })).toBeTruthy();
    expect(
      screen.getByText('L’enregistrement s’arrête et le compte rendu se rédige.'),
    ).toBeTruthy();
    expect(screen.getByText('Rien n’est gardé.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Résumer maintenant/ }));
    expect(onSummarize).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer sans résumé/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /Supprimer la réunion/ }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('sans réunion en base (canSave false) : pas d’« Enregistrer sans résumé »', () => {
    renderSheet({ canSave: false });
    expect(screen.queryByRole('button', { name: /Enregistrer sans résumé/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Résumer maintenant/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Supprimer la réunion/ })).toBeTruthy();
  });

  it('« Annuler », le fond et Échap referment sans rien déclencher', async () => {
    const { container, onCancel, onSummarize, onSave, onDelete } = renderSheet();

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await userEvent.click(container.querySelector('.mes-backdrop'));
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onSummarize).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('le focus entre sur « Résumer maintenant », le geste principal', () => {
    renderSheet();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Résumer maintenant/ }));
  });
});
