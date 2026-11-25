/**
 * Couleurs d'une infographie — celles de l'Apparence (primaire, secondaire),
 * et leurs déclinaisons calculées ICI, en hexadécimal.
 *
 * Pourquoi pas les jetons de tokens.css : l'export PNG passe par html2canvas,
 * qui sérialise chaque <svg> (pictogrammes, anneaux) en image isolée — une
 * variable CSS n'y existe plus. Les pictogrammes et graphiques reçoivent donc
 * des couleurs littérales, et le reste de la feuille les mêmes valeurs en
 * variables (`--ig-…`), pour qu'écran et PNG soient identiques.
 *
 * Aucune couleur de marque en dur : primaire et secondaire viennent du
 * réglage, ou des défauts que le store `branding` déclare déjà. Les couleurs
 * fixes ci-dessous sont des neutres et des couleurs SÉMANTIQUES (réussite,
 * vigilance, contre), qui ne suivent pas la marque — un avertissement reste
 * ambre sous une marque bleue, comme dans l'application (cf. branding.js).
 */
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  HEX_COLOR_PATTERN,
} from '../../stores/branding.js';

export const NEUTRALS = Object.freeze({
  paper: '#ffffff',
  ink: '#1b1e24',
  mute: '#5d6472',
  rule: '#e2e5ea',
  soft: '#f3f4f6',
});

export const SEMANTIC = Object.freeze({
  ok: '#1d7a4b',
  okSoft: '#e6f4ec',
  warn: '#9a5b13',
  warnSoft: '#fcf1e0',
  bad: '#b42318',
  badSoft: '#fdecea',
});

