/**
 * Modèles retirés par OpenAI (lib/retiredModels.js).
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - aucun DÉFAUT du code, aucune liste de l'écran ne vise un modèle dont
 *     OpenAI a annoncé la coupure ;
 *   - une variable OPENAI_MODEL_* restée sur un modèle retiré est vidée par
 *     `loadConfig` : l'usage retombe sur son défaut au lieu d'échouer le jour
 *     de la coupure — en silence pour le titre ;
 *   - ce qui a été ignoré est rendu à server.js, qui le journalise.
 */
import { describe, it, expect } from 'vitest';
import {
  MODEL_VARIABLES,
  OPENAI_RETIREMENTS,
  retirementDate,
  screenModelVariables,
} from '../lib/retiredModels.js';
import { loadConfig } from '../lib/config.js';
import { DEFAULT_SUMMARY_MODEL, SUMMARY_MODELS } from '../lib/summaryModels.js';
import {
  DEFAULT_INFOGRAPHIC_IMAGE_MODEL,
  INFOGRAPHIC_IMAGE_MODELS,
  RETIRED_INFOGRAPHIC_IMAGE_MODELS,
} from '../lib/infographicModels.js';
import { toPublicAiSettings } from '../lib/repositories/settings.js';

/** Le courriel d'OpenAI du 2026-11-12, alias et instantanés datés. */
const DECEMBER_2026 = [
  'gpt-5',
  'gpt-5-2025-08-07',
  'gpt-5-mini',
  'gpt-5-mini-2025-08-07',
  'gpt-5-nano',
  'gpt-5-nano-2025-08-07',
  'gpt-5-pro',
  'gpt-5-pro-2025-10-06',
  'o3',
  'o3-2025-04-16',
  'o3-pro',
  'o3-pro-2025-06-10',
];

describe('calendrier des retraits', () => {
  it('GPT-5 (mini, nano, pro) et o3 (pro) sont coupés le 2026-12-11', () => {
    for (const model of DECEMBER_2026) expect(retirementDate(model)).toBe('2026-12-11');
  });

  it('un modèle affiné suit son modèle de base', () => {
    expect(retirementDate('ft:gpt-5-mini-2025-08-07:mon-org::abc123')).toBe('2026-12-11');
    expect(retirementDate('ft:gpt-6-luna:mon-org::abc123')).toBeNull();
  });

  it('la génération suivante, et ce qui y ressemble, ne sont pas retirés', () => {
    for (const model of ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-luna']) {
      expect(retirementDate(model)).toBeNull();
    }
    expect(retirementDate('')).toBeNull();
    expect(retirementDate(undefined)).toBeNull();
  });

  it('un modèle n’apparaît que sous une seule date', () => {
    const all = OPENAI_RETIREMENTS.flatMap(({ models }) => models);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('les choix du code', () => {
  it('aucun défaut d’usage ne vise un modèle retiré', () => {
    const { models } = loadConfig({}).openai;
    for (const [usage, model] of Object.entries(models)) {
      expect({ usage, shutdown: retirementDate(model) }).toEqual({ usage, shutdown: null });
    }
    expect(retirementDate(DEFAULT_SUMMARY_MODEL)).toBeNull();
    expect(retirementDate(DEFAULT_INFOGRAPHIC_IMAGE_MODEL)).toBeNull();
  });

  it('l’écran ne propose aucun modèle retiré', () => {
    expect(SUMMARY_MODELS.filter(retirementDate)).toEqual([]);
    expect(INFOGRAPHIC_IMAGE_MODELS.filter(retirementDate)).toEqual([]);
    // Et chaque remplaçant d'un choix retiré est lui-même un modèle proposé.
    for (const [from, to] of Object.entries(RETIRED_INFOGRAPHIC_IMAGE_MODELS)) {
      expect(retirementDate(from)).not.toBeNull();
      expect(INFOGRAPHIC_IMAGE_MODELS).toContain(to);
    }
  });
});

describe('variables OPENAI_MODEL_* du déploiement', () => {
  it('une variable sur un modèle retiré est vidée : l’usage prend son défaut', () => {
    const { openai } = loadConfig({
      OPENAI_MODEL_SUMMARY: 'o3-pro',
      OPENAI_MODEL_TITLE: ' gpt-5-nano ',
      OPENAI_MODEL_ACTIONS: 'gpt-5-mini',
      OPENAI_MODEL_REFINE: 'gpt-4o-mini',
      OPENAI_MODEL_INFOGRAPHIC: 'gpt-5',
      OPENAI_MODEL_INFOGRAPHIC_IMAGE: 'gpt-image-1.5',
    });
    expect(openai.models).toMatchObject({
      summary: '',
      title: 'gpt-6-luna',
      actions: 'gpt-6-luna',
      refine: 'gpt-6-luna',
      infographic: 'gpt-6-luna',
      infographicImage: '',
    });
    expect(openai.ignoredModelVariables).toEqual([
      { variable: 'OPENAI_MODEL_SUMMARY', model: 'o3-pro', shutdown: '2026-12-11' },
      { variable: 'OPENAI_MODEL_TITLE', model: 'gpt-5-nano', shutdown: '2026-12-11' },
      { variable: 'OPENAI_MODEL_ACTIONS', model: 'gpt-5-mini', shutdown: '2026-12-11' },
      { variable: 'OPENAI_MODEL_REFINE', model: 'gpt-4o-mini', shutdown: '2027-01-14' },
      { variable: 'OPENAI_MODEL_INFOGRAPHIC', model: 'gpt-5', shutdown: '2026-12-11' },
      {
        variable: 'OPENAI_MODEL_INFOGRAPHIC_IMAGE',
        model: 'gpt-image-1.5',
        shutdown: '2026-12-01',
      },
    ]);
  });

  it('un modèle non retiré, même hors liste, reste la porte de sortie', () => {
    const { openai } = loadConfig({
      OPENAI_MODEL_SUMMARY: 'gpt-5.6-terra',
      OPENAI_MODEL_ACTIONS: 'gpt-5.4-mini',
      OPENAI_MODEL_INFOGRAPHIC_IMAGE: 'gpt-image-2.5-sunburst',
    });
    expect(openai.models).toMatchObject({
      summary: 'gpt-5.6-terra',
      actions: 'gpt-5.4-mini',
      infographicImage: 'gpt-image-2.5-sunburst',
    });
    expect(openai.ignoredModelVariables).toEqual([]);
  });

  it('OPENAI_MODEL_TRANSCRIPTION n’est pas concernée : sa propre table la traduit', () => {
    expect(MODEL_VARIABLES).not.toContain('OPENAI_MODEL_TRANSCRIPTION');
    expect(
      loadConfig({ OPENAI_MODEL_TRANSCRIPTION: 'whisper-1' }).openai.models.transcription,
    ).toBe('whisper-1');
  });

  it('la rubrique Modèles IA voit le défaut, pas un modèle retiré « imposé par le déploiement »', () => {
    const { openai } = loadConfig({ OPENAI_MODEL_SUMMARY: 'gpt-5' });
    const view = toPublicAiSettings(null, { envSummaryModel: openai.models.summary });
    expect(view).toMatchObject({
      summaryModel: DEFAULT_SUMMARY_MODEL,
      summaryModelSource: 'default',
      summaryModelOffList: false,
    });
  });

  it('screenModelVariables ne lit que ses six variables', () => {
    const { values, ignored } = screenModelVariables({ OPENAI_API_KEY: 'gpt-5', OTHER: 'o3' });
    expect(Object.keys(values)).toEqual(MODEL_VARIABLES);
    expect(ignored).toEqual([]);
  });
});
