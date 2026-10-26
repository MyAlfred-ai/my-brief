import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildTestApp, createFakePriceSources, identityHeaders, userDoc } from './helpers.js';
import { measureUsage, speechRateOf } from '../lib/costs/usage.js';
import {
  activeModels,
  estimateCosts,
  modelsToPrice,
  priceDraw,
  referencePrices,
  spanDaysOf,
} from '../lib/costs/estimate.js';
import { TRANSCRIPTION_MODELS } from '../lib/transcriptionModels.js';
import { effectivePricing, sanitizePrice, pricingProvenance } from '../lib/costs/pricing.js';
import { refreshPricing } from '../lib/costs/refresh.js';
import { CATALOG_CHECKED_AT, FX_FALLBACK, PRICE_CATALOG } from '../lib/costs/catalog.js';
import { ASSUMPTIONS } from '../lib/costs/assumptions.js';
import {
  createLiteLlmSource,
  findLiteLlmEntry,
  normalizeLiteLlmEntry,
} from '../lib/costs/sources/litellm.js';
import { parseEcbDaily } from '../lib/costs/sources/ecb.js';
import { parseCurrencyApi } from '../lib/costs/sources/currencyApi.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const DAY = 86400000;
const ADMIN = 'patron@client.fr';
const USER = 'simple@client.fr';

const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();

/** Réunion projetée telle que la route la lit (cf. MEETING_FIELDS). */
function meeting({ daysAgo = 1, duration = 3600, chars = 50000, email = USER, ...rest } = {}) {
  const date = ago(daysAgo);
  return {
    email,
    emailLower: email.toLowerCase(),
    lastConnecion: date,
    now: date,
    meetingDuration: duration,
    transcriptionChars: chars,
    template: 'standard',
    versions: [{ generatedAt: date }],
    ...rest,
  };
}

const MODELS = activeModels(
  {},
  { title: 'gpt-6-luna', actions: 'gpt-6-luna', infographic: 'gpt-5.4' },
);
const PRICING = effectivePricing(null);
const FX = FX_FALLBACK.usdToEur;

function usageOf(meetings, { days = 30, ...rest } = {}) {
  return measureUsage({ meetings, from: new Date(NOW.getTime() - days * DAY), to: NOW, ...rest });
}

