/**
 * Export PNG d'une infographie en gabarit — ce que télécharge « Télécharger
 * l'infographie », comme l'image des infographies d'avant.
 *
 * La feuille est rendue HORS ÉCRAN à une largeur fixe (1 080 px, ×2 : une
 * image de 2 160 px de large), puis photographiée par html2canvas-pro — la
 * même bibliothèque que le PDF image (utils/pdf.js), chargée à la demande.
 * Les unités `cqw` de la feuille font qu'elle est identique, en proportions,
 * à ce que montre la visionneuse.
 *
 * Avant la photo : polices chargées (Lexend), logo décodé et page ajustée au
 * format A4 (`fit`) — sinon la capture part avec la police de repli, sans
 * logo, ou avec un contenu qui déborde de la page.
 */
import { tick } from 'svelte';
import InfographicSheet from '../../components/infographic/InfographicSheet.svelte';

/** Largeur de rendu, en pixels CSS, et facteur de l'image finale. */
export const EXPORT_WIDTH = 1080;
export const EXPORT_SCALE = 2;

/**
 * Remplace une image par sa version bitmap, déjà mise à la taille de sa boîte
 * (« contain », calée à gauche — comme le CSS de .ig-logo).
 *
 * Pourquoi : un logo SVG sans largeur ni hauteur propres (le cas courant :
 * un `viewBox` seul) s'affiche bien à l'écran, mais html2canvas le dessine à
 * partir de ses dimensions intrinsèques — nulles — et le PNG sortait SANS logo
 * (constaté au banc d'essai). Une image bitmap de la taille exacte de la boîte
 * ne laisse plus rien à interpréter.
 */
async function rasterize(img, scale) {
  const box = img.getBoundingClientRect();
  if (!box.width || !box.height) return;
  let ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
  if (!ratio) ratio = svgRatio(img.currentSrc || img.src) || box.width / box.height;
  const w = Math.round(box.width * scale);
  const h = Math.round(box.height * scale);
  const drawW = Math.min(w, h * ratio);
  const drawH = drawW / ratio;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  try {
    canvas.getContext('2d').drawImage(img, 0, (h - drawH) / 2, drawW, drawH);
    const png = canvas.toDataURL('image/png');
    img.style.objectFit = 'fill';
    img.src = png;
    await (img.decode ? img.decode().catch(() => {}) : null);
  } catch {
    // Canevas refusé (image d'un autre domaine) : on garde l'image d'origine.
  }
}

/** Proportions d'un SVG en data-URL, lues dans son viewBox — 0 si inconnues. */
function svgRatio(src) {
  const m = /^data:image\/svg\+xml(;base64)?[^,]*,(.*)$/s.exec(String(src || ''));
  if (!m) return 0;
  let text = '';
  try {
    text = m[1] ? atob(m[2]) : decodeURIComponent(m[2]);
  } catch {
    return 0;
  }
  const box = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  return box && Number(box[2]) > 0 ? Number(box[1]) / Number(box[2]) : 0;
}

/**
 * @param {{layout: object, brand?: object, companyLogo?: string, appLogo?: string, tagLogo?: string}} params
 * @returns {Promise<Blob>} l'image PNG
 */
export async function renderInfographicPng({
  layout,
  brand = {},
  companyLogo = '',
  appLogo = '',
  tagLogo = '',
}) {
  const { default: html2canvas } = await import('html2canvas-pro');

  const host = document.createElement('div');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    width: `${EXPORT_WIDTH}px`,
    pointerEvents: 'none',
  });
  document.body.appendChild(host);
  const sheet = new InfographicSheet({
    target: host,
    props: { layout, brand, companyLogo, appLogo, tagLogo },
  });

  try {
    await tick();
    if (document.fonts?.ready) await document.fonts.ready;
    const images = [...host.querySelectorAll('img')];
    await Promise.all(images.map((img) => (img.decode ? img.decode().catch(() => {}) : null)));
    await Promise.all(images.map((img) => rasterize(img, EXPORT_SCALE)));
    // La page A4 s'est ajustée au montage ; on attend la même mesure, faite
    // ici à la largeur d'export, avant la photo.
    await sheet.fit();
    const target = host.querySelector('.ig-sheet');
    const canvas = await html2canvas(target, {
      scale: EXPORT_SCALE,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('infographic_png_failed'))),
        'image/png',
      ),
    );
  } finally {
    sheet.$destroy();
    host.remove();
  }
}
