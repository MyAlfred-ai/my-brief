/**
 * Infographie de compte rendu.
 *
 * Garanties à tenir :
 *   - l'image ne se génère que si la case est cochée, si l'administration la
 *     propose ET si un groupe du compte en donne le droit — jamais « parce que
 *     le champ traînait dans le corps » ;
 *   - un refus de régénération n'est jamais un 403, que le client lirait comme
 *     une session perdue ;
 *   - le drapeau `infographic.status` se règle dans TOUS les cas de sortie
 *     (ready comme error) : c'est lui qui borne le polling du frontend ;
 *   - l'image vit dans SA collection, jamais dans le document `resume` que
 *     /history renvoie entier ;
 *   - toutes les lectures/écritures sont scopées par le propriétaire.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, groupDoc, defaultGroupDoc } from './helpers.js';
import { ownerFilter } from '../lib/ownerScope.js';
import {
  infographicPrompt,
  INFOGRAPHIC_PROMPT_MAX,
  INFOGRAPHIC_STYLE_MAX,
  INFOGRAPHIC_WRITER_RULES,
} from '../lib/prompts.js';
import { INFOGRAPHICS_COLLECTION } from '../lib/infographic.js';
import { DEFAULT_INFOGRAPHIC_IMAGE_MODEL } from '../lib/infographicModels.js';
import { loadConfig } from '../lib/config.js';

const EMAIL = 'alex@myalfred.ai';
const OTHER = 'intrus@client.fr';
const ADMIN = 'patron@client.fr';

function resumePayload(overrides = {}) {
  return {
    transcription: 'On a parlé du projet INITECH. Budget : 12 000 €.',
    systemPrompt: 'Tu es un rédacteur de comptes-rendus.',
    template: 'standard',
    language: 'fr',
    actions: [{ id: 1, title: 'Relancer', owner: 'Alex', dueDate: '2026-09-01' }],
    versionId: 'v1-uuid',
    meetingId: null,
    isEdit: false,
    notes: 'INITECH s’écrit en capitales.',
    ...overrides,
  };
}

function postJson(app, url, body, email = EMAIL) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email, 'Alex Dupont'), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getJson(app, url, email = EMAIL) {
  return app.inject({ method: 'GET', url, headers: identityHeaders(email) });
}

describe('/api/resume — infographie demandée', () => {
  it('pose `pending` avant la réponse, puis écrit image + `ready` en tâche de fond', async () => {
    const { app, db, ai } = buildTestApp();
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.infographic).toBe('pending');

    // AVANT le drain : le document porte déjà le drapeau — c'est ce que voit
    // le premier rechargement d'historique du client.
    const meetingId = parsed.meetingId;
    const before = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(['pending', 'ready']).toContain(before.infographic.status);

    await app.background.drain();

    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc.infographic.status).toBe('ready');
    // L'image vit dans SA collection, jamais dans le document servi par /history.
    expect(doc.image).toBeUndefined();
    const img = await db
      .collection(INFOGRAPHICS_COLLECTION)
      .findOne(ownerFilter(EMAIL, { meetingId }));
    expect(img.image).toBe('aW1hZ2UtZmFjdGljZQ==');
    expect(img.mime).toBe('image/png');

    // Deux temps, comme l'application ChatGPT : la demande + les matériaux
    // bruts passent par une RÉÉCRITURE texte, et c'est sa sortie — pas les
    // matériaux — que reçoit le modèle d'image.
    const writer = ai.calls.filter(
      (c) => c.method === 'chat' && c.params?.messages?.[0]?.content === INFOGRAPHIC_WRITER_RULES,
    );
    expect(writer).toHaveLength(1);
    // Le réécrivain conçoit la maquette : gpt-5.4 par défaut, effort de
    // raisonnement explicite plutôt que le défaut du modèle.
    expect(writer[0].params.model).toBe('gpt-5.4');
    expect(writer[0].params.reasoningEffort).toBe('medium');
    const materials = writer[0].params.messages[1].content;
    expect(materials).toContain(
      'Fais une infographie en fonction de cette transcription de réunion',
    );
    expect(materials).toContain('On a parlé du projet INITECH.');
    expect(materials).toContain('INITECH s’écrit en capitales.');
    expect(materials).toContain('Relancer — Alex — 2026-09-01');
    // TRANSCRIPTION D'ABORD — mesuré : actions/notes en tête, le modèle en
    // faisait un poster « ACTIONS » et ignorait la transcription.
    expect(materials.indexOf('#TRANSCRIPTION')).toBeLessThan(materials.indexOf('#ACTIONS'));
    expect(materials.indexOf('#ACTIONS')).toBeLessThan(materials.indexOf('#NOTES'));

    const image = ai.calls.filter((c) => c.method === 'generateImage');
    expect(image).toHaveLength(1);
    expect(image[0].params.model).toBe(DEFAULT_INFOGRAPHIC_IMAGE_MODEL);
    // Le fake chat répond « réponse par défaut » : c'est bien la réécriture
    // qui part au modèle d'image, TELLE QUELLE — aucune consigne ajoutée par
    // nous (les règles de cadrage de l'ère gpt-image-1 sont retirées).
    expect(image[0].params.prompt).toBe('réponse par défaut');
  });

  it('OPENAI_MODEL_INFOGRAPHIC règle le réécrivain SEUL — le résumé garde le sien', async () => {
    // Même défaut que le résumé (gpt-5.4) : sans surcharge, rien ne prouverait
    // que le réécrivain lit SON réglage plutôt que celui du compte rendu.
    const { openai } = loadConfig({ OPENAI_MODEL_INFOGRAPHIC: 'modele-infographie' });
    const { app, ai } = buildTestApp({ config: { openai } });
    await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    await app.background.drain();

    const chats = ai.calls.filter((c) => c.method === 'chat');
    const writer = chats.find((c) => c.params.messages[0].content === INFOGRAPHIC_WRITER_RULES);
    const summary = chats.find(
      (c) => c.params.messages[0].content === resumePayload().systemPrompt,
    );
    expect(writer.params.model).toBe('modele-infographie');
    expect(summary.params.model).not.toBe('modele-infographie');
  });

  it('réécriture vide ou en panne → repli : les matériaux bruts partent quand même', async () => {
    const { app, db, ai } = buildTestApp({
      openai: {
        chat: (params) => {
          if (params?.messages?.[0]?.content === INFOGRAPHIC_WRITER_RULES) {
            throw new Error('panne réécriture');
          }
          return '<p>CR</p>';
        },
      },
    });
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();

    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc.infographic.status).toBe('ready');
    const image = ai.calls.filter((c) => c.method === 'generateImage');
    expect(image).toHaveLength(1);
    expect(image[0].params.prompt).toContain('#TRANSCRIPTION DE LA RÉUNION');
    expect(image[0].params.prompt).toContain('On a parlé du projet INITECH.');
  });

  it('ne génère RIEN sans la case, même si tout le reste est là', async () => {
    const { app, db, ai } = buildTestApp();
    const res = await postJson(app, '/api/resume', resumePayload());
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc.infographic).toBeUndefined();
    expect(ai.calls.filter((c) => c.method === 'generateImage')).toHaveLength(0);
  });

  it("ne génère rien quand l'administration a désactivé la fonctionnalité", async () => {
    const { app, db, ai } = buildTestApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
    await postJson(app, '/api/admin/settings/ai', { infographicEnabled: false }, ADMIN);
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const parsed = JSON.parse(res.body);
    expect(parsed.infographic).toBeUndefined();
    await app.background.drain();
    const doc = await db
      .collection('resume')
      .findOne(ownerFilter(EMAIL, { meetingId: parsed.meetingId }));
    expect(doc.infographic).toBeUndefined();
    expect(ai.calls.filter((c) => c.method === 'generateImage')).toHaveLength(0);
  });

  it("échec du modèle d'image → statut `error`, jamais `pending` à demeure", async () => {
    const { app, db } = buildTestApp({
      openai: {
        generateImage: () => {
          throw new Error('panne amont');
        },
      },
    });
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc.infographic.status).toBe('error');
  });

  it('régénération SANS la case : l’infographie existante reste intacte', async () => {
    const { app, db, ai } = buildTestApp();
    const first = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(first.body);
    await app.background.drain();

    await postJson(
      app,
      '/api/resume',
      resumePayload({ meetingId, isEdit: true, versionId: 'v2-uuid' }),
    );
    await app.background.drain();

    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc.infographic.status).toBe('ready');
    expect(ai.calls.filter((c) => c.method === 'generateImage')).toHaveLength(1);
  });
});

describe('infographicPrompt — actions masquées', () => {
  it('une action retirée par l’utilisateur (`show: false`) ne ressort pas ; sans champ `show`, visible', () => {
    const out = infographicPrompt({
      transcription: 'Réunion.',
      actions: [
        { id: 1, title: 'Relancer le fournisseur', show: true },
        { id: 2, title: 'Commander les badges', show: false },
        { id: 3, title: 'Envoyer le devis' },
      ],
    });
    expect(out).toContain('- Relancer le fournisseur');
    expect(out).toContain('- Envoyer le devis');
    expect(out).not.toContain('Commander les badges');
  });

  it('toutes masquées → « (aucune) », pas une liste vide', () => {
    const out = infographicPrompt({ actions: [{ title: 'X', show: false }] });
    expect(out).toContain('#ACTIONS\n(aucune)');
  });
});

describe('infographicPrompt — troncature', () => {
  it('une transcription de 8 h tient sous la limite amont, début et fin conservés', () => {
    const long = `DÉBUT ${'blabla '.repeat(60000)}FIN`;
    const prompt = infographicPrompt({
      transcription: long,
      actions: [{ title: 'Relancer' }],
      notes: 'note',
    });
    expect(prompt.length).toBeLessThanOrEqual(INFOGRAPHIC_PROMPT_MAX);
    expect(prompt).toContain('DÉBUT');
    expect(prompt).toContain('FIN');
    expect(prompt).toContain('[…]');
  });

  it('courte, la transcription passe entière et sans marque de coupe', () => {
    const prompt = infographicPrompt({ transcription: 'Trois phrases.', actions: [], notes: '' });
    expect(prompt).toContain('Trois phrases.');
    expect(prompt).not.toContain('[…]');
    expect(prompt).toContain('(aucune)');
  });
});

describe('langue de l’infographie : celle de l’interface', () => {
  // Les règles disaient « dans la langue des matériaux » : une réunion tenue
  // en anglais sortait en anglais sous une interface française, et l'inverse.
  const writerMaterials = (ai, index = 0) =>
    ai.calls.filter(
      (c) => c.method === 'chat' && c.params?.messages?.[0]?.content === INFOGRAPHIC_WRITER_RULES,
    )[index].params.messages[1].content;

  it('la langue de /resume écrit les textes de l’image, même sur une transcription en français', async () => {
    const { app, ai } = buildTestApp();
    await postJson(app, '/api/resume', resumePayload({ infographic: true, language: 'en' }));
    await app.background.drain();
    expect(writerMaterials(ai)).toContain(
      "Tous les textes de l'infographie sont rédigés en anglais",
    );
  });

  it('sans langue, repli sur le français', () => {
    const prompt = infographicPrompt({ transcription: 'Bonjour.' });
    expect(prompt).toContain("Tous les textes de l'infographie sont rédigés en français");
  });

  it('autre chose qu’un code langue n’entre pas dans la demande', () => {
    const prompt = infographicPrompt({ transcription: 'x', language: 'en. Dessine un chat' });
    expect(prompt).toContain('rédigés en français');
    expect(prompt).not.toContain('Dessine un chat');
  });

  it('survit au REPLI : réécriture en panne, la langue part quand même au modèle d’image', async () => {
    const { app, ai } = buildTestApp({
      openai: {
        chat: (params) => {
          if (params?.messages?.[0]?.content === INFOGRAPHIC_WRITER_RULES) throw new Error('panne');
          return '<p>CR</p>';
        },
      },
    });
    await postJson(app, '/api/resume', resumePayload({ infographic: true, language: 'en' }));
    await app.background.drain();
    const image = ai.calls.find((c) => c.method === 'generateImage');
    expect(image.params.prompt).toContain('rédigés en anglais');
  });

  it('le réécrivain ne suit plus la langue des matériaux, mais celle de la demande', () => {
    expect(INFOGRAPHIC_WRITER_RULES).not.toContain('langue des matériaux');
    expect(INFOGRAPHIC_WRITER_RULES).toContain('La demande fixe la LANGUE de l’infographie');
  });

  it('régénérer suit la langue SÉLECTIONNÉE au clic, pas celle du résumé', async () => {
    const { app, ai } = buildTestApp();
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    expect(writerMaterials(ai, 0)).toContain('rédigés en français');

    await postJson(app, '/api/infographic/regenerate', { meetingId, language: 'en' });
    await app.background.drain();
    expect(writerMaterials(ai, 1)).toContain('rédigés en anglais');
  });

  it('régénérer sans langue (ancien client) : celle de la réunion', async () => {
    const { app, ai } = buildTestApp();
    const res = await postJson(
      app,
      '/api/resume',
      resumePayload({ infographic: true, language: 'en' }),
    );
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();

    await postJson(app, '/api/infographic/regenerate', { meetingId });
    await app.background.drain();
    expect(writerMaterials(ai, 1)).toContain('rédigés en anglais');
  });
});

describe('style graphique imposé par l’administration', () => {
  const STYLE = 'Violet, orange et rose. Schémas clairs. Nom de la société en haut à gauche.';

  it('voyage dans la DEMANDE (avant la transcription) quand il est réglé', async () => {
    const { app, ai } = buildTestApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
    await postJson(app, '/api/admin/settings/ai', { infographicStyle: STYLE }, ADMIN);

    await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    await app.background.drain();

    const writer = ai.calls.find(
      (c) => c.method === 'chat' && c.params?.messages?.[0]?.content === INFOGRAPHIC_WRITER_RULES,
    );
    const materials = writer.params.messages[1].content;
    expect(materials).toContain(STYLE);
    // En phrase, dans la demande — PAS un bloc étiqueté en tête : un bloc se
    // fait recopier tel quel sur l'image (leçon #ACTIONS du 2026-08-31).
    expect(materials).toContain('Style graphique imposé pour cette infographie');
    expect(materials.indexOf(STYLE)).toBeLessThan(materials.indexOf('#TRANSCRIPTION'));
    // Le réécrivain sait quoi en faire : la règle de préséance est là.
    expect(INFOGRAPHIC_WRITER_RULES).toContain('style graphique imposé');
  });

  it('survit au REPLI : réécriture en panne, la charte part quand même au modèle d’image', async () => {
    const { app, ai } = buildTestApp({
      seed: { user: [userDoc(ADMIN, { role: 'admin' })] },
      openai: {
        chat: (params) => {
          if (params?.messages?.[0]?.content === INFOGRAPHIC_WRITER_RULES) {
            throw new Error('panne réécriture');
          }
          return '<p>CR</p>';
        },
      },
    });
    await postJson(app, '/api/admin/settings/ai', { infographicStyle: STYLE }, ADMIN);

    await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    await app.background.drain();

    const image = ai.calls.find((c) => c.method === 'generateImage');
    expect(image.params.prompt).toContain(STYLE);
  });

  it('non réglé : la demande est EXACTEMENT celle d’avant ce réglage', async () => {
    const { app, ai } = buildTestApp();
    await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    await app.background.drain();

    const writer = ai.calls.find(
      (c) => c.method === 'chat' && c.params?.messages?.[0]?.content === INFOGRAPHIC_WRITER_RULES,
    );
    expect(writer.params.messages[1].content).not.toContain('Style graphique imposé');
  });

  it('vidé, il ne s’applique plus — et la régénération suit la charte du moment', async () => {
    const { app, ai } = buildTestApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
    await postJson(app, '/api/admin/settings/ai', { infographicStyle: STYLE }, ADMIN);
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();

    await postJson(app, '/api/admin/settings/ai', { infographicStyle: '' }, ADMIN);
    await postJson(app, '/api/infographic/regenerate', { meetingId });
    await app.background.drain();

    const writers = ai.calls.filter(
      (c) => c.method === 'chat' && c.params?.messages?.[0]?.content === INFOGRAPHIC_WRITER_RULES,
    );
    expect(writers).toHaveLength(2);
    expect(writers[0].params.messages[1].content).toContain(STYLE);
    expect(writers[1].params.messages[1].content).not.toContain(STYLE);
  });

  it('enregistré seul, il ne touche NI la clé NI l’interrupteur ; borné à la lecture', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
    await postJson(
      app,
      '/api/admin/settings/ai',
      { apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789' },
      ADMIN,
    );
    const saved = await postJson(
      app,
      '/api/admin/settings/ai',
      { infographicStyle: `  ${STYLE}  ` },
      ADMIN,
    );
    const settings = JSON.parse(saved.body).settings;
    expect(settings.hasKey).toBe(true);
    expect(settings.infographicEnabled).toBe(true);
    // Trimé à l'écriture : sinon l'écran se croit modifié juste après avoir
    // enregistré (il compare sa saisie à la valeur servie).
    expect(settings.infographicStyle).toBe(STYLE);

    // Refusé au-delà du plafond du schéma — pas tronqué en silence.
    const tooLong = await postJson(
      app,
      '/api/admin/settings/ai',
      { infographicStyle: 'x'.repeat(INFOGRAPHIC_STYLE_MAX + 1) },
      ADMIN,
    );
    expect(tooLong.statusCode).toBe(400);
  });

  it('reste privé : la sonde publique /auth/config n’en dit rien', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
    await postJson(app, '/api/admin/settings/ai', { infographicStyle: STYLE }, ADMIN);
    const probe = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(probe.body).not.toContain('Violet');
    expect(JSON.parse(probe.body).infographic).toEqual({ enabled: true });
  });
});

describe('GET /api/infographic', () => {
  it("sert l'état puis l'image en data-URL une fois prête", async () => {
    const { app } = buildTestApp();
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();

    const img = await getJson(app, `/api/infographic?meetingId=${meetingId}`);
    expect(img.statusCode).toBe(200);
    const body = JSON.parse(img.body);
    expect(body.status).toBe('ready');
    expect(body.dataUrl).toBe('data:image/png;base64,aW1hZ2UtZmFjdGljZQ==');
    expect(body.updatedAt).toBeTruthy();
  });

  it("réunion sans infographie → statut `none`, réunion d'autrui → 404", async () => {
    const { app } = buildTestApp();
    const res = await postJson(app, '/api/resume', resumePayload());
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();

    const none = await getJson(app, `/api/infographic?meetingId=${meetingId}`);
    expect(JSON.parse(none.body).status).toBe('none');

    // Le scope propriétaire fait le travail : la réunion d'un autre n'existe pas.
    const foreign = await getJson(app, `/api/infographic?meetingId=${meetingId}`, OTHER);
    expect(foreign.statusCode).toBe(404);
  });

  it('meetingId absent → 400', async () => {
    const { app } = buildTestApp();
    const res = await getJson(app, '/api/infographic');
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/infographic/regenerate', () => {
  it('repart des matériaux STOCKÉS, sans toucher au compte rendu', async () => {
    const { app, db, ai } = buildTestApp();
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    const resumeBefore = (await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId })))
      .resume;

    const regen = await postJson(app, '/api/infographic/regenerate', { meetingId });
    expect(regen.statusCode).toBe(200);
    expect(JSON.parse(regen.body).status).toBe('pending');
    await app.background.drain();

    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc.infographic.status).toBe('ready');
    expect(doc.resume).toBe(resumeBefore);
    // Deux images générées au total (initiale + régénération), et le second
    // réécrivain a bien reçu la transcription stockée en base.
    const images = ai.calls.filter((c) => c.method === 'generateImage');
    expect(images).toHaveLength(2);
    const writers = ai.calls.filter(
      (c) => c.method === 'chat' && c.params?.messages?.[0]?.content === INFOGRAPHIC_WRITER_RULES,
    );
    expect(writers).toHaveLength(2);
    expect(writers[1].params.messages[1].content).toContain('On a parlé du projet INITECH.');
  });

  it('réunion ancienne : les textes de remplacement d’autrefois ne passent pas à l’image', async () => {
    // Avant le correctif, une action ajoutée à la main était ENREGISTRÉE avec
    // « Nouvelle action » / « À définir » : une réunion jamais retouchée depuis
    // en garde en base, que la régénération relit.
    const { app, ai } = buildTestApp({
      seed: {
        resume: [
          {
            email: EMAIL,
            meetingId: 'ancienne',
            transcription: 'On a parlé du projet INITECH.',
            notes: '',
            actions: [
              {
                id: 1,
                title: 'Nouvelle action',
                owner: 'À définir',
                dueDate: '',
                description: "Description de l'action...",
                show: true,
              },
              { id: 2, title: 'Relancer INITECH', owner: 'À définir', dueDate: '2026-09-18' },
            ],
          },
        ],
      },
    });
    await postJson(app, '/api/infographic/regenerate', { meetingId: 'ancienne' });
    await app.background.drain();
    const writer = ai.calls.find(
      (c) => c.method === 'chat' && c.params?.messages?.[0]?.content === INFOGRAPHIC_WRITER_RULES,
    );
    const materials = writer.params.messages[1].content;
    expect(materials).toContain('- Relancer INITECH — 2026-09-18');
    expect(materials).not.toContain('Nouvelle action');
    expect(materials).not.toContain('À définir');
    expect(materials).not.toContain("Description de l'action");
  });

  it('déjà en cours → pas de second travail (double facturation)', async () => {
    const { app, db, ai } = buildTestApp();
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    // Simule un `pending` en vol : la route doit rendre l'état, pas relancer.
    await db.collection('resume').updateOne(ownerFilter(EMAIL, { meetingId }), {
      $set: { infographic: { status: 'pending', updatedAt: 'T-en-vol' } },
    });
    const regen = await postJson(app, '/api/infographic/regenerate', { meetingId });
    expect(JSON.parse(regen.body)).toEqual({ status: 'pending', updatedAt: 'T-en-vol' });
    await app.background.drain();
    expect(ai.calls.filter((c) => c.method === 'generateImage')).toHaveLength(1);
  });

  it("refusée quand l'administration a coupé la fonctionnalité, ou sur la réunion d'autrui", async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();

    const foreign = await postJson(app, '/api/infographic/regenerate', { meetingId }, OTHER);
    expect(foreign.statusCode).toBe(404);

    await postJson(app, '/api/admin/settings/ai', { infographicEnabled: false }, ADMIN);
    const off = await postJson(app, '/api/infographic/regenerate', { meetingId });
    // 409, pas 403 : le client lit un 403 comme une session perdue.
    expect(off.statusCode).toBe(409);
    expect(JSON.parse(off.body).error).toBe('infographic_disabled');
  });
});

describe('infographie — droit donné par les groupes', () => {
  const DESIGN = 'g-design';

  /** EMAIL dans le groupe par défaut, et dans `extra` s'il est donné. */
  function seedWith({ defaultAllowed, extra } = {}) {
    const groups = [
      defaultGroupDoc(defaultAllowed === undefined ? {} : { infographicAllowed: defaultAllowed }),
    ];
    const groupIds = ['default'];
    if (extra) {
      groups.push(extra);
      groupIds.push(extra.id);
    }
    return {
      user: [userDoc(EMAIL, { groupIds }), userDoc(ADMIN, { role: 'admin' })],
      userGroups: groups,
    };
  }

  async function generate(app) {
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    await app.background.drain();
    return JSON.parse(res.body);
  }

  it('sans le droit : le compte rendu part sans image, et la régénération est refusée en 409', async () => {
    const { app, ai } = buildTestApp({ seed: seedWith({ defaultAllowed: false }) });
    const parsed = await generate(app);
    expect(parsed.resume).toBeTruthy();
    expect(parsed.infographic).toBeUndefined();
    expect(ai.calls.filter((c) => c.method === 'generateImage')).toHaveLength(0);

    const regen = await postJson(app, '/api/infographic/regenerate', {
      meetingId: parsed.meetingId,
    });
    expect(regen.statusCode).toBe(409);
    expect(JSON.parse(regen.body).error).toBe('infographic_not_allowed');
  });

  it('cumulatif : un seul groupe qui accorde suffit, même si « Défaut » refuse', async () => {
    const { app, ai } = buildTestApp({
      seed: seedWith({
        defaultAllowed: false,
        extra: groupDoc(DESIGN, { name: 'Design', infographicAllowed: true }),
      }),
    });
    const parsed = await generate(app);
    expect(parsed.infographic).toBe('pending');
    expect(ai.calls.filter((c) => c.method === 'generateImage')).toHaveLength(1);
  });

  it('groupes antérieurs au droit : « Défaut » le donne, les autres non', async () => {
    // Personne ne perd les infographies au déploiement : « Défaut » sans champ.
    const legacy = buildTestApp({ seed: seedWith() });
    expect((await generate(legacy.app)).infographic).toBe('pending');

    // Un autre groupe sans champ ne donne rien : seul « Défaut » refusant, pas d'image.
    const other = buildTestApp({
      seed: seedWith({ defaultAllowed: false, extra: groupDoc(DESIGN, { name: 'Design' }) }),
    });
    expect((await generate(other.app)).infographic).toBeUndefined();
  });

  it("l'interrupteur de l'onglet IA reste au-dessus des groupes", async () => {
    const { app, ai } = buildTestApp({
      seed: seedWith({ extra: groupDoc(DESIGN, { name: 'Design', infographicAllowed: true }) }),
    });
    await postJson(app, '/api/admin/settings/ai', { infographicEnabled: false }, ADMIN);
    expect((await generate(app)).infographic).toBeUndefined();
    expect(ai.calls.filter((c) => c.method === 'generateImage')).toHaveLength(0);
  });

  it('/init renvoie les droits tenus des groupes', async () => {
    const allowed = buildTestApp({ seed: seedWith() });
    const yes = await getJson(allowed.app, '/api/init');
    expect(JSON.parse(yes.body).rights).toEqual({ infographic: true });

    const refused = buildTestApp({ seed: seedWith({ defaultAllowed: false }) });
    const no = await getJson(refused.app, '/api/init');
    expect(JSON.parse(no.body).rights).toEqual({ infographic: false });
  });
});

