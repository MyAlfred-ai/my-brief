/**
 * Réglages d'actions par utilisateur (/api/actions/settings).
 *
 * Trois familles de garanties :
 *   - ISOLATION : les réglages d'un compte ne fuient ni ne s'écrivent chez un
 *     autre. Ils portent des adresses de tiers ;
 *   - PLAFOND : l'administration décide de ce qui est ouvert, l'utilisateur
 *     affine dedans. Jamais l'inverse ;
 *   - REFUS EXPLICITE : une adresse ou une variable refusée est NOMMÉE. Un
 *     filtrage silencieux fait ressaisir la même chose à l'identique.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';
import { USER_ACTIONS_COLLECTION } from '../lib/repositories/userActions.js';

const A = 'moi@client.fr';
const B = 'autre@client.fr';

const seed = () => ({ user: [userDoc(A), userDoc(B)] });

function get(app, email = A) {
  return app.inject({
    method: 'GET',
    url: '/api/actions/settings',
    headers: identityHeaders(email),
  });
}

function save(app, body, email = A) {
  return app.inject({
    method: 'POST',
    url: '/api/actions/settings',
    headers: { ...identityHeaders(email), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/actions/settings', () => {
  it('exige une identité', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({ method: 'GET', url: '/api/actions/settings' });
    expect(res.statusCode).toBe(401);
  });

  it('rend des réglages vides et le vocabulaire nécessaire à l’écran', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await get(app);

    expect(res.statusCode).toBe(200);
    const { settings, limits, variables, ceiling } = res.json();
    expect(settings.mail.recipients).toEqual([]);
    expect(settings.storage.folder).toBe('');
    // Servi par l'API, jamais recopié côté client : une seconde liste
    // divergerait au premier ajout de variable.
    expect(variables).toContain('titre');
    expect(limits.maxRecipients).toBeGreaterThan(0);
    expect(ceiling).toEqual({ email: true, storage: true });
  });

  it("reflète le plafond de l'administration", async () => {
    const { app } = buildTestApp({
      seed: {
        ...seed(),
        appSettings: [
          {
            key: 'actions',
            transcription: { email: false, storage: false },
            summary: { email: false, storage: false },
          },
        ],
      },
    });
    expect((await get(app)).json().ceiling).toEqual({ email: false, storage: false });
  });
});

describe('POST /api/actions/settings', () => {
  it('enregistre et relit', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await save(app, {
      mail: { recipients: ['Compta@Client.fr'], subjectTemplate: 'CR {{titre}}' },
      storage: { folder: 'Clients/Acme' },
      naming: { filenameTemplate: '{{date}}-{{titre}}' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toMatchObject({
      mail: { recipients: ['compta@client.fr'], subjectTemplate: 'CR {{titre}}' },
      storage: { folder: 'Clients/Acme' },
      naming: { filenameTemplate: '{{date}}-{{titre}}' },
    });
    expect((await get(app)).json().settings.storage.folder).toBe('Clients/Acme');
  });

  it('fusionne champ par champ — un patch partiel ne vide pas le reste', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await save(app, { mail: { recipients: ['compta@client.fr'] } });
    await save(app, { storage: { folder: 'Clients/Acme' } });

    const { settings } = (await get(app)).json();
    expect(settings.mail.recipients).toEqual(['compta@client.fr']);
    expect(settings.storage.folder).toBe('Clients/Acme');
  });

  it("l'upsert écrit bien l'appartenance — le piège du `$or`", async () => {
    // `ownerFilter` renvoie un `$or`, dont Mongo ne dérive aucune égalité : un
    // upsert filtré dessus créerait un document SANS propriétaire, invisible à
    // la relecture comme à la purge de compte.
    const { app, db } = buildTestApp({ seed: seed() });
    await save(app, { storage: { folder: 'X' } });

    const [doc] = db.data.get(USER_ACTIONS_COLLECTION);
    expect(doc.emailLower).toBe(A);
    expect(doc.email).toBe(A);
  });

  it('isole les comptes', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await save(app, { mail: { recipients: ['compta@client.fr'] } }, A);
    await save(app, { mail: { recipients: ['dg@client.fr'] } }, B);

    expect((await get(app, A)).json().settings.mail.recipients).toEqual(['compta@client.fr']);
    expect((await get(app, B)).json().settings.mail.recipients).toEqual(['dg@client.fr']);
  });

  it('refuse une adresse invalide en la nommant', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await save(app, { mail: { recipients: ['compta@client.fr,victime'] } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'recipient_invalid',
      rejected: ['compta@client.fr,victime'],
    });
  });

  it('refuse au-delà du plafond, en disant lequel', async () => {
    const { app } = buildTestApp({
      seed: { ...seed(), appSettings: [{ key: 'actions', mail: { maxRecipients: 2 } }] },
    });
    const res = await save(app, {
      mail: { recipients: ['a@client.fr', 'b@client.fr', 'c@client.fr'] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'recipients_limit_reached', max: 2 });
  });

  it('refuse une variable de gabarit inconnue', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await save(app, { mail: { subjectTemplate: 'CR {{client}}' } });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'template_variable_unknown',
      unknown: ['client'],
    });
  });

  it('refuse une origine étrangère', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions/settings',
      headers: {
        ...identityHeaders(A),
        'content-type': 'application/json',
        host: 'mybrief.client.fr',
        origin: 'https://pirate.example',
      },
      body: JSON.stringify({ storage: { folder: 'X' } }),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('bad_origin');
  });

  it('neutralise un champ hors schéma — pas d’interrupteur par utilisateur', async () => {
    // `additionalProperties: false` + le `removeAdditional` d'ajv (défaut
    // Fastify) : le champ est RETIRÉ avant le handler, pas refusé. L'effet
    // recherché est le même — l'administration est un plafond, un utilisateur
    // ne rouvre pas ce qu'elle a fermé — et le test le vérifie par l'effet.
    const { app } = buildTestApp({
      seed: {
        ...seed(),
        appSettings: [
          { key: 'actions', summary: { email: false }, transcription: { email: false } },
        ],
      },
    });
    const res = await save(app, { summary: { email: true } });

    expect(res.statusCode).toBe(200);
    expect(res.json().settings.summary).toBeUndefined();
    expect((await get(app)).json().ceiling.email).toBe(false);
  });
});

describe("le plafond de l'administration l'emporte à l'exécution", () => {
  it('un réglage personnel ne rouvre pas une action fermée', async () => {
    const { app, mailer } = buildTestApp({
      seed: {
        ...seed(),
        appSettings: [{ key: 'actions', summary: { email: false } }],
        userActionSettings: [
          { email: A, emailLower: A, mail: { recipients: ['compta@client.fr'] } },
        ],
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions/email',
      headers: { ...identityHeaders(A), 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'summary', title: 'x', content: '<p>x</p>', lang: 'fr' }),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('action_disabled');
    expect(mailer.sent).toHaveLength(0);
  });
});

describe('destinataires par tag', () => {
  // Un tag est un classeur : « Client Acme » a ses interlocuteurs, qui ne sont
  // pas ceux du classeur d'à côté. La liste du tag REMPLACE la liste par
  // défaut du compte — cumuler enverrait le compte rendu d'un client aux
  // interlocuteurs d'un autre.
  const TAG = { email: A, emailLower: A, id: 't-acme', label: 'Acme', color: 'blue' };
  const MEETING = { email: A, emailLower: A, meetingId: 'm-1', tagId: 't-acme' };

  function sendEmail(app, body, email = A) {
    return app.inject({
      method: 'POST',
      url: '/api/actions/email',
      headers: { ...identityHeaders(email), 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'summary',
        title: 'x',
        content: '<p>x</p>',
        lang: 'fr',
        ...body,
      }),
    });
  }

  it('enregistre et relit la liste d’un tag, en normalisant les adresses', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await save(app, {
      mail: { tagRecipients: [{ tagId: 't-acme', recipients: ['DG@Acme.com', ' dg@acme.com '] }] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().settings.mail.tagRecipients).toEqual([
      { tagId: 't-acme', recipients: ['dg@acme.com'] },
    ]);
    expect((await get(app)).json().settings.mail.tagRecipients).toEqual([
      { tagId: 't-acme', recipients: ['dg@acme.com'] },
    ]);
  });

  it('refuse une adresse invalide et NOMME le tag concerné', async () => {
    // Sans le tag, « adresse refusée » obligerait à rouvrir toutes les listes
    // pour trouver laquelle.
    const { app } = buildTestApp({ seed: seed() });
    const res = await save(app, {
      mail: { tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com,victime'] }] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'recipient_invalid',
      rejected: ['dg@acme.com,victime'],
      tagId: 't-acme',
    });
  });

  it("respecte le plafond de l'administration, tag par tag", async () => {
    const { app } = buildTestApp({
      seed: { ...seed(), appSettings: [{ key: 'actions', mail: { maxRecipients: 2 } }] },
    });
    const res = await save(app, {
      mail: {
        tagRecipients: [
          { tagId: 't-acme', recipients: ['a@acme.com', 'b@acme.com', 'c@acme.com'] },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'recipients_limit_reached',
      max: 2,
      tagId: 't-acme',
    });
  });

  it('un patch qui ne touche que le dossier conserve les listes par tag', async () => {
    // Le panneau « Mes tags » écrit la destination d'un tag sans connaître
    // ses destinataires : chaque champ doit survivre aux écritures de l'autre.
    const { app } = buildTestApp({ seed: seed() });
    await save(app, {
      mail: { tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com'] }] },
    });
    await save(app, { storage: { tagFolders: [{ tagId: 't-acme', folder: 'Clients/Acme' }] } });
    await save(app, { mail: { recipients: ['interne@client.fr'] } });

    const { settings } = (await get(app)).json();
    expect(settings.mail.tagRecipients).toEqual([{ tagId: 't-acme', recipients: ['dg@acme.com'] }]);
    expect(settings.storage.tagFolders[0].folder).toBe('Clients/Acme');
    expect(settings.mail.recipients).toEqual(['interne@client.fr']);
  });

  it('une liste vide retire le tag — pas de ligne fantôme', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await save(app, {
      mail: { tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com'] }] },
    });
    const res = await save(app, { mail: { tagRecipients: [{ tagId: 't-acme', recipients: [] }] } });
    expect(res.json().settings.mail.tagRecipients).toEqual([]);
  });

  it("à l'envoi, la liste du tag remplace celle du compte — le compte reste en copie", async () => {
    const { app, mailer } = buildTestApp({
      seed: {
        ...seed(),
        appSettings: [{ key: 'actions', mail: { allowSmtpExternal: true } }],
        userActionSettings: [
          {
            email: A,
            emailLower: A,
            mail: {
              recipients: ['interne@client.fr'],
              tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com'] }],
            },
          },
        ],
        userTags: [TAG],
        resume: [MEETING],
      },
    });

    const tagged = await sendEmail(app, { meetingId: 'm-1' });
    expect(tagged.statusCode).toBe(200);
    expect(mailer.sent.at(-1)).toMatchObject({ to: ['dg@acme.com'], cc: [A] });
    // La réponse dit à qui il est parti : c'est ce que la notification affiche,
    // et non l'adresse du compte, qui n'est qu'en copie.
    expect(tagged.json().to).toEqual(['dg@acme.com']);

    // Sans tag : la liste du compte, comme avant.
    const plain = await sendEmail(app, {});
    expect(plain.statusCode).toBe(200);
    expect(mailer.sent.at(-1)).toMatchObject({ to: ['interne@client.fr'], cc: [A] });
  });

  it("la liste d'un tag d'un AUTRE compte ne s'applique pas", async () => {
    // `tagId` recopié d'ailleurs : la conversation est relue sous le scope du
    // demandeur, et un tag qui n'est pas le sien n'existe pas pour lui.
    const { app, mailer } = buildTestApp({
      seed: {
        ...seed(),
        appSettings: [{ key: 'actions', mail: { allowSmtpExternal: true } }],
        userActionSettings: [
          {
            email: B,
            emailLower: B,
            mail: { tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com'] }] },
          },
        ],
        userTags: [{ ...TAG, email: B, emailLower: B }],
        resume: [{ ...MEETING, email: B, emailLower: B }],
      },
    });
    const res = await sendEmail(app, { meetingId: 'm-1' }, A);
    expect(res.statusCode).toBe(200);
    expect(mailer.sent.at(-1).to).toEqual([A]);
  });
});

describe('fenêtre « Et maintenant ? » (afterSummary)', () => {
  it('proposée par défaut — un compte sans réglage la voit', async () => {
    const { app } = buildTestApp({ seed: seed() });
    expect((await get(app)).json().settings.afterSummary).toEqual({ offer: true });
  });

  it('« Ne plus me proposer » est enregistré, puis réactivable', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const off = await save(app, { afterSummary: { offer: false } });
    expect(off.statusCode).toBe(200);
    expect(off.json().settings.afterSummary).toEqual({ offer: false });
    expect((await get(app)).json().settings.afterSummary).toEqual({ offer: false });

    await save(app, { afterSummary: { offer: true } });
    expect((await get(app)).json().settings.afterSummary).toEqual({ offer: true });
  });

  it('un patch partiel ne la rallume pas — et elle ne vide rien', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await save(app, { mail: { recipients: ['compta@client.fr'] } });
    await save(app, { afterSummary: { offer: false } });
    await save(app, { storage: { folder: 'Clients/Acme' } });

    const { settings } = (await get(app)).json();
    expect(settings.afterSummary).toEqual({ offer: false });
    expect(settings.mail.recipients).toEqual(['compta@client.fr']);
  });

  it('isole les comptes', async () => {
    const { app } = buildTestApp({ seed: seed() });
    await save(app, { afterSummary: { offer: false } }, A);
    expect((await get(app, B)).json().settings.afterSummary).toEqual({ offer: true });
  });

  it('refuse une valeur qui n’est pas un booléen', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await save(app, { afterSummary: { offer: 'non' } });
    expect(res.statusCode).toBe(400);
    expect((await get(app)).json().settings.afterSummary).toEqual({ offer: true });
  });
});
