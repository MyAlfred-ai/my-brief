/**
 * Prompts LLM — repris VERBATIM des nodes n8n (n8n/server.json) pour garantir
 * l'iso-comportement au cutover. Ne pas « améliorer » le texte (fautes de
 * frappe comprises) sans comparer les sorties en recette.
 *
 * EXCEPTION assumée : `actionsPrompt` a été réécrit pour la détection en
 * direct (apparition immédiate, affinage des actions déjà détectées). Le
 * comportement n8n — une action ne sortait qu'au mot « action », et rien ne
 * pouvait plus la modifier ensuite — n'était pas ce qu'on veut en réunion. Les
 * autres prompts restent verbatim.
 *
 * Le prompt du RÉSUMÉ n'est pas ici : il est construit côté frontend
 * (src/config/templates.js, resolveSystemPrompt) et passé tel quel dans le
 * corps de /resume — le backend est un passe-plat, comme n8n l'était.
 */

import { normalizeLang } from './text.js';
import { INFOGRAPHIC_ICONS } from './infographicLayout.js';

/** Date du jour au format yyyy-MM-dd en Europe/Paris (parité GENERIC_TIMEZONE n8n). */
export function todayParis(now = new Date()) {
  // en-CA formate naturellement en yyyy-MM-dd.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Contexte d'organisation par défaut, quand l'administration n'en a pas saisi. */
const DEFAULT_BUSINESS_CONTEXT =
  "La société MyAlfred.ai est une société spécialisée en Intelligence Artificielle. Ses discussions peuvent tourner autour de sujets internes de développement, de prospections clients, d'enjeux stratégiques...";

/**
 * Consigne de tri, réglable par chaque utilisateur. C'est ce curseur qui décide
 * de ce qui « compte » comme action — le reste du prompt est identique.
 *
 * Les trois niveaux se lisent COMME UNE ÉCHELLE, et chacun nomme ce que le
 * niveau voisin retient et que lui rejette : « Stricte » disait auparavant « la
 * tâche est annoncée comme telle, avec un mot déclencheur OU une consigne sans
 * ambiguïté », et cette seconde branche rouvrait exactement la famille que
 * « Équilibrée » ajoute (une demande, un besoin énoncé). Mesuré au banc
 * d'essai : les deux niveaux rendaient quasiment la même liste, et l'utilisateur
 * concluait — à raison — que le réglage ne servait à rien. Ne pas réintroduire
 * de formule attrape-tout de ce genre : chaque niveau doit REFUSER par écrit ce
 * que le suivant accepte.
 *
 * Ce qui SÉPARE les trois niveaux, depuis le resserrage d'« Équilibrée » :
 *   - « Stricte » : la tâche est POSÉE comme une tâche ;
 *   - « Équilibrée » : + elle a un PORTEUR (quelqu'un s'engage, ou on la lui
 *     confie) — c'est le critère, pas le degré de certitude, qui ne se mesure
 *     pas ;
 *   - « Large » : + elle est seulement NÉCESSAIRE, sans porteur (« il faut
 *     envoyer le devis », « penser à réserver la salle »).
 * « Équilibrée » retenait cette dernière famille et rendait des listes trop
 * longues ; c'est elle qui est passée au niveau du dessus.
 */
const SENSITIVITY_RULES = {
  // Défaut (depuis le 2026-10-28). Réunions où tout est cadencé : on ne veut
  // QUE ce qui est posé comme une tâche.
  explicit: `   Ne retiens QUE les actions ANNONCÉES COMME TELLES : la phrase contient un mot déclencheur, ou énonce la tâche en la posant explicitement comme une tâche à faire ("Action : Marie envoie le compte rendu vendredi", "à faire : commander les badges", "on note que Paul rappelle le fournisseur lundi").
   Ce niveau est volontairement SÉVÈRE. Ne sont PAS des actions ici, même si la tâche paraît utile ou évidente :
   - un engagement pris au fil de la parole, sans annonce : "je m'en occupe", "je te fais ça ce soir", "oui je le fais cet après-midi" ;
   - une demande, une question ou une consigne lancée dans la discussion : "tu peux relancer le client ?", "il faut envoyer le devis avant vendredi", "il faudrait préparer la démo" ;
   - un besoin, un constat, une idée ou une intention : "on devrait revoir nos tarifs", "penser à réserver la salle".
   Dans le doute, ne ressors RIEN : ici une action manquée est préférable à une action de trop.`,
  // Le critère est le PORTEUR : quelqu'un s'engage, ou la tâche est
  // confiée à quelqu'un. Un besoin énoncé sans porteur relève de « Large ».
  balanced: `   Pose-toi DEUX questions dans cet ordre, et ne retiens la tâche que si l'une répond oui :
   1. La phrase POSE-T-ELLE la tâche comme une tâche ? (mot déclencheur, "à faire :", "on note que…") — elle compte alors même si personne n'est désigné.
   2. Sinon : quelqu'un la PREND-IL en charge, ou se la voit-il CONFIER ? Le porteur est celui qui parle ("je m'en occupe", "je te fais le compte rendu ce soir") ou la personne à qui on s'adresse ("tu peux relancer le client ?", "Marie, tu regardes le devis").
   Si les deux réponses sont non, ce n'est PAS une action à ce niveau, même si la tâche est manifestement nécessaire et datée : "il faut envoyer le devis avant vendredi", "il faudrait préparer la démo", "on devrait revoir nos tarifs", "penser à réserver la salle" n'ont ni annonce ni porteur — elles relèvent du niveau « Large ». Une urgence ("sinon on perd l'affaire") ne remplace ni l'une ni l'autre.
   Ne sont pas non plus des actions : un constat, une opinion, une hypothèse, une intention vague, une décision déjà appliquée. Dans le doute, ne ressors rien.`,
  // Ateliers, brainstormings : mieux vaut une action à supprimer qu'une oubliée.
  wide: `   Retiens largement : toute tâche à faire qui ressort de la discussion, qu'elle soit annoncée comme telle, confiée à quelqu'un, ou seulement évoquée comme nécessaire SANS PORTEUR ("il faut envoyer le devis avant vendredi", "il faudrait préparer la démo", "on devrait revoir nos tarifs", "penser à réserver la salle").
   Restent exclus : les constats sans suite, les opinions et les décisions déjà appliquées. Dans le doute, ressors l'action — l'utilisateur la supprimera d'un clic.`,
};

/**
 * Prompt d'extraction d'actions (gpt-6-luna), appelé en continu pendant la
 * réunion. Deux différences majeures avec le node n8n d'origine : les
 * engagements pris sans le mot « action » sont détectés, et le modèle peut
 * AFFINER une action déjà détectée en la renvoyant avec son id.
 *
 * Le comportement est réglable par chaque utilisateur (`settings` ci-dessous,
 * bloc `detection` de son document de réglages). Sans réglages, le niveau est
 * « Stricte », comme le défaut de lib/actionDetectionSettings.js.
 *
 * La LANGUE des actions est celle de l'interface — celle du compte rendu, où
 * elles entrent par {{actions}} —, pas celle de la transcription. Sans consigne,
 * le modèle suivait la langue de ce prompt : en interface anglaise, les actions
 * sortaient en français. Repli fr, comme le résumé (`ctx.language ?? 'fr'`).
 *
 * @param {{content: string, actions: Array, dismissed?: Array, today?: string,
 *          language?: string,
 *          settings?: {sensitivity?: string, triggerWords?: Array<string>,
 *                      businessContext?: string, allowUpdates?: boolean}}} params
 *   `actions` : actions vivantes, avec leur id. `dismissed` : celles que
 *   l'utilisateur a supprimées — à ne plus jamais proposer.
 * @returns {string}
 */
export function actionsPrompt({
  content,
  actions,
  dismissed,
  today = todayParis(),
  language,
  settings = {},
}) {
  const outputLang = normalizeLang(language);
  // Repli = défaut des réglages (DEFAULT_ACTION_DETECTION), « Stricte ».
  const sensitivity = SENSITIVITY_RULES[settings.sensitivity] ? settings.sensitivity : 'explicit';
  const words = (Array.isArray(settings.triggerWords) ? settings.triggerWords : ['action'])
    .map((w) => String(w ?? '').trim())
    .filter(Boolean);
  // La ligne des mots déclencheurs SUIT le niveau : en « Stricte » elle est la
  // porte principale (hors mot déclencheur, il faut une tâche formellement
  // posée), ailleurs elle s'ajoute au sens des phrases. Une formulation unique
  // rouvrait en strict ce que la règle venait de fermer.
  const triggerLine = words.length
    ? `Mots et expressions déclencheurs de cette organisation : ${words.map((w) => `"${w}"`).join(', ')}. Une phrase qui en contient un annonce une action, sauf tournure négative ou interrogative sans engagement.${
        sensitivity === 'explicit'
          ? ' En dehors de ces mots, ne retiens la tâche que si elle est formellement posée comme une tâche à faire.'
          : ''
      }`
    : sensitivity === 'explicit'
      ? `Aucun mot déclencheur n'est défini : ne retiens donc que les tâches formellement posées comme telles dans la phrase.`
      : `Cette organisation n'a défini aucun mot déclencheur : appuie-toi uniquement sur le sens des phrases.`;
  const businessContext = String(settings.businessContext || '').trim() || DEFAULT_BUSINESS_CONTEXT;
  // Les mises à jour se retirent des DEUX endroits : garder la consigne de
  // format sans la tâche ferait quand même émettre des "id" au modèle.
  const allowUpdates = settings.allowUpdates !== false;

  // ⚠️ MESURÉ en recette (2026-10-13) : la consigne disait « repars des valeurs
  // existantes » et comptait « le périmètre se précise » comme une mise à jour.
  // Appelé après chaque phrase, le modèle reprenait la description d'une action
  // générique et y ajoutait « Précision ajoutée : … » à chaque fenêtre — une
  // heure plus tard, l'action était le compte rendu de la réunion, en 500 mots.
  // D'où : la description se RÉÉCRIT, et ce qui se dit sur le sujet n'est pas
  // une mise à jour. Le filet est côté client (MAX_UPDATE_WORDS de
  // src/utils/liveActionsMerge.js).
  const updateTask = allowUpdates
    ? `
2) MISES À JOUR. Ne mets à jour une action déjà détectée que si la fenêtre change la TÂCHE ELLE-MÊME : son porteur se désigne ou change, son échéance tombe ou bouge, ce qu'il faut livrer change. Renvoie-la alors avec son "id" EXACT et TOUS ses champs, en ne changeant QUE ce qui vient d'être dit.
   La description se RÉÉCRIT, elle ne s'allonge pas : une seule tâche, 30 mots maximum. N'y ajoute jamais de "Précision :", de liste de points, ni le résumé de ce qui s'est dit.
   Ne sont PAS des mises à jour : une information, une décision, un chiffre, une exigence, une idée ou un contexte échangés pendant la réunion — ils relèvent du compte rendu, pas de l'action. Une autre tâche, même sur le même sujet, n'en est pas une non plus : c'est une nouvelle action si elle répond au point 1, sinon rien.`
    : `
2) NE MODIFIE JAMAIS une action déjà détectée. Elles te sont fournies uniquement pour que tu ne les proposes pas une seconde fois. Ne renvoie jamais de champ "id".`;

  const updateConstraint = allowUpdates
    ? `- Jamais deux fois la même tâche. Si une action existante désigne déjà la MÊME tâche (même sens, mots différents), c'est une mise à jour — ou rien du tout. Jamais une création.
- Une action n'est jamais un fourre-tout : n'y verse pas un autre sujet, même voisin, et ne la renvoie pas pour y ajouter ce qui vient d'être discuté.
- Ne mets à jour que sur une information réellement nouvelle. Ne reformule pas une action pour le plaisir de la reformuler : sans rien de neuf, ne la renvoie pas.`
    : `- Jamais deux fois la même tâche. Si une action existante couvre déjà la tâche évoquée (même sens, mots différents), ne renvoie rien pour cette tâche.`;

  const idFormat = allowUpdates
    ? `[{
"id": 12,
"title": "un titre court pour l'action",`
    : `[{
"title": "un titre court pour l'action",`;

  const idNote = allowUpdates
    ? `Le champ "id" est présent UNIQUEMENT pour une mise à jour d'une action déjà détectée. Pour une nouvelle action, n'écris pas de champ "id".`
    : `N'écris JAMAIS de champ "id".`;

  return `#ROLE#
Tenir à jour la liste des actions d'une réunion EN COURS : détecter les nouvelles actions${allowUpdates ? ' et affiner celles qui ont déjà été détectées' : ''}.

#CONTEXTE#
${businessContext}
Tu es appelé régulièrement pendant la réunion, sur une FENÊTRE RÉCENTE de la transcription : le début de la réunion n'y figure pas, mais les actions déjà détectées te sont refournies plus bas avec leur id.

#TACHE#
1) NOUVELLES ACTIONS.
${SENSITIVITY_RULES[sensitivity]}
   ${triggerLine}
${updateTask}

#CONTRAINTES#
${updateConstraint}
- Les actions REFUSÉES listées plus bas ont été supprimées par l'utilisateur : ne les recrée JAMAIS, ne les modifie pas, même si le sujet revient dans la conversation.
- N'invente ni owner ni dueDate. Si l'information n'a pas été dite, laisse la chaîne vide "".
- Langue de sortie : "${outputLang}". Rédige "title" et "description" dans cette langue, même si la transcription ou les exemples de cette consigne sont dans une autre langue.
- Si rien ne ressort de la fenêtre, renvoie un tableau vide.

#INFOS#
Nous sommes le ${today} ce qui te permettra de calculer les dates d'échéance des actions (dueDate) au format yyyy-MM-dd. "vendredi", "la semaine prochaine", "dans 15 jours" se calculent à partir de cette date.

#TRANSCRIPTION (fenêtre récente)#
${content ?? ''}

#ACTIONS DÉJÀ DÉTECTÉES (avec leur id)#
${JSON.stringify(actions ?? [])}

#ACTIONS REFUSÉES PAR L'UTILISATEUR (ne jamais reproposer)#
${JSON.stringify(dismissed ?? [])}

#FORMAT DE SORTIE#
UNIQUEMENT un tableau JSON, sans texte autour, sans balise de code. Rien à signaler : []
${idFormat}
"description": "Description de l'action en 30 mots maximum",
"owner": "le nom / prénom de la personne à qui est attribuée l'action, sans sa fonction ni son rôle, ou \\"\\"",
"dueDate": "date d'échéance au format yyyy-MM-dd, ou \\"\\""
}]
${idNote}

`;
}

/**
 * Écarte ce qui n'est pas un objet et fiabilise l'`id`, qui désigne l'action à
 * mettre à jour : un id non entier ("douze", 3.5) est retiré plutôt que
 * transmis — sans id, le client crée une action au lieu d'en écraser une
 * autre. Le client se garde aussi de son côté (un id inconnu y est rejeté) :
 * c'est volontairement redondant, l'entrée vient d'un modèle.
 * @param {Array} items
 * @returns {Array}
 */
function sanitizeActionItems(items) {
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (!('id' in item)) {
      out.push(item);
      continue;
    }
    const id = typeof item.id === 'string' ? Number(item.id.trim()) : item.id;
    if (Number.isInteger(id)) {
      out.push({ ...item, id });
    } else {
      const { id: _dropped, ...rest } = item;
      out.push(rest);
    }
  }
  return out;
}

