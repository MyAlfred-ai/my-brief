/**
 * Groupes d'utilisateurs — réservés aux administrateurs.
 *
 * Même style que routes/admin/users.js (verbe dans le chemin, identifiant dans
 * le corps), même contrat d'erreur (lib/errors.js). Le modèle — un seul
 * groupe par compte, groupes fixes « Défaut » et « Admin », appartenance sur
 * le compte — est expliqué dans lib/repositories/groups.js ; ici on ne fait
 * qu'arbitrer ce que l'administration envoie.
 *
 * Les membres d'un groupe se LISENT par `GET /admin/users?group=<id>` : c'est
 * la même liste de comptes, avec la même projection publique et la même
 * recherche — une seconde route rendrait deux formes du même compte.
 */
import { requireAdmin } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { normalizeEmail } from '../../lib/repositories/users.js';
import {
  ADMIN_GROUP_ID,
  DEFAULT_GROUP_ID,
  GROUP_COLORS,
  GROUP_NAME_MAX,
  GROUP_DESCRIPTION_MAX,
  GROUPS_MAX,
  groupNameKey,
  toPublicGroup,
} from '../../lib/repositories/groups.js';
import {
  adminGroupCreateBody,
  adminGroupUpdateBody,
  adminGroupDeleteBody,
  adminGroupMembersBody,
} from '../auth/schemas.js';

/**
 * Vérifie nom, description et couleur d'un groupe ; renvoie le slug du refus
 * ou null. Le nom n'est vérifié que s'il est fourni (mise à jour partielle).
 */
function validateGroupInput({ name, description, color }) {
  if (name !== undefined) {
    const clean = String(name).trim().replace(/\s+/g, ' ');
    if (!clean) return { status: 400, code: 'name_required' };
    if (clean.length > GROUP_NAME_MAX)
      return { status: 400, code: 'name_too_long', extra: { max: GROUP_NAME_MAX } };
  }
  if (description !== undefined && String(description).trim().length > GROUP_DESCRIPTION_MAX)
    return { status: 400, code: 'description_too_long', extra: { max: GROUP_DESCRIPTION_MAX } };
  if (color !== undefined && !GROUP_COLORS.includes(color))
    return { status: 400, code: 'color_invalid' };
  return null;
}

