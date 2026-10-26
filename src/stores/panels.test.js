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
  });

  it('panelFromHash : deux panneaux, plus les alias de section', () => {
    expect(panelFromHash('#admin')).toBe('admin');
    expect(panelFromHash('#config')).toBe('config');
    expect(panelFromHash('#my-templates')).toBe('config');
    expect(panelFromHash('#my-tags')).toBe('config');
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
    registerPanelNav('config', { title: 'Ma configuration', items, active: 'audio' });
    expect(get(panelNav)).toEqual({
      owner: 'config',
      title: 'Ma configuration',
      items,
      active: 'audio',
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