/**
 * Parse la sortie du modèle pour /actions : JSON strict, ou fences markdown,
 * ou premier bloc [...] trouvé. Vide/illisible => tableau vide (le node n8n
 * pouvait « ne rien ressortir », le frontend tolère un tableau vide).
 * @param {string} raw
 * @returns {Array}
 */
export function parseActionsOutput(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  if (!text) return [];
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v)) return sanitizeActionItems(v);
    if (Array.isArray(v?.actions)) return sanitizeActionItems(v.actions);
    return [];
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const v = JSON.parse(m[0]);
        return Array.isArray(v) ? sanitizeActionItems(v) : [];
      } catch {
        /* illisible */
      }
    }
    return [];
  }
}

/**
 * Règles de génération de titre (node n8n « Generate Title », gpt-5-mini).
 * n8n envoyait les deux messages en rôle « assistant » (accident d'UI
 * vraisemblable) ; on les passe en system/user, même intention.
 */
export const TITLE_RULES = `Tu génères un titre TRÈS court (4 à 5 mots MAXIMUM) qui résume le sujet d'une réunion.

Règles strictes :
- 5 mots maximum, jamais plus — un titre de 6 mots est une erreur
- Pas de guillemets, pas de ponctuation finale
- Même langue que le contenu fourni
- Concret et spécifique (noms propres, sujet métier) plutôt que générique
- Va droit au sujet : pas de préambule (« Réunion sur… », « Point concernant… »)
- Si le contenu est vide ou inintelligible, retourne exactement : Réunion sans titre
- Retourne UNIQUEMENT le titre, aucun autre texte, aucune explication`;