export default function adminGroupsRoutes(app) {
  /** Un groupe avec son effectif — la forme que rendent toutes les routes. */
  async function publicWithCount(doc) {
    const counts = await app.users.groupMemberCounts();
    return toPublicGroup(doc, counts.get(doc.id) || 0);
  }

  /**
   * Catalogue + le vocabulaire dont l'écran a besoin (palette, plafond,
   * identifiants des deux groupes fixes) : servis ici pour qu'aucune seconde
   * source de vérité ne vive côté client.
   */
  app.get('/groups', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const [docs, counts] = await Promise.all([app.groups.list(), app.users.groupMemberCounts()]);
    return {
      groups: docs.map((doc) => toPublicGroup(doc, counts.get(doc.id) || 0)),
      colors: GROUP_COLORS,
      max: GROUPS_MAX,
      defaultId: DEFAULT_GROUP_ID,
      adminId: ADMIN_GROUP_ID,
    };
  });

  app.post('/groups/create', { schema: { body: adminGroupCreateBody } }, async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;
    const {
      name,
      description = '',
      color = GROUP_COLORS[0],
      meetingMinutesPerMonth = null,
      infographicAllowed = false,
      aiHelpAllowed = false,
      aiHelpMyBrainAllowed = false,
    } = req.body;
    const refused = validateGroupInput({ name, description, color });
    if (refused) return fail(reply, refused.status, refused.code, refused.extra);

    const existing = await app.groups.list();
    if (existing.some((g) => g.nameLower === groupNameKey(name)))
      return fail(reply, 409, 'duplicate_name');
    if (existing.length >= GROUPS_MAX)
      return fail(reply, 409, 'limit_reached', { count: existing.length, max: GROUPS_MAX });

    const doc = await app.groups.create({
      name,
      description,
      color,
      // Borné par le schéma ; `null` = illimité (cf. lib/quota.js).
      meetingMinutesPerMonth,
      infographicAllowed,
      aiHelpAllowed,
      aiHelpMyBrainAllowed,
      createdBy: admin.emailLower,
    });
    return reply.code(201).send({ group: toPublicGroup(doc, 0) });
  });

  /**
   * Le groupe par défaut se renomme, se recolore, se plafonne et perd ou
   * reçoit ses droits comme les autres : limiter « Défaut » est précisément la
   * façon de donner un quota de base à tout le monde, et lui retirer les
   * infographies, la façon de les réserver à quelques groupes.
   */
  app.post('/groups/update', { schema: { body: adminGroupUpdateBody } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const {
      id,
      name,
      description,
      color,
      meetingMinutesPerMonth,
      infographicAllowed,
      aiHelpAllowed,
      aiHelpMyBrainAllowed,
    } = req.body;
    const doc = await app.groups.findById(id);
    if (!doc) return fail(reply, 404, 'group_not_found');
    const refused = validateGroupInput({ name, description, color });
    if (refused) return fail(reply, refused.status, refused.code, refused.extra);

    if (name !== undefined) {
      const others = (await app.groups.list()).filter((g) => g.id !== id);
      if (others.some((g) => g.nameLower === groupNameKey(name)))
        return fail(reply, 409, 'duplicate_name');
    }

    const updated = await app.groups.update(id, {
      name,
      description,
      color,
      meetingMinutesPerMonth,
      infographicAllowed,
      aiHelpAllowed,
      aiHelpMyBrainAllowed,
    });
    return { group: await publicWithCount(updated) };
  });

  /**
   * Suppression. Les membres sont d'abord renvoyés dans le groupe par défaut,
   * puis le document part — cf. `users.detachGroup` pour l'ordre. Les deux
   * groupes fixes ne se suppriment pas : le groupe par défaut garantit qu'un
   * compte n'est jamais sans groupe, celui des administrateurs reçoit chaque
   * compte promu.
   */
  app.post('/groups/delete', { schema: { body: adminGroupDeleteBody } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.body;
    const doc = await app.groups.findById(id);
    if (!doc) return fail(reply, 404, 'group_not_found');
    if (doc.isDefault || id === DEFAULT_GROUP_ID) return fail(reply, 409, 'default_group');
    if (id === ADMIN_GROUP_ID) return fail(reply, 409, 'admin_group');

    await app.users.detachGroup(id);
    await app.groups.remove(id);
    return reply.code(204).send();
  });

  /**
   * Entrées et sorties d'un groupe, par adresse. Entrer ici fait quitter le
   * groupe précédent, sortir renvoie au groupe par défaut (cf.
   * `users.changeGroupMembers`). Tout ou rien : une adresse inconnue refuse
   * l'appel entier avant la moindre écriture, plutôt que d'appliquer la
   * moitié d'une sélection.
   */
  app.post('/groups/members', { schema: { body: adminGroupMembersBody } }, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id, add = [], remove = [] } = req.body;
    const doc = await app.groups.findById(id);
    if (!doc) return fail(reply, 404, 'group_not_found');

    const addLower = [...new Set(add.map(normalizeEmail))];
    const removeLower = [...new Set(remove.map(normalizeEmail))];
    const unknown = [];
    for (const emailLower of [...addLower, ...removeLower]) {
      if (!(await app.users.findByEmailLower(emailLower))) unknown.push(emailLower);
    }
    if (unknown.length) return fail(reply, 404, 'user_not_found', { unknown });

    const result = await app.users.changeGroupMembers(id, { add: addLower, remove: removeLower });
    return { group: await publicWithCount(doc), ...result };
  });
}
