/**
 * « Navigateur partiellement compatible » (Firefox, Safari sur ordinateur) :
 * dit ce qui manque, mène au réglage du son de l'ordinateur, et se ferme par
 * toutes ses sorties.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import BrowserAudioNotice from './BrowserAudioNotice.svelte';
import { uiTextData } from '../config/uiText.js';
import { currentLanguageStore } from '../store.js';

const fr = uiTextData.fr.browserAudioNotice;
const props = () => ({ onClose: vi.fn(), onConfigure: vi.fn() });

describe('BrowserAudioNotice', () => {
  afterEach(() => currentLanguageStore.set('fr'));

  it('« Régler le son de l’ordinateur » mène au réglage', async () => {
    const p = props();
    render(BrowserAudioNotice, { props: p });
    await userEvent.setup().click(screen.getByRole('button', { name: fr.configure }));
    expect(p.onConfigure).toHaveBeenCalledOnce();
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('« J’ai compris », la croix, le fond et Échap ferment', async () => {
    const p = props();
    const { container } = render(BrowserAudioNotice, { props: p });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: fr.ack }));
    await user.click(screen.getByRole('button', { name: uiTextData.fr.ariaLabels.close }));
    await user.click(container.querySelector('.browser-warning-backdrop'));
    await user.keyboard('{Escape}');

    expect(p.onClose).toHaveBeenCalledTimes(4);
    expect(p.onConfigure).not.toHaveBeenCalled();
  });

  it('un clic dans la fenêtre, hors des boutons, ne ferme pas', async () => {
    const p = props();
    render(BrowserAudioNotice, { props: p });
    await userEvent.setup().click(screen.getByRole('heading', { name: fr.title }));
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it("suit la langue de l'interface", () => {
    currentLanguageStore.set('en');
    render(BrowserAudioNotice, { props: props() });
    const en = uiTextData.en.browserAudioNotice;
    expect(screen.getByRole('dialog', { name: en.title })).toBeTruthy();
    expect(screen.getByText(en.lead)).toBeTruthy();
    expect(screen.getByRole('button', { name: en.configure })).toBeTruthy();
  });
});
