import { describe, it, expect } from 'vitest';
import { ownerFilter } from '../lib/ownerScope.js';
import { buildTestApp, identityHeaders } from './helpers.js';
import { UpstreamError } from '../lib/openai.js';
import { TITLE_RULES } from '../lib/prompts.js';

const EMAIL = 'alex@myalfred.ai';

/**
 * /resume déclenche DEUX appels au modèle (le résumé, puis le titre en tâche de
 * fond) et les tests doivent les distinguer.
 *
 * On les sépare par leur RÔLE — le prompt système du titre — et non par le nom
 * du modèle : les deux usages tournent sur le même modèle depuis que le titre a
 * été aligné sur celui du résumé, et ce nom est désormais un simple réglage
 * (cf. lib/config.js). Un test qui s'appuierait dessus casserait au prochain
 * changement de modèle sans qu'aucun comportement n'ait bougé.
 */
const isTitleCall = (params) => params?.messages?.[0]?.content === TITLE_RULES;

function resumePayload(overrides = {}) {
  return {
    transcription: 'On a parlé du projet INITECH.',
    systemPrompt: 'Tu es un rédacteur de comptes-rendus.',
    template: 'standard',
    language: 'fr',
    actions: [{ id: 1, title: 'Relancer', owner: 'Alex' }],
    versionId: 'v1-uuid',
    meetingDuration: 300,
    meetingDurationFormatted: '00:05:00',
    meetingStartTime: '2026-08-04T09:00:00.000Z',
    meetingId: null,
    isEdit: false,
    ton: null,
    longueur: null,
    customPrompt: null,
    ...overrides,
  };
}