describe('sources en ligne', () => {
  it('LiteLLM : prix unitaires → tarifs à la minute et au million de jetons', () => {
    expect(
      normalizeLiteLlmEntry({
        mode: 'audio_transcription',
        input_cost_per_second: 0.000283333333333,
      }),
    ).toEqual({ kind: 'audio', audioMinute: 0.017 });
    expect(
      normalizeLiteLlmEntry({
        mode: 'chat',
        input_cost_per_token: 0.0000025,
        output_cost_per_token: 0.000015,
      }),
    ).toEqual({ kind: 'text', inputMTok: 2.5, outputMTok: 15 });
    expect(
      normalizeLiteLlmEntry({
        mode: 'image_generation',
        input_cost_per_token: 0.000005,
        output_cost_per_image_token: 0.00003,
      }),
    ).toEqual({ kind: 'image', inputMTok: 5, imageOutputMTok: 30 });
  });

  it('LiteLLM : une entrée inexploitable ne produit aucun tarif', () => {
    expect(normalizeLiteLlmEntry({ mode: 'embedding', input_cost_per_token: 1e-7 })).toBeNull();
    // Transcription tarifée au seul jeton audio : pas d'équivalent à la minute.
    expect(
      normalizeLiteLlmEntry({ mode: 'audio_transcription', input_cost_per_audio_token: 1e-6 }),
    ).toBeNull();
    expect(normalizeLiteLlmEntry(null)).toBeNull();
  });

  it('LiteLLM : un revendeur homonyme ne prend pas la place du fournisseur', () => {
    const data = {
      'gpt-image-2': { litellm_provider: 'fal_ai', mode: 'image_generation' },
      'openai/gpt-image-2': { litellm_provider: 'openai', mode: 'image_generation' },
      'gpt-5.4': { litellm_provider: 'openai', mode: 'chat' },
    };
    expect(findLiteLlmEntry(data, 'gpt-image-2').litellm_provider).toBe('openai');
    expect(findLiteLlmEntry(data, 'gpt-5.4')).toBe(data['gpt-5.4']);
    expect(findLiteLlmEntry(data, 'gpt-5.4', 'mistral')).toBeNull();
  });

  it('LiteLLM : ne rend que les modèles demandés, lève sur une réponse en erreur', async () => {
    const body = {
      'gpt-5.4': {
        litellm_provider: 'openai',
        mode: 'chat',
        input_cost_per_token: 0.000003,
        output_cost_per_token: 0.00002,
      },
      'gpt-4o-mini': { litellm_provider: 'openai', mode: 'chat', input_cost_per_token: 1e-7 },
    };
    const ok = createLiteLlmSource({
      fetchImpl: async () => ({ ok: true, headers: new Map(), json: async () => body }),
    });
    expect(await ok.fetchPrices([{ id: 'gpt-5.4' }, { id: 'inconnu' }])).toEqual({
      'gpt-5.4': { kind: 'text', inputMTok: 3, outputMTok: 20, provider: 'openai' },
    });

    const down = createLiteLlmSource({ fetchImpl: async () => ({ ok: false, status: 503 }) });
    await expect(down.fetchPrices([{ id: 'gpt-5.4' }])).rejects.toThrow(/503/);
  });

  it('BCE : le taux de référence se lit en devises par euro, et s’inverse', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube><Cube time='2026-09-24'>
    <Cube currency='USD' rate='1.1370'/><Cube currency='JPY' rate='170.12'/>
  </Cube></Cube>
</gesmes:Envelope>`;
    const rate = parseEcbDaily(xml);
    expect(rate.date).toBe('2026-09-24');
    expect(rate.usdToEur).toBeCloseTo(1 / 1.137, 10);
    expect(() => parseEcbDaily('<html>maintenance</html>')).toThrow();
  });

  it('currency-api : secours lisible, réponse méconnaissable refusée', () => {
    expect(parseCurrencyApi({ date: '2026-09-25', usd: { eur: 0.8795 } })).toEqual({
      usdToEur: 0.8795,
      date: '2026-09-25',
    });
    expect(() => parseCurrencyApi({ usd: {} })).toThrow();
  });
});

describe('tarifs appliqués — le plus récent gagne', () => {
  it('sans actualisation : le catalogue intégré et le taux de repli', () => {
    const pricing = effectivePricing(null);
    expect(pricing.models['gpt-5.4']).toMatchObject({ inputMTok: 2.5, source: 'builtin' });
    expect(pricing.fx).toEqual(FX_FALLBACK);
  });

  it('une actualisation plus récente recouvre le catalogue, caractéristiques comprises', () => {
    const pricing = effectivePricing({
      models: {
        'gpt-image-2': {
          imageOutputMTok: 40,
          checkedAt: '2026-10-01T08:00:00.000Z',
          source: 'litellm',
        },
        'gpt-modele-futur': { kind: 'text', inputMTok: 1, outputMTok: 2, checkedAt: '2026-10-01' },
      },
      fx: {
        usdToEur: 0.9,
        date: '2026-09-30',
        fetchedAt: '2026-10-01T08:00:00.000Z',
        source: 'ecb',
      },
    });
    // Prix relevé, mais le nombre de jetons par image — que nulle grille ne publie — survit.
    expect(pricing.models['gpt-image-2']).toMatchObject({ imageOutputMTok: 40, imageTokens: 5500 });
    expect(pricing.models['gpt-modele-futur']).toMatchObject({ inputMTok: 1 });
    expect(pricing.fx).toMatchObject({ usdToEur: 0.9, source: 'ecb' });
  });

  it('un relevé plus ancien que le catalogue livré ne l’écrase pas', () => {
    const pricing = effectivePricing({
      models: { 'gpt-5.4': { inputMTok: 99, outputMTok: 99, checkedAt: '2026-01-01T00:00:00Z' } },
      fx: { usdToEur: 0.95, date: '2026-01-01', fetchedAt: '2026-01-01T00:00:00Z' },
    });
    expect(pricing.models['gpt-5.4'].inputMTok).toBe(PRICE_CATALOG['gpt-5.4'].inputMTok);
    expect(pricing.fx.usdToEur).toBe(FX_FALLBACK.usdToEur);
  });

  it('une valeur absurde ou mal typée n’entre pas', () => {
    expect(sanitizePrice({ inputMTok: -1, outputMTok: '3' })).toBeNull();
    expect(sanitizePrice({ inputMTok: 1e9 })).toBeNull();
    expect(sanitizePrice({ inputMTok: 2, pirate: 1 })).toEqual({ inputMTok: 2 });
    const pricing = effectivePricing({ fx: { usdToEur: 42, date: '2027-01-01' } });
    expect(pricing.fx.usdToEur).toBe(FX_FALLBACK.usdToEur);
  });

  it('la provenance affichée est celle du plus ancien relevé des modèles en service', () => {
    const pricing = effectivePricing({
      models: {
        'gpt-5.4': {
          inputMTok: 2,
          outputMTok: 10,
          checkedAt: '2026-10-01T00:00:00Z',
          source: 'litellm',
        },
      },
    });
    expect(pricingProvenance(pricing, ['gpt-5.4', 'gpt-6-luna'])).toMatchObject({
      checkedAt: CATALOG_CHECKED_AT,
      source: 'builtin',
    });
    expect(pricingProvenance(pricing, ['gpt-5.4'])).toMatchObject({ source: 'litellm' });
  });
});

describe('consommation mesurée', () => {
  it('déduit une durée absente du texte transcrit, au débit de l’installation', () => {
    const usage = usageOf([
      meeting({ duration: 3600, chars: 36000 }), // 10 car./s mesurés
      meeting({ duration: null, chars: 18000 }), // → 30 min déduites
      meeting({ duration: null, chars: 0, versions: [] }), // ni durée ni texte
    ]);
    expect(usage.measuredSpeechRate).toBe(true);
    expect(usage.speechCharsPerSecond).toBe(10);
    expect(usage.audioSeconds).toBe(5400);
    expect(usage.inferredDurations).toBe(1);
    expect(usage.unmeasured).toBe(1);
  });

  it('retombe sur le débit de repli sans une heure mesurée', () => {
    expect(speechRateOf([meeting({ duration: 600, chars: 6000 })])).toBeNull();
    expect(usageOf([meeting({ duration: 600, chars: 6000 })]).speechCharsPerSecond).toBe(
      ASSUMPTIONS.speechCharsPerSecond,
    );
  });

  it('date chaque compte rendu à sa génération : une régénération récente compte', () => {
    const usage = usageOf([
      meeting({
        daysAgo: 90,
        chars: 20000,
        versions: [{ generatedAt: ago(90) }, { generatedAt: ago(2) }],
      }),
      meeting({ daysAgo: 3, chars: 10000, versions: [] }), // jamais résumée
      meeting({ daysAgo: 4, chars: 5000, versions: undefined }), // document n8n
    ]);
    // La réunion de juin est hors période, sa régénération d'avant-hier non.
    expect(usage.meetings).toBe(2);
    expect(usage.summaries).toBe(2);
    expect(usage.summaryTranscriptChars).toBe(25000);
  });

  it('compte l’infographie dessinée ou en cours, pas celle en échec', () => {
    const usage = usageOf([
      meeting({ infographic: { status: 'ready', updatedAt: ago(1) } }),
      meeting({ infographic: { status: 'pending', updatedAt: ago(0) } }),
      meeting({ infographic: { status: 'error', updatedAt: ago(1) } }),
      meeting({ daysAgo: 60, infographic: { status: 'ready', updatedAt: ago(60) } }),
    ]);
    expect(usage.infographics).toBe(2);
    expect(usage.infographicSourceChars).toBe(2 * ASSUMPTIONS.infographicSourceMaxChars);
  });

  it('la détection d’actions ne coûte rien à qui l’a coupée', () => {
    const usage = usageOf([meeting({ email: 'muet@client.fr' }), meeting({ email: USER })], {
      detectionOff: new Set(['muet@client.fr']),
    });
    expect(usage.audioSeconds).toBe(7200);
    expect(usage.detectionSeconds).toBe(3600);
  });
});

describe('estimation des dépenses', () => {
  const estimate = (meetings, over = {}) =>
    estimateCosts({
      usage: usageOf(meetings),
      models: MODELS,
      pricing: PRICING,
      spanDays: 30,
      ...over,
    });

  it('chiffre la transcription à la minute d’audio, au taux de change', () => {
    const costs = estimate([meeting({ duration: 3600 })]);
    const transcription = costs.lines.find((line) => line.id === 'transcription');
    expect(transcription.models).toEqual(['gpt-realtime-whisper']);
    expect(transcription.periodEur).toBeCloseTo(0.017 * 60 * FX, 4);
    expect(transcription.unitEur).toBeCloseTo(0.017 * 60 * FX, 4);
  });

  it('mensualise au rythme de la période', () => {
    const costs = estimate([meeting()], { spanDays: 10 });
    expect(costs.monthlyEur).toBeCloseTo((costs.periodEur / 10) * (365.25 / 12), 3);
    expect(costs.lines.reduce((sum, line) => sum + line.share, 0)).toBeCloseTo(1, 3);
  });

  it('coût d’une heure : mesuré sur la période, sinon celui d’une réunion type', () => {
    const measured = estimate([meeting({ duration: 1800 })]);
    expect(measured.perHourBasis).toBe('measured');
    expect(measured.perHourEur).toBeCloseTo(measured.periodEur * 2, 3);

    const empty = estimate([]);
    expect(empty.periodEur).toBe(0);
    expect(empty.perHourBasis).toBe('reference');
    expect(empty.perHourEur).toBeGreaterThan(0.5);
    // Un poste sans activité garde un prix unitaire : la réunion type.
    expect(empty.lines.find((line) => line.id === 'summary').unitEur).toBeGreaterThan(0);
  });

  it('un modèle sans tarif connu sort du total et le dit — jamais zéro en silence', () => {
    const costs = estimate([meeting()], {
      models: { ...MODELS, summary: 'gpt-7-mystere' },
    });
    const summary = costs.lines.find((line) => line.id === 'summary');
    expect(summary.periodEur).toBe(0);
    expect(summary.unpriced).toEqual(['gpt-7-mystere']);
    expect(costs.unpriced).toEqual(['gpt-7-mystere']);
  });

  it('compare chaque modèle proposé, à consommation égale — le modèle imposé en tête', () => {
    const costs = estimate([meeting()], { models: { ...MODELS, summary: 'gpt-5.6-terra' } });
    const { alternatives } = costs.lines.find((line) => line.id === 'summary');
    expect(alternatives.map((alt) => alt.model)).toEqual([
      'gpt-5.6-terra',
      'gpt-5.6-sol',
      'gpt-5.4',
      'gpt-5.4-mini',
    ]);
    expect(alternatives[0].current).toBe(true);
    const mini = alternatives.find((alt) => alt.model === 'gpt-5.4-mini');
    const sol = alternatives.find((alt) => alt.model === 'gpt-5.6-sol');
    expect(mini.monthlyEur).toBeLessThan(sol.monthlyEur);
    // Le tarif public reste en dollars, tel que publié ; les coûts sont en euros.
    expect(mini.tariff).toEqual({ kind: 'text', inputMTok: 0.75, outputMTok: 4.5 });
    expect(costs.lines.find((line) => line.id === 'assistants').alternatives).toEqual([]);
  });

  it('une image tarifée à l’image ne se paie pas au jeton', () => {
    const flat = {
      ...PRICING,
      models: { ...PRICING.models, 'gpt-image-2.5-flare': { kind: 'image', image: 0.2 } },
    };
    const costs = estimate([meeting({ infographic: { status: 'ready', updatedAt: ago(1) } })], {
      pricing: flat,
    });
    const draws = priceDraw({ model: 'x', units: { images: 1 } }, { image: 0.2 });
    expect(draws).toBe(0.2);
    const infographic = costs.lines.find((line) => line.id === 'infographic');
    expect(infographic.unpriced).toEqual([]);
    expect(infographic.alternatives.find((alt) => alt.current).tariff).toMatchObject({
      image: 0.2,
    });
    // Au jeton, le prix d'UNE image se déduit : 5 500 jetons à 30 $ le million.
    expect(
      estimate([]).lines.find((line) => line.id === 'infographic').alternatives[0].tariff,
    ).toMatchObject({ imageOutputMTok: 30, imageUsd: 0.165 });
    expect(infographic.periodEur).toBeGreaterThan(0.2 * FX);
  });

  it('borne la mensualisation à la vie de l’installation', () => {
    expect(
      spanDaysOf({ from: ago(30), to: NOW.toISOString(), firstMeetingAt: ago(10) }),
    ).toBeCloseTo(10, 5);
    expect(spanDaysOf({ from: ago(7), to: NOW.toISOString(), firstMeetingAt: ago(300) })).toBe(7);
    expect(
      spanDaysOf({ from: NOW.toISOString(), to: NOW.toISOString(), firstMeetingAt: null }),
    ).toBe(1);
  });

  it('demande à l’actualisation le catalogue, les modèles en service et ceux proposés', () => {
    const ids = modelsToPrice({ ...MODELS, summary: 'gpt-5.6-terra' }).map((request) => request.id);
    expect(ids).toEqual(
      expect.arrayContaining(['gpt-5.6-terra', 'gpt-transcribe', 'gpt-image-2', 'gpt-6-luna']),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('prix de chaque modèle proposé, pour l’onglet IA', () => {
  it('transcription : une heure d’audio au tarif à la minute, au taux de change', () => {
    const prices = referencePrices('transcription', { models: MODELS, pricing: PRICING });
    expect(prices.map((entry) => entry.model)).toEqual(TRANSCRIPTION_MODELS);
    const cheapest = prices.find((entry) => entry.model === 'gpt-transcribe');
    expect(cheapest.unitEur).toBeCloseTo(0.0045 * 60 * FX, 4);
    // Le tarif public reste en dollars, tel que publié ; le prix est en euros.
    expect(cheapest.tariff).toEqual({ kind: 'audio', audioMinute: 0.0045 });
    expect(prices.filter((entry) => entry.current).map((entry) => entry.model)).toEqual([
      'gpt-realtime-whisper',
    ]);
  });

  it('un modèle sans tarif connu : `null`, jamais un zéro qui passerait pour un prix', () => {
    const { 'gpt-live-transcribe': _absent, ...catalog } = PRICE_CATALOG;
    const prices = referencePrices('transcription', {
      models: MODELS,
      pricing: effectivePricing(null, { catalog }),
    });
    expect(prices.find((entry) => entry.model === 'gpt-live-transcribe')).toMatchObject({
      unitEur: null,
      tariff: null,
    });
  });

  it('vaut pour tout poste qui se choisit : un compte rendu, au jeton', () => {
    const prices = referencePrices('summary', { models: MODELS, pricing: PRICING });
    const priceOf = (id) => prices.find((entry) => entry.model === id).unitEur;
    expect(priceOf('gpt-5.4-mini')).toBeGreaterThan(0);
    expect(priceOf('gpt-5.4-mini')).toBeLessThan(priceOf('gpt-5.6-sol'));
  });

  it('un poste sans choix, ou inconnu, n’a rien à comparer', () => {
    expect(referencePrices('assistants', { models: MODELS, pricing: PRICING })).toEqual([]);
    expect(referencePrices('inconnu', { models: MODELS, pricing: PRICING })).toEqual([]);
  });
});

describe('actualisation des tarifs', () => {
  it('essaie les sources dans l’ordre, pour les seuls modèles encore manquants', async () => {
    const first = {
      id: 'premiere',
      fetchPrices: vi.fn(async () => ({
        'gpt-5.4': { kind: 'text', inputMTok: 3, outputMTok: 18 },
      })),
    };
    const second = {
      id: 'seconde',
      fetchPrices: vi.fn(async (requests) => {
        expect(requests.map((r) => r.id)).toEqual(['modele-rare']);
        return {};
      }),
    };
    const result = await refreshPricing({
      requests: [{ id: 'gpt-5.4' }, { id: 'modele-rare' }],
      sources: {
        prices: [first, second],
        fx: [
          {
            id: 'bce',
            fetchRate: async () => {
              throw new Error('injoignable');
            },
          },
          { id: 'secours', fetchRate: async () => ({ usdToEur: 0.88, date: '2026-09-25' }) },
        ],
      },
      previous: { models: { 'whisper-1': { audioMinute: 0.006 } }, fx: null },
      now: NOW,
    });
    expect(result.updated).toEqual({ prices: 1, fx: true });
    expect(result.missing).toEqual(['modele-rare']);
    expect(result.snapshot.models['gpt-5.4']).toMatchObject({
      inputMTok: 3,
      source: 'premiere',
      checkedAt: NOW.toISOString(),
    });
    // Ce que l'actualisation n'a pas touché garde son relevé précédent.
    expect(result.snapshot.models['whisper-1']).toEqual({ audioMinute: 0.006 });
    expect(result.snapshot.fx).toMatchObject({ usdToEur: 0.88, source: 'secours' });
    expect(result.errors).toEqual([{ source: 'bce', message: 'injoignable' }]);
  });
});

describe('Administration → Statistiques : dépenses d’IA', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const seed = (over = {}) => ({
    user: [userDoc(ADMIN, { role: 'admin' }), userDoc(USER)],
    resume: [
      meeting({ daysAgo: 1, infographic: { status: 'ready', updatedAt: ago(1) } }),
      meeting({ daysAgo: 2, duration: 1800, chars: 25000 }),
    ],
    ...over,
  });
  const getStats = (app) =>
    app.inject({ method: 'GET', url: '/api/admin/stats?days=30', headers: identityHeaders(ADMIN) });
  const refresh = (app, email = ADMIN) =>
    app.inject({
      method: 'POST',
      url: '/api/admin/stats/prices/refresh',
      headers: identityHeaders(email),
    });

  it('joint aux statistiques l’estimation, avec les modèles en service', async () => {
    const { app } = buildTestApp({ seed: seed() });
    const body = (await getStats(app)).json();
    expect(body.costs.currency).toBe('EUR');
    expect(body.costs.lines.map((line) => line.id)).toEqual([
      'transcription',
      'summary',
      'infographic',
      'assistants',
    ]);
    expect(body.costs.usage).toMatchObject({ meetings: 2, summaries: 2, infographics: 1 });
    expect(body.costs.periodEur).toBeGreaterThan(0);
    expect(body.costs.pricing).toMatchObject({ source: 'builtin', refreshedAt: null });
  });

  it('suit le modèle choisi dans Administration → IA', async () => {
    const { app } = buildTestApp({
      seed: seed({ appSettings: [{ key: 'ai', transcriptionModel: 'gpt-transcribe' }] }),
    });
    const transcription = (await getStats(app))
      .json()
      .costs.lines.find((line) => line.id === 'transcription');
    expect(transcription.models).toEqual(['gpt-transcribe']);
    expect(transcription.unitEur).toBeCloseTo(0.0045 * 60 * FX, 4);
  });

  it('un modèle retiré, encore enregistré, est chiffré au prix de son remplaçant', async () => {
    const { app } = buildTestApp({
      seed: seed({ appSettings: [{ key: 'ai', transcriptionModel: 'gpt-4o-mini-transcribe' }] }),
    });
    const transcription = (await getStats(app))
      .json()
      .costs.lines.find((line) => line.id === 'transcription');
    expect(transcription.models).toEqual(['gpt-transcribe']);
    expect(transcription.unitEur).toBeCloseTo(0.0045 * 60 * FX, 4);
  });

  it('lit la date des versions et l’état de l’image, jamais leur contenu', async () => {
    const { app, db } = buildTestApp({
      seed: seed({
        resume: [
          meeting({
            versions: [{ generatedAt: ago(1), html: '<p>secret</p>', customPrompt: 'secret' }],
          }),
        ],
      }),
    });
    await getStats(app);
    const scan = db.calls.find((c) => c.op === 'find' && c.collection === 'resume');
    expect(scan.project['versions.generatedAt']).toBe(1);
    expect(scan.project.versions).toBeUndefined();
    expect(
      Object.keys(scan.project).some((k) => /html|Prompt|transcription$|^resume$/.test(k)),
    ).toBe(false);
    // Le faux Mongo projette comme le vrai : la version ne garde que sa date.
    const [doc] = await db.collection('resume').find({}).project(scan.project).toArray();
    expect(doc.versions).toEqual([{ generatedAt: ago(1) }]);
  });

  it('une estimation en échec ne coûte que sa carte', async () => {
    const { app } = buildTestApp({ seed: seed() });
    app.pricing.get = async () => {
      throw new Error('base indisponible');
    };
    const res = await getStats(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().costs).toBeNull();
    expect(res.json().totals.meetingsInRange).toBe(2);
  });

  it('actualiser les tarifs : réservé aux administrateurs', async () => {
    const { app, priceSources } = buildTestApp({ seed: seed() });
    expect((await refresh(app, USER)).statusCode).toBe(403);
    expect(priceSources.calls).toEqual([]);
  });

  it('actualiser les tarifs : enregistre le relevé, que les statistiques appliquent', async () => {
    const { app, db, priceSources } = buildTestApp({
      seed: seed(),
      priceSources: createFakePriceSources({
        prices: { 'gpt-realtime-whisper': { kind: 'audio', audioMinute: 0.02 } },
        fx: { usdToEur: 0.9, date: '2026-09-24' },
      }),
    });
    const res = await refresh(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toEqual({ prices: 1, fx: true });
    expect(res.json().missing).toContain('gpt-5.4');
    // Tous les modèles utiles sont demandés, le catalogue compris.
    const asked = priceSources.calls.find((c) => c.source === 'prices').requests;
    expect(asked.map((r) => r.id)).toEqual(expect.arrayContaining(['gpt-5.4', 'gpt-transcribe']));

    const stored = db.data.get('appSettings').find((doc) => doc.key === 'pricing');
    expect(stored).toMatchObject({ refreshedBy: ADMIN });
    expect(stored.models['gpt-realtime-whisper']).toMatchObject({ audioMinute: 0.02 });

    const costs = (await getStats(app)).json().costs;
    const transcription = costs.lines.find((line) => line.id === 'transcription');
    expect(transcription.unitEur).toBeCloseTo(0.02 * 60 * 0.9, 4);
    expect(costs.pricing.fx).toMatchObject({ usdToEur: 0.9, source: 'fake-fx' });
  });

  it('actualiser les tarifs : sources injoignables → 502, le dernier relevé reste', async () => {
    const { app, db } = buildTestApp({ seed: seed() });
    const res = await refresh(app);
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'prices_unreachable' });
    expect((db.data.get('appSettings') || []).find((doc) => doc.key === 'pricing')).toBeUndefined();
  });

  it('actualiser les tarifs : deux clics simultanés, un seul relevé', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const { app, priceSources } = buildTestApp({
      seed: seed(),
      priceSources: createFakePriceSources({
        prices: async () => {
          await gate;
          return { 'gpt-5.4': { kind: 'text', inputMTok: 2, outputMTok: 12 } };
        },
        fx: { usdToEur: 0.9, date: '2026-09-24' },
      }),
    });
    const both = Promise.all([refresh(app), refresh(app)]);
    await vi.waitFor(() => expect(priceSources.calls.length).toBeGreaterThan(0));
    release();
    const [a, b] = await both;
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(priceSources.calls.filter((c) => c.source === 'prices')).toHaveLength(1);
  });
});
