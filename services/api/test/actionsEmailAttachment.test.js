/**
 * Pièce jointe de « Envoyer par mail » (routes/actions.js, branche multipart).
 *
 * Le document part en deux exemplaires et c'est voulu : le corps du mail (HTML
 * ou texte, lisible sans rien ouvrir) et le fichier mis en page fabriqué par le
 * navigateur. Le PDF est tiré de la mise en page du navigateur : l'API ne
 * peut que relayer ces octets, jamais les produire.
 *
 * Contrat à tenir : la pièce jointe est FACULTATIVE. Un envoi JSON sans fichier
 * doit continuer de fonctionner à l'identique — c'est le chemin qu'emprunte
 * l'application quand la génération du PDF échoue.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, userDoc, identityHeaders, createFakeMailer } from './helpers.js';

const USER = 'simple@client.fr';
const GMAIL_ACCOUNT = 'perso@gmail.com';

const connectedSeed = () => [
  {
    emailLower: USER,
    provider: 'google',
    account: GMAIL_ACCOUNT,
    refreshToken: 'rt-secret-123',
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'],
  },
];

const authSeed = () => [
  { key: 'auth', google: { enabled: true, clientId: 'id', clientSecret: 'secret' } },
];

/**
 * Corps multipart écrit à la main : les champs AVANT le fichier, comme le fait
 * FormData côté navigateur — @fastify/multipart ne peuple `part.fields` qu'avec
 * ce qui précède le fichier dans le flux.
 */
function multipartBody(fields, file) {
  const boundary = '----mybrieftest';
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
  }
  if (file) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
        `Content-Type: ${file.contentType}\r\n\r\n${file.content}\r\n`,
    );
  }
  chunks.push(`--${boundary}--\r\n`);
  return { body: Buffer.from(chunks.join(''), 'utf8'), boundary };
}

function postMultipart(app, fields, file) {
  const { body, boundary } = multipartBody(fields, file);
  return app.inject({
    method: 'POST',
    url: '/api/actions/email',
    headers: {
      ...identityHeaders(USER),
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
}

const DOCUMENT = {
  kind: 'summary',
  title: 'Comité du 8',
  content: '<p>Bonjour</p>',
  lang: 'fr',
};

const PDF = {
  filename: '2026-08-08-comite-du-8.pdf',
  contentType: 'application/pdf',
  content: '%PDF-1.4 faux contenu',
};

describe('POST /api/actions/email — pièce jointe', () => {
  it('joint le fichier à un envoi via le compte connecté', async () => {
    const { app, gmailSend } = buildTestApp({
      seed: { user: [userDoc(USER)], appSettings: authSeed(), userConnections: connectedSeed() },
    });
    const res = await postMultipart(app, DOCUMENT, PDF);

    expect(res.statusCode).toBe(200);
    expect(res.json().via).toBe('gmail');
    const sent = gmailSend.calls[0];
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0].filename).toBe(PDF.filename);
    expect(sent.attachments[0].contentType).toBe('application/pdf');
    expect(sent.attachments[0].content.toString()).toBe(PDF.content);
    // Le corps du mail reste porteur du document : la pièce jointe s'ajoute.
    expect(sent.html).toContain('Bonjour');
    expect(sent.subject).toContain('Comité du 8');
  });

  it('joint le fichier à un envoi par le relais SMTP', async () => {
    const { app, mailer } = buildTestApp({ seed: { user: [userDoc(USER)] } });
    const res = await postMultipart(app, DOCUMENT, PDF);

    expect(res.statusCode).toBe(200);
    expect(res.json().via).toBe('smtp');
    expect(mailer.sent[0].attachments[0].filename).toBe(PDF.filename);
  });

  it("l'envoi JSON sans pièce jointe fonctionne toujours", async () => {
    // Le chemin de repli : quand le rendu PDF échoue côté navigateur, le mail
    // part quand même avec son contenu dans le corps.
    const { app, mailer } = buildTestApp({ seed: { user: [userDoc(USER)] } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions/email',
      headers: { ...identityHeaders(USER), 'content-type': 'application/json' },
      body: JSON.stringify(DOCUMENT),
    });

    expect(res.statusCode).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].attachments).toBeUndefined();
  });

  it('valide toujours le corps JSON — la restriction au content-type ne désarme rien', async () => {
    // Le schéma ajv est déclaré par content-type pour ne pas s'appliquer au
    // multipart ; il doit rester pleinement actif sur le JSON.
    const { app, mailer } = buildTestApp({ seed: { user: [userDoc(USER)] } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions/email',
      headers: { ...identityHeaders(USER), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'facture', content: 'x' }),
    });

    expect(res.statusCode).toBe(400);
    expect(mailer.sent).toHaveLength(0);
  });

  it('accepte un document long accompagné d’une pièce jointe', async () => {
    // La limite `fieldSize` de @fastify/multipart vaut 1 Mo par défaut, alors
    // que le schéma des actions accepte 2 Mo de contenu. Sans alignement
    // explicite, un compte rendu volumineux passait en JSON mais échouait dès
    // qu'on y joignait le PDF.
    const { app, mailer } = buildTestApp({ seed: { user: [userDoc(USER)] } });
    const long = 'x'.repeat(1_500_000);
    const res = await postMultipart(app, { ...DOCUMENT, content: long }, PDF);

    expect(res.statusCode).toBe(200);
    expect(mailer.sent).toHaveLength(1);
  });

  it('refuse un multipart sans fichier', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(USER)] } });
    const res = await postMultipart(app, DOCUMENT, null);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('file_required');
  });

  it('valide les champs du multipart comme ceux du JSON', async () => {
    const { app, mailer } = buildTestApp({ seed: { user: [userDoc(USER)] } });

    const badKind = await postMultipart(app, { ...DOCUMENT, kind: 'facture' }, PDF);
    expect(badKind.statusCode).toBe(400);
    expect(badKind.json().error).toBe('invalid_kind');

    const noContent = await postMultipart(app, { ...DOCUMENT, content: '' }, PDF);
    expect(noContent.statusCode).toBe(400);
    expect(noContent.json().error).toBe('invalid_content');

    expect(mailer.sent).toHaveLength(0);
  });

  it("respecte l'interrupteur d'administration", async () => {
    const { app } = buildTestApp({
      seed: {
        user: [userDoc(USER)],
        appSettings: [{ key: 'actions', summary: { email: false } }],
      },
    });
    const res = await postMultipart(app, DOCUMENT, PDF);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('action_disabled');
  });

  it('sans compte connecté ni relais SMTP : 501, même avec un fichier', async () => {
    const { app } = buildTestApp({
      seed: { user: [userDoc(USER)] },
      mailer: createFakeMailer({ enabled: false }),
    });
    const res = await postMultipart(app, DOCUMENT, PDF);
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toBe('mailer_disabled');
  });
});
