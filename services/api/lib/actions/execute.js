/**
 * Exécution des actions post-réunion — l'envoi par mail et le dépôt sur le
 * Drive du compte relié.
 *
 * Ces deux fonctions sont extraites des handlers de routes/actions/ pour une
 * raison précise : le bouton « Tester » doit exercer EXACTEMENT la même chaîne
 * que l'action réelle. Un bouton de test qui a son propre chemin d'exécution ne
 * prouve rien — il valide son propre chemin.
 *
 * Elles ne touchent jamais `reply` : elles renvoient soit un résultat, soit
 * `{error, status, extra}` que l'appelant passe à `fail()`. C'est ce qui permet
 * à la route de test d'en faire un diagnostic plutôt qu'une réponse d'erreur.
 *
 * Elles sont aussi les SEULES à appeler `resolveActionContext` : c'est ainsi
 * qu'on garantit qu'une destination réglée par l'utilisateur s'applique à
 * l'action réelle comme au test, sans que personne ait à y penser.
 *
 * Les seuls appelants légitimes sont routes/actions/execute.js (document réel)
 * et routes/actions/test.js (document factice).
 */
import { buildDocumentEmail } from '../mailer.js';
import { ConnectionAuthError } from '../connections/errors.js';
import { CONNECT_PROVIDERS, connectionCredentials } from '../connections/providers.js';
import { resolveStorageAccess } from '../connections/access.js';
import { resolveActionContext } from './resolve.js';
import { recordMailAttempt } from './mailLog.js';

const noopLog = { warn() {}, info() {} };

/**
 * Renomme la pièce jointe si un gabarit de nom a été résolu.
 *
 * Le renommage a lieu ICI et pas seulement côté client : c'est le seul point que
 * traversent les trois transports ET le dépôt Drive, donc le seul qui garantisse
 * un nom identique partout. Un client d'une version antérieure bénéficie du
 * gabarit sans avoir été mis à jour.
 *
 * ⚠️ L'EXTENSION SUIT LES OCTETS, jamais le gabarit. Le gabarit ne fournit que
 * le radical ; l'extension reste celle du fichier réellement transmis. Sans
 * cette règle, le document factice du bouton « Tester » — du texte — se
 * déposerait sous un nom en `.pdf` parce que le gabarit d'un résumé le prévoit,
 * et l'utilisateur trouverait un fichier illisible sur son Drive.
 */
function renamed(files, templated) {
  if (!templated || !files?.length) return files;
  const stem = templated.replace(/\.[^.]*$/, '');
  return files.map((file, index) => {
    if (index !== 0) return file;
    const ext = /\.([^.]+)$/.exec(file.filename || '')?.[1];
    return { ...file, filename: ext ? `${stem}.${ext}` : stem };
  });
}

/**
 * Destinataires effectifs sur le relais SMTP du serveur.
 *
 * Le `from` y est le `no-reply` de l'exploitant : écrire à un tiers engage sa
 * réputation SPF/DMARC pour un contenu choisi par un seul utilisateur. D'où
 * l'interrupteur `allowSmtpExternal`, faux par défaut.
 *
 * À faux, on dégrade le DESTINATAIRE, jamais l'envoi : ce chemin est aussi
 * celui qu'emprunte un envoi dont le jeton Gmail vient d'être révoqué en vol, et
 * le refuser ferait perdre l'envoi au pire moment. La dégradation n'est pas
 * silencieuse — elle remonte dans la réponse, donc dans le toast.
 */
function applySmtpPolicy(ctx, user) {
  const self = String(user.email || '').toLowerCase();
  const addresses = [...ctx.recipients.to, ...ctx.recipients.cc];
  const external = addresses.some((address) => String(address).toLowerCase() !== self);

  if (!external) return { to: ctx.recipients.to, cc: [], replyTo: null, degraded: null };
  if (ctx.policy.allowSmtpExternal) {
    // Sans `replyTo`, une réponse d'un destinataire tiers atterrit sur le
    // `no-reply` du serveur, c'est-à-dire nulle part.
    return {
      to: ctx.recipients.to,
      cc: ctx.recipients.cc,
      replyTo: user.email,
      degraded: null,
    };
  }
  return { to: [user.email], cc: [], replyTo: null, degraded: 'smtp_recipients_dropped' };
}