async function postJson(app, url, body, email = EMAIL) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(email, 'Aurélie Dupont'), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/resume — blocs à consigne fixe (appels isolés, assemblage serveur)', () => {
  it('un appel LLM par bloc, chaque slot remplacé par son fragment', async () => {
    const { app, ai } = buildTestApp({
      openai: {
        chat: (params) => {
          if (isTitleCall(params)) return '"Titre."';
          const sys = params.messages[0].content;
          if (sys.includes('20 mots')) return '<p>Court.</p>';
          if (sys.includes('points clés')) return '<ul><li>Point.</li></ul>';
          return '<h1>CR</h1>\n[[AI_SLOT_1]]\n[[AI_SLOT_2]]\n<p>Fin.</p>';
        },
      },
    });
    const res = await postJson(
      app,
      '/api/resume',
      resumePayload({
        blocks: [
          { marker: '[[AI_SLOT_1]]', systemPrompt: 'Résumé en 20 mots.' },
          { marker: '[[AI_SLOT_2]]', systemPrompt: 'Liste des points clés.' },
        ],
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resume).toBe('<h1>CR</h1>\n<p>Court.</p>\n<ul><li>Point.</li></ul>\n<p>Fin.</p>');
    // 3 appels résumé (principal + 2 blocs) + titre en tâche de fond
    const summaryCalls = ai.calls.filter((c) => !isTitleCall(c.params));
    expect(summaryCalls).toHaveLength(3);
    // chaque appel isolé reçoit la même transcription, étiquetée
    for (const c of summaryCalls) {
      expect(c.params.messages[1].content).toContain('#TRANSCRIPTION DE LA RÉUNION');
      expect(c.params.messages[1].content).toContain('On a parlé du projet INITECH.');
    }
    // Budget de sortie OPPOSÉ : développé pour le compte rendu, bref pour les
    // blocs à plafond de mots dur. Une inversion ici ferait exploser le « 20 mots ».
    const main = summaryCalls.find(
      (c) => c.params.messages[0].content === 'Tu es un rédacteur de comptes-rendus.',
    );
    expect(main.params.verbosity).toBe('high');
    for (const c of summaryCalls.filter((c) => c !== main)) {
      expect(c.params.verbosity).toBe('low');
    }
  });

  it('slot omis par le modèle principal : le fragment est ajouté en fin, jamais perdu', async () => {
    const { app } = buildTestApp({
      openai: {
        chat: (params) => {
          if (isTitleCall(params)) return '"Titre."';
          if (params.messages[0].content.includes('20 mots')) return '<p>Court.</p>';
          return '<h1>CR sans slot</h1>'; // le modèle a oublié le jeton
        },
      },
    });
    const res = await postJson(
      app,
      '/api/resume',
      resumePayload({ blocks: [{ marker: '[[AI_SLOT_1]]', systemPrompt: 'Résumé en 20 mots.' }] }),
    );
    expect(res.json().resume).toBe('<h1>CR sans slot</h1>\n<p>Court.</p>');
  });

  it("slot mangé mais ancre recopiée : le fragment s'insère après son titre de section", async () => {
    const { app } = buildTestApp({
      openai: {
        chat: (params) => {
          if (isTitleCall(params)) return '"Titre."';
          if (params.messages[0].content.includes('20 mots')) return '<p>Court.</p>';
          // le modèle a recopié le h2 mais écrit du contenu à la place du jeton
          return '<h1>CR</h1><h2>En bref</h2><p>Contenu parasite.</p>';
        },
      },
    });
    const res = await postJson(
      app,
      '/api/resume',
      resumePayload({
        blocks: [
          {
            marker: '[[AI_SLOT_1]]',
            systemPrompt: 'Résumé en 20 mots.',
            anchor: '<h2>En bref</h2>',
          },
        ],
      }),
    );
    expect(res.json().resume).toBe(
      '<h1>CR</h1><h2>En bref</h2>\n<p>Court.</p><p>Contenu parasite.</p>',
    );
  });

  it('blocs invalides ignorés : marqueur hors format = aucun appel supplémentaire', async () => {
    const { app, ai } = buildTestApp({
      openai: { chat: (params) => (isTitleCall(params) ? '"T."' : '<p>CR</p>') },
    });
    const res = await postJson(
      app,
      '/api/resume',
      resumePayload({
        blocks: [
          { marker: 'pas-un-marqueur', systemPrompt: 'x' },
          { marker: '[[AI_OK]]' }, // systemPrompt manquant
          'junk',
        ],
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(ai.calls.filter((c) => !isTitleCall(c.params))).toHaveLength(1);
  });
});

describe('/api/resume', () => {
  it('nouvelle réunion : répond {resume, meetingId, versionId} puis insère le doc complet avec V1', async () => {
    const { app, db, ai } = buildTestApp({
      openai: {
        chat: (params) => (isTitleCall(params) ? '"Projet INITECH."' : '<h1>CR</h1><p>Contenu.</p>'),
      },
    });
    const res = await postJson(app, '/api/resume', resumePayload());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resume).toBe('<h1>CR</h1><p>Contenu.</p>');
    expect(body.versionId).toBe('v1-uuid');
    expect(typeof body.meetingId).toBe('string'); // UUID généré côté serveur
    expect(body.meetingId.length).toBeGreaterThan(10);

    const summary = ai.calls.find((c) => !isTitleCall(c.params));
    expect(summary.params.messages[0]).toEqual({
      role: 'system',
      content: 'Tu es un rédacteur de comptes-rendus.',
    });
    // La transcription part ÉTIQUETÉE, pas nue (cf. routes/meetings.js).
    expect(summary.params.messages[1].content).toBe(
      '#TRANSCRIPTION DE LA RÉUNION (intégralité de ce qui a été dit — matière première du compte rendu)\n\nOn a parlé du projet INITECH.',
    );
    // Le compte rendu principal demande une sortie DÉVELOPPÉE : c'est le seul
    // levier d'API sur le volume, et son absence était la cause du « résumé
    // plus court que dans ChatGPT à prompt identique ».
    expect(summary.params.verbosity).toBe('high');
    expect(summary.params.reasoningEffort).toBe('medium');
    // Timeout élargi : un modèle raisonnant sur une réunion entière dépasse les
    // 120 s du défaut, et un timeout n'est pas relançable.
    expect(summary.params.timeoutMs).toBe(300_000);

    // L'insertion précède la réponse : un 200 garantit le doc en base.
    // Le titre part en repli et sera remplacé par la tâche de fond.
    const insert = db.calls.find((c) => c.op === 'insertOne' && c.collection === 'resume');
    expect(insert.doc.title).toBe('Réunion sans titre');
    expect(insert.doc.email).toBe(EMAIL);
    expect(insert.doc.name).toBe('Aurélie Dupont'); // en-tête latin1 re-décodé en UTF-8
    expect(insert.doc.meetingId).toBe(body.meetingId);
    expect(insert.doc.lastConnecion).toBeDefined();
    expect(insert.doc.versions).toHaveLength(1);
    expect(insert.doc.versions[0]).toMatchObject({
      id: 'v1-uuid',
      html: '<h1>CR</h1><p>Contenu.</p>',
      template: 'standard',
      ton: null,
    });

    // Drapeau d'attente : sans lui, le frontend s'arrête au premier /history —
    // il trouve la réunion, avec le titre de repli, et ne relit plus.
    expect(insert.doc.titlePending).toBe(true);

    // Titre généré en tâche de fond, sanitizé, posé par updateOne.
    await app.background.drain();
    const titleUpdate = db.calls.find(
      (c) => c.op === 'updateOne' && c.collection === 'resume' && c.update.$set?.title,
    );
    expect(titleUpdate.update.$set.title).toBe('Projet INITECH'); // guillemets + point retirés
    expect(titleUpdate.update.$unset).toEqual({ titlePending: '' }); // même écriture : pas de fenêtre
    expect(titleUpdate.filter).toEqual(ownerFilter(EMAIL, { meetingId: body.meetingId }));
  });

  it('titre plafonné à 5 mots avant écriture', async () => {
    const { app, db } = buildTestApp({
      openai: {
        chat: (params) =>
          isTitleCall(params)
            ? 'Point sur la migration INITECH et le planning de recette'
            : '<p>CR</p>',
      },
    });
    await postJson(app, '/api/resume', resumePayload());
    await app.background.drain();
    const titleUpdate = db.calls.find((c) => c.op === 'updateOne' && c.update.$set?.title);
    expect(titleUpdate.update.$set.title).toBe('Point sur la migration INITECH');
  });

  it('génère le titre sur un modèle largement disponible, sans raisonnement', async () => {
    // Le titre était ALIGNÉ sur le modèle du résumé, pour qu'il ne tourne pas
    // sur un modèle inaccessible au compte OpenAI : il échouait alors en tâche
    // de fond — donc en silence — et la réunion restait « Réunion sans titre »
    // alors que le résumé, lui, s'affichait.
    // Depuis le passage du résumé sur gpt-5, l'alignement se retourne contre
    // cet objectif : c'est le résumé qui porte désormais le risque d'accès (et
    // il l'affiche, lui). Le titre a donc son propre petit modèle, et une
    // sortie de 5 mots ne gagne rien à un modèle raisonnant. L'invariant testé
    // est celui-là, pas l'égalité. Depuis le retrait de gpt-4o-mini par OpenAI
    // (2027-01-14), c'est gpt-6-luna — qui raisonne en « medium » si on ne lui
    // dit rien : « sans raisonnement » se DEMANDE désormais.
    const { app, ai } = buildTestApp({
      openai: { chat: (params) => (isTitleCall(params) ? 'Titre' : '<p>CR</p>') },
    });
    await postJson(app, '/api/resume', resumePayload());
    await app.background.drain();

    const chats = ai.calls.filter((c) => c.method === 'chat');
    expect(chats).toHaveLength(2);
    const title = chats.find((c) => isTitleCall(c.params));
    expect(title.params.model).toBe('gpt-6-luna');
    expect(title.params.verbosity).toBeUndefined();
    expect(title.params.reasoningEffort).toBe('none');
  });

  it('le modèle du titre se règle sans toucher au code', async () => {
    const { app, ai } = buildTestApp({
      config: {
        openai: { models: { summary: 'modele-resume', title: 'modele-titre', actions: 'x' } },
      },
      openai: { chat: (params) => (isTitleCall(params) ? 'Titre' : '<p>CR</p>') },
    });
    await postJson(app, '/api/resume', resumePayload());
    await app.background.drain();

    const chats = ai.calls.filter((c) => c.method === 'chat');
    expect(chats.find((c) => !isTitleCall(c.params)).params.model).toBe('modele-resume');
    expect(chats.find((c) => isTitleCall(c.params)).params.model).toBe('modele-titre');
  });

  it('réunion déjà en base : update scopé {meetingId, email}, versions non touchées', async () => {
    const { app, db } = buildTestApp({
      openai: { chat: (params) => (isTitleCall(params) ? 'Titre régénéré' : '<p>V2</p>') },
      seed: {
        resume: [
          {
            email: EMAIL,
            meetingId: 'm-42',
            title: 'Ancien titre',
            resume: '<p>V1</p>',
            transcription: 'Transcription corrigée à la main.',
            versions: [{ id: 'v1-uuid', html: '<p>V1</p>' }],
          },
        ],
      },
    });
    const res = await postJson(
      app,
      '/api/resume',
      resumePayload({ meetingId: 'm-42', isEdit: true, versionId: 'v2-uuid' }),
    );
    expect(res.json().meetingId).toBe('m-42');

    // Persistance avant réponse : contenu écrasé, titre existant PAS touché ici.
    const update = db.calls.find((c) => c.op === 'updateOne' && c.collection === 'resume');
    expect(update.filter).toEqual(ownerFilter(EMAIL, { meetingId: 'm-42' }));
    expect(update.update.$set.resume).toBe('<p>V2</p>');
    expect(update.update.$set.title).toBeUndefined(); // le fond régénère le titre
    expect(update.update.$set.titlePending).toBe(true); // …et le frontend l'attend
    expect(update.update.$set.versions).toBeUndefined(); // le frontend pousse via /versions/add
    // Régénération : la transcription N'EST PAS réécrite — elle a pu être
    // corrigée à la main, et le client renvoie une version reconstruite.
    expect(update.update.$set.transcription).toBeUndefined();
    expect(db.calls.find((c) => c.op === 'insertOne')).toBeUndefined();

    await app.background.drain();
    const titleUpdate = db.calls.find((c) => c.op === 'updateOne' && c.update.$set?.title);
    expect(titleUpdate.update.$set.title).toBe('Titre régénéré');
  });

  it('persiste les notes de réunion — insertion ET régénération, jamais un non-string', async () => {
    // Le frontend relit `notes` à l'ouverture depuis l'historique
    // (selectHistoryItem) : la première génération doit l'écrire, la
    // régénération suivre l'état courant du panneau, et un client qui n'envoie
    // rien (ou n'importe quoi) doit laisser un '' propre, pas un undefined.
    const { app, db } = buildTestApp({
      openai: { chat: () => '<p>CR</p>' },
      seed: { resume: [{ email: EMAIL, meetingId: 'm-42', versions: [{ id: 'v1' }] }] },
    });
    await postJson(app, '/api/resume', resumePayload({ notes: 'Client Fabrikam, sigle SDIS' }));
    const insert = db.calls.find((c) => c.op === 'insertOne' && c.collection === 'resume');
    expect(insert.doc.notes).toBe('Client Fabrikam, sigle SDIS');

    await postJson(
      app,
      '/api/resume',
      resumePayload({ meetingId: 'm-42', isEdit: true, notes: 'Notes corrigées' }),
    );
    // Cibler l'écriture d'ÉDITION ($set.resume) : la tâche de fond du titre de
    // la première génération produit elle aussi des updateOne sur `resume`.
    const update = db.calls.find((c) => c.op === 'updateOne' && c.update?.$set?.resume);
    expect(update.update.$set.notes).toBe('Notes corrigées');

    await postJson(app, '/api/resume', resumePayload({ notes: { pas: 'une chaîne' } }));
    const inserts = db.calls.filter((c) => c.op === 'insertOne' && c.collection === 'resume');
    expect(inserts[1].doc.notes).toBe('');
  });

  it('persiste les mesures d’usage : durée, heure de début, volume transcrit', async () => {
    // Le frontend envoyait déjà ces champs, mais ils ne servaient qu'au prompt :
    // l'écran Statistiques d'administration n'avait aucune durée à agréger.
    const { app, db } = buildTestApp({ openai: { chat: () => '<p>CR</p>' } });
    await postJson(app, '/api/resume', resumePayload());
    const insert = db.calls.find((c) => c.op === 'insertOne' && c.collection === 'resume');
    expect(insert.doc.meetingDuration).toBe(300);
    expect(insert.doc.meetingStartTime).toBe('2026-08-04T09:00:00.000Z');
    expect(insert.doc.transcriptionChars).toBe('On a parlé du projet INITECH.'.length);
  });

  it('durée aberrante ou nulle → `null`, jamais 0 (une durée inconnue n’est pas une réunion vide)', async () => {
    const { app, db } = buildTestApp({ openai: { chat: () => '<p>CR</p>' } });
    await postJson(app, '/api/resume', resumePayload({ meetingDuration: 0 }));
    await postJson(app, '/api/resume', resumePayload({ meetingDuration: 500000 }));
    const inserts = db.calls.filter((c) => c.op === 'insertOne' && c.collection === 'resume');
    expect(inserts.map((c) => c.doc.meetingDuration)).toEqual([null, null]);
  });

  it('chronomètre à zéro : la durée est relue dans le compte-rendu généré', async () => {
    // Les gabarits impriment « Durée : HH:MM:SS ». C'est ce repli qui a permis
    // de récupérer la durée des réunions antérieures à sa persistance.
    const { app, db } = buildTestApp({
      openai: { chat: () => '<p><em>Auteur : Alex — Durée : 00:42:10</em></p>' },
    });
    await postJson(app, '/api/resume', resumePayload({ meetingDuration: 0 }));
    const insert = db.calls.find((c) => c.op === 'insertOne' && c.collection === 'resume');
    expect(insert.doc.meetingDuration).toBe(2530);
    expect(insert.doc.meetingDurationSource).toBe('resume');
  });

  it('le chronomètre prime sur le compte-rendu', async () => {
    const { app, db } = buildTestApp({
      openai: { chat: () => '<p>Durée : 09:09:09</p>' },
    });
    await postJson(app, '/api/resume', resumePayload({ meetingDuration: 300 }));
    const insert = db.calls.find((c) => c.op === 'insertOne' && c.collection === 'resume');
    expect(insert.doc.meetingDuration).toBe(300);
    expect(insert.doc.meetingDurationSource).toBe('timer');
  });

  it('régénération sans chronomètre : la durée déjà enregistrée n’est pas écrasée', async () => {
    // Une réunion rouverte depuis l'historique a un chronomètre à zéro. Écrire
    // `meetingDuration: 0` effacerait la durée mesurée le jour de la réunion.
    const { app, db } = buildTestApp({ openai: { chat: () => '<p>V2</p>' } });
    await postJson(
      app,
      '/api/resume',
      resumePayload({ meetingId: 'm-42', isEdit: true, meetingDuration: 0 }),
    );
    const update = db.calls.find((c) => c.op === 'updateOne' && c.collection === 'resume');
    expect(update.update.$set).not.toHaveProperty('meetingDuration');
  });

  it('titre en échec → persiste quand même avec le titre de repli', async () => {
    const { app, db } = buildTestApp({
      openai: {
        chat: (params) => {
          if (!isTitleCall(params)) return '<p>CR</p>';
          throw new UpstreamError(500, 'boom');
        },
      },
    });
    const res = await postJson(app, '/api/resume', resumePayload());
    expect(res.statusCode).toBe(200);
    await app.background.drain();
    const insert = db.calls.find((c) => c.op === 'insertOne');
    expect(insert.doc.title).toBe('Réunion sans titre');
    // Titre en échec : aucun updateOne de titre, le repli reste.
    expect(db.calls.find((c) => c.op === 'updateOne' && c.update.$set?.title)).toBeUndefined();
    // Mais le drapeau tombe quand même, sinon le frontend sonde /history
    // jusqu'au bout de ses tentatives pour un titre qui n'arrivera jamais.
    expect(
      db.calls.find((c) => c.op === 'updateOne' && c.update.$unset?.titlePending === ''),
    ).toBeDefined();
  });

  it('titre non exploitable (repli littéral rendu par le modèle) → drapeau levé', async () => {
    const { app, db } = buildTestApp({
      openai: {
        chat: (params) => (isTitleCall(params) ? 'Réunion sans titre' : '<p>CR</p>'),
      },
    });
    await postJson(app, '/api/resume', resumePayload());
    await app.background.drain();
    expect(db.calls.find((c) => c.op === 'updateOne' && c.update.$set?.title)).toBeUndefined();
    expect(
      db.calls.find((c) => c.op === 'updateOne' && c.update.$unset?.titlePending === ''),
    ).toBeDefined();
  });

  it('échec OpenAI sur le résumé → statut amont relayé, rien persisté', async () => {
    const { app, db } = buildTestApp({
      openai: {
        chat: () => {
          throw new UpstreamError(429, '{"error":{"message":"quota"}}');
        },
      },
    });
    const res = await postJson(app, '/api/resume', resumePayload());
    expect(res.statusCode).toBe(429);
    await app.background.drain();
    expect(db.calls.find((c) => c.op === 'insertOne')).toBeUndefined();
  });

  it('échec Mongo à la persistance → 500 {error:persist_failed}, pas de 200 mensonger', async () => {
    const { app, db } = buildTestApp({
      openai: { chat: () => '<p>CR</p>' },
    });
    db.failNext('insertOne', new Error('mongo down'));
    const res = await postJson(app, '/api/resume', resumePayload());
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'persist_failed' });
  });

  it('deux /resume concurrents : les deux docs insérés, drain attend les deux titres', async () => {
    let titleCalls = 0;
    const { app, db } = buildTestApp({
      openai: {
        chat: (params) => {
          if (!isTitleCall(params)) return '<p>CR</p>';
          titleCalls += 1;
          return `Titre ${titleCalls}`;
        },
      },
    });
    const [r1, r2] = await Promise.all([
      postJson(app, '/api/resume', resumePayload()),
      postJson(app, '/api/resume', resumePayload()),
    ]);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(db.calls.filter((c) => c.op === 'insertOne')).toHaveLength(2);

    // L'ancien slot unique `background.last` n'aurait attendu qu'UN titre.
    await app.background.drain();
    const titleUpdates = db.calls.filter((c) => c.op === 'updateOne' && c.update.$set?.title);
    expect(titleUpdates).toHaveLength(2);
  });
});