/**
 * Message utilisateur pour la génération de titre.
 * @param {{resume: string, transcription: string}} params
 * @returns {string}
 */
export function titleUserMessage({ resume, transcription }) {
  return `Résumé HTML :
${resume ?? ''}

Transcription (à utiliser uniquement si le résumé est vide) :
${transcription ?? ''}`;
}

export const UNTITLED_MEETING = 'Réunion sans titre';

/**
 * Plafond DUR du nombre de mots. La consigne du prompt ne suffit pas : le
 * modèle rend régulièrement une phrase entière, et la sidebar tronque alors au
 * milieu d'un mot avec une ellipse — l'utilisateur n'y lit plus le sujet.
 */
export const TITLE_MAX_WORDS = 5;

/**
 * Coupe à TITLE_MAX_WORDS et retire la ponctuation de liaison laissée par la
 * coupe (« Budget 2026, priorités » → pas de virgule orpheline en fin).
 * @param {string} title
 * @returns {string}
 */
function capWords(title) {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length <= TITLE_MAX_WORDS) return title;
  return words
    .slice(0, TITLE_MAX_WORDS)
    .join(' ')
    .replace(/[,;:–—-]+$/, '')
    .trim();
}

/**
 * Sanitise le titre généré (node n8n « Add title field ») : trim, guillemets
 * d'encadrement, ponctuation finale, 80 caractères max, plafond de mots, repli
 * si vide.
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeTitle(raw) {
  const cleaned = String(raw || UNTITLED_MEETING)
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/[.!?]+$/, '')
    .slice(0, 80)
    .trim(); // trim final en plus de n8n : pas d'espace résiduel après strip
  return capWords(cleaned) || UNTITLED_MEETING;
}

/**
 * Relecture des dernières phrases transcrites à la lumière des notes de
 * réunion (POST /api/refine-transcript). Le résumé sait déjà s'appuyer sur la
 * graphie des notes (buildNotesBlock côté client) ; ici c'est la transcription
 * AFFICHÉE qui est corrigée, après coup et sur place. Prompt né ici, pas dans
 * n8n : la consigne « verbatim » du haut de fichier ne le concerne pas.
 *
 * Les règles énumèrent LIMITATIVEMENT les trois cas où les notes autorisent
 * une correction (consigne explicite, définition de sigle, variante quasi
 * identique du même mot) : la formulation d'origine (« la graphie des notes
 * fait foi » + correspondance phonétique laissée au modèle) faisait remplacer
 * n'importe quel prénom de la transcription par celui des notes. Le
 * contre-exemple Sophie/Marc reste dans le prompt — les modèles suivent les
 * exemples mieux que les règles abstraites. Le client garde en plus une garde
 * déterministe (isPlausibleRefinement, src/utils/transcriptRefine.js) qui
 * rejette toute substitution non quasi-identique hors consigne explicite.
 *
 * Resserré une 2e fois (retour terrain 2026-08-28, corrections toujours trop
 * larges) : « ne change rien » posé comme règle par défaut AVANT les cas
 * permis, et un mot réel correctement transcrit (« Alexe », « Marc ») ne se
 * corrige plus que sur consigne explicite — le cas 3 est réservé aux mots
 * manifestement écorchés (« Saufi », « Fabrican »). Corriger le prénom de
 * l'utilisateur demande donc d'écrire « Remplace Alexe par Alex » : voulu.
 * @param {{sentences: string[], notes: string}} params
 * @returns {string}
 */
