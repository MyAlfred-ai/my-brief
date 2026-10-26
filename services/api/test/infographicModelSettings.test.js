/**
 * Modèle qui DESSINE l'infographie, réglable depuis Administration → IA.
 *
 * Il était FIXE dans le code jusqu'au 2026-09-16 (`gpt-image-2`). Ce qui se
 * vérifie ici et nulle part ailleurs :
 *   - le modèle choisi arrive bien jusqu'à l'appel image de /resume — et jusqu'au
 *     document d'infographie enregistré, qui dit avec quoi l'image a été faite ;
 *   - il est relu à CHAQUE image, sans cache : un modèle changé s'applique à la
 *     génération suivante, sans redémarrage ;
 *   - une valeur hors liste venant de l'ÉCRAN est refusée, celle qui vient de
 *     l'ENVIRONNEMENT est conservée (porte de sortie vers `sunburst` ou une
 *     génération plus récente que cette version) ;
 *   - le réglage est INDÉPENDANT du modèle TEXTE qui écrit le prompt d'image :
 *     deux appels, deux modèles, et les confondre ferait dessiner par un modèle
 *     de chat — 404 à chaque infographie.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';
import { createOpenAiClient } from '../lib/openai.js';
import {
  INFOGRAPHIC_IMAGE_MODELS,
  DEFAULT_INFOGRAPHIC_IMAGE_MODEL,
  resolveInfographicImageModel,
} from '../lib/infographicModels.js';
import { INFOGRAPHICS_COLLECTION } from '../lib/infographic.js';
import { toPublicAiSettings } from '../lib/repositories/settings.js';
import { ownerFilter } from '../lib/ownerScope.js';
import { loadConfig } from '../lib/config.js';

const ADMIN = 'patron@client.fr';

const seed = (ai) => ({
  user: [userDoc(ADMIN, { role: 'admin' })],
  ...(ai ? { appSettings: [{ key: 'ai', ...ai }] } : {}),
});

const postResume = (app) =>
  app.inject({
    method: 'POST',
    url: '/api/resume',
    headers: { ...identityHeaders(ADMIN), 'content-type': 'application/json' },
    body: JSON.stringify({
      transcription: 'On a parlé du projet INITECH.',
      systemPrompt: 'Tu es un rédacteur de comptes-rendus.',
      template: 'standard',
      language: 'fr',
      actions: [],
      versionId: 'v1',
      meetingId: null,
      isEdit: false,
      infographic: true,
    }),
  });

/** L'appel qui DESSINE, distingué des appels de chat (réécrivain, titre, CR). */
const imageCall = (ai) => ai.calls.find((c) => c.method === 'generateImage');

describe('resolveInfographicImageModel — provenance', () => {
  it("l'écran l'emporte sur l'environnement, qui l'emporte sur le défaut", () => {
    expect(resolveInfographicImageModel('gpt-image-2', 'gpt-image-2.5-flare')).toBe('gpt-image-2');
    expect(resolveInfographicImageModel('', 'gpt-image-2')).toBe('gpt-image-2');
    expect(resolveInfographicImageModel('', '')).toBe(DEFAULT_INFOGRAPHIC_IMAGE_MODEL);
  });

  it('le défaut est le palier Flare de la génération 2.5', () => {
    expect(DEFAULT_INFOGRAPHIC_IMAGE_MODEL).toBe('gpt-image-2.5-flare');
    // Le modèle précédent reste proposé : c'est le repli si Flare déçoit en
    // recette, et il se choisit depuis l'écran, sans déploiement.
    expect(INFOGRAPHIC_IMAGE_MODELS).toContain('gpt-image-2');
  });

  it('une valeur enregistrée hors liste est IGNORÉE (base éditée à la main)', () => {
    expect(resolveInfographicImageModel('gpt-image-25-flare', '')).toBe(
      DEFAULT_INFOGRAPHIC_IMAGE_MODEL,
    );
  });

  it("une valeur d'ENVIRONNEMENT hors liste est CONSERVÉE — c'est la porte de sortie", () => {
    // `sunburst` existe mais n'est pas listé : rien ne l'a départagé de Flare
    // ici. Un déploiement doit malgré tout pouvoir le viser.
    expect(resolveInfographicImageModel('', 'gpt-image-2.5-sunburst')).toBe(
      'gpt-image-2.5-sunburst',
    );
  });
});

