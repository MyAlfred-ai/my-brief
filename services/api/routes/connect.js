/**
 * Connexion d'un compte externe (Google aujourd'hui, Microsoft ensuite) — le
 * compte au nom duquel myBrief agira : envoyer un mail, déposer un document.
 *
 * Généralise routes/mail.js, qui ne savait relier qu'un Gmail et portait en dur
 * son scope, son cookie, son callback et sa table d'erreurs. Ce qui distingue
 * un fournisseur vit désormais dans lib/connections/providers.js ; ce fichier
 * ne décrit plus que l'enchaînement, identique pour tous.
 *
 * Réutilise les identifiants OAuth saisis dans Administration → Authentification :
 * même clientId/clientSecret que le login, mais un flux séparé (scopes d'API,
 * hors ligne) et une URI de callback dédiée — à déclarer chez le fournisseur au
 * même titre que celle du login.
 *
 * start/callback sont des NAVIGATIONS top-level (comme routes/auth/ssoFlow.js) :
 * elles répondent par des redirections, jamais du JSON. Les échecs reviennent
 * sur `/?connectError=<slug>#config`, que « Ma configuration » traduit.
 *
 * Le refresh token ne quitte jamais l'API ; les routes JSON n'exposent que
 * `{ connected, account, driveReady }`.
 */
import { requireUser } from '../lib/rbac.js';
import { fail } from '../lib/errors.js';
import { createRateLimiter } from '../lib/auth/rateLimit.js';
import { publicOrigin, isSameOrigin } from '../lib/auth/originCheck.js';
import {
  createStateCookie,
  endpointsFor,
  startOAuth,
  consumeState,
  exchangeForProfile,
} from '../lib/auth/oauthFlow.js';
import { parseScopes } from '../lib/repositories/connections.js';
import {
  CONNECT_PROVIDERS,
  connectScopes,
  connectionCredentials,
  effectiveProvider,
  hasScope,
} from '../lib/connections/providers.js';

const settingsUrl = (error) =>
  error ? `/?connectError=${encodeURIComponent(error)}#config` : '/#config';

/**
 * Retour dans l'APP NATIVE après un consentement donné dans le navigateur
 * système.
 *
 * Le host est `auth` et non `connect`, et ce n'est pas cosmétique : l'intent
 * filter Android déclare `scheme="mybrief" host="auth"`. Un `mybrief://connect/…`
 * ne serait capté par personne, le navigateur système afficherait une erreur, et
 * il faudrait republier l'app sur les stores pour corriger. En restant sous
 * `auth`, le correctif voyage avec le déploiement web (mode `server.url`).
 * Côté iOS, `CFBundleURLSchemes` déclare le schéma entier : tout host passe.
 */
const NATIVE_RETURN = 'mybrief://auth/connect';

/** Marqueur du billet natif dans le magasin d'états — jamais un flux OAuth. */
const TICKET_FLOW = 'connect-mobile-ticket';

const nativeReturnUrl = (error) =>
  error ? `${NATIVE_RETURN}?error=${encodeURIComponent(error)}` : `${NATIVE_RETURN}?status=ok`;

/**
 * Où renvoyer l'utilisateur à la fin du flux.
 *
 * `mobile` n'est connu qu'APRÈS consommation du state — c'est là qu'on relit le
 * marqueur inscrit au départ. Les échecs antérieurs (consentement refusé, state
 * qui ne correspond pas) retombent donc sur l'URL web : le navigateur système
 * affiche l'application, l'utilisateur le referme, et l'app native — restée en
 * arrière-plan, jamais rechargée — montre toujours « non connecté ». Bruyant
 * mais exact, et seulement sur des chemins d'échec rares.
 */
const backTo = (mobile, error) => (mobile ? nativeReturnUrl(error) : settingsUrl(error));

/**
 * État de la connexion vu du client. `driveReady` distingue une connexion
 * capable de déposer sur le Drive d'une connexion héritée de l'époque « Gmail
 * seul » : celle-ci envoie toujours des mails, mais devra être refaite pour
 * obtenir le Drive.
 */
