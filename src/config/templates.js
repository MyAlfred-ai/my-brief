/**
 * Template definitions for AI summary generation.
 * Each entry: value, icon, labels (UI), instructions + scaffold (+ scaffoldEn),
 * turned into the system prompt sent to OpenAI by resolveSummaryPlan — and,
 * optionally, `pageMeter`: the default position of the Pagimètre (summary
 * length in pages, cf. src/lib/pageMeter.js), absent when the template does
 * not offer it.
 */

import { toStoredActions, hasActionContent } from '../utils/liveActionsMerge.js';
import { normalizePages, effectivePages, countWords, wordsForPages } from '../lib/pageMeter.js';

// ─── Shared helpers ────────────────────────────────────────────────────────

// Seules les actions NON MASQUÉES (`show: false` = retirée par l'utilisateur,
// gardée en base) — même règle que l'écran (App.visibleActions) et que
// l'infographie (api/lib/prompts.js) : une action sans champ `show` est visible.
// Ni carte vierge, ni texte de remplacement d'autrefois (« À définir »…) : ce
// qui n'a pas été écrit ne se retrouve pas dans le compte rendu.
function serializeActions(actions, language) {
  const visible = toStoredActions(actions).filter((a) => a.show !== false && hasActionContent(a));
  if (visible.length === 0) return language === 'en' ? 'No actions' : 'Aucune action';
  // Rendu en PUCES MARKDOWN (converties en <ul><li> par scaffoldMdToHtml puis
  // recopiées telles quelles par le LLM). NE PAS sérialiser en JSON : le scaffold
  // étant gardé « mot pour mot », un JSON.stringify ressortait brut dans le
  // résumé final (section Actions affichée sous forme de tableau JSON).
  const clean = (v) =>
    String(v ?? '')
      .replace(/\s+/g, ' ') // newlines/tabs -> espace (sinon la puce Markdown casse)
      .replace(/^[\s*#>\-]+/, '') // évite l'injection de markdown en début de champ
      .trim();
  return visible
    .map((a) => {
      const title = clean(a.title) || clean(a.description) || 'Action';
      const desc = clean(a.description);
      const meta = [clean(a.owner), clean(a.dueDate)].filter(Boolean).join(' · ');
      let line = `- **${title}**`;
      if (meta) line += ` — ${meta}`;
      if (desc && desc !== title) line += ` — ${desc}`;
      return line;
    })
    .join('\n');
}

function formatNow() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const HH = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${HH}:${min}`;
}

const TON_MAP = ['Sérieux', 'Pro', 'Détendu'];
const TON_INSTRUCTIONS = {
  Sérieux: 'ton sérieux, factuel, sans humour ni familiarité. Phrases nettes, vocabulaire formel.',
  Pro: 'ton professionnel, clair et structuré, sans rigidité excessive. Style entreprise.',
  Détendu:
    'ton décontracté, accessible, légèrement informel. Phrases naturelles, parfois directes.',
};

function tonLabel(ton) {
  return TON_MAP[ton] ?? null;
}

function tonInstruction(ton) {
  const label = tonLabel(ton);
  return label ? TON_INSTRUCTIONS[label] : null;
}

function longueurLabel(longueur) {
  if (longueur === null || longueur === undefined) return null;
  if (longueur <= 30) return 'court';
  if (longueur <= 70) return 'moyen';
  return 'long et détaillé';
}

function longueurInstruction(longueur) {
  if (longueur === null || longueur === undefined) return null;
  if (longueur <= 30)
    return 'résumé concis, 5 à 7 lignes maximum, uniquement les points essentiels.';
  if (longueur <= 70) return 'résumé équilibré, 10 à 15 lignes, points clés et contexte minimal.';
  return 'résumé détaillé, structuré en sous-sections, contexte complet et nuances incluses.';
}

/**
 * Build the high-priority personalization block. Inserted near the top of the
 * system prompt so user choices take precedence over template defaults.
 * Returns empty string when no customization is provided.
 */
export function buildPersonalizationBlock(ctx) {
  const lines = [];
  const tonName = tonLabel(ctx.ton);
  const longName = longueurLabel(ctx.longueur);
  const hasCustom = !!ctx.customPrompt;
  const userContext = (ctx.userContext && String(ctx.userContext).trim()) || '';
  const orgContext = (ctx.orgContext && String(ctx.orgContext).trim()) || '';

  if (!tonName && !longName && !hasCustom && !userContext && !orgContext) {
    return '';
  }

  lines.push(
    '#PERSONNALISATION_UTILISATEUR — RÈGLES IMPÉRATIVES (priorité absolue sur le template ci-dessous)',
  );
  lines.push('');
  lines.push(
    "Les choix suivants ont été explicitement faits par l'utilisateur dans l'interface. Ils s'appliquent OBLIGATOIREMENT à la sortie. Toute consigne du template qui contredit l'une de ces règles est ignorée.",
  );
  lines.push('');

  if (tonName) {
    lines.push(`• TON : ${tonName} — ${tonInstruction(ctx.ton)}`);
  }
  if (longName) {
    lines.push(`• LONGUEUR : ${longName} — ${longueurInstruction(ctx.longueur)}`);
  }
  if (hasCustom) {
    lines.push(`• INSTRUCTIONS SUPPLÉMENTAIRES DE L'UTILISATEUR (à respecter strictement) :`);
    lines.push(`  « ${ctx.customPrompt} »`);
  }
  // L'organisation AVANT la personne : le premier est un vocabulaire (noms de
  // clients, sigles maison), le second dit qui parle. Du général au particulier,
  // et en cas de contradiction c'est le plus précis qui est lu en dernier.
  if (orgContext) {
    lines.push(
      `• VOCABULAIRE ET CONTEXTE DE L'ORGANISATION (noms de clients, de projets, sigles maison — sert à écrire correctement ces termes et à comprendre les allusions, sans le recopier tel quel) :`,
    );
    lines.push(`  « ${orgContext} »`);
  }
  if (userContext) {
    lines.push(
      `• CONTEXTE PERMANENT DE L'UTILISATEUR (informations sur la personne/son poste/son entreprise — à prendre en compte pour tout le résumé, sans le recopier tel quel) :`,
    );
    lines.push(`  « ${userContext} »`);
  }

  return lines.join('\n');
}

/**
 * Bloc « notes de réunion » : le texte tapé à la main dans le panneau Notes
 * pendant l'enregistrement. Deux rôles, tous deux imposés au modèle :
 * compléter le résumé (les notes portent souvent ce qui n'a pas été dit à voix
 * haute), et servir de référence orthographique — la transcription automatique
 * écorche les noms propres et les sigles.
 *
 * La référence orthographique est LIMITATIVE (trois cas : consigne explicite,
 * définition de sigle, mot manifestement écorché) : la formulation d'origine
 * (« la graphie des notes fait foi » sans borne) faisait remplacer dans le
 * résumé des noms sans rapport par celui des notes — « réunion avec Sophie »
 * écrasait tous les prénoms. Resserré une 2e fois le 2026-08-28 (retour
 * terrain) : « garde la transcription » posé en règle par défaut, et un mot
 * réel correctement transcrit (« Alexe », « Marc ») ne se corrige plus que
 * sur consigne explicite — corriger le prénom de l'utilisateur demande
 * d'écrire « Remplace Alexe par Alex », c'est voulu. Le contre-exemple
 * Sophie/Marc fait partie du prompt ; ne pas l'alléger, ni rouvrir la règle
 * en « les notes font foi ». Mêmes règles que refineTranscriptPrompt côté
 * serveur (services/api/lib/prompts.js) — les deux textes se maintiennent
 * ensemble.
 * Retourne '' sans notes ; utilisé par les DEUX chemins de prompt
 * (templates/instructions ET scaffold), qui n'assemblent pas pareil.
 */