describe('POST /api/infographic/delete', () => {
  it("retire l'image ET le drapeau — la réunion reste, GET répond `none`", async () => {
    const { app, db } = buildTestApp();
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();

    const del = await postJson(app, '/api/infographic/delete', { meetingId });
    expect(del.statusCode).toBe(200);

    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc).not.toBeNull();
    expect(doc.infographic).toBeUndefined();
    expect(
      await db.collection(INFOGRAPHICS_COLLECTION).findOne(ownerFilter(EMAIL, { meetingId })),
    ).toBeNull();
    const after = await getJson(app, `/api/infographic?meetingId=${meetingId}`);
    expect(JSON.parse(after.body).status).toBe('none');
  });
});

describe('suppression de réunion', () => {
  it("emporte l'infographie avec elle", async () => {
    const { app, db } = buildTestApp();
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();

    await postJson(app, '/api/history/delete', { meetingId });
    const img = await db
      .collection(INFOGRAPHICS_COLLECTION)
      .findOne(ownerFilter(EMAIL, { meetingId }));
    expect(img).toBeNull();
  });
});

describe('réglage Administration → IA', () => {
  it('exposé activé par défaut, désactivable, et reflété par la sonde publique /auth/config', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });

    const initial = await getJson(app, '/api/admin/settings/ai', ADMIN);
    expect(JSON.parse(initial.body).settings.infographicEnabled).toBe(true);

    const publicOn = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(JSON.parse(publicOn.body).infographic).toEqual({ enabled: true });

    const saved = await postJson(
      app,
      '/api/admin/settings/ai',
      { infographicEnabled: false },
      ADMIN,
    );
    expect(saved.statusCode).toBe(200);
    expect(JSON.parse(saved.body).settings.infographicEnabled).toBe(false);

    const publicOff = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(JSON.parse(publicOff.body).infographic).toEqual({ enabled: false });
  });

  it('changer le réglage ne touche NI la clé NI le modèle (champ absent = inchangé)', async () => {
    const { app } = buildTestApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
    await postJson(
      app,
      '/api/admin/settings/ai',
      { apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789' },
      ADMIN,
    );
    await postJson(app, '/api/admin/settings/ai', { infographicEnabled: false }, ADMIN);
    const after = JSON.parse((await getJson(app, '/api/admin/settings/ai', ADMIN)).body).settings;
    expect(after.hasKey).toBe(true);
    expect(after.infographicEnabled).toBe(false);
  });
});
