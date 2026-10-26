/**
 * Apparence de l'installation — logo, phrase d'accueil, couleurs primaire et
 * secondaire — réglée depuis l'administration (onglet « Configuration ») et
 * servie à tout le monde par la sonde publique GET /api/auth/config
 * (`capabilities.branding` du store auth) : elle habille aussi l'écran de
 * connexion, avant toute identité.
 *
 * Les couleurs s'appliquent en SURCHARGEANT les variables CSS de marque sur
 * <html> : tokens.css (--brand*, --brand-rgb, --brand-secondary-rgb) et
 * style.css (--mb-orange*, --mb-amber) gardent leurs valeurs par défaut dans
 * les feuilles — retirer la surcharge suffit à revenir aux oranges d'origine,
 * aucun recalcul de styles à écrire.
 *
 * Primaire et secondaire ne demandent pas le même travail :
 *   - la PRIMAIRE porte des déclinaisons (survol, texte, halos), dérivées de la
 *     teinte choisie par assombrissement RGB — moins juste perceptuellement
 *     que l'oklch des défauts, mais stable et suffisant pour des accents ;
 *   - la SECONDAIRE porte toutes les surfaces claires (fonds de cartes, fonds
 *     d'onglets, badges), leurs bordures et la teinte des neutres : tout ce qui
 *     l'utilise part de --brand-secondary-rgb (cf. tokens.css et les jetons
 *     `--mb-bg-…` / `--mb-border-…` de style.css), donc UNE surcharge suffit.
 */
import { derived } from 'svelte/store';
import { auth } from './auth.js';

/** L'orange intégré — la valeur de `--mb-orange` (style.css). */
export const DEFAULT_PRIMARY_COLOR = '#f38400';
/** L'orange clair intégré — la valeur de `--brand-secondary` (styles/tokens.css). */
export const DEFAULT_SECONDARY_COLOR = '#ffaf00';
/** Le seul format accepté : celui que rend le sélecteur de couleur natif. */
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/** Ce que lisent les composants : toujours tous les champs, même vides. */
export const branding = derived(auth, ($auth) => ({
  logo: '',
  tagline: '',
  taglineEn: '',
  primaryColor: '',
  secondaryColor: '',
  ...($auth.capabilities?.branding || {}),
}));

/**
 * Phrase d'accueil de l'administration dans la langue de l'interface — '' si
 * aucune n'est posée (l'appelant affiche alors la phrase intégrée, traduite).
 *
 * En anglais, la phrase anglaise ; à défaut, la française TELLE QUELLE : c'est
 * une phrase de marque, posée par l'organisation, qu'on ne remplace pas par la
 * phrase générique de l'application. Même règle que le nom d'un template.
 *
 * @param {{tagline?: string, taglineEn?: string}} brand - le store `branding`
 * @param {string} lang - 'fr' | 'en'
 * @returns {string}
 */
export function brandingTagline(brand, lang) {
  return (lang === 'en' && brand?.taglineEn) || brand?.tagline || '';
}

/** Variables surchargées sur <html> — la liste sert aussi au retrait. */
const BRAND_VARS = [
  '--brand-rgb',
  '--brand',
  '--brand-strong',
  '--brand-text',
  '--brand-text-strong',
  '--brand-soft-08',
  '--brand-soft-12',
  '--brand-soft-15',
  '--brand-soft-18',
  '--mb-orange',
  '--mb-orange-10',
  '--mb-orange-20',
];

/** @returns {{r: number, g: number, b: number}|null} null si ce n'est pas un #rrggbb */
function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const value = parseInt(m[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** Assombrit la teinte (facteur < 1) — déclinaisons survol/texte. */
function shade({ r, g, b }, factor) {
  const dim = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${dim(r)} ${dim(g)} ${dim(b)})`;
}

/**
 * Applique (ou retire) la couleur primaire personnalisée.
 *
 * Idempotente et appelée en réactif depuis App.svelte : chaque réponse de
 * /api/auth/config repasse ici. `''` (ou une valeur invalide) retire la
 * surcharge — les feuilles reprennent la main avec l'orange par défaut.
 *
 * Les facteurs d'assombrissement approchent les rapports de clarté des
 * jetons par défaut (brand L71 → strong L63 → text L55 → text-strong L50).
 */
function applyPrimaryColor(hex) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const rgb = hexToRgb(hex);

  if (!rgb) {
    for (const name of BRAND_VARS) root.style.removeProperty(name);
    if (themeMeta) themeMeta.setAttribute('content', DEFAULT_PRIMARY_COLOR);
    return;
  }

  const { r, g, b } = rgb;
  const channels = `${r} ${g} ${b}`;
  const alpha = (a) => `rgb(${channels} / ${a})`;

  root.style.setProperty('--brand-rgb', channels);
  root.style.setProperty('--brand', `rgb(${channels})`);
  root.style.setProperty('--brand-strong', shade(rgb, 0.87));
  root.style.setProperty('--brand-text', shade(rgb, 0.75));
  root.style.setProperty('--brand-text-strong', shade(rgb, 0.66));
  root.style.setProperty('--brand-soft-08', alpha(0.08));
  root.style.setProperty('--brand-soft-12', alpha(0.12));
  root.style.setProperty('--brand-soft-15', alpha(0.15));
  root.style.setProperty('--brand-soft-18', alpha(0.18));
  root.style.setProperty('--mb-orange', `rgb(${channels})`);
  root.style.setProperty('--mb-orange-10', alpha(0.1));
  root.style.setProperty('--mb-orange-20', alpha(0.2));
  // Barre d'onglets mobile (PWA/Capacitor) : suit la couleur choisie.
  if (themeMeta) themeMeta.setAttribute('content', String(hex).toLowerCase());
}

/**
 * Applique (ou retire) la couleur secondaire personnalisée.
 *
 * UNE seule variable à surcharger : `--brand-secondary`, `--mb-amber`, les
 * voiles `--brand-secondary-soft-…`, les fonds `--mb-bg-…`, les bordures
 * `--mb-border-…` et les neutres `--ink-…` / `--line-…` en dérivent dans les
 * feuilles (cf. styles/tokens.css et style.css). Un littéral réintroduit
 * quelque part serait donc l'endroit qui « ne change pas de couleur » chez le
 * premier client qui la personnalise.
 *
 * Ce qui NE suit délibérément pas la secondaire : les couleurs sémantiques
 * (--danger-…, --success-…, --warn-…) et la palette fermée des tags — un
 * avertissement doit rester ambre même sous une marque bleue.
 */
function applySecondaryColor(hex) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const rgb = hexToRgb(hex);
  if (!rgb) {
    root.style.removeProperty('--brand-secondary-rgb');
    return;
  }
  root.style.setProperty('--brand-secondary-rgb', `${rgb.r} ${rgb.g} ${rgb.b}`);
}

/**
 * Point d'entrée unique, câblé en réactif depuis App.svelte sur le store
 * `branding` : les deux couleurs partent de la même sonde publique et doivent
 * être appliquées (ou retirées) ensemble, sinon un thème à moitié
 * personnalisé survivrait à un retour au défaut de l'autre moitié.
 *
 * @param {{primaryColor?: string, secondaryColor?: string}} colors
 */
export function applyBrandColors({ primaryColor = '', secondaryColor = '' } = {}) {
  applyPrimaryColor(primaryColor);
  applySecondaryColor(secondaryColor);
}
