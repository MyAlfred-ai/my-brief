/**
 * Modèle de RÉDACTION du compte rendu, réglable depuis Administration → IA.
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - le modèle choisi arrive bien jusqu'à l'appel OpenAI de /resume. Un
 *     réglage enregistré mais non relu est le pire des deux mondes : l'écran
 *     annonce un changement qui n'a pas lieu ;
 *   - il est relu à CHAQUE génération, sans cache — un modèle changé pendant
 *     qu'un onglet est ouvert s'applique au compte rendu suivant ;
 *   - une valeur hors liste venant de l'ÉCRAN est refusée, mais celle qui
 *     vient de l'ENVIRONNEMENT est conservée : c'est la porte de sortie de
 *     l'administrateur système (un modèle plus récent que cette version) ;
 *   - `verbosity`/`reasoning_effort` ne partent pas vers un modèle qui les
 *     refuse. Choisir gpt-4o-mini dans l'écran ne doit pas faire répondre 400
 *     à toutes les générations de l'installation.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';
import {
  SUMMARY_MODELS,
  DEFAULT_SUMMARY_MODEL,
  resolveSummaryModel,
} from '../lib/summaryModels.js';
import { toPublicAiSettings } from '../lib/repositories/settings.js';

const ADMIN = 'patron@client.fr';

const seed = (ai) => ({
  user: [userDoc(ADMIN, { role: 'admin' })],
  ...(ai ? { appSettings: [{ key: 'ai', ...ai }] } : {}),
});

function resumePayload() {
  return {
    transcription: 'On a parlé du projet INITECH.',
    systemPrompt: 'Tu es un rédacteur de comptes-rendus.',
    template: 'standard',
    language: 'fr',
    actions: [],
    versionId: 'v1',
    meetingId: null,
    isEdit: false,
  };
}

const postResume = (app) =>
  app.inject({
    method: 'POST',
    url: '/api/resume',
    headers: { ...identityHeaders(ADMIN), 'content-type': 'application/json' },
    body: JSON.stringify(resumePayload()),
  });

/** L'appel du compte rendu principal, distingué de celui du titre. */
const summaryCall = (ai) =>
  ai.calls.find((c) => c.method === 'chat' && c.params.messages[0].content.startsWith('Tu es'));

describe('resolveSummaryModel — provenance', () => {
  it("l'écran l'emporte sur l'environnement, qui l'emporte sur le défaut", () => {
    expect(resolveSummaryModel('gpt-5.4-mini', 'gpt-5.6-sol')).toBe('gpt-5.4-mini');
    expect(resolveSummaryModel('', 'gpt-5.6-sol')).toBe('gpt-5.6-sol');
    expect(resolveSummaryModel('', '')).toBe(DEFAULT_SUMMARY_MODEL);
  });

  it('une valeur enregistrée hors liste est IGNORÉE (base éditée à la main)', () => {
    expect(resolveSummaryModel('gpt5-mini', '')).toBe(DEFAULT_SUMMARY_MODEL);
    // « gpt-5.6 » tout court n'existe pas : trois paliers nommés, et rien entre.
    expect(resolveSummaryModel('gpt-5.6', '')).toBe(DEFAULT_SUMMARY_MODEL);
  });

  it("une valeur d'ENVIRONNEMENT hors liste est CONSERVÉE — c'est la porte de sortie", () => {
    // `gpt-5-mini` est hors liste depuis qu'il a été mesuré peu fiable sur la
    // recopie du scaffold : un déploiement peut malgré tout l'imposer.
    expect(resolveSummaryModel('', 'gpt-5-mini')).toBe('gpt-5-mini');
    // Volontairement différent de la transcription, qui l'ignore : là-bas
    // l'amont refuse tout identifiant inconnu, ici l'administrateur système
    // doit pouvoir viser un modèle que cette version ne connaît pas encore.
    expect(resolveSummaryModel('', 'gpt-5.6-terra')).toBe('gpt-5.6-terra');
  });
});

describe('projection admin', () => {
  it('sert la valeur, sa provenance et la liste des choix', () => {
    const pub = toPublicAiSettings(
      { summaryModel: 'gpt-5.6-sol' },
      { envSummaryModel: 'gpt-5.4-mini' },
    );
    expect(pub.summaryModel).toBe('gpt-5.6-sol');
    expect(pub.summaryModelSource).toBe('settings');
    expect(pub.summaryModels).toEqual(SUMMARY_MODELS);
    expect(pub.summaryModelOffList).toBe(false);
  });

  it('signale un modèle imposé par le déploiement et hors liste', () => {
    const pub = toPublicAiSettings({}, { envSummaryModel: 'gpt-5.6-terra' });
    expect(pub.summaryModel).toBe('gpt-5.6-terra');
    expect(pub.summaryModelSource).toBe('env');
    // Sans ce drapeau, l'écran afficherait le premier modèle de sa liste et
    // mentirait sur celui réellement en service.
    expect(pub.summaryModelOffList).toBe(true);
  });

  it('sans rien : le défaut, annoncé comme tel', () => {
    const pub = toPublicAiSettings({}, {});
    expect(pub.summaryModel).toBe(DEFAULT_SUMMARY_MODEL);
    expect(pub.summaryModelSource).toBe('default');
  });
});

