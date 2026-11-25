/**
 * Modèles d'IMAGE de l'infographie proposables à l'administration.
 *
 * ⚠️ À ne pas confondre avec `config.openai.models.infographic` : celui-là est
 * le modèle TEXTE qui RÉÉCRIT le prompt (la maquette) ; celui-ci est le modèle
 * qui DESSINE. Deux appels, deux réglages — cf. lib/infographic.js.
 *
 * Jusqu'au 2026-09-16 le modèle d'image était FIXE dans le code (`gpt-image-2`,
 * « en faire un réglage ajouterait deux pannes possibles sans besoin
 * exprimé »). Ce qui a changé : la génération 2.5 introduit deux paliers là où
 * il n'y avait qu'un modèle, et le choix entre « plus rapide » et « comme
 * avant » n'est plus le nôtre — il dépend de ce que l'organisation facture et
 * de ce à quoi son compte OpenAI a accès. La liste reste FERMÉE côté écran,
 * pour la même raison que la rédaction : `/images/generations` accepterait
 * n'importe quelle chaîne et ne répondrait qu'à la génération, en tâche de
 * fond — l'infographie finirait en `error` sans que l'administrateur qui a
 * saisi la coquille ne voie quoi que ce soit.
 *
 * Pourquoi Flare, et lui seul à l'écran :
 *
 *   modèle               ce qu'en dit OpenAI (docs, 2026-09-16)
 *   ───────────────────  ──────────────────────────────────────────────────
 *   gpt-image-2.5-flare  palier rapide de la génération 2.5 : meilleure
 *                        qualité que gpt-image-2 pour environ moitié moins de
 *                        latence. Six niveaux de qualité, jusqu'à 3840 px.
 *                        ← défaut
 *
 * `gpt-image-2` — le modèle en service du 2026-09-02 au 2026-09-16, mesuré chez
 * nous (lettrage sans coquille, composition entière dans le cadre) — a été le
 * second choix, le repli si Flare décevait, jusqu'au 2026-11-12 : OpenAI le
 * coupe le 2027-02-10 (annonce du 2026-11-10). Il n'est plus proposé, et un
 * choix enregistré avant est TRADUIT en Flare à la résolution
 * (RETIRED_INFOGRAPHIC_IMAGE_MODELS), comme la transcription
 * (RETIRED_TRANSCRIPTION_MODELS) : la rubrique Modèles IA le dit, « Garder » l'enregistre.
 * Flare plutôt que `gpt-image-2.6-*`, les remplaçants désignés par OpenAI :
 * déjà proposé, même prix au jeton que gpt-image-2, et la génération 2.6 n'a
 * été ni relevée (prix, paramètres) ni essayée ici.
 *
 * ⚠️ FLARE N'EST PAS MESURÉ CHEZ NOUS. Ses caractéristiques viennent de la
 * documentation d'OpenAI, pas d'une comparaison sur une réunion connue depuis
 * ce dépôt (clé et facturation de l'organisation). Le repli qu'offrait
 * gpt-image-2 n'existe plus : à juger en recette, en régénérant une réunion
 * connue, AVANT que les installations qui l'avaient gardé n'y passent.
 *
 * `gpt-image-2.5-sunburst` (le palier haut de la même génération) n'est PAS
 * dans la liste : rien ne l'a départagé de Flare ici, et l'y mettre reviendrait
 * à proposer un choix qu'aucune mesure n'éclaire. Il reste atteignable par
 * `OPENAI_MODEL_INFOGRAPHIC_IMAGE` — cf. `resolveInfographicImageModel`.
 *
 * Le FORMAT, lui, reste fixe (1024 × 1536, cf. lib/infographic.js) : la page
 * portrait est un choix de produit, et la direction artistique du réécrivain
 * est écrite pour elle (lib/prompts.js).
 */

/** Modèle utilisé tant qu'aucun autre n'est choisi. */
export const DEFAULT_INFOGRAPHIC_IMAGE_MODEL = 'gpt-image-2.5-flare';

/** Identifiants acceptés, dans l'ordre d'affichage de l'écran d'administration. */
export const INFOGRAPHIC_IMAGE_MODELS = ['gpt-image-2.5-flare'];

/**
 * Modèles retirés par OpenAI → leur remplaçant, pour un choix ENREGISTRÉ avant
 * le retrait. Sans cette table, ce choix serait une valeur hors liste, ignorée
 * en silence : l'écran montrerait un autre modèle sans dire pourquoi. La date
 * de coupure vient de lib/retiredModels.js, qui fait foi.
 */
export const RETIRED_INFOGRAPHIC_IMAGE_MODELS = {
  'gpt-image-2': 'gpt-image-2.5-flare',
};

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isInfographicImageModel(id) {
  return INFOGRAPHIC_IMAGE_MODELS.includes(id);
}

/**
 * Modèle effectif, sa provenance, et le modèle retiré qu'il remplace le cas
 * échéant : celui de l'administration, sinon celui de l'environnement, sinon
 * le défaut.
 *
 * Même arbitrage que la RÉDACTION (lib/summaryModels.js) et non que la
 * transcription : une valeur d'ENVIRONNEMENT hors liste est CONSERVÉE. C'est la
 * porte de sortie de l'administrateur système — un palier non listé
 * (`gpt-image-2.5-sunburst`), une génération plus récente que cette version, un
 * déploiement Azure — sans attendre une version de l'application. Ce qui est
 * refusé, c'est ce qui vient de l'ÉCRAN : là, la liste est la seule source.
 * Un modèle retiré, lui, n'arrive jamais par l'environnement : lib/config.js
 * l'a déjà vidé (lib/retiredModels.js).
 *
 * Une valeur ENREGISTRÉE hors liste est ignorée (base éditée à la main) : elle
 * ferait échouer toutes les infographies de l'installation, en tâche de fond.
 * Un modèle retiré enregistré est traduit en son remplaçant, et le dit.
 *
 * @param {string} [stored] - valeur enregistrée en administration
 * @param {string} [envModel] - OPENAI_MODEL_INFOGRAPHIC_IMAGE, déjà résolu par lib/config.js
 * @returns {{model: string, source: 'settings'|'env'|'default', retiredFrom: string|null}}
 */
export function describeInfographicImageModel(stored, envModel) {
  if (isInfographicImageModel(stored))
    return { model: stored, source: 'settings', retiredFrom: null };
  if (Object.hasOwn(RETIRED_INFOGRAPHIC_IMAGE_MODELS, stored || '')) {
    return {
      model: RETIRED_INFOGRAPHIC_IMAGE_MODELS[stored],
      source: 'settings',
      retiredFrom: stored,
    };
  }
  const env = String(envModel || '').trim();
  if (env) return { model: env, source: 'env', retiredFrom: null };
  return { model: DEFAULT_INFOGRAPHIC_IMAGE_MODEL, source: 'default', retiredFrom: null };
}

/**
 * @param {string} [stored] - valeur enregistrée en administration
 * @param {string} [envModel] - OPENAI_MODEL_INFOGRAPHIC_IMAGE, déjà résolu par lib/config.js
 * @returns {string}
 */
export function resolveInfographicImageModel(stored, envModel) {
  return describeInfographicImageModel(stored, envModel).model;
}
