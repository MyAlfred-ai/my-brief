/**
 * Préparer le logo d'un tag avant l'envoi : n'importe quelle image (PNG,
 * JPEG, WebP, GIF, SVG) devient un PNG d'au plus 512 px de côté.
 *
 * Pourquoi dans le navigateur : il sait décoder tous ces formats, SVG compris,
 * et un logo réduit voyage, se stocke et s'imprime léger. Le serveur
 * n'accepte que PNG, JPEG ou WebP (routes/tags.js) — un SVG est un document
 * actif, le canvas en fait une image inerte. 512 px suffisent au médaillon de
 * l'infographie comme à l'en-tête du PDF (lib/pdf/logo.js le redessine à la
 * taille d'impression).
 *
 * Un PNG trop lourd (photo collée en guise de logo) repasse en WebP ; au-delà
 * encore, refus `logo_too_big` plutôt qu'une image dégradée en silence.
 */

/** Côté le plus long du logo produit, en pixels. */
export const TAG_LOGO_SIDE = 512;
/** Taille maximale du data URL — COPIE de `TAG_LOGO_MAX` (services/api/routes/tags.js). */
export const TAG_LOGO_MAX = 300_000;
/** Au-delà, le fichier choisi n'est pas un logo : on ne le décode même pas. */
const FILE_MAX = 10 * 1024 * 1024;
const ACCEPTED = /^image\/(png|jpeg|webp|gif|svg\+xml)$/;

/** Types proposés par le sélecteur de fichier. */
export const TAG_LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';

/** Erreur à slug, lue par l'appelant (`err.code`). */
function refusal(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Taille de dessin : l'image réduite à TAG_LOGO_SIDE au plus, jamais
 * agrandie — sauf une image sans dimension propre (SVG sans `width`), dessinée
 * à la taille maximale.
 * @param {number} width
 * @param {number} height
 * @returns {{width: number, height: number}}
 */
export function logoSize(width, height) {
  if (!(width > 0) || !(height > 0)) return { width: TAG_LOGO_SIDE, height: TAG_LOGO_SIDE };
  const k = Math.min(1, TAG_LOGO_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * Le logo prêt à envoyer, en data URL PNG (ou WebP s'il est lourd).
 * Lève une erreur à `code` : `logo_invalid` (pas une image admise),
 * `logo_unreadable` (illisible), `logo_too_big`.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function prepareTagLogo(file) {
  if (!file || !ACCEPTED.test(file.type || '')) throw refusal('logo_invalid');
  if (file.size > FILE_MAX) throw refusal('logo_too_big');
  let img;
  try {
    img = new Image();
    img.src = await readAsDataUrl(file);
    await img.decode();
  } catch {
    throw refusal('logo_unreadable');
  }
  const size = logoSize(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw refusal('logo_unreadable');
  ctx.drawImage(img, 0, 0, size.width, size.height);
  let out = canvas.toDataURL('image/png');
  if (out.length > TAG_LOGO_MAX) out = canvas.toDataURL('image/webp', 0.9);
  if (!/^data:image\/(png|webp);base64,/.test(out)) throw refusal('logo_unreadable');
  if (out.length > TAG_LOGO_MAX) throw refusal('logo_too_big');
  return out;
}
