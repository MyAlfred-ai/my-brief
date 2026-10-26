/**
 * Ce qu'il faut RÉELLEMENT fermer pour déconnecter.
 *
 * La question n'est pas « comment cette personne s'est-elle connectée ? » mais
 * « qu'est-ce qui authentifiera sa prochaine requête ? ». Les deux ont
 * longtemps été confondues, et c'est ce qui produisait un bouton inopérant :
 * une session native fermée, mais le plugin OIDC Traefik toujours devant `/api`
 * qui ré-authentifiait silencieusement la requête suivante.
 *
 * Trois choses peuvent authentifier une requête, et elles se cumulent :
 *
 *   - le cookie de session NATIVE `mybrief_sess` — fermé par POST /api/logout ;
 *   - le cookie du PLUGIN OIDC Traefik — que seul son RP-logout détruit, le
 *     cookie étant HttpOnly et posé par le proxy ;
 *   - le JWT local de l'application MOBILE — purgé sur l'appareil.
 *
 * Fonction PURE : elle décide, elle n'agit pas. C'est ce qui la rend testable
 * en table, là où la déconnexion elle-même vit au milieu de navigations et
 * d'effets de bord difficiles à éprouver.
 */

/**
 * @param {{authMode?: string, isNative?: boolean, oidcEnabled?: boolean}} context
 *   - `authMode` : 'oidc' (identité par en-tête, donc plugin) | 'password' | 'sso'
 *   - `isNative` : build Capacitor
 *   - `oidcEnabled` : le plugin Traefik est monté sur cette installation. C'est
 *     une DÉCLARATION de l'exploitant (cf. services/api/lib/config.js) : l'API
 *     ne peut pas lire les labels Traefik, et la bascule en natif change ce
 *     drapeau en même temps que le middleware.
 * @returns {'mobile'|'native'|'native+plugin'|'plugin'}
 */
export function resolveLogoutTarget({ authMode, isNative = false, oidcEnabled = false } = {}) {
  // Le « cookie » mobile est un JWT local. Le RP-logout du plugin concerne la
  // session du NAVIGATEUR SYSTÈME, pas la WebView : la garder vivante permet
  // une reconnexion en un tap, comme le web garde la session Google.
  if (isNative) return 'mobile';

  // Identité par en-tête : il n'y a aucune session native à fermer, seul le
  // plugin authentifie.
  if (authMode === 'oidc') return 'plugin';

  // Session native — mot de passe, ou Google/Entra joué par l'API. Elle se
  // ferme côté serveur. Mais si le plugin garde encore `/api`, il reprendra la
  // main dès la requête suivante : il faut fermer les deux.
  return oidcEnabled ? 'native+plugin' : 'native';
}

/**
 * Chemin de déconnexion du plugin traefikoidc.
 *
 * ⚠️ `/oauth2/callback/logout`, PAS `/oauth2/logout`. Le plugin calcule
 * `logoutURLPath = callbackURL + "/logout"` quand `logoutURL` n'est pas
 * configuré (main.go). `/oauth2/logout` n'est routé nulle part et tombe sur
 * nginx en 404 — panne silencieuse, le bouton semble simplement ne rien faire.
 */
export const PLUGIN_LOGOUT_PATH = '/oauth2/callback/logout';