/**
 * Envoie le document aux destinataires résolus, via le compte relié de
 * l'utilisateur s'il en a un, sinon par le relais SMTP du serveur.
 *
 * Une connexion révoquée chez le fournisseur est supprimée au vol, puis on
 * retombe sur le SMTP si possible : l'utilisateur ne doit pas perdre son envoi
 * parce qu'un jeton a expiré entre deux clics.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{user: object, document: object,
 *   attachments?: Array<{filename: string, content: Buffer, contentType: string}>,
 *   log?: {warn: Function, info: Function}}} params
 * @returns {Promise<{ok: true, via: 'gmail'|'microsoft'|'smtp', from: string,
 *   recipients: {to: string[], cc: string[]}, recipientsSource: string,
 *   subject: string, subjectSource: string, degraded: string|null}
 *   | {error: string, status: number, extra?: object}>}
 */
export async function executeEmail(
  app,
  { user, document, attachments, ignorePersonal, log = noopLog },
) {
  const { kind, title, content, lang } = document;

  const ctx = await resolveActionContext(app, { user, document, ignorePersonal });
  if (!ctx.toggles.email) return { error: 'action_disabled', status: 403 };

  const connection = await app.connections.get(user.emailLower);
  if (!connection && !app.mailer?.enabled) return { error: 'mailer_disabled', status: 501 };

  const message = buildDocumentEmail({ kind, title, content, lang, subject: ctx.subject.value });
  const files = renamed(attachments, ctx.filename.value);

  const trace = (via, from, to, cc, ok, error, degraded) =>
    recordMailAttempt(app, {
      user,
      kind,
      via,
      from,
      to,
      cc,
      subject: message.subject,
      ok,
      error,
      degraded,
      log,
    });

  if (connection) {
    const provider = CONNECT_PROVIDERS[connection.provider];
    const conf = connectionCredentials(provider, await app.settings.get()) || {};
    const via = connection.provider === 'microsoft' ? 'microsoft' : 'gmail';
    const { to, cc } = ctx.recipients;
    try {
      if (connection.provider === 'microsoft') {
        await app.graphSend({
          credentials: conf,
          refreshToken: connection.refreshToken,
          to,
          cc,
          ...message,
          attachments: files,
        });
      } else {
        await app.gmailSend({
          clientId: conf.clientId,
          clientSecret: conf.clientSecret,
          refreshToken: connection.refreshToken,
          from: connection.account,
          to,
          cc,
          ...message,
          attachments: files,
        });
      }
      await trace(via, connection.account, to, cc, true, null, null);
      return {
        ok: true,
        via,
        from: connection.account,
        recipients: { to, cc },
        recipientsSource: ctx.recipients.source,
        subject: message.subject,
        subjectSource: ctx.subject.source,
        degraded: null,
      };
    } catch (err) {
      if (!(err instanceof ConnectionAuthError)) {
        log.warn({ err: err.message }, "échec d'envoi via le compte relié");
        await trace(via, connection.account, to, cc, false, err.message, null);
        return { error: 'mail_send_failed', status: 502 };
      }
      // Accès retiré côté fournisseur : on purge pour que « Ma configuration »
      // montre « non connecté » au lieu d'échouer en boucle.
      await app.connections.delete(user.emailLower, connection.provider);
      log.warn('connexion révoquée, purge de la connexion');
      if (!app.mailer?.enabled) {
        await trace(via, connection.account, to, cc, false, 'gmail_disconnected', null);
        return { error: 'gmail_disconnected', status: 502 };
      }
    }
  }

  const smtp = applySmtpPolicy(ctx, user);
  try {
    await app.mailer.sendDocument({
      to: smtp.to,
      cc: smtp.cc,
      ...(smtp.replyTo ? { replyTo: smtp.replyTo } : {}),
      kind,
      title,
      content,
      lang,
      subject: ctx.subject.value || undefined,
      attachments: files,
    });
  } catch (err) {
    log.warn({ err: err.message }, "échec d'envoi d'un document par mail");
    await trace('smtp', '', smtp.to, smtp.cc, false, err.message, smtp.degraded);
    return { error: 'mail_send_failed', status: 502 };
  }
  await trace('smtp', '', smtp.to, smtp.cc, true, null, smtp.degraded);
  return {
    ok: true,
    via: 'smtp',
    from: '',
    recipients: { to: smtp.to, cc: smtp.cc },
    recipientsSource: ctx.recipients.source,
    subject: message.subject,
    subjectSource: ctx.subject.source,
    degraded: smtp.degraded,
  };
}

