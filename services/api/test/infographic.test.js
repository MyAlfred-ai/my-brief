/**
 * Infographie de compte rendu.
 *
 * Garanties à tenir :
 *   - l'infographie ne se génère que si la case est cochée, si l'administration
 *     la propose ET si un groupe du compte en donne le droit — jamais « parce
 *     que le champ traînait dans le corps » ;
 *   - un refus de régénération n'est jamais un 403, que le client lirait comme
 *     une session perdue ;
 *   - le drapeau `infographic.status` se règle dans TOUS les cas de sortie
 *     (ready comme error) : c'est lui qui borne le polling du frontend ;
 *   - le contenu vit dans SA collection, jamais dans le document `resume` que
 *     /history renvoie entier ;
 *   - la sortie du modèle n'est jamais stockée telle quelle (normalizeLayout) ;
 *   - les anciennes infographies (images) restent servies ;
 *   - toutes les lectures/écritures sont scopées par le propriétaire.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc, groupDoc, defaultGroupDoc } from './helpers.js';
import { ownerFilter, ownerFields } from '../lib/ownerScope.js';
import {
  infographicPrompt,
  INFOGRAPHIC_PROMPT_MAX,
  INFOGRAPHIC_STYLE_MAX,
  INFOGRAPHIC_LAYOUT_RULES,
} from '../lib/prompts.js';
import { INFOGRAPHICS_COLLECTION, INFOGRAPHIC_REASONING_EFFORT } from '../lib/infographic.js';
import {
  INFOGRAPHIC_ICONS,
  INFOGRAPHIC_TEMPLATES,
  LAYOUT_LIMITS,
  layoutActions,
  normalizeLayout,
  parseLayoutOutput,
} from '../lib/infographicLayout.js';
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

/** Ce que « répond » le modèle de contenu dans ces tests. */
const SAMPLE_LAYOUT = {
  gabarit: 'decision',
  titre: 'INITECH : budget de 12 000 € validé',
  sousTitre: 'Point projet sur le budget INITECH',
  heros: { valeur: '12 000 €', libelle: 'Budget validé pour INITECH', icone: 'euro' },
  chiffres: [],
  repartition: null,
  sujets: [{ titre: 'Budget', icone: 'euro', points: ['12 000 € validés'] }],
  decisions: ['Budget de 12 000 € validé'],
  vigilances: [],
  jalons: [],
  options: [],
  idees: [],
  bilan: { reussites: [], difficultes: [], essais: [] },
  participants: ['Alex Dupont'],
  prochaineEtape: '',
};

/** L'appel qui écrit le contenu, distingué des autres chats (compte rendu, titre). */
const isLayoutCall = (c) =>
  c.method === 'chat' && c.params?.messages?.[0]?.content === INFOGRAPHIC_LAYOUT_RULES;
const layoutCalls = (ai) => ai.calls.filter(isLayoutCall);

/**
 * buildTestApp dont le modèle répond SAMPLE_LAYOUT (ou `layout`, texte ou
 * fonction) à l'appel de contenu, et « réponse par défaut » au reste.
 */
