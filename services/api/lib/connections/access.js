/**
 * Ce qu'il faut réunir pour toucher au stockage d'un utilisateur : le
 * fournisseur retenu par l'organisation, la connexion de CE fournisseur, ses
 * scopes, et les identifiants OAuth du déploiement.
 *
 * Extrait de `executeStore` quand la navigation est arrivée : les deux chemins
 * exigent exactement les mêmes quatre choses, et le slug d'erreur — qui est ce
 * qui fait la différence entre « appelle ton admin » et « relie ton compte » —
 * doit être le MÊME des deux côtés. Deux copies auraient divergé au premier
 * ajout.
 */
import { CONNECT_PROVIDERS, connectionCredentials, hasScope, hasAnyScope } from './providers.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{user: object, providerId: string, requireBrowse?: boolean}} params
 * @returns {Promise<{provider: object, providerId: string, connection: object,
 *   credentials: object} | {error: string, status: number, extra?: object}>}
 */
export async function resolveStorageAccess(app, { user, providerId, requireBrowse = false }) {
  if (!providerId) return { error: 'storage_not_configured', status: 501 };

  // La connexion doit être celle du fournisseur retenu : un compte Google relié
  // avant une bascule vers Microsoft ne sait pas déposer sur OneDrive.
  const provider = CONNECT_PROVIDERS[providerId];
  const connection = await app.connections.getByProvider(user.emailLower, providerId);
  if (!connection || !provider) {
    return { error: 'storage_not_connected', status: 501, extra: { provider: providerId } };
  }

  // Connexion héritée de l'époque « Gmail seul » : elle envoie des mails mais
  // n'a jamais reçu l'autorisation d'écrire sur le Drive. `hasScope` et non
  // `includes` : Entra ne rend pas les scopes sous la forme demandée (cf.
  // lib/connections/providers.js).
  if (!hasScope(connection.scopes, provider.driveScope)) {
    return { error: 'storage_scope_missing', status: 501, extra: { provider: providerId } };
  }

  // Connexion nouée avant la fenêtre de navigation : elle DÉPOSE parfaitement,
  // elle ne sait simplement pas parcourir. Un slug distinct pour que l'écran
  // propose « reconnecte ton compte pour parcourir » au lieu de laisser croire
  // que le dépôt est cassé — et pour que la saisie du chemin reste offerte.
  //
  // N'IMPORTE LEQUEL de la liste suffit : chez Google, `drive.readonly` a
  // remplacé `drive.metadata.readonly` dans la demande, et les connexions
  // antérieures ne portent que le second sans avoir rien perdu. Une liste VIDE
  // (Microsoft) veut dire que déposer et parcourir demandent le même scope.
  const browseScopes = provider.browseScopes || [];
  if (requireBrowse && browseScopes.length && !hasAnyScope(connection.scopes, browseScopes)) {
    return { error: 'browse_scope_missing', status: 501, extra: { provider: providerId } };
  }

  const credentials = connectionCredentials(provider, await app.settings.get());
  if (!credentials) return { error: 'storage_not_configured', status: 501 };

  return { provider, providerId, connection, credentials };
}
