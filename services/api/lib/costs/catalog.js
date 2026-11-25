/**
 * Tarifs de référence des modèles d'IA — le « dernier relevé » livré avec
 * l'application.
 *
 * C'est ce que l'écran Statistiques applique tant que personne n'a cliqué
 * « Actualiser les tarifs », puis pour tout modèle que les sources en ligne ne
 * connaissent pas (cf. refresh.js). Relevé le 2026-09-25 dans la base publique
 * de LiteLLM, qui recopie les grilles des fournisseurs (cf. sources/litellm.js).
 * Les montants sont en DOLLARS, la devise dans laquelle OpenAI et Mistral
 * facturent : la conversion en euros se fait au dernier taux relevé
 * (FX_FALLBACK, puis la BCE).
 *
 * Deux familles de champs, qui ne vivent pas au même rythme :
 *   - les PRIX (PRICE_FIELDS) — ce qu'une actualisation remplace ;
 *   - les CARACTÉRISTIQUES (`imageTokens`) — ce qu'aucune grille ne publie et
 *     qu'une actualisation CONSERVE.
 *
 * Une unité par compteur de facturation (cf. METERS, estimate.js) :
 *   audioMinute      $ par minute d'audio transcrite
 *   inputMTok        $ par million de jetons de texte envoyés
 *   outputMTok       $ par million de jetons de texte produits, raisonnement compris
 *   imageOutputMTok  $ par million de jetons d'image dessinés
 *   image            $ par image, pour un fournisseur qui facture à l'image
 *
 * ⚠️ `imageTokens` N'EST PAS RELEVÉ CHEZ OPENAI. La génération gpt-image-2
 * (retirée le 2027-02-10, sortie du catalogue) facturait au jeton, et le nombre
 * de jetons d'une page 1024 × 1536 en qualité haute se déduisait du prix à
 * l'image que publie fal.ai, qui refacture au jeton : 0,165 $ ÷ 30 $/M = 5 500
 * jetons. Les paliers 2.5 ont le même prix au jeton (LiteLLM) ; leur nombre de
 * jetons par image n'est publié nulle part, d'où la même valeur, à recaler sur
 * une facture. Qualité haute parce que l'appel ne
 * précise pas de qualité (lib/openai.js) : « auto » est compté au plus cher.
 *
 * Ajouter un modèle, ou un fournisseur : une entrée ici, avec son `provider`.
 * S'il n'est pas dans LiteLLM, une source de plus dans sources/.
 */

/** Date du relevé intégré — comparée à celle d'une actualisation (le plus récent gagne). */
export const CATALOG_CHECKED_AT = '2026-09-25';

/** Les champs qu'une actualisation remplace. Tout autre champ est une caractéristique. */
export const PRICE_FIELDS = ['audioMinute', 'inputMTok', 'outputMTok', 'imageOutputMTok', 'image'];

/** Familles de modèles — pilotent la lecture d'une grille et l'affichage des tarifs. */
export const MODEL_KINDS = ['audio', 'text', 'image'];

