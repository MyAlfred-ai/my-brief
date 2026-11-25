/**
 * Barre d'app mobile — le menu et le logo à gauche ; à droite le « + » qui
 * démarre une réunion et l'avatar, cerclé du crédit, qui ouvre la carte du
 * compte : qui je suis, « Ce mois-ci », et les deux boutons « Réglages » et
 * « Admin ».
 *
 * Ce qui compte ici : le « + » n'existe que quand une réunion peut démarrer
 * (`canStart`), il fait ce que fait « Nouvelle réunion » (onStart), et le
 * bouton menu reste là dans tous les cas, EN TÊTE de barre. Logo et boutons de
 * la carte remontent par `onMenuAction`, l'aiguillage de la Sidebar : ce que
 * veut dire chaque action, c'est App qui le décide. Les pastilles de
 * configuration sont sur les boutons « Réglages » (compte) et « Admin »
 * (organisation), et réunies sur l'avatar carte fermée — plus sur le bouton
 * menu. La langue, le mot de passe et la sortie n'y sont plus : ce sont des
 * pages et la dernière ligne des réglages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

// « Ce mois-ci » (carte du compte) relit /stats/me à chaque ouverture.
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

  it('le menu ne porte pas de pastille : elles sont sur l’avatar et sur la carte du compte', () => {
    configChecks.set({
      loaded: true,
      account: [{ section: 'ai', code: 'x', level: 'error' }],
      organization: [],
    });
    render(MobileAppBar);
    expect(screen.getByRole('button', { name: 'Ouvrir le menu' }).querySelector('.cad')).toBeNull();
  });
});

describe('MobileAppBar — carte du compte', () => {
  const cardButtons = () =>
    [...document.querySelectorAll('.mobile-appbar-account-menu .aa-btn')].map((b) =>
      b.textContent.trim(),
    );
  const openAccount = () => userEvent.click(screen.getByRole('button', { name: 'Mon compte' }));

  it('la barre ne porte plus que le « + » et l’avatar : ni roue, ni bouclier', () => {
    auth.set({ user: { ...USER, role: 'admin' }, capabilities: {} });
    render(MobileAppBar, { props: { canStart: true, startLabel: 'Nouvelle réunion' } });
    expect(screen.queryByRole('button', { name: 'Réglages' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Administration' })).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Ouvrir le menu',
      "Retour à l'accueil",
      'Nouvelle réunion',
      'Mon compte',
    ]);
  });

  it('l’avatar ouvre la carte du compte : identité, « Ce mois-ci », et « Réglages »', async () => {
    const onMenuAction = vi.fn();
    render(MobileAppBar, { props: { onMenuAction } });

    const avatar = screen.getByRole('button', { name: 'Mon compte' });
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
    expect(avatar.querySelector('.ua-disc').textContent.trim()).toBe('DL');
    await openAccount();

    expect(avatar.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Mon compte' })).toBeTruthy();
    expect(document.querySelector('.am-email').textContent).toBe('dev@myalfred.ai');
    expect(screen.getByRole('region', { name: 'Ce mois-ci' })).toBeTruthy();
    // Deux espaces, deux boutons au plus — et rien d'autre : la langue, le mot
    // de passe et la sortie sont dans les réglages.
    expect(cardButtons()).toEqual(['Réglages']);
    expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'English' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(onMenuAction).toHaveBeenCalledWith('config');
    // L'action faite, la carte se referme.
    expect(document.querySelector('.mobile-appbar-account-menu')).toBeNull();
  });

  it('« Voir le détail » ouvre « Usage & crédits » et referme la carte', async () => {
    const onMenuAction = vi.fn();
    render(MobileAppBar, { props: { onMenuAction } });
    await openAccount();
    await userEvent.click(screen.getByRole('button', { name: 'Voir le détail' }));
    expect(onMenuAction).toHaveBeenCalledWith('stats');
    expect(document.querySelector('.mobile-appbar-account-menu')).toBeNull();
  });

  it('un tap ailleurs, ou Échap, referme la carte', async () => {
    render(MobileAppBar);
    await openAccount();
    await userEvent.click(document.body);
    expect(document.querySelector('.mobile-appbar-account-menu')).toBeNull();

    await openAccount();
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('.mobile-appbar-account-menu')).toBeNull();
  });

  it('administrateur : « Admin » ouvre l’administration', async () => {
    auth.set({ user: { ...USER, role: 'admin' }, capabilities: {} });
    const onMenuAction = vi.fn();
    render(MobileAppBar, { props: { onMenuAction } });

    await openAccount();
    expect(cardButtons()).toEqual(['Réglages', 'Admin']);
    await userEvent.click(screen.getByRole('button', { name: 'Administration' }));
    expect(onMenuAction).toHaveBeenCalledWith('admin');
  });

  it('pastilles : réunies sur l’avatar, puis chacune sur son bouton, phrase écrite', async () => {
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

    // Carte fermée : l'avatar porte la plus grave des deux.
    const avatar = screen.getByRole('button', { name: 'Mon compte' });
    expect(avatar.querySelector('.cad-error')).toBeTruthy();

    await openAccount();
    const config = screen.getByRole('button', { name: 'Réglages' });
    const admin = screen.getByRole('button', { name: 'Administration' });
    expect(config.querySelector('.cad-warning')).toBeTruthy();
    expect(admin.querySelector('.cad-error')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Administration', description: /OpenAI/ })).toBe(
      admin,
    );
    // Au doigt, pas de bulle : la phrase de chaque espace s'écrit sous les boutons.
    const sentences = [...document.querySelectorAll('.am-alert-text')].map((p) => p.textContent);
    expect(sentences).toHaveLength(2);
    expect(sentences.join(' ')).toContain('Clients/Acme');
  });
});