export function refineTranscriptPrompt({ sentences, notes }) {
  return [
    'Tu corriges une transcription automatique de réunion.',
    "L'utilisateur a tapé des notes à la main pendant la réunion. Elles servent à corriger des GRAPHIES écorchées par le moteur de transcription — jamais à réécrire ce qui a été dit.",
    '',
    "RÈGLE PAR DÉFAUT : NE CHANGE RIEN. Une correction est une exception rare qui doit se justifier par l'un des trois cas ci-dessous. Si tu hésites entre corriger et laisser, LAISSE.",
    '',
    'INTERDICTIONS ABSOLUES, AVANT TOUTE CORRECTION :',
    '- Un nom des notes ne remplace JAMAIS un nom différent. Notes « réunion avec Sophie, AIR FRANCE » et phrase « Marc présente le budget » : « Marc » reste « Marc ».',
    "- Un mot correctement transcrit — un vrai mot français, un prénom ou un nom qui existe (« Alexe », « Marc », « Martin ») — ne se corrige JAMAIS de ta propre initiative, même s'il ressemble à un terme des notes. Seule une consigne explicite (cas 1) peut le changer.",
    "- Une personne ou une société simplement MENTIONNÉE dans les notes (« réunion avec Sophie, chef des ventes ») n'est pas une consigne de remplacement.",
    '- Ne reformule pas, ne résume pas, ne change ni la ponctuation ni les autres mots.',
    '',
    'UNE CORRECTION EST PERMISE DANS TROIS CAS, ET SEULEMENT CEUX-LÀ :',
    '1. Les notes donnent une consigne explicite de remplacement (« Remplace Alexe par Alex », « Alexe → Alex ») : applique-la, exactement elle et rien de plus.',
    "2. Les notes définissent un terme ou un sigle (« SAL : système d'aide pour les lentilles ») ET la phrase contient un mot QUASI IDENTIQUE phonétiquement (« sale », « salle ») dont le sens dans la phrase désigne manifestement ce terme : rétablis le terme (« SAL »).",
    "3. La phrase contient un mot MANIFESTEMENT écorché — qui n'est ni un mot français, ni un prénom ou un nom existant (« Saufi », « Fabrican », « Klobex ») — et un terme des notes en est phonétiquement indiscernable : rétablis la graphie des notes (« Saufi » → « Sophie », « Fabrican » → « Fabrikam »).",
    '',
    "Si une phrase n'a rien à corriger, renvoie-la STRICTEMENT identique.",
    'Réponds UNIQUEMENT en JSON : {"sentences": [...]} — même nombre de phrases, même ordre.',
    '',
    '#NOTES',
    notes,
    '',
    '#PHRASES',
    JSON.stringify(sentences),
  ].join('\n');
}

