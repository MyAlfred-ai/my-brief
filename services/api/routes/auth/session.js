/**
 * Sondes publiques du frontend au démarrage : capacités du serveur et état de
 * la session.
 */
import { MIN_PASSWORD_LENGTH } from '../../lib/auth/password.js';
import { toSessionUser } from '../../lib/repositories/users.js';
import { isProviderUsable } from '../../lib/auth/providers.js';
import { authModeOf, authProviderOf } from '../../lib/auth/resolve.js';

export default function sessionRoutes(app) {
  /**
   * Ce que le serveur sait faire — pilote l'écran de connexion : bouton SSO
   * affiché ou non, lien « mot de passe oublié » affiché ou non. Le frontend ne
   * devine rien, il demande.
   */
  app.get('/config', async () => {
    const settings = await app.settings.get();
    return {
      // SSO du plugin Traefik — l'environnement le déclare (l'API n'a aucun
      // moyen de savoir si le plugin est monté), l'administration peut ensuite
      // masquer le bouton (onglet Authentification, carte « Page de
      // connexion »). À retirer une fois la bascule native faite partout.
      oidcEnabled: !!app.config.oidcEnabled && settings.legacySso.enabled,
      // Fournisseurs joués par l'API : il faut les identifiants ET l'activation
      // (cf. lib/auth/providers.js — afficher un bouton qui échouerait au
      // premier clic est pire que ne rien afficher).
      googleEnabled: isProviderUsable('google', settings),
      entraEnabled: isProviderUsable('entra', settings),
      // Même logique à deux étages que le SSO historique : déclaré par
      // l'environnement, affiché par l'administration.
      passwordLoginEnabled: !!app.config.passwordLoginEnabled && settings.passwordLogin.enabled,
      passwordResetEnabled: !!app.mailer?.enabled,
      passwordPolicy: { minLength: MIN_PASSWORD_LENGTH },
      // Actions proposées après chaque réunion / résumé (administration,
      // onglet « Actions ») : pilote l'affichage des boutons. Projection sans
      // le dossier cible — cette route est publique.
      actions: app.settings.toPublicActionsSettings(await app.settings.getActions(), {
        mailerEnabled: !!app.mailer?.enabled,
      }),
      // Apparence (logo, phrase d'accueil, couleur primaire) : servie ICI et
      // non par une route dédiée, parce que l'écran de connexion la porte déjà
      // — elle doit arriver avant toute identité. Projection sans `updatedBy`,
      // cette route est publique.
      branding: app.settings.toPublicBrandingSettings(await app.settings.getBranding()),
      // Infographie de compte rendu (Administration → IA) : pilote l'affichage
      // de la case « Générer une infographie » du panneau de génération. Une
      // capacité de l'installation, rien de secret — même statut que `actions`.
      infographic: { enabled: await app.settings.infographicEnabled() },
      // Formulaire de remontées de l'installation (FEEDBACK_URL) : vide, le
      // menu n'affiche pas « Déclarer un bug ou une idée ».
      feedbackUrl: app.config.feedbackUrl || '',
      // Documentation ouverte par « Aide » (DOCS_URL).
      docsUrl: app.config.docsUrl || '',
    };
  });

  /**
   * ⚠️ Ne renvoie JAMAIS 401 : c'est la sonde appelée au tout premier
   * chargement, avant de savoir si l'utilisateur est connecté. Un 401 ici
   * déclencherait le gestionnaire d'échec d'authentification du frontend
   * (src/utils/httpErrorHandler.js) et ferait clignoter l'app au démarrage.
   */
  app.get('/session', async (req) => {
    if (!req.user?.email) return { authenticated: false };
    return {
      authenticated: true,
      user: toSessionUser(req.user.doc || req.user, {
        authMode: authModeOf(req.user),
        authProvider: authProviderOf(req.user),
        groups: await app.groups.forUser(req.user.doc),
        rights: await app.groups.rightsForUser(req.user.doc),
      }),
    };
  });
}
