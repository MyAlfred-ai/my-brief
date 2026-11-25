/**
 * Sélecteur de section mobile des panneaux — depuis la refonte « sections
 * dans la sidebar », il ne reste que le menu déroulant (les pastilles desktop
 * vivent désormais dans Sidebar.svelte).
 *
 * Ce qui compte ici : le déroulant expose TOUS les onglets et remonte la
 * sélection — sur téléphone, des onglets hors champ dans une barre au scroll
 * invisible étaient introuvables (Connexion et IA en administration).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const PanelTabs = (await import('./PanelTabs.svelte')).default;

// Les icônes sont des composants Svelte quelconques : un stub suffit.
const Icon = (await import('./icons/GoogleLogo.svelte')).default;

const TABS = [
  { id: 'templates', label: 'Templates', icon: Icon },
  { id: 'users', label: 'Utilisateurs', icon: Icon },
  { id: 'ai', label: 'IA', icon: Icon },
];

describe('PanelTabs', () => {
  it('le déroulant liste TOUS les onglets et remonte la sélection', async () => {
    const onSelect = vi.fn();
    render(PanelTabs, {
      props: { tabs: TABS, active: 'templates', onSelect, ariaLabel: 'Sections' },
    });

    // Le bouton du déroulant affiche l'onglet actif.
    const trigger = screen.getByRole('button', { name: 'Sections', expanded: false });
    expect(trigger.textContent).toContain('Templates');

    await userEvent.click(trigger);
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent.trim())).toEqual(['Templates', 'Utilisateurs', 'IA']);
    expect(items[0].getAttribute('aria-checked')).toBe('true');

    await userEvent.click(items[2]);
    expect(onSelect).toHaveBeenCalledWith('ai');
    // Le menu se referme après sélection.
    expect(screen.queryByRole('menuitemradio')).toBeNull();
  });

  it('une entrée LIEN s’ouvre dans un nouvel onglet et n’est jamais la section affichée', async () => {
    const onSelect = vi.fn();
    const tabs = [...TABS, { id: 'help', label: 'Aide', icon: Icon, href: 'https://docs.test/' }];
    render(PanelTabs, {
      props: {
        tabs,
        active: 'help',
        onSelect,
        ariaLabel: 'Sections',
        newTabLabel: 'nouvel onglet',
      },
    });

    // Un lien n'a pas d'écran : désigné comme actif, le bouton retombe sur la
    // première section plutôt que d'afficher « Aide ».
    const trigger = screen.getByRole('button', { name: 'Sections', expanded: false });
    expect(trigger.textContent).toContain('Templates');

    await userEvent.click(trigger);
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
    const link = screen.getByRole('menuitem', { name: 'Aide (nouvel onglet)' });
    expect(link.getAttribute('href')).toBe('https://docs.test/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('re-cliquer l’onglet déjà actif referme le menu sans re-sélectionner', async () => {
    const onSelect = vi.fn();
    render(PanelTabs, { props: { tabs: TABS, active: 'ai', onSelect } });

    await userEvent.click(screen.getByRole('button', { expanded: false }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /IA/ }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('menuitemradio')).toBeNull();
  });
});

describe('PanelTabs — pastilles de configuration', () => {
  const ALERT = { level: 'error', items: [{ level: 'error', text: 'Aucune clé OpenAI.' }] };

  it('le bouton signale qu’une section est à régler ; la liste écrit la phrase', async () => {
    const tabs = [TABS[0], TABS[1], { ...TABS[2], alert: ALERT }];
    render(PanelTabs, { props: { tabs, active: 'templates', ariaLabel: 'Sections' } });

    const trigger = screen.getByRole('button', { name: 'Sections', expanded: false });
    // La section active n'a rien : c'est le bouton à déplier qui porte la pastille.
    expect(trigger.querySelector('.cad-error')).toBeTruthy();

    await userEvent.click(trigger);
    const ai = screen.getByRole('menuitemradio', { name: /^IA/ });
    expect(ai.querySelector('.cad-error')).toBeTruthy();
    // Téléphone : pas de survol, la phrase est écrite sous le libellé.
    expect(ai.querySelector('.pt-dd-alert-text').textContent).toBe('Aucune clé OpenAI.');
    expect(
      screen.getByRole('menuitemradio', { name: 'Templates' }).querySelector('.cad'),
    ).toBeNull();
    // Entrée de plusieurs lignes : icône, pastille et coche se calent sur le
    // libellé (mesuré dans Chromium), pas au milieu du bloc — les autres restent centrées.
    expect(ai.classList.contains('pt-dd-item-alert')).toBe(true);
    expect(
      screen
        .getByRole('menuitemradio', { name: 'Templates' })
        .classList.contains('pt-dd-item-alert'),
    ).toBe(false);
  });

  it('sans constat, ni pastille ni phrase', () => {
    render(PanelTabs, { props: { tabs: TABS, active: 'templates', ariaLabel: 'Sections' } });
    expect(document.querySelector('.cad')).toBeNull();
  });

  it('un intertitre ouvre chaque groupe, comme dans la colonne de l’ordinateur', async () => {
    const tabs = [
      { id: 'users', label: 'Comptes', icon: Icon, group: 'Personnes' },
      { id: 'groups', label: 'Groupes', icon: Icon, group: 'Personnes' },
      { id: 'ai', label: 'Clés API', icon: Icon, group: 'Modèles IA' },
    ];
    render(PanelTabs, { props: { tabs, active: 'users', ariaLabel: 'Sections' } });
    await userEvent.click(screen.getByRole('button', { name: 'Sections' }));

    expect([...document.querySelectorAll('.pt-dd-group')].map((el) => el.textContent)).toEqual([
      'Personnes',
      'Modèles IA',
    ]);
    // Un intertitre n'est pas une entrée du menu.
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
  });

  it('un GESTE (« Se déconnecter ») remonte son identifiant et n’est jamais la section affichée', async () => {
    const onSelect = vi.fn();
    const onAction = vi.fn();
    const tabs = [
      ...TABS,
      { id: 'logout', label: 'Se déconnecter', icon: Icon, action: 'logout', danger: true },
    ];
    render(PanelTabs, {
      props: { tabs, active: 'logout', onSelect, onAction, ariaLabel: 'Sections' },
    });

    const trigger = screen.getByRole('button', { name: 'Sections' });
    expect(trigger.textContent).toContain('Templates');
    await userEvent.click(trigger);
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }));
    expect(onAction).toHaveBeenCalledWith('logout');
    expect(onSelect).not.toHaveBeenCalled();
    // Le geste fait, la liste se referme.
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('PanelTabs — recherche dans les réglages (téléphone)', () => {
  it('en tête du déroulant : taper remplace les sections par les réglages, un choix y mène', async () => {
    const { get } = await import('svelte/store');
    const { activePanel, registerPanelNav, panelNav, clearPanelNav } =
      await import('../stores/panels.js');
    const items = [
      { id: 'profile', label: 'Mon profil', icon: Icon },
      { id: 'audio', label: 'Audio', icon: Icon },
    ];
    activePanel.set('config');
    registerPanelNav('config', { title: 'Réglages', items, active: 'profile' });
    render(PanelTabs, { props: { tabs: items, active: 'profile', ariaLabel: 'Sections' } });

    await userEvent.click(screen.getByRole('button', { name: 'Sections' }));
    // Pas de focus d'office : le clavier du téléphone cacherait la liste.
    const field = screen.getByRole('combobox', { name: 'Rechercher dans les réglages' });
    expect(document.activeElement).not.toBe(field);
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2);

    await userEvent.type(field, 'langue');
    expect(screen.queryByRole('menuitemradio')).toBeNull();
    await userEvent.click(screen.getByRole('option', { name: /Langue/ }));

    expect(get(panelNav).active).toBe('profile');
    // Le déroulant se referme sur la page.
    expect(screen.queryByRole('combobox')).toBeNull();

    activePanel.set(null);
    clearPanelNav('config');
  });
});

describe('PanelTabs — pied de liste', () => {
  it('une section sans groupe (« Outils ») s’y range sous un filet, les liens la suivent', async () => {
    const tabs = [
      { id: 'profile', label: 'Mon profil', icon: Icon, group: 'Mon compte' },
      { id: 'tags', label: 'Mes tags', icon: Icon, group: 'Ma bibliothèque' },
      { id: 'tools', label: 'Outils', icon: Icon },
      { id: 'help', label: 'Aide', icon: Icon, href: 'https://docs.test/' },
    ];
    const { container } = render(PanelTabs, {
      props: { tabs, active: 'tools', ariaLabel: 'Sections' },
    });

    // « Outils » a un écran : c'est une section, affichée sur le bouton.
    const trigger = screen.getByRole('button', { name: 'Sections', expanded: false });
    expect(trigger.textContent).toContain('Outils');

    await userEvent.click(trigger);
    const rows = [...container.querySelector('.pt-dd-items').children].map((el) => {
      if (el.classList.contains('pt-dd-rule')) return '—';
      const text = el.textContent.trim();
      return el.classList.contains('pt-dd-group') ? `[${text}]` : text;
    });
    expect(rows).toEqual([
      '[Mon compte]',
      'Mon profil',
      '[Ma bibliothèque]',
      'Mes tags',
      '—',
      'Outils',
      'Aide',
    ]);
  });

  it('sans section en pied, aucun filet', async () => {
    const { container } = render(PanelTabs, {
      props: { tabs: TABS, active: 'templates', ariaLabel: 'Sections' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Sections', expanded: false }));
    expect(container.querySelector('.pt-dd-rule')).toBeNull();
  });
});
