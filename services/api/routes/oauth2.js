/**
 * Callback OAuth partagé — monté à la RACINE, hors du préfixe /api.
 *
 * Ce chemin n'est pas un choix : `https://<domaine>/oauth2/callback` est l'URI
 * de redirection déjà enregistrée dans l'app registration Entra des
 * installations on-prem (c'était celle du plugin OIDC Traefik). Nous n'avons pas
 * accès à cette administration pour en déclarer une autre, donc l'API reprend
 * l'URI existante telle quelle. Le renommer casse la connexion en production.
 *
 * ── Deux flux, une seule URI ────────────────────────────────────────────────
 * La même contrainte s'applique à la CONNEXION d'un compte Microsoft (envoi de
 * mail, dépôt sur OneDrive) : elle doit revenir ici aussi. Les deux flux sont
 * distingués par le marqueur inscrit en base au départ, relu ici SANS consommer
 * le state — la consommation reste l'affaire du handler retenu, qui en garde
 * l'usage unique (cf. lib/auth/oauthState.js).
 *
 * Le state est inconnu (expiré, déjà consommé, forgé) dans un cas : on le
 * confie alors au flux de LOGIN, dont l'échec ramène l'utilisateur à l'écran de
 * connexion avec un message — la destination la plus utile quand on ne sait pas
 * ce qui se passait.
 *
 * ⚠️ Côté Traefik, le routeur qui amène ici DOIT porter le middleware `noident` :
 * comme toute route atteignant l'API sans middleware d'authentification, il
 * laisserait sinon n'importe qui se déclarer n'importe qui par en-tête
 * (cf. lib/auth/resolve.js).
 */
import { PROVIDERS } from '../lib/auth/providers.js';
import { CONNECT_PROVIDERS } from '../lib/connections/providers.js';
import { createCallbackHandler } from './auth/ssoFlow.js';
import { createConnectCallback } from './connect.js';
import { resolveIdentity } from '../lib/auth/resolve.js';

export default function oauth2Routes(app) {
  const login = createCallbackHandler(app, PROVIDERS.entra);

  // Ce contexte n'est pas couvert par authPlugin (cf. app.js) : la connexion
  // résout l'identité elle-même, exactement comme le reste de l'API — session
  // native ici, puisque le routeur porte `noident`.
  const connect = createConnectCallback(app, CONNECT_PROVIDERS.microsoft, {
    resolveUser: async (req) => {
      const { user } = await resolveIdentity({
        req,
        users: app.users,
        sessions: app.sessions,
      });
      return user;
    },
  });

  app.get(PROVIDERS.entra.callbackPath, async (req, reply) => {
    const flow = await app.oauthStates.peekProvider(req.query?.state);
    if (flow === CONNECT_PROVIDERS.microsoft.flow) return connect(req, reply);
    return login(req, reply);
  });
}
