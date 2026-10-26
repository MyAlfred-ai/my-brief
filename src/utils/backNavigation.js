/**
 * Bouton retour d'Android : QUE fermer ?
 *
 * Sans écouteur, Capacitor 8 ne fait rien d'utile de ce bouton : il remonte
 * l'historique de la WebView s'il en a un (des hash de panneaux déjà
 * refermés — un appui « mort »), sinon il l'avale. Il ne fermait donc ni une
 * fenêtre, ni le menu « Partager », ni le tiroir d'historique : le geste que
 * tout utilisateur d'Android fait en premier ne marchait nulle part.
 *
 * Règle : on ferme le calque du DESSUS, un seul par appui, avec le geste que
 * sa propre interface propose déjà (fond touché = Annuler, bouton Fermer,
 * touche hors du menu) ; quand plus rien n'est ouvert, l'app passe en
 * arrière-plan, comme à la racine de toute app Android. Jamais `exitApp()` :
 * une réunion en cours doit survivre (service foreground), et c'est ce que
 * garantit `minimizeApp()` — l'activité reste vivante, la WebView aussi.
 *
 * Deux fenêtres ne se ferment PAS au retour, parce que les fermer déciderait à
 * la place de l'utilisateur :
 *   - « Toujours en réunion ? » : toute fermeture y vaut « Arrêter et
 *     sauvegarder » (spec de l'invite) — un appui accidentel couperait la
 *     réunion ;
 *   - « Réunion interrompue » : toucher le fond y vaut « Abandonner ».
 * Idem pour le changement de mot de passe imposé, qui n'a pas de sortie.
 *
 * Pourquoi une table plutôt qu'un Échap pour tout : App.svelte referme « Ma
 * configuration » sur N'IMPORTE quel Échap, avant les fenêtres qu'elle
 * contient — un Échap envoyé pour fermer un menu du panneau refermait le
 * panneau entier. Échap n'est donc utilisé que là où rien d'autre n'écoute.
 *
 * L'ordre de la table fait foi (le premier calque présent gagne) : du plus
 * haut au plus bas dans l'empilement, pas l'ordre du DOM — un menu du tiroir
 * est AVANT le fond du tiroir dans le DOM, mais au-dessus à l'écran.
 * Un calque ajouté à l'app sans entrée ici se ferme par son voisin du dessous,
 * ou pas du tout : l'ajouter.
 */

/**
 * @typedef {'ignore'|'minimize'|'self'|'outside'|'escape'} BackActionKind
 *   - `ignore`   : ne rien faire (décision obligatoire) ;
 *   - `minimize` : passer l'app en arrière-plan ;
 *   - `self`     : toucher le calque lui-même — son fond, qui vaut « Annuler »
 *                  ou « Fermer » ;
 *   - `outside`  : toucher hors du menu (les menus se ferment au clic ailleurs) ;
 *   - `escape`   : Échap, pour les bulles qui l'écoutent, hors des panneaux.
 * @typedef {{selector: string, action: BackActionKind|{click: string}}} BackLayer
 *   `{click}` : toucher le DERNIER élément visible correspondant — les panneaux
 *   s'emboîtent (éditeur de template dans « Ma configuration ») et le dernier
 *   dans le DOM est celui du dessus.
 */

