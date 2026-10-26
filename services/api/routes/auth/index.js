/**
 * Routes d'authentification native — montées sous /api/auth.
 *
 * Ce préfixe est PUBLIC côté Traefik (routeur dédié sans middleware OIDC) :
 * c'est l'API qui authentifie ici. Le middleware `noident` efface les en-têtes
 * d'identité sur ce chemin — sans quoi n'importe qui pourrait se déclarer
 * n'importe qui (cf. lib/auth/resolve.js).
 *
 * Contrat d'erreur : vrais codes HTTP + { error: '<slug>' } (cf. lib/errors.js),
 * contrairement aux routes héritées de n8n qui renvoient certaines erreurs de
 * validation en 200.
 */
import loginRoutes from './login.js';
import sessionRoutes from './session.js';
import passwordRoutes from './password.js';
import recoveryRoutes from './recovery.js';
import ssoRoutes from './sso.js';

export default function authRoutes(app) {
  app.register(
    async (auth) => {
      // Erreurs (ajv comprises) : normalisées par le handler racine posé dans
      // app.js — cf. slugErrorHandler dans lib/errors.js.
      loginRoutes(auth);
      sessionRoutes(auth);
      passwordRoutes(auth);
      recoveryRoutes(auth);
      ssoRoutes(auth);
    },
    { prefix: '/auth' },
  );
}
