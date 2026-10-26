/**
 * Estimation des dépenses d'IA — fonction PURE : volumes mesurés × tarifs.
 *
 * Le calcul est une nomenclature. Chaque POSTE (transcription, comptes rendus,
 * infographies, assistants) décrit ce qu'il consomme sous forme de TIRAGES —
 * « tant de minutes d'audio sur tel modèle », « tant de jetons en entrée et en
 * sortie sur tel autre » —, et chaque tirage se chiffre en multipliant ses
 * quantités par les prix unitaires du modèle (METERS). Rien d'autre ne connaît
 * les compteurs de facturation.
 *
 * C'est ce qui rend l'écran malléable :
 *   - un modèle de plus : un tarif dans catalog.js, rien ici ;
 *   - une API de plus (autre fournisseur, autre usage) : un poste de plus dans
 *     COST_LINES, qui dit ce qu'il tire et sur quel modèle ;
 *   - une facturation d'un genre nouveau (à la requête, au caractère…) : un
 *     compteur de plus dans METERS, et le champ de prix qui va avec.
 *
 * Un modèle SANS tarif connu n'est jamais compté pour zéro : son tirage sort
 * du total et le poste le signale (`unpriced`) — « tarif inconnu » plutôt
 * qu'une dépense nulle qui passerait pour une mesure.
 *
 * Mensualisation : la dépense de la période, ramenée à un mois moyen
 * (365,25 / 12 jours) au rythme de cette période. Une installation plus jeune
 * que la période se mensualise sur sa durée de vie réelle, pas sur des jours
 * où elle n'existait pas.
 */
import { TRANSCRIPTION_MODELS, resolveTranscriptionModel } from '../transcriptionModels.js';
import { SUMMARY_MODELS, resolveSummaryModel } from '../summaryModels.js';
import { INFOGRAPHIC_IMAGE_MODELS, resolveInfographicImageModel } from '../infographicModels.js';
import { ASSUMPTIONS } from './assumptions.js';
import { PRICE_CATALOG } from './catalog.js';
import { publicTariff } from './pricing.js';

export const DAYS_PER_MONTH = 365.25 / 12;
const DAY_MS = 86_400_000;

/**
 * Compteurs de facturation : l'unité consommée → le champ de prix qui la
 * chiffre, et le diviseur de ce prix (les tarifs au jeton sont au million).
 */
export const METERS = {
  audioMinutes: { price: 'audioMinute', per: 1 },
  inputTokens: { price: 'inputMTok', per: 1e6 },
  outputTokens: { price: 'outputMTok', per: 1e6 },
  imageTokens: { price: 'imageOutputMTok', per: 1e6 },
  images: { price: 'image', per: 1 },
};

const tokens = (chars, a) => chars / a.charsPerToken;

/**
 * Une image se paie à l'image quand le fournisseur publie ce prix-là (le
 * prompt est alors compris), sinon au jeton dessiné + au jeton de prompt lu.
 */
function imageUnits(price, count, a) {
  if (Number.isFinite(price?.image)) return { images: count };
  return {
    imageTokens: count * (price?.imageTokens || a.imageTokensFallback),
    inputTokens: tokens(count * a.infographicPromptChars, a),
  };
}

/**
 * Les postes, dans l'ordre d'affichage.
 *   - `choice`  : le modèle que l'administration choisit pour ce poste (onglet
 *                 IA) — le poste se compare alors modèle par modèle ; `null`
 *                 quand ses modèles sont fixés par la configuration du serveur ;
 *   - `options` : les modèles que l'écran IA propose à ce choix ;
 *   - `unit`    : ce que vaut « une unité » du poste, pour l'écran ;
 *   - `count`   : combien d'unités la consommation en compte ;
 *   - `draws`   : ce que le poste consomme, modèle par modèle.
 */