export function buildNotesBlock(ctx) {
  const notes = (ctx.meetingNotes && String(ctx.meetingNotes).trim()) || '';
  if (!notes) return '';
  return [
    "#NOTES_DE_RÉUNION (prises à la main par l'utilisateur PENDANT la réunion)",
    '',
    "Ces notes complètent la transcription : intègre au résumé les points qu'elles apportent (décisions, chiffres, contexte), même absents de la transcription — sans les recopier telles quelles.",
    'RÉFÉRENCE POUR LES NOMS : la transcription automatique déforme parfois les noms propres, sigles et acronymes. RÈGLE PAR DÉFAUT : garde la graphie de la transcription — la corriger depuis les notes est une exception rare, permise dans TROIS cas, et seulement ceux-là :',
    '1. les notes donnent une consigne explicite (« Remplace Alexe par Alex », « Alexe → Alex ») : applique-la partout dans le résumé, exactement elle et rien de plus ;',
    "2. les notes définissent un terme ou un sigle (« SAL : système d'aide pour les lentilles ») et la transcription contient un mot QUASI IDENTIQUE phonétiquement (« sale », « salle ») dont le sens dans la phrase désigne manifestement ce terme : emploie le terme des notes ;",
    '3. un mot de la transcription est MANIFESTEMENT écorché — ni un mot français, ni un prénom ou un nom qui existe (« Fabrican », « Saufi », « Klobex ») — et un terme des notes en est phonétiquement indiscernable : rétablis la graphie des notes (« Fabrican » → « Fabrikam »).',
    "INTERDICTIONS : un nom des notes ne remplace JAMAIS un nom différent de la transcription — des notes « réunion avec Sophie » ne changent pas « Marc » en « Sophie ». Un mot correctement transcrit, prénom ou nom réel compris (« Alexe », « Marc », « Martin »), ne se corrige QUE sur la consigne explicite du cas 1, jamais parce qu'il ressemble à un terme des notes. Une personne ou une société simplement mentionnée dans les notes n'est pas une consigne de remplacement. Si tu hésites entre corriger et laisser, LAISSE la graphie de la transcription.",
    '',
    `« ${notes} »`,
  ].join('\n');
}

/**
 * Bloc « attribution des locuteurs » : présent uniquement quand la
 * transcription envoyée est étiquetée par canal audio (réunion enregistrée
 * avec les deux flux — micro de l'utilisateur ET audio système de la visio,
 * cf. utils/transcriptAttribution.js). Explique le format `[Nom]` / `[Visio]`
 * et impose de s'en servir pour attribuer propositions, décisions et
 * engagements — sans jamais recopier les étiquettes brutes dans le résumé.
 * Retourne '' sans attribution ; utilisé par les DEUX chemins de prompt
 * (templates/instructions ET scaffold), comme buildNotesBlock.
 */
export function buildAttributionBlock(ctx) {
  const attribution = ctx.transcriptAttribution;
  if (!attribution || !attribution.selfLabel || !attribution.remoteLabel) return '';
  const { selfLabel, remoteLabel } = attribution;
  // Voix de la visio : celles que l'utilisateur a nommées (utils/
  // transcriptSpeakers.js), et « Visio » s'il reste des voix non identifiées.
  const remoteLabels = Array.isArray(attribution.remoteLabels)
    ? attribution.remoteLabels
    : [remoteLabel];
  const named = remoteLabels.filter((l) => l && l !== remoteLabel && l !== selfLabel);
  const hasUnnamed = named.length === 0 || remoteLabels.includes(remoteLabel);
  const quote = (l) => `« [${l}] »`;
  const allLabels = [selfLabel, ...named, ...(hasUnnamed ? [remoteLabel] : [])];

  const channels = [
    `${quote(selfLabel)} introduit les propos captés par le microphone de l'utilisateur (${selfLabel})`,
  ];
  if (named.length) {
    channels.push(
      `${named.map(quote).join(', ')} ${named.length > 1 ? 'introduisent' : 'introduit'} les propos d'un participant entendu via la visioconférence, nommé par l'utilisateur`,
    );
  }
  if (hasUnnamed) {
    channels.push(
      `${quote(remoteLabel)} ceux ${named.length ? "d'un participant de la visioconférence non identifié" : 'des autres participants entendus via la visioconférence'}`,
    );
  }
  const unnamedHint = hasUnnamed
    ? ` Si des noms de participants ressortent de la transcription ou des notes, utilise-les pour désigner les voix du canal ${quote(remoteLabel)}.`
    : '';
  return [
    '#ATTRIBUTION_DES_LOCUTEURS (transcription étiquetée par locuteur)',
    '',
    `La transcription distingue les locuteurs par des lignes d'étiquette : ${channels.join(' ; ')}. Chaque étiquette vaut pour toutes les lignes qui suivent, jusqu'à l'étiquette suivante.`,
    `Sers-t'en pour préciser le compte rendu : attribue explicitement les propositions, décisions, engagements et désaccords à leur auteur (qui a proposé, qui a validé, qui s'est engagé).${unnamedHint} Ne recopie jamais les étiquettes brutes ${allLabels.map(quote).join(' / ')} telles quelles dans le résumé.`,
  ].join('\n');
}

function appendModifiers(base, ctx) {
  const parts = [base];
  const tonName = tonLabel(ctx.ton);
  const longName = longueurLabel(ctx.longueur);

  if (tonName) {
    parts.push(`\n\n#TON# (OBLIGATOIRE)\nAdopte un ton ${tonName}. ${tonInstruction(ctx.ton)}`);
  }

  if (longName) {
    parts.push(
      `\n\n#LONGUEUR# (OBLIGATOIRE)\nLongueur attendue : ${longName}. ${longueurInstruction(ctx.longueur)}`,
    );
  }

  if (ctx.customPrompt) {
    parts.push(
      `\n\n#INSTRUCTIONS_SUPPLEMENTAIRES# (OBLIGATOIRE — consignes utilisateur)\n${ctx.customPrompt}`,
    );
  }

  return parts.join('');
}

// ─── Template definitions ──────────────────────────────────────────────────
//
// Chaque template fourni est défini UNE fois, sous sa forme ÉDITABLE — celle
// que montre Administration → Templates ET celle qui tourne à la génération
// (resolveSummaryPlan) : sauvegarder un défaut sans le modifier ne change donc
// pas son rendu. Avant, un buildPrompt caché tournait à la place, et la
// première sauvegarde changeait le document.
//   - `instructions` : les Directives à l'IA. Courtes, en puces : elles ne
//     pilotent que le bloc {{résumé}}. Aucune {{variable}} (jamais
//     interpolées dans les instructions).
//   - `scaffold` : la Mise en forme, dans le sous-ensemble markdown de
//     l'éditeur (scaffold.js). Recopiée MOT POUR MOT : ses titres ne se
//     traduisent pas, d'où `scaffoldEn` pour l'interface anglaise.

/** Squelette commun : titre daté, auteur et durée, synthèse de l'IA, actions. */
function layout(title, actionsTitle) {
  return `# ${title} — {{date}}

*Auteur : {{author}} — Durée : {{duration}}*

## Synthèse

{{résumé}}

## ${actionsTitle}

{{actions}}`;
}

function layoutEn(title, actionsTitle) {
  return `# ${title} — {{date}}

*Author: {{author}} — Duration: {{duration}}*

## Summary

{{résumé}}

## ${actionsTitle}

{{actions}}`;
}

const standard = {
  value: 'standard',
  icon: '📝',
  labels: { fr: 'Standard', en: 'Standard' },
  instructions: `Compte rendu de réunion clair et fidèle, pour un lecteur qui n'y a pas assisté.

Ouvre sur deux ou trois phrases : l'objet de la réunion et ses conclusions. Puis, en parties titrées :
- **un titre par sujet abordé** : l'essentiel des échanges, avec les chiffres, noms et échéances cités ;
- **Décisions** : ce qui a été acté, et par qui ;
- **Points en suspens** : questions ouvertes, désaccords, sujets reportés.

Omets une partie sans contenu. Style professionnel et factuel : phrases courtes, aucune redite.`,
  scaffold: layout('Compte rendu', 'Actions à mener'),
  scaffoldEn: layoutEn('Meeting minutes', 'Action items'),
  // Le seul template fourni avec le Pagimètre : le cas courant, où la
  // longueur voulue change le plus d'une réunion à l'autre.
  pageMeter: 1,
};

const decision = {
  value: 'decision',
  icon: '⚖️',
  labels: { fr: 'Réunion de décision', en: 'Decision meeting' },
  instructions: `Compte rendu d'une réunion de décision : ce qui a été tranché, et pourquoi.

En parties titrées, dans cet ordre :
- **Décision** : ce qui a été décidé, par qui, à partir de quand — ou, faute de décision, ce qui manque pour trancher ;
- **Contexte** : la question posée et ce qui rendait une décision nécessaire ;
- **Options étudiées** : pour chacune, ses avantages, ses limites et qui la portait ; pourquoi l'option retenue l'a emporté ;
- **Réserves et points ouverts** : désaccords exprimés, risques, conditions à lever.

Omets une partie sans contenu. Style professionnel et factuel : phrases courtes, aucune redite.`,
  scaffold: layout('Réunion de décision', 'Prochaines étapes'),
  scaffoldEn: layoutEn('Decision meeting', 'Next steps'),
};

