/**
 * Version de l'extension Chrome que sert CETTE installation — le .zip de
 * public/, construit depuis extension/ (scripts/build-extension.mjs) — lue
 * dans son manifest au build.
 *
 * Une extension chargée depuis un dossier ne se met jamais à jour seule.
 * Comparée à la version qu'elle annonce au pont (`hello`,
 * stores/extensionBridge.js), celle-ci dit s'il faut la remplacer. Installée
 * depuis le Chrome Web Store, elle se met à jour toute seule : la page ne
 * compare pas dans ce cas.
 */
import { version } from '../../extension/manifest.json';

export const EXTENSION_VERSION = version;

/**
 * `installed` est-elle strictement plus ancienne que `latest` ? Versions de
 * manifest Chrome : un à quatre entiers séparés par des points.
 *
 * Une version illisible (vide, ancienne extension muette) → false : on ne
 * réclame pas une mise à jour sur un doute.
 *
 * @param {string} installed
 * @param {string} latest
 */
export function isOlderVersion(installed, latest) {
  const parse = (v) => {
    const parts = String(v || '').split('.');
    return parts.every((p) => /^\d+$/.test(p)) ? parts.map(Number) : null;
  };
  const a = parse(installed);
  const b = parse(latest);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
