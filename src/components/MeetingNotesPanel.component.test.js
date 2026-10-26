/**
 * Panneau « Notes de réunion ».
 *
 * Ce qui compte ici : la saisie remonte au parent (bind), le brouillon part au
 * blur — même geste que les champs des cartes d'action —, et le bouton ne
 * redimensionne rien lui-même : il remonte le toggle, la grille .side-col
 * (App.svelte) fait la hauteur.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const MeetingNotesPanel = (await import('./MeetingNotesPanel.svelte')).default;

const uiText = {
  notes: {
    title: 'Notes de réunion',
    placeholder: 'Vos notes…',
    expandPanel: 'Agrandir les notes',
    shrinkPanel: 'Réduire les notes',
  },
};

describe('MeetingNotesPanel', () => {
  it('affiche le titre, la zone de saisie et la valeur initiale', () => {
    render(MeetingNotesPanel, { props: { uiText, notes: 'M. Globex — sigle SDIS' } });

    expect(screen.getByText('Notes de réunion')).toBeTruthy();
    expect(screen.getByPlaceholderText('Vos notes…').value).toBe('M. Globex — sigle SDIS');
  });

  it('sauve le brouillon au blur, pas à chaque frappe', async () => {
    const onSave = vi.fn();
    render(MeetingNotesPanel, { props: { uiText, notes: '', onSave } });

    const area = screen.getByPlaceholderText('Vos notes…');
    await userEvent.type(area, 'point clé');
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.tab();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('chaque frappe remonte par onInput — l’écriture en base est différée par l’appelant', async () => {
    // Séparé d'onSave : le blur relance aussi la relecture de la transcription,
    // qui n'a rien à faire à chaque touche.
    const onInput = vi.fn();
    const onSave = vi.fn();
    render(MeetingNotesPanel, { props: { uiText, notes: '', onInput, onSave } });

    await userEvent.type(screen.getByPlaceholderText('Vos notes…'), 'SDIS');
    expect(onInput).toHaveBeenCalledTimes(4);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('remonte agrandir/réduire et reflète l’état sur le bouton', async () => {
    const onToggleExpanded = vi.fn();
    const { rerender, container } = render(MeetingNotesPanel, {
      props: { uiText, notes: '', expanded: false, onToggleExpanded },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Agrandir les notes' }));
    expect(onToggleExpanded).toHaveBeenCalled();
    expect(container.querySelector('.notes-panel').classList.contains('np-expanded')).toBe(false);

    await rerender({ uiText, notes: '', expanded: true, onToggleExpanded });
    expect(screen.getByRole('button', { name: 'Réduire les notes' })).toBeTruthy();
    expect(container.querySelector('.notes-panel').classList.contains('np-expanded')).toBe(true);
  });
});
