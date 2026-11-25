/**
 * « Mon profil » — la page d'accueil des réglages : ce que portait le menu
 * déroulant du nom (identité, groupe, langue, mot de passe).
 *
 * Ce qui compte ici : la page LIT le compte (rien ne s'y modifie hors la
 * langue), la langue se nomme dans sa propre langue, et le mot de passe
 * n'apparaît que pour une session qui en a un — un bouton sans effet en SSO
 * serait une promesse fausse.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const ProfileSection = (await import('./ProfileSection.svelte')).default;
const { auth } = await import('../../stores/auth.js');

const USER = { name: 'Dev Local', email: 'dev@myalfred.ai' };

beforeEach(() => {
  auth.set({ user: { ...USER }, capabilities: {} });
});

describe('ProfileSection — « Mon profil »', () => {
  it('dit qui est connecté, et par quoi la session a été ouverte', () => {
    auth.set({ user: { ...USER, authProvider: 'entra' }, capabilities: {} });
    render(ProfileSection);

    expect(screen.getByText('Dev Local')).toBeTruthy();
    expect(screen.getByText('dev@myalfred.ai')).toBeTruthy();
    expect(screen.getByText('Connecté avec Microsoft')).toBeTruthy();
    expect(document.querySelector('.ua-disc').textContent.trim()).toBe('DL');
  });

  it('nomme le groupe attribué par l’administration, en lecture seule', () => {
    auth.set({
      user: { ...USER, groups: [{ id: 'g-sales', name: 'Commerciaux', color: 'blue' }] },
      capabilities: {},
    });
    render(ProfileSection);

    expect(screen.getByText('Votre groupe')).toBeTruthy();
    expect(
      [...document.querySelectorAll('.pf-groups .gc-name')].map((el) => el.textContent),
    ).toEqual(['Commerciaux']);
    expect(screen.getByText('Attribué par votre administrateur.')).toBeTruthy();
    // On le lit, on ne le change pas : aucun bouton dans le bloc.
    expect(document.querySelector('.pf-groups button')).toBeNull();
  });

  it('sans groupes connus (ancienne réponse de session), le bloc n’apparaît pas', () => {
    render(ProfileSection);
    expect(screen.queryByText('Votre groupe')).toBeNull();
    expect(document.querySelector('.pf-groups')).toBeNull();
  });

  it('la langue se choisit ici, chaque bouton nommé dans sa langue', async () => {
    const onSetLanguage = vi.fn();
    render(ProfileSection, { props: { onSetLanguage } });

    const fr = screen.getByRole('button', { name: 'Français' });
    const en = screen.getByRole('button', { name: 'English' });
    expect(fr.getAttribute('aria-pressed')).toBe('true');
    expect(en.getAttribute('aria-pressed')).toBe('false');
    expect(en.getAttribute('lang')).toBe('en');

    // La langue courante ne se « rechoisit » pas.
    await userEvent.click(fr);
    expect(onSetLanguage).not.toHaveBeenCalled();
    await userEvent.click(en);
    expect(onSetLanguage).toHaveBeenCalledWith('en');
  });

  it('« Changer de mot de passe » : seulement pour une session par mot de passe', async () => {
    const onAccountAction = vi.fn();
    const { unmount } = render(ProfileSection, { props: { onAccountAction } });
    expect(screen.queryByRole('button', { name: 'Changer de mot de passe' })).toBeNull();
    unmount();

    auth.set({ user: { ...USER, authMode: 'password' }, capabilities: {} });
    render(ProfileSection, { props: { onAccountAction } });
    await userEvent.click(screen.getByRole('button', { name: 'Changer de mot de passe' }));
    expect(onAccountAction).toHaveBeenCalledWith('password');
  });
});
