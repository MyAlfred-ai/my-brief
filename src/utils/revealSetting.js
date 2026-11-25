/**
 * Montrer un réglage sur l'écran ouvert : le trouver par son titre, déplier
 * ce qui le cache, le faire défiler jusqu'au milieu et l'allumer un instant.
 * C'est la seconde moitié d'une recherche dans les réglages : arriver sur la
 * bonne page ne suffit pas quand elle compte six cartes ou des tuiles
 * repliées (administration).
 *
 * Le réglage est cherché par le TEXTE de son titre, celui que la recherche a
 * affiché — les deux viennent du même libellé de uiText.js. Aucune ancre à
 * poser dans chaque écran : un titre renommé suit tout seul, une carte
 * ajoutée se trouve dès qu'elle entre au catalogue (config/settingsSearch.js).
 *
 * Ordre de recherche : les titres d'abord (h2–h6, legend), puis le libellé
 * d'un bouton qui DÉPLIE (tuile, pastille — `aria-expanded`), puis les
 * libellés de champs et onglets, enfin n'importe quel texte. Sans cet ordre,
 * l'aperçu des boutons de « Actions » (qui écrit « Envoyer par mail ») passait
 * avant la tuile du même nom.
 *
 * L'écran peut n'être pas encore là (page qui charge, panneau qui s'ouvre) :
 * la recherche réessaie quelques instants, puis renonce sans bruit — la page,
 * elle, est ouverte.
 */

const TIERS = [
  'h2, h3, h4, h5, h6, legend',
  '[aria-expanded] span, [aria-expanded]',
  'label, strong, dt, [role="tab"]',
  'button, span, p',
];

/** Zones qui répètent des libellés sans être le réglage : en-tête, déroulant mobile. */
const SKIPPED = '.shell-header, .pt';

/** Ce qui s'allume : la carte entière plutôt que son seul titre. */
const HOLDERS = 'section, fieldset, .dt, .dp, [aria-expanded]';

const FLASH_CLASS = 'settings-flash';

const sameText = (a, b) => a.replace(/\s+/g, ' ').trim() === b;

/**
 * Le premier élément de `root` dont le texte est exactement `text`, selon
 * l'ordre des TIERS.
 *
 * @param {ParentNode} root
 * @param {string} text
 * @returns {HTMLElement|null}
 */
export function findSettingElement(root, text) {
  const wanted = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!wanted || !root) return null;
  for (const selector of TIERS) {
    for (const el of root.querySelectorAll(selector)) {
      if (el.closest(SKIPPED)) continue;
      if (sameText(el.textContent || '', wanted)) return /** @type {HTMLElement} */ (el);
    }
  }
  return null;
}

let cancelPending = () => {};

/**
 * Cherche le réglage titré `text` dans le panneau ouvert, et le montre.
 * Un nouvel appel annule le précédent s'il cherchait encore.
 *
 * @param {string} text
 * @param {{root?: Document|HTMLElement, timeoutMs?: number, intervalMs?: number,
 *   flashMs?: number}} [options]
 * @returns {Promise<HTMLElement|null>} l'élément allumé, ou null
 */
export function revealSetting(
  text,
  { root = document, timeoutMs = 3000, intervalMs = 100, flashMs = 2000 } = {},
) {
  cancelPending();

  const scope = () =>
    root instanceof Document || root === document
      ? document.querySelector('.shell-panel') || document.body
      : root;

  return new Promise((resolve) => {
    const started = Date.now();
    let unfolded = false;
    let timer = null;
    cancelPending = () => {
      clearTimeout(timer);
      resolve(null);
    };

    const attempt = () => {
      const el = findSettingElement(scope(), text);
      if (!el) {
        if (Date.now() - started >= timeoutMs) return resolve(null);
        timer = setTimeout(attempt, intervalMs);
        return;
      }
      // Tuile ou pastille repliée : on la déplie, puis on cherche à nouveau —
      // le panneau déplié porte souvent le même titre, c'est lui qu'on montre.
      const disclosure = el.closest('[aria-expanded]');
      if (disclosure && disclosure.getAttribute('aria-expanded') === 'false' && !unfolded) {
        unfolded = true;
        /** @type {HTMLElement} */ (disclosure).click();
        timer = setTimeout(attempt, 0);
        return;
      }
      const holder = /** @type {HTMLElement} */ (el.closest(HOLDERS) || el);
      cancelPending = () => {};
      show(holder, flashMs);
      resolve(holder);
    };
    attempt();
  });
}

function show(el, flashMs) {
  const calm = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  el.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  // Relancer l'animation si le même réglage est montré deux fois de suite.
  el.classList.remove(FLASH_CLASS);
  void el.offsetWidth;
  el.classList.add(FLASH_CLASS);
  setTimeout(() => el.classList.remove(FLASH_CLASS), flashMs);
}