async function connectionStatus(app, user) {
  const [settings, actions, connection] = await Promise.all([
    app.settings.get(),
    app.settings.getActions(),
    app.connections.get(user.emailLower),
  ]);
  const provider = effectiveProvider(actions.connections?.provider);
  return {
    // Interrupteurs admin (onglet Actions) : le panneau ne propose la
    // configuration que si l'action existe quelque part.
    actionEnabled: {
      transcription: actions.transcription.email !== false,
      summary: actions.summary.email !== false,
    },
    smtpAvailable: !!app.mailer?.enabled,
    provider: {
      id: provider.id,
      label: provider.label,
      available: !!connectionCredentials(provider, settings),
      connected: !!connection,
      account: connection?.account || '',
      // `hasScope` et non `includes` : Entra rend ses scopes sous une forme qui
      // n'est pas celle du registre (cf. lib/connections/providers.js).
      driveReady: !!connection && hasScope(connection.scopes, provider.driveScope),
    },
  };
}

/**
 * Révocation chez le fournisseur, quand il en offre une. Tous n'en ont pas :
 * Microsoft n'expose aucun endpoint de révocation de refresh token, seul
 * l'utilisateur peut retirer l'accès depuis son compte. Supprimer le document
 * reste alors la seule action possible côté myBrief.
 */
const revokeAt = (app, provider, payload) =>
  provider?.revocable ? app.gmailRevoke(payload) : Promise.resolve(false);

/**
 * Retour du fournisseur : vérifie le state, échange le code, enregistre la
 * connexion.
 *
 * Fabriqué à part parce que tous les callbacks n'arrivent pas par le même
 * chemin : celui de Google vit sous `/api`, celui de Microsoft doit reprendre
 * `/oauth2/callback` à la racine (cf. lib/connections/providers.js). Le second
 * n'est donc pas couvert par `authPlugin` et doit résoudre l'identité lui-même
 * — d'où `resolveUser`.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} provider - entrée de CONNECT_PROVIDERS
 * @param {{resolveUser?: (req: object) => Promise<object|null>}} [options]
 */
