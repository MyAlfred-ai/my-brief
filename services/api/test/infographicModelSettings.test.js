/**
 * Modèle d'IMAGE de l'infographie, réglable depuis Administration → IA.
 *
 * ⚠️ Depuis les gabarits (2026-11-17), plus aucune infographie n'est DESSINÉE :
 * l'IA écrit un contenu que le frontend met en page (lib/infographicLayout.js),
 * et ce réglage n'apparaît plus à l'écran. Sa mécanique est gardée telle
 * quelle — l'API des réglages l'accepte toujours, des valeurs sont en base —
 * et vérifiée ici tant qu'elle existe :
 *   - une valeur hors liste venant de l'ÉCRAN est refusée, celle qui vient de
 *     l'ENVIRONNEMENT est conservée ;
 *   - un choix resté sur `gpt-image-2`, retiré par OpenAI le 2027-02-10, est
 *     lu comme Flare, et la projection le DIT (`infographicImageModelRetired`) ;
 *   - le client OpenAI transmet l'identifiant tel quel.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders, userDoc } from './helpers.js';
import { createOpenAiClient } from '../lib/openai.js';
import {
  INFOGRAPHIC_IMAGE_MODELS,
  DEFAULT_INFOGRAPHIC_IMAGE_MODEL,
  describeInfographicImageModel,
  resolveInfographicImageModel,
} from '../lib/infographicModels.js';
import { toPublicAiSettings } from '../lib/repositories/settings.js';

const ADMIN = 'patron@client.fr';

const seed = (ai) => ({
  user: [userDoc(ADMIN, { role: 'admin' })],
  ...(ai ? { appSettings: [{ key: 'ai', ...ai }] } : {}),
});

describe('resolveInfographicImageModel — provenance', () => {
  it("l'écran l'emporte sur l'environnement, qui l'emporte sur le défaut", () => {
    expect(resolveInfographicImageModel('gpt-image-2.5-flare', 'gpt-image-2.5-sunburst')).toBe(
      'gpt-image-2.5-flare',
    );
    expect(resolveInfographicImageModel('', 'gpt-image-2.5-sunburst')).toBe(
      'gpt-image-2.5-sunburst',
    );
    expect(resolveInfographicImageModel('', '')).toBe(DEFAULT_INFOGRAPHIC_IMAGE_MODEL);
  });

  it('le défaut est le palier Flare de la génération 2.5', () => {
    expect(DEFAULT_INFOGRAPHIC_IMAGE_MODEL).toBe('gpt-image-2.5-flare');
    // gpt-image-2, le repli d'avant, n'est plus proposé : OpenAI le coupe le
    // 2027-02-10.
    expect(INFOGRAPHIC_IMAGE_MODELS).not.toContain('gpt-image-2');
  });

  it('un choix resté sur gpt-image-2 (retiré) est lu comme Flare, et le dit', () => {
    // Le choix de l'écran l'emporte encore sur l'environnement : c'est lui
    // qu'on traduit, comme pour la transcription.
    expect(describeInfographicImageModel('gpt-image-2', 'gpt-image-2.5-sunburst')).toEqual({
      model: 'gpt-image-2.5-flare',
      source: 'settings',
      retiredFrom: 'gpt-image-2',
    });
    expect(describeInfographicImageModel('gpt-image-2.5-flare', '')).toMatchObject({
      retiredFrom: null,
    });
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
      { infographicImageModel: 'gpt-image-2.5-flare' },
      { envInfographicImageModel: 'gpt-image-2.5-sunburst' },
    );
    expect(pub.infographicImageModel).toBe('gpt-image-2.5-flare');
    expect(pub.infographicImageModelSource).toBe('settings');
    expect(pub.infographicImageModels).toEqual(INFOGRAPHIC_IMAGE_MODELS);
    expect(pub.infographicImageModelOffList).toBe(false);
    expect(pub.infographicImageModelRetired).toBeNull();
  });

  it('dit le remplacement d’un choix resté sur gpt-image-2, avec la date de coupure', () => {
    const pub = toPublicAiSettings({ infographicImageModel: 'gpt-image-2' }, {});
    expect(pub.infographicImageModel).toBe('gpt-image-2.5-flare');
    expect(pub.infographicImageModelSource).toBe('settings');
    expect(pub.infographicImageModelRetired).toEqual({ from: 'gpt-image-2', date: '2027-02-10' });
    // Le menu ne montre pas le modèle retiré : seulement la liste servie.
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
    const res = await save(app, { infographicImageModel: 'gpt-image-2.5-flare' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.infographicImageModel).toBe('gpt-image-2.5-flare');
    expect(res.json().settings.infographicImageModelSource).toBe('settings');
  });

  it('refuse gpt-image-2 : retiré par OpenAI, il ne se choisit plus', async () => {
    const { app } = buildTestApp({ seed: seed() });
    expect((await save(app, { infographicImageModel: 'gpt-image-2' })).statusCode).toBe(400);
  });

  it('« Garder » enregistre le remplaçant : l’avis disparaît', async () => {
    const { app } = buildTestApp({ seed: seed({ infographicImageModel: 'gpt-image-2' }) });
    const res = await save(app, { infographicImageModel: 'gpt-image-2.5-flare' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.infographicImageModelRetired).toBeNull();
    expect(res.json().settings.infographicImageModel).toBe('gpt-image-2.5-flare');
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
