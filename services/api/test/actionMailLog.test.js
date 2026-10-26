/**
 * Piste d'audit des envois d'action (lib/actions/mailLog.js).
 *
 * Elle n'existe que parce que le garde-fou a été levé : un envoi pouvait
 * autrefois n'atteindre que le titulaire du compte, il peut désormais atteindre
 * des tiers. Deux garanties opposées à tenir en même temps —
 *
 *   - une ligne par tentative, RÉUSSIE COMME ÉCHOUÉE : une trace qui ne
 *     consignerait que les succès ne répondrait pas à « qu'est-ce qui a été
 *     tenté depuis ce compte » ;
 *   - JAMAIS le contenu ni la pièce jointe : ce sont les données de réunion de
 *     l'utilisateur, et une piste d'audit qui les recopierait en serait une
 *     seconde copie, conservée trois mois, hors de portée de l'écran qui les
 *     affiche.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, createFakeMailer } from './helpers.js';
import { MAIL_LOG_COLLECTION } from '../lib/actions/mailLog.js';

const USER = 'moi@client.fr';
const TIERS = 'compta@partenaire.com';
const SECRET = 'Le directeur a annoncé le plan social';

const body = { kind: 'summary', title: 'Comité', content: `<p>${SECRET}</p>`, lang: 'fr' };

const seed = () => ({
  user: [userDoc(USER)],
  userActionSettings: [{ email: USER, emailLower: USER, mail: { recipients: [TIERS] } }],
  appSettings: [{ key: 'actions', mail: { allowSmtpExternal: true } }],
});

function send(app) {
  return app.inject({
    method: 'POST',
    url: '/api/actions/email',
    headers: { ...identityHeaders(USER), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('piste d’audit des envois', () => {
  it('consigne un envoi réussi, avec ses destinataires', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    await send(app);

    const [entry] = db.data.get(MAIL_LOG_COLLECTION);
    expect(entry).toMatchObject({
      emailLower: USER,
      kind: 'summary',
      via: 'smtp',
      to: [TIERS],
      cc: [USER],
      ok: true,
    });
  });

  it('consigne aussi un échec', async () => {
    const mailer = createFakeMailer();
    mailer.sendDocument = async () => {
      throw new Error('smtp_unreachable');
    };
    const { app, db } = buildTestApp({ seed: seed(), mailer });
    const res = await send(app);

    expect(res.statusCode).toBe(502);
    const [entry] = db.data.get(MAIL_LOG_COLLECTION);
    expect(entry.ok).toBe(false);
    expect(entry.error).toBe('smtp_unreachable');
  });

  it('ne recopie JAMAIS le contenu du document', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    await send(app);

    const [entry] = db.data.get(MAIL_LOG_COLLECTION);
    expect(JSON.stringify(entry)).not.toContain(SECRET);
    expect(entry.content).toBeUndefined();
    expect(entry.attachments).toBeUndefined();
  });

  it('consigne la dégradation quand des destinataires ont été retirés', async () => {
    const { app, db } = buildTestApp({
      seed: { ...seed(), appSettings: [{ key: 'actions', mail: { allowSmtpExternal: false } }] },
    });
    await send(app);

    const [entry] = db.data.get(MAIL_LOG_COLLECTION);
    expect(entry.degraded).toBe('smtp_recipients_dropped');
    expect(entry.to).toEqual([USER]);
  });

  it("une trace qui ne s'écrit pas ne fait pas échouer l'envoi", async () => {
    // Le mail est déjà parti quand on arrive ici : répondre en erreur ferait
    // croire à l'utilisateur qu'il n'a pas eu lieu, et il recommencerait.
    const { app, db, mailer } = buildTestApp({ seed: seed() });
    db.failNext('insertOne', new Error('mongo down'));
    const res = await send(app);

    expect(res.statusCode).toBe(200);
    expect(mailer.sent).toHaveLength(1);
  });
});
