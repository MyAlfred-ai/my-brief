/**
 * Onglets à l'intérieur d'une page de panneau (« Actions » : un onglet par
 * action).
 *
 * Ce qui compte ici : la rangée est une vraie liste d'onglets — un seul arrêt
 * de tabulation, les flèches pour passer de l'un à l'autre — et un onglet à
 * régler le montre sans qu'on ait à l'ouvrir.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const SubTabs = (await import('./SubTabs.svelte')).default;

const TABS = [
  { id: 'mail', label: 'Envoi d’email' },
  { id: 'storage', label: 'Entreposer' },
  { id: 'mybrain', label: 'MyBrain' },
];

describe('SubTabs', () => {
  it('une liste d’onglets nommée, l’onglet ouvert marqué, un seul arrêt de tabulation', () => {
    render(SubTabs, { props: { tabs: TABS, active: 'storage', ariaLabel: 'Actions' } });

    expect(screen.getByRole('tablist', { name: 'Actions' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent.trim())).toEqual([
      'Envoi d’email',
      'Entreposer',
      'MyBrain',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('cliquer un onglet le remonte ; recliquer l’onglet ouvert ne fait rien', async () => {
    const onSelect = vi.fn();
    render(SubTabs, { props: { tabs: TABS, active: 'mail', onSelect } });

    await userEvent.click(screen.getByRole('tab', { name: 'Envoi d’email' }));
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('tab', { name: 'Entreposer' }));
    expect(onSelect).toHaveBeenCalledWith('storage');
  });

  it('les flèches passent d’un onglet à l’autre, en boucle', async () => {
    const onSelect = vi.fn();
    render(SubTabs, { props: { tabs: TABS, active: 'mail', onSelect } });

    screen.getByRole('tab', { name: 'Envoi d’email' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith('storage');
    // Depuis le premier, la flèche gauche boucle sur le dernier.
    await userEvent.keyboard('{ArrowLeft}');
    expect(onSelect).toHaveBeenLastCalledWith('mybrain');
  });

  it('un onglet à régler porte sa pastille, les autres non', () => {
    const alert = { level: 'warning', items: [{ level: 'warning', text: 'Dossier introuvable.' }] };
    const tabs = [TABS[0], { ...TABS[1], alert }, TABS[2]];
    render(SubTabs, { props: { tabs, active: 'mail' } });

    const storage = screen.getByRole('tab', { name: /^Entreposer/ });
    expect(storage.querySelector('.cad-warning')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Envoi d’email' }).querySelector('.cad')).toBeNull();
  });
});

describe('SubTabs — l’onglet de l’Aide IA', () => {
  it('porte son orbe, dans sa teinte ; les autres n’ont que leur libellé', async () => {
    const Orb = (await import('../icons/AiHelpIcon.svelte')).default;
    const tabs = [TABS[0], { id: 'aiHelp', label: 'Aide IA', icon: Orb, tone: 'ai' }];
    render(SubTabs, { props: { tabs, active: 'aiHelp' } });

    // L'orbe est décoratif : le nom de l'onglet reste son libellé.
    const ai = screen.getByRole('tab', { name: 'Aide IA' });
    expect(ai.classList.contains('st-tab-ai')).toBe(true);
    const icon = ai.querySelector('.st-icon');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelector('svg')).toBeTruthy();

    const mail = screen.getByRole('tab', { name: 'Envoi d’email' });
    expect(mail.classList.contains('st-tab-ai')).toBe(false);
    expect(mail.querySelector('.st-icon')).toBeNull();
  });
});
