/**
 * « Quel type de réunion ? » : chaque sortie dit s'il faut démarrer, et comment.
 * « Réunion avec visio » ouvre le partage d'écran, « Réunion en présentiel »
 * démarre au micro seul ; « Annuler », le fond et Échap ne démarrent rien.
 * Dans Firefox et Safari, le rappel nomme le périphérique du son de
 * l'ordinateur au lieu d'une fenêtre de partage qui ne s'ouvrira pas.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import MeetingTypeModal from './MeetingTypeModal.svelte';
import { uiTextData } from '../config/uiText.js';
import { currentLanguageStore } from '../store.js';
import { meetingTypeContext } from '../stores/meetingType.js';

const fr = uiTextData.fr.meetingType;
const props = () => ({ onChoose: vi.fn(), onCancel: vi.fn() });

describe('MeetingTypeModal', () => {
  afterEach(() => {
    currentLanguageStore.set('fr');
    meetingTypeContext.set({ path: 'share' });
  });

  it('« Réunion avec visio » demande le partage, « Réunion en présentiel » non', async () => {
    const p = props();
    render(MeetingTypeModal, { props: p });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: fr.visio }));
    expect(p.onChoose).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: fr.inPerson }));
    expect(p.onChoose).toHaveBeenLastCalledWith(false);
    expect(p.onChoose).toHaveBeenCalledTimes(2);
    expect(p.onCancel).not.toHaveBeenCalled();
  });

  it('« Annuler », le fond et Échap annulent — sans jamais choisir', async () => {
    const p = props();
    const { container } = render(MeetingTypeModal, { props: p });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: fr.cancel }));
    await user.click(container.querySelector('.mtm-backdrop'));
    await user.keyboard('{Escape}');

    expect(p.onCancel).toHaveBeenCalledTimes(3);
    expect(p.onChoose).not.toHaveBeenCalled();
  });

  it('un clic dans la fenêtre, hors des boutons, ne fait rien', async () => {
    const p = props();
    render(MeetingTypeModal, { props: p });
    await userEvent.setup().click(screen.getByRole('heading', { name: fr.title }));
    expect(p.onChoose).not.toHaveBeenCalled();
    expect(p.onCancel).not.toHaveBeenCalled();
  });

  it('le focus arrive sur le premier choix : Entrée suffit au clavier', () => {
    render(MeetingTypeModal, { props: props() });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: fr.inPerson }));
  });

  it('Firefox, Safari : le rappel nomme le périphérique qui va s’ouvrir', () => {
    meetingTypeContext.set({ path: 'device', deviceLabel: 'BlackHole 2ch' });
    render(MeetingTypeModal, { props: props() });
    expect(screen.getByText(fr.visioHintDevice.replace('{device}', 'BlackHole 2ch'))).toBeTruthy();
    expect(screen.queryByText(fr.visioHint)).toBeNull();
  });

  it("suit la langue de l'interface", async () => {
    currentLanguageStore.set('en');
    const p = props();
    render(MeetingTypeModal, { props: p });
    const en = uiTextData.en.meetingType;
    expect(screen.getByRole('dialog', { name: en.title })).toBeTruthy();
    expect(screen.getByText(en.visioHint)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: en.visio }));
    expect(p.onChoose).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', { name: en.cancel }));
    expect(p.onCancel).toHaveBeenCalledOnce();
  });
});
