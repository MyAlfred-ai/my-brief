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
  // Réunions où tout est cadencé : on ne veut QUE ce qui est posé comme une tâche.
  explicit: `   Ne retiens QUE les actions ANNONCÉES COMME TELLES : la phrase contient un mot déclencheur, ou énonce la tâche en la posant explicitement comme une tâche à faire ("Action : Marie envoie le compte rendu vendredi", "à faire : commander les badges", "on note que Paul rappelle le fournisseur lundi").
   Ce niveau est volontairement SÉVÈRE. Ne sont PAS des actions ici, même si la tâche paraît utile ou évidente :
   - un engagement pris au fil de la parole, sans annonce : "je m'en occupe", "je te fais ça ce soir", "oui je le fais cet après-midi" ;
   - une demande, une question ou une consigne lancée dans la discussion : "tu peux relancer le client ?", "il faut envoyer le devis avant vendredi", "il faudrait préparer la démo" ;
   - un besoin, un constat, une idée ou une intention : "on devrait revoir nos tarifs", "penser à réserver la salle".
   Dans le doute, ne ressors RIEN : ici une action manquée est préférable à une action de trop.`,
  // Défaut. Le critère est le PORTEUR : quelqu'un s'engage, ou la tâche est
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
 * bloc `detection` de son document de réglages). Sans réglages, le prompt rendu
 * est celui d'avant cet écran : un compte qui ne touche à rien ne change pas.
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
  const sensitivity = SENSITIVITY_RULES[settings.sensitivity] ? settings.sensitivity : 'balanced';
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
 * Marge sous la limite de prompt de gpt-image-1 (32 000 caractères) : le seul
 * garde-fou conservé. Le style, lui, reste laissé au modèle PAR DÉFAUT —
 * demande explicite du 2026-08-31, après une première version qui imposait
 * NOTRE habillage (flat design, accent orange) jugé pauvre. Ce qui a changé le
 * 2026-09-09 : une installation peut désormais imposer LE SIEN
 * (`infographicStyle`, Administration → IA). Facultatif, et vide par défaut :
 * l'arbitrage rejeté était un habillage subi, pas la possibilité d'en choisir un.
 */
export const INFOGRAPHIC_PROMPT_MAX = 30000;

/**
 * Plafond du style graphique imposé par l'administration (réglage
 * Administration → IA). Court volontairement : c'est une charte — couleurs,
 * ton, mentions à faire figurer —, pas un prompt, et il passe devant des
 * matériaux déjà bornés par INFOGRAPHIC_PROMPT_MAX.
 */
export const INFOGRAPHIC_STYLE_MAX = 1000;

