import { writable, derived } from 'svelte/store';
import { uiTextData } from './config/uiText.js';

// Store pour la langue courante
const initialLanguage = localStorage.getItem('mybrief_language') || 'fr';
export const currentLanguageStore = writable(initialLanguage);

// Niveau audio micro (0..1) pendant l'enregistrement. Alimenté par la boucle
// d'analyse audio (App) et lu par l'onde du Dock. Passe par un store plutôt
// qu'une prop : l'assignation se fait dans une fonction imbriquée, où la
// propagation de prop Svelte n'est pas fiable.
export const audioLevelStore = writable(0);

// Helper pour créer un store de traduction réactif
export function createTranslationStore(uiText) {
  return derived(currentLanguageStore, ($lang) => uiText[$lang]);
}

// Singleton: shared reactive translations for every component
export const uiText = createTranslationStore(uiTextData);

// <html lang> et titre de l'onglet suivent la langue choisie : index.html ne
// connaît que le français — lecteurs d'écran et onglet du navigateur restaient
// en français dans l'interface anglaise.
if (typeof document !== 'undefined') {
  currentLanguageStore.subscribe(($lang) => {
    document.documentElement.lang = $lang;
    const title = uiTextData[$lang]?.app?.documentTitle;
    if (title) document.title = title;
  });
}