export const COST_LINES = [
  {
    id: 'transcription',
    choice: 'transcription',
    options: TRANSCRIPTION_MODELS,
    unit: 'hour',
    count: (usage) => usage.audioSeconds / 3600,
    draws: (usage, models) => [
      { model: models.transcription, units: { audioMinutes: usage.audioSeconds / 60 } },
    ],
  },
  {
    id: 'summary',
    choice: 'summary',
    options: SUMMARY_MODELS,
    unit: 'summary',
    count: (usage) => usage.summaries,
    draws: (usage, models, { assumptions: a }) => [
      {
        model: models.summary,
        units: {
          inputTokens: tokens(
            usage.summaryTranscriptChars + usage.summaries * a.summaryPromptChars,
            a,
          ),
          outputTokens: usage.summaries * a.summaryOutputTokens,
        },
      },
    ],
  },
  {
    id: 'infographic',
    choice: 'infographicImage',
    options: INFOGRAPHIC_IMAGE_MODELS,
    unit: 'infographic',
    count: (usage) => usage.infographics,
    draws: (usage, models, { assumptions: a, priceOf }) => [
      // Un modèle de texte conçoit la maquette…
      {
        model: models.infographicWriter,
        units: {
          inputTokens: tokens(
            usage.infographicSourceChars + usage.infographics * a.infographicRulesChars,
            a,
          ),
          outputTokens: usage.infographics * a.infographicWriterOutputTokens,
        },
      },
      // … le modèle d'image la dessine.
      {
        model: models.infographicImage,
        units: imageUnits(priceOf(models.infographicImage), usage.infographics, a),
      },
    ],
  },
  {
    id: 'assistants',
    choice: null,
    options: [],
    unit: 'hour',
    count: (usage) => usage.audioSeconds / 3600,
    draws: (usage, models, { assumptions: a }) => {
      const calls = (usage.detectionSeconds / 3600) * a.detectionCallsPerHour;
      return [
        // Détection d'actions, en continu pendant la réunion.
        {
          model: models.actions,
          units: {
            inputTokens: tokens(calls * a.detectionPromptChars, a),
            outputTokens: calls * a.detectionOutputTokens,
          },
        },
        // Titre, à chaque compte rendu : il relit le compte rendu ET la transcription.
        {
          model: models.title,
          units: {
            inputTokens: tokens(
              usage.summaryTranscriptChars + usage.summaries * a.titlePromptChars,
              a,
            ),
            outputTokens: usage.summaries * a.titleOutputTokens,
          },
        },
      ];
    },
  },
];

/**
 * Modèles en service, résolus comme les routes qui les appellent :
 * administration, sinon environnement, sinon défaut intégré.
 *
 * @param {object} aiDoc - document `ai` (app.settings.getAi())
 * @param {object} envModels - config.openai.models
 */
export function activeModels(aiDoc = {}, envModels = {}) {
  return {
    transcription: resolveTranscriptionModel(aiDoc.transcriptionModel, envModels.transcription),
    summary: resolveSummaryModel(aiDoc.summaryModel, envModels.summary),
    infographicImage: resolveInfographicImageModel(
      aiDoc.infographicImageModel,
      envModels.infographicImage,
    ),
    infographicWriter: envModels.infographic,
    title: envModels.title,
    actions: envModels.actions,
  };
}

/**
 * Tous les modèles qu'une actualisation doit tarifer : le catalogue, ceux en
 * service (un modèle imposé par l'environnement peut n'être dans aucune liste)
 * et ceux que l'écran IA propose.
 *
 * @param {ReturnType<typeof activeModels>} models
 * @returns {Array<{id: string, provider: string}>}
 */
export function modelsToPrice(models) {
  const ids = new Set([
    ...Object.keys(PRICE_CATALOG),
    ...Object.values(models).filter(Boolean),
    ...COST_LINES.flatMap((line) => line.options),
  ]);
  return [...ids].map((id) => ({ id, provider: PRICE_CATALOG[id]?.provider || 'openai' }));
}

/**
 * Durée, en jours, sur laquelle mensualiser : la période, bornée par la
 * première réunion de l'installation. Un jour au moins.
 *
 * @param {{from: string, to: string, firstMeetingAt?: string|null}} range - celui de computeUsageStats
 */
export function spanDaysOf({ from, to, firstMeetingAt }) {
  const start = Math.max(Date.parse(from), firstMeetingAt ? Date.parse(firstMeetingAt) : -Infinity);
  return Math.max(1, (Date.parse(to) - start) / DAY_MS);
}

