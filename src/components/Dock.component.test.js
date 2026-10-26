/**
 * Dock — la barre du bas sur ordinateur, et ses gestes de fin de réunion.
 *
 * Ce qui compte ici : pendant l'enregistrement, « Pause » et « Terminer » sont
 * nommés ; en pause, « Reprendre » remplace « Pause » et l'état dit que la
 * réunion n'est PAS finie ; « Terminer » ouvre « Terminer la réunion ? » et
 * chaque choix relaie SA fonction après avoir refermé la feuille ;
 * « Enregistrer » (clore sans compte rendu) n'existe que si la réunion est en
 * base et sans résumé (`canSave`) — dans la feuille comme après l'arrêt.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const Dock = (await import('./Dock.svelte')).default;

const SAVE_LABEL = 'Enregistrer la réunion sans résumé';
const END_DIALOG = { name: 'Terminer la réunion ?' };

describe('Dock — pendant la réunion', () => {
  it('en enregistrement : « Pause » et « Terminer », nommés ; « Pause » met en pause', async () => {
    const onPauseRecording = vi.fn();
    render(Dock, { props: { isRecording: true, onPauseRecording } });

    const names = screen.getAllByRole('button').map((b) => b.textContent.trim());
    expect(names).toEqual(['Pause', 'Terminer']);
    expect(screen.queryByRole('button', { name: 'Reprendre' })).toBeNull();
    expect(screen.queryByRole('dialog', END_DIALOG)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPauseRecording).toHaveBeenCalledTimes(1);
  });

  it('en pause : « Reprendre » à la place de « Pause », et l’état dit que ce n’est pas fini', async () => {
    const onResumeRecording = vi.fn();
    render(Dock, { props: { isRecording: true, isPaused: true, onResumeRecording } });

    const names = screen.getAllByRole('button').map((b) => b.textContent.trim());
    expect(names).toEqual(['Reprendre', 'Terminer']);
    expect(screen.getByRole('status').textContent).toContain('n’est pas terminée');

    await userEvent.click(screen.getByRole('button', { name: 'Reprendre' }));
    expect(onResumeRecording).toHaveBeenCalledTimes(1);
  });

  it('« Terminer » ouvre la feuille ; « Résumer maintenant » la referme PUIS relaie', async () => {
    const onOpenPicker = vi.fn();
    const onSave = vi.fn();
    const onRequestDelete = vi.fn();
    render(Dock, {
      props: { isRecording: true, canSave: true, onOpenPicker, onSave, onRequestDelete },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(screen.getByRole('dialog', END_DIALOG)).toBeTruthy();
    // « Annuler » : rien ne part, la réunion continue.
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog', END_DIALOG)).toBeNull();
    expect(onOpenPicker).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await userEvent.click(screen.getByRole('button', { name: /Résumer maintenant/ }));
    expect(screen.queryByRole('dialog', END_DIALOG)).toBeNull();
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it('la feuille relaie aussi « Enregistrer sans résumé » et « Supprimer la réunion »', async () => {
    const onSave = vi.fn();
    const onRequestDelete = vi.fn();
    render(Dock, {
      props: { isRecording: true, isPaused: true, canSave: true, onSave, onRequestDelete },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer sans résumé/ }));
    expect(onSave).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await userEvent.click(screen.getByRole('button', { name: /Supprimer la réunion/ }));
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it('sans réunion en base (canSave false) : la feuille n’offre pas « Enregistrer sans résumé »', async () => {
    render(Dock, { props: { isRecording: true, canSave: false } });
    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(screen.queryByRole('button', { name: /Enregistrer sans résumé/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Résumer maintenant/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Supprimer la réunion/ })).toBeTruthy();
  });

  it('la feuille se referme d’elle-même si l’enregistrement s’arrête par un autre chemin', async () => {
    const { rerender } = render(Dock, { props: { isRecording: true } });
    await userEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(screen.getByRole('dialog', END_DIALOG)).toBeTruthy();

    await rerender({ isRecording: false, hasTranscription: true });
    expect(screen.queryByRole('dialog', END_DIALOG)).toBeNull();
  });
});

describe('Dock — hors réunion', () => {
  it('au repos : « Démarrer », et rien d’autre', () => {
    render(Dock, { props: { isRecording: false, hasTranscription: false, canSave: true } });
    expect(screen.getAllByRole('button').map((b) => b.textContent.trim())).toEqual(['Démarrer']);
  });

  it('quota de minutes atteint : le bouton le dit, et reste cliquable pour qu’App explique', async () => {
    const onToggleRecording = vi.fn();
    render(Dock, {
      props: { isRecording: false, startBlocked: 'Quota atteint', onToggleRecording },
    });
    const button = screen.getByRole('button', { name: 'Démarrer : Quota atteint' });
    expect(button.textContent.trim()).toBe('Quota atteint');
    expect(button.className).toContain('start-blocked');
    expect(button.disabled).toBe(false);
    await userEvent.click(button);
    expect(onToggleRecording).toHaveBeenCalledTimes(1);
  });

  it('après l’arrêt (transcription présente) : « Enregistrer » précède « Résumer »', async () => {
    const onSave = vi.fn();
    render(Dock, {
      props: { isRecording: false, hasTranscription: true, canSave: true, onSave },
    });
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(buttons).toEqual([SAVE_LABEL, 'Générer le résumé']);
    await userEvent.click(screen.getByRole('button', { name: SAVE_LABEL }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('après l’arrêt, déjà résumée (canSave false) : « Résumer » seul', () => {
    render(Dock, { props: { isRecording: false, hasTranscription: true, canSave: false } });
    expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull();
    expect(screen.getByRole('button', { name: 'Générer le résumé' })).toBeTruthy();
  });

  it('inactif pendant une génération de résumé, comme « Résumer »', () => {
    render(Dock, {
      props: {
        isRecording: false,
        hasTranscription: true,
        canSave: true,
        isGeneratingSummary: true,
      },
    });
    expect(screen.getByRole('button', { name: SAVE_LABEL }).disabled).toBe(true);
  });
});
