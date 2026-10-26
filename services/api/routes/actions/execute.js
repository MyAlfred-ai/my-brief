/**
 * Actions déclenchées par l'utilisateur sur une transcription ou un résumé —
 * les boutons paramétrés dans l'administration (onglet « Actions »).
 *
 * Le contenu vient du CLIENT, pas de la base : la transcription et le résumé
 * affichés peuvent porter des éditions locales pas encore persistées, et c'est
 * bien le document que l'utilisateur a sous les yeux qui doit partir.
 *
 * ── Règle sans exception ────────────────────────────────────────────────────
 * Le corps d'une requête /actions/* ne porte JAMAIS de destination : ni
 * destinataire, ni dossier. Les destinations viennent des réglages persistés
 * (lib/actions/resolve.js), pour trois raisons :
 *
 *   1. /actions/email est ouverte à tout compte authentifié. Un destinataire
 *      pris dans le corps en ferait un relais ouvert écrivant depuis l'adresse
 *      SPF-alignée du serveur, avec la réputation de l'exploitant ;
 *   2. un réglage persisté est un geste délibéré et auditable — sa route, son
 *      rate-limit, sa ligne de journal. Un champ du corps est à une CSRF près
 *      d'être contrôlé par un tiers ;
 *   3. la branche multipart n'a pas d'ajv, donc pas de `removeAdditional` :
 *      un champ de destination y serait forgeable trivialement.
 *
 * Chaque action revérifie côté serveur qu'elle est activée dans les réglages :
 * masquer un bouton n'est pas un contrôle d'accès. Le contrôle vit dans
 * lib/actions/execute.js, partagé avec le bouton « Tester ».
 */
import { requireUser } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { createRateLimiter } from '../../lib/auth/rateLimit.js';
import { jsonOnlyBody, readMultipartDocument } from '../../lib/actions/document.js';
import { executeEmail, executeStore } from '../../lib/actions/execute.js';

export default function actionsExecuteRoutes(app) {
  /**
   * Plafond par COMPTE, pas par IP : l'axe qui compte est « ce compte a écrit
   * 200 fois ce matin », pas « cette IP » — derrière un NAT d'entreprise, toute
   * une société sort par la même adresse.
   *
   * Il n'existait pas tant que la route ne pouvait écrire qu'au titulaire du
   * compte. Il devient nécessaire du jour où elle atteint des tiers.
   */
  const byAccount = createRateLimiter(app.config.rateLimits.actionEmailByAccount);
  app.addHook('onClose', async () => byAccount.stop());

  /**
   * Envoie le document aux destinataires résolus, via le compte relié de
   * l'utilisateur, sinon par le relais SMTP du serveur.
   *
   * La pièce jointe (multipart) est FACULTATIVE : le corps du mail porte déjà
   * tout le document. Un PDF que le navigateur n'a pas su fabriquer ne doit pas
   * priver l'utilisateur de son envoi.
   */
  app.post('/actions/email', { schema: { body: jsonOnlyBody } }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const quota = byAccount.hit(user.emailLower);
    if (!quota.allowed) {
      return fail(reply, 429, 'too_many_requests', { retryAfter: quota.retryAfterSec });
    }

    let document = req.body;
    let attachments;
    if (req.isMultipart()) {
      const parsed = await readMultipartDocument(req);
      if (parsed.error) {
        const status = parsed.error === 'attachment_too_large' ? 413 : 400;
        return fail(reply, status, parsed.error);
      }
      document = parsed.document;
      attachments = [parsed.file];
    }

    const result = await executeEmail(app, { user, document, attachments, log: req.log });
    if (result.error) return fail(reply, result.status, result.error, result.extra);
    // `degraded` remonte jusqu'au toast : un envoi amputé de ses destinataires
    // tiers reste un envoi réussi, mais l'utilisateur doit savoir que le
    // compte rendu n'est pas parti chez son client (cf. lib/actions/execute.js).
    // `to` : à qui il est RÉELLEMENT parti. Le toast disait « envoyé à » l'adresse
    // du compte, y compris quand la liste du tag l'avait envoyé à trois clients
    // — et ne le disait plus du tout quand il fallait le savoir. Ce sont les
    // destinataires de ses propres réglages : rien qu'il ne connaisse déjà.
    return { ok: true, via: result.via, degraded: result.degraded, to: result.recipients.to };
  });

  /**
   * Dépose le document sur le Drive du compte que l'utilisateur a relié.
   *
   * Contrairement au mail, le FICHIER est ici l'objet même de l'action : la
   * route n'accepte que le multipart.
   */
  app.post('/actions/store', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!req.isMultipart()) return fail(reply, 400, 'file_required');

    const parsed = await readMultipartDocument(req);
    if (parsed.error) {
      const status = parsed.error === 'attachment_too_large' ? 413 : 400;
      return fail(reply, status, parsed.error);
    }

    const result = await executeStore(app, {
      user,
      document: parsed.document,
      file: parsed.file,
      approved: parsed.approved,
      log: req.log,
    });
    // `approval_required` n'est pas un échec : c'est la destination résolue,
    // rendue à l'utilisateur pour qu'il la relise. Il repostera la même requête
    // avec `approved`. Un 409 plutôt qu'un 200 pour que le frontend ne
    // confonde jamais « déposé » et « à confirmer » — et surtout jamais 401/403,
    // que l'intercepteur traiterait comme une perte de session.
    if (result.error) return fail(reply, result.status, result.error, result.extra);
    return {
      ok: true,
      provider: result.provider,
      folder: result.folderPath,
      driveName: result.driveName,
      tag: result.tag,
    };
  });
}