/**
 * Coût d'un tirage, en dollars — `null` si une quantité consommée n'a pas de
 * prix connu pour ce modèle.
 */
export function priceDraw(draw, price) {
  let usd = 0;
  for (const [meter, quantity] of Object.entries(draw.units)) {
    if (!quantity) continue;
    const rate = price?.[METERS[meter].price];
    if (!Number.isFinite(rate)) return null;
    usd += (quantity * rate) / METERS[meter].per;
  }
  return usd;
}

/**
 * Coût d'un poste, en euros, pour une consommation et des modèles donnés. Les
 * tirages sans tarif connu sortent du total et sont nommés (`unpriced`).
 */
function lineCost(line, consumption, lineModels, { pricing, assumptions }) {
  const priceOf = (id) => pricing.models[id] || null;
  let usd = 0;
  const unpriced = new Set();
  for (const draw of line.draws(consumption, lineModels, { assumptions, priceOf })) {
    const cost = priceDraw(draw, priceOf(draw.model));
    if (cost === null) unpriced.add(draw.model);
    else usd += cost;
  }
  return { eur: usd * pricing.fx.usdToEur, unpriced: [...unpriced] };
}

/** Consommation d'UNE réunion type d'une heure, résumée une fois et illustrée une fois. */
function referenceUsage(speechCharsPerSecond, a) {
  const text = 3600 * speechCharsPerSecond;
  return {
    meetings: 1,
    audioSeconds: 3600,
    detectionSeconds: 3600,
    summaries: 1,
    summaryTranscriptChars: text,
    infographics: 1,
    infographicSourceChars: Math.min(text, a.infographicSourceMaxChars),
  };
}

const round = (value) => Math.round(value * 1e4) / 1e4;

/**
 * @param {object} input
 * @param {ReturnType<import('./usage.js').measureUsage>} input.usage
 * @param {ReturnType<typeof activeModels>} input.models
 * @param {ReturnType<import('./pricing.js').effectivePricing>} input.pricing
 * @param {number} input.spanDays - cf. spanDaysOf
 * @param {object} [input.assumptions]
 */
export function estimateCosts({ usage, models, pricing, spanDays, assumptions = ASSUMPTIONS }) {
  const priceOf = (id) => pricing.models[id] || null;
  const context = { assumptions, priceOf };
  const reference = referenceUsage(usage.speechCharsPerSecond, assumptions);
  const monthly = (eur) => (eur / spanDays) * DAYS_PER_MONTH;

  const costOf = (line, consumption, lineModels) =>
    lineCost(line, consumption, lineModels, { pricing, assumptions });

  // Coût d'UNE unité du poste : la moyenne de la période quand elle en compte,
  // sinon celle de la réunion type — un poste sans activité garde un prix.
  const evaluate = (line, lineModels) => {
    const period = costOf(line, usage, lineModels);
    const count = line.count(usage);
    const unitEur =
      count > 0
        ? period.eur / count
        : costOf(line, reference, lineModels).eur / line.count(reference);
    return {
      periodEur: round(period.eur),
      monthlyEur: round(monthly(period.eur)),
      unitEur: round(unitEur),
      unpriced: period.unpriced,
    };
  };

  const lines = COST_LINES.map((line) => ({
    id: line.id,
    unit: line.unit,
    count: round(line.count(usage)),
    models: [...new Set(line.draws(usage, models, context).map((draw) => draw.model))],
    ...evaluate(line, models),
    alternatives: line.choice
      ? alternativesOf(line, models, evaluate, (id) => publicTariff(priceOf(id)))
      : [],
  }));

  const periodEur = lines.reduce((sum, line) => sum + line.periodEur, 0);
  const hours = usage.audioSeconds / 3600;
  // Réunion type SANS infographie : elle est facultative, et la compter
  // gonflerait « une heure de myBrief » d'une image que la plupart ne demandent pas.
  const referenceHourEur = COST_LINES.filter((line) => line.id !== 'infographic').reduce(
    (sum, line) => sum + costOf(line, reference, models).eur,
    0,
  );

  return {
    currency: 'EUR',
    spanDays: round(spanDays),
    periodEur: round(periodEur),
    monthlyEur: round(monthly(periodEur)),
    perHourEur: round(hours > 0 ? periodEur / hours : referenceHourEur),
    perHourBasis: hours > 0 ? 'measured' : 'reference',
    perMeetingEur: usage.meetings > 0 ? round(periodEur / usage.meetings) : null,
    usage: {
      meetings: usage.meetings,
      audioSeconds: Math.round(usage.audioSeconds),
      summaries: usage.summaries,
      infographics: usage.infographics,
      inferredDurations: usage.inferredDurations,
      unmeasured: usage.unmeasured,
    },
    lines: lines.map((line) => ({
      ...line,
      share: periodEur > 0 ? round(line.periodEur / periodEur) : 0,
    })),
    unpriced: [...new Set(lines.flatMap((line) => line.unpriced))],
    // Ce que l'écran affiche sous « Hypothèses de calcul » : les valeurs
    // viennent d'ici, les phrases de uiText.js.
    assumptions: {
      charsPerToken: assumptions.charsPerToken,
      speechCharsPerSecond: round(usage.speechCharsPerSecond),
      measuredSpeechRate: usage.measuredSpeechRate,
      summaryOutputTokens: assumptions.summaryOutputTokens,
      detectionCallsPerHour: assumptions.detectionCallsPerHour,
      imageTokens: priceOf(models.infographicImage)?.imageTokens || assumptions.imageTokensFallback,
    },
  };
}

