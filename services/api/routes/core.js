/**
 * Routes cœur : /init, /ping, /logout.
 */
import { requireEmail } from '../lib/identity.js';
import { normalizeEmail, SERVED_ACCOUNT } from '../lib/repositories/users.js';
import { DEFAULT_GROUP_ID } from '../lib/repositories/groups.js';
import { clearSessionCookie } from '../lib/auth/cookies.js';
import { authModeOf, authProviderOf } from '../lib/auth/resolve.js';

export default function coreRoutes(app) {
  /**
   * Bootstrap utilisateur — appelé à chaque ouverture de l'app.
   * Upsert du compte (collection `user`) et renvoi de l'identité au frontend.
   * `lastConnecion` (faute de frappe d'origine) est le nom de champ historique
   * en base — conservé partout (cf. src/utils/historyTitle.js).
   *
   * ⚠️ Mise à jour PARTIELLE, jamais un remplacement : ce handler tourne à
   * chaque ouverture de l'app, et un findOneAndReplace effacerait `passwordHash`
   * et `role` à chaque fois — le compte se retrouverait sans mot de passe et
   * rétrogradé sans que rien ne le signale.
   *
   * `name` est en $setOnInsert : un renommage fait depuis l'administration doit
   * survivre à la prochaine ouverture de l'app (avant, il était réécrit avec la
   * partie locale de l'email).
   */
  app.get('/init', async (req, reply) => {
    const email = requireEmail(req, reply);
    if (!email) return;
    const now = new Date().toISOString();
    const emailLower = normalizeEmail(email);
    // Photo publiée par le plugin OIDC (en-tête X-User-Picture) : recopiée sur
    // le compte, pour survivre à une connexion ultérieure par mot de passe.
    // Une session native la lit déjà sur le compte — rien à réécrire.
    const headerPicture = req.user?.source === 'headers' ? req.user.picture : '';
    // Le filtre vise le compte SERVI : un doublon inerte de même adresse (cf.
    // SERVED_ACCOUNT) passé devant lui dans l'ordre naturel recevait sinon le
    // `$set: { emailLower }`, refusé par l'index unique — /init tombait en 500
    // et l'utilisateur était déconnecté à chaque ouverture. Sans compte servi,
    // l'upsert crée le compte comme avant (`email` vient de l'égalité).
    await app.db.collection('user').updateOne(
      { email, ...SERVED_ACCOUNT },
      {
        $set: {
          emailLower,
          lastConnecion: now,
          updatedAt: now,
          ...(headerPicture ? { picture: headerPicture } : {}),
        },
        $setOnInsert: {
          name: email.split('@')[0],
          role: 'user',
          disabled: false,
          authProviders: [req.user?.source === 'session' ? 'password' : 'oidc'],
          mustChangePassword: false,
          // Un compte créé par sa première connexion naît dans le groupe par
          // défaut, comme un compte créé par l'administration.
          groupIds: [DEFAULT_GROUP_ID],
          createdAt: now,
        },
      },
      { upsert: true },
    );
    // Relecture après l'upsert : le nom affiché est celui du document (donc
    // celui qu'un admin a pu poser), pas le `name` de l'en-tête OIDC — c'était
    // déjà la partie locale de l'email qui était renvoyée avant.
    const doc = await app.users.findByEmailLower(emailLower);
    return {
      email,
      name: doc?.name || email.split('@')[0],
      role: doc?.role || req.user?.role || 'user',
      // Le frontend s'en sert pour savoir s'il doit déconnecter via /api/auth/logout
      // (session native) ou via le RP-logout OIDC de Traefik, et s'il peut
      // proposer un changement de mot de passe (cf. lib/auth/resolve.js).
      authMode: authModeOf(req.user),
      // Raffinement d'`authMode` : quel fournisseur exactement (Google, Entra,
      // mot de passe…). Le frontend en tire l'avatar affiché.
      authProvider: authProviderOf(req.user),
      // Photo de l'avatar ; vide ⇒ initiales.
      picture: doc?.picture || req.user?.picture || '',
      mustChangePassword: !!doc?.mustChangePassword,
      // Les groupes du compte, nom et couleur compris : c'est ce que le menu
      // de compte affiche, et l'utilisateur n'a pas accès aux routes
      // d'administration pour traduire des identifiants.
      groups: await app.groups.forUser(doc),
      // Droits tenus des groupes (cf. `rightsOf`) : la case « Générer une
      // infographie » en dépend, avec l'interrupteur général de l'onglet IA
      // que l'écran lit dans les capacités de l'installation.
      rights: await app.groups.rightsForUser(doc),
      // Minutes de réunion restantes ce mois-ci (cf. lib/quota.js) : l'écran
      // les montre en bas à gauche dès l'ouverture, sans second appel.
      quota: await app.quota.statusFor({ email, doc }),
      lastConnecion: now,
    };
  });

  /**
   * Sonde de vivacité — appelée toutes les 2 min par le frontend pour détecter
   * la perte de session (exclue du gestionnaire d'échec, cf. httpErrorHandler).
   */
  app.get('/ping', async () => ({ ok: true }));

  /**
   * Déconnexion. Historiquement un no-op : la session était le cookie OIDC géré
   * par Traefik (web) ou le JWT local (mobile), il n'y avait rien à fermer ici.
   * Elle détruit désormais la session native si la requête en porte une —
   * l'appel best-effort du frontend (App.svelte) n'a pas eu à changer.
   */
  app.post('/logout', async (req, reply) => {
    if (req.user?.sessionToken) {
      await app.sessions.destroy(req.user.sessionToken);
      clearSessionCookie(reply, { secure: app.config.cookieSecure });
    }
    reply.code(204).send();
  });
}