function testApp({ layout = JSON.stringify(SAMPLE_LAYOUT), ...options } = {}) {
  return buildTestApp({
    ...options,
    openai: {
      chat: (params) => {
        if (params?.messages?.[0]?.content !== INFOGRAPHIC_LAYOUT_RULES) {
          return 'réponse par défaut';
        }
        return typeof layout === 'function' ? layout(params) : layout;
      },
      ...(options.openai || {}),
    },
  });
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
  it('pose `pending` avant la réponse, puis écrit le contenu + `ready` en tâche de fond', async () => {
    const { app, db, ai } = testApp();
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
    // Le contenu vit dans SA collection, jamais dans le document servi par /history.
    expect(doc.layout).toBeUndefined();
    const stored = await db
      .collection(INFOGRAPHICS_COLLECTION)
      .findOne(ownerFilter(EMAIL, { meetingId }));
    expect(stored.image).toBeUndefined();
    expect(stored.model).toBe('gpt-6-luna');
    expect(stored.layout).toMatchObject({
      version: 1,
      gabarit: 'decision',
      langue: 'fr',
      titre: 'INITECH : budget de 12 000 € validé',
      heros: { valeur: '12 000 €', icone: 'euro' },
    });
    // Les actions viennent du CODE, telles que l'écran les montre — pas du modèle.
    expect(stored.layout.actions).toEqual([
      { texte: 'Relancer', responsable: 'Alex', echeance: '2026-09-01' },
    ]);
    expect(stored.layout.actionsTotal).toBe(1);

    // UN appel : le contenu. Plus de dessin.
    const writer = layoutCalls(ai);
    expect(writer).toHaveLength(1);
    // Le palier rapide : un JSON court ne demande pas le modèle du compte rendu.
    expect(writer[0].params.model).toBe('gpt-6-luna');
    expect(writer[0].params.reasoningEffort).toBe(INFOGRAPHIC_REASONING_EFFORT);
    expect(ai.calls.filter((c) => c.method === 'generateImage')).toHaveLength(0);
    const materials = writer[0].params.messages[1].content;
    expect(materials).toContain("Prépare le contenu de l'infographie de cette réunion");
    expect(materials).toContain('On a parlé du projet INITECH.');
    expect(materials).toContain('INITECH s’écrit en capitales.');
    expect(materials).toContain('Relancer — Alex — 2026-09-01');
    // Le modèle de compte rendu part en INDICE du choix de gabarit.
    expect(materials).toContain(
      "Modèle de compte rendu choisi par l'utilisateur pour cette réunion : « Standard »",
    );
    // TRANSCRIPTION D'ABORD — mesuré : actions/notes en tête, le modèle en
    // faisait toute sa matière et ignorait la transcription.
    expect(materials.indexOf('#TRANSCRIPTION')).toBeLessThan(materials.indexOf('#ACTIONS'));
    expect(materials.indexOf('#ACTIONS')).toBeLessThan(materials.indexOf('#NOTES'));
  });

  it('OPENAI_MODEL_INFOGRAPHIC règle le modèle de contenu SEUL — le résumé garde le sien', async () => {
    // Une surcharge propre à l'infographie : rien ne doit la confondre avec le
    // réglage du compte rendu.
    const { openai } = loadConfig({ OPENAI_MODEL_INFOGRAPHIC: 'modele-infographie' });
    const { app, ai } = testApp({ config: { openai } });
    await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    await app.background.drain();

    const writer = layoutCalls(ai)[0];
    const summary = ai.calls.find(
      (c) => c.method === 'chat' && c.params.messages[0].content === resumePayload().systemPrompt,
    );
    expect(writer.params.model).toBe('modele-infographie');
    expect(summary.params.model).not.toBe('modele-infographie');
  });

  it('réponse illisible → statut `error`, jamais `pending` à demeure', async () => {
    const { app, db } = testApp({ layout: 'Voici votre infographie : un beau poster !' });
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc.infographic.status).toBe('error');
    expect(
      await db.collection(INFOGRAPHICS_COLLECTION).findOne(ownerFilter(EMAIL, { meetingId })),
    ).toBeNull();
  });

  it('modèle en panne → statut `error`', async () => {
    const { app, db } = testApp({
      layout: () => {
        throw new Error('panne amont');
      },
    });
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc.infographic.status).toBe('error');
  });

  it('ne génère RIEN sans la case, même si tout le reste est là', async () => {
    const { app, db, ai } = testApp();
    const res = await postJson(app, '/api/resume', resumePayload());
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc.infographic).toBeUndefined();
    expect(layoutCalls(ai)).toHaveLength(0);
  });

  it("ne génère rien quand l'administration a désactivé la fonctionnalité", async () => {
    const { app, db, ai } = testApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
    await postJson(app, '/api/admin/settings/ai', { infographicEnabled: false }, ADMIN);
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const parsed = JSON.parse(res.body);
    expect(parsed.infographic).toBeUndefined();
    await app.background.drain();
    const doc = await db
      .collection('resume')
      .findOne(ownerFilter(EMAIL, { meetingId: parsed.meetingId }));
    expect(doc.infographic).toBeUndefined();
    expect(layoutCalls(ai)).toHaveLength(0);
  });

  it('régénération SANS la case : l’infographie existante reste intacte', async () => {
    const { app, db, ai } = testApp();
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
    expect(layoutCalls(ai)).toHaveLength(1);
  });

  it('le style graphique enregistré en administration ne part plus au modèle', async () => {
    // Les couleurs et le logo viennent désormais de l'Apparence : un ancien
    // style (« violet et orange… ») n'a plus rien à dire au contenu.
    const { app, ai } = testApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
    await postJson(app, '/api/admin/settings/ai', { infographicStyle: 'Violet et orange.' }, ADMIN);
    await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    await app.background.drain();
    expect(layoutCalls(ai)[0].params.messages[1].content).not.toContain('Violet');
  });
});

