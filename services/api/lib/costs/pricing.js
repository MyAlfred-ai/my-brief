/**
 * Tarifs APPLIQUÉS : le relevé livré avec l'application, recouvert par la
 * dernière actualisation — fonctions PURES.
 *
 * La règle de fusion tient en une ligne : modèle par modèle, LE RELEVÉ LE PLUS
 * RÉCENT GAGNE. Une actualisation d'hier l'emporte sur le catalogue intégré ;
 * une version de l'application livrée demain avec un catalogue plus frais
 * l'emporte sur une actualisation d'hier, sans que personne n'ait à cliquer.
 * Un modèle que l'actualisation n'a pas trouvé garde son dernier tarif connu.
 *
 * Ce qui vient d'une source en ligne est une donnée EXTERNE : rien n'entre sans
 * passer par `sanitizePrice` / `sanitizeFx` — un champ inconnu est ignoré, un
 * prix négatif, non numérique ou absurde est écarté, un taux de change hors
 * de toute plausibilité aussi. Le pire que puisse faire une grille corrompue
 * est de ne rien actualiser.
 */
import {
  CATALOG_CHECKED_AT,
  FX_FALLBACK,
  MODEL_KINDS,
  PRICE_CATALOG,
  PRICE_FIELDS,
} from './catalog.js';

/** Au-delà, un tarif unitaire est une donnée cassée : 10 000 $ la minute ou le million de jetons. */
const PRICE_CEILING = 10_000;
/** Bornes d'un taux dollar → euro plausible. */
const FX_RANGE = { min: 0.3, max: 3 };

const isPrice = (value) => typeof value === 'number' && value >= 0 && value < PRICE_CEILING;

function timeOf(value) {
  const time = Date.parse(value || '');
  return Number.isNaN(time) ? null : time;
}

/**
 * Tarif propre, ou `null` s'il ne porte aucun prix exploitable.
 * @param {object} raw
 */
export function sanitizePrice(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const price = {};
  for (const field of PRICE_FIELDS) {
    if (isPrice(raw[field])) price[field] = raw[field];
  }
  if (!Object.keys(price).length) return null;
  if (MODEL_KINDS.includes(raw.kind)) price.kind = raw.kind;
  if (typeof raw.provider === 'string' && raw.provider) price.provider = raw.provider.slice(0, 40);
  if (typeof raw.source === 'string' && raw.source) price.source = raw.source.slice(0, 40);
  if (timeOf(raw.checkedAt) !== null) price.checkedAt = raw.checkedAt;
  return price;
}

/**
 * Taux de change propre, ou `null`.
 * @param {object} raw - `{usdToEur, date, fetchedAt?, source?}`
 */
export function sanitizeFx(raw) {
  const rate = Number(raw?.usdToEur);
  if (!Number.isFinite(rate) || rate < FX_RANGE.min || rate > FX_RANGE.max) return null;
  if (timeOf(raw.date) === null) return null;
  return {
    usdToEur: rate,
    date: String(raw.date).slice(0, 40),
    ...(timeOf(raw.fetchedAt) !== null ? { fetchedAt: raw.fetchedAt } : {}),
    source: typeof raw.source === 'string' && raw.source ? raw.source.slice(0, 40) : 'unknown',
  };
}

/** `a` est-il au moins aussi récent que `b` ? Une date illisible perd toujours. */
function atLeastAsRecent(a, b) {
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta === null) return false;
  return tb === null || ta >= tb;
}

/**
 * @param {object|null} stored - document `appSettings{key:'pricing'}` (repositories/pricing.js)
 * @param {object} [catalog]
 * @returns {{models: Object<string, object>, fx: object, refreshedAt: string|null,
 *            refreshedBy: string|null}}
 */
export function effectivePricing(
  stored,
  { catalog = PRICE_CATALOG, checkedAt = CATALOG_CHECKED_AT, fxFallback = FX_FALLBACK } = {},
) {
  const models = {};
  for (const [id, entry] of Object.entries(catalog)) {
    models[id] = { ...entry, checkedAt, source: 'builtin' };
  }
  for (const [id, raw] of Object.entries(stored?.models || {})) {
    const fresh = sanitizePrice(raw);
    if (!fresh) continue;
    const known = models[id];
    if (known && !atLeastAsRecent(fresh.checkedAt, known.checkedAt)) continue;
    // Les caractéristiques du catalogue (jetons par image) survivent au relevé.
    models[id] = { ...(known || {}), ...fresh };
  }

  // Comparé à la date où le taux a été RELEVÉ, pas à celle qu'il porte : la BCE
  // publie la veille ouvrée, et un clic sur « Actualiser » doit se voir.
  const storedFx = sanitizeFx(stored?.fx);
  const fx =
    storedFx && atLeastAsRecent(storedFx.fetchedAt || storedFx.date, fxFallback.date)
      ? storedFx
      : { ...fxFallback };

  return {
    models,
    fx,
    refreshedAt: stored?.refreshedAt || null,
    refreshedBy: stored?.refreshedBy || null,
  };
}

/**
 * Provenance des tarifs appliqués aux modèles EN SERVICE, pour l'écran : la
 * date du plus ancien de leurs relevés (c'est elle qui dit « à rafraîchir »),
 * et sa source.
 *
 * @param {ReturnType<typeof effectivePricing>} pricing
 * @param {string[]} modelIds - modèles de l'estimation
 */
export function pricingProvenance(pricing, modelIds) {
  const entries = [...new Set(modelIds)].map((id) => pricing.models[id]).filter(Boolean);
  const oldest = entries.reduce(
    (best, entry) => (!best || !atLeastAsRecent(entry.checkedAt, best.checkedAt) ? entry : best),
    null,
  );
  return {
    checkedAt: oldest?.checkedAt || null,
    source: oldest?.source || null,
    refreshedAt: pricing.refreshedAt,
    refreshedBy: pricing.refreshedBy,
    fx: {
      usdToEur: pricing.fx.usdToEur,
      date: pricing.fx.date,
      source: pricing.fx.source,
    },
  };
}

/**
 * Tarif PUBLIC d'un modèle, pour le tableau de comparaison : en DOLLARS, tel
 * que le fournisseur l'affiche — l'administrateur peut le rapprocher de la
 * page de tarifs d'OpenAI sans refaire la conversion, et « 0,017 $ la
 * minute » ne devient pas « 0,015 € » arrondi. Les coûts, eux, sont en euros.
 * `imageUsd` dit ce que coûte UNE image facturée au jeton, là où le
 * fournisseur ne publie pas de prix à l'image.
 *
 * @param {object|null} price - tarif en dollars (effectivePricing().models[id])
 */
export function publicTariff(price) {
  if (!price) return null;
  const tariff = { kind: price.kind || null };
  for (const field of PRICE_FIELDS) {
    if (isPrice(price[field])) tariff[field] = price[field];
  }
  if (tariff.image === undefined && isPrice(price.imageOutputMTok) && price.imageTokens > 0) {
    tariff.imageUsd = Number(((price.imageTokens * price.imageOutputMTok) / 1e6).toPrecision(6));
  }
  return tariff;
}
