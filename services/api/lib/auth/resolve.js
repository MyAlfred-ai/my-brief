/**
 * Résolution de l'identité d'une requête — le point où les deux chemins
 * d'authentification convergent.
 *
 * Ordre :
 *   1. En-tête X-Mybrief-Auth-Path: native  → les en-têtes d'identité sont
 *      IGNORÉS et seule la session native compte.
 *   2. Cookie mybrief_sess valide           → identité native (prioritaire).
 *   3. identityFromHeaders(req.headers)     → OIDC (web) ou ForwardAuth mobile.
 *   4. rien                                 → non authentifié.
 *
 * ⚠️ Le point 1 est la protection centrale de toute la fonctionnalité. Les
 * routeurs Traefik qui n'appliquent PAS le middleware OIDC (`/api/auth`, et
 * `/api` quand un cookie natif est présent) laisseraient sinon n'importe qui
 * envoyer `X-User-Email: victime@…` et lire les données d'autrui. Le middleware
 * `noident` efface ces en-têtes ET pose ce marqueur — infalsifiable de
 * l'extérieur puisqu'il est réécrit à chaque passage. Ici, sa seule présence
 * suffit à disqualifier l'identité par en-tête.
 *
 * Le Bearer mobile n'est jamais lu ici : le ForwardAuth `mobile-auth` le
 * consomme et réinjecte les mêmes en-têtes — il arrive au point 3, inchangé.
 */
import { identityFromHeaders } from '../identity.js';
import { readSessionToken } from './cookies.js';
import { SESSION_PROVIDERS } from './sessions.js';

export const NATIVE_PATH_HEADER = 'x-mybrief-auth-path';

/**
 * Comment l'utilisateur courant s'est authentifié. Renvoyé au frontend par
 * /api/init et /api/auth/session, qui en tirent deux décisions :
 *
 *   - `oidc`     : identité portée par les en-têtes (plugin Traefik, ForwardAuth
 *                  mobile). Seul cas où se déconnecter passe par le RP-logout de
 *                  l'IdP ; le faire sur les autres fermerait la session Google
 *                  ou Microsoft du navigateur, sans rapport avec myBrief.
 *   - `password` : session native ouverte par mot de passe, ou compte qui en a
 *                  un. Seul cas où proposer « changer de mot de passe ».
 *   - `sso`      : session native ouverte via Google ou Entra sur un compte SANS
 *                  mot de passe. Déconnexion native comme `password`, mais rien
 *                  à changer — l'écrire `password` offrait à ces comptes un
 *                  formulaire que le serveur ne pouvait qu'échouer.
 *
 * @param {object|null} user - identité résolue par resolveIdentity()
 * @returns {'oidc'|'password'|'sso'}
 */
export function authModeOf(user) {
  if (user?.source !== 'session') return 'oidc';
  return user.doc?.passwordHash ? 'password' : 'sso';
}

/**
 * Par QUOI l'utilisateur s'est connecté — le raffinement d'`authMode`, dont le
 * frontend tire l'avatar (logo Google, logo Microsoft, clé, badge SSO).
 *
 * `authMode` ne peut pas suffire : il répond à « que puis-je proposer à ce
 * compte » (changer le mot de passe, quel logout), et écrase Google et
 * Microsoft sous un même `sso`.
 *
 * La source de vérité est le fournisseur ENREGISTRÉ SUR LA SESSION : un compte
 * peut avoir plusieurs entrées dans `authProviders`, elles disent ce qui est
 * lié, pas ce qui a servi aujourd'hui. Le repli sur le document ne concerne que
 * les sessions ouvertes avant que ce champ n'existe.
 *
 * @param {object|null} user - identité résolue par resolveIdentity()
 * @returns {'oidc'|'password'|'google'|'entra'|'sso'}
 */
export function authProviderOf(user) {
  if (user?.source !== 'session') return 'oidc';
  if (SESSION_PROVIDERS.has(user.sessionProvider)) return user.sessionProvider;
  if (user.doc?.passwordHash) return 'password';
  const linked = (user.doc?.authProviders || []).find((id) => id === 'google' || id === 'entra');
  return linked || 'sso';
}

/**
 * @param {{req: object, users: object, sessions: object}} deps
 * @returns {Promise<{user: object|null, sessionInvalid: boolean}>}
 *   `sessionInvalid` demande au hook de purger le cookie : sans ça, un cookie
 *   mort continuerait d'aiguiller le navigateur vers le routeur natif, qui
 *   répondrait 401 indéfiniment.
 */
export async function resolveIdentity({ req, users, sessions }) {
  const nativeOnly = String(req.headers?.[NATIVE_PATH_HEADER] || '').toLowerCase() === 'native';
  const token = readSessionToken(req);

  if (token) {
    const session = await sessions.resolve(token);
    if (session) {
      const doc = await users.findByEmailLower(session.emailLower);
      if (doc && !doc.disabled) {
        await sessions.touch(session);
        return {
          user: {
            email: doc.email,
            name: doc.name || String(doc.email).split('@')[0],
            role: doc.role === 'admin' ? 'admin' : 'user',
            mustChangePassword: !!doc.mustChangePassword,
            emailLower: doc.emailLower,
            picture: doc.picture || '',
            source: 'session',
            sessionToken: token,
            // Null sur les sessions ouvertes avant l'enregistrement du
            // fournisseur — cf. authProviderOf().
            sessionProvider: session.provider || null,
            doc,
          },
          sessionInvalid: false,
        };
      }
      // Compte supprimé ou désactivé : ses sessions n'ont plus de raison d'être.
      await sessions.destroyAllFor(session.emailLower);
    }
    return { user: null, sessionInvalid: true };
  }

  if (nativeOnly) return { user: null, sessionInvalid: false };

  const { email, name, picture } = identityFromHeaders(req.headers);
  if (!email) return { user: null, sessionInvalid: false };

  // Le rôle vit en base, pas dans l'en-tête : un compte OIDC qui n'a pas encore
  // été vu par /init n'a pas de document et reste « user ».
  const doc = await users.findByEmail(email);
  if (doc?.disabled) return { user: null, sessionInvalid: false };

  return {
    user: {
      email,
      name: doc?.name || name || String(email).split('@')[0],
      role: doc?.role === 'admin' ? 'admin' : 'user',
      mustChangePassword: !!doc?.mustChangePassword,
      emailLower: doc?.emailLower || String(email).trim().toLowerCase(),
      // L'en-tête d'abord : c'est la photo du jour chez l'IdP.
      picture: picture || doc?.picture || '',
      source: 'headers',
      doc: doc || null,
    },
    sessionInvalid: false,
  };
}
