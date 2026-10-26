/**
 * Source de TARIFS : la base publique de LiteLLM.
 *
 * Pourquoi elle, et pas la page de tarifs d'OpenAI : OpenAI ne publie ses prix
 * que sous forme de page web, sans API — la lire reviendrait à gratter du HTML
 * qui change de mise en page sans prévenir. LiteLLM tient à jour, en un seul
 * fichier JSON public, les grilles de centaines de modèles et de fournisseurs
 * (OpenAI, Azure, Mistral, Anthropic…), chaque entrée pointant vers sa page
 * d'origine ; les modèles d'OpenAI y apparaissent en général le jour de leur
 * sortie (les paliers gpt-5.6 et gpt-image-2.5 y étaient au 2026-09-25). Un
 * fournisseur ajouté demain à myBrief y est très probablement déjà.
 *
 * Le fichier pèse ~3 Mo : il n'est lu qu'au clic sur « Actualiser les tarifs »,
 * jamais à l'affichage des statistiques.
 *
 * Correspondance des unités (LiteLLM donne des prix UNITAIRES en dollars) :
 *   input_cost_per_second        × 60   → audioMinute
 *   input_cost_per_token         × 1e6  → inputMTok
 *   output_cost_per_token        × 1e6  → outputMTok
 *   output_cost_per_image_token  × 1e6  → imageOutputMTok
 *   output_cost_per_image               → image
 * Une transcription qui ne serait tarifée qu'au jeton audio n'a pas d'équivalent
 * à la minute : elle est ignorée, son dernier tarif connu reste appliqué.
 */

export const LITELLM_PRICES_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

/** Le fichier fait ~3 Mo en 2026 ; au-delà de 50, ce n'est plus lui. */
const MAX_BYTES = 50 * 1024 * 1024;

/** `mode` LiteLLM → famille de modèle myBrief (cf. MODEL_KINDS, catalog.js). */
const KIND_OF_MODE = {
  chat: 'text',
  responses: 'text',
  completion: 'text',
  audio_transcription: 'audio',
  image_generation: 'image',
};

const isRate = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
/** Six chiffres significatifs : 0,000283333… × 60 donne 0,017, pas 0,01699999999998. */
const tidy = (value) => Number(value.toPrecision(6));

/**
 * Entrée LiteLLM → tarif myBrief (en dollars), ou `null` si rien n'est exploitable.
 * @param {object} entry
 */
export function normalizeLiteLlmEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const kind = KIND_OF_MODE[entry.mode];
  if (!kind) return null;

  const price = { kind };
  const set = (field, value, factor = 1) => {
    if (isRate(value)) price[field] = tidy(value * factor);
  };
  if (kind === 'audio') set('audioMinute', entry.input_cost_per_second, 60);
  if (kind === 'text' || kind === 'image') set('inputMTok', entry.input_cost_per_token, 1e6);
  if (kind === 'text') set('outputMTok', entry.output_cost_per_token, 1e6);
  if (kind === 'image') {
    set('imageOutputMTok', entry.output_cost_per_image_token, 1e6);
    set('image', entry.output_cost_per_image);
  }
  return Object.keys(price).length > 1 ? price : null;
}

/**
 * L'entrée d'un modèle : sous son nom nu pour le fournisseur par défaut de
 * LiteLLM (OpenAI), sous `fournisseur/modèle` pour les autres. Le fournisseur
 * DÉCLARÉ par l'entrée doit être le bon — `gpt-image-2` existe aussi chez des
 * revendeurs, à d'autres prix.
 */
export function findLiteLlmEntry(data, id, provider = 'openai') {
  for (const key of [id, `${provider}/${id}`]) {
    const entry = data?.[key];
    if (entry && (!entry.litellm_provider || entry.litellm_provider === provider)) return entry;
  }
  return null;
}

/**
 * @param {{fetchImpl?: typeof fetch, url?: string, timeoutMs?: number}} [options]
 *   `fetchImpl` est injectable : aucun test ne sort sur le réseau.
 */
export function createLiteLlmSource({
  fetchImpl = globalThis.fetch,
  url = LITELLM_PRICES_URL,
  timeoutMs = 20_000,
} = {}) {
  return {
    id: 'litellm',
    /**
     * @param {Array<{id: string, provider?: string}>} requests
     * @returns {Promise<Object<string, object>>} tarifs trouvés, par modèle
     */
    async fetchPrices(requests) {
      const res = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`litellm: HTTP ${res.status}`);
      if (Number(res.headers?.get?.('content-length')) > MAX_BYTES) {
        throw new Error('litellm: fichier trop lourd');
      }
      const data = await res.json();
      const found = {};
      for (const { id, provider = 'openai' } of requests) {
        const price = normalizeLiteLlmEntry(findLiteLlmEntry(data, id, provider));
        if (price) found[id] = { ...price, provider };
      }
      return found;
    },
  };
}