/** @returns {number[]} [r, g, b] */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]) {
  return `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Mélange : `t` = part de `b` (0 → a, 1 → b). */
export function mix(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}

function luminance(color) {
  const [r, g, b] = rgb(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Texte posé sur `background` : blanc ou encre, celui qui se lit le mieux. */
export function readableOn(background) {
  return contrast(background, NEUTRALS.paper) >= contrast(background, NEUTRALS.ink)
    ? NEUTRALS.paper
    : NEUTRALS.ink;
}

/**
 * La couleur, assombrie juste assez pour se lire en texte sur blanc (4,5:1) :
 * un orange vif sert les aplats, pas les titres.
 */
export function inkVariant(color, min = 4.5) {
  let out = color;
  for (let step = 1; step <= 12 && contrast(out, NEUTRALS.paper) < min; step += 1) {
    out = mix(color, NEUTRALS.ink, step * 0.08);
  }
  return out;
}

const valid = (value) => HEX_COLOR_PATTERN.test(String(value || '').trim());

const lighten = (color, t) => mix(color, NEUTRALS.paper, t);
const darken = (color, t) => mix(color, NEUTRALS.ink, t);

/** `rgba()` d'une couleur, pour les ombres teintées (CSS seulement, jamais un <svg>). */
function rgba(color, alpha) {
  const [r, g, b] = rgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Les deux extrémités du dégradé du bandeau, et la couleur de son texte.
 *
 * Le dégradé part de la couleur de marque vers une teinte plus PROFONDE quand
 * le texte est blanc (marque foncée), vers une teinte plus CLAIRE quand il est
 * encre (marque claire, comme l'orange d'origine) : dans les deux cas, le
 * texte garde son contraste d'un bout à l'autre du bandeau.
 */
function heroGradient(p, onP) {
  if (onP === NEUTRALS.paper) {
    const to = lighten(p, 0.12);
    return { from: darken(p, 0.25), to: contrast(to, onP) >= 4.5 ? to : p };
  }
  const to = darken(p, 0.06);
  return { from: lighten(p, 0.2), to: contrast(to, onP) >= 4.5 ? to : p };
}

/** Pictogramme posé sur un dégradé `from → to` : blanc s'il s'y voit (3:1), sinon encre. */
function iconOn(from, to) {
  return contrast(NEUTRALS.paper, mix(from, to, 0.5)) >= 3 ? NEUTRALS.paper : NEUTRALS.ink;
}

/**
 * Palette complète d'une infographie.
 * @param {{primaryColor?: string, secondaryColor?: string}} [brand] - le store `branding`
 */
export function infographicPalette({ primaryColor = '', secondaryColor = '' } = {}) {
  const p = (valid(primaryColor) ? primaryColor : DEFAULT_PRIMARY_COLOR).trim().toLowerCase();
  const s = (valid(secondaryColor) ? secondaryColor : DEFAULT_SECONDARY_COLOR).trim().toLowerCase();
  const onP = readableOn(p);
  const hero = heroGradient(p, onP);
  const pDeep = darken(p, 0.3);
  const pLight = lighten(p, 0.22);
  const sDeep = darken(s, 0.28);
  const sLight = lighten(s, 0.2);
  return {
    ...NEUTRALS,
    ...SEMANTIC,
    p,
    s,
    onP,
    onS: readableOn(mix(s, sDeep, 0.5)),
    pInk: inkVariant(p),
    sInk: inkVariant(s),
    pSoft: lighten(p, 0.9),
    pWash: lighten(p, 0.955),
    pMid: lighten(p, 0.72),
    sSoft: lighten(s, 0.86),
    pDeep,
    pLight,
    sDeep,
    sLight,
    okLight: lighten(SEMANTIC.ok, 0.25),
    warnLight: lighten(SEMANTIC.warn, 0.25),
    heroFrom: hero.from,
    heroTo: hero.to,
    onHero: onP,
    glass: mix(hero.to, onP, 0.16),
    // Filigrane de la couverture : un cran plus présent que le verre.
    glassStrong: mix(hero.to, onP, 0.26),
    // Pied de page : un bandeau sombre teinté de la marque, texte blanc.
    footFrom: mix(pDeep, NEUTRALS.ink, 0.55),
    footTo: NEUTRALS.ink,
    heroTrack: mix(hero.from, onP, 0.3),
    iconOnP: iconOn(p, pDeep),
    iconOnS: iconOn(s, sDeep),
    heroDisc: mix(p, onP, 0.2),
    // Ombres teintées : CSS seulement (une variable CSS, jamais dans un <svg>).
    shadowP: rgba(p, 0.38),
    shadowS: rgba(s, 0.38),
  };
}

const VAR_NAMES = {
  paper: 'paper',
  ink: 'ink',
  mute: 'mute',
  rule: 'rule',
  soft: 'soft',
  ok: 'ok',
  okSoft: 'ok-soft',
  okLight: 'ok-light',
  warn: 'warn',
  warnSoft: 'warn-soft',
  warnLight: 'warn-light',
  bad: 'bad',
  badSoft: 'bad-soft',
  p: 'p',
  s: 's',
  onP: 'on-p',
  onS: 'on-s',
  pInk: 'p-ink',
  sInk: 's-ink',
  pSoft: 'p-soft',
  pWash: 'p-wash',
  pMid: 'p-mid',
  sSoft: 's-soft',
  pDeep: 'p-deep',
  pLight: 'p-light',
  sDeep: 's-deep',
  sLight: 's-light',
  heroFrom: 'hero-from',
  heroTo: 'hero-to',
  onHero: 'on-hero',
  glass: 'glass',
  glassStrong: 'glass-strong',
  footFrom: 'foot-from',
  footTo: 'foot-to',
  iconOnP: 'on-grad-p',
  iconOnS: 'on-grad-s',
  heroTrack: 'hero-track',
  heroDisc: 'hero-disc',
  shadowP: 'shadow-p',
  shadowS: 'shadow-s',
};

/** Les mêmes couleurs en variables CSS, pour l'attribut `style` de la feuille. */
export function paletteStyle(palette) {
  return Object.entries(VAR_NAMES)
    .map(([key, name]) => `--ig-${name}:${palette[key]}`)
    .join(';');
}