describe('/api/resume — l’infographie s’écrit PENDANT le compte rendu', () => {
  /** Une promesse qu'on libère à la main : le compte rendu « en cours de rédaction ». */
  const gate = () => {
    let open;
    const promise = new Promise((resolve) => {
      open = resolve;
    });
    return { promise, open };
  };
  const until = async (check) => {
    for (let i = 0; i < 200 && !check(); i += 1) await new Promise((r) => setImmediate(r));
    return check();
  };

  it('le contenu part dès la requête, sans attendre la fin de la rédaction', async () => {
    const summary = gate();
    const { app, db, ai } = testApp({
      openai: {
        chat: async (params) => {
          if (params?.messages?.[0]?.content === INFOGRAPHIC_LAYOUT_RULES) {
            return JSON.stringify(SAMPLE_LAYOUT);
          }
          await summary.promise;
          return '<p>CR</p>';
        },
      },
    });
    const request = postJson(app, '/api/resume', resumePayload({ infographic: true }));
    // Le compte rendu n'est pas fini… et l'infographie est déjà demandée.
    expect(await until(() => layoutCalls(ai).length === 1)).toBe(true);
    summary.open();
    const res = await request;
    const { meetingId } = JSON.parse(res.body);
    expect(JSON.parse(res.body).infographic).toBe('pending');
    await app.background.drain();
    const doc = await db.collection('resume').findOne(ownerFilter(EMAIL, { meetingId }));
    expect(doc.infographic.status).toBe('ready');
    const stored = await db
      .collection(INFOGRAPHICS_COLLECTION)
      .findOne(ownerFilter(EMAIL, { meetingId }));
    expect(stored.layout.gabarit).toBe('decision');
  });

  it('rédaction en échec : rien n’est enregistré, ni contenu ni drapeau', async () => {
    const { app, db } = testApp({
      openai: {
        chat: async (params) => {
          if (params?.messages?.[0]?.content === INFOGRAPHIC_LAYOUT_RULES) {
            return JSON.stringify(SAMPLE_LAYOUT);
          }
          throw new Error('panne de rédaction');
        },
      },
    });
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    await app.background.drain();
    expect(await db.collection(INFOGRAPHICS_COLLECTION).findOne({})).toBeNull();
  });

  it('une réunion qui naît à cette génération : date et durée viennent de la requête', async () => {
    const { app, db } = testApp();
    const res = await postJson(
      app,
      '/api/resume',
      resumePayload({
        infographic: true,
        meetingStartTime: '2026-11-12T09:00:00.000Z',
        meetingDuration: 2700,
      }),
    );
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    const stored = await db
      .collection(INFOGRAPHICS_COLLECTION)
      .findOne(ownerFilter(EMAIL, { meetingId }));
    expect(stored.layout.date).toBe('2026-11-12T09:00:00.000Z');
    expect(stored.layout.dureeSec).toBe(2700);
  });
});

