/**
 * Hypothèses de consommation — ce que la base ne mesure pas.
 *
 * La base connaît, réunion par réunion, la durée enregistrée, la longueur du
 * texte transcrit, les versions de compte rendu générées et l'infographie. Elle
 * ne connaît PAS les jetons facturés : OpenAI ne les annonce que dans sa
 * réponse, et myBrief ne les garde pas. Les valeurs ci-dessous convertissent
 * les volumes mesurés en unités facturées. Chacune est NOMMÉE et servie à
 * l'écran (« Hypothèses de calcul ») : une estimation ne doit jamais se faire
 * passer pour une facture.
 *
 * MESURÉ (2026-09-25, dans ce dépôt) :
 *   - les consignes envoyées par le serveur, relues ICI à chaque démarrage —
 *     elles suivent donc le code : titre, détection d'actions, maquette
 *     d'infographie ;
 *   - la consigne d'un compte rendu, construite par le navigateur
 *     (src/config/templates.js, hors de portée de ce service) : 3 400 à
 *     3 700 caractères selon le template fourni.
 *
 * NON MESURÉ, à recaler sur une facture OpenAI :
 *   - les jetons PRODUITS, raisonnement compris — ils ne sont visibles qu'à la
 *     réponse. Les valeurs retenues sont celles d'un raisonnement « medium »,
 *     l'effort demandé pour le compte rendu et la maquette ;
 *   - le rythme de la détection d'actions : une analyse par phrase finalisée,
 *     une seule en vol (src/utils/actionDetectionScheduler.js). Son rythme
 *     réel est borné par la latence du modèle et le débit de parole ; une
 *     analyse toutes les dix secondes en est l'ordre de grandeur.
 *
 * NON COMPTÉ : l'import de fichiers audio, la relecture de la transcription par
 * les notes (quelques centimes de l'heure au plus, et seulement quand des notes
 * sont prises), les essais de l'administration — et le SECOND flux audio d'une
 * réunion en visio (micro + son de la visio, deux sessions de transcription),
 * que la base ne distingue pas : une réunion en visio coûte jusqu'à deux fois
 * la transcription estimée ici.
 */
import {
  actionsPrompt,
  INFOGRAPHIC_PROMPT_MAX,
  INFOGRAPHIC_WRITER_RULES,
  TITLE_RULES,
} from '../prompts.js';
import { DEFAULT_ACTION_DETECTION } from '../actionDetectionSettings.js';

/** Fenêtre de détection par défaut (8 lignes), à ~90 caractères la ligne. */
const DETECTION_WINDOW_CHARS = DEFAULT_ACTION_DETECTION.windowSize * 90;
/** Actions déjà détectées, renvoyées au modèle à chaque analyse — moyenne sur une réunion. */
const DETECTION_KNOWN_ACTIONS_CHARS = 1000;

/** Consigne de détection sans transcription ni action : sa part fixe. */
const detectionSkeletonChars = actionsPrompt({
  content: '',
  actions: [],
  dismissed: [],
  settings: DEFAULT_ACTION_DETECTION,
}).length;

export const ASSUMPTIONS = Object.freeze({
  /** Texte français : environ quatre caractères par jeton. */
  charsPerToken: 4,
  /**
   * Débit de parole de repli (~150 mots par minute), quand l'installation n'a
   * pas encore de réunion mesurée à la fois en durée et en texte. Sinon, c'est
   * SON débit qui sert (cf. usage.js).
   */
  speechCharsPerSecond: 14,

  /** Consigne du template (~3 500 car.) + vocabulaire de l'organisation, notes et actions. */
  summaryPromptChars: 5000,
  /** Compte rendu développé (~1 500 jetons) + raisonnement « medium » (~2 500). */
  summaryOutputTokens: 4000,

  /** Consigne du titre + compte rendu HTML joint (~6 000 car.) ; la transcription s'y ajoute. */
  titlePromptChars: TITLE_RULES.length + 6000,
  titleOutputTokens: 20,

  /** Une analyse toutes les dix secondes d'enregistrement. */
  detectionCallsPerHour: 360,
  detectionPromptChars:
    detectionSkeletonChars + DETECTION_WINDOW_CHARS + DETECTION_KNOWN_ACTIONS_CHARS,
  /** Liste d'actions en JSON + raisonnement « medium » (lib/actionDetection.js). */
  detectionOutputTokens: 500,

  /** Matériaux de la maquette : bornés par lib/prompts.js, transcription tronquée comprise. */
  infographicSourceMaxChars: INFOGRAPHIC_PROMPT_MAX,
  infographicRulesChars: INFOGRAPHIC_WRITER_RULES.length,
  /** Prompt d'image écrit (~1 250 jetons) + raisonnement « medium ». */
  infographicWriterOutputTokens: 3000,
  /** Prompt d'image relu par le modèle qui dessine. */
  infographicPromptChars: 5000,
  /**
   * Jetons d'une page portrait en qualité haute, pour un modèle d'image que le
   * catalogue ne caractérise pas : la valeur publiée pour gpt-image-1, la plus
   * chère de ses aînées.
   */
  imageTokensFallback: 6240,
});
