/**
 * Destination de retour après connexion (`?next=`), côté navigateur.
 *
 * Miroir de `services/api/lib/auth/safeNext.js` : les deux doivent appliquer la
 * MÊME règle. Le contrôle serveur est celui qui protège (il gouverne la
 * redirection du flux SSO) ; celui-ci gouverne la navigation qui suit une
 * connexion par mot de passe, faite entièrement dans la page.
 *
 * Sans lui, `…/signin?next=https://phishing.tld` déposerait l'utilisateur chez
 * un tiers juste après une connexion réussie sur le vrai domaine.
 */

export const DEFAULT_NEXT = '/';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * @param {unknown} value
 * @returns {string} chemin sûr de ce site, ou `/`
 */
export function safeNext(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return DEFAULT_NEXT;
  if (!raw.startsWith('/')) return DEFAULT_NEXT;
  // `//evil.tld` et `/\evil.tld` changent d'origine tout en ressemblant à un chemin.
  if (/^\/[/\\]/.test(raw)) return DEFAULT_NEXT;
  if (raw.includes('\\')) return DEFAULT_NEXT;
  if (CONTROL_CHARS.test(raw)) return DEFAULT_NEXT;
  return raw;
}