const rh = {
  value: 'rh',
  icon: '👥',
  labels: { fr: 'Entretien RH', en: 'HR interview' },
  // Ni évaluation ni recommandation produites par l'IA : elle rapporte l'avis
  // des personnes présentes. L'ancienne rubrique « Recommandation finale »
  // lui faisait juger elle-même la personne reçue.
  instructions: `Synthèse d'un entretien RH (recrutement ou entretien individuel), pour le recruteur ou le manager.

Ouvre sur une phrase : l'objet de l'entretien et la personne reçue. Puis, en parties titrées :
- **Parcours et compétences** : expérience, compétences clés, situation actuelle ;
- **Motivations et attentes** : poste, évolution, conditions souhaitées ;
- **Points forts** : ceux qui ressortent des échanges ;
- **Points de vigilance** : réserves exprimées, éléments à vérifier ;
- **Conclusion** : l'avis exprimé par le recruteur ou le manager, et les suites convenues.

Rapporte les faits et les propos : aucune évaluation ni recommandation de ta part, aucune information étrangère au poste (santé, vie privée, opinions). Omets une partie sans contenu. Ton sobre et professionnel.`,
  scaffold: layout('Entretien RH', 'Suites à donner'),
  scaffoldEn: layoutEn('HR interview', 'Follow-up'),
};

const brainstorming = {
  value: 'brainstorming',
  icon: '💡',
  labels: { fr: 'Brainstorming', en: 'Brainstorming' },
  instructions: `Synthèse d'un atelier de brainstorming : les idées produites et celles que le groupe retient.

Ouvre sur une phrase : la question ou l'objectif de l'atelier. Puis, en parties titrées :
- **Idées émises** : regroupées par thème, une puce par idée, avec son auteur s'il est identifiable ;
- **Idées retenues** : celles que le groupe choisit d'approfondir, et pourquoi ;
- **Idées écartées** : avec la raison, si elle a été donnée ;
- **Questions à creuser** : ce qui reste à explorer ou à vérifier.

Garde chaque idée, même brièvement évoquée, sans la juger. Omets une partie sans contenu. Style professionnel et concis.`,
  scaffold: layout('Brainstorming', 'Prochaines étapes'),
  scaffoldEn: layoutEn('Brainstorming', 'Next steps'),
};

const planning = {
  value: 'planning',
  icon: '📅',
  labels: { fr: 'Planification', en: 'Planning' },
  instructions: `Compte rendu d'une réunion de planification : quoi, qui, quand, avec quels moyens.

Ouvre sur une ou deux phrases : l'objectif et l'échéance principale. Puis, en parties titrées :
- **Jalons et calendrier** : les étapes clés dans l'ordre chronologique, avec leurs dates ;
- **Responsabilités et ressources** : qui porte quoi, budget et moyens évoqués ;
- **Risques et dépendances** : ce qui peut retarder ou bloquer, et les parades envisagées ;
- **Points à arbitrer** : ce qui reste à décider, et par qui.

Reprends toutes les dates et durées citées, sans en inventer. Omets une partie sans contenu. Style professionnel et factuel : phrases courtes.`,
  scaffold: layout('Planification', 'Actions à mener'),
  scaffoldEn: layoutEn('Planning', 'Action items'),
};

const retrospective = {
  value: 'retrospective',
  icon: '🔄',
  labels: { fr: 'Rétrospective', en: 'Retrospective' },
  instructions: `Compte rendu d'une rétrospective d'équipe : les enseignements de la période écoulée.

Ouvre sur une phrase : le sprint, le projet ou la période passés en revue. Puis, en parties titrées :
- **Ce qui a bien fonctionné** : réussites et pratiques à conserver ;
- **Ce qui peut être amélioré** : difficultés rencontrées, et leurs causes si elles ont été identifiées ;
- **Enseignements** : ce que l'équipe retient et décide de changer.

Formule les difficultés sans mettre personne en cause. Omets une partie sans contenu. Style professionnel, factuel et constructif.`,
  scaffold: layout('Rétrospective', "Actions d'amélioration"),
  scaffoldEn: layoutEn('Retrospective', 'Improvement actions'),
};

// ─── Exports ───────────────────────────────────────────────────────────────

// Pas de « Prospect IA » (retiré le 2026-09-15) : écrit pour la prospection
// de MyAlfred, noms de société en dur. Une réunion qui le demande encore
// retombe sur Standard (resolveSummaryPlan).
export const templates = [standard, decision, rh, brainstorming, planning, retrospective];

export const templateMap = Object.fromEntries(templates.map((t) => [t.value, t]));

export const templateOptions = templates.map(({ value, icon, labels, pageMeter }) => ({
  value,
  icon,
  labels,
  pageMeter: pageMeter ?? null,
}));

/**
 * Options de la carte de génération : les templates personnels, puis ceux de
 * l'administration, puis les templates fournis qu'aucun des deux ne recouvre.
 * Chaque option porte son Pagimètre — position par défaut, ou null : c'est ce
 * qui fait apparaître le curseur dans la carte. Un template fourni recouvert
 * par un enregistrement antérieur au Pagimètre (sans le champ) n'en a pas :
 * l'administration l'active dans son éditeur.
 */
export function buildTemplateOptions(userTemplates = [], customTemplates = []) {
  const option = (t, group) => ({
    value: t.value,
    icon: t.icon ?? '📄',
    labels: t.labels ?? { fr: t.value, en: t.value },
    pageMeter: normalizePages(t.pageMeter),
    group,
  });
  const userOpts = userTemplates.map((t) => option(t, 'user'));
  const seen = new Set(userOpts.map((o) => o.value));
  const dbOpts = customTemplates
    .filter((t) => !seen.has(t.value))
    .map((t) => {
      seen.add(t.value);
      return option(t, 'admin');
    });
  const hardcodedOpts = templateOptions
    .filter((o) => !seen.has(o.value))
    .map((o) => ({ ...o, group: 'admin' }));
  return [...userOpts, ...dbOpts, ...hardcodedOpts];
}

/**
 * Réponse de `/templates` ou de `/user-templates` → templates utilisables. Trois
 * formes servies au fil de l'histoire (liste nue, objet seul hérité de n8n,
 * `{ templates }`) ; seuls ceux qui portent une `value` comptent.
 */
export function templateListFrom(data) {
  const raw = Array.isArray(data) ? data : data?.value ? [data] : (data?.templates ?? []);
  return raw.filter((t) => t?.value);
}

/**
 * Variables exposable in the user-facing template editor.
 * Single source of truth shared with interpolateTemplate below — if you add a
 * placeholder to interpolateTemplate, add it here so the editor toolbar can
 * insert it. We intentionally only expose the 5 meeting-context variables;
 * ton / longueur / customPrompt are driven by Dock controls and applied via
 * appendModifiers automatically, so users don't need to think about them.
 */
export const VARIABLE_CATALOG = [
  {
    key: 'résumé',
    icon: '✨',
    labelFr: 'Résumé IA',
    labelEn: 'AI summary',
    descFr:
      'Le résumé principal, défini par vos Directives. Toujours présent dans le compte rendu : déplacez-le, il ne peut pas être retiré.',
    descEn:
      'The main summary, defined by your Directives. Always part of the output: move it around, it cannot be removed.',
    isAiBlock: true,
  },
  {
    key: 'résumé_20',
    icon: '⚡',
    labelFr: 'Résumé en 20 mots',
    labelEn: '20-word summary',
    descFr:
      'Résumé complémentaire : la réunion en 20 mots maximum, une seule phrase. À ajouter en plus du Résumé IA.',
    descEn:
      'Extra summary: the meeting in 20 words max, one sentence. Added alongside the AI summary.',
    isAiBlock: true,
  },
  {
    key: 'résumé_100',
    icon: '📃',
    labelFr: 'Résumé en 100 mots',
    labelEn: '100-word summary',
    descFr:
      'Résumé complémentaire : la réunion en 100 mots environ (contexte, points discutés, décisions). À ajouter en plus du Résumé IA.',
    descEn:
      'Extra summary: the meeting in about 100 words (context, topics, decisions). Added alongside the AI summary.',
    isAiBlock: true,
  },
  {
    key: 'points_clés',
    icon: '🎯',
    labelFr: 'Points clés',
    labelEn: 'Key points',
    descFr:
      'Résumé complémentaire : les 2 à 8 grands points clés de la réunion, en liste à puces. À ajouter en plus du Résumé IA.',
    descEn:
      'Extra summary: the 2–8 key takeaways of the meeting as a bullet list. Added alongside the AI summary.',
    isAiBlock: true,
  },
  {
    key: 'actions',
    icon: '📋',
    labelFr: 'Actions',
    labelEn: 'Actions',
    descFr: 'Liste des actions détectées dans la réunion',
    descEn: 'List of actions detected in the meeting',
  },
  {
    key: 'date',
    icon: '📅',
    labelFr: 'Date',
    labelEn: 'Date',
    descFr: 'Date et heure de la réunion',
    descEn: 'Meeting date and time',
  },
  {
    key: 'duration',
    icon: '⏱',
    labelFr: 'Durée',
    labelEn: 'Duration',
    descFr: 'Durée totale de la réunion (HH:MM:SS)',
    descEn: 'Total meeting duration (HH:MM:SS)',
  },
  {
    key: 'author',
    icon: '👤',
    labelFr: 'Auteur',
    labelEn: 'Author',
    descFr: 'Nom de la personne qui a enregistré',
    descEn: 'Name of the recording author',
  },
  {
    key: 'language',
    icon: '🌐',
    labelFr: 'Langue',
    labelEn: 'Language',
    descFr: 'Langue du résumé (fr / en)',
    descEn: 'Summary language (fr / en)',
  },
];

