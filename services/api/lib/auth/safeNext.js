/**
 * Destination de retour après connexion (`?next=`).
 *
 * Existe pour le flux mobile : `/auth/mobile/start` a besoin d'une session, et
 * quand il n'y en a pas il faut envoyer l'utilisateur se connecter PUIS le
 * ramener exactement là — sinon il atterrit sur l'accueil et l'app native
 * n'obtient jamais son jeton.
 *
 * ⚠️ C'est une redirection pilotée par l'URL : sans contrôle, c'est une
 * redirection ouverte. Un attaquant enverrait `…?next=https://phishing.tld` ;
 * la victime verrait le vrai domaine, se connecterait, et serait déposée sur le
 * site de l'attaquant avec la confiance acquise.
 *
 * Règle : on n'accepte QUE des chemins absolus de CE site. Tout le reste est
 * ramené à `/` silencieusement — refuser bruyamment n'apporterait rien à
 * l'utilisateur légitime, qui ne fabrique jamais ce paramètre à la main.
 */

export const DEFAULT_NEXT = '/';

/** Caractères de contrôle : ignorés par certains parseurs d'URL, donc utilisables
 *  pour masquer un `//` ou un `\` aux contrôles ci-dessous. */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * @param {unknown} value
 * @returns {string} chemin sûr, ou `/`
 */
export function safeNext(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return DEFAULT_NEXT;

  // Doit être un chemin absolu de ce site.
  if (!raw.startsWith('/')) return DEFAULT_NEXT;
  // `//evil.tld` et `/\evil.tld` sont des URLs protocol-relative : le navigateur
  // les résout en changement d'origine alors qu'elles ressemblent à un chemin.
  if (/^\/[/\\]/.test(raw)) return DEFAULT_NEXT;
  // Un `\` isolé est normalisé en `/` par certains navigateurs — même piège.
  if (raw.includes('\\')) return DEFAULT_NEXT;
  if (CONTROL_CHARS.test(raw)) return DEFAULT_NEXT;

  return raw;
}
