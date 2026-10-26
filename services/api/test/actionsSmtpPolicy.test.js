/**
 * Politique du relais SMTP face à des destinataires tiers.
 *
 * Deux transports, deux situations qui n'ont rien à voir :
 *   - compte relié (Gmail/Graph) : le `from` est la boîte de l'utilisateur,
 *     DKIM aligné par le fournisseur. Écrire à un tiers y est le fonctionnement
 *     normal d'une boîte mail ;
 *   - relais SMTP du serveur : le `from` est le `no-reply` de l'exploitant.
 *     Écrire à un tiers engage SA réputation SPF/DMARC pour un contenu choisi
 *     par un seul utilisateur, et les rebonds partent dans le vide.
 *
 * D'où l'interrupteur d'administration `allowSmtpExternal`, faux par défaut. Ce
 * qu'il ne fait PAS est aussi important que ce qu'il fait : il ne refuse jamais
 * l'envoi. Ce même chemin SMTP est celui qu'emprunte un envoi dont le jeton
 * Gmail vient d'être révoqué en vol, et le refuser ferait perdre l'envoi au pire
 * moment.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, createFakeGmailSend } from './helpers.js';
import { GmailAuthError } from '../lib/gmail.js';

const USER = 'moi@client.fr';
const TIERS = 'compta@partenaire.com';

const body = { kind: 'summary', title: 'Point client', content: '<p>x</p>', lang: 'fr' };

const withRecipients = (recipients) => [{ email: USER, emailLower: USER, mail: { recipients } }];

function seed({ recipients = [TIERS], allowSmtpExternal, connection } = {}) {
  return {
    user: [userDoc(USER)],
    userActionSettings: withRecipients(recipients),
    ...(allowSmtpExternal === undefined
      ? {}
      : { appSettings: [{ key: 'actions', mail: { allowSmtpExternal } }] }),
    ...(connection ? { userConnections: connection } : {}),
  };
}

function send(app) {
  return app.inject({
    method: 'POST',
    url: '/api/actions/email',
    headers: { ...identityHeaders(USER), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('relais SMTP et destinataires tiers', () => {
  it("par défaut, n'écrit qu'au compte connecté — et le dit", async () => {
    const { app, mailer } = buildTestApp({ seed: seed() });
    const res = await send(app);

    expect(res.statusCode).toBe(200);
    // L'envoi PART : c'est le point. Seul le destinataire est dégradé.
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toEqual([USER]);
    // Aucune copie : le tiers ne reçoit rien, même pas en copie cachée.
    // (Le transport réel omet l'en-tête ; le faux mailer garde la liste vide.)
    expect(mailer.sent[0].cc).toEqual([]);
    expect(res.json().degraded).toBe('smtp_recipients_dropped');
  });

  it('autorisé, écrit à toute la liste avec une adresse de réponse utile', async () => {
    const { app, mailer } = buildTestApp({ seed: seed({ allowSmtpExternal: true }) });
    const res = await send(app);

    expect(res.statusCode).toBe(200);
    expect(mailer.sent[0].to).toEqual([TIERS]);
    expect(mailer.sent[0].cc).toEqual([USER]);
    // Sans `replyTo`, une réponse du tiers atterrit sur le `no-reply` du
    // serveur, c'est-à-dire nulle part.
    expect(mailer.sent[0].replyTo).toBe(USER);
    expect(res.json().degraded).toBeNull();
  });

  it("ne dégrade pas quand la liste ne contient que l'utilisateur", async () => {
    const { app, mailer } = buildTestApp({ seed: seed({ recipients: [USER] }) });
    const res = await send(app);

    expect(mailer.sent[0].to).toEqual([USER]);
    expect(res.json().degraded).toBeNull();
  });

  it('ne concerne pas le compte relié : Gmail écrit aux tiers sans interrupteur', async () => {
    const { app, gmailSend } = buildTestApp({
      seed: seed({
        connection: [
          {
            emailLower: USER,
            provider: 'google',
            account: 'perso@gmail.com',
            refreshToken: 'rt',
            scopes: ['https://www.googleapis.com/auth/gmail.send'],
          },
        ],
      }),
    });
    // `allowSmtpExternal` reste faux : il ne gouverne QUE le relais du serveur.
    const res = await send(app);

    expect(res.statusCode).toBe(200);
    expect(gmailSend.calls[0].to).toEqual([TIERS]);
    expect(gmailSend.calls[0].cc).toEqual([USER]);
    expect(res.json().degraded).toBeNull();
  });

  it('repli après révocation : la connexion est purgée, l’envoi part quand même, dégradé', async () => {
    // Le scénario qui interdit le refus sec. Le jeton meurt entre deux clics ;
    // l'utilisateur ne doit pas perdre son compte rendu pour autant.
    const { app, db, mailer } = buildTestApp({
      seed: seed({
        connection: [
          {
            emailLower: USER,
            provider: 'google',
            account: 'perso@gmail.com',
            refreshToken: 'rt-mort',
            scopes: ['https://www.googleapis.com/auth/gmail.send'],
          },
        ],
      }),
      gmailSend: createFakeGmailSend({ fail: new GmailAuthError() }),
    });
    const res = await send(app);

    expect(res.statusCode).toBe(200);
    expect(db.data.get('userConnections')).toHaveLength(0);
    expect(mailer.sent[0].to).toEqual([USER]);
    expect(res.json()).toMatchObject({ via: 'smtp', degraded: 'smtp_recipients_dropped' });
  });
});