export function createConnectCallback(app, provider, { resolveUser } = {}) {
  const cookie = createStateCookie(app, provider.stateCookieName);

  return async (req, reply) => {
    const query = req.query || {};

    if (query.error) {
      cookie.clear(reply);
      const slug = query.error === 'access_denied' ? 'connect_cancelled' : 'connect_failed';
      return reply.redirect(settingsUrl(slug), 302);
    }

    // Triple contrôle du state + marqueur de flux — cf. lib/auth/oauthFlow.js.
    const checked = await consumeState(app, req, reply, {
      cookie,
      flow: provider.flow,
      state: query.state,
      code: query.code,
    });
    if (!checked.ok) return reply.redirect(settingsUrl('connect_state_mismatch'), 302);
    const { pending } = checked;

    // ── À qui rattacher la connexion ────────────────────────────────────────
    // Au compte qui a DÉMARRÉ le flux, inscrit en base au départ depuis une
    // session authentifiée. Pas à la session qui se présente ici — parce qu'il
    // n'y en a pas toujours une.
    //
    // Le callback Microsoft arrive sur `/oauth2/callback`, dont le routeur porte
    // `noident` : les en-têtes d'identité y sont effacés et seul un cookie
    // `mybrief_sess` compte. Or les installations restées sur le plugin OIDC
    // Traefik authentifient PAR en-tête et n'ont pas ce
    // cookie. Exiger une session ici rendait donc la connexion d'une boîte
    // Microsoft impossible pour tous leurs utilisateurs : le flux se terminait
    // systématiquement en `connect_session_mismatch`, sans rien enregistrer, et
    // l'envoi de mail restait hors d'atteinte définitivement.
    //
    // S'y fier est sain : le `state` est à usage unique, lié à CE navigateur par
    // le cookie d'état et au flux par PKCE. Un attaquant ne peut pas faire
    // consommer son code par la victime, dont le navigateur ne porte pas le
    // cookie. Le contrôle de session reste appliqué QUAND une session existe —
    // il attrape l'onglet resté ouvert sur un poste partagé — mais il ne
    // conditionne plus la fonctionnalité.
    const owner = String(pending.meta?.emailLower || '').toLowerCase();
    if (!owner) return reply.redirect(settingsUrl('connect_state_mismatch'), 302);
    // À partir d'ici on sait d'où vient le flux : le consentement d'une app
    // native s'est déroulé dans le navigateur système, et il faut ramener la
    // personne DANS l'app, pas la laisser devant un site où elle n'a pas de
    // session.
    const back = (error) => backTo(!!pending.meta?.mobile, error);

    const user = resolveUser ? await resolveUser(req) : req.user;
    const sessionEmail = String(user?.emailLower || user?.email || '').toLowerCase();
    if (sessionEmail && sessionEmail !== owner) {
      return reply.redirect(back('connect_session_mismatch'), 302);
    }

    const settings = await app.settings.get();
    const conf = connectionCredentials(provider, settings);
    if (!conf) return reply.redirect(back('connect_not_configured'), 302);

    let tokens;
    let profile;
    try {
      const endpoints = await endpointsFor(provider, conf);
      ({ tokens, profile } = await exchangeForProfile({
        code: query.code,
        conf,
        pending,
        endpoints,
      }));
    } catch (err) {
      req.log?.error({ err, provider: provider.id }, "échec du flux d'autorisation");
      return reply.redirect(back('connect_failed'), 302);
    }

    // Sans refresh token, rien à stocker : tout appel échouerait dès
    // l'expiration de l'access token. L'autorisation a pourtant été accordée —
    // la rendre évite de laisser un accès vivant dont myBrief n'a pas trace.
    if (!tokens.refresh_token) {
      await revokeAt(app, provider, { accessToken: tokens.access_token });
      return reply.redirect(back('connect_no_refresh_token'), 302);
    }
    const account = provider.emailOf(profile);
    if (!account) return reply.redirect(back('connect_failed'), 302);

    // Reconnexion sur un AUTRE compte : l'ancien jeton resterait valide
    // indéfiniment, hors de portée de l'utilisateur.
    //
    // ⚠️ Uniquement si le compte diffère : chez Google, révoquer un jeton
    // révoque le grant entier du compte — donc celui qu'on vient d'obtenir.
    const previous = await app.connections.getByProvider(owner, provider.id);
    if (previous?.refreshToken && previous.account !== account) {
      await revokeAt(app, provider, { refreshToken: previous.refreshToken });
    }

    await app.connections.set(owner, {
      provider: provider.id,
      account,
      refreshToken: tokens.refresh_token,
      // Ce que le fournisseur a réellement accordé, qui peut être moins que
      // demandé. C'est cette liste — pas celle du registre — qui dit si le
      // dépôt Drive est possible.
      scopes: parseScopes(tokens.scope) || [],
    });
    return reply.redirect(back(null), 302);
  };
}

