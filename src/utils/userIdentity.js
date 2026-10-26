/**
 * Validation du nom d'utilisateur remonté par les en-têtes d'identité.
 * Les valeurs sentinelles viennent d'anciens flux n8n/OIDC qui posaient
 * littéralement « No value » ou « unknown » à la place d'un nom absent.
 */
export function isValidUserName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmedName = name.trim().toLowerCase();
  const invalidValues = ['no value', 'unknown', 'undefined', 'null', ''];
  return !invalidValues.includes(trimmedName);
}

/**
 * Ce que l'interface montre du compte connecté : son nom (s'il en est un),
 * ses initiales, sa photo, par quoi la session a été ouverte, ses groupes.
 * Une seule lecture pour la ligne profil de la Sidebar, l'avatar de la barre
 * d'app mobile et le menu de compte : ils ne peuvent pas se contredire.
 * @param {object|null|undefined} user  `$auth.user`
 * @param {Record<string, string>} [signedInWith]  `$uiText.account.signedInWith`
 */
export function accountView(user, signedInWith = {}) {
  const name = user?.name && isValidUserName(user.name) ? user.name : null;
  const provider = user?.authProvider || '';
  return {
    name,
    initials: name
      ? name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() || '')
          .join('')
      : '?',
    email: user?.email || '',
    picture: user?.picture || '',
    // Le serveur peut ne rien dire (ancienne session, sonde pas encore
    // revenue) : l'avatar retombe alors sur les seules initiales.
    provider,
    providerLabel: provider ? signedInWith?.[provider] || '' : '',
    // Absents d'une ancienne réponse de session : aucun bloc, rien de faux.
    groups: Array.isArray(user?.groups) ? user.groups : [],
    canChangePassword: user?.authMode === 'password',
    isAdmin: user?.role === 'admin',
  };
}
