/**
 * Premier test de composant du repo — prouve le harnais jsdom +
 * @testing-library/svelte (projet vitest `dom`). Sert de modèle : rendu avec
 * les vrais dictionnaires uiText, interaction, assertion sur le callback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import WelcomeModal from './WelcomeModal.svelte';
import { uiTextData } from '../config/uiText.js';

const baseProps = () => ({
  onClose: vi.fn(),
  logoUrl: 'logo.png',
  uiText: uiTextData.fr,
});

describe('WelcomeModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('affiche le titre de bienvenue (dictionnaire fr réel)', () => {
    render(WelcomeModal, { props: baseProps() });
    expect(screen.getByText(uiTextData.fr.welcome.title)).toBeTruthy();
  });

  it('le bouton fermer appelle onClose et mémorise welcome_shown', async () => {
    const props = baseProps();
    render(WelcomeModal, { props });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: uiTextData.fr.ariaLabels.close }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(localStorage.getItem('mybrief_welcome_shown')).toBe('true');
  });

  it.each(['fr', 'en'])(
    'cite les vrais libellés des boutons, sans variable laissée brute (%s)',
    (lang) => {
      const dict = uiTextData[lang];
      const { container } = render(WelcomeModal, { props: { ...baseProps(), uiText: dict } });
      const text = container.textContent;
      expect(text).toContain(dict.buttons.start);
      expect(text).toContain(dict.meetingType.visio);
      expect(text).not.toMatch(/\{\w+\}/);
      expect(container.querySelectorAll('.wc-step')).toHaveLength(dict.welcome.steps.length);
    },
  );

  it('un clic sur le fond (backdrop) ferme aussi', async () => {
    const props = baseProps();
    render(WelcomeModal, { props });
    const user = userEvent.setup();
    await user.click(screen.getByRole('dialog'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});