/**
 * Réécriture du prompt d'image par un modèle TEXTE — c'est ce que fait
 * l'application ChatGPT quand on lui demande une image, et c'est ce qui
 * manquait à l'appel API direct (mesuré 2026-08-31 : sans elle, gpt-image-1
 * reçoit les matériaux bruts et rend une image plate, « pas du tout étayée » ;
 * la référence de l'utilisateur, obtenue dans ChatGPT, passait par cette
 * réécriture implicite).
 *
 * Le réécrivain décrit AUSSI la maquette — zones délimitées, pictogrammes,
 * tableau des actions, frise — et choisit sa palette : mesuré le 2026-09-01,
 * lui interdire le graphisme produisait une PAGE DE TEXTE, pas une
 * infographie, là où la référence ChatGPT en décrit un complet. La seule
 * interdiction qui reste est d'imposer NOTRE habillage : aucune marque,
 * aucune couleur myBrief — c'était le reproche fait à la toute première
 * version, pas le design en soi.
 *
 * DIRECTION ARTISTIQUE (2026-09-15). Constat sur les images produites :
 * contenu juste, forme pauvre. Les règles demandaient bien une maquette, mais
 * en termes génériques (« palette professionnelle harmonieuse », « hiérarchie
 * forte ») : le réécrivain rendait une liste de zones remplies de phrases, et
 * le modèle d'image en faisait un document à cases. Les règles disent
 * désormais ce qu'un directeur artistique exigerait, en termes que le modèle
 * d'image sait suivre : l'architecture de la page (bandeau, UN élément héros,
 * grille de cartes, tableau des actions, pied qui ferme), la traduction de
 * chaque donnée en forme graphique (grand nombre, barres, frise, coche,
 * badge), une palette NOMMÉE EN HEXADÉCIMAL (« bleu nuit » se rend au hasard,
 * un code se rend tel quel), trois tailles de texte, un budget de mots, et
 * les textes de l'image ENTRE GUILLEMETS pour que le modèle distingue la
 * consigne du lettrage. Le format reste la page portrait 2:3 (1024 × 1536,
 * cf. lib/infographic.js), « A4 portrait » côté produit.
 *
 * Le budget de texte n'est PAS la règle de densité retirée le 2026-09-02
 * (4 à 6 zones, contre les pieds coupés de gpt-image-1) : c'est une règle de
 * LISIBILITÉ — 400 mots sur une page en font un document, quel que soit le
 * cadrage. Non re-mesuré sur génération réelle depuis ce dépôt (clé et
 * facturation de l'organisation) : à juger en recette, en régénérant une
 * réunion connue.
 *
 * LANGUE (2026-10-21) : les textes de l'image suivaient « la langue des
 * matériaux », donc celle de la transcription — une réunion en anglais
 * donnait une infographie anglaise sous une interface française, et
 * inversement. La langue est désormais celle de l'interface, comme le compte
 * rendu ; elle voyage dans la DEMANDE, pour la même raison que la charte
 * ci-dessous : le repli doit la respecter aussi.
 *
 * La charte de l'installation (facultative) n'est PAS écrite ici : elle vient
 * de l'administration, elle change d'un client à l'autre, et elle voyage donc
 * avec la DEMANDE (cf. infographicPrompt). Ces règles ne font qu'établir sa
 * PRÉSÉANCE — sans cette ligne, le réécrivain arbitre entre elle et le libre
 * choix de palette que la règle précédente lui accorde, et une infographie
 * sur deux sort hors charte.
 */