describe('/api/history', () => {
  it('filtre par email du header, retire _id, calcule title/date/weekLabel', async () => {
    const now = new Date();
    const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
    const { app } = buildTestApp({
      seed: {
        resume: [
          {
            _id: 'x1',
            email: EMAIL,
            meetingId: 'm1',
            title: 'Titre réel',
            lastConnecion: daysAgo(1),
            now: daysAgo(1),
          },
          {
            _id: 'x2',
            email: EMAIL,
            meetingId: 'm2',
            title: '',
            name: 'alex',
            lastConnecion: daysAgo(10),
            now: daysAgo(10),
          },
          {
            _id: 'x3',
            email: 'autre@ailleurs.fr',
            meetingId: 'm3',
            title: 'Pas à moi',
            now: daysAgo(2),
          },
        ],
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: identityHeaders(EMAIL),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json();
    expect(items).toHaveLength(2); // la réunion d'un autre compte n'apparaît pas
    expect(items.every((i) => i._id === undefined)).toBe(true);

    const withTitle = items.find((i) => i.meetingId === 'm1');
    expect(withTitle.title).toBe('Titre réel');
    expect(withTitle.weekLabel).toBe('Cette semaine');
    expect(withTitle.date).toMatch(/^\d{2}\/\d{2}$/);
    expect(withTitle.now).toBeDefined(); // ne PAS reproduire l'écrasement n8n de `now`

    const untitled = items.find((i) => i.meetingId === 'm2');
    // Aucun titre fabriqué ici : le repli daté (« Réunion JJ-MM-AAAA HH:MM »)
    // dépend du fuseau et de la langue du LECTEUR — il est composé par
    // src/utils/historyTitle.js. Ce qui compte côté serveur : ne JAMAIS
    // replier sur `name`, qui est le nom du compte.
    expect(untitled.title).toBe('');
    expect(untitled.title).not.toBe('alex');
    expect(untitled.weekLabel).toBe('Semaine dernière');
  });

  it('remonte le tagId — la sidebar n’a pas de second appel à faire pour l’afficher', async () => {
    const { app } = buildTestApp({
      seed: {
        resume: [
          { email: EMAIL, meetingId: 'm1', tagId: 't-1', now: new Date().toISOString() },
          { email: EMAIL, meetingId: 'm2', now: new Date().toISOString() },
        ],
      },
    });
    const items = (
      await app.inject({ method: 'GET', url: '/api/history', headers: identityHeaders(EMAIL) })
    ).json();
    expect(items.find((i) => i.meetingId === 'm1').tagId).toBe('t-1');
    expect(items.find((i) => i.meetingId === 'm2').tagId).toBeUndefined();
  });
});

/**
 * Rangement d'une conversation. Le contrôle qui compte : le tag visé doit
 * appartenir au demandeur — ces tags porteront des règles d'envoi, une
 * référence croisée deviendrait un routage vers la mauvaise destination.
 */
describe('/api/history/start — la réunion existe dès le premier mot', () => {
  it('crée un BROUILLON : sans titre, sans résumé, sans version', async () => {
    // Le pourquoi : avant, un document ne naissait qu'à la première génération
    // de compte-rendu. Une réunion en cours — ou arrêtée sans résumé —
    // n'existait nulle part, et fermer l'onglet effaçait tout ce qui avait été
    // dit. L'absence de titre est INTENTIONNELLE : c'est elle qui fait afficher
    // « Réunion JJ-MM-AAAA HH:MM » côté client.
    const { app, db } = buildTestApp();
    const res = await postJson(app, '/api/history/start', {
      meetingId: 'live-1',
      startedAt: '2026-08-24T09:30:00.000Z',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, meetingId: 'live-1' });

    const doc = await db.collection('resume').findOne({ meetingId: 'live-1' });
    expect(doc.title).toBeUndefined();
    expect(doc.resume).toBe('');
    expect(doc.transcription).toBe('');
    expect(doc.versions).toEqual([]);
    expect(doc.status).toBe('recording');
    expect(doc.email).toBe(EMAIL);
    // `lastConnecion` (faute héritée de n8n) porte la date AFFICHÉE : c'est
    // elle qui date la ligne et décide de son groupe dans la sidebar.
    expect(doc.lastConnecion).toBe('2026-08-24T09:30:00.000Z');
    expect(doc.meetingStartTime).toBe('2026-08-24T09:30:00.000Z');
  });

  it('rejouable sans rien écraser — retry réseau, double clic, reprise', async () => {
    const { app, db } = buildTestApp({
      seed: {
        resume: [
          {
            email: EMAIL,
            meetingId: 'live-1',
            title: 'Titre déjà généré',
            transcription: 'Trois phrases déjà dites.',
            status: 'recording',
          },
        ],
      },
    });
    await postJson(app, '/api/history/start', { meetingId: 'live-1' });
    const docs = await db.collection('resume').find({ meetingId: 'live-1' }).toArray();
    expect(docs).toHaveLength(1); // pas de second document
    expect(docs[0].title).toBe('Titre déjà généré');
    expect(docs[0].transcription).toBe('Trois phrases déjà dites.');
  });

  it("horodatage illisible : l'heure serveur, jamais une date invalide en base", async () => {
    const { app, db } = buildTestApp();
    await postJson(app, '/api/history/start', { meetingId: 'live-1', startedAt: 'pas une date' });
    const doc = await db.collection('resume').findOne({ meetingId: 'live-1' });
    expect(Number.isNaN(new Date(doc.lastConnecion).getTime())).toBe(false);
  });

  it("ne touche pas au document d'un autre compte portant le même meetingId", async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ email: 'autre@ailleurs.fr', meetingId: 'live-1', title: 'Pas à moi' }] },
    });
    await postJson(app, '/api/history/start', { meetingId: 'live-1' });
    const docs = await db.collection('resume').find({ meetingId: 'live-1' }).toArray();
    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.email === 'autre@ailleurs.fr').title).toBe('Pas à moi');
  });
});