export const PRICE_CATALOG = {
  // ── Transcription — facturée à la minute d'audio ──────────────────────────
  // Plus de gpt-4o-transcribe, gpt-4o-mini-transcribe ni whisper-1 : retirés
  // par OpenAI le 26/02/2027, ni en service ni proposés (transcriptionModels.js).
  'gpt-realtime-whisper': { provider: 'openai', kind: 'audio', audioMinute: 0.017 },
  'gpt-live-transcribe': { provider: 'openai', kind: 'audio', audioMinute: 0.017 },
  'gpt-transcribe': { provider: 'openai', kind: 'audio', audioMinute: 0.0045 },
  // Voxtral (Mistral), relevé sur docs.mistral.ai le 2026-10-27, en dollars
  // comme la grille de Mistral. Le direct seul : c'est lui qu'on choisit, et
  // l'import de fichier (voxtral-mini-2602, 3-0) coûte moins encore.
  'voxtral-mini-transcribe-realtime-2602': {
    provider: 'mistral',
    kind: 'audio',
    audioMinute: 0.006,
  },
  'voxtral-mini-transcribe-realtime-3-0': {
    provider: 'mistral',
    kind: 'audio',
    audioMinute: 0.008,
  },
  // Speechmatics, relevé sur speechmatics.com/pricing le 2026-10-27 : le
  // direct, au tarif public (sans la remise « entraînement du modèle »).
  'speechmatics-melia-1': { provider: 'speechmatics', kind: 'audio', audioMinute: 0.4 / 60 },
  'speechmatics-enhanced': { provider: 'speechmatics', kind: 'audio', audioMinute: 0.8 / 60 },
  // AssemblyAI, relevé sur sa page des modèles le 2026-10-27. ⚠️ Facturé à la
  // DURÉE DE SESSION, silences et pauses compris, pas à l'audio transcrit :
  // l'estimation, qui compte la durée des réunions, est donc juste.
  'universal-3-6-pro': { provider: 'assemblyai', kind: 'audio', audioMinute: 0.0075 },
  'universal-streaming-multilingual': {
    provider: 'assemblyai',
    kind: 'audio',
    audioMinute: 0.0025,
  },

  // ── Texte — compte rendu, titre, détection d'actions, maquette d'infographie
  'gpt-5.6-sol': { provider: 'openai', kind: 'text', inputMTok: 4, outputMTok: 20 },
  'gpt-5.6-terra': { provider: 'openai', kind: 'text', inputMTok: 2, outputMTok: 12 },
  'gpt-5.6-luna': { provider: 'openai', kind: 'text', inputMTok: 0.2, outputMTok: 1.2 },
  'gpt-5.4': { provider: 'openai', kind: 'text', inputMTok: 2.5, outputMTok: 15 },
  'gpt-5.4-mini': { provider: 'openai', kind: 'text', inputMTok: 0.75, outputMTok: 4.5 },
  // Relevé chez OpenAI le 2026-10-14 : défaut du titre, de la relecture et de
  // la détection d'actions — et proposé pour le compte rendu depuis le 2026-10-29.
  'gpt-6-luna': { provider: 'openai', kind: 'text', inputMTok: 0.1, outputMTok: 0.5 },
  // Paliers hauts de GPT-6, proposés pour le compte rendu : relevés sur la
  // grille d'OpenAI le 2026-10-29 (contexte court, ≤ 272 k jetons — une
  // réunion d'une heure en fait ~15 k).
  'gpt-6-astra': { provider: 'openai', kind: 'text', inputMTok: 10, outputMTok: 50 },
  'gpt-6.1-sol': { provider: 'openai', kind: 'text', inputMTok: 2, outputMTok: 10 },
  // Mistral, proposés pour le compte rendu : relevés sur docs.mistral.ai le
  // 2026-10-29, en dollars comme Voxtral.
  'mistral-large-4': { provider: 'mistral', kind: 'text', inputMTok: 1.36, outputMTok: 4.18 },
  'mistral-medium-3-5': { provider: 'mistral', kind: 'text', inputMTok: 1.5, outputMTok: 7.5 },
  'mistral-large-2512': { provider: 'mistral', kind: 'text', inputMTok: 0.5, outputMTok: 1.5 },
  'mistral-small-2603': { provider: 'mistral', kind: 'text', inputMTok: 0.15, outputMTok: 0.6 },

  // ── Image — l'infographie, une page portrait 1024 × 1536 ──────────────────
  'gpt-image-2.5-flare': {
    provider: 'openai',
    kind: 'image',
    inputMTok: 5,
    imageOutputMTok: 30,
    imageTokens: 5500,
  },
  'gpt-image-2.5-sunburst': {
    provider: 'openai',
    kind: 'image',
    inputMTok: 5,
    imageOutputMTok: 30,
    imageTokens: 5500,
  },
};

/**
 * Taux de change de repli : 1 $ = 0,8795 €, cours du 2026-09-25. Remplacé par
 * le taux de référence de la BCE à la première actualisation qui aboutit.
 */
export const FX_FALLBACK = { usdToEur: 0.8795, date: '2026-09-25', source: 'builtin' };