describe('règles du modèle de contenu', () => {
  it('présentent les six gabarits et la liste FERMÉE des pictogrammes', () => {
    for (const id of INFOGRAPHIC_TEMPLATES) expect(INFOGRAPHIC_LAYOUT_RULES).toContain(`"${id}"`);
    expect(INFOGRAPHIC_LAYOUT_RULES).toContain(INFOGRAPHIC_ICONS.join(', '));
  });

  it('demandent un JSON compact : l’indentation se paierait en temps d’écriture', () => {
    expect(INFOGRAPHIC_LAYOUT_RULES).toContain('COMPACT : sur une seule ligne');
  });

  it("interdisent de recopier les actions : l'application les pose elle-même", () => {
    expect(INFOGRAPHIC_LAYOUT_RULES).toContain('ne les recopie dans aucune rubrique');
  });

  it('un modèle de compte rendu personnel ne fuit pas en indice', () => {
    const prompt = infographicPrompt({ transcription: 'x', template: 'tpl-7f3a' });
    expect(prompt).not.toContain('Modèle de compte rendu');
    expect(prompt).not.toContain('tpl-7f3a');
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
  const writerMaterials = (ai, index = 0) => layoutCalls(ai)[index].params.messages[1].content;

  it('la langue de /resume écrit les textes, même sur une transcription en français', async () => {
    const { app, db, ai } = testApp();
    const res = await postJson(
      app,
      '/api/resume',
      resumePayload({ infographic: true, language: 'en' }),
    );
    await app.background.drain();
    expect(writerMaterials(ai)).toContain(
      "Tous les textes de l'infographie sont rédigés en anglais",
    );
    // Les libellés du gabarit (« Actions », « Décisions »…) suivent cette langue.
    const { meetingId } = JSON.parse(res.body);
    const stored = await db
      .collection(INFOGRAPHICS_COLLECTION)
      .findOne(ownerFilter(EMAIL, { meetingId }));
    expect(stored.layout.langue).toBe('en');
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

  it('les règles suivent la langue de la demande, pas celle des matériaux', () => {
    expect(INFOGRAPHIC_LAYOUT_RULES).not.toContain('langue des matériaux');
    expect(INFOGRAPHIC_LAYOUT_RULES).toContain('La demande fixe la LANGUE de l’infographie');
  });

  it('régénérer suit la langue SÉLECTIONNÉE au clic, pas celle du résumé', async () => {
    const { app, ai } = testApp();
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    expect(writerMaterials(ai, 0)).toContain('rédigés en français');

    await postJson(app, '/api/infographic/regenerate', { meetingId, language: 'en' });
    await app.background.drain();
    expect(writerMaterials(ai, 1)).toContain('rédigés en anglais');
  });

  it('régénérer sans langue (ancien client) : celle de la réunion', async () => {
    const { app, ai } = testApp();
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

describe('contexte du tag : éclaire l’infographie, sans en être la source', () => {
  const MARK = '#CONTEXTE DU DOSSIER « Projet Atlas »';
  const writerMaterials = (ai, index = 0) => layoutCalls(ai)[index].params.messages[1].content;
  const tag = (email, context) => ({
    ...ownerFields(email),
    id: 't-atlas',
    label: 'Projet Atlas',
    labelLower: 'projet atlas',
    color: 'teal',
    ...(context === undefined ? {} : { context }),
  });
  const ATLAS = 'Cliente : Claire Martin. PAC = pompe à chaleur. Livraison en juin 2027.';

  it('/resume avec le tag : son contexte, relu en base, suit les matériaux', async () => {
    const { app, ai } = testApp({ seed: { userTags: [tag(EMAIL, ATLAS)] } });
    await postJson(app, '/api/resume', resumePayload({ infographic: true, tagId: 't-atlas' }));
    await app.background.drain();
    const materials = writerMaterials(ai);
    expect(materials).toContain(MARK);
    expect(materials).toContain('Claire Martin');
    expect(materials).toContain("Ce n'est PAS une source");
    // APRÈS les matériaux : la transcription reste la matière principale.
    expect(materials.indexOf('#NOTES')).toBeLessThan(materials.indexOf(MARK));
  });

  it('le tag d’un AUTRE compte ne prête pas son contexte', async () => {
    const { app, ai } = testApp({ seed: { userTags: [tag(OTHER, ATLAS)] } });
    await postJson(app, '/api/resume', resumePayload({ infographic: true, tagId: 't-atlas' }));
    await app.background.drain();
    expect(writerMaterials(ai)).not.toContain('Claire Martin');
  });

  it('un tag sans contexte, ou un tagId qui n’est pas une chaîne : la demande d’avant', async () => {
    const { app, ai } = testApp({ seed: { userTags: [tag(EMAIL)] } });
    await postJson(app, '/api/resume', resumePayload({ infographic: true, tagId: 't-atlas' }));
    await postJson(app, '/api/resume', resumePayload({ infographic: true, tagId: { $ne: null } }));
    await app.background.drain();
    expect(layoutCalls(ai)).toHaveLength(2);
    expect(writerMaterials(ai, 0)).not.toContain('#CONTEXTE DU DOSSIER');
    expect(writerMaterials(ai, 1)).not.toContain('#CONTEXTE DU DOSSIER');
  });

  it('régénérer relit le tag que porte la réunion AUJOURD’HUI', async () => {
    const { app, ai } = testApp({ seed: { userTags: [tag(EMAIL, ATLAS)] } });
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();
    expect(writerMaterials(ai, 0)).not.toContain(MARK);

    await postJson(app, '/api/history/tag', { meetingId, tagId: 't-atlas' });
    await postJson(app, '/api/infographic/regenerate', { meetingId });
    await app.background.drain();
    expect(writerMaterials(ai, 1)).toContain(MARK);
  });
});

describe('style graphique (réglage hérité, plus appliqué)', () => {
  const STYLE = 'Violet, orange et rose. Schémas clairs. Nom de la société en haut à gauche.';

  it('enregistré seul, il ne touche NI la clé NI l’interrupteur ; borné à la lecture', async () => {
    const { app } = testApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
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
    const { app } = testApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
    await postJson(app, '/api/admin/settings/ai', { infographicStyle: STYLE }, ADMIN);
    const probe = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(probe.body).not.toContain('Violet');
    expect(JSON.parse(probe.body).infographic).toEqual({ enabled: true });
  });
});

describe('GET /api/infographic', () => {
  it("sert l'état puis le contenu à mettre en page une fois prêt", async () => {
    const { app } = testApp();
    const res = await postJson(app, '/api/resume', resumePayload({ infographic: true }));
    const { meetingId } = JSON.parse(res.body);
    await app.background.drain();

    const got = await getJson(app, `/api/infographic?meetingId=${meetingId}`);
    expect(got.statusCode).toBe(200);
    const body = JSON.parse(got.body);
    expect(body.status).toBe('ready');
    expect(body.layout.gabarit).toBe('decision');
    expect(body.dataUrl).toBeUndefined();
    expect(body.updatedAt).toBeTruthy();
  });

  it("une infographie d'avant les gabarits reste servie : l'image, telle quelle", async () => {
    const { app } = testApp({
      seed: {
        resume: [
          {
            ...ownerFields(EMAIL),
            meetingId: 'ancienne',
            transcription: 'x',
            infographic: { status: 'ready', updatedAt: '2026-10-01T10:00:00.000Z' },
          },
        ],
        [INFOGRAPHICS_COLLECTION]: [
          { ...ownerFields(EMAIL), meetingId: 'ancienne', image: 'QUJD', mime: 'image/png' },
        ],
      },
    });
    const body = JSON.parse((await getJson(app, '/api/infographic?meetingId=ancienne')).body);
    expect(body).toMatchObject({ status: 'ready', dataUrl: 'data:image/png;base64,QUJD' });
    expect(body.layout).toBeUndefined();
  });

  it('régénérer une ancienne image la remplace par un gabarit — jamais les deux', async () => {
    const { app, db } = testApp({
      seed: {
        resume: [
          {
            _id: 'r-ancienne',
            ...ownerFields(EMAIL),
            meetingId: 'ancienne',
            transcription: 'On a parlé du projet INITECH.',
            infographic: { status: 'ready', updatedAt: '2026-10-01T10:00:00.000Z' },
          },
        ],
        [INFOGRAPHICS_COLLECTION]: [
          {
            _id: 'i-ancienne',
            ...ownerFields(EMAIL),
            meetingId: 'ancienne',
            image: 'QUJD',
            mime: 'image/png',
            size: '1024x1536',
          },
        ],
      },
    });
    await postJson(app, '/api/infographic/regenerate', { meetingId: 'ancienne' });
    await app.background.drain();
    const stored = await db
      .collection(INFOGRAPHICS_COLLECTION)
      .findOne(ownerFilter(EMAIL, { meetingId: 'ancienne' }));
    expect(stored.layout.gabarit).toBe('decision');
    expect(stored.image).toBeUndefined();
    expect(stored.mime).toBeUndefined();
    const body = JSON.parse((await getJson(app, '/api/infographic?meetingId=ancienne')).body);
    expect(body.dataUrl).toBeUndefined();
    expect(body.layout).toBeTruthy();
  });

  it("réunion sans infographie → statut `none`, réunion d'autrui → 404", async () => {
    const { app } = testApp();
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
    const { app } = testApp();
    const res = await getJson(app, '/api/infographic');
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/infographic/regenerate', () => {
  it('repart des matériaux STOCKÉS, sans toucher au compte rendu', async () => {
    const { app, db, ai } = testApp();
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
    // Deux contenus écrits (initial + régénération), et le second a bien reçu
    // la transcription stockée en base.
    const writers = layoutCalls(ai);
    expect(writers).toHaveLength(2);
    expect(writers[1].params.messages[1].content).toContain('On a parlé du projet INITECH.');
  });

  it('réunion ancienne : les textes de remplacement d’autrefois ne passent pas à l’infographie', async () => {
    // Avant le correctif, une action ajoutée à la main était ENREGISTRÉE avec
    // « Nouvelle action » / « À définir » : une réunion jamais retouchée depuis
    // en garde en base, que la régénération relit.
    const { app, ai } = testApp({
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
    const materials = layoutCalls(ai)[0].params.messages[1].content;
    expect(materials).toContain('- Relancer INITECH — 2026-09-18');
    expect(materials).not.toContain('Nouvelle action');
    expect(materials).not.toContain('À définir');
    expect(materials).not.toContain("Description de l'action");
  });

  it('déjà en cours → pas de second travail (double facturation)', async () => {
    const { app, db, ai } = testApp();
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
    expect(layoutCalls(ai)).toHaveLength(1);
  });

  it("refusée quand l'administration a coupé la fonctionnalité, ou sur la réunion d'autrui", async () => {
    const { app } = testApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
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
    // Un seul groupe par compte : celui de `extra` quand il y en a un.
    const groupIds = [extra ? extra.id : 'default'];
    if (extra) groups.push(extra);
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

  it('sans le droit : le compte rendu part sans infographie, et la régénération est refusée en 409', async () => {
    const { app, ai } = testApp({ seed: seedWith({ defaultAllowed: false }) });
    const parsed = await generate(app);
    expect(parsed.resume).toBeTruthy();
    expect(parsed.infographic).toBeUndefined();
    expect(layoutCalls(ai)).toHaveLength(0);

    const regen = await postJson(app, '/api/infographic/regenerate', {
      meetingId: parsed.meetingId,
    });
    expect(regen.statusCode).toBe(409);
    expect(JSON.parse(regen.body).error).toBe('infographic_not_allowed');
  });

  it('le droit est celui du groupe du compte, quoi que fasse « Défaut »', async () => {
    const { app, ai } = testApp({
      seed: seedWith({
        defaultAllowed: false,
        extra: groupDoc(DESIGN, { name: 'Design', infographicAllowed: true }),
      }),
    });
    const parsed = await generate(app);
    expect(parsed.infographic).toBe('pending');
    expect(layoutCalls(ai)).toHaveLength(1);
  });

  it('groupes antérieurs au droit : « Défaut » le donne, les autres non', async () => {
    // Personne ne perd les infographies au déploiement : « Défaut » sans champ.
    const legacy = testApp({ seed: seedWith() });
    expect((await generate(legacy.app)).infographic).toBe('pending');

    // Un autre groupe sans champ ne donne rien : pas d'infographie pour ses membres.
    const other = testApp({
      seed: seedWith({ defaultAllowed: false, extra: groupDoc(DESIGN, { name: 'Design' }) }),
    });
    expect((await generate(other.app)).infographic).toBeUndefined();
  });

  it("l'interrupteur de la rubrique Modèles IA reste au-dessus des groupes", async () => {
    const { app, ai } = testApp({
      seed: seedWith({ extra: groupDoc(DESIGN, { name: 'Design', infographicAllowed: true }) }),
    });
    await postJson(app, '/api/admin/settings/ai', { infographicEnabled: false }, ADMIN);
    expect((await generate(app)).infographic).toBeUndefined();
    expect(layoutCalls(ai)).toHaveLength(0);
  });

  it('/init renvoie les droits tenus des groupes', async () => {
    const allowed = testApp({ seed: seedWith() });
    const yes = await getJson(allowed.app, '/api/init');
    expect(JSON.parse(yes.body).rights).toEqual({
      infographic: true,
      aiHelp: false,
      aiHelpMyBrain: false,
    });

    const refused = testApp({ seed: seedWith({ defaultAllowed: false }) });
    const no = await getJson(refused.app, '/api/init');
    expect(JSON.parse(no.body).rights).toEqual({
      infographic: false,
      aiHelp: false,
      aiHelpMyBrain: false,
    });
  });
});

describe('POST /api/infographic/delete', () => {
  it('retire le contenu ET le drapeau — la réunion reste, GET répond `none`', async () => {
    const { app, db } = testApp();
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
    const { app, db } = testApp();
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
    const { app } = testApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });

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
    const { app } = testApp({ seed: { user: [userDoc(ADMIN, { role: 'admin' })] } });
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

describe('parseLayoutOutput — ce que le modèle répond', () => {
  it('lit un objet brut, entre balises de code, ou noyé dans du texte', () => {
    expect(parseLayoutOutput('{"titre":"A"}')).toEqual({ titre: 'A' });
    expect(parseLayoutOutput('```json\n{"titre":"B"}\n```')).toEqual({ titre: 'B' });
    expect(parseLayoutOutput('Voici :\n{"titre":"C"}\nBonne lecture')).toEqual({ titre: 'C' });
  });

  it('rien de lisible, ou autre chose qu’un objet → null', () => {
    expect(parseLayoutOutput('')).toBeNull();
    expect(parseLayoutOutput('pas de JSON ici')).toBeNull();
    expect(parseLayoutOutput('[1, 2, 3]')).toBeNull();
    expect(parseLayoutOutput(undefined)).toBeNull();
  });
});

describe('normalizeLayout — rien d’inattendu ne va à l’écran', () => {
  it('un objet vide donne une synthèse vide mais complète, en français', () => {
    const layout = normalizeLayout({});
    expect(layout).toMatchObject({
      version: 1,
      gabarit: 'synthese',
      langue: 'fr',
      titre: '',
      heros: { valeur: '', libelle: '', icone: 'point' },
      chiffres: [],
      repartition: null,
      bilan: { reussites: [], difficultes: [], essais: [] },
      actions: [],
      actionsTotal: 0,
    });
  });

  it('ne garde que les clés connues — une clé inventée ne passe pas', () => {
    const layout = normalizeLayout({ ...SAMPLE_LAYOUT, html: '<script>alert(1)</script>' });
    expect(layout.html).toBeUndefined();
    expect(JSON.stringify(layout)).not.toContain('<script>');
  });

  it('borne chaque texte et chaque liste', () => {
    const layout = normalizeLayout({
      titre: 'mot '.repeat(100),
      sujets: Array.from({ length: 12 }, (_, i) => ({
        titre: `Sujet ${i}`,
        icone: 'cible',
        points: Array.from({ length: 9 }, () => 'point'),
      })),
      decisions: Array.from({ length: 20 }, (_, i) => `Décision ${i}`),
    });
    expect(layout.titre.length).toBeLessThanOrEqual(LAYOUT_LIMITS.titre);
    expect(layout.titre.endsWith('…')).toBe(true);
    expect(layout.sujets).toHaveLength(LAYOUT_LIMITS.sujets);
    expect(layout.sujets[0].points).toHaveLength(LAYOUT_LIMITS.points);
    expect(layout.decisions).toHaveLength(LAYOUT_LIMITS.decisions);
  });

  it('un pictogramme hors liste devient `point`, un gabarit inconnu la synthèse', () => {
    const layout = normalizeLayout({
      gabarit: 'poster',
      heros: { icone: 'licorne' },
      sujets: [{ titre: 'A', icone: 'licorne', points: ['x'] }],
    });
    expect(layout.gabarit).toBe('synthese');
    expect(layout.heros.icone).toBe('point');
    expect(layout.sujets[0].icone).toBe('point');
  });

  it('un gabarit sans sa matière retombe sur la synthèse', () => {
    expect(
      normalizeLayout({ gabarit: 'feuille_de_route', jalons: [{ libelle: 'A' }] }).gabarit,
    ).toBe('synthese');
    expect(
      normalizeLayout({
        gabarit: 'feuille_de_route',
        jalons: [{ libelle: 'A' }, { libelle: 'B' }, { libelle: 'C' }],
      }).gabarit,
    ).toBe('feuille_de_route');
    expect(
      normalizeLayout({ gabarit: 'tableau_de_bord', chiffres: [{ libelle: 'Ca', valeur: 3 }] })
        .gabarit,
    ).toBe('synthese');
    expect(normalizeLayout({ gabarit: 'bilan', bilan: { reussites: ['x'] } }).gabarit).toBe(
      'synthese',
    );
    expect(
      normalizeLayout({ gabarit: 'bilan', bilan: { reussites: ['x'], difficultes: ['y'] } })
        .gabarit,
    ).toBe('bilan');
  });

  it('un chiffre se lit même écrit en texte, et perd sa forme s’il lui manque une donnée', () => {
    const [a, b, c, d] = normalizeLayout({
      chiffres: [
        { libelle: 'Cadence', valeur: '1 650,5', cible: 2400, forme: 'progression' },
        { libelle: 'Rebut', valeur: 3.1, forme: 'objectif' },
        { libelle: 'Ventes', valeur: 12, forme: 'evolution' },
        { libelle: 'Part', valeur: 40, unite: '%', forme: 'part' },
        { libelle: 'Sans valeur', valeur: 'beaucoup' },
      ],
    }).chiffres;
    expect(a).toMatchObject({ valeur: 1650.5, cible: 2400, forme: 'progression' });
    expect(b.forme).toBe('valeur'); // objectif sans cible
    expect(c.forme).toBe('valeur'); // évolution sans valeur précédente
    expect(d.forme).toBe('part');
  });

  it('une seule option retenue au plus', () => {
    const { options } = normalizeLayout({
      options: [
        { titre: 'A', retenue: true },
        { titre: 'B', retenue: true },
        { titre: 'C', retenue: 'oui' },
      ],
    });
    expect(options.map((o) => o.retenue)).toEqual([true, false, false]);
  });

  it('une répartition à un seul élément n’est pas un graphique', () => {
    expect(
      normalizeLayout({ repartition: { titre: 'Budget', elements: [{ libelle: 'A', valeur: 1 }] } })
        .repartition,
    ).toBeNull();
  });

  it('les votes sont des entiers positifs bornés', () => {
    const { idees } = normalizeLayout({
      idees: [
        {
          theme: 'T',
          idees: [
            { texte: 'a', votes: 3.6 },
            { texte: 'b', votes: -2 },
            { texte: 'c', votes: 'x' },
          ],
        },
      ],
    });
    expect(idees[0].idees.map((i) => i.votes)).toEqual([4, 0, null]);
  });
});

describe('layoutActions — les actions de l’écran, pas celles du modèle', () => {
  it('les masquées ne sortent pas, le total compte les visibles', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ title: `Action ${i}` }));
    const { list, total } = layoutActions([...many, { title: 'Cachée', show: false }]);
    expect(total).toBe(11);
    expect(list).toHaveLength(LAYOUT_LIMITS.actions);
    expect(list.map((a) => a.texte)).not.toContain('Cachée');
  });

  it('lit les deux formes de champ (text/assignee et title/owner)', () => {
    const { list } = layoutActions([
      { text: 'Écrire', assignee: 'Lou', dueDate: '2026-12-01' },
      { title: 'Lire', owner: 'Max' },
    ]);
    expect(list).toEqual([
      { texte: 'Écrire', responsable: 'Lou', echeance: '2026-12-01' },
      { texte: 'Lire', responsable: 'Max', echeance: '' },
    ]);
  });
});