/** @type {BackLayer[]} */
export const BACK_LAYERS = [
  // ── Décisions obligatoires ─────────────────────────────────────────────
  { selector: '.continue-prompt-backdrop', action: 'ignore' },
  { selector: '[aria-labelledby="resume-session-modal-title"]', action: 'ignore' },
  { selector: '.cp-backdrop-locked', action: 'ignore' },
  // ── Écran de connexion de l'app : c'est la racine ──────────────────────
  { selector: '.native-login-gate', action: 'minimize' },
  // ── Petites fenêtres, au-dessus de tout ────────────────────────────────
  { selector: '.disconnected-modal-backdrop', action: { click: '.disconnected-modal-dismiss' } },
  { selector: '.ap-backdrop', action: 'self' },
  { selector: '.delete-modal-backdrop', action: 'self' },
  { selector: '.tgp-modal-backdrop', action: 'self' },
  { selector: '.du-backdrop', action: 'self' },
  { selector: '.trd-backdrop', action: 'self' },
  { selector: '.asd-backdrop', action: 'self' },
  { selector: '.fp-backdrop', action: 'self' },
  { selector: '.cp-backdrop', action: 'self' },
  { selector: '.au-generated', action: { click: '.au-generated .au-primary' } },
  { selector: '.wn-backdrop', action: 'self' },
  { selector: '.welcome-modal-backdrop', action: 'self' },
  { selector: '.history-modal-backdrop', action: 'self' },
  // ── Menus et bulles ────────────────────────────────────────────────────
  { selector: '.ts-menu', action: 'outside' },
  { selector: '.pa-menu', action: 'outside' },
  { selector: '.pt-dd-menu', action: 'outside' },
  { selector: '.ctx-menu', action: 'outside' },
  { selector: '.sb-profile-menu', action: 'outside' },
  { selector: '.sb-tagmenu', action: 'outside' },
  { selector: '.te-help-popover', action: { click: '.te-help-btn[aria-expanded="true"]' } },
  { selector: '.spk-pop', action: 'escape' },
  { selector: '.md-link-popover', action: 'escape' },
  // ── Plein écran : visionneuse, fin de réunion, actions et notes ────────
  { selector: '.igc-lightbox', action: 'self' },
  { selector: '.mes-backdrop', action: 'self' },
  { selector: '.mobile-actions-modal-backdrop', action: 'self' },
  // ── Choix du template, panneaux, tiroir d'historique ───────────────────
  { selector: '.tpp', action: 'escape' },
  { selector: '.shell-overlay', action: { click: '.shell-close' } },
  { selector: '.sidebar-backdrop', action: 'self' },
];

/** Un élément masqué (`display: none` par une media query…) n'a aucune boîte. */
const hasBox = (el) => el.getClientRects().length > 0;

function lastMatch(root, selector, isVisible) {
  const found = [...root.querySelectorAll(selector)].filter(isVisible);
  return found.length ? found[found.length - 1] : null;
}

/**
 * @param {ParentNode} root - le document
 * @param {{isVisible?: (el: Element) => boolean, layers?: BackLayer[]}} [opts]
 * @returns {{action: 'ignore'|'minimize'|'outside'|'escape'} |
 *   {action: 'click', target: Element}}
 */
export function resolveBackAction(root, { isVisible = hasBox, layers = BACK_LAYERS } = {}) {
  for (const { selector, action } of layers) {
    const layer = lastMatch(root, selector, isVisible);
    if (!layer) continue;
    if (action === 'self') return { action: 'click', target: layer };
    if (typeof action === 'object') {
      const target = lastMatch(root, action.click, isVisible);
      // Bouton introuvable (markup changé) : Échap, plutôt qu'un retour muet.
      return target ? { action: 'click', target } : { action: 'escape' };
    }
    return { action };
  }
  return { action: 'minimize' };
}

/**
 * Exécute la décision. Échap part de l'élément qui a le focus (le champ d'un
 * lien en cours de saisie, par exemple) et remonte jusqu'à `window`.
 *
 * @param {ReturnType<typeof resolveBackAction>} decision
 * @param {{minimize: () => void, doc?: Document}} ports
 */
export function performBackAction(decision, { minimize, doc = document }) {
  if (decision.action === 'click') decision.target.click();
  else if (decision.action === 'outside') doc.body.click();
  else if (decision.action === 'minimize') minimize();
  else if (decision.action === 'escape') {
    const from = doc.activeElement || doc.body;
    const init = { key: 'Escape', bubbles: true, cancelable: true };
    from.dispatchEvent(new KeyboardEvent('keydown', init));
  }
}