/**
 * Dépose le document sur le Drive du compte que l'utilisateur a relié.
 *
 * Le FOURNISSEUR vient de l'administration, le DOSSIER de l'utilisateur (à
 * défaut, de l'administration), le COMPTE de l'utilisateur — et le slug d'erreur
 * distingue lequel manque : c'est la différence entre « appelle ton admin » et
 * « relie ton compte ».
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{user: object, document: object,
 *   file: {filename: string, content: Buffer, contentType: string},
 *   log?: {warn: Function, info: Function}}} params
 * @returns {Promise<{ok: true, provider: string, folderPath: string,
 *   folderSource: string, filename: string, cacheUsed: boolean}
 *   | {error: string, status: number, extra?: object}>}
 */
export async function executeStore(
  app,
  { user, document, file, ignorePersonal, approved = false, log = noopLog },
) {
  const ctx = await resolveActionContext(app, { user, document, ignorePersonal });
  if (!ctx.toggles.storage) return { error: 'action_disabled', status: 403 };

  const providerId = ctx.provider;
  const access = await resolveStorageAccess(app, { user, providerId });
  if (access.error) return access;
  const { connection, credentials } = access;

  const [stored] = renamed([file], ctx.filename.value);

  /**
   * Ce que l'utilisateur verra AVANT que quoi que ce soit ne parte, et ce que
   * la réponse répète après. Les deux sortent du même objet : un écran
   * d'approbation qui annoncerait autre chose que la destination réelle serait
   * pire que pas d'approbation du tout.
   */
  const plan = {
    provider: providerId,
    account: connection.account,
    folder: ctx.folder.path,
    folderSource: ctx.folder.source,
    driveName: ctx.folder.driveName,
    filename: stored.filename,
    tag: ctx.tag?.label || '',
  };

  // Rien n'est écrit tant que l'accord n'est pas donné — pas même le dossier,
  // que `ensureFolderPath` créerait au premier appel du fournisseur.
  if (ctx.requireApproval && !approved) {
    return { error: 'approval_required', status: 409, extra: { plan } };
  }

  try {
    const result = await app.driveStore({
      provider: providerId,
      credentials,
      connection,
      folderPath: ctx.folder.path,
      driveId: ctx.folder.driveId,
      file: stored,
    });
    // Le dossier RÉSOLU est mémorisé pour les dépôts suivants — jamais la valeur
    // des réglages : c'est le chemin effectivement utilisé qui sert de clé
    // d'invalidation, et c'est ce qui fait qu'un changement de dossier (par
    // l'utilisateur comme par l'administration) est pris en compte au dépôt
    // suivant sans purge manuelle.
    if (!result.cacheUsed) {
      await app.connections.setDriveCache(user.emailLower, providerId, {
        folderPath: result.folderPath,
        folderId: result.folderId,
        driveId: ctx.folder.driveId,
      });
    }
    return {
      ok: true,
      ...plan,
      // Ce qui a RÉELLEMENT été écrit, pas ce qui était demandé : les deux
      // diffèrent quand la destination est la racine d'un Drive partagé et que
      // le dossier intégré s'applique. `folder` (issu du plan) suit, sinon la
      // confirmation annoncerait une destination vide.
      folder: result.resolvedPath || plan.folder,
      folderPath: result.resolvedPath || result.folderPath,
      cacheUsed: !!result.cacheUsed,
    };
  } catch (err) {
    if (err instanceof ConnectionAuthError) {
      // Accès retiré : on purge pour que « Ma configuration » montre
      // « non connecté » au lieu d'échouer à chaque dépôt.
      await app.connections.delete(user.emailLower, providerId);
      log.warn({ provider: providerId }, 'connexion révoquée, purge de la connexion');
      return { error: 'storage_auth_revoked', status: 502 };
    }
    log.warn({ err: err.message, provider: providerId }, 'échec du dépôt du document');
    return { error: 'storage_upload_failed', status: 502 };
  }
}
