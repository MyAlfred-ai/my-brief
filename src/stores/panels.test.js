// @vitest-environment jsdom
/**
 * Exclusion mutuelle structurelle des panneaux plein écran : une seule valeur,
 * ouvrir B ferme A par construction.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  activePanel,
  openPanel,
  closePanel,
  syncFromHash,
  panelFromHash,
  panelNav,
  registerPanelNav,
  selectPanelSection,
  clearPanelNav,
} from './panels.js';

beforeEach(() => {
  history.replaceState(null, '', '/');
  activePanel.set(null);
  clearPanelNav(get(panelNav).owner);
});

describe('panels store', () => {
  it('ouvrir B ferme A (une seule valeur possible)', () => {
    openPanel('config');
    expect(get(activePanel)).toBe('config');
    openPanel('admin');
    expect(get(activePanel)).toBe('admin');
    expect(window.location.hash).toBe('#admin');
  });

  it('closePanel nettoie le hash (sinon le retour arrière rouvrirait)', () => {
    openPanel('config');
    expect(window.location.hash).toBe('#config');
    closePanel();
    expect(get(activePanel)).toBe(null);
    expect(window.location.hash).toBe('');
  });

  it('openPanel peut viser une section — « Mes tags » ouvre son écran', () => {
    openPanel('config', 'tags');
    expect(get(activePanel)).toBe('config');
    expect(get(panelNav).active).toBe('tags');
    // …et le panneau, en s'enregistrant, ne la ramène pas à sa section par
    // défaut : la nav est encore vide au moment du raccourci.
    registerPanelNav('config', { title: 'Ma configuration', items: [], active: 'audio' });
    expect(get(panelNav).active).toBe('tags');
  });

  it('openPanel vers l’AUTRE panneau garde la page et l’onglet visés', () => {
    // Une recherche dans « Réglages » mène à l'administration : la nav en
    // place est celle de « Réglages », que le panneau suivant écraserait.
    openPanel('config');
    registerPanelNav('config', { title: 'Réglages', items: [], active: 'profile' });
    openPanel('admin', 'branding', 'logo');
    registerPanelNav('admin', { title: 'Administration', items: [], active: 'dashboard' });
    expect(get(panelNav)).toMatchObject({ owner: 'admin', active: 'branding', sub: 'logo' });
    // …et l'ancien panneau, démonté après, n'efface pas la nav du nouveau.
    clearPanelNav('config');
    expect(get(panelNav).active).toBe('branding');
  });

  it('openPanel dans le panneau ouvert change de page et d’onglet', () => {
    openPanel('config');
    registerPanelNav('config', { title: 'Réglages', items: [], active: 'profile' });
    openPanel('config', 'actions', 'storage');
    expect(get(panelNav)).toMatchObject({ owner: 'config', active: 'actions', sub: 'storage' });
  });

  it('closePanel ne touche pas un hash étranger', () => {
    window.location.hash = '#autre-chose';
    activePanel.set(null);
    closePanel();
    expect(window.location.hash).toBe('#autre-chose');
  });

  it('syncFromHash : deep-link et hashchange', () => {
    window.location.hash = '#config';
    syncFromHash();
    expect(get(activePanel)).toBe('config');
    window.location.hash = '';
    syncFromHash();
    expect(get(activePanel)).toBe(null);
  });

  it('les hash des anciens panneaux ouvrent la configuration SUR leur section', () => {
    window.location.hash = '#my-tags';
    syncFromHash();
    expect(get(activePanel)).toBe('config');
    expect(get(panelNav).active).toBe('tags');

    window.location.hash = '#my-templates';
    syncFromHash();
    expect(get(panelNav).active).toBe('templates');

    // « Mes statistiques » était un panneau : c'est la page « Usage & crédits ».
    window.location.hash = '#my-stats';
    syncFromHash();
    expect(get(activePanel)).toBe('config');
    expect(get(panelNav).active).toBe('usage');
  });

  it('panelFromHash : deux panneaux, plus les alias de section', () => {
    expect(panelFromHash('#admin')).toBe('admin');
    expect(panelFromHash('#config')).toBe('config');
    expect(panelFromHash('#my-templates')).toBe('config');
    expect(panelFromHash('#my-tags')).toBe('config');
    expect(panelFromHash('#my-stats')).toBe('config');
    expect(panelFromHash('#nimporte')).toBe(null);
    expect(panelFromHash('')).toBe(null);
  });

  it('openPanel ignore un nom inconnu', () => {
    openPanel('config');
    openPanel('inexistant');
    expect(get(activePanel)).toBe('config');
  });
});

describe('panelNav — sections du panneau ouvert, rendues par la sidebar', () => {
  const items = [
    { id: 'audio', label: 'Audio' },
    { id: 'mail', label: 'Mail' },
  ];

  it("l'enregistrement pose owner, titre, sections et section par défaut", () => {
    registerPanelNav('config', { title: 'Réglages', items, active: 'audio' });
    expect(get(panelNav)).toEqual({
      owner: 'config',
      title: 'Réglages',
      items,
      active: 'audio',
      sub: '',
      collapsible: false,
    });
  });

  it('ré-enregistrer le même owner garde la section choisie (liste rafraîchie)', () => {
    registerPanelNav('config', { title: 'Ma configuration', items: [items[0]], active: 'audio' });
    selectPanelSection('mail');
    // Le plafond serveur arrive : la liste gagne l'onglet mail — la sélection
    // en cours ne doit pas être ramenée à « audio » sous l'utilisateur.
    registerPanelNav('config', { title: 'Ma configuration', items, active: 'audio' });
    expect(get(panelNav).active).toBe('mail');
    expect(get(panelNav).items).toHaveLength(2);
  });

  it('changer d’owner repart sur la section par défaut du nouveau panneau', () => {
    registerPanelNav('config', { title: 'Ma configuration', items, active: 'audio' });
    selectPanelSection('mail');
    registerPanelNav('admin', { title: 'Administration', items, active: 'audio' });
    expect(get(panelNav).active).toBe('audio');
  });

  it('clearPanelNav ne retire que la nav de son owner — ordre mount/destroy', () => {
    // Passage config → admin : le nouveau panneau s'enregistre AVANT que
    // l'ancien ne soit démonté. Son clear ne doit pas effacer la nav d'admin.
    registerPanelNav('config', { title: 'Ma configuration', items, active: 'audio' });
    registerPanelNav('admin', { title: 'Administration', items, active: 'audio' });
    clearPanelNav('config');
    expect(get(panelNav).owner).toBe('admin');
    clearPanelNav('admin');
    expect(get(panelNav).owner).toBe(null);
    expect(get(panelNav).items).toEqual([]);
  });
});

describe('panelNav — onglets d’une section, rubriques repliables', () => {
  const items = [
    { id: 'profile', label: 'Mon profil' },
    { id: 'actions', label: 'Actions' },
  ];

  beforeEach(() => {
    clearPanelNav('config');
    clearPanelNav('admin');
  });

  it('une section peut être visée SUR un onglet — « Entreposer » dans « Actions »', () => {
    registerPanelNav('config', { title: 'Réglages', items, active: 'profile' });
    selectPanelSection('actions', 'storage');
    expect(get(panelNav)).toMatchObject({ active: 'actions', sub: 'storage' });

    // Revenir à la section depuis la colonne repart de son premier onglet.
    selectPanelSection('actions');
    expect(get(panelNav).sub).toBe('');
  });

  it('l’onglet visé survit au montage du panneau et à un ré-enregistrement', () => {
    // Raccourci pris AVANT le montage (owner `null`), comme un deep-link.
    selectPanelSection('actions', 'storage');
    registerPanelNav('config', { title: 'Réglages', items, active: 'profile' });
    expect(get(panelNav)).toMatchObject({ active: 'actions', sub: 'storage' });
    registerPanelNav('config', { title: 'Settings', items, active: 'profile' });
    expect(get(panelNav)).toMatchObject({ active: 'actions', sub: 'storage' });
  });

  it('changer de panneau oublie l’onglet de l’ancien', () => {
    registerPanelNav('config', { title: 'Réglages', items, active: 'profile' });
    selectPanelSection('actions', 'storage');
    registerPanelNav('admin', { title: 'Administration', items: [], active: 'users' });
    expect(get(panelNav)).toMatchObject({ owner: 'admin', active: 'users', sub: '' });
  });

  it('`collapsible` demande des rubriques repliables, et se déclare à chaque fois', () => {
    registerPanelNav('admin', {
      title: 'Administration',
      items: [],
      active: 'users',
      collapsible: true,
    });
    expect(get(panelNav).collapsible).toBe(true);
    registerPanelNav('config', { title: 'Réglages', items, active: 'profile' });
    expect(get(panelNav).collapsible).toBe(false);
  });
});
