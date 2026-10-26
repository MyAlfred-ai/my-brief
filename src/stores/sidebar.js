/**
 * Barre latérale (historique, ou sections des réglages) : ouverte ou repliée.
 *
 * Jusqu'à SIDEBAR_DRAWER_MAX_WIDTH, elle est un TIROIR — sur téléphone, masquée ;
 * entre téléphone et ordinateur (tablette en portrait, fenêtre étroite), un rail
 * d'icônes qui s'ouvre par-dessus la page (Sidebar.svelte). Elle y démarre
 * repliée, et se referme dès qu'un choix y est fait : le résultat s'affiche
 * dessous. Au-delà, elle est une colonne : ouverte au démarrage, elle reste
 * comme l'utilisateur l'a laissée.
 *
 * Remplace `isNarrow` / `checkNarrow` d'App.svelte, plafonné, qui ne
 * connaissaient que le téléphone : à 820 px, la barre ouverte poussait la page
 * et la colonne Actions/Notes ne laissait que ~150 px au document.
 */
import { writable } from 'svelte/store';
import { SIDEBAR_DRAWER_MAX_WIDTH } from '../config/constants.js';

const viewportWidth = () => (typeof window === 'undefined' ? Infinity : window.innerWidth);

/** @param {number} width */
export const isDrawerWidth = (width) => width <= SIDEBAR_DRAWER_MAX_WIDTH;

export const sidebarOpen = writable(!isDrawerWidth(viewportWidth()));

/**
 * État après un redimensionnement de `prev` à `next` px. Passer le seuil
 * referme (vers le tiroir) ou rouvre (vers la colonne) ; en deçà, le dernier
 * geste de l'utilisateur fait foi — une fenêtre qu'on étire de quelques pixels
 * ne doit pas défaire ce qu'il a choisi.
 * @param {boolean} open @param {number} prev @param {number} next
 */
export function openAfterResize(open, prev, next) {
  return isDrawerWidth(prev) === isDrawerWidth(next) ? open : !isDrawerWidth(next);
}

let lastWidth = viewportWidth();

/** `resize` de la fenêtre. */
export function syncSidebarToWidth() {
  const width = viewportWidth();
  sidebarOpen.update((open) => openAfterResize(open, lastWidth, width));
  lastWidth = width;
}

/** Un choix a été fait dans la barre : en tiroir, elle cache ce qu'il ouvre. */
export function closeSidebarDrawer() {
  if (isDrawerWidth(viewportWidth())) sidebarOpen.set(false);
}

export const toggleSidebar = () => sidebarOpen.update((open) => !open);
