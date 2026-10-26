/**
 * Destinataires du TAG, exercés par la vraie route d'envoi.
 *
 * `actionRecipients.test.js` verrouille la règle en table (module pur) et
 * `actionsUserSettings.test.js` son enregistrement. Restait le maillon qui les
 * relie et que personne ne testait : `meetingId` → réunion → tag → liste du
 * tag. C'est justement là que la chaîne s'est rompue en usage réel — un envoi
 * sans `meetingId` retombe sur la liste du compte sans un mot, et le compte
 * rendu ne part jamais chez le client.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';

const USER = 'moi@client.fr';
const DEFAUT = 'equipe@client.fr';
const ACME = 'dg@acme.com';
const MEETING = 'm-1';
const TAG = 'tag-acme';

const body = { kind: 'summary', title: 'Point client', content: '<p>x</p>', lang: 'fr' };

function seed({ tagId = TAG, tagRecipients = [{ tagId: TAG, recipients: [ACME] }] } = {}) {
  return {
    user: [userDoc(USER)],
    userActionSettings: [
      { email: USER, emailLower: USER, mail: { recipients: [DEFAUT], tagRecipients } },
    ],
    resume: [{ email: USER, emailLower: USER, meetingId: MEETING, tagId }],
    userTags: [{ email: USER, emailLower: USER, id: TAG, label: 'Acme' }],
    // Sans ça, le relais SMTP dégrade le destinataire et masquerait la
    // résolution qu'on cherche à observer (cf. actionsSmtpPolicy.test.js).
    appSettings: [{ key: 'actions', mail: { allowSmtpExternal: true } }],
  };
}

function send(app, document) {
  return app.inject({
    method: 'POST',
    url: '/api/actions/email',
    headers: { ...identityHeaders(USER), 'content-type': 'application/json' },
    body: JSON.stringify(document),
  });
}

describe('destinataires du tag, de bout en bout', () => {
  it('la liste du tag remplace celle du compte quand le meetingId accompagne le document', async () => {
    const { app, mailer } = buildTestApp({ seed: seed() });

    const res = await send(app, { ...body, meetingId: MEETING });

    expect(res.statusCode).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toEqual([ACME]);
    // Le compte reste toujours en copie, quelle que soit la couche.
    expect(mailer.sent[0].cc).toEqual([USER]);
  });

  it('SANS meetingId, la liste du tag est hors de portée — la régression à ne pas rejouer', async () => {
    const { app, mailer } = buildTestApp({ seed: seed() });

    // C'est exactement ce que le client envoyait après un enregistrement en
    // direct : le document part, mais le tag ne peut plus être relu.
    const res = await send(app, body);

    expect(res.statusCode).toBe(200);
    expect(mailer.sent[0].to).toEqual([DEFAUT]);
  });

  it('un tag sans liste ne prive personne : la liste du compte s’applique', async () => {
    const { app, mailer } = buildTestApp({ seed: seed({ tagRecipients: [] }) });

    await send(app, { ...body, meetingId: MEETING });

    expect(mailer.sent[0].to).toEqual([DEFAUT]);
  });

  it('une réunion sans tag garde la liste du compte', async () => {
    const { app, mailer } = buildTestApp({ seed: seed({ tagId: null }) });

    await send(app, { ...body, meetingId: MEETING });

    expect(mailer.sent[0].to).toEqual([DEFAUT]);
  });

  it('le meetingId de quelqu’un d’autre n’ouvre pas sa liste', async () => {
    const { app, mailer } = buildTestApp({
      seed: {
        ...seed(),
        resume: [
          { email: 'autre@client.fr', emailLower: 'autre@client.fr', meetingId: 'm-9', tagId: TAG },
        ],
      },
    });

    await send(app, { ...body, meetingId: 'm-9' });

    expect(mailer.sent[0].to).toEqual([DEFAUT]);
  });
});

/**
 * Même chaîne, compte Microsoft relié : la liste du tag doit atteindre Graph
 * telle quelle, avec le compte en copie. C'est le maillon qui manquait pour
 * dire que la version Microsoft des tags envoie bien « aux bonnes personnes ».
 */
describe('destinataires du tag via un compte Microsoft', () => {
  const microsoftSeed = () => ({
    ...seed(),
    appSettings: [
      {
        key: 'auth',
        entra: {
          enabled: true,
          clientId: 'entra-client',
          clientSecret: 'entra-secret',
          discoveryUrl:
            'https://login.microsoftonline.test/t/v2.0/.well-known/openid-configuration',
        },
      },
      { key: 'actions', connections: { provider: 'microsoft' } },
    ],
    userConnections: [
      {
        emailLower: USER,
        provider: 'microsoft',
        account: USER,
        refreshToken: 'rt-ms',
        // Forme COURTE, comme Entra la rend.
        scopes: ['openid', 'email', 'Mail.Send', 'Files.ReadWrite'],
      },
    ],
  });

  it('la liste du tag part par Graph, le compte en copie', async () => {
    const { app, graphSend, mailer } = buildTestApp({ seed: microsoftSeed() });

    const res = await send(app, { ...body, meetingId: MEETING });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ via: 'microsoft' });
    expect(graphSend.calls).toHaveLength(1);
    expect(graphSend.calls[0].to).toEqual([ACME]);
    expect(graphSend.calls[0].cc).toEqual([USER]);
    expect(mailer.sent).toHaveLength(0);
  });

  it('sans liste sur le tag, la liste du compte part par Graph', async () => {
    const { app, graphSend } = buildTestApp({
      seed: {
        ...microsoftSeed(),
        userActionSettings: seed({ tagRecipients: [] }).userActionSettings,
      },
    });

    const res = await send(app, { ...body, meetingId: MEETING });

    expect(res.json().via).toBe('microsoft');
    expect(graphSend.calls[0].to).toEqual([DEFAUT]);
    expect(graphSend.calls[0].cc).toEqual([USER]);
  });
});
