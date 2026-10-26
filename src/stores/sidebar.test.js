// @vitest-environment jsdom
/**
 * Barre latérale : tiroir jusqu'à 1100 px (repliée au démarrage, refermée après
 * un choix), colonne au-delà. Le bug d'origine : à 820 px elle s'ouvrait en
 * colonne et ne laissait que ~150 px au document.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';

const realWidth = window.innerWidth;
const setWidth = (w) =>
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });

/** Le store lit la largeur à l'import : un module neuf par largeur de départ. */
async function load(width) {
  setWidth(width);
  vi.resetModules();
  return import('./sidebar.js');
}

afterEach(() => setWidth(realWidth));

describe('sidebar store', () => {
  it.each([
    [375, false],
    [820, false], // iPad en portrait
    [1024, false],
    [1100, false],
    [1101, true],
    [1280, true],
  ])('à %i px, ouverte au démarrage : %s', async (width, open) => {
    const { sidebarOpen } = await load(width);
    expect(get(sidebarOpen)).toBe(open);
  });

  it('passer le seuil referme ou rouvre ; en deçà, le choix de l’utilisateur tient', async () => {
    const { openAfterResize } = await load(1280);
    expect(openAfterResize(true, 1280, 1000)).toBe(false);
    expect(openAfterResize(false, 820, 1180)).toBe(true); // iPad : portrait → paysage
    expect(openAfterResize(true, 900, 1000)).toBe(true); // ouverte à la main, fenêtre étirée
    expect(openAfterResize(false, 1300, 1200)).toBe(false); // repliée à la main
    expect(openAfterResize(false, 375, 900)).toBe(false); // téléphone → tablette : tiroir des deux côtés
  });

  it('suit les redimensionnements de la fenêtre', async () => {
    const { sidebarOpen, syncSidebarToWidth } = await load(1280);
    setWidth(820);
    syncSidebarToWidth();
    expect(get(sidebarOpen)).toBe(false);
    setWidth(1180);
    syncSidebarToWidth();
    expect(get(sidebarOpen)).toBe(true);
  });

  it('un choix fait dans la barre la referme en tiroir, pas en colonne', async () => {
    const { sidebarOpen, closeSidebarDrawer, toggleSidebar } = await load(820);
    toggleSidebar();
    expect(get(sidebarOpen)).toBe(true);
    closeSidebarDrawer();
    expect(get(sidebarOpen)).toBe(false);

    setWidth(1280);
    sidebarOpen.set(true);
    closeSidebarDrawer();
    expect(get(sidebarOpen)).toBe(true);
  });
});