describe('POST /api/admin/settings/ai — summaryModel', () => {
  const save = (app, body) =>
    app.inject({
      method: 'POST',
      url: '/api/admin/settings/ai',
      headers: { ...identityHeaders(ADMIN), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('enregistre un modèle de la liste', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const res = await save(app, { summaryModel: 'gpt-5.6-sol' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.summaryModel).toBe('gpt-5.6-sol');
    expect(res.json().settings.summaryModelSource).toBe('settings');
  });

  it('refuse un modèle hors liste — une coquille casserait TOUS les comptes rendus', async () => {
    const { app } = buildTestApp({ seed: seed() });
    // /chat/completions accepterait la chaîne et n'échouerait qu'à la
    // génération, chez l'utilisateur : d'où la liste fermée côté écran.
    expect((await save(app, { summaryModel: 'gpt5-mini' })).statusCode).toBe(400);
    // Le piège nommé : « gpt-5.6 » sans palier répondrait 404 à chaque CR.
    expect((await save(app, { summaryModel: 'gpt-5.6' })).statusCode).toBe(400);
  });

  it('vide = retour au défaut, sans toucher à la clé', async () => {
    const { app } = buildTestApp({
      seed: seed({ apiKey: 'sk-conservee', summaryModel: 'gpt-5.6-sol' }),
    });
    const res = await save(app, { summaryModel: '' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.summaryModel).toBe(DEFAULT_SUMMARY_MODEL);
    // La clé enregistrée survit : un corps qui porterait toujours `apiKey`
    // l'effacerait (vide = « retire la clé »).
    expect(res.json().settings.source).toBe('settings');
  });
});

describe('/api/resume — le modèle choisi part vraiment à OpenAI', () => {
  it('utilise le modèle enregistré dans l’administration', async () => {
    const { app, ai } = buildTestApp({
      seed: seed({ summaryModel: 'gpt-5.6-sol' }),
      openai: { chat: '<p>CR</p>' },
    });
    const res = await postResume(app);
    expect(res.statusCode).toBe(200);
    expect(summaryCall(ai).params.model).toBe('gpt-5.6-sol');
  });

  it("sans réglage : le défaut de l'application", async () => {
    const { app, ai } = buildTestApp({ seed: seed(), openai: { chat: '<p>CR</p>' } });
    await postResume(app);
    expect(summaryCall(ai).params.model).toBe(DEFAULT_SUMMARY_MODEL);
  });

  it('relu à CHAQUE génération : pas de cache à invalider', async () => {
    const { app, ai } = buildTestApp({
      seed: seed({ summaryModel: 'gpt-5.6-sol' }),
      openai: { chat: '<p>CR</p>' },
    });
    await postResume(app);
    expect(summaryCall(ai).params.model).toBe('gpt-5.6-sol');

    // Un administrateur change le modèle pendant que l'onglet reste ouvert.
    await app.settings.updateAi({ summaryModel: 'gpt-5.4-mini' }, { actor: ADMIN });
    ai.calls.length = 0;
    await postResume(app);
    expect(summaryCall(ai).params.model).toBe('gpt-5.4-mini');
  });

  it('la route demande TOUJOURS le même budget de sortie, quel que soit le modèle', async () => {
    // Séparation voulue : la route dit ce qu'elle VEUT (« développe »), et
    // lib/openai.js décide si le modèle sait l'entendre — c'est là que
    // `verbosity` est retiré pour gpt-4o-mini, qui répondrait 400
    // (cf. openaiChatTuning.test.js). Une route qui ferait ce tri elle-même
    // devrait connaître les capacités de chaque modèle : deux endroits à tenir
    // à jour au lieu d'un.
    const { app, ai } = buildTestApp({
      seed: seed({ summaryModel: 'gpt-5.4-mini' }),
      openai: { chat: '<p>CR</p>' },
    });
    await postResume(app);
    const call = summaryCall(ai);
    expect(call.params.model).toBe('gpt-5.4-mini');
    expect(call.params.verbosity).toBe('high');
  });
});
