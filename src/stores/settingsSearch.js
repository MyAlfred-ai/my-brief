/**
 * Recherche dans les réglages — l'état partagé entre le champ
 * (SettingsSearchField) et sa liste de résultats (SettingsSearchResults).
 *
 * Deux composants plutôt qu'un : sur ordinateur, le champ prend la place de
 * la recherche de l'historique, sous « Nouvelle réunion », et les résultats
 * celle des sections, plus bas dans la colonne. Ils ne sont pas voisins dans
 * le DOM — d'où cet état commun : la saisie, la ligne choisie au clavier, et
 * les résultats qu'en tire le catalogue (config/settingsSearch.js).
 *
 * Ce que la recherche voit dépend du compte et de l'écran : les entrées de la
 * colonne ouverte (une page absente de la colonne n'est pas proposée), les
 * pages de l'administration pour un administrateur, la carte du mot de passe
 * pour un compte qui en a un.
 */
import { derived, get, writable } from 'svelte/store';
import { uiText } from '../store.js';
import { auth } from './auth.js';
import { myBrain } from './myBrain.js';
import { aiHelp } from './aiHelp.js';
import { openPanel, panelNav, selectPanelSection } from './panels.js';
import { buildSettingsIndex } from '../config/settingsSearch.js';
import { visibleConfigSections } from '../config/configSections.js';
import { prepareSearchIndex, searchSettings } from '../utils/settingsSearch.js';
import { revealSetting } from '../utils/revealSetting.js';
import { accountView } from '../utils/userIdentity.js';
import { currentAudioCaptureSupport } from '../utils/browserAudioSupport.js';
import { isNative } from '../platform/index.js';

/** Au-delà, la liste déborde de la colonne sans rien apprendre de plus. */
const LIMIT = 12;

/** Ce que la personne tape. */
export const settingsQuery = writable('');

/** Ligne choisie au clavier (↑ ↓), remise en tête à chaque frappe. */
export const settingsActive = writable(0);
settingsQuery.subscribe(() => settingsActive.set(0));

// « Son de l'ordinateur » n'existe que dans Firefox et Safari sur ordinateur
// (SettingsPanel) : lu une fois, le navigateur ne change pas en cours de route.
let systemAudio = null;
function systemAudioOffered() {
  if (systemAudio === null) {
    try {
      const support = currentAudioCaptureSupport();
      systemAudio = !!(support.desktop && !support.shareAudio);
    } catch {
      systemAudio = false;
    }
  }
  return systemAudio;
}

/** Le panneau ouvert, et les entrées que la recherche peut proposer. */
const searchIndex = derived(
  [uiText, panelNav, auth, myBrain, aiHelp],
  ([$t, $nav, $auth, $brain, $aiHelp]) => {
    const me = accountView($auth.user);
    // Depuis « Réglages », la colonne enregistrée dit exactement ce qui est
    // affiché. Depuis l'administration, on la recalcule — sans « Comptes
    // connectés », dont la présence dépend d'un appel que seul « Réglages »
    // fait.
    const configSections =
      $nav.owner === 'config'
        ? $nav.items
        : visibleConfigSections({
            feedbackUrl: $auth.capabilities?.feedbackUrl,
            docsUrl: $auth.capabilities?.docsUrl,
            signedIn: !!me.name,
          });
    const entries = buildSettingsIndex($t, {
      configSections,
      admin: me.isAdmin,
      myBrain: !!$brain.available,
      // L'Aide IA n'est plus une entrée de la colonne mais un onglet de deux
      // pages : son droit ne se lit plus dans `configSections`.
      aiHelp: !!$aiHelp.available,
      browser: !isNative,
      password: me.canChangePassword,
      systemAudio: systemAudioOffered(),
    });
    return { owner: $nav.owner, index: prepareSearchIndex(entries) };
  },
);

/**
 * Les résultats de la saisie, les meilleurs d'abord. Une entrée de l'AUTRE
 * panneau porte son nom en tête de chemin (`trail`) : « Administration ›
 * Organisation › Marque & apparence ».
 */
export const settingsResults = derived(
  [settingsQuery, searchIndex, uiText],
  ([$query, { owner, index }, $t]) => {
    if (!$query.trim()) return [];
    const panelTitle = { config: $t.config.title, admin: $t.buttons.administration };
    return searchSettings(index, $query, {
      limit: LIMIT,
      // À égalité, la page du panneau ouvert d'abord.
      boost: (entry) => (entry.panel === owner ? 0.5 : 0),
    }).map((entry) => ({
      ...entry,
      elsewhere: entry.panel !== owner,
      trail: entry.panel === owner ? entry.path : [panelTitle[entry.panel], ...entry.path],
    }));
  },
);

/** Vide la saisie (fermeture du panneau, Échap, choix d'un résultat). */
export function clearSettingsSearch() {
  settingsQuery.set('');
}

/**
 * Ouvre le réglage choisi : sa page (et son onglet), dans l'autre panneau
 * s'il le faut, puis le montre à l'écran. Un LIEN (« Aide ») s'ouvre dans un
 * nouvel onglet.
 *
 * @param {{panel: string, section: string, sub?: string, href?: string, reveal?: string}} result
 */
export function goToSetting(result) {
  clearSettingsSearch();
  if (!result) return;
  if (result.href) {
    window.open(result.href, '_blank', 'noopener,noreferrer');
    return;
  }
  if (get(panelNav).owner === result.panel) selectPanelSection(result.section, result.sub || '');
  else openPanel(/** @type {'config'|'admin'} */ (result.panel), result.section, result.sub || '');
  if (result.reveal) revealSetting(result.reveal);
}
