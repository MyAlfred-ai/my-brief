/**
 * Routes SSO montées sous /api/auth — un fournisseur, deux à trois routes.
 *
 * Google : départ ET retour ici, l'URI de redirection
 * `https://<domaine>/api/auth/google/callback` étant déclarée dans la console
 * Google Cloud (en local : http://localhost:5173/api/auth/google/callback).
 *
 * Entra : SEUL le départ est ici. Le retour vit sur `/oauth2/callback`
 * (routes/oauth2.js), hors du préfixe /api, parce que cette URI est déjà
 * enregistrée dans l'app registration on-prem et que nous n'avons pas les
 * droits pour en déclarer une autre — cf. lib/auth/providers.js.
 */
import { PROVIDERS } from '../../lib/auth/providers.js';
import { createStartHandler, createCallbackHandler } from './ssoFlow.js';

export default function ssoRoutes(app) {
  app.get(PROVIDERS.google.startPath, createStartHandler(app, PROVIDERS.google));
  app.get('/google/callback', createCallbackHandler(app, PROVIDERS.google));

  app.get(PROVIDERS.entra.startPath, createStartHandler(app, PROVIDERS.entra));
}
