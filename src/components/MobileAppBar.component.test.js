/**
 * Barre d'app mobile — le menu et le logo à gauche ; à droite le « + » qui
 * démarre une réunion et l'avatar, cerclé du crédit, qui ouvre le menu de
 * compte : « Ce mois-ci », Configuration, Administration, langue, sortie.
 *
 * Ce qui compte ici : le « + » n'existe que quand une réunion peut démarrer
 * (`canStart`), il fait ce que fait « Nouvelle réunion » (onStart), et le
 * bouton menu reste là dans tous les cas, EN TÊTE de barre. Logo et entrées du
 * menu de compte remontent par `onMenuAction`, l'aiguillage de la Sidebar : ce
 * que veut dire chaque action, c'est App qui le décide. Les pastilles de
 * configuration sont sur les lignes Configuration (compte) et Administration
 * (organisation), et réunies sur l'avatar menu fermé — plus sur le bouton menu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

// « Ce mois-ci » (menu de compte) relit /stats/me à chaque ouverture.
vi.mock('../services/statsApi.js', () => ({
  fetchMyStats: vi.fn(async () => ({
    ok: true,
    status: 200,
    data: { totals: { meetings: 6, durationSeconds: 10980, summaries: 8 }, credit: null },
  })),
  fetchTeamCredits: vi.fn(),
  fetchAccountStats: vi.fn(),
}));

const MobileAppBar = (await import('./MobileAppBar.svelte')).default;
const { auth } = await import('../stores/auth.js');
const { configChecks } = await import('../stores/configChecks.js');

const USER = { name: 'Dev Local', email: 'dev@myalfred.ai' };

beforeEach(() => {
  auth.set({ user: { ...USER }, capabilities: {} });
  configChecks.set({ loaded: true, account: [], organization: [] });
});

describe('MobileAppBar — « + »', () => {
  it('quand une réunion peut démarrer : un « + » nommé, qui démarre', async () => {
    const onStart = vi.fn();
    const onToggleMenu = vi.fn();
    render(MobileAppBar, {
      props: { canStart: true, startLabel: 'Nouvelle réunion', onStart, onToggleMenu },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle réunion' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onToggleMenu).not.toHaveBeenCalled();
  });

  it('pendant une réunion (canStart false) : pas de « + », le menu reste', () => {
    render(MobileAppBar, { props: { canStart: false } });
    expect(screen.queryByRole('button', { name: 'Nouvelle réunion' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ouvrir le menu' })).toBeTruthy();
  });

  it('quota de minutes atteint : le « + » s’éteint mais reste tactile, App explique', async () => {
    const onStart = vi.fn();
    render(MobileAppBar, {
      props: { canStart: true, startBlocked: true, startLabel: 'Nouvelle réunion', onStart },
    });
    const button = screen.getByRole('button', { name: 'Nouvelle réunion' });
    expect(button.className).toContain('mobile-appbar-start-blocked');
    await userEvent.click(button);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('MobileAppBar — menu et logo', () => {
  it('le menu ouvre le tiroir, en tête de barre, le logo juste après', async () => {
    const onToggleMenu = vi.fn();
    render(MobileAppBar, { props: { onToggleMenu } });

    const [first, second] = screen.getAllByRole('button');
    expect(first).toBe(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    expect(second).toBe(screen.getByRole('button', { name: "Retour à l'accueil" }));
    await userEvent.click(first);
    expect(onToggleMenu).toHaveBeenCalledTimes(1);
  });

  it('le logo et le nom ramènent à l’accueil, sans toucher au menu', async () => {
    const onMenuAction = vi.fn();
    const onToggleMenu = vi.fn();
    render(MobileAppBar, { props: { onMenuAction, onToggleMenu } });

    const home = screen.getByRole('button', { name: "Retour à l'accueil" });
    expect(home.textContent).toContain('MyBrief');
    expect(home.querySelector('img')).toBeTruthy();
    await userEvent.click(home);
    expect(onMenuAction).toHaveBeenCalledWith('welcome');
    expect(onToggleMenu).not.toHaveBeenCalled();
  });

  it('le menu ne porte pas de pastille : elles sont sur l’avatar et dans le menu de compte', () => {
    configChecks.set({
      loaded: true,
      account: [{ section: 'ai', code: 'x', level: 'error' }],
      organization: [],
    });
    render(MobileAppBar);
    expect(screen.getByRole('button', { name: 'Ouvrir le menu' }).querySelector('.cad')).toBeNull();
  });
});

describe('MobileAppBar — compte, réglages, administration', () => {
  const menuLabels = () =>
    [...document.querySelectorAll('.mobile-appbar-account-menu .am-item')].map((b) =>
      b.textContent.trim(),
    );
  const openAccount = () => userEvent.click(screen.getByRole('button', { name: 'Mon compte' }));

  it('la barre ne porte plus que le « + » et l’avatar : ni roue, ni bouclier', () => {
    auth.set({ user: { ...USER, role: 'admin' }, capabilities: {} });
    render(MobileAppBar, { props: { canStart: true, startLabel: 'Nouvelle réunion' } });
    expect(screen.queryByRole('button', { name: 'Configuration' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Administration' })).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Ouvrir le menu',
      "Retour à l'accueil",
      'Nouvelle réunion',
      'Mon compte',
    ]);
  });

  it('l’avatar ouvre le menu de compte : identité, mois, configuration, langue, sortie', async () => {
    const onMenuAction = vi.fn();
    render(MobileAppBar, { props: { onMenuAction } });

    const avatar = screen.getByRole('button', { name: 'Mon compte' });
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
    expect(avatar.querySelector('.ua-disc').textContent.trim()).toBe('DL');
    await openAccount();

    expect(avatar.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.am-email').textContent).toBe('dev@myalfred.ai');
    expect(screen.getByRole('region', { name: 'Ce mois-ci' })).toBeTruthy();
    expect(menuLabels()).toEqual(['Configuration', 'Se déconnecter']);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }));
    expect(onMenuAction).toHaveBeenCalledWith('logout');
    // L'action faite, le menu se referme.
    expect(document.querySelector('.mobile-appbar-account-menu')).toBeNull();
  });

  it('« Voir mes statistiques » ouvre la page et referme le menu', async () => {
    const onMenuAction = vi.fn();
    render(MobileAppBar, { props: { onMenuAction } });
    await openAccount();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Voir mes statistiques' }));
    expect(onMenuAction).toHaveBeenCalledWith('stats');
    expect(document.querySelector('.mobile-appbar-account-menu')).toBeNull();
  });

  it('la langue se change depuis le menu de compte, puis il se referme', async () => {
    const onSetLanguage = vi.fn();
    render(MobileAppBar, { props: { onSetLanguage } });

    await openAccount();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'English' }));
    expect(onSetLanguage).toHaveBeenCalledWith('en');
    expect(document.querySelector('.mobile-appbar-account-menu')).toBeNull();
  });

  it('« Changer de mot de passe » seulement en mode mot de passe', async () => {
    auth.set({ user: { ...USER, authMode: 'password' }, capabilities: {} });
    const onMenuAction = vi.fn();
    render(MobileAppBar, { props: { onMenuAction } });

    await openAccount();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Changer de mot de passe' }));
    expect(onMenuAction).toHaveBeenCalledWith('password');
  });

  it('un tap ailleurs, ou Échap, referme le menu de compte', async () => {
    render(MobileAppBar);
    await openAccount();
    await userEvent.click(document.body);
    expect(document.querySelector('.mobile-appbar-account-menu')).toBeNull();

    await openAccount();
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('.mobile-appbar-account-menu')).toBeNull();
  });

  it('« Configuration » ouvre Ma configuration ; pas d’administration hors administrateur', async () => {
    const onMenuAction = vi.fn();
    render(MobileAppBar, { props: { onMenuAction } });

    await openAccount();
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Configuration' }));
    expect(onMenuAction).toHaveBeenCalledWith('config');
  });

  it('administrateur : « Administration » ouvre l’administration', async () => {
    auth.set({ user: { ...USER, role: 'admin' }, capabilities: {} });
    const onMenuAction = vi.fn();
    render(MobileAppBar, { props: { onMenuAction } });

    await openAccount();
    expect(menuLabels()).toEqual(['Configuration', 'Administration', 'Se déconnecter']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Administration' }));
    expect(onMenuAction).toHaveBeenCalledWith('admin');
  });

  it('pastilles : réunies sur l’avatar, puis chacune sur sa ligne, phrase écrite', async () => {
    auth.set({ user: { ...USER, role: 'admin' }, capabilities: {} });
    configChecks.set({
      loaded: true,
      account: [
        {
          section: 'tags',
          code: 'tag_folder_missing',
          level: 'warning',
          vars: { tag: 'Acme', folder: 'Clients/Acme' },
        },
      ],
      organization: [{ section: 'ai', code: 'ai_key_missing', level: 'error' }],
    });
    render(MobileAppBar);

    // Menu fermé : l'avatar porte la plus grave des deux.
    const avatar = screen.getByRole('button', { name: 'Mon compte' });
    expect(avatar.querySelector('.cad-error')).toBeTruthy();

    await openAccount();
    const config = screen.getByRole('menuitem', { name: /^Configuration/ });
    const admin = screen.getByRole('menuitem', { name: /^Administration/ });
    expect(config.querySelector('.cad-warning')).toBeTruthy();
    expect(admin.querySelector('.cad-error')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Administration/, description: /OpenAI/ })).toBe(
      admin,
    );
    // Au doigt, pas de bulle : la phrase s'écrit sous le libellé.
    expect(config.querySelector('.am-alert-text').textContent).toContain('Clients/Acme');
  });
});