describe('/api/history/stop', () => {
  it('inscrit la durée mesurée et sort de l’état « recording »', async () => {
    // Jusqu'ici la durée n'était enregistrée qu'à la génération d'un résumé :
    // une réunion jamais résumée n'en avait aucune, et les statistiques
    // d'administration ne pouvaient rien en dire.
    const { app, db } = buildTestApp({
      seed: {
        resume: [
          { email: EMAIL, meetingId: 'live-1', status: 'recording', transcription: 'Bonjour.' },
        ],
      },
    });
    const res = await postJson(app, '/api/history/stop', { meetingId: 'live-1', duration: 930 });
    expect(res.json()).toEqual({ ok: true, discarded: false });

    const doc = await db.collection('resume').findOne({ meetingId: 'live-1' });
    expect(doc.status).toBe('ended');
    expect(doc.meetingDuration).toBe(930);
    expect(doc.meetingDurationSource).toBe('timer');
  });

  it('durée inconnue : n’écrase pas celle déjà inscrite', async () => {
    const { app, db } = buildTestApp({
      seed: {
        resume: [
          { email: EMAIL, meetingId: 'live-1', transcription: 'Bonjour.', meetingDuration: 600 },
        ],
      },
    });
    await postJson(app, '/api/history/stop', { meetingId: 'live-1', duration: 0 });
    const doc = await db.collection('resume').findOne({ meetingId: 'live-1' });
    expect(doc.meetingDuration).toBe(600);
  });

  it('discardIfEmpty : purge la réunion où rien n’a été dit', async () => {
    // Enregistrement lancé par erreur : la ligne « Réunion … » vide ne doit pas
    // s'accumuler dans l'historique. Purge côté SERVEUR — un onglet fermé
    // juste après l'arrêt abandonnerait sinon le déchet en base.
    const { app, db } = buildTestApp({
      seed: {
        resume: [
          { email: EMAIL, meetingId: 'live-1', transcription: '   ', resume: '', versions: [] },
        ],
      },
    });
    const res = await postJson(app, '/api/history/stop', {
      meetingId: 'live-1',
      discardIfEmpty: true,
    });
    expect(res.json()).toEqual({ ok: true, discarded: true });
    expect(await db.collection('resume').findOne({ meetingId: 'live-1' })).toBeNull();
  });

  it('discardIfEmpty ne purge JAMAIS une réunion qui porte quelque chose', async () => {
    const { app, db } = buildTestApp({
      seed: {
        resume: [
          { email: EMAIL, meetingId: 'avec-texte', transcription: 'Une phrase.' },
          { email: EMAIL, meetingId: 'avec-resume', transcription: '', resume: '<p>CR</p>' },
          { email: EMAIL, meetingId: 'avec-version', transcription: '', versions: [{ id: 'v1' }] },
        ],
      },
    });
    for (const meetingId of ['avec-texte', 'avec-resume', 'avec-version']) {
      const res = await postJson(app, '/api/history/stop', { meetingId, discardIfEmpty: true });
      expect(res.json().discarded).toBe(false);
      expect(await db.collection('resume').findOne({ meetingId })).not.toBeNull();
    }
  });

  it('404 sur une réunion inconnue ou appartenant à un autre compte', async () => {
    const { app } = buildTestApp({
      seed: { resume: [{ email: 'autre@ailleurs.fr', meetingId: 'live-1' }] },
    });
    const res = await postJson(app, '/api/history/stop', { meetingId: 'live-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('meeting_not_found');
  });
});

/**
 * « Enregistrer » à la fin d'une réunion : la nommer par IA SANS compte rendu.
 * Jusqu'ici le titre n'était généré qu'avec le résumé — une réunion arrêtée
 * sans résumé restait « Réunion JJ-MM-AAAA HH:MM » dans l'historique.
 */
describe('/api/history/title — nommer une réunion sans compte rendu', () => {
  it('pose titlePending AVANT de répondre, puis écrit le titre tiré de la transcription', async () => {
    const { app, db, ai } = buildTestApp({
      openai: { chat: () => '"Budget 2026 Globex."' },
      seed: {
        resume: [
          {
            email: EMAIL,
            meetingId: 'live-1',
            status: 'ended',
            resume: '',
            versions: [],
            transcription: 'On a revu le budget 2026 de Globex.',
          },
        ],
      },
    });
    const res = await postJson(app, '/api/history/title', { meetingId: 'live-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, meetingId: 'live-1', titlePending: true });

    // Le drapeau est en base dès la réponse : le premier /history du client le
    // voit et relit jusqu'à sa chute (stores/history.js).
    const pending = db.calls.find(
      (c) => c.op === 'updateOne' && c.update.$set?.titlePending === true,
    );
    expect(pending.filter).toEqual(ownerFilter(EMAIL, { meetingId: 'live-1' }));

    await app.background.drain();
    const call = ai.calls.find((c) => isTitleCall(c.params));
    // Résumé vide, transcription fournie : c'est elle que le prompt lit.
    expect(call.params.messages[1].content).toContain('On a revu le budget 2026 de Globex.');
    const doc = await db.collection('resume').findOne({ meetingId: 'live-1' });
    expect(doc.title).toBe('Budget 2026 Globex');
    expect(doc.titlePending).toBeUndefined();
  });

  it("n'écrase JAMAIS un titre déjà là — renommé à la main ou déjà généré", async () => {
    const { app, db, ai } = buildTestApp({
      openai: { chat: () => 'Autre titre' },
      seed: {
        resume: [
          { email: EMAIL, meetingId: 'live-1', title: 'Mon titre', transcription: 'Bonjour.' },
        ],
      },
    });
    const res = await postJson(app, '/api/history/title', { meetingId: 'live-1' });
    expect(res.json()).toEqual({ ok: true, meetingId: 'live-1', titlePending: false });
    await app.background.drain();
    expect(ai.calls).toHaveLength(0);
    expect((await db.collection('resume').findOne({ meetingId: 'live-1' })).title).toBe(
      'Mon titre',
    );
  });

  it('retente sur le repli littéral du serveur (génération passée en échec)', async () => {
    const { app, db } = buildTestApp({
      openai: { chat: () => 'Point produit' },
      seed: {
        resume: [
          {
            email: EMAIL,
            meetingId: 'live-1',
            title: 'Réunion sans titre',
            transcription: 'On a parlé du produit.',
          },
        ],
      },
    });
    const res = await postJson(app, '/api/history/title', { meetingId: 'live-1' });
    expect(res.json().titlePending).toBe(true);
    await app.background.drain();
    expect((await db.collection('resume').findOne({ meetingId: 'live-1' })).title).toBe(
      'Point produit',
    );
  });

  it('sans matière (rien de transcrit ni de rédigé) : aucun appel modèle', async () => {
    const { app, ai } = buildTestApp({
      seed: { resume: [{ email: EMAIL, meetingId: 'live-1', transcription: '  ', resume: '' }] },
    });
    const res = await postJson(app, '/api/history/title', { meetingId: 'live-1' });
    expect(res.json()).toEqual({ ok: true, meetingId: 'live-1', titlePending: false });
    await app.background.drain();
    expect(ai.calls).toHaveLength(0);
  });

  it('modèle en échec : le drapeau tombe quand même, la réunion garde son libellé daté', async () => {
    const { app, db } = buildTestApp({
      openai: {
        chat: () => {
          throw new UpstreamError(500, 'boom');
        },
      },
      seed: { resume: [{ email: EMAIL, meetingId: 'live-1', transcription: 'Bonjour.' }] },
    });
    const res = await postJson(app, '/api/history/title', { meetingId: 'live-1' });
    expect(res.statusCode).toBe(200);
    await app.background.drain();
    const doc = await db.collection('resume').findOne({ meetingId: 'live-1' });
    expect(doc.title).toBeUndefined();
    expect(doc.titlePending).toBeUndefined();
  });

  it("404 sur une réunion inconnue ou d'un autre compte — rien d'écrit chez le voisin", async () => {
    const { app, db, ai } = buildTestApp({
      openai: { chat: () => 'Pas à moi' },
      seed: {
        resume: [{ email: 'autre@ailleurs.fr', meetingId: 'live-1', transcription: 'Secret.' }],
      },
    });
    const res = await postJson(app, '/api/history/title', { meetingId: 'live-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('meeting_not_found');
    await app.background.drain();
    expect(ai.calls).toHaveLength(0);
    expect((await db.collection('resume').findOne({ meetingId: 'live-1' })).title).toBeUndefined();
  });

  it('400 sans meetingId', async () => {
    const { app } = buildTestApp();
    const res = await postJson(app, '/api/history/title', {});
    expect(res.statusCode).toBe(400);
  });
});

/**
 * Notes et actions hors compte rendu. Avant, elles n'atteignaient la base que
 * par /resume : une réunion terminée par « Enregistrer » se rouvrait sans
 * elles, et une modification faite sur une réunion rouverte se perdait faute
 * de régénérer un résumé.
 */
describe('notes et actions — écrites sans compte rendu', () => {
  const card = (over = {}) => ({
    id: 1,
    title: 'Envoyer le devis',
    owner: 'Marie',
    dueDate: '2026-09-18',
    description: '',
    newBadge: 'AI',
    show: true,
    ...over,
  });
  const blankCard = card({ title: '', owner: '', dueDate: '', newBadge: 'Manual' });

  it('/history/stop les écrit dans la même opération que la clôture', async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ email: EMAIL, meetingId: 'live-1', transcription: 'Bonjour.' }] },
    });
    const res = await postJson(app, '/api/history/stop', {
      meetingId: 'live-1',
      duration: 600,
      notes: 'Budget 2027 validé : 480 k€',
      actions: [card(), card({ id: 2, title: 'Écrire au notaire', show: false })],
    });
    expect(res.json()).toEqual({ ok: true, discarded: false });

    const writes = db.calls.filter((c) => c.op === 'updateOne');
    expect(writes).toHaveLength(1);
    expect(writes[0].filter).toEqual(ownerFilter(EMAIL, { meetingId: 'live-1' }));
    const doc = await db.collection('resume').findOne({ meetingId: 'live-1' });
    expect(doc.status).toBe('ended');
    expect(doc.notes).toBe('Budget 2027 validé : 480 k€');
    // L'action masquée reste en base : elle se rétablit, et la détection ne la
    // repropose pas.
    expect(doc.actions.map((a) => [a.id, a.show])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it('/history/stop accepte de longues notes : un plafond refuserait la clôture de la réunion', async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ email: EMAIL, meetingId: 'live-1', transcription: 'Bonjour.' }] },
    });
    const notes = 'Compte rendu collé dans les notes. '.repeat(10000); // ~350 000 caractères
    const res = await postJson(app, '/api/history/stop', {
      meetingId: 'live-1',
      notes,
      actions: [card({ description: 'x'.repeat(50000) })],
    });
    expect(res.statusCode).toBe(200);
    const doc = await db.collection('resume').findOne({ meetingId: 'live-1' });
    expect(doc.status).toBe('ended');
    expect(doc.notes).toHaveLength(notes.length);
  });

  it('/history/stop sans notes ni actions : celles déjà en base restent', async () => {
    const { app, db } = buildTestApp({
      seed: {
        resume: [
          {
            email: EMAIL,
            meetingId: 'live-1',
            transcription: 'Bonjour.',
            notes: 'Déjà là',
            actions: [card()],
          },
        ],
      },
    });
    await postJson(app, '/api/history/stop', { meetingId: 'live-1', duration: 60 });
    const doc = await db.collection('resume').findOne({ meetingId: 'live-1' });
    expect(doc.notes).toBe('Déjà là');
    expect(doc.actions).toHaveLength(1);
  });

  it('discardIfEmpty ne purge pas une réunion qui porte des notes ou une action écrite', async () => {
    // Micro coupé, rien de transcrit, mais une demi-heure de notes : purger la
    // réunion effacerait ce que l'utilisateur a tapé.
    const { app, db } = buildTestApp({
      seed: {
        resume: [
          { email: EMAIL, meetingId: 'avec-notes', transcription: '', versions: [] },
          { email: EMAIL, meetingId: 'avec-action', transcription: '', versions: [] },
          {
            email: EMAIL,
            meetingId: 'notes-en-base',
            transcription: '',
            versions: [],
            notes: 'Écrites avant l’arrêt',
          },
        ],
      },
    });
    const bodies = {
      'avec-notes': { notes: 'Budget validé' },
      'avec-action': { actions: [card()] },
      'notes-en-base': {},
    };
    for (const [meetingId, extra] of Object.entries(bodies)) {
      const res = await postJson(app, '/api/history/stop', {
        meetingId,
        discardIfEmpty: true,
        ...extra,
      });
      expect(res.json().discarded, meetingId).toBe(false);
      expect(await db.collection('resume').findOne({ meetingId })).not.toBeNull();
    }
  });

  it('discardIfEmpty purge toujours la réunion vide — une carte laissée vierge ne compte pas', async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ email: EMAIL, meetingId: 'live-1', transcription: '  ', versions: [] }] },
    });
    const res = await postJson(app, '/api/history/stop', {
      meetingId: 'live-1',
      discardIfEmpty: true,
      notes: '   ',
      actions: [blankCard],
    });
    expect(res.json()).toEqual({ ok: true, discarded: true });
    expect(await db.collection('resume').findOne({ meetingId: 'live-1' })).toBeNull();
  });

  it('/history/title les écrit au rangement, même quand aucun titre n’est à générer', async () => {
    const { app, db, ai } = buildTestApp({
      seed: {
        resume: [{ email: EMAIL, meetingId: 'live-1', title: 'Mon titre', transcription: 'Oui.' }],
      },
    });
    const res = await postJson(app, '/api/history/title', {
      meetingId: 'live-1',
      notes: 'Rappeler Fabrikam',
      actions: [card()],
    });
    expect(res.json()).toEqual({ ok: true, meetingId: 'live-1', titlePending: false });
    await app.background.drain();
    expect(ai.calls).toHaveLength(0);
    const doc = await db.collection('resume').findOne({ meetingId: 'live-1' });
    expect(doc.notes).toBe('Rappeler Fabrikam');
    expect(doc.actions).toEqual([card()]);
    expect(doc.title).toBe('Mon titre');
  });

  it('/history/title : 404 sur la réunion d’un autre compte, rien d’écrit chez le voisin', async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ email: 'autre@ailleurs.fr', meetingId: 'live-1', notes: 'À lui' }] },
    });
    const res = await postJson(app, '/api/history/title', { meetingId: 'live-1', notes: 'Moi' });
    expect(res.statusCode).toBe(404);
    expect((await db.collection('resume').findOne({ meetingId: 'live-1' })).notes).toBe('À lui');
  });

  it('/history/notes-actions écrit, scopé {meetingId, propriétaire}, sans upsert', async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ email: EMAIL, meetingId: 'm-1', notes: '', actions: [] }] },
    });
    const res = await postJson(app, '/api/history/notes-actions', {
      meetingId: 'm-1',
      notes: 'SAL : système d’aide pour les lentilles',
      actions: [card(), card({ id: 2, show: false })],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const write = db.calls.find((c) => c.op === 'updateOne');
    expect(write.filter).toEqual(ownerFilter(EMAIL, { meetingId: 'm-1' }));
    expect(write.options.upsert).toBeUndefined();
    const doc = await db.collection('resume').findOne({ meetingId: 'm-1' });
    expect(doc.notes).toBe('SAL : système d’aide pour les lentilles');
    expect(doc.actions[1].show).toBe(false);
  });

  it('/history/notes-actions : un champ absent n’est pas touché', async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ email: EMAIL, meetingId: 'm-1', notes: 'Gardées', actions: [] }] },
    });
    await postJson(app, '/api/history/notes-actions', { meetingId: 'm-1', actions: [card()] });
    const doc = await db.collection('resume').findOne({ meetingId: 'm-1' });
    expect(doc.notes).toBe('Gardées');
    expect(doc.actions).toEqual([card()]);
  });

  it('/history/notes-actions retire ce qui n’est pas une donnée d’action (animation, reliquat)', async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ email: EMAIL, meetingId: 'm-1' }] },
    });
    await postJson(app, '/api/history/notes-actions', {
      meetingId: 'm-1',
      actions: [card({ flash: 'new', flashAt: 12, updatedFields: ['owner'] })],
    });
    const doc = await db.collection('resume').findOne({ meetingId: 'm-1' });
    expect(doc.actions).toEqual([card()]);
  });

  it('/history/notes-actions : 404 sur la réunion d’un autre compte — rien créé, rien touché', async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ email: 'autre@ailleurs.fr', meetingId: 'm-1', notes: 'À lui' }] },
    });
    const res = await postJson(app, '/api/history/notes-actions', {
      meetingId: 'm-1',
      notes: 'Moi',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('meeting_not_found');
    const docs = await db.collection('resume').find({ meetingId: 'm-1' }).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0].notes).toBe('À lui');
  });

  it('/history/notes-actions : 400 sans rien à écrire, sans meetingId, ou sur une forme invalide', async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ email: EMAIL, meetingId: 'm-1' }] },
    });
    for (const body of [
      { meetingId: 'm-1' },
      { notes: 'Sans réunion' },
      { meetingId: 'm-1', actions: ['pas une action'] },
      { meetingId: 'm-1', notes: { pas: 'une chaîne' } },
    ]) {
      const res = await postJson(app, '/api/history/notes-actions', body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(db.calls.filter((c) => c.op === 'updateOne')).toHaveLength(0);
  });
});

