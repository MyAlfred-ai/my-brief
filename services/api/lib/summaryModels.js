/**
 * Modèles de rédaction du compte rendu proposables à l'administration.
 *
 * ⚠️ DIFFÉRENCE ASSUMÉE avec lib/transcriptionModels.js : là-bas, la liste
 * fermée est imposée par l'amont — `/realtime/client_secrets` REFUSE tout autre
 * identifiant. Ici, `/chat/completions` accepterait n'importe quelle chaîne et
 * ne répondrait qu'au moment de la génération, chez l'utilisateur. La liste est
 * donc un garde-fou de NOTRE fait : une coquille dans un champ libre
 * (« gpt5-mini ») casserait tous les comptes rendus de l'installation, sans que
 * l'administrateur qui l'a saisie voie quoi que ce soit. Le bouton « Tester »
 * de l'écran comble le reste : il dit si CE compte OpenAI a bien accès au
 * modèle choisi.
 *
 * Pourquoi ces trois-là, et dans cet ordre — MESURÉ le 2026-09-02 sur le compte
 * OpenAI de l'installation, en passant par NOTRE client et le prompt réellement
 * construit par le frontend (scaffold + actions + notes), pas par un appel
 * jouet : `verbosity: 'high'`, `reasoning_effort: 'medium'`, transcription de
 * réunion courte.
 *
 *   modèle          latence   sortie      structure        scaffold recopié
 *   ──────────────  ────────  ──────────  ───────────────  ────────────────
 *   gpt-5.6-sol       11,5 s   2 620 car.  10 titres/21 p.  oui
 *   gpt-5.4           11,3 s   3 644 car.  10 titres/22 p.  oui   ← défaut
 *   gpt-5.4-mini    4,3-5,0 s  ~2 200 car.  8-9 titres       oui (2/2)
 *
 * ⚠️ `gpt-5-mini` A ÉTÉ ÉCARTÉ, et il ne faut pas le remettre sans le remesurer.
 * Sur 3 passages il a IGNORÉ 2 fois la consigne de recopie du scaffold : titre
 * `<h1>` perdu, `<h2>Synthèse</h2>` perdu, et surtout la section « Actions à
 * mener » RÉÉCRITE — les actions détectées, injectées par le client avec leur
 * porteur et leur échéance, disparaissaient du compte rendu au profit d'une
 * liste inventée par le modèle. Ce n'est pas un défaut de style, c'est une
 * perte de données. Il était de surcroît 5× plus lent que `gpt-5.4-mini`
 * (26-28 s contre 4-5 s), parce qu'il dépense beaucoup plus de raisonnement.
 *
 * ⚠️ « GPT-5.6 » N'EST PAS UN MODÈLE. La génération 5.6 se décline en trois
 * paliers : `sol` (flagship, raisonnement le plus profond), `terra`
 * (intermédiaire, au niveau de gpt-5.5) et `luna` (le plus rapide et le moins
 * cher). Aucun identifiant `gpt-5.6` tout court n'existe — l'écrire répondrait
 * 404 à CHAQUE compte rendu. « 5.6 » désigne donc ici `sol`, le palier haut.
 * `terra` et `luna` restent atteignables par `OPENAI_MODEL_SUMMARY`.
 *
 * À noter, contre-intuitif : `sol` a rendu un compte rendu PLUS COURT que
 * `gpt-5.4` sur cet échantillon (2 620 contre 3 644 caractères). Un palier plus
 * capable ne veut pas dire plus verbeux — d'où le défaut sur `gpt-5.4`, qui a
 * la meilleure structure pour le prix.
 *
 * Le filtrage des paramètres vit dans lib/openai.js, pas ici : un modèle qui
 * les refuse (gpt-4o, gpt-4o-mini, gpt-5-chat) ne doit rien casser s'il arrive
 * un jour dans cette liste ou par `OPENAI_MODEL_SUMMARY`.
 *
 * ── Ajoutés le 2026-10-29, SANS MESURE ──────────────────────────────────────
 * Ni la génération 6 d'OpenAI ni Mistral n'ont passé le banc ci-dessus : pas de
 * génération réelle (aucune clé de test Mistral, et pas d'appel au modèle pour
 * vérifier). Identifiants et tarifs relevés le 2026-10-29 sur la grille
 * d'OpenAI et le changelog de Mistral. La recopie du scaffold — ce qui a fait
 * écarter gpt-5-mini — est à éprouver en recette AVANT de recommander l'un
 * d'eux : le défaut reste gpt-5.4, le seul mesuré.
 *
 * - GPT-6, trois paliers : `astra` (le plus capable, 10 $/50 $ le million de
 *   jetons), `sol` en version 6.1 (« proche d'Astra », cinq fois moins cher —
 *   même prix que `gpt-6-sol`, plus récent) et `luna` (le plus léger, déjà le
 *   modèle du titre et de la détection d'actions). Tous acceptent
 *   `/chat/completions` et `reasoning_effort` ; Astra et 6.1 Sol n'acceptent
 *   pas `none`, que le compte rendu ne demande jamais (cf. routes/meetings.js).
 *   ⚠️ Ils ne reçoivent PAS `verbosity: 'high'` : la documentation de GPT-6
 *   n'en dit rien (relue le 2026-10-29, cf. lib/openai.js), et un champ refusé
 *   ferait échouer chaque compte rendu. Le levier qui allonge les comptes
 *   rendus de la génération 5 leur manque : leur longueur est à mesurer.
 * - Mistral, sur la clé de la carte « Fournisseurs d'IA » (la même que Voxtral) :
 *   Large 4 en aperçu public, Medium 3.5, Large 3 et Small 4. Identifiants
 *   versionnés, sauf Large 4 et Medium 3.5 que Mistral ne publie que sous ce nom.
 *   Leur client (lib/mistral.js) n'envoie ni verbosité ni effort de
 *   raisonnement : Large 3 ne connaît pas le second, et Mistral refuse un champ
 *   inconnu.
 */