/**
 * Les modèles proposés à un choix : la liste de l'écran IA, précédée du modèle
 * en service s'il n'y figure pas (imposé par l'environnement) — c'est lui qui
 * tourne.
 */
function choicesOf(line, models) {
  const current = models[line.choice];
  return line.options.includes(current) ? line.options : [current, ...line.options];
}

/**
 * Le même poste, chiffré avec chacun des modèles proposés — la même
 * consommation, seul le modèle change.
 */
function alternativesOf(line, models, evaluate, tariffOf) {
  const current = models[line.choice];
  return choicesOf(line, models).map((id) => {
    const { periodEur, monthlyEur, unitEur, unpriced } = evaluate(line, {
      ...models,
      [line.choice]: id,
    });
    return {
      model: id,
      current: id === current,
      priced: !unpriced.length,
      tariff: tariffOf(id),
      periodEur,
      monthlyEur,
      unitEur,
    };
  });
}

/**
 * Prix d'UNE unité du poste — une heure de transcription, un compte rendu, une
 * infographie — avec chacun des modèles proposés, sur la réunion type : ce que
 * l'onglet IA affiche à côté de chaque choix, sans lire une seule réunion.
 *
 * Pour la transcription, facturée à la minute d'audio, c'est le prix exact ;
 * pour les postes facturés au jeton, une estimation sur les hypothèses de
 * assumptions.js, les mêmes que l'écran Statistiques. Un modèle sans tarif
 * connu rend `unitEur: null` : jamais un zéro qui passerait pour une mesure.
 *
 * @param {string} lineId - un poste de COST_LINES qui se choisit (`choice`)
 * @param {object} input
 * @param {ReturnType<typeof activeModels>} input.models
 * @param {ReturnType<import('./pricing.js').effectivePricing>} input.pricing
 * @param {object} [input.assumptions]
 * @returns {Array<{model: string, current: boolean, unitEur: number|null, tariff: object|null}>}
 */
export function referencePrices(lineId, { models, pricing, assumptions = ASSUMPTIONS }) {
  const line = COST_LINES.find((candidate) => candidate.id === lineId && candidate.choice);
  if (!line) return [];
  const reference = referenceUsage(assumptions.speechCharsPerSecond, assumptions);
  const current = models[line.choice];
  return choicesOf(line, models)
    .filter(Boolean)
    .map((id) => {
      const cost = lineCost(
        line,
        reference,
        { ...models, [line.choice]: id },
        { pricing, assumptions },
      );
      return {
        model: id,
        current: id === current,
        unitEur: cost.unpriced.length ? null : round(cost.eur / line.count(reference)),
        tariff: publicTariff(pricing.models[id] || null),
      };
    });
}