/**
 * Extrait le tableau de phrases relues de la sortie du modèle. Tolère les
 * fences markdown et les deux formes ({"sentences": [...]} ou tableau nu),
 * comme parseActionsOutput. Toute réponse qui n'aligne pas `count` chaînes
 * est nulle : l'appelant renverra les phrases d'origine, inchangées.
 * @param {string} raw
 * @param {number} count
 * @returns {string[]|null}
 */
export function parseRefineOutput(raw, count) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.sentences;
  if (!Array.isArray(list) || list.length !== count) return null;
  return list.every((s) => typeof s === 'string') ? list : null;
}

// ── Infographie de compte rendu ──────────────────────────────────────────────

/**
 * Plafond des matériaux envoyés au modèle (transcription tronquée comprise).
 * Hérité de la limite de prompt de gpt-image-1 (32 000 caractères) ; gardé
 * tel quel avec les gabarits : il borne le coût et la durée de l'appel, et la
 * troncature début + fin garde l'ouverture et les conclusions de la réunion.
 */
export const INFOGRAPHIC_PROMPT_MAX = 30000;

/**
 * Plafond du « style graphique » d'Administration → IA. Ce réglage ne
 * s'applique plus depuis les gabarits (2026-11-17) — les couleurs et le logo
 * viennent de l'Apparence — mais la valeur enregistrée reste lue et bornée par
 * l'API des réglages, qui l'accepte toujours.
 */