/** Modèle utilisé tant qu'aucun autre n'est choisi — le seul mesuré (cf. ci-dessus). */
export const DEFAULT_SUMMARY_MODEL = 'gpt-5.4';

/**
 * Fournisseur de chaque modèle accepté, dans l'ordre d'affichage de l'écran
 * d'administration (du plus capable au plus léger, par fournisseur). Il décide
 * de la clé qui paie et du client qui rédige (`summaryClient`).
 * @type {Record<string, 'openai'|'mistral'>}
 */
export const SUMMARY_PROVIDERS = {
  'gpt-6-astra': 'openai',
  'gpt-6.1-sol': 'openai',
  'gpt-5.6-sol': 'openai',
  'gpt-5.4': 'openai',
  'gpt-5.4-mini': 'openai',
  'gpt-6-luna': 'openai',
  'mistral-large-4': 'mistral',
  'mistral-medium-3-5': 'mistral',
  'mistral-large-2512': 'mistral',
  'mistral-small-2603': 'mistral',
};

/** Identifiants acceptés, dans l'ordre d'affichage de l'écran d'administration. */
export const SUMMARY_MODELS = Object.keys(SUMMARY_PROVIDERS);

/**
 * @param {string} id
 * @returns {boolean}
 */
export function isSummaryModel(id) {
  return Object.hasOwn(SUMMARY_PROVIDERS, id || '');
}

/**
 * Qui rédige avec `id`. Un modèle hors liste — imposé par `OPENAI_MODEL_SUMMARY`,
 * la porte de sortie de l'administrateur système — part chez OpenAI, comme
 * avant cette liste : la variable porte le nom d'OpenAI.
 * @param {string} id
 * @returns {'openai'|'mistral'}
 */
export function summaryProvider(id) {
  return SUMMARY_PROVIDERS[id] || 'openai';
}

/**
 * Le client qui rédige avec `model` — même contrat `chat()` chez tous : les
 * routes l'appellent sans savoir qui répond.
 * @param {{openai: object, speech: Record<string, object>}} app
 * @param {string} model
 */
export function summaryClient(app, model) {
  const provider = summaryProvider(model);
  return provider === 'openai' ? app.openai : app.speech[provider];
}

/**
 * Modèle effectif : celui de l'administration, sinon celui de l'environnement,
 * sinon le défaut.
 *
 * Une valeur d'ENVIRONNEMENT hors liste est CONSERVÉE, contrairement à la
 * transcription qui l'ignore : `OPENAI_MODEL_SUMMARY` est la porte de sortie
 * de l'administrateur système — il doit pouvoir y mettre un modèle que cette
 * liste ne connaît pas encore (un palier 5.6 non listé, une génération plus
 * récente, un déploiement Azure) sans attendre
 * une version de l'application. Ce qui est refusé, c'est ce qui vient de
 * l'ÉCRAN : là, la liste est la seule source.
 *
 * @param {string} [stored] - valeur enregistrée en administration
 * @param {string} [envModel] - OPENAI_MODEL_SUMMARY, déjà résolu par lib/config.js
 * @returns {string}
 */
export function resolveSummaryModel(stored, envModel) {
  if (isSummaryModel(stored)) return stored;
  const env = String(envModel || '').trim();
  if (env) return env;
  return DEFAULT_SUMMARY_MODEL;
}