/**
 * Regex matching the free-form AI-fill marker placeholder ({{résumé}}).
 * Accepts French and English spellings. The scaffold detector in
 * resolveSystemPrompt uses ANY_AI_BLOCK_RE (this one + fixed blocks).
 */
export const SCAFFOLD_MARKER_RE = /\{\{(?:résumé|resume|summary)\}\}/g;

/**
 * Blocs IA « à consigne fixe » insérables dans le scaffold, en plus du bloc
 * libre {{résumé}} (piloté par les Directives). Chacun a son marqueur de
 * substitution et une directive IMPOSÉE au modèle — la consigne de longueur
 * globale (Dock) ne s'applique jamais à ces blocs.
 */
export const FIXED_AI_BLOCKS = [
  {
    key: 'résumé_20',
    re: /\{\{résumé_20\}\}/g,
    marker: '[[AI_SUMMARY_20_WORDS]]',
    directive:
      "un résumé de la réunion en 20 mots MAXIMUM : une seule phrase qui capture l'essentiel (sujet, issue, décision majeure), dans un <p>. Compte les mots — ne dépasse jamais 20.",
  },
  {
    key: 'résumé_100',
    re: /\{\{résumé_100\}\}/g,
    marker: '[[AI_SUMMARY_100_WORDS]]',
    directive:
      "un résumé de la réunion d'environ 100 mots (90 à 110) : contexte, points discutés, décisions prises. Un ou deux <p>, pas de liste.",
  },
  {
    key: 'points_clés',
    re: /\{\{points_clés\}\}/g,
    marker: '[[AI_KEY_POINTS]]',
    directive:
      'les grands points clés de la réunion : une liste <ul> de 2 à 8 <li> — un point par idée majeure (décision, sujet structurant, chiffre marquant), une phrase courte par point, du plus important au moins important.',
  },
];

/**
 * Un bloc IA quelconque ({{résumé}} et ses alias, ou un bloc à consigne fixe).
 * Sert au déclenchement du mode scaffold et au filet « au moins un bloc IA »
 * de l'éditeur de template.
 */
export const ANY_AI_BLOCK_RE =
  /\{\{(?:résumé_100|résumé_20|points_clés|résumé|resume|summary)\}\}/g;

/**
 * User-template prompts are stored as a single `prompt` string but logically
 * contain TWO fields:
 *  - `instructions`: what the AI should generate (free text, English or
 *    French, "summarize in 50 words", "focus on decisions", etc.)
 *  - `scaffold`:     how the final output should LOOK (a literal template
 *    with {{date}}, {{author}}, {{actions}} ... and a {{résumé}} marker
 *    pointing to where the AI body goes).
 *
 * They are joined for storage with the @@SCAFFOLD@@ separator. Prompts saved
 * before this format had no instructions; we treat the whole string as the
 * scaffold for backward compatibility.
 */
const PROMPT_SEPARATOR = '\n@@SCAFFOLD@@\n';

export function splitPromptFields(promptStr) {
  if (!promptStr) return { instructions: '', scaffold: '' };
  const idx = promptStr.indexOf('@@SCAFFOLD@@');
  if (idx === -1) return { instructions: '', scaffold: promptStr };
  return {
    instructions: promptStr.slice(0, idx).replace(/\n+$/, ''),
    scaffold: promptStr.slice(idx + '@@SCAFFOLD@@'.length).replace(/^\n+/, ''),
  };
}

export function combinePromptFields({ instructions, scaffold }) {
  const inst = (instructions || '').trim();
  const scaf = (scaffold || '').trim();
  if (!inst) return scaf;
  return `${inst}${PROMPT_SEPARATOR}${scaf}`;
}

/**
 * Ordered slugs of hardcoded templates proposed as starting points when the
 * user adds a new template.
 */
export const STARTER_TEMPLATES = ['standard', 'decision', 'brainstorming', 'retrospective'];

/**
 * Les templates transverses PAR DÉFAUT sous leur forme ÉDITABLE (instructions
 * + scaffold français), dans l'ordre du picker. L'administration fusionne cette
 * liste avec la collection `templates` : sauvegarder l'un d'eux crée en base un
 * template de même `value`, qui PREND LE PAS sur la version codée
 * (resolveSummaryPlan cherche d'abord dans customTemplates) ; supprimer cet
 * enregistrement fait revenir la version par défaut. Les défauts codés ne sont
 * donc jamais perdus.
 */
export const DEFAULT_EDITABLE_TEMPLATES = templates.map(
  ({ value, icon, labels, instructions, scaffold, pageMeter }) => ({
    value,
    icon,
    labels,
    instructions,
    scaffold,
    pageMeter: pageMeter ?? null,
  }),
);

/**
 * Interpolate a prompt string from DB using {{variable}} placeholders.
 * Available placeholders:
 *   {{actions}}, {{date}}, {{duration}}, {{author}}, {{language}}
 *   {{ton}}            — tone label (Sérieux / Pro / Détendu) or empty
 *   {{tonInstruction}} — detailed tone instruction or empty
 *   {{longueur}}       — length label (court / moyen / long et détaillé) or empty
 *   {{longueurInstruction}} — detailed length instruction or empty
 *   {{customPrompt}}   — user free-form custom prompt or empty
 */
export function interpolateTemplate(promptStr, ctx) {
  // Le scaffold est recopié mot pour mot : ses valeurs de repli suivent la
  // langue de sortie, sinon un compte rendu anglais affiche « Aucune action ».
  const en = ctx.language === 'en';
  return promptStr
    .replace(/\{\{actions\}\}/g, serializeActions(ctx.actions, ctx.language))
    .replace(/\{\{date\}\}/g, formatNow())
    .replace(/\{\{duration\}\}/g, ctx.meetingDurationFormatted ?? (en ? 'unknown' : 'inconnue'))
    .replace(/\{\{author\}\}/g, ctx.authorName ?? (en ? 'Unknown author' : 'Auteur inconnu'))
    .replace(/\{\{language\}\}/g, ctx.language)
    .replace(/\{\{ton\}\}/g, tonLabel(ctx.ton) ?? '')
    .replace(/\{\{tonInstruction\}\}/g, tonInstruction(ctx.ton) ?? '')
    .replace(/\{\{longueur\}\}/g, longueurLabel(ctx.longueur) ?? '')
    .replace(/\{\{longueurInstruction\}\}/g, longueurInstruction(ctx.longueur) ?? '')
    .replace(/\{\{customPrompt\}\}/g, ctx.customPrompt ?? '');
}

/**
 * Consigne de PROFONDEUR — le contre-poids qui manquait.
 *
 * Constat 2026-09-01 : à prompt identique, myBrief rendait un compte rendu plus
 * court et moins structuré que l'application ChatGPT. Deux raisons dans le
 * prompt lui-même :
 *   1. AUCUNE ligne, dans aucun des deux chemins, ne demandait un compte rendu
 *      COMPLET — le modèle n'avait pas de raison de développer ;
 *   2. le barème de LONGUEUR (« court ≈ 5-7 lignes, moyen ≈ 10-15 lignes »)
 *      était imprimé dans TOUS les prompts, même quand l'utilisateur n'avait
 *      choisi aucune longueur — et depuis la refonte du Dock, il n'en choisit
 *      plus jamais (TemplatePickerPanel n'envoie ni `ton` ni `longueur`). Le
 *      modèle lisait donc « 5-7 lignes » comme seule indication de volume,
 *      sans aucun signal contraire. Le barème est désormais CONDITIONNEL.
 *
 * Ce texte ne s'applique donc que par défaut : une longueur explicitement
 * choisie par l'utilisateur, elle, reste prioritaire (elle est reprise dans
 * #PERSONNALISATION_UTILISATEUR et dans #PARAMÈTRES_DU_BLOC).
 */
