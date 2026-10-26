/**
 * Envoi d'un email via l'API Gmail, au nom d'un utilisateur qui a autorisé
 * l'application (scope `gmail.send` uniquement — jamais de lecture).
 *
 * Pas de SDK googleapis : deux appels REST suffisent (rafraîchir l'access
 * token, poster le message). nodemailer est déjà une dépendance — son
 * MailComposer fabrique le MIME brut attendu par Gmail.
 *
 * Le refresh token vient de lib/repositories/connections.js. Quand Google le
 * déclare révoqué (`invalid_grant` : accès retiré depuis le compte Google,
 * mot de passe changé…), on lève GmailAuthError pour que l'appelant supprime
 * la connexion — l'utilisateur verra « non connecté » au lieu d'un échec muet
 * à chaque envoi.
 */
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { ConnectionAuthError } from './connections/errors.js';
import { refreshGoogleAccessToken } from './connections/googleTokens.js';

const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

/**
 * Le refresh token n'est plus accepté par Google : la connexion est morte.
 *
 * Sous-classe de ConnectionAuthError pour que le code générique des connexions
 * (routes/actions.js) traite Google et les autres fournisseurs de la même
 * façon, sans que les appelants historiques testant `GmailAuthError` changent.
 */
export class GmailAuthError extends ConnectionAuthError {
  constructor(message = 'gmail_auth_revoked') {
    super(message, { provider: 'google' });
    this.name = 'GmailAuthError';
  }
}

/**
 * Raisons de quota que Gmail renvoie avec un HTTP 403. Elles ne disent RIEN de
 * l'autorisation : les confondre avec une révocation supprimait la connexion de
 * l'utilisateur au premier envoi de trop.
 */
const QUOTA_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'dailyLimitExceeded',
  'quotaExceeded',
]);

/**
 * Raison structurée d'une erreur Gmail (`error.errors[0].reason`), chaîne vide
 * si le corps n'est pas exploitable.
 */
async function readErrorReason(res) {
  try {
    const payload = await res.json();
    return payload?.error?.errors?.[0]?.reason || payload?.error?.status || '';
  } catch (_) {
    return '';
  }
}

/**
 * Access token frais, en traduisant l'erreur d'autorisation dans le type que
 * les appelants historiques attendent.
 *
 * L'ENVOI (sendViaGmail), lui, n'est JAMAIS relancé : un timeout ambigu a
 * peut-être déjà envoyé le mail, le rejouer doublerait l'envoi.
 *
 * @throws {GmailAuthError} si le refresh token est révoqué
 */
async function refreshAccessToken({ clientId, clientSecret, refreshToken, fetchImpl }) {
  try {
    return await refreshGoogleAccessToken({ clientId, clientSecret, refreshToken, fetchImpl });
  } catch (err) {
    if (err instanceof ConnectionAuthError) throw new GmailAuthError();
    throw err;
  }
}

/**
 * MIME brut (RFC 2822) encodé base64url, comme l'exige l'API Gmail.
 *
 * `to` et `cc` acceptent un tableau : MailComposer se charge de l'encodage des
 * en-têtes, ce qui est précisément la raison de ne jamais les joindre nous-mêmes
 * en une chaîne (une adresse mal formée y deviendrait deux destinataires).
 */
function composeRaw({ from, to, cc, subject, text, html, attachments }) {
  return new Promise((resolve, reject) => {
    new MailComposer({ from, to, cc, subject, text, html, attachments })
      .compile()
      .build((err, message) => {
        if (err) return reject(err);
        resolve(message.toString('base64url'));
      });
  });
}

/**
 * Envoie un message depuis le compte Gmail connecté.
 *
 * @param {{clientId: string, clientSecret: string, refreshToken: string,
 *   from: string, to: string|string[], cc?: string|string[], subject: string,
 *   text: string, html: string,
 *   attachments?: Array<{filename: string, content: Buffer, contentType: string}>,
 *   fetchImpl?: Function}} params
 * @throws {GmailAuthError} connexion révoquée — à supprimer côté appelant
 */
export async function sendViaGmail({
  clientId,
  clientSecret,
  refreshToken,
  from,
  to,
  cc,
  subject,
  text,
  html,
  attachments,
  fetchImpl = fetch,
}) {
  const accessToken = await refreshAccessToken({ clientId, clientSecret, refreshToken, fetchImpl });
  const raw = await composeRaw({ from, to, cc, subject, text, html, attachments });
  const res = await fetchImpl(SEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.ok) return;

  // 401 : l'access token vient d'être émis quelques millisecondes plus tôt. Un
  // refus d'authentification ici veut bien dire que l'accès a été retiré.
  if (res.status === 401) throw new GmailAuthError();

  // 403 n'est PAS une révocation. Gmail l'emploie aussi — et surtout — pour les
  // dépassements de quota (`domain: usageLimits`). Le traiter comme un accès
  // retiré supprimait la connexion, forçant l'utilisateur à refaire tout le flux
  // OAuth pour un incident de quelques minutes.
  //
  // Une révocation réelle n'a de toute façon pas besoin de ce chemin : elle est
  // déjà attrapée en amont par `refreshAccessToken` (`invalid_grant`), qui
  // n'aurait jamais émis l'access token.
  if (res.status === 403) {
    const reason = await readErrorReason(res);
    throw new Error(QUOTA_REASONS.has(reason) ? 'gmail_rate_limited' : 'gmail_send_failed_403');
  }
  throw new Error(`gmail_send_failed_${res.status}`);
}

/**
 * Révoque un jeton chez Google — meilleur effort : la déconnexion locale
 * (suppression du document) prime, une révocation qui échoue ne doit pas la
 * bloquer. L'utilisateur peut toujours retirer l'accès depuis
 * myaccount.google.com.
 *
 * L'endpoint accepte indifféremment un refresh token ou un access token ;
 * `accessToken` sert quand une autorisation a été accordée mais qu'aucun
 * refresh token n'est revenu — sans lui, l'accès resterait accordé côté Google
 * alors que myBrief n'a rien enregistré.
 *
 * ⚠️ Révoquer un jeton révoque le GRANT ENTIER du compte, pas seulement le
 * jeton passé : ne jamais révoquer l'ancien jeton d'un compte qu'on vient de
 * reconnecter, cela tuerait la connexion fraîchement établie.
 *
 * @param {{refreshToken?: string, accessToken?: string, fetchImpl?: Function}} params
 * @returns {Promise<boolean>}
 */
export async function revokeGmailToken({ refreshToken, accessToken, fetchImpl = fetch }) {
  const token = refreshToken || accessToken;
  if (!token) return false;
  try {
    await fetchImpl(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    return true;
  } catch (_) {
    return false;
  }
}