describe('projection admin', () => {
  it('sert la valeur, sa provenance et la liste des choix', () => {
    const pub = toPublicAiSettings(
      { infographicImageModel: 'gpt-image-2' },
      { envInfographicImageModel: 'gpt-image-2.5-flare' },
    );
    expect(pub.infographicImageModel).toBe('gpt-image-2');
    expect(pub.infographicImageModelSource).toBe('settings');
    expect(pub.infographicImageModels).toEqual(INFOGRAPHIC_IMAGE_MODELS);
    expect(pub.infographicImageModelOffList).toBe(false);
  });

  it('signale un palier imposé par le déploiement et hors liste', () => {
    const pub = toPublicAiSettings({}, { envInfographicImageModel: 'gpt-image-2.5-sunburst' });
    expect(pub.infographicImageModel).toBe('gpt-image-2.5-sunburst');
    expect(pub.infographicImageModelSource).toBe('env');
    // Sans ce drapeau, l'écran afficherait la première option de sa liste et
    // mentirait sur le modèle qui dessine réellement.
    expect(pub.infographicImageModelOffList).toBe(true);
  });

  it('sans rien : le défaut, annoncé comme tel', () => {
    const pub = toPublicAiSettings({}, {});
    expect(pub.infographicImageModel).toBe(DEFAULT_INFOGRAPHIC_IMAGE_MODEL);
    expect(pub.infographicImageModelSource).toBe('default');
  });
});