export const INFOGRAPHIC_WRITER_RULES = [
  // Le modèle d'image n'est PLUS nommé ici (il l'était : « gpt-image-2 ») :
  // c'est devenu un réglage d'installation (lib/infographicModels.js), et une
  // règle qui nommerait un modèle mentirait dès qu'un administrateur en change.
  "Tu es directeur artistique et designer d'information. Tu prépares le prompt d'un modèle de génération d'images qui dessinera l'infographie d'une réunion.",
  "Le message de l'utilisateur — sa demande d'infographie suivie des matériaux de la réunion — t'est fourni tel quel.",
  "Écris le prompt complet d'une VÉRITABLE infographie professionnelle : une composition graphique où chaque information a une forme visuelle — pas un document à cases, pas une page de texte.",
  '',
  'FORMAT : une seule page portrait (proportions 2:3, proches d’un A4), lue de haut en bas, marges égales sur les quatre bords, tout le contenu à l’intérieur du cadre.',
  '',
  'ARCHITECTURE DE LA PAGE — décris chaque zone de haut en bas, avec sa position et la part de hauteur qu’elle occupe :',
  '- un bandeau de titre (environ 12 % de la hauteur) : le titre de la réunion en 3 à 6 mots, un sous-titre avec la date et le contexte s’ils figurent dans les matériaux ;',
  '- UN élément héros sous le bandeau, plus grand que tout le reste : le chiffre, la décision ou l’objectif majeur de la réunion, en très grand, avec son libellé ;',
  '- une grille de 3 à 6 cartes, sur deux colonnes en général, une par sujet : titre court, pictogramme, 2 à 4 lignes ;',
  '- un tableau des actions (action, responsable, échéance) ; sans action, une carte « prochaines étapes » ;',
  '- un pied de page fin qui ferme la composition : participants, prochaine échéance ou synthèse en une ligne.',
  'Adapte le nombre de cartes à la matière — peu de cartes pleines plutôt que beaucoup de cartes creuses ; aucune zone vide ni purement décorative.',
  '',
  'TRADUCTION VISUELLE — ce qui distingue une infographie d’un document : chaque donnée prend une forme graphique, pas seulement une phrase.',
  '- un chiffre → un grand nombre avec son unité et son libellé ; plusieurs chiffres comparables → des barres horizontales ; une part d’un tout → un anneau ou une jauge ; une progression → une barre de progression ;',
  '- des dates ou des étapes → une frise horizontale à jalons ;',
  '- une décision → une carte mise en valeur, marquée d’une coche ;',
  '- un risque ou un point ouvert → une carte signalée par un pictogramme d’alerte ;',
  '- une action → une ligne du tableau, le responsable en pastille (prénom ou initiales), l’échéance en badge ;',
  '- des personnes ou des contacts → des pastilles nominatives.',
  'Un pictogramme simple par carte et par action, tous du même style : trait fin, même épaisseur, même couleur.',
  '',
  'TYPOGRAPHIE : une seule famille sans empattement ; trois tailles seulement (titre, intertitres, corps) ; texte horizontal, aligné à gauche, jamais incliné, courbé ni en perspective ; le corps reste lisible en vignette.',
  '',
  'COULEURS : choisis une palette adaptée au sujet — sobre pour un comité ou un budget, plus chaleureuse pour une équipe ou un atelier — et nomme chaque couleur par son code hexadécimal : un fond uni (clair ou sombre), une couleur de texte très contrastée, UNE couleur d’accent, une ou deux couleurs secondaires, des gris neutres. Quatre teintes au plus hors neutres ; des aplats, des dégradés très légers seulement. Toutes les cartes reçoivent le même traitement : coins arrondis, ombre douce ou bordure fine.',
  '',
  'BUDGET DE TEXTE : entre 150 et 250 mots sur l’image, jamais de paragraphe — des libellés de 8 mots au plus, 2 à 4 lignes par carte, les chiffres en grand plutôt qu’en phrase. Chaque texte à faire figurer est écrit dans le prompt entre guillemets doubles (" … "), exactement tel qu’il doit apparaître, dans la langue de l’infographie fixée par la demande.',
  '',
  'INTERDITS, à rappeler dans le prompt : texte de remplissage ou faux mots, photo, rendu 3D, logo ou marque, filigrane, zone vide, élément coupé par un bord, texte illisible.',
  '',
  "Si la demande porte un style graphique imposé, il PRIME sur tes propres choix — couleurs, typographie, mise en page, mentions à faire figurer : reporte-le fidèlement et explicitement dans le prompt d'image.",
  'TOUT le contenu vient des matériaux fournis : sujets, décisions, chiffres, échéances, personnes — riche et fidèle. Le contenu principal vient de la transcription ; les actions et les notes le complètent.',
  'La demande fixe la LANGUE de l’infographie : tous les textes de l’image s’écrivent dans cette langue, même si les matériaux sont dans une autre — traduis-les alors fidèlement.',
  "N'invente rien, et recopie noms propres et sigles EXACTEMENT (les notes font foi pour les graphies).",
  '',
  'FORME DU PROMPT : une description continue, dans la langue de l’infographie, dans cet ordre — une phrase qui résume l’image (nature, style, format, sujet), le style et la palette, chaque zone de haut en bas avec sa position, sa taille relative, son pictogramme et ses textes entre guillemets, la typographie, puis les interdits. Pas de markdown ni de titres en capitales : tout ce qui n’est pas entre guillemets est une consigne, tout ce qui est entre guillemets s’affiche.',
  'Réponds uniquement par le prompt, sans commentaire.',
].join('\n');