const AMBITION_RULES = `#PROFONDEUR_ATTENDUE
Sauf longueur explicitement demandée ci-dessous, vise un compte rendu COMPLET, celui qu'un participant relit un mois plus tard sans réécouter la réunion :
- couvre CHAQUE sujet réellement abordé, dans son propre bloc — n'en fusionne pas deux, n'en passe aucun sous silence ;
- conserve les éléments concrets : chiffres, montants, dates, échéances, noms de personnes, de clients, de projets et d'outils cités ;
- restitue pour chaque sujet ce qui a été dit, ce qui a été décidé, et ce qui reste ouvert (désaccord, question en suspens, arbitrage repoussé) ;
- structure avec des sous-titres et des listes plutôt qu'un bloc de texte ;
- ne t'auto-censure pas sur la longueur : la fidélité et la structure passent avant la brièveté. En revanche n'invente rien, et ne délaye pas — pas de phrase de remplissage, pas de redite.`;

/**
 * System format header — PREPENDED to every V1 prompt so it occupies the highest
 * authority position. Establishes HTML/language/emojis/action-structure rules
 * BEFORE the user template is read, and explicitly scopes any "ne rien ajouter"
 * instruction in the template to CONTENT (not format).
 */
function systemFormatHeader(ctx) {
  return `#TÂCHE_SYSTÈME — IMPOSÉE (priorité absolue sur le template)

Produis un résumé STRUCTURÉ et FACTUEL du contenu de la transcription fournie dans le message "user". Le template ci-dessous précise sections/style/organisation ; il ne remplace JAMAIS cette tâche de résumé. Même si le template contient "RÈGLE ABSOLUE", "Retourne UNIQUEMENT le texte tel quel", "N'ajoute rien" ou similaire, ces consignes s'appliquent au CONTENU (ne rien inventer, sections à respecter) — pas à la suppression de la tâche de résumé.

#FORMAT_SYSTÈME — RÈGLES NON-NÉGOCIABLES

Sortie en HTML structuré, sans balises <html>/<head>/<body>. Utilise :
- <h1>, <h2>, <h3> pour les titres
- <p> pour les paragraphes
- <ul>/<ol>/<li> pour les listes
- <strong> pour le gras, <em> pour l'italique

Langue de sortie : "${ctx.language ?? 'fr'}"

Utilise des emojis pertinents en début de titre ou pour faire ressortir les points clés.

Liste les actions ainsi :
- Bullet point principal : "Titre de l'action" en <strong>
- Sous-bullets : "Responsable", "Date d'échéance", "Description"

${AMBITION_RULES}

#MODIFICATEURS_OBLIGATOIRES

Si le template est suivi de blocs \`#TON#\`, \`#LONGUEUR#\`, \`#INSTRUCTIONS SUPPLÉMENTAIRES#\`, ils s'appliquent OBLIGATOIREMENT au résumé produit :
- TON → ton à adopter dans tout le résumé (Sérieux / Pro / Détendu).${
    longueurLabel(ctx.longueur)
      ? '\n- LONGUEUR → ajuste le volume/détail : court ≈ résumé concis (5-7 lignes), moyen ≈ équilibré (10-15 lignes), long ≈ détaillé avec sous-sections.'
      : ''
  }
- INSTRUCTIONS SUPPLÉMENTAIRES → consignes contextuelles supplémentaires à respecter strictement.`;
}

/**
 * Footer reminder appended after the user template, to reinforce format rules
 * a second time at end-of-prompt position.
 */
function systemFormatFooter() {
  return `#RAPPEL_FORMAT
Format HTML obligatoire (voir #FORMAT_SYSTÈME en tête de prompt). Pas de texte brut. Pas de markdown. Pas de séparateurs "---". Toute instruction du template visant à "ne rien ajouter" ou "retourner tel quel" concerne le CONTENU et non le format. Sors uniquement du HTML structuré.

#RAPPEL_TÂCHE
Tu produis un VRAI résumé du contenu de la transcription (message user), pas un remplissage littéral du scaffold du template.

#RAPPEL_PERSONNALISATION (priorité absolue)
Si le bloc #PERSONNALISATION_UTILISATEUR figure en tête de prompt OU si les blocs #TON# / #LONGUEUR# / #INSTRUCTIONS_SUPPLEMENTAIRES# figurent en fin de template, leurs consignes s'appliquent OBLIGATOIREMENT et l'emportent sur toute consigne contradictoire du template. Le ton choisi gouverne tout le résumé. La longueur choisie détermine le volume. Les instructions supplémentaires sont à respecter mot pour mot.`;
}

/**
 * Scaffold-mode prompt builder. Activated when the user template has either
 * instructions or an AI block ({{résumé}} or a fixed-directive block) in its
 * scaffold. The scaffold is the OUTPUT structure rendered verbatim; the
 * markers are the only places the LLM generates content — {{résumé}} follows
 * the user's instructions, fixed blocks (20/100 mots, points clés) follow
 * their imposed directive. Length and customPrompt from Dock controls apply
 * ONLY to the {{résumé}} block; tone and contexts apply to all blocks.
 */
