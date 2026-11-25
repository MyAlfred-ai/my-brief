/**
 * Logos du PDF de résumé — celui de l'ENTREPRISE en tête, celui de MyBrief au
 * pied — préparés en PNG avant la mise en page.
 *
 * Pourquoi les redessiner : le logo d'entreprise est un data URL de n'importe
 * quel format accepté par Marque & apparence (PNG, JPEG, WebP, GIF, SVG), et
 * jsPDF n'écrit que du PNG ou du JPEG. Le canvas les ramène tous à un PNG,
 * transparence comprise, à une résolution d'impression : sa taille affichée
 * est fixée ICI, pour que la feuille du PDF ne déforme jamais un logo (un
 * `max-width` qui borne la largeur d'une image à hauteur fixe l'écraserait).
 */

/**
 * Plus grande boîte de même proportion que `natural` qui tient dans `max`.
 * Une image sans dimension propre (SVG sans `width`) prend toute la boîte.
 *
 * @param {{width: number, height: number}} natural
 * @param {{width: number, height: number}} max
 * @returns {{width: number, height: number}}
 */
export function fitBox(natural, max) {
  if (!(natural.width > 0) || !(natural.height > 0))
    return { width: max.width, height: max.height };
  const k = Math.min(max.width / natural.width, max.height / natural.height);
  return {
    width: Math.round(natural.width * k * 100) / 100,
    height: Math.round(natural.height * k * 100) / 100,
  };
}

/** Côté le plus long du PNG produit, en pixels : assez pour l'impression, sans alourdir le fichier. */
const MAX_PIXELS = 1200;

/**
 * Logo prêt pour le PDF, ou null s'il ne se charge pas (le document sort
 * alors sans lui : un logo manquant ne doit pas empêcher un compte rendu).
 *
 * @param {string} src - URL de l'image (data URL, ou asset de la même origine)
 * @param {{maxWidth: number, maxHeight: number, scale?: number}} box
 *   - boîte d'affichage en px CSS, et résolution visée (pixels par px CSS)
 * @returns {Promise<{data: string, width: number, height: number}|null>}
 *   - PNG en data URL, et sa taille d'affichage en px CSS
 */
export async function logoForPdf(src, { maxWidth, maxHeight, scale = 4 }) {
  if (!src || typeof document === 'undefined') return null;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const natural = { width: img.naturalWidth, height: img.naturalHeight };
    const size = fitBox(natural, { width: maxWidth, height: maxHeight });
    // Une image matricielle ne gagne rien à être agrandie au-delà de ses
    // pixels ; un SVG, si.
    const vector = /^data:image\/svg/i.test(src) || /\.svg(?:$|\?)/i.test(src);
    const native = natural.width > 0 ? natural.width / size.width : scale;
    const k = Math.min(
      vector ? scale : Math.max(1, Math.min(scale, native)),
      MAX_PIXELS / Math.max(size.width, size.height),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(size.width * k));
    canvas.height = Math.max(1, Math.round(size.height * k));
    const c2d = canvas.getContext('2d');
    c2d.imageSmoothingQuality = 'high';
    c2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/png'), ...size };
  } catch (error) {
    console.warn('⚠️ Logo du PDF indisponible:', error);
    return null;
  }
}