export const INFOGRAPHIC_STYLE_MAX = 1000;

/**
 * Règles du modèle qui écrit le CONTENU de l'infographie (lib/infographic.js),
 * dans le contrat de lib/infographicLayout.js. Il ne dessine plus rien : six
 * gabarits mettent ce contenu en page avec le logo et les couleurs de
 * l'organisation.
 *
 * Ce qui reste des règles de l'ère « image » (2026-08-31 → 2026-11-17) :
 *   - le contenu principal vient de la TRANSCRIPTION (mesuré : un modèle qui
 *     reçoit actions et notes en tête en fait toute sa matière) ;
 *   - chaque donnée prend une FORME — un chiffre avec cible devient une barre,
 *     une part un anneau, des dates une frise — d'où les champs `forme`,
 *     `jalons`, `repartition` : c'est le gabarit qui dessine, mais c'est le
 *     modèle qui sait ce que le chiffre veut dire ;
 *   - un budget de mots, parce qu'une infographie se lit en quelques secondes ;
 *   - la langue de l'interface, pas celle de la transcription (2026-10-21).
 *
 * Les ACTIONS ne sont pas recopiées par le modèle : l'application les pose
 * elle-même, telles que l'écran les montre (cf. layoutActions). Il les reçoit
 * pour comprendre la réunion, et pour remplir `prochaineEtape`.
 *
 * Le JSON est demandé COMPACT (une ligne, sans indentation) : la réponse
 * s'écrit jeton par jeton, et l'indentation d'un JSON lisible pèse environ un
 * quart de ses caractères (mesuré au banc sur six contenus types, 2026-11-17).
 *
 * Le CHOIX du gabarit est le sien, sur ce qui DÉCOULE de la réunion, avec le
 * modèle de compte rendu choisi par l'utilisateur pour indice. Le code ne
 * retient ce choix que si la matière suit (cf. hasContentFor) : le modèle ne
 * peut pas produire une page vide.
 */
