/**
 * Surcouche mobile de la réunion : hors réunion, deux boutons flottants
 * nommés (Notes, Actions) et leurs modales plein écran ; en réunion (`live`),
 * la barre du bas à leur place, et « Terminer » qui ouvre la feuille de fin.
 *
 * Ce qui compte ici : chaque bouton ouvre SA modale, la pastille des notes ne
 * s'affiche que si un brouillon existe, fermer la modale notes sauve — le blur
 * du textarea ne survit pas au démontage, la fermeture porte donc la
 * sauvegarde (onSaveNotes) —, et la feuille de fin se referme AVANT de relayer
 * le choix (la carte de génération s'ouvre sous rien).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const MobileMeetingOverlays = (await import('./MobileMeetingOverlays.svelte')).default;

const uiText = {
  meetingBar: { notes: 'Notes', actions: 'Actions' },
  notes: {
    title: 'Notes de réunion',
    placeholder: 'Vos notes…',
    hint: 'Vos notes font foi pour l’orthographe.',
  },
  actions: {
    actionPlaceholder: 'Action…',
    ownerPlaceholder: 'À définir',
    hiddenToggle: 'Actions masquées ({count})',
    restoreAction: 'Rétablir',
    restoreActionLabel: 'Rétablir l’action « {title} »',
    untitledAction: 'Action sans titre',
  },
};

const texts = {
  sections: { actionsTitle: '✅ Actions détectées' },
  buttons: { addAction: 'Ajouter une action', hideAction: 'Masquer l’action' },
  actions: { ownerLabel: 'Porteur', deadlineLabel: 'Échéance', descriptionLabel: 'Description' },
  ariaLabels: { close: 'Fermer', closeModal: 'Fermer la modal' },
};

function renderOverlays(props = {}) {
  return render(MobileMeetingOverlays, {
    props: { visibleActions: [], texts, uiText, notes: '', removeAction: () => {}, ...props },
  });
}

describe('MobileMeetingOverlays', () => {
  it('hors réunion : deux boutons flottants nommés, compteur d’actions inclus', () => {
    const { container } = renderOverlays({ visibleActions: [{ id: 1, title: 'A' }] });

    const notesFab = screen.getByRole('button', { name: 'Notes de réunion' });
    expect(notesFab.textContent).toContain('Notes');
    const actionsFab = screen.getByRole('button', { name: /Actions détectées/ });
    expect(actionsFab.textContent).toContain('Actions');
    expect(actionsFab.textContent).toContain('1');
    // Pas de barre de réunion sans réunion en cours.
    expect(container.querySelector('.mmb')).toBeNull();
  });

  it('en réunion (live) : la barre du bas remplace les boutons flottants', () => {
    const { container } = renderOverlays({ live: true, visibleActions: [{ id: 1, title: 'A' }] });
    expect(container.querySelector('.mobile-fab-row')).toBeNull();
    expect(container.querySelector('.mmb')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeTruthy();
    // Les mêmes accès : « Notes » ouvre la modale notes.
    expect(screen.queryByPlaceholderText('Vos notes…')).toBeNull();
  });

  it('« Terminer » ouvre la feuille de fin ; un choix la referme PUIS relaie', async () => {
    const onOpenPicker = vi.fn();
    const onSave = vi.fn();
    renderOverlays({ live: true, canSave: true, onOpenPicker, onSave });

    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(screen.getByRole('dialog', { name: 'Terminer la réunion ?' })).toBeTruthy();

    // « Annuler » : rien ne part.
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog', { name: 'Terminer la réunion ?' })).toBeNull();
    expect(onOpenPicker).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await userEvent.click(screen.getByRole('button', { name: /Résumer maintenant/ }));
    expect(screen.queryByRole('dialog', { name: 'Terminer la réunion ?' })).toBeNull();
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('en réunion, « Notes » de la barre ouvre la modale notes, et la fermer sauve', async () => {
    const onSaveNotes = vi.fn();
    renderOverlays({ live: true, onSaveNotes });
    await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByPlaceholderText('Vos notes…')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onSaveNotes).toHaveBeenCalledTimes(1);
  });

  it('n’affiche la pastille du FAB notes que si un brouillon existe', async () => {
    const { container, rerender } = renderOverlays({ notes: '' });
    expect(container.querySelector('.mobile-notes-fab-dot')).toBeNull();

    await rerender({
      visibleActions: [],
      texts,
      uiText,
      notes: 'Fabrikam',
      removeAction: () => {},
    });
    expect(container.querySelector('.mobile-notes-fab-dot')).toBeTruthy();
  });

  it('le FAB notes ouvre la modale notes, et la fermer sauve', async () => {
    const onSaveNotes = vi.fn();
    renderOverlays({ onSaveNotes });

    expect(screen.queryByPlaceholderText('Vos notes…')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Notes de réunion' }));
    expect(screen.getByPlaceholderText('Vos notes…')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByPlaceholderText('Vos notes…')).toBeNull();
    expect(onSaveNotes).toHaveBeenCalledTimes(1);
  });

  it('le FAB actions ouvre la modale actions, Escape la ferme', async () => {
    renderOverlays({ visibleActions: [{ id: 1, title: 'Relancer le devis' }] });

    await userEvent.click(screen.getByRole('button', { name: /Actions détectées/ }));
    expect(screen.getByText(/Actions détectées \(1\)/)).toBeTruthy();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText(/Actions détectées \(1\)/)).toBeNull();
  });

  it('la modale actions masque, et rétablit depuis « Actions masquées »', async () => {
    const removeAction = vi.fn();
    const restoreAction = vi.fn();
    const visible = { id: 1, title: '', owner: '', dueDate: '', description: '' };
    const hidden = { id: 2, title: 'Écrire au notaire', show: false };
    renderOverlays({
      visibleActions: [visible],
      hiddenActions: [hidden],
      removeAction,
      restoreAction,
    });
    await userEvent.click(screen.getByRole('button', { name: /Actions détectées/ }));

    // Carte vierge : placeholders, pas de faux texte.
    expect(screen.getByPlaceholderText('Action…').value).toBe('');
    expect(screen.getByPlaceholderText('À définir').value).toBe('');

    await userEvent.click(screen.getByRole('button', { name: 'Masquer l’action' }));
    expect(removeAction).toHaveBeenCalledWith(visible);

    await userEvent.click(screen.getByRole('button', { name: /Actions masquées \(1\)/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Rétablir l’action « Écrire au notaire »' }),
    );
    expect(restoreAction).toHaveBeenCalledWith(hidden);
  });

  it('chaque frappe dans les notes remonte (écriture différée en base)', async () => {
    const onNotesInput = vi.fn();
    renderOverlays({ onNotesInput });
    await userEvent.click(screen.getByRole('button', { name: 'Notes de réunion' }));
    await userEvent.type(screen.getByPlaceholderText('Vos notes…'), 'SAL');
    expect(onNotesInput).toHaveBeenCalledTimes(3);
  });
});
