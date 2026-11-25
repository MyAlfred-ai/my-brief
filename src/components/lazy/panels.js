/**
 * Les écrans lourds, chargés à la demande (mesuré le 2026-11-13 : 44 % du
 * fichier JavaScript lu au démarrage) :
 *  - l'administration et les réglages — rarement ouverts, et seulement par
 *    qui les ouvre ;
 *  - l'éditeur du compte rendu (TipTap/ProseMirror, ~15 %), que les deux
 *    premiers partagent : main.js le précharge pendant un temps mort, pour
 *    qu'il soit là quand on ouvre un compte rendu.
 */
import { lazyComponent } from '../../utils/lazyComponent.js';

export const adminPanel = lazyComponent(() => import('../AdminPanel.svelte'));
export const settingsPanel = lazyComponent(() => import('../SettingsPanel.svelte'));
export const markdownEditor = lazyComponent(() => import('../MarkdownEditor.svelte'));