describe('POST /api/admin/settings/ai — infographicImageModel', () => {
  const save = (app, body) =>
    app.inject({
      method: 'POST',
      url: '/api/admin/settings/ai',
      headers: { ...identityHeaders(ADMIN), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('enregistre un modèle de la liste', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await save(app, { infographicImageModel: 'gpt-image-2' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.infographicImageModel).toBe('gpt-image-2');
    expect(res.json().settings.infographicImageModelSource).toBe('settings');
  });

  it('refuse un modèle hors liste — la panne serait invisible côté administration', async () => {
    const { app } = buildTestApp({ seed: seed() });
    // /images/generations accepterait la chaîne et n'échouerait qu'en tâche de
    // fond : l'utilisateur verrait `error`, l'administrateur rien du tout.
    expect((await save(app, { infographicImageModel: 'gpt-image-25-flare' })).statusCode).toBe(400);
    expect((await save(app, { infographicImageModel: 'gpt-image-2.5' })).statusCode).toBe(400);
  });

  it('vide = retour au défaut, sans toucher à la clé', async () => {
    const { app } = buildTestApp({
      seed: seed({ apiKey: 'sk-conservee', infographicImageModel: 'gpt-image-2' }),
    });
    const res = await save(app, { infographicImageModel: '' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.infographicImageModel).toBe(DEFAULT_INFOGRAPHIC_IMAGE_MODEL);
    expect(res.json().settings.source).toBe('settings');
  });
});

describe('/api/resume — le modèle choisi dessine vraiment', () => {
  it("utilise le modèle enregistré dans l'administration, et l'inscrit sur l'image", async () => {
    const { app, db, ai } = buildTestApp({ seed: seed({ infographicImageModel: 'gpt-image-2' }) });
    const res = await postResume(app);
    expect(res.statusCode).toBe(200);
    await app.background.drain();

    expect(imageCall(ai).params.model).toBe('gpt-image-2');
    // Le document d'infographie dit avec QUOI l'image a été faite : sans cela,
    // comparer deux générations après un changement de modèle serait impossible.
    const meetingId = res.json().meetingId;
    const img = await db
      .collection(INFOGRAPHICS_COLLECTION)
      .findOne(ownerFilter(ADMIN, { meetingId }));
    expect(img.model).toBe('gpt-image-2');
  });

  it("sans réglage : le défaut de l'application", async () => {
    const { app, ai } = buildTestApp({ seed: seed() });
    await postResume(app);
    await app.background.drain();
    expect(imageCall(ai).params.model).toBe(DEFAULT_INFOGRAPHIC_IMAGE_MODEL);
  });

  it('OPENAI_MODEL_INFOGRAPHIC_IMAGE impose un palier non listé', async () => {
    const { openai } = loadConfig({ OPENAI_MODEL_INFOGRAPHIC_IMAGE: 'gpt-image-2.5-sunburst' });
    const { app, ai } = buildTestApp({ seed: seed(), config: { openai } });
    await postResume(app);
    await app.background.drain();
    expect(imageCall(ai).params.model).toBe('gpt-image-2.5-sunburst');
  });

  it('relu à CHAQUE image : pas de cache à invalider', async () => {
    const { app, ai } = buildTestApp({ seed: seed({ infographicImageModel: 'gpt-image-2' }) });
    await postResume(app);
    await app.background.drain();
    expect(imageCall(ai).params.model).toBe('gpt-image-2');

    // Un administrateur change le modèle pendant qu'un onglet reste ouvert.
    await app.settings.updateAi({ infographicImageModel: 'gpt-image-2.5-flare' }, { actor: ADMIN });
    ai.calls.length = 0;
    await postResume(app);
    await app.background.drain();
    expect(imageCall(ai).params.model).toBe('gpt-image-2.5-flare');
  });

  it("ne touche PAS au modèle TEXTE qui écrit le prompt d'image", async () => {
    // Deux appels, deux réglages : confondre les deux ferait dessiner par un
    // modèle de chat (404 à chaque infographie) ou écrire le prompt par un
    // modèle d'image.
    const { app, ai } = buildTestApp({ seed: seed({ infographicImageModel: 'gpt-image-2' }) });
    await postResume(app);
    await app.background.drain();
    const writer = ai.calls.filter((c) => c.method === 'chat').map((c) => c.params.model);
    expect(writer).toContain('gpt-5.4');
    expect(writer).not.toContain('gpt-image-2');
  });
});

describe('client OpenAI — ce qui part vraiment sur le fil', () => {
  /** Espionne la requête HTTP réelle, comme openaiChatTuning.test.js. */
  function spyFetch() {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        async json() {
          return { data: [{ b64_json: 'aW1hZ2U=' }] };
        },
      };
    };
    return { calls, fetchImpl };
  }

  it("transmet l'identifiant TEL QUEL, pour chaque modèle proposé", async () => {
    // Le point dans « 2.5 » est le détail qui compte : un identifiant normalisé
    // ou tronqué en chemin répondrait 404 à chaque infographie, en tâche de
    // fond. Vérifié sur la liste RÉELLE, pas sur un exemple.
    for (const model of INFOGRAPHIC_IMAGE_MODELS) {
      const { calls, fetchImpl } = spyFetch();
      const client = createOpenAiClient({ apiKey: 'sk-test-000000000000000', fetchImpl });
      const { b64 } = await client.generateImage({
        model,
        prompt: 'une infographie',
        size: '1024x1536',
      });
      expect(calls[0].url).toContain('/images/generations');
      expect(calls[0].body).toEqual({ model, prompt: 'une infographie', size: '1024x1536' });
      // La réponse reste lue dans `data[0].b64_json` : l'image est stockée en
      // base, jamais rechargée chez OpenAI.
      expect(b64).toBe('aW1hZ2U=');
    }
  });

  it("n'ajoute NI verbosity NI reasoning_effort — ce sont des paramètres de chat", async () => {
    const { calls, fetchImpl } = spyFetch();
    const client = createOpenAiClient({ apiKey: 'sk-test-000000000000000', fetchImpl });
    await client.generateImage({ model: DEFAULT_INFOGRAPHIC_IMAGE_MODEL, prompt: 'x' });
    expect(calls[0].body).not.toHaveProperty('verbosity');
    expect(calls[0].body).not.toHaveProperty('reasoning_effort');
    // Format portrait par défaut, celui pour lequel la maquette est écrite.
    expect(calls[0].body.size).toBe('1024x1536');
  });
});