export default function connectRoutes(app) {
  const byIp = createRateLimiter(app.config.rateLimits.connectByIp);
  app.addHook('onClose', async () => byIp.stop());

  /**
   * État de la connexion du compte — consommé par « Ma configuration » et par
   * App.svelte pour décider de l'affichage des boutons d'action.
   */
  app.get('/connect/status', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    return connectionStatus(app, user);
  });

  /**
   * Départ du flux d'autorisation — navigation top-level.
   *
   * Le fournisseur n'est pas un paramètre : il est choisi par l'installation
   * (Administration → Actions). Laisser le client le nommer permettrait de
   * relier un compte chez un fournisseur que l'exploitant n'a pas retenu.
   */
  /**
   * Billet d'entrée du flux pour l'APP NATIVE.
   *
   * Dans la WebView, `window.location.href = /api/connect/start` ne mène nulle
   * part : l'identité native est un JWT porté en en-tête `Authorization`, et une
   * NAVIGATION ne porte pas d'en-tête. Le cookie de session, lui, n'existe pas —
   * le login natif s'est fait dans le navigateur système. La navigation arrivait
   * donc sans identité et repartait vers `/`, sans un mot.
   *
   * Ce billet transporte l'identité d'un appel `fetch` (qui, lui, porte le
   * Bearer) vers une navigation qui ne le peut pas. Il est à USAGE UNIQUE et
   * expire en dix minutes — même forme que l'OTT du login natif — et il n'ouvre
   * rien d'autre que « démarrer un flux de connexion POUR CE COMPTE ».
   */
  app.post('/connect/mobile/ticket', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');

    const check = byIp.hit(req.ip || 'unknown');
    if (!check.allowed) return fail(reply, 429, 'too_many_requests');

    // Réutilise le magasin des états OAuth : même durée de vie, même index TTL,
    // et surtout la même consommation ATOMIQUE, qui est tout l'intérêt.
    const { state } = await app.oauthStates.issue({
      codeVerifier: '',
      redirectUri: '',
      provider: TICKET_FLOW,
      ip: req.ip,
      meta: { emailLower: String(user.emailLower || user.email).toLowerCase() },
    });
    return { ticket: state };
  });

  /**
   * Compte au nom duquel démarrer le flux : la session si la requête en porte
   * une (web), sinon le billet à usage unique (app native).
   * @returns {Promise<{emailLower: string, mobile: boolean}|null>}
   */
  async function starter(req) {
    if (req.user?.email) {
      return {
        emailLower: String(req.user.emailLower || req.user.email).toLowerCase(),
        mobile: false,
      };
    }
    const ticket = String(req.query?.ticket || '');
    if (!ticket) return null;
    const pending = await app.oauthStates.consume(ticket);
    if (!pending || pending.provider !== TICKET_FLOW) return null;
    const emailLower = String(pending.meta?.emailLower || '').toLowerCase();
    return emailLower ? { emailLower, mobile: true } : null;
  }

  app.get('/connect/start', async (req, reply) => {
    // Ni session ni billet valide : rien à rattacher. Retour à l'écran principal.
    const from = await starter(req);
    if (!from) return reply.redirect('/', 302);
    const check = byIp.hit(req.ip || 'unknown');
    const back = (error) => backTo(from.mobile, error);
    if (!check.allowed) return reply.redirect(back('too_many_attempts'), 302);

    const [settings, actions] = await Promise.all([app.settings.get(), app.settings.getActions()]);
    const provider = effectiveProvider(actions.connections?.provider);
    const conf = connectionCredentials(provider, settings);
    if (!conf) return reply.redirect(back('connect_not_configured'), 302);

    let endpoints;
    try {
      endpoints = await endpointsFor(provider, conf);
    } catch (err) {
      req.log?.error({ err, provider: provider.id }, 'découverte en échec (flux connexion)');
      return reply.redirect(back('connect_failed'), 302);
    }

    const url = await startOAuth(app, req, reply, {
      cookie: createStateCookie(app, provider.stateCookieName),
      flow: provider.flow,
      clientId: conf.clientId,
      redirectUri: `${publicOrigin(req, app.config)}${provider.callbackPath}`,
      endpoints,
      // Pas `provider.scopes` : l'administration peut retirer
      // `Sites.ReadWrite.All` de la demande (cf. lib/connections/providers.js).
      scopes: connectScopes(provider, actions.connections),
      // Le compte qui a INITIÉ le flux : le callback refuse d'attacher la
      // connexion à une autre session (onglet resté ouvert, poste partagé).
      // `mobile` dit au callback de ramener dans l'app par un deep link plutôt
      // que de laisser la personne devant le site, dans le navigateur système.
      meta: { emailLower: from.emailLower, ...(from.mobile ? { mobile: true } : {}) },
      extraParams: provider.extraParams,
    });
    return reply.redirect(url, 302);
  });

  // Callback Google : sous /api, au chemin historique déjà déclaré dans les
  // consoles Google Cloud (cf. lib/connections/providers.js). Celui de
  // Microsoft est monté par routes/oauth2.js, à la racine.
  app.get(
    CONNECT_PROVIDERS.google.callbackPath.replace(/^\/api/, ''),
    createConnectCallback(app, CONNECT_PROVIDERS.google),
  );

  /** Déconnexion : révocation chez le fournisseur (meilleur effort) puis suppression. */
  app.post('/connect/disconnect', async (req, reply) => {
    // Route mutante : même barrière CSRF que les routes d'authentification.
    if (!isSameOrigin(req)) return fail(reply, 403, 'forbidden');
    const user = requireUser(req, reply);
    if (!user) return undefined;

    const connections = await app.connections.listFor(user.emailLower);
    if (!connections.length) return fail(reply, 404, 'not_connected');
    for (const connection of connections) {
      await revokeAt(app, CONNECT_PROVIDERS[connection.provider], {
        refreshToken: connection.refreshToken,
      });
    }
    await app.connections.deleteAllFor(user.emailLower);
    return { ok: true };
  });
}
