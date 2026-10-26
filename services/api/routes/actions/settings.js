/**
 * Réglages d'actions d'un UTILISATEUR — destinataires du mail, dossier de
 * dépôt, gabarits d'objet et de nom de fichier, et la fenêtre « Et
 * maintenant ? » qui suit le premier résumé (`afterSummary.offer`).
 *
 * Ce qui n'est PAS ici : les interrupteurs (activer/désactiver un bouton) et le
 * fournisseur de compte externe. Ce sont des réglages d'organisation, et
 * l'administration est un PLAFOND — un utilisateur affine dans ses limites, il
 * ne rouvre pas ce qu'elle a fermé. La route renvoie ce plafond (`ceiling`)
 * pour que l'écran n'affiche pas des réglages sans effet.
 *
 * ── Pourquoi les destinataires vivent ici, et pas dans la requête d'envoi ───
 * Parce que c'est ce qui les rend auditables : leur propre route, sa barrière
 * d'origine, son refus explicite, sa trace. Un destinataire pris dans le corps
 * d'un envoi serait à une CSRF près d'être choisi par un tiers, et la branche
 * multipart de l'envoi n'a même pas d'ajv pour le retirer. Cf. l'en-tête de
 * routes/actions/execute.js.
 */
import { requireUser } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { isSameOrigin } from '../../lib/auth/originCheck.js';
import { normalizeRecipients } from '../../lib/actions/recipients.js';
import {
  ACTION_VARIABLES,
  TEMPLATE_MAX,
  listTemplateVariables,
} from '../../lib/actions/templating.js';
import { FOLDER_MAX } from '../../lib/repositories/userActions.js';
import { userActionsSettingsBody } from '../auth/schemas.js';

/**
 * Vocabulaire dont le frontend a besoin pour composer l'écran : plafonds,
 * variables admises, et ce que l'administration autorise.
 *
 * Le servir ici évite une seconde source de vérité côté client, qui divergerait
 * au premier ajout de variable — même raison que la palette de `GET /tags`.
 */
function context(admin) {
  return {
    // Ce que l'administration laisse ouvert. Un contexte où le mail est fermé
    // pour les deux types de documents ne doit pas afficher un champ
    // « destinataires » qui ne servira jamais.
    ceiling: {
      email: !!(admin.transcription.email || admin.summary.email),
      storage: !!(admin.transcription.storage || admin.summary.storage),
    },
    limits: {
      maxRecipients: admin.mail.maxRecipients,
      templateMax: TEMPLATE_MAX,
      folderMax: FOLDER_MAX,
    },
    variables: ACTION_VARIABLES.map(({ key }) => key),
    // Valeurs d'organisation : ce sur quoi l'utilisateur retombe s'il ne règle
    // rien. Ni le dossier admin ni la politique SMTP n'en font partie — le
    // dossier reste réservé à l'administration, et la politique se manifeste au
    // moment de l'envoi (`degraded`), pas dans un formulaire.
    defaults: {
      subjectTemplate: admin.mail.subjectTemplate,
      filenameTemplate: admin.naming.filenameTemplate,
    },
  };
}

export default function actionsSettingsRoutes(app) {
  app.get('/actions/settings', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;

    const admin = await app.settings.getActions();
    const settings = await app.userActions.get(user.email, {
      maxRecipients: admin.mail.maxRecipients,
    });
    return { settings, ...context(admin) };
  });

  app.post(
    '/actions/settings',
    { schema: { body: userActionsSettingsBody } },
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return undefined;
      // Seconde barrière CSRF, gratuite et tolérante aux appels sans Origin
      // (curl, app.inject) — cf. lib/auth/originCheck.js.
      if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');

      const admin = await app.settings.getActions();
      const patch = {};

      if (req.body.mail?.recipients !== undefined) {
        const { recipients, rejected, truncated } = normalizeRecipients(req.body.mail.recipients, {
          max: admin.mail.maxRecipients,
        });
        // Refusé et NOMMÉ, plutôt que filtré en silence : une adresse mal
        // saisie qui disparaît du formulaire ressemble à un bug, et
        // l'utilisateur la ressaisit à l'identique.
        if (rejected.length) return fail(reply, 400, 'recipient_invalid', { rejected });
        if (truncated) {
          return fail(reply, 400, 'recipients_limit_reached', { max: admin.mail.maxRecipients });
        }
        patch.mail = { ...patch.mail, recipients };
      }

      // Destinataires par tag. Mêmes règles que la liste par défaut, tag par
      // tag — et le refus NOMME le tag concerné : « adresse invalide » sans
      // dire dans quelle liste oblige à toutes les rouvrir.
      if (req.body.mail?.tagRecipients !== undefined) {
        const entries = [];
        for (const entry of req.body.mail.tagRecipients) {
          const { recipients, rejected, truncated } = normalizeRecipients(entry.recipients, {
            max: admin.mail.maxRecipients,
          });
          if (rejected.length) {
            return fail(reply, 400, 'recipient_invalid', { rejected, tagId: entry.tagId });
          }
          if (truncated) {
            return fail(reply, 400, 'recipients_limit_reached', {
              max: admin.mail.maxRecipients,
              tagId: entry.tagId,
            });
          }
          entries.push({ tagId: entry.tagId, recipients });
        }
        patch.mail = { ...patch.mail, tagRecipients: entries };
      }

      for (const [template, field] of [
        [req.body.mail?.subjectTemplate, 'mail.subjectTemplate'],
        [req.body.naming?.filenameTemplate, 'naming.filenameTemplate'],
      ]) {
        if (template === undefined) continue;
        const { unknown } = listTemplateVariables(template);
        if (unknown.length) {
          return fail(reply, 400, 'template_variable_unknown', { field, unknown });
        }
      }

      if (req.body.mail?.subjectTemplate !== undefined) {
        patch.mail = { ...patch.mail, subjectTemplate: req.body.mail.subjectTemplate };
      }
      // Le stockage est recopié champ par champ, et non d'un `...req.body.storage` :
      // le schéma borne déjà la forme, mais un patch partiel doit rester partiel
      // (régler l'approbation ne doit pas effacer le dossier).
      for (const field of [
        'folder',
        'driveId',
        'driveName',
        'requireApproval',
        'tagSubfolders',
        'tagFolders',
      ]) {
        if (req.body.storage?.[field] !== undefined) {
          patch.storage = { ...patch.storage, [field]: req.body.storage[field] };
        }
      }
      if (req.body.naming?.filenameTemplate !== undefined) {
        patch.naming = { filenameTemplate: req.body.naming.filenameTemplate };
      }
      if (req.body.afterSummary?.offer !== undefined) {
        patch.afterSummary = { offer: req.body.afterSummary.offer };
      }

      const settings = await app.userActions.update(user.email, patch);
      return { settings, ...context(admin) };
    },
  );
}