// Les règles de densité (réécrivain) et de cadrage (prompt d'image) ajoutées
// contre les pieds coupés de gpt-image-1 ont été RETIRÉES le 2026-09-02 :
// gpt-image-2 compose entier et sans coquille sans elles (mesuré, même
// réunion). Ne pas les réintroduire sans re-mesurer — elles bridaient la
// maquette (4 à 6 zones) pour compenser un défaut du modèle précédent. Le
// budget de texte et la grille de cartes ci-dessus sont d'une autre nature
// (lisibilité, cf. le commentaire de tête) et n'ajoutent rien au prompt
// d'IMAGE : ils guident le réécrivain seulement.

/** La langue de l'infographie, nommée dans la phrase de la demande. */
const LANGUAGE_NAMES = { fr: 'en français', en: 'en anglais' };

/** Bornes des blocs fixes, pour que la transcription garde l'essentiel de la place. */
const INFOGRAPHIC_NOTES_MAX = 4000;
const INFOGRAPHIC_ACTIONS_MAX = 3000;

/**
 * LE prompt envoyé au modèle d'image — un seul appel, sans étape de
 * condensation : la consigne est celle de l'utilisateur, telle quelle, suivie
 * des trois matériaux (et de la charte de l'installation, si elle en a une).
 *
 * ⚠️ ORDRE MESURÉ (2026-08-31) : la première version plaçait #ACTIONS puis
 * #NOTES en tête et la transcription en queue — l'image générée était un
 * poster « ACTIONS » qui recopiait les deux blocs étiquetés et IGNORAIT la
 * transcription. Un modèle d'image dessine ce qui est court, structuré et
 * proche de la consigne. D'où : la transcription d'abord (c'est le contenu),
 * une phrase qui le dit explicitement, actions et notes en complément à la
 * fin. La transcription reste la seule tronquée (début + fin).
 *
 * `style` est la charte de l'installation (Administration → IA), FACULTATIVE :
 * elle est posée dans la DEMANDE, en phrase, et non dans un bloc étiqueté —
 * un bloc en tête se fait recopier tel quel sur l'image (leçon #ACTIONS
 * ci-dessus). La demande porte déjà des consignes en phrases, que le modèle
 * n'écrit jamais dans l'image. Elle voyage avec les matériaux, et non dans les
 * règles du réécrivain, pour que le REPLI (réécriture en panne, les matériaux
 * bruts partent au modèle d'image) la respecte lui aussi.
 *
 * `language` est celle de l'interface (repli fr) : posée elle aussi en phrase
 * dans la demande, pour la même raison — et parce que, sans elle, le modèle
 * écrivait l'image dans la langue de la transcription.
 *
 * @param {{transcription?: string, actions?: Array, notes?: string, style?: string,
 *          language?: string}} params
 * @returns {string}
 */
export function infographicPrompt({
  transcription = '',
  actions = [],
  notes = '',
  style = '',
  language,
} = {}) {
  const lang = normalizeLang(language);
  // Seules les actions NON MASQUÉES : une action retirée par l'utilisateur
  // (`show: false`) reste en base et dans le corps de /resume, mais ne doit
  // pas ressortir sur l'image — même règle que l'écran et le compte rendu
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
  const styleLine = String(style || '')
    .trim()
    .slice(0, INFOGRAPHIC_STYLE_MAX);
  const intro = [
    'Fais une infographie en fonction de cette transcription de réunion, des actions qui en découlent et de ces notes que je te joins.',
    "Le contenu principal de l'infographie vient de la TRANSCRIPTION — les sujets abordés, les décisions et les chiffres qui s'y trouvent ; les actions et les notes la complètent.",
    `Tous les textes de l'infographie sont rédigés ${LANGUAGE_NAMES[lang] || `dans la langue « ${lang} »`}, même si la transcription, les actions ou les notes sont dans une autre langue.`,
    // Absente quand l'organisation n'impose rien : le modèle retrouve alors
    // exactement la demande d'avant ce réglage, et son libre choix de palette.
    ...(styleLine
      ? [
          `Style graphique imposé pour cette infographie, prioritaire sur tout autre choix esthétique : ${styleLine}`,
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