export const INFOGRAPHIC_LAYOUT_RULES = [
  "Tu es designer d'information. Tu prépares le CONTENU de l'infographie d'une réunion : UNE page A4 portrait qu'un gabarit graphique mettra en page, avec le logo et les couleurs de l'organisation, des pictogrammes et des graphiques. Tu ne dessines rien et tu n'écris aucun code : tu remplis un objet JSON.",
  "La page est un A4 : chaque mot compte. Préfère peu d'éléments bien remplis à beaucoup d'éléments creux, et tiens-toi aux nombres maximums ci-dessous.",
  "Le message de l'utilisateur — sa demande suivie des matériaux de la réunion — t'est fourni tel quel.",
  '',
  'CHOIX DU GABARIT (clé "gabarit") — prends celui qui montre le mieux ce qui DÉCOULE de la réunion :',
  '- "decision" : la réunion a tranché une ou plusieurs questions, en pesant des options ou des scénarios ;',
  '- "feuille_de_route" : la réunion a fixé un calendrier — au moins trois étapes ou échéances datées ;',
  '- "tableau_de_bord" : la réunion a passé des chiffres en revue — budget, ventes, production, indicateurs — dont au moins deux mesurables ;',
  '- "atelier" : la réunion a produit des idées — brainstorming, atelier, recherche de solutions ;',
  '- "bilan" : la réunion revient sur une période ou un projet écoulé — rétrospective, retour d\'expérience ;',
  '- "synthese" : tous les autres cas — point d\'équipe, réunion d\'information, réunion mixte. En cas de doute, "synthese".',
  "Le modèle de compte rendu choisi par l'utilisateur, s'il figure dans la demande, est un indice, pas une obligation.",
  '',
  'RUBRIQUES À REMPLIR SELON LE GABARIT — les autres restent vides ([] ou null) :',
  '- toujours : titre, sousTitre, heros, participants, prochaineEtape ;',
  '- "synthese" : sujets (2 à 4), chiffres (jusqu’à 3 chiffres clés), decisions ;',
  '- "decision" : heros = LA décision prise, options (2 ou 3, une seule "retenue": true), decisions (les autres décisions), vigilances ;',
  '- "feuille_de_route" : heros = l’objectif ou l’échéance finale, jalons (3 à 6, dans l’ordre chronologique), decisions, vigilances ;',
  '- "tableau_de_bord" : chiffres (2 à 4), repartition si un total se décompose, vigilances ;',
  '- "atelier" : heros = la question travaillée, idees (2 à 4 thèmes, les idées marquantes "retenue": true), decisions (les suites décidées) ;',
  '- "bilan" : heros = le verdict de la période, bilan (les trois colonnes), chiffres (jusqu’à 2).',
  '',
  'FORMAT DE SORTIE : un seul objet JSON, sans texte autour ni balises de code, avec exactement ces clés :',
  '{',
  '  "gabarit": "synthese" | "decision" | "feuille_de_route" | "tableau_de_bord" | "atelier" | "bilan",',
  '  "titre": ce qui ressort de la réunion, 4 à 9 mots (jamais « Réunion du … »),',
  '  "sousTitre": le contexte en une phrase de 20 mots au plus,',
  '  "heros": { "valeur": très court, affiché en très grand — un chiffre avec son unité, une date, un mot (« 2 févr. », « 72 % », « Go ») —, "libelle": ce qu’il signifie, 15 mots au plus, "icone": un pictogramme },',
  '  "chiffres": [ { "libelle": 5 mots au plus, "valeur": nombre, "unite": texte court (« % », « k€ », « jours ») ou "", "cible": nombre ou null, "precedent": nombre ou null, "forme": "valeur" | "part" | "progression" | "objectif" | "evolution", "note": 8 mots au plus ou "" } ] — 4 au plus,',
  '  "repartition": null ou { "titre": 6 mots au plus, "unite": texte court, "elements": [ { "libelle": 4 mots au plus, "valeur": nombre } ] — 2 à 5 },',
  '  "sujets": [ { "titre": 4 mots au plus, "icone": un pictogramme, "points": [ 1 à 3 lignes de 12 mots au plus ] } ] — 4 au plus,',
  '  "decisions": [ 15 mots au plus chacune ] — 4 au plus,',
  '  "vigilances": [ risques ou points ouverts, 15 mots au plus chacun ] — 3 au plus,',
  '  "jalons": [ { "quand": la date telle qu’elle doit s’afficher, courte (« 28 nov. », « Fin janv. », « T2 »), "libelle": 6 mots au plus, "detail": 10 mots au plus ou "", "etat": "fait" | "a_venir" | "objectif" } ] — 6 au plus,',
  '  "options": [ { "titre": 6 mots au plus, "pour": [ 2 au plus, 10 mots chacun ], "contre": [ 2 au plus, 10 mots chacun ], "retenue": true | false } ] — 3 au plus,',
  '  "idees": [ { "theme": 4 mots au plus, "icone": un pictogramme, "idees": [ { "texte": 12 mots au plus, "votes": nombre entier ou null, "retenue": true | false } ] — 3 au plus } ] — 4 thèmes au plus,',
  '  "bilan": { "reussites": [ ce qui a marché ], "difficultes": [ ce qui a coincé ], "essais": [ ce qu’on essaiera ] } — 4 lignes de 12 mots au plus par colonne,',
  '  "participants": [ les personnes présentes, nom tel qu’écrit dans les matériaux ] — 10 au plus,',
  '  "prochaineEtape": la prochaine réunion ou échéance en une ligne, ou ""',
  '}',
  '',
  'FORMES DES CHIFFRES : "part" pour une part d’un tout (un pourcentage, ou une valeur sur sa cible) ; "progression" pour un avancement vers une cible (valeur ET cible) ; "objectif" pour un niveau à atteindre (valeur ET cible) ; "evolution" pour une variation depuis une valeur précédente (valeur ET precedent) ; "valeur" sinon. Les nombres sont des nombres JSON (1.32, jamais "1,32 M€") ; l’unité va dans "unite", jamais dans "valeur".',
  `PICTOGRAMMES : uniquement des noms de cette liste — ${INFOGRAPHIC_ICONS.join(', ')}. Choisis celui qui évoque le sujet, pas un au hasard.`,
  '',
  "N'invente rien : chaque texte, chiffre, date et nom vient des matériaux. Une rubrique sans matière reste vide plutôt que remplie au hasard. Recopie noms propres et sigles EXACTEMENT (les notes font foi pour les graphies).",
  "Les actions de la réunion sont affichées par l'application elle-même : ne les recopie dans aucune rubrique.",
  'La demande fixe la LANGUE de l’infographie : tous les textes s’écrivent dans cette langue, même si les matériaux sont dans une autre — traduis-les alors fidèlement.',
  'Des libellés courts et concrets, sans phrase de remplissage, sans markdown, sans émoji.',
  'Réponds uniquement par l’objet JSON, COMPACT : sur une seule ligne, sans indentation ni retour à la ligne.',
].join('\n');