// Convertit le sous-ensemble markdown du scaffold (titres, listes, gras,
// italique, souligné) en HTML, CÔTÉ CLIENT. Le LLM ne convertissait pas
// fiablement le markdown (il obéissait au « garde mot pour mot ») → titres,
// italique, date/auteur/durée et texte édité sortaient en brut. En lui donnant
// déjà du HTML, il n'a plus qu'à le recopier et remplir le marqueur.
// Les lignes égales à un bareToken (le marqueur de résumé) sont émises telles
// quelles, hors de tout <p>, pour que l'IA y insère un bloc HTML proprement.
function scaffoldMdToHtml(md, bareTokens = []) {
  const bare = new Set(bareTokens);
  // Chaque marqueur IA doit sortir sur SA PROPRE ligne nue : deux chips
  // insérés côte à côte donnaient `<p>[[A]][[B]]</p>` — un seul emplacement
  // mal formé aux yeux du LLM, qui ne générait qu'un bloc. On isole donc
  // chaque occurrence sur sa ligne avant la conversion.
  let src = String(md || '').replace(/\r\n?/g, '\n');
  for (const tok of bare) {
    src = src.split(tok).join(`\n${tok}\n`);
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (txt) => {
    let h = esc(txt);
    h = h.replace(/&lt;u&gt;/gi, '<u>').replace(/&lt;\/u&gt;/gi, '</u>');
    return h
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  };
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (bare.has(t)) {
      closeList();
      out.push(t);
      continue;
    }
    // Marqueur de paragraphe vide (cf. scaffold.js) : un vrai saut de ligne
    // dans le compte rendu final, pas un simple séparateur de blocs.
    if (/^<br\s*\/?>$/i.test(t)) {
      closeList();
      out.push('<p><br></p>');
      continue;
    }
    if (/^##\s+/.test(line)) {
      closeList();
      out.push('<h2>' + inline(line.replace(/^##\s+/, '')) + '</h2>');
    } else if (/^#\s+/.test(line)) {
      closeList();
      out.push('<h1>' + inline(line.replace(/^#\s+/, '')) + '</h1>');
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push('<li>' + inline(line.replace(/^[-*]\s+/, '')) + '</li>');
    } else if (t === '') {
      closeList();
    } else {
      closeList();
      out.push('<p>' + inline(line) + '</p>');
    }
  }
  closeList();
  return out.join('\n');
}

/**
 * Bloc « contexte de référence » : le contexte de l'ORGANISATION (vocabulaire,
 * clients, sigles) et celui de l'UTILISATEUR (qui parle), avec la consigne
 * d'orthographe. Injecté en position HAUTE dans le prompt scaffold ET dans
 * chaque bloc isolé — quand il vivait en fin de « paramètres du bloc », le
 * modèle l'ignorait : nom de l'utilisateur mal orthographié dans le CR alors
 * que la graphie figurait noir sur blanc dans son contexte (constat 27/08).
 * Ordre du général au particulier, comme buildPersonalizationBlock.
 * Retourne '' sans contexte.
 */
export function buildReferenceContextBlock(ctx) {
  const userContext = (ctx.userContext && String(ctx.userContext).trim()) || '';
  const orgContext = (ctx.orgContext && String(ctx.orgContext).trim()) || '';
  if (!userContext && !orgContext) return '';
  const lines = [];
  lines.push("#CONTEXTE_DE_RÉFÉRENCE (s'applique à TOUT le contenu généré — priorité absolue)");
  lines.push('');
  lines.push(
    "Ces informations font FOI, notamment pour l'ORTHOGRAPHE : la transcription automatique déforme les noms propres, prénoms, sigles et noms de sociétés. Quand un terme de la transcription correspond phonétiquement à un terme ci-dessous, la graphie ci-dessous est la bonne — utilise-la partout, sans recopier ces contextes tels quels.",
  );
  if (orgContext) {
    lines.push(
      `• ORGANISATION (vocabulaire : clients, projets, sigles maison) : « ${orgContext} »`,
    );
  }
  if (userContext) {
    lines.push(
      `• UTILISATEUR (la personne qui a enregistré : identité, poste, entreprise — la graphie de son nom fait foi) : « ${userContext} »`,
    );
  }
  return lines.join('\n');
}

/**
 * Prompt système ISOLÉ d'un bloc à consigne fixe. Chaque bloc fixe part dans
 * son PROPRE appel LLM (mesuré le 27/08 sur un CR réel : la simple présence
 * de la consigne « 20 mots » dans le prompt du résumé principal tirait
 * celui-ci vers un paragraphe moyen — le modèle « moyennait » les deux
 * demandes). L'appel isolé ne voit QUE sa consigne : ton et contextes
 * (vocabulaire, notes, attribution) s'y appliquent, jamais la longueur du
 * Dock ni les instructions supplémentaires (réservées au bloc principal).
 */
export function buildFixedBlockPrompt(block, ctx) {
  const tonName = tonLabel(ctx.ton);
  const lines = [];

  lines.push('#TÂCHE');
  lines.push(
    `À partir de la transcription de réunion fournie dans le message "user", produis UNIQUEMENT ${block.directive}`,
  );
  lines.push('');

  const referenceBlock = buildReferenceContextBlock(ctx);
  if (referenceBlock) {
    lines.push(referenceBlock);
    lines.push('');
  }

  lines.push('#FORMAT_SORTIE — RÈGLES NON-NÉGOCIABLES');
  lines.push(
    '- Sortie : le fragment HTML demandé, SEUL — sans balises <html>/<head>/<body>, sans titre de section, sans phrase d’introduction ni texte autour.',
  );
  lines.push('- Aucun markdown.');
  lines.push(`- Langue de sortie : "${ctx.language ?? 'fr'}"`);
  lines.push('');

  if (tonName) {
    lines.push('#PARAMÈTRES');
    lines.push(`- Ton : ${tonName} — ${tonInstruction(ctx.ton)}`);
    lines.push('');
  }

  const attributionBlock = buildAttributionBlock(ctx);
  if (attributionBlock) {
    lines.push(attributionBlock);
    lines.push('');
  }

  const notesBlock = buildNotesBlock(ctx);
  if (notesBlock) {
    lines.push(notesBlock);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// ─── Pagimètre ─────────────────────────────────────────────────────────────

/**
 * Longueur demandée pour CE résumé, ou null. Deux portes : le template doit
 * proposer le Pagimètre (un `pages` égaré ne donne jamais de consigne de
 * longueur à un template qui n'en a pas), et la longueur doit être valide. La
 * cible est bornée par la matière de la réunion (cf. materialCapPages) — même
 * calcul que le serveur, qui vérifiera le résultat.
 */
function resolvePagePlan(templatePageMeter, ctx) {
  if (normalizePages(templatePageMeter) === null) return null;
  const pages = normalizePages(ctx.pages);
  if (pages === null) return null;
  const target = effectivePages(pages, countWords(ctx.transcript || ''));
  return { pages, target, words: wordsForPages(target), capped: target < pages };
}

/** Libellé de la cible pour le modèle (« ≈ 1,5 page A4 »). */
function pagesForModel(pages) {
  const p = Math.round(pages * 100) / 100;
  return `${String(p).replace('.', ',')} page${p >= 2 ? 's' : ''} A4`;
}

/**
 * La forme du résumé suit sa longueur. Une même consigne de structure (« un
 * titre par sujet, décisions, points en suspens ») donne à un quart de page un
 * squelette de titres à une ligne chacun, et à dix pages un texte qui s'arrête
 * à mi-course. Les seuils sont en MOTS visés.
 */
function pageMeterShape(words) {
  if (words < 170)
    return "Format : une synthèse resserrée — un court paragraphe, ou 3 à 6 puces —, sans intertitre. Garde l'essentiel : l'objet, les décisions, ce qui reste ouvert. Si les directives prévoient plusieurs parties, fusionne-les plutôt que d'écrire une ligne par partie.";
  if (words < 380)
    return 'Format : 2 à 4 parties courtes, quelques phrases ou puces chacune. Regroupe les sujets mineurs ; omets une partie des directives plutôt que de la réduire à une ligne.';
  if (words < 800)
    return 'Format : 3 à 6 parties titrées, un sujet majeur par partie, les sujets mineurs regroupés. Garde les chiffres, noms et échéances cités.';
  if (words < 1600)
    return 'Format : une partie titrée par sujet abordé, développée — ce qui a été dit, ce qui a été décidé, ce qui reste ouvert —, avec les chiffres, noms et échéances cités.';
  return 'Format : compte rendu détaillé. Chaque sujet a sa partie, développée en profondeur — arguments et positions de chacun, chiffres, échéances, options évoquées, désaccords —, découpée en sous-parties ou en listes imbriquées quand le sujet est riche.';
}

/**
 * Bloc de longueur du prompt principal. Il REMPLACE la consigne de profondeur
 * (AMBITION_RULES) : « couvre chaque sujet dans son bloc, ne t'auto-censure pas
 * sur la longueur » contredirait un quart de page. Ce qu'elle protège — la
 * fidélité, pas de remplissage — est repris ici à toutes les tailles.
 */
function pageMeterRules(plan, marker) {
  const min = Math.round(plan.words * 0.9);
  const max = Math.round(plan.words * 1.1);
  return [
    "#LONGUEUR_IMPOSÉE — Pagimètre (choisie par l'utilisateur : prime sur toute indication de longueur des DIRECTIVES_UTILISATEUR)",
    `Le contenu inséré à la place de ${marker} fait environ ${plan.words} mots — entre ${min} et ${max} —, soit ≈ ${pagesForModel(plan.target)} une fois mis en page. Cette longueur est celle de CE contenu seulement : le reste du scaffold (titres, infos, actions) ne compte pas.`,
    `- ${pageMeterShape(plan.words)}`,
    `- Fidélité d'abord : n'invente rien, ne délaye pas — ni phrase de remplissage, ni redite, ni généralité.${plan.capped ? " La réunion est courte : cette longueur est le maximum qu'elle permet ; si sa matière n'y suffit pas, arrête-toi avant." : ''}`,
    '- Avant de rendre, estime la longueur de ton contenu : hors de la fourchette, resserre ou développe.',
  ].join('\n');
}

/**
 * Lignes du scaffold HTML qui encadrent le résumé : le serveur y découpe le
 * résumé rendu pour le mesurer et, au besoin, le faire reprendre seul (cf.
 * splitAtAnchors, src/lib/pageMeter.js). L'ancre de fin doit être UNIQUE dans
 * la suite du scaffold, sinon on ne saurait pas où le résumé s'arrête : pas
 * d'ancres, pas de vérification — la consigne de longueur reste.
 */
function pageMeterAnchors(scaffoldHtml, marker) {
  const lines = scaffoldHtml
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const at = lines.indexOf(marker);
  if (at === -1) return null;
  const head = lines.slice(0, at);
  const tail = lines.slice(at + 1);
  const before = head.length ? head[head.length - 1] : null;
  const after = tail.length ? tail[0] : null;
  if (after && tail.filter((l) => l === after).length > 1) return null;
  return {
    before,
    beforeCount: before ? head.filter((l) => l === before).length : 0,
    after,
  };
}

/**
 * Consignes de REPRISE, envoyées avec le plan : le serveur prend l'une ou
 * l'autre selon la mesure (trop court → développer, trop long → condenser) et
 * y reporte les nombres ({{mots_actuels}}, {{mots_cibles}}, {{mots_min}},
 * {{mots_max}}). Mêmes contextes que le prompt principal — la graphie des noms
 * et les notes font foi dans la reprise aussi. La forme visée est celle de la
 * longueur demandée (pageMeterShape) : un quart de page développé en deux
 * pages gagne des parties, trois pages condensées en une les regroupent — mais
 * une retouche modérée garde ses parties, sinon la densité mesurée ne vaut
 * plus et la reprise tombe à côté.
 */
function buildPageFixPrompts(inst, ctx, plan) {
  const tonName = tonLabel(ctx.ton);
  const shared = [];
  if (inst) shared.push('#DIRECTIVES_DU_TEMPLATE (la forme voulue pour ce résumé)', inst, '');
  const referenceBlock = buildReferenceContextBlock(ctx);
  if (referenceBlock) shared.push(referenceBlock, '');
  const attributionBlock = buildAttributionBlock(ctx);
  if (attributionBlock) shared.push(attributionBlock, '');
  const notesBlock = buildNotesBlock(ctx);
  if (notesBlock) shared.push(notesBlock, '');
  shared.push(
    '#FORMAT_SORTIE — RÈGLES NON-NÉGOCIABLES',
    '- Le résumé repris, SEUL : fragment HTML (<h3>, <p>, <ul>/<li>, <strong>, <em>), sans <html>/<body>, sans titre de document, sans phrase d’introduction ni texte autour, sans markdown.',
    `- Langue de sortie : "${ctx.language ?? 'fr'}"${tonName ? ` ; ton : ${tonName} — ${tonInstruction(ctx.ton)}` : ''}.`,
  );
  const head = (verb) =>
    [
      '#TÂCHE — REPRISE DE LONGUEUR (Pagimètre)',
      `Le résumé HTML du message "user" (#RÉSUMÉ_À_REPRENDRE) est le corps d'un compte rendu de réunion. Il fait {{mots_actuels}} mots ; l'utilisateur a demandé environ {{mots_cibles}} mots (entre {{mots_min}} et {{mots_max}}). ${verb} jusqu'à cette longueur.`,
    ].join('\n');
  const shape = `- Forme visée pour cette longueur — ${pageMeterShape(plan.words)}`;
  const expand = [
    head('DÉVELOPPE-le'),
    shape,
    '- Puise dans la transcription (message "user") ce que le résumé omet ou survole : sujets passés sous silence, arguments et positions de chacun, chiffres, noms, dates et échéances, options évoquées, points restés ouverts.',
    '- Garde tout ce que le résumé contient déjà, sa structure et ses titres ; ajoute une partie quand un sujet manque.',
    "- N'invente rien et ne délaye pas : ni phrase de remplissage, ni redite, ni généralité. Si la transcription n'a vraiment pas assez de matière, arrête-toi avant la cible — la fidélité prime sur la longueur.",
    '',
    ...shared,
  ].join('\n');
  const condense = [
    head('CONDENSE-le'),
    shape,
    '- Garde en priorité les décisions et qui les a prises, les engagements, les chiffres et les échéances, les désaccords et les points ouverts.',
    '- Resserre : fusionne les redites, raccourcis les développements secondaires, regroupe les sujets mineurs. Garde les mêmes parties tant que la longueur le permet ; n’en fusionne que si la cible fait moins de la moitié de l’actuel.',
    "- Ne supprime aucune décision ni aucun engagement ; n'ajoute rien qui ne figure dans le résumé.",
    '',
    ...shared,
  ].join('\n');
  return { expand, condense };
}

function buildScaffoldPrompt(scaffoldStr, instructionsStr, ctx, pagePlan = null) {
  const MARKER = '[[AI_RESUME_BLOCK]]';
  let effectiveScaffold = scaffoldStr;
  SCAFFOLD_MARKER_RE.lastIndex = 0;
  let hasMarker = SCAFFOLD_MARKER_RE.test(effectiveScaffold);
  SCAFFOLD_MARKER_RE.lastIndex = 0;
  // Blocs IA à consigne fixe présents dans le scaffold. Chacun part dans son
  // propre appel LLM (cf. buildFixedBlockPrompt) ; dans le prompt PRINCIPAL,
  // ils ne sont représentés que par des emplacements OPAQUES [[AI_SLOT_n]] —
  // ni consigne, ni nom parlant : le modèle principal ne doit pas savoir
  // qu'un résumé court existe ailleurs, sinon il raccourcit le sien.
  const fixedBlocks = FIXED_AI_BLOCKS.filter((b) => {
    b.re.lastIndex = 0;
    const present = b.re.test(effectiveScaffold);
    b.re.lastIndex = 0;
    return present;
  });
  if (!hasMarker) {
    // Le bloc ✨ Résumé IA (fruit des Directives) est OBLIGATOIRE dans tout
    // compte rendu — déplaçable, jamais supprimable. S'il manque (donnée
    // antérieure à cette règle, prompt V1), on l'ajoute en fin de scaffold.
    // Les blocs à consigne fixe sont des résumés COMPLÉMENTAIRES, jamais des
    // remplaçants.
    effectiveScaffold = `${effectiveScaffold.trim()}\n\n{{résumé}}`;
    hasMarker = true;
  }
  // Interpolation (date/auteur/durée/actions) → marqueur résumé + slots →
  // conversion markdown→HTML côté client. Chaque jeton reste une ligne nue.
  const slots = fixedBlocks.map((b, i) => ({ block: b, slot: `[[AI_SLOT_${i + 1}]]` }));
  let withMarkers = interpolateTemplate(effectiveScaffold, ctx).replace(SCAFFOLD_MARKER_RE, MARKER);
  for (const { block, slot } of slots) withMarkers = withMarkers.replace(block.re, slot);
  const scaffold = scaffoldMdToHtml(withMarkers, [MARKER, ...slots.map((s) => s.slot)]);
  SCAFFOLD_MARKER_RE.lastIndex = 0;

  const tonName = tonLabel(ctx.ton);
  // Le Pagimètre remplace l'ancien réglage de longueur (Dock) : jamais les deux.
  const longName = pagePlan ? null : longueurLabel(ctx.longueur);
  const inst = (instructionsStr || '').trim();
  const hasSlots = slots.length > 0;
  const slotList = slots.map((s) => s.slot).join(', ');
  const lines = [];

  lines.push('#TÂCHE_SYSTÈME — IMPOSÉE (priorité absolue)');
  lines.push('');
  lines.push(
    `Le SCAFFOLD ci-dessous est DÉJÀ en HTML. Renvoie-le À L'IDENTIQUE — mot pour mot, balises comprises, même ordre et même structure. La SEULE chose à remplacer est le marqueur ${MARKER} : il est SUPPRIMÉ et remplacé par le CORPS DU COMPTE RENDU, fidèle au contenu de la transcription (message "user"), formaté en HTML, suivant strictement les DIRECTIVES_UTILISATEUR ci-dessous. La chaîne ${MARKER} ne doit JAMAIS apparaître dans ta sortie.`,
  );
  lines.push('');
  // Le marqueur était présenté comme « remplacé par un texte » : le modèle y
  // répondait par UN paragraphe, alors que c'est le corps entier du compte
  // rendu. Le scaffold ne fixe que le squelette (titre, sections, actions) —
  // la structure INTERNE du compte rendu, elle, est produite ici, et rien ne le
  // disait. C'est l'autre moitié de l'écart avec ChatGPT, où le modèle rédige
  // tout le document et se structure donc librement.
  lines.push(
    `${MARKER} n'est PAS une ligne à remplir : c'est l'emplacement du compte rendu lui-même. Il se déploie en AUTANT de blocs HTML que le contenu l'exige — plusieurs sous-titres <h3>, plusieurs listes, plusieurs paragraphes. Un seul paragraphe à cet endroit est une réponse INSUFFISANTE, sauf si les DIRECTIVES_UTILISATEUR demandent explicitement le contraire.`,
  );
  if (hasSlots) {
    lines.push('');
    lines.push(
      `Les jetons ${slotList} sont des emplacements RÉSERVÉS, remplis par un autre système APRÈS toi. Recopie chacun EXACTEMENT tel quel, seul sur sa ligne — ne les remplace pas, ne les supprime pas, n'écris JAMAIS de contenu à leur place (en cas de doute, recopie le jeton et passe), et ignore-les totalement pour rédiger ton résumé.`,
    );
  }
  lines.push('');
  lines.push('#FORMAT_SORTIE — RÈGLES NON-NÉGOCIABLES');
  lines.push('- Sortie HTML uniquement, sans balises <html>/<head>/<body>.');
  lines.push(
    "- Le scaffold est déjà en HTML : NE LE RECONVERTIS PAS et n'émets AUCUN markdown (pas de `#`, `*`, `-` en début de ligne, pas de `**`).",
  );
  lines.push(
    `- Pour le contenu inséré à la place de ${MARKER}, utilise du HTML : <h2>/<h3>, <ul><li>, <strong>, <em>.`,
  );
  lines.push(`- N'ajoute, ne déplace, ne supprime AUCUNE section du scaffold hors de ${MARKER}.`);
  lines.push(`- Langue de sortie : "${ctx.language ?? 'fr'}"`);
  lines.push('');

  // Contextes org/utilisateur AVANT les directives, en bloc de référence à
  // priorité haute : rangés en fin de « paramètres du bloc », le modèle les
  // ignorait (nom de l'utilisateur mal orthographié malgré la graphie écrite
  // dans son contexte — constat du 27/08).
  const referenceBlock = buildReferenceContextBlock(ctx);
  if (referenceBlock) {
    lines.push(referenceBlock);
    lines.push('');
  }

  lines.push(
    `#DIRECTIVES_UTILISATEUR (à respecter STRICTEMENT pour le contenu inséré à la place de ${MARKER})`,
  );
  if (inst) {
    lines.push(inst);
  } else {
    lines.push('Produis un résumé fidèle et complet du contenu de la transcription.');
  }
  lines.push('');

  // Consigne de profondeur, comme dans le chemin instructions. PORTÉE explicite :
  // le contenu du marqueur, et lui seul — sans cette borne, « couvre chaque
  // sujet dans son propre bloc » contredirait « ne supprime, n'ajoute AUCUNE
  // section du scaffold » et ferait inventer des sections hors du marqueur.
  lines.push(
    pagePlan
      ? `${pageMeterRules(pagePlan, MARKER)}\n\nLe reste du scaffold est recopié tel quel : n'y ajoute aucune section.`
      : `${AMBITION_RULES}\n\nCes règles de profondeur portent UNIQUEMENT sur le contenu inséré à la place de ${MARKER}. Le reste du scaffold est recopié tel quel : n'y ajoute aucune section.`,
  );
  lines.push('');

  if (tonName || longName || ctx.customPrompt) {
    lines.push(
      `#PARAMÈTRES_DU_BLOC (s'appliquent uniquement au contenu inséré à la place de ${MARKER})`,
    );
    if (tonName) lines.push(`- Ton : ${tonName} — ${tonInstruction(ctx.ton)}`);
    if (longName) lines.push(`- Longueur : ${longName} — ${longueurInstruction(ctx.longueur)}`);
    if (ctx.customPrompt)
      lines.push(`- Instructions supplémentaires utilisateur : ${ctx.customPrompt}`);
    lines.push('');
  }

  const attributionBlock = buildAttributionBlock(ctx);
  if (attributionBlock) {
    lines.push(attributionBlock);
    lines.push('');
  }

  const notesBlock = buildNotesBlock(ctx);
  if (notesBlock) {
    lines.push(notesBlock);
    lines.push('');
  }

  lines.push('#SCAFFOLD');
  lines.push(scaffold);

  if (hasSlots || referenceBlock || pagePlan) {
    lines.push('');
    lines.push('#RAPPEL_FINAL');
    if (pagePlan) {
      lines.push(
        `Le contenu inséré à la place de ${MARKER} fait environ ${pagePlan.words} mots (Pagimètre).`,
      );
    }
    if (hasSlots) {
      lines.push(
        `${MARKER} est remplacé par ton résumé. Chaque jeton ${slotList} est recopié tel quel, inchangé, seul sur sa ligne.`,
      );
    }
    if (referenceBlock) {
      lines.push(
        'Les graphies du #CONTEXTE_DE_RÉFÉRENCE (noms de personnes, sigles, sociétés) font foi dans tout le contenu généré.',
      );
    }
  }

  // Ancre de repli d'un slot : la dernière ligne STATIQUE du scaffold avant
  // lui (souvent son titre de section, ex. `<h2>En bref</h2>`). Si le modèle
  // principal mange le jeton, le serveur insère le fragment après cette ancre
  // au lieu de le rejeter en fin de compte rendu.
  const scaffoldLines = scaffold.split('\n');
  const slotSet = new Set(slots.map((s) => s.slot));
  const anchorFor = (slot) => {
    for (let i = scaffoldLines.indexOf(slot) - 1; i >= 0; i--) {
      const line = scaffoldLines[i].trim();
      if (!line || line === MARKER || slotSet.has(line)) continue;
      return line;
    }
    return undefined;
  };

  return {
    systemPrompt: lines.join('\n'),
    blocks: slots.map(({ block, slot }) => ({
      marker: slot,
      systemPrompt: buildFixedBlockPrompt(block, ctx),
      anchor: anchorFor(slot),
    })),
    // Pagimètre : ce que le serveur vérifie (`pages`), où il découpe le
    // résumé (`anchors`), et comment il le fait reprendre (`fix`).
    length: pagePlan
      ? {
          pages: pagePlan.pages,
          anchors: pageMeterAnchors(scaffold, MARKER),
          fix: buildPageFixPrompts(inst, ctx, pagePlan),
        }
      : null,
  };
}

/**
 * Plan de génération complet : le prompt système de l'appel PRINCIPAL, plus un
 * appel ISOLÉ par bloc à consigne fixe ({ marker, systemPrompt }). Le serveur
 * exécute les appels en parallèle et remplace chaque marker par le fragment
 * généré. `blocks` est vide hors mode scaffold ou sans bloc fixe.
 */
export function resolveSummaryPlan(templateValue, ctx, customTemplates = []) {
  const custom = customTemplates.find((t) => t.value === templateValue);
  const customPromptStr = typeof custom?.prompt === 'string' ? custom.prompt.trim() : '';

  if (customPromptStr) {
    const { instructions, scaffold } = splitPromptFields(customPromptStr);
    ANY_AI_BLOCK_RE.lastIndex = 0;
    const hasAiBlock = ANY_AI_BLOCK_RE.test(scaffold);
    ANY_AI_BLOCK_RE.lastIndex = 0;
    // Scaffold mode kicks in if EITHER explicit instructions or an AI block
    // ({{résumé}} or a fixed-directive block) is present. Otherwise: V1
    // template (free-form prompt) → instruction mode, for backward compat.
    if (instructions.trim() || hasAiBlock) {
      return buildScaffoldPrompt(
        scaffold,
        instructions,
        ctx,
        resolvePagePlan(custom.pageMeter, ctx),
      );
    }
    // Template V1 (prompt libre) : pas de Pagimètre — sans scaffold, rien ne
    // sépare le résumé du reste du document, ni pour la consigne ni pour la
    // vérification. L'éditeur convertit tout template qu'il enregistre.
    return {
      systemPrompt: buildInstructionPrompt(templateValue, customPromptStr, ctx, custom),
      blocks: [],
      length: null,
    };
  }

  // Template fourni : sa forme éditable, telle que l'administration l'affiche.
  let tmpl = templateMap[templateValue];
  if (!tmpl) {
    console.warn(
      `resolveSummaryPlan: unknown template "${templateValue}", falling back to standard`,
    );
    tmpl = templateMap.standard;
  }
  const scaffold = ctx.language === 'en' ? tmpl.scaffoldEn : tmpl.scaffold;
  return buildScaffoldPrompt(
    scaffold,
    tmpl.instructions,
    ctx,
    resolvePagePlan(tmpl.pageMeter, ctx),
  );
}

export function resolveSystemPrompt(templateValue, ctx, customTemplates = []) {
  return resolveSummaryPlan(templateValue, ctx, customTemplates).systemPrompt;
}

/**
 * Prompt « sandwich » des templates V1 (prompt libre, ni directives ni bloc
 * IA) : format header (system rules) → user template (content guidance) →
 * format footer (reminder).
 */
function buildInstructionPrompt(templateValue, promptStr, ctx, custom) {
  const templateLabels = custom?.labels || templateMap[templateValue]?.labels || null;
  const templateName = templateLabels?.[ctx.language] || templateLabels?.fr || templateValue;
  const templateBody = appendModifiers(interpolateTemplate(promptStr, ctx), ctx);

  const personalization = buildPersonalizationBlock(ctx);
  const attributionBlock = buildAttributionBlock(ctx);
  const notesBlock = buildNotesBlock(ctx);
  const templateHeader = `#TEMPLATE_SÉLECTIONNÉ\nL'utilisateur a choisi le template : "${templateName}" (clé technique : ${templateValue}).`;

  return `${systemFormatHeader(ctx)}

${templateHeader}${personalization ? `\n\n${personalization}` : ''}${attributionBlock ? `\n\n${attributionBlock}` : ''}${notesBlock ? `\n\n${notesBlock}` : ''}

--- DÉBUT GUIDE DE CONTENU (template utilisateur — interprété comme guide de CONTENU, pas comme règle de format) ---

${templateBody}

--- FIN GUIDE DE CONTENU ---

${systemFormatFooter()}`;
}
