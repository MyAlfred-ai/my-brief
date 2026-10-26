/**
 * Gestion des utilisateurs — réservée aux administrateurs.
 *
 * Style de routes aligné sur les 20 endpoints existants (verbe dans le chemin,
 * identifiant dans le corps) plutôt que REST/`:id` : ça évite d'encoder des
 * emails dans un chemin d'URL (`%40`, `+`, points) et d'exposer les `_id` que
 * tout le reste de l'API masque systématiquement.
 */
import { hashPassword, checkPasswordPolicy, generatePassword } from '../../lib/auth/password.js';
import { normalizeEmail, toPublicUser } from '../../lib/repositories/users.js';
import { requireAdmin } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { CONNECT_PROVIDERS } from '../../lib/connections/providers.js';
import {
  adminCreateBody,
  adminUpdateBody,
  adminResetBody,
  adminDeleteBody,
  adminListQuery,
} from '../auth/schemas.js';

/**
 * Empêche le verrouillage total de l'installation : rétrograder, désactiver ou
 * supprimer le dernier administrateur actif laisserait une application que plus
 * personne ne peut administrer.
 * @returns {Promise<boolean>} vrai si `doc` est le dernier admin actif
 */
async function isLastActiveAdmin(app, doc) {
  if (doc.role !== 'admin' || doc.disabled) return false;
  return (await app.users.countAdmins()) <= 1;
}

export default function adminUsersRoutes(app) {
  /**
   * Une appartenance vers un groupe qui n'existe plus (supprimé depuis un
   * autre onglet) est refusée plutôt qu'enregistrée en silence : le compte
   * afficherait un groupe fantôme jusqu'au prochain démarrage.
   * @returns {Promise<boolean>} vrai si la réponse d'erreur est déjà partie
   */
  async function refuseUnknownGroups(reply, groupIds) {
    if (groupIds === undefined) return false;
    const unknown = await app.groups.unknownIds(groupIds);
    if (!unknown.length) return false;
    fail(reply, 400, 'group_not_found', { unknown });
    return true;
  }

  app.get('/users', { schema: { querystring: adminListQuery } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { q = '', limit = 50, skip = 0, group = '' } = req.query || {};
    return app.users.list({ q, limit, skip, group });
  });

  /**
   * Création par un administrateur — il n'y a pas d'inscription publique.
   * Sans mot de passe fourni, on en génère un et on le renvoie UNE SEULE FOIS
   * (il n'est stocké que haché, il ne sera jamais réaffichable).
   */
  app.post('/users/create', { schema: { body: adminCreateBody } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { email, name, role = 'user', mustChangePassword = true, groupIds } = req.body;
    const emailLower = normalizeEmail(email);

    if (await app.users.findByEmailLower(emailLower)) return fail(reply, 409, 'email_taken');
    if (await refuseUnknownGroups(reply, groupIds)) return;

    const generated = !req.body.password;
    const password = req.body.password || generatePassword();
    const policy = checkPasswordPolicy(password, { email });
    if (!policy.ok) return fail(reply, 400, 'weak_password', { reason: policy.reason });

    const doc = await app.users.create({
      email,
      name,
      role,
      passwordHash: await hashPassword(password),
      mustChangePassword,
      groupIds,
    });

    return reply.code(201).send({
      user: toPublicUser(doc),
      ...(generated ? { generatedPassword: password } : {}),
    });
  });

  app.post('/users/update', { schema: { body: adminUpdateBody } }, async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;
    const emailLower = normalizeEmail(req.body.email);
    const doc = await app.users.findByEmailLower(emailLower);
    if (!doc) return fail(reply, 404, 'user_not_found');

    const { name, role, disabled, groupIds } = req.body;
    const losesAdmin = (role !== undefined && role !== 'admin') || disabled === true;
    if (losesAdmin && (await isLastActiveAdmin(app, doc))) return fail(reply, 409, 'last_admin');
    if (disabled === true && emailLower === admin.emailLower)
      return fail(reply, 409, 'self_target');
    if (await refuseUnknownGroups(reply, groupIds)) return;

    const updated = await app.users.update(emailLower, { name, role, disabled, groupIds });
    // Un compte désactivé ou rétrogradé ne doit pas garder de session ouverte
    // avec ses anciens droits jusqu'à sa prochaine reconnexion.
    if (disabled === true || (role !== undefined && role !== doc.role)) {
      await app.sessions.destroyAllFor(emailLower);
    }
    return { user: toPublicUser(updated) };
  });

  app.post('/users/reset-password', { schema: { body: adminResetBody } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const emailLower = normalizeEmail(req.body.email);
    const doc = await app.users.findByEmailLower(emailLower);
    if (!doc) return fail(reply, 404, 'user_not_found');

    const generated = !req.body.password;
    const password = req.body.password || generatePassword();
    const policy = checkPasswordPolicy(password, { email: doc.email });
    if (!policy.ok) return fail(reply, 400, 'weak_password', { reason: policy.reason });

    const updated = await app.users.setPassword(emailLower, {
      passwordHash: await hashPassword(password),
      mustChangePassword: req.body.mustChangePassword !== false,
    });
    // Un reset sert typiquement à reprendre la main sur un compte compromis :
    // les sessions ouvertes et les liens de réinitialisation en vol tombent.
    await app.sessions.destroyAllFor(emailLower);
    await app.resetTokens.purgeFor(emailLower);

    return {
      user: toPublicUser(updated),
      ...(generated ? { generatedPassword: password } : {}),
    };
  });

  /**
   * Suppression. `purgeData` supprime aussi les réunions, templates personnels
   * et configuration du compte — irréversible, l'écran d'administration exige
   * une confirmation par saisie de l'email avant de le poser.
   */
  app.post('/users/delete', { schema: { body: adminDeleteBody } }, async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;
    const emailLower = normalizeEmail(req.body.email);
    const doc = await app.users.findByEmailLower(emailLower);
    if (!doc) return fail(reply, 404, 'user_not_found');
    if (emailLower === admin.emailLower) return fail(reply, 409, 'self_target');
    if (await isLastActiveAdmin(app, doc)) return fail(reply, 409, 'last_admin');

    await app.sessions.destroyAllFor(emailLower);
    await app.resetTokens.purgeFor(emailLower);

    // Une connexion à un compte externe est un ACCÈS, pas une donnée métier :
    // elle se révoque et se supprime avec le compte, sans attendre `purgeData`
    // — au même titre que les sessions et les jetons de réinitialisation
    // ci-dessus. Sans ça, un compte supprimé sans purge laissait un refresh
    // token vivant sur le compte Google de l'ancien utilisateur.
    for (const connection of await app.connections.listFor(emailLower)) {
      if (CONNECT_PROVIDERS[connection.provider]?.revocable) {
        await app.gmailRevoke({ refreshToken: connection.refreshToken });
      }
    }
    await app.connections.deleteAllFor(emailLower);

    if (req.body.purgeData) await app.users.purgeUserData(doc.email);
    await app.users.remove(emailLower);

    return reply.code(204).send();
  });
}