/** La langue de l'infographie, nommée dans la phrase de la demande. */
const LANGUAGE_NAMES = { fr: 'en français', en: 'en anglais' };

/**
 * Modèles de compte rendu intégrés (src/config/templates.js), nommés pour
 * l'indice de la demande. Un modèle personnel n'a pas de nom ici : pas
 * d'indice plutôt qu'un identifiant que le modèle ne saurait pas lire.
 */
const SUMMARY_TEMPLATE_NAMES = {
  standard: 'Standard',
  decision: 'Réunion de décision',
  rh: 'Entretien RH',
  brainstorming: 'Brainstorming',
  planning: 'Planification',
  retrospective: 'Rétrospective',
};

/** Bornes des blocs fixes, pour que la transcription garde l'essentiel de la place. */
const INFOGRAPHIC_NOTES_MAX = 4000;
const INFOGRAPHIC_ACTIONS_MAX = 3000;

/**
 * La DEMANDE envoyée au modèle de contenu : une consigne courte, puis les
 * trois matériaux.
 *
 * ⚠️ ORDRE MESURÉ (2026-08-31) : la première version plaçait #ACTIONS puis
 * #NOTES en tête et la transcription en queue — le modèle recopiait les deux
 * blocs étiquetés et IGNORAIT la transcription. D'où : la transcription
 * d'abord (c'est le contenu), une phrase qui le dit explicitement, actions et
 * notes en complément à la fin. La transcription reste la seule tronquée
 * (début + fin).
 *
 * `language` est celle de l'interface (repli fr) ; `template` le modèle de
 * compte rendu de la réunion, donné en indice pour le choix du gabarit.
 *
 * @param {{transcription?: string, actions?: Array, notes?: string,
 *          language?: string, template?: string}} params
 * @returns {string}
 */
export function infographicPrompt({
  transcription = '',
  actions = [],
  notes = '',
  language,
  template,
} = {}) {
  const lang = normalizeLang(language);
  // Seules les actions NON MASQUÉES : une action retirée par l'utilisateur
  // (`show: false`) reste en base et dans le corps de /resume, mais ne doit
  // pas inspirer l'infographie — même règle que l'écran et le compte rendu
  // (une action sans champ `show` est visible).
  const actionLines = (Array.isArray(actions) ? actions : [])
    .filter((a) => a && a.show !== false)
    .map((a) =>
      [a?.text || a?.title || a?.description || '', a?.assignee || a?.owner || '', a?.dueDate || '']
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .join(' — '),
    )
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join('\n')
    .slice(0, INFOGRAPHIC_ACTIONS_MAX);
  const templateName = Object.hasOwn(SUMMARY_TEMPLATE_NAMES, template || '')
    ? SUMMARY_TEMPLATE_NAMES[template]
    : '';
  const intro = [
    "Prépare le contenu de l'infographie de cette réunion, à partir de sa transcription, des actions qui en découlent et des notes que je te joins.",
    "Le contenu principal de l'infographie vient de la TRANSCRIPTION — les sujets abordés, les décisions et les chiffres qui s'y trouvent ; les actions et les notes la complètent.",
    `Tous les textes de l'infographie sont rédigés ${LANGUAGE_NAMES[lang] || `dans la langue « ${lang} »`}, même si la transcription, les actions ou les notes sont dans une autre langue.`,
    ...(templateName
      ? [
          `Modèle de compte rendu choisi par l'utilisateur pour cette réunion : « ${templateName} ».`,
        ]
      : []),
    '',
    '#TRANSCRIPTION DE LA RÉUNION',
  ].join('\n');
  const tail = [
    '',
    '',
    '#ACTIONS',
    actionLines || '(aucune)',
    '',
    '#NOTES',
    String(notes || '')
      .trim()
      .slice(0, INFOGRAPHIC_NOTES_MAX) || '(aucune)',
  ].join('\n');
  const text = String(transcription || '');
  const room = INFOGRAPHIC_PROMPT_MAX - intro.length - tail.length - 1;
  const excerpt =
    text.length <= room
      ? text
      : `${text.slice(0, Math.max(0, room - 6100))}\n[…]\n${text.slice(-6000)}`;
  return `${intro}\n${excerpt}${tail}`;
}
