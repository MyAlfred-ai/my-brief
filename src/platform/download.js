/**
 * Sauvegarde/export de fichiers, portable web + natif.
 *
 * Web : flux historique inchangé — <a download> sur un object URL.
 * Natif (Capacitor) : les <a download> et pdf.save() sont des no-op silencieux
 * en WebView. On écrit le fichier dans le cache de l'app (Filesystem) puis on
 * ouvre la feuille de partage système (Share) : l'utilisateur choisit
 * Fichiers/Drive/Mail/etc.
 */

import { isNative, nativePlugin } from './index.js';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const s = String(reader.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {{ filename: string, mimeType: string, data: string|Blob }} params
 */
export async function saveFile({ filename, mimeType, data }) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });

  if (!isNative) {
    // Comportement web historique (déplacé tel quel depuis les appelants).
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const base64 = await blobToBase64(blob);
  const written = await nativePlugin('Filesystem').writeFile({
    path: filename,
    data: base64,
    directory: 'CACHE',
  });
  try {
    await nativePlugin('Share').share({ title: filename, url: written.uri });
  } catch (e) {
    // Fermeture de la feuille de partage par l'utilisateur = pas une erreur.
    if (!/cancel/i.test(String((e && e.message) || e))) throw e;
  }
}

/**
 * Handler on:click pour les <a download href={objectURL}> des templates.
 * Web : ne fait rien (le téléchargement natif du navigateur opère).
 * Natif : intercepte (les <a download> sont des no-op en WebView), relit le
 * blob depuis l'object URL et passe par saveFile (Filesystem + Share).
 */
export function interceptAnchorDownload(event, url, filename) {
  if (!isNative) return;
  event.preventDefault();
  fetch(url)
    .then((r) => r.blob())
    .then((blob) =>
      saveFile({
        filename,
        mimeType: blob.type || 'application/octet-stream',
        data: blob,
      }),
    )
    .catch((e) => console.error('Téléchargement natif échoué:', e));
}