describe('brouillon → premier compte-rendu', () => {
  it('complète le brouillon au lieu d’insérer un DOUBLON', async () => {
    // La réunion existe déjà (ouverte au démarrage) : se fier au drapeau
    // `isEdit: false` du client ferait naître un second document portant le
    // même meetingId, et l'historique afficherait la réunion en double.
    const { app, db } = buildTestApp({
      openai: { chat: (params) => (isTitleCall(params) ? 'Projet INITECH' : '<p>CR</p>') },
      seed: {
        resume: [
          {
            email: EMAIL,
            meetingId: 'live-1',
            resume: '',
            transcription: 'partiel',
            versions: [],
            status: 'recording',
          },
        ],
      },
    });
    await postJson(app, '/api/resume', resumePayload({ meetingId: 'live-1', isEdit: false }));

    expect(db.calls.find((c) => c.op === 'insertOne' && c.collection === 'resume')).toBeUndefined();
    const docs = await db.collection('resume').find({ meetingId: 'live-1' }).toArray();
    expect(docs).toHaveLength(1);
    // Premier compte-rendu d'un brouillon : c'est là que la transcription
    // définitive s'inscrit, la ligne sortant de l'état « recording ».
    expect(docs[0].resume).toBe('<p>CR</p>');
    expect(docs[0].transcription).toBe('On a parlé du projet INITECH.');
    expect(docs[0].transcriptionChars).toBe('On a parlé du projet INITECH.'.length);
    expect(docs[0].status).toBe('ended');
  });

  it('/versions/add est idempotent : une même version ne s’empile pas deux fois', async () => {
    // Les deux chemins se croisent quand /history/start a échoué en silence :
    // /resume insère le document avec sa V1 pendant que le client, se croyant
    // en édition, pousse la même version. L'écran afficherait deux onglets
    // « Résumé 1 » identiques.
    const { app, db } = buildTestApp({
      seed: {
        resume: [{ email: EMAIL, meetingId: 'm-1', versions: [{ id: 'v1', html: '<p>A</p>' }] }],
      },
    });
    const res = await postJson(app, '/api/versions/add', {
      meetingId: 'm-1',
      version: { id: 'v1', html: '<p>A</p>' },
    });
    expect(res.json()).toEqual({ ok: true, duplicate: true });
    const doc = await db.collection('resume').findOne({ meetingId: 'm-1' });
    expect(doc.versions).toHaveLength(1);

    await postJson(app, '/api/versions/add', {
      meetingId: 'm-1',
      version: { id: 'v2', html: '<p>B</p>' },
    });
    const after = await db.collection('resume').findOne({ meetingId: 'm-1' });
    expect(after.versions).toHaveLength(2);
  });
});

