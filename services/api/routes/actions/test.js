/**
 * Bouton « Tester » — exécute RÉELLEMENT une action avec un document factice.
 *
 * Ce n'est pas une prévisualisation. Un aperçu dit ce qui partirait ; il ne dit
 * pas si le jeton est encore valide, si le dossier existe, si le relais répond,
 * si le domaine du destinataire accepte le message. Ce sont précisément les
 * pannes qu'on cherche.
 *
 * ── Ce que ce fichier n'a PAS le droit de faire ────────────────────────────
 * Résoudre un paramètre, construire un message, choisir un transport. Tout cela
 * appartient à lib/actions/execute.js, partagé avec l'action réelle. Un bouton
 * de test qui refait ces gestes à sa façon valide sa propre façon de les faire.
 * Aucune occurrence de `resolveActionContext`, `buildDocumentEmail`,
 * `app.gmailSend`, `app.graphSend`, `app.mailer` ni `app.driveStore` ne doit
 * apparaître ici.
 *
 * ── Une seule route, jamais « au nom d'un autre » ──────────────────────────
 * Un administrateur teste EN TANT QUE LUI-MÊME. Tester au nom d'un tiers
 * demanderait son refresh token et déposerait un message dans ses « Envoyés »
 * sans qu'il ait rien demandé. `scope: 'admin'` ne change pas d'identité : il
 * ignore la surcharge personnelle du demandeur pour n'exercer que les valeurs
 * d'organisation — « ce que voit quelqu'un qui n'a rien réglé ».
 */
import { requireUser } from '../../lib/rbac.js';
import { fail } from '../../lib/errors.js';
import { isSameOrigin } from '../../lib/auth/originCheck.js';
import { createRateLimiter } from '../../lib/auth/rateLimit.js';
import { buildTestDocument } from '../../lib/actions/testDocument.js';
import { executeEmail, executeStore } from '../../lib/actions/execute.js';
import { actionTestBody } from '../auth/schemas.js';

export default function actionsTestRoutes(app) {
  // Serré : c'est un geste de diagnostic, pas un usage. La charge est fixe
  // (quelques centaines d'octets), donc seul le nombre compte. Clé par compte
  // ET par IP — la première est l'axe qui compte, la seconde attrape la
  // création de comptes en série.
  const byAccount = createRateLimiter(app.config.rateLimits.actionTestByAccount);
  const byIp = createRateLimiter(app.config.rateLimits.actionTestByIp);
  app.addHook('onClose', async () => {
    byAccount.stop();
    byIp.stop();
  });

  app.post('/actions/test', { schema: { body: actionTestBody } }, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return undefined;
    if (!isSameOrigin(req)) return fail(reply, 403, 'bad_origin');

    const { target, kind = 'summary', lang = 'fr', scope = 'user' } = req.body;
    if (scope === 'admin' && user.role !== 'admin') return fail(reply, 403, 'forbidden');

    for (const [limiter, key] of [
      [byAccount, user.emailLower],
      [byIp, req.ip || 'unknown'],
    ]) {
      const quota = limiter.hit(key);
      if (!quota.allowed) {
        return fail(reply, 429, 'too_many_requests', { retryAfter: quota.retryAfterSec });
      }
    }

    const { document, file } = buildTestDocument({ user, kind, lang });
    const ignorePersonal = scope === 'admin';

    if (target === 'email') {
      const result = await executeEmail(app, {
        user,
        document,
        attachments: [file],
        ignorePersonal,
        log: req.log,
      });
      if (result.error) return fail(reply, result.status, result.error, result.extra);
      // Assez pour diagnostiquer sans ouvrir les journaux : par où c'est parti,
      // depuis quelle boîte, vers qui, sous quel objet, et d'où viennent ces
      // valeurs.
      return {
        ok: true,
        target,
        via: result.via,
        from: result.from,
        recipients: result.recipients,
        recipientsSource: result.recipientsSource,
        subject: result.subject,
        subjectSource: result.subjectSource,
        degraded: result.degraded,
      };
    }

    const result = await executeStore(app, { user, document, file, ignorePersonal, log: req.log });
    if (result.error) return fail(reply, result.status, result.error, result.extra);
    // `folderPath` est caché aux non-administrateurs par la projection publique
    // des réglages — mais /actions/store le renvoie DÉJÀ après un dépôt réussi.
    // La projection protège l'avant-exécution, pas l'après : quelqu'un qui vient
    // de déposer un fichier sait où il l'a mis. Ne pas « corriger » l'un des
    // deux côtés sans l'autre.
    return {
      ok: true,
      target,
      provider: result.provider,
      folderPath: result.folderPath,
      folderSource: result.folderSource,
      filename: result.filename,
      cacheUsed: result.cacheUsed,
    };
  });
}