describe('/api/history/tag', () => {
  const AUTRE = 'bob@myalfred.ai';
  const tagSeed = (extra = {}) => ({
    userTags: [
      { email: EMAIL, emailLower: EMAIL, id: 't-1', label: 'Client Dupont' },
      { email: AUTRE, emailLower: AUTRE, id: 't-bob', label: 'À Bob' },
    ],
    resume: [
      { email: EMAIL, emailLower: EMAIL, meetingId: 'm1', now: '2026-08-01T10:00:00.000Z' },
      { email: AUTRE, emailLower: AUTRE, meetingId: 'm-bob', now: '2026-08-01T10:00:00.000Z' },
    ],
    ...extra,
  });

  it('range la conversation dans le tag', async () => {
    const { app, db } = buildTestApp({ seed: tagSeed() });
    const res = await postJson(app, '/api/history/tag', { meetingId: 'm1', tagId: 't-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, meetingId: 'm1', tagId: 't-1' });
    expect(db.data.get('resume').find((r) => r.meetingId === 'm1').tagId).toBe('t-1');
  });

  it('écrase le tag précédent — une conversation n’en porte qu’un', async () => {
    const seed = tagSeed();
    seed.userTags.push({ email: EMAIL, emailLower: EMAIL, id: 't-2', label: 'Interne' });
    seed.resume[0].tagId = 't-1';
    const { app, db } = buildTestApp({ seed });
    await postJson(app, '/api/history/tag', { meetingId: 'm1', tagId: 't-2' });
    expect(db.data.get('resume').find((r) => r.meetingId === 'm1').tagId).toBe('t-2');
  });

  it('tagId null retire le tag (champ absent, pas une chaîne vide)', async () => {
    const seed = tagSeed();
    seed.resume[0].tagId = 't-1';
    const { app, db } = buildTestApp({ seed });
    const res = await postJson(app, '/api/history/tag', { meetingId: 'm1', tagId: null });
    expect(res.statusCode).toBe(200);
    expect(db.data.get('resume').find((r) => r.meetingId === 'm1')).not.toHaveProperty('tagId');
  });

  it('tagId omis retire aussi le tag', async () => {
    const seed = tagSeed();
    seed.resume[0].tagId = 't-1';
    const { app, db } = buildTestApp({ seed });
    await postJson(app, '/api/history/tag', { meetingId: 'm1' });
    expect(db.data.get('resume').find((r) => r.meetingId === 'm1')).not.toHaveProperty('tagId');
  });

  it('404 sur le tag d’un AUTRE compte — et la conversation reste intacte', async () => {
    const { app, db } = buildTestApp({ seed: tagSeed() });
    const res = await postJson(app, '/api/history/tag', { meetingId: 'm1', tagId: 't-bob' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('tag_not_found');
    expect(db.data.get('resume').find((r) => r.meetingId === 'm1')).not.toHaveProperty('tagId');
  });

  it('404 sur un tag inexistant', async () => {
    const { app } = buildTestApp({ seed: tagSeed() });
    const res = await postJson(app, '/api/history/tag', { meetingId: 'm1', tagId: 'jamais-vu' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('tag_not_found');
  });

  it('404 sur la conversation d’un autre compte — pas d’écriture chez le voisin', async () => {
    const { app, db } = buildTestApp({ seed: tagSeed() });
    const res = await postJson(app, '/api/history/tag', { meetingId: 'm-bob', tagId: 't-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('meeting_not_found');
    expect(db.data.get('resume').find((r) => r.meetingId === 'm-bob')).not.toHaveProperty('tagId');
  });

  it('404 sur une conversation inexistante', async () => {
    const { app } = buildTestApp({ seed: tagSeed() });
    const res = await postJson(app, '/api/history/tag', { meetingId: 'jamais-vu', tagId: 't-1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('meeting_not_found');
  });

  it('l’écriture est scopée {meetingId, propriétaire}', async () => {
    const { app, db } = buildTestApp({ seed: tagSeed() });
    await postJson(app, '/api/history/tag', { meetingId: 'm1', tagId: 't-1' });
    const update = db.calls.find((c) => c.collection === 'resume' && c.op === 'updateOne');
    expect(update.filter).toEqual(ownerFilter(EMAIL, { meetingId: 'm1' }));
  });

  it('400 sans meetingId', async () => {
    const { app } = buildTestApp({ seed: tagSeed() });
    const res = await postJson(app, '/api/history/tag', { tagId: 't-1' });
    expect(res.statusCode).toBe(400);
  });

  it('401 sans identité', async () => {
    const { app } = buildTestApp({ seed: tagSeed() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/history/tag',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ meetingId: 'm1', tagId: 't-1' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('scoping par email (fix sécurité vs n8n)', () => {
  it('/history/delete supprime {meetingId, email} — plus de deleteMany sans filtre', async () => {
    const { app, db } = buildTestApp();
    const res = await postJson(app, '/api/history/delete', { meetingId: 'm-1' });
    expect(res.json()).toEqual({ ok: true });
    const del = db.calls.find((c) => c.op === 'deleteMany');
    expect(del.filter).toEqual(ownerFilter(EMAIL, { meetingId: 'm-1' }));
  });

  it('/history/rename persiste le titre côté serveur (nouvel endpoint)', async () => {
    const { app, db } = buildTestApp({
      seed: { resume: [{ meetingId: 'm-1', email: EMAIL, title: 'Avant' }] },
    });
    const res = await postJson(app, '/api/history/rename', {
      meetingId: 'm-1',
      title: '  Nouveau titre  ',
    });
    expect(res.json()).toEqual({ ok: true });
    const upd = db.calls.find((c) => c.op === 'updateOne');
    expect(upd.filter).toEqual(ownerFilter(EMAIL, { meetingId: 'm-1' }));
    expect(upd.update.$set.title).toBe('Nouveau titre');
  });

  it('/versions/add|delete|update opèrent sur {meetingId, email} avec les bons opérateurs', async () => {
    const { app, db } = buildTestApp();
    await postJson(app, '/api/versions/add', {
      meetingId: 'm-1',
      version: { id: 'v2', html: '<p>2</p>' },
    });
    await postJson(app, '/api/versions/delete', { meetingId: 'm-1', versionId: 'v2' });
    await postJson(app, '/api/versions/update', {
      meetingId: 'm-1',
      versionId: 'v1',
      html: '<p>edit</p>',
    });

    const [add, del, upd] = db.calls.filter((c) => c.op === 'updateOne');
    expect(add.filter).toEqual(ownerFilter(EMAIL, { meetingId: 'm-1' }));
    expect(add.update.$push).toEqual({ versions: { id: 'v2', html: '<p>2</p>' } });
    expect(del.update.$pull).toEqual({ versions: { id: 'v2' } });
    expect(upd.update.$set).toEqual({ 'versions.$[v].html': '<p>edit</p>', resume: '<p>edit</p>' });
    expect(upd.options.arrayFilters).toEqual([{ 'v.id': 'v1' }]);
  });

  it('/transcription/update scopé {meetingId, email}', async () => {
    const { app, db } = buildTestApp();
    const res = await postJson(app, '/api/transcription/update', {
      meetingId: 'm-1',
      transcription: 'texte édité',
    });
    expect(res.json()).toEqual({ ok: true });
    const upd = db.calls.find((c) => c.op === 'updateOne');
    expect(upd.filter).toEqual(ownerFilter(EMAIL, { meetingId: 'm-1' }));
    expect(upd.update.$set.transcription).toBe('texte édité');
  });

  it('sans identité → 401 sur toutes les routes réunions', async () => {
    const { app } = buildTestApp();
    for (const [method, url] of [
      ['GET', '/api/history'],
      ['POST', '/api/history/delete'],
      ['POST', '/api/versions/add'],
      ['POST', '/api/resume'],
    ]) {
      const res = await app.inject({
        method,
        url,
        headers: { 'content-type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    // Route à schéma : le corps doit être VALIDE pour atteindre le contrôle
    // d'identité — sinon un 400 masquerait l'absence de 401.
    for (const url of ['/api/history/notes-actions', '/api/history/stop', '/api/history/title']) {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meetingId: 'm-1', notes: 'Des notes' }),
      });
      expect(res.statusCode, url).toBe(401);
    }
  });
});

/**
 * L'ORDRE de /history — la liste doit être ordonnée par la date qu'elle AFFICHE.
 *
 * Deux notions de « quand » cohabitent sur un document `resume` :
 *   - `lastConnecion` (faute héritée de n8n) : la date de la RÉUNION, celle qui
 *     est affichée et qui décide du groupe de la sidebar ;
 *   - `now` : la date de dernière ÉCRITURE, réécrite à chaque régénération.
 *
 * Trier sur l'une en affichant l'autre fait remonter en tête une réunion
 * ancienne dès qu'on régénère son résumé — et comme la sidebar groupe dans
 * l'ordre d'arrivée, le bloc du mois ancien passe devant « Cette semaine ».
 */
describe('/history — ordre', () => {
  const iso = (daysAgo, hour = 9) =>
    new Date(Date.now() - daysAgo * 86400000).toISOString().replace(/T\d\d/, `T0${hour}`);

  /** Réunion ancienne dont le résumé vient d'être régénéré : `now` est frais. */
  const seed = {
    resume: [
      { meetingId: 'ancienne-regeneree', email: EMAIL, lastConnecion: iso(30), now: iso(0) },
      { meetingId: 'aujourd-hui', email: EMAIL, lastConnecion: iso(0), now: iso(0) },
      { meetingId: 'avant-hier', email: EMAIL, lastConnecion: iso(2), now: iso(2) },
    ],
  };

  it('ordonne par la date de réunion, pas par la date de dernière écriture', async () => {
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: identityHeaders(EMAIL),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((m) => m.meetingId)).toEqual([
      'aujourd-hui',
      'avant-hier',
      'ancienne-regeneree',
    ]);
  });

  it('le premier groupe de la sidebar reste « Cette semaine »', async () => {
    const { app } = buildTestApp({ seed });
    const res = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: identityHeaders(EMAIL),
    });
    // La sidebar groupe dans l'ordre d'arrivée : le premier weekLabel rencontré
    // est le premier bloc affiché. C'est CE symptôme que voit l'utilisateur.
    expect(res.json()[0].weekLabel).toBe('Cette semaine');
  });

  it('une date illisible ne désordonne pas le reste et reste servie', async () => {
    const { app } = buildTestApp({
      seed: {
        resume: [
          { meetingId: 'sans-date', email: EMAIL },
          { meetingId: 'aujourd-hui', email: EMAIL, lastConnecion: iso(0), now: iso(0) },
        ],
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: identityHeaders(EMAIL),
    });
    const ids = res.json().map((m) => m.meetingId);
    expect(ids).toHaveLength(2); // rien n'est perdu
    expect(ids[0]).toBe('aujourd-hui'); // la datée passe devant l'indatable
  });

  it('deux réunions sans date lisible restent servies, sans comparateur NaN', async () => {
    const { app } = buildTestApp({
      seed: {
        resume: [
          { meetingId: 'sans-date-a', email: EMAIL },
          { meetingId: 'sans-date-b', email: EMAIL },
          { meetingId: 'datee', email: EMAIL, lastConnecion: iso(1), now: iso(1) },
        ],
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: identityHeaders(EMAIL),
    });
    const ids = res.json().map((m) => m.meetingId);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe('datee');
    expect(ids.slice(1).sort()).toEqual(['sans-date-a', 'sans-date-b']);
  });
});

describe('/api/resume — Pagimètre (longueur en pages, vérifiée par le serveur)', () => {
  const SENTENCE =
    "L'équipe a passé en revue l'avancement du projet de refonte du portail client, lancé en juin.";
  const para = (n) =>
    Array.from(
      { length: n },
      (_, i) => `<p>${i} ${SENTENCE} ${SENTENCE} ${SENTENCE} ${SENTENCE}</p>`,
    ).join('\n');
  const HEAD = '<h1>CR</h1>\n<h2>Synthèse</h2>';
  const TAIL = '<h2>Actions à mener</h2>\n[[AI_SLOT_1]]\n<ul><li>Relancer le client</li></ul>';
  const length = (pages = 1) => ({
    pages,
    anchors: { before: '<h2>Synthèse</h2>', beforeCount: 1, after: '<h2>Actions à mener</h2>' },
    fix: {
      expand: 'DÉVELOPPE {{mots_actuels}} → {{mots_cibles}}',
      condense: 'CONDENSE {{mots_actuels}} → {{mots_cibles}}',
    },
  });

  it('résumé trop court : repris une fois ; la longueur demandée et mesurée est rendue et enregistrée', async () => {
    const { app, ai, db } = buildTestApp({
      openai: {
        chat: (params) => {
          if (isTitleCall(params)) return '"Titre."';
          const sys = params.messages[0].content;
          if (sys.startsWith('DÉVELOPPE')) return para(11);
          if (sys.includes('20 mots')) return '<p>Court.</p>';
          return `${HEAD}\n${para(1)}\n${TAIL}`;
        },
      },
    });
    const res = await postJson(
      app,
      '/api/resume',
      resumePayload({
        transcription: 'mot '.repeat(20000),
        blocks: [{ marker: '[[AI_SLOT_1]]', systemPrompt: 'Résumé en 20 mots.' }],
        length: length(1),
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Le résumé repris, entre la mise en forme intacte — et le bloc fixe posé ensuite.
    expect(body.resume).toBe(
      `${HEAD}\n${para(11)}\n<h2>Actions à mener</h2>\n<p>Court.</p>\n<ul><li>Relancer le client</li></ul>`,
    );
    expect(body.pages).toBe(1);
    expect(body.measuredPages).toBeGreaterThan(0.9);
    expect(body.measuredPages).toBeLessThan(1.2);

    const summaryCalls = ai.calls.filter((c) => !isTitleCall(c.params));
    // principal + bloc fixe + reprise
    expect(summaryCalls).toHaveLength(3);
    const main = summaryCalls.find(
      (c) => c.params.messages[0].content === 'Tu es un rédacteur de comptes-rendus.',
    );
    // Une page : verbosité moyenne, ni le « développe » d'un compte rendu libre…
    expect(main.params.verbosity).toBe('medium');
    const fix = summaryCalls.find((c) => c.params.messages[0].content.startsWith('DÉVELOPPE'));
    // …et la reprise voit la transcription ET le résumé à reprendre, seul.
    expect(fix.params.messages[1].content).toContain('#TRANSCRIPTION DE LA RÉUNION');
    expect(fix.params.messages[1].content).toContain(`#RÉSUMÉ_À_REPRENDRE (HTML)\n\n${para(1)}`);
    expect(fix.params.messages[1].content).not.toContain('Relancer le client');
    expect(fix.params.timeoutMs).toBe(300_000);

    const insert = db.calls.find((c) => c.op === 'insertOne' && c.collection === 'resume');
    expect(insert.doc.versions[0].pages).toBe(1);
    expect(insert.doc.versions[0].measuredPages).toBe(body.measuredPages);
  });

  it('un quart de page : verbosité basse dès le premier jet', async () => {
    const { app, ai } = buildTestApp({
      openai: {
        chat: (params) => (isTitleCall(params) ? '"T."' : `${HEAD}\n${para(2)}\n${TAIL}`),
      },
    });
    await postJson(
      app,
      '/api/resume',
      resumePayload({ transcription: 'mot '.repeat(20000), length: length(0.25) }),
    );
    const main = ai.calls.find(
      (c) => c.params.messages[0].content === 'Tu es un rédacteur de comptes-rendus.',
    );
    expect(main.params.verbosity).toBe('low');
  });

  it('reprise en panne : le premier jet part quand même, sans erreur', async () => {
    const { app } = buildTestApp({
      openai: {
        chat: (params) => {
          if (isTitleCall(params)) return '"T."';
          if (params.messages[0].content.startsWith('DÉVELOPPE')) {
            throw new UpstreamError(500, '{"error":"boom"}');
          }
          return `${HEAD}\n${para(1)}\n${TAIL}`;
        },
      },
    });
    const res = await postJson(
      app,
      '/api/resume',
      resumePayload({ transcription: 'mot '.repeat(20000), length: length(1) }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().resume).toContain(para(1));
    expect(res.json().measuredPages).toBeLessThan(0.3);
  });

  it('sans Pagimètre, ou longueur invalide : comme avant — verbosité haute, aucun champ de longueur', async () => {
    for (const extra of [{}, { length: { pages: 42 } }]) {
      const { app, ai, db } = buildTestApp({
        openai: { chat: (params) => (isTitleCall(params) ? '"T."' : '<h1>CR</h1><p>x</p>') },
      });
      const res = await postJson(app, '/api/resume', resumePayload(extra));
      const body = res.json();
      expect(body).not.toHaveProperty('pages');
      expect(body).not.toHaveProperty('measuredPages');
      const summaryCalls = ai.calls.filter((c) => !isTitleCall(c.params));
      expect(summaryCalls).toHaveLength(1);
      expect(summaryCalls[0].params.verbosity).toBe('high');
      const insert = db.calls.find((c) => c.op === 'insertOne' && c.collection === 'resume');
      expect(insert.doc.versions[0]).not.toHaveProperty('pages');
    }
  });
});
