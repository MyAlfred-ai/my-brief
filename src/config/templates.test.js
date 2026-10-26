import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildPersonalizationBlock,
  buildNotesBlock,
  buildAttributionBlock,
  resolveSystemPrompt,
  resolveSummaryPlan,
  templates,
  templateOptions,
  DEFAULT_EDITABLE_TEMPLATES,
  combinePromptFields,
  buildTemplateOptions,
} from './templates.js';
import { scaffoldToTiptapDoc, tiptapDocToScaffold } from './scaffold.js';

const CONTEXT_MARK = "CONTEXTE PERMANENT DE L'UTILISATEUR";
const ORG_MARK = "VOCABULAIRE ET CONTEXTE DE L'ORGANISATION";
const REFERENCE_MARK = '#CONTEXTE_DE_RÉFÉRENCE';
const NOTES_MARK = '#NOTES_DE_RÉUNION';
const ATTRIBUTION_MARK = '#ATTRIBUTION_DES_LOCUTEURS';

// Template V1 : prompt libre, ni directives ni bloc IA → seul client restant
// du chemin « instructions » (les templates fournis passent par le scaffold).
const v1Template = {
  value: 'v1',
  labels: { fr: 'Ancien', en: 'Legacy' },
  prompt: 'Résume la réunion en listant les décisions.',
};

describe('buildPersonalizationBlock — userContext', () => {
  it('inclut le contexte permanent quand userContext est fourni', () => {
    const out = buildPersonalizationBlock({ userContext: 'Je suis CTO chez Acme.' });
    expect(out).toContain(CONTEXT_MARK);
    expect(out).toContain('Je suis CTO chez Acme.');
  });

  it('renvoie une chaîne vide sans aucune personnalisation', () => {
    expect(buildPersonalizationBlock({})).toBe('');
    expect(buildPersonalizationBlock({ userContext: '   ' })).toBe('');
  });

  it('NON-RÉGRESSION : sans userContext, aucun bloc contexte permanent', () => {
    const out = buildPersonalizationBlock({ ton: 1, longueur: 50, customPrompt: 'sois bref' });
    expect(out).not.toContain(CONTEXT_MARK);
    // les anciennes personnalisations restent intactes
    expect(out).toContain('sois bref');
  });
});

describe('resolveSystemPrompt — injection dans CHAQUE CR', () => {
  const baseCtx = {
    language: 'fr',
    actions: [],
    meetingDurationFormatted: '00:10:00',
    authorName: 'Alex',
  };

  it('template fourni : le contexte permanent est présent dans le prompt', () => {
    const p = resolveSystemPrompt('standard', { ...baseCtx, userContext: 'Contexte XYZ' });
    expect(p).toContain('Contexte XYZ');
    expect(p).toContain(REFERENCE_MARK);
  });

  it('template fourni : NON-RÉGRESSION sans contexte', () => {
    expect(resolveSystemPrompt('standard', { ...baseCtx })).not.toContain(REFERENCE_MARK);
  });

  it('mode instructions (template V1) : le contexte permanent est présent', () => {
    const ctx = { ...baseCtx, userContext: 'Contexte XYZ' };
    const p = resolveSystemPrompt('v1', ctx, [v1Template]);
    expect(p).toContain('Contexte XYZ');
    expect(p).toContain(CONTEXT_MARK);
    expect(resolveSystemPrompt('v1', { ...baseCtx }, [v1Template])).not.toContain(CONTEXT_MARK);
  });

  it('mode scaffold (template utilisateur) : le contexte permanent est présent', () => {
    const userTemplate = {
      value: 'mon-tpl',
      labels: { fr: 'Mon Tpl', en: 'My Tpl' },
      prompt: '#INSTRUCTIONS#\nRésume.\n#SCAFFOLD#\n# Titre\n{{résumé}}',
    };
    const p = resolveSystemPrompt('mon-tpl', { ...baseCtx, userContext: 'Contexte SCAFF' }, [
      userTemplate,
    ]);
    expect(p).toContain('Contexte SCAFF');
  });
});

describe('buildPersonalizationBlock — orgContext', () => {
  it("inclut le vocabulaire de l'organisation quand il est fourni", () => {
    const out = buildPersonalizationBlock({ orgContext: '« ADV » = administration des ventes.' });
    expect(out).toContain(ORG_MARK);
    expect(out).toContain('administration des ventes');
  });

  it('renvoie une chaîne vide quand il est blanc', () => {
    expect(buildPersonalizationBlock({ orgContext: '   ' })).toBe('');
  });

  it("l'organisation vient AVANT la personne : du général au particulier", () => {
    const out = buildPersonalizationBlock({
      orgContext: 'Sigles maison',
      userContext: 'Je suis CTO chez Acme.',
    });
    expect(out.indexOf(ORG_MARK)).toBeLessThan(out.indexOf(CONTEXT_MARK));
  });

  it('NON-RÉGRESSION : sans orgContext, aucun bloc organisation', () => {
    const out = buildPersonalizationBlock({ userContext: 'Je suis CTO chez Acme.' });
    expect(out).not.toContain(ORG_MARK);
  });
});

describe("resolveSystemPrompt — contexte d'organisation dans les DEUX chemins", () => {
  const baseCtx = {
    language: 'fr',
    actions: [],
    meetingDurationFormatted: '00:10:00',
    authorName: 'Alex',
  };

  it('template fourni : le vocabulaire est présent dans le prompt', () => {
    const p = resolveSystemPrompt('standard', { ...baseCtx, orgContext: 'Client INITECH' });
    expect(p).toContain('Client INITECH');
    expect(p).toContain(REFERENCE_MARK);
  });

  it('mode instructions (template V1) : le vocabulaire est présent, et absent sans contexte', () => {
    const p = resolveSystemPrompt('v1', { ...baseCtx, orgContext: 'Client INITECH' }, [v1Template]);
    expect(p).toContain('Client INITECH');
    expect(p).toContain(ORG_MARK);
    expect(resolveSystemPrompt('v1', { ...baseCtx }, [v1Template])).not.toContain(ORG_MARK);
  });

  it('mode scaffold (template utilisateur) : le vocabulaire est présent', () => {
    // Deux chemins de prompt qui n'assemblent pas pareil : un contexte oublié
    // dans l'un ne se voit que sur les templates concernés.
    const userTemplate = {
      value: 'mon-tpl',
      labels: { fr: 'Mon Tpl', en: 'My Tpl' },
      prompt: '#INSTRUCTIONS#\nRésume.\n#SCAFFOLD#\n# Titre\n{{résumé}}',
    };
    const p = resolveSystemPrompt('mon-tpl', { ...baseCtx, orgContext: 'Client SCAFF' }, [
      userTemplate,
    ]);
    expect(p).toContain('Client SCAFF');
  });
});

describe('buildNotesBlock — notes de réunion', () => {
  it('inclut les notes et la consigne d’orthographe des noms', () => {
    const out = buildNotesBlock({ meetingNotes: 'M. Globex, sigle SDIS' });
    expect(out).toContain(NOTES_MARK);
    expect(out).toContain('M. Globex, sigle SDIS');
    expect(out).toContain('RÉFÉRENCE POUR LES NOMS');
  });

  it('renvoie une chaîne vide sans notes (ou notes blanches)', () => {
    expect(buildNotesBlock({})).toBe('');
    expect(buildNotesBlock({ meetingNotes: '   ' })).toBe('');
  });

  it('la référence d’orthographe est limitative : trois cas, jamais un nom différent', () => {
    // « La graphie des notes fait foi » sans borne faisait remplacer tous les
    // prénoms du résumé par celui des notes (cas Sophie). Ces marqueurs
    // portent le resserrage — même règle que refineTranscriptPrompt côté api.
    const out = buildNotesBlock({ meetingNotes: 'Réunion avec Sophie, AIR FRANCE' });
    expect(out).toContain('TROIS cas, et seulement ceux-là');
    expect(out).toContain('ne remplace JAMAIS un nom différent');
    expect(out).toContain('simplement mentionnée');
    // Resserrage du 2026-08-28 : la transcription est la règle par défaut, un
    // mot réel ne se corrige que sur la consigne explicite du cas 1.
    expect(out).toContain('RÈGLE PAR DÉFAUT : garde la graphie de la transcription');
    expect(out).toContain('QUE sur la consigne explicite du cas 1');
    expect(out).toContain('MANIFESTEMENT écorché');
  });
});

describe('resolveSystemPrompt — notes injectées dans les DEUX chemins', () => {
  const baseCtx = {
    language: 'fr',
    actions: [],
    meetingDurationFormatted: '00:10:00',
    authorName: 'Alex',
  };

  it('template fourni : les notes sont présentes dans le prompt', () => {
    const p = resolveSystemPrompt('standard', { ...baseCtx, meetingNotes: 'Notes ABC' });
    expect(p).toContain(NOTES_MARK);
    expect(p).toContain('Notes ABC');
  });

  it('mode instructions (template V1) : les notes sont présentes dans le prompt', () => {
    const p = resolveSystemPrompt('v1', { ...baseCtx, meetingNotes: 'Notes V1' }, [v1Template]);
    expect(p).toContain(NOTES_MARK);
    expect(p).toContain('Notes V1');
  });

  it('template fourni : NON-RÉGRESSION sans notes', () => {
    const p = resolveSystemPrompt('standard', { ...baseCtx });
    expect(p).not.toContain(NOTES_MARK);
  });

  it('durée inconnue (null) : le prompt dit « inconnue », jamais 00:00:00', () => {
    // Régénération depuis l'historique sans durée en base, import audio
    // illisible… : App.svelte envoie null, pas un « 00:00:00 » mensonger.
    const p = resolveSystemPrompt('standard', { ...baseCtx, meetingDurationFormatted: null });
    expect(p).toContain('inconnue');
    expect(p).not.toContain('00:00:00');
  });

  it('mode scaffold (template utilisateur) : les notes sont présentes', () => {
    const userTemplate = {
      value: 'mon-tpl',
      labels: { fr: 'Mon Tpl', en: 'My Tpl' },
      prompt: '#INSTRUCTIONS#\nRésume.\n#SCAFFOLD#\n# Titre\n{{résumé}}',
    };
    const p = resolveSystemPrompt('mon-tpl', { ...baseCtx, meetingNotes: 'Notes SCAFF' }, [
      userTemplate,
    ]);
    expect(p).toContain('Notes SCAFF');
    expect(p).toContain(NOTES_MARK);
  });
});

describe('actions dans le prompt — seules les actions NON MASQUÉES', () => {
  const actions = [
    { id: 1, title: 'Relancer le fournisseur', owner: 'Alex', show: true },
    { id: 2, title: 'Commander les badges', show: false },
    { id: 3, title: 'Envoyer le devis' },
  ];

  it('template fourni : masquée absente, sans champ `show` présente', () => {
    const p = resolveSystemPrompt('standard', { language: 'fr', actions });
    expect(p).toContain('Relancer le fournisseur');
    expect(p).toContain('Envoyer le devis');
    expect(p).not.toContain('Commander les badges');
  });

  it('toutes masquées → « Aucune action »', () => {
    const p = resolveSystemPrompt('standard', {
      language: 'fr',
      actions: [{ id: 2, title: 'Commander les badges', show: false }],
    });
    expect(p).toContain('Aucune action');
    expect(p).not.toContain('Commander les badges');
  });

  it('ni carte vierge ni texte de remplacement d’autrefois dans {{actions}}', () => {
    // Avant, une action ajoutée à la main partait en « Nouvelle action —
    // À définir — Description de l'action... » dans le compte rendu.
    const p = resolveSystemPrompt('standard', {
      language: 'fr',
      actions: [
        { id: 1, title: '', owner: '', dueDate: '', description: '', show: true },
        {
          id: 2,
          title: 'Nouvelle action',
          owner: 'À définir',
          description: "Description de l'action...",
        },
        { id: 3, title: 'Relancer le fournisseur', owner: 'À définir', dueDate: '2026-09-18' },
      ],
    });
    // Standard rend {{actions}} par sa mise en forme : la puce y devient du HTML.
    expect(p).toContain('<li><strong>Relancer le fournisseur</strong> — 2026-09-18</li>');
    expect(p).not.toContain('Nouvelle action');
    expect(p).not.toContain('À définir');
    expect(p).not.toContain("Description de l'action");
    expect(p).not.toContain('<strong>Action</strong>');
  });
});

describe('buildAttributionBlock — locuteurs par canal audio', () => {
  it('inclut les deux étiquettes et la consigne d’attribution', () => {
    const out = buildAttributionBlock({
      transcriptAttribution: { selfLabel: 'Alex', remoteLabel: 'Visio' },
    });
    expect(out).toContain(ATTRIBUTION_MARK);
    expect(out).toContain('[Alex]');
    expect(out).toContain('[Visio]');
    expect(out).toContain('attribue explicitement');
  });

  it('participants nommés : chaque nom est présenté comme une voix de la visio', () => {
    const out = buildAttributionBlock({
      transcriptAttribution: {
        selfLabel: 'Alex',
        remoteLabel: 'Visio',
        remoteLabels: ['Marie', 'Paul', 'Visio'],
      },
    });
    expect(out).toContain('« [Marie] », « [Paul] » introduisent');
    expect(out).toContain("nommé par l'utilisateur");
    expect(out).toContain("« [Visio] » ceux d'un participant de la visioconférence non identifié");
    expect(out).toContain('« [Alex] » / « [Marie] » / « [Paul] » / « [Visio] »');
  });

  it('toutes les voix nommées : plus de « Visio » à expliquer ni à deviner', () => {
    const out = buildAttributionBlock({
      transcriptAttribution: { selfLabel: 'Alex', remoteLabel: 'Visio', remoteLabels: ['Marie'] },
    });
    expect(out).toContain('« [Marie] » introduit');
    expect(out).not.toContain('[Visio]');
    expect(out).not.toContain('utilise-les pour désigner');
  });

  it('renvoie une chaîne vide sans attribution (réunion mono-flux)', () => {
    expect(buildAttributionBlock({})).toBe('');
    expect(buildAttributionBlock({ transcriptAttribution: null })).toBe('');
    expect(buildAttributionBlock({ transcriptAttribution: { selfLabel: 'Alex' } })).toBe('');
  });
});

describe('resolveSummaryPlan — blocs IA à consigne fixe : appels LLM ISOLÉS', () => {
  const baseCtx = {
    language: 'fr',
    actions: [],
    meetingDurationFormatted: '00:10:00',
    authorName: 'Alex',
  };
  const tpl = (scaffold) => [
    { value: 'mon-tpl', labels: { fr: 'Mon Tpl', en: 'My Tpl' }, prompt: scaffold },
  ];

  it("le prompt PRINCIPAL ne voit JAMAIS la consigne d'un bloc fixe — seulement un slot opaque", () => {
    // Mesuré sur CR réel (27/08) : la simple présence de « 20 mots » dans le
    // prompt du résumé principal le tirait vers un paragraphe moyen. Le
    // principal ne reçoit qu'un jeton neutre, la consigne part dans son
    // propre appel.
    const plan = resolveSummaryPlan(
      'mon-tpl',
      baseCtx,
      tpl('# Titre\n{{résumé}}\n\n{{résumé_20}}'),
    );
    expect(plan.systemPrompt).toContain('[[AI_RESUME_BLOCK]]');
    expect(plan.systemPrompt).toContain('[[AI_SLOT_1]]');
    expect(plan.systemPrompt).toContain('emplacements RÉSERVÉS');
    expect(plan.systemPrompt).toContain('#RAPPEL_FINAL');
    expect(plan.systemPrompt).not.toContain('20 mots');
    expect(plan.systemPrompt).not.toContain('AI_SUMMARY_20_WORDS');
    expect(plan.systemPrompt).not.toContain('résumé court');
    expect(plan.systemPrompt).not.toContain('{{résumé_20}}');
  });

  it('chaque bloc fixe part dans son propre appel avec sa consigne seule', () => {
    const plan = resolveSummaryPlan(
      'mon-tpl',
      baseCtx,
      tpl('{{résumé}}\n\n{{résumé_20}}\n\n{{points_clés}}'),
    );
    expect(plan.blocks).toHaveLength(2);
    expect(plan.blocks[0].marker).toBe('[[AI_SLOT_1]]');
    expect(plan.blocks[0].systemPrompt).toContain('20 mots MAXIMUM');
    expect(plan.blocks[0].systemPrompt).toContain('produis UNIQUEMENT');
    expect(plan.blocks[1].marker).toBe('[[AI_SLOT_2]]');
    expect(plan.blocks[1].systemPrompt).toContain('2 à 8');
    // l'appel isolé ne transporte pas les directives du bloc principal
    expect(plan.blocks[0].systemPrompt).not.toContain('DIRECTIVES_UTILISATEUR');
  });

  it('{{résumé_100}} : consigne 90 à 110 mots dans son appel isolé', () => {
    const plan = resolveSummaryPlan('mon-tpl', baseCtx, tpl('{{résumé_100}}'));
    // résumé principal obligatoire, ajouté même quand seul un bloc fixe existe
    expect(plan.systemPrompt).toContain('[[AI_RESUME_BLOCK]]');
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].systemPrompt).toContain('90 à 110');
  });

  it('deux chips COLLÉS : chaque jeton sort sur sa propre ligne nue du scaffold', () => {
    // `<p>[[A]][[B]]</p>` = un seul emplacement mal formé → un seul bloc généré.
    const plan = resolveSummaryPlan('mon-tpl', baseCtx, tpl('{{résumé_100}}{{résumé}}'));
    const scaffoldPart = plan.systemPrompt.slice(plan.systemPrompt.indexOf('#SCAFFOLD'));
    expect(scaffoldPart).toContain('\n[[AI_SLOT_1]]\n');
    expect(scaffoldPart).toContain('\n[[AI_RESUME_BLOCK]]\n');
    expect(scaffoldPart).not.toContain('<p>[[');
    expect(scaffoldPart).not.toContain(']][[');
  });

  it('les paramètres voyagent juste : ton/contextes dans les blocs isolés, longueur jamais', () => {
    const plan = resolveSummaryPlan(
      'mon-tpl',
      { ...baseCtx, ton: 1, longueur: 20, orgContext: 'Client INITECH', meetingNotes: 'M. Globex' },
      tpl('{{résumé}}\n\n{{résumé_20}}'),
    );
    const block = plan.blocks[0].systemPrompt;
    expect(block).toContain('Ton : Pro');
    expect(block).toContain('Client INITECH');
    expect(block).toContain('M. Globex'); // notes = orthographe des noms
    expect(block).not.toContain('Longueur');
    // la longueur du Dock reste sur le bloc principal
    expect(plan.systemPrompt).toContain('Longueur');
  });

  it('contextes org/utilisateur : bloc de référence AVANT les directives, avec consigne d’orthographe', () => {
    // Rangés en fin de « paramètres du bloc », le modèle les ignorait : nom
    // de l'utilisateur mal orthographié malgré la graphie écrite dans son
    // contexte (constat 27/08).
    const plan = resolveSummaryPlan(
      'mon-tpl',
      { ...baseCtx, userContext: 'Je suis Alex Villechalane.', orgContext: 'Client INITECH' },
      tpl('{{résumé}}\n\n{{résumé_20}}'),
    );
    const p = plan.systemPrompt;
    expect(p).toContain('#CONTEXTE_DE_RÉFÉRENCE');
    expect(p.indexOf('#CONTEXTE_DE_RÉFÉRENCE')).toBeLessThan(p.indexOf('#DIRECTIVES_UTILISATEUR'));
    expect(p).toContain('ORTHOGRAPHE');
    expect(p).toContain('Alex Villechalane');
    // rappel de fin : les graphies font foi
    expect(p).toContain('font foi');
    // l'organisation avant la personne (du général au particulier)
    expect(p.indexOf('Client INITECH')).toBeLessThan(p.indexOf('Alex Villechalane'));
    // les blocs isolés reçoivent le même référentiel
    expect(plan.blocks[0].systemPrompt).toContain('#CONTEXTE_DE_RÉFÉRENCE');
    expect(plan.blocks[0].systemPrompt).toContain('Alex Villechalane');
  });

  it('un saut de ligne du template (<br>) devient un vrai <p><br></p> dans le scaffold HTML', () => {
    const plan = resolveSummaryPlan('mon-tpl', baseCtx, tpl('Ligne 1\n\n<br>\n\n{{résumé}}'));
    const scaffoldPart = plan.systemPrompt.slice(plan.systemPrompt.indexOf('#SCAFFOLD'));
    expect(scaffoldPart).toContain('<p>Ligne 1</p>');
    expect(scaffoldPart).toContain('<p><br></p>');
  });

  it('NON-RÉGRESSION : sans bloc fixe, aucun slot, aucun appel secondaire', () => {
    const plan = resolveSummaryPlan('mon-tpl', baseCtx, tpl('# Titre\n{{résumé}}'));
    expect(plan.blocks).toHaveLength(0);
    expect(plan.systemPrompt).not.toContain('AI_SLOT');
    expect(plan.systemPrompt).not.toContain('#RAPPEL_FINAL');
    // resolveSystemPrompt reste l'accès chaîne (compat)
    expect(resolveSystemPrompt('mon-tpl', baseCtx, tpl('# Titre\n{{résumé}}'))).toBe(
      plan.systemPrompt,
    );
  });
});

describe('resolveSystemPrompt — attribution injectée dans les DEUX chemins', () => {
  const baseCtx = {
    language: 'fr',
    actions: [],
    meetingDurationFormatted: '00:10:00',
    authorName: 'Alex',
    transcriptAttribution: { selfLabel: 'Alex', remoteLabel: 'Visio' },
  };

  it('template fourni : le bloc attribution est présent', () => {
    const p = resolveSystemPrompt('standard', { ...baseCtx });
    expect(p).toContain(ATTRIBUTION_MARK);
    expect(p).toContain('[Alex]');
    expect(p).toContain('[Visio]');
  });

  it('mode instructions (template V1) : le bloc attribution est présent', () => {
    const p = resolveSystemPrompt('v1', { ...baseCtx }, [v1Template]);
    expect(p).toContain(ATTRIBUTION_MARK);
    expect(p).toContain('[Visio]');
  });

  it('template fourni : NON-RÉGRESSION sans attribution', () => {
    const p = resolveSystemPrompt('standard', { ...baseCtx, transcriptAttribution: null });
    expect(p).not.toContain(ATTRIBUTION_MARK);
  });

  it('mode scaffold (template utilisateur) : le bloc attribution est présent', () => {
    const userTemplate = {
      value: 'mon-tpl',
      labels: { fr: 'Mon Tpl', en: 'My Tpl' },
      prompt: '#INSTRUCTIONS#\nRésume.\n#SCAFFOLD#\n# Titre\n{{résumé}}',
    };
    const p = resolveSystemPrompt('mon-tpl', { ...baseCtx }, [userTemplate]);
    expect(p).toContain(ATTRIBUTION_MARK);
    expect(p).toContain('[Visio]');
  });
});

describe('profondeur du compte rendu — écart mesuré avec ChatGPT (2026-09-01)', () => {
  const ctx = {
    language: 'fr',
    actions: [],
    authorName: 'Alex',
    meetingDurationFormatted: '01:12:00',
  };
  const DEPTH_MARK = '#PROFONDEUR_ATTENDUE';
  const LENGTH_SCALE = '5-7 lignes';
  const userTemplate = {
    value: 'mon-tpl',
    labels: { fr: 'Mon Tpl', en: 'My Tpl' },
    prompt: 'Résume.\n@@SCAFFOLD@@\n# Titre\n{{résumé}}',
  };

  it("le barème de LONGUEUR n'apparaît PAS quand aucune longueur n'est choisie", () => {
    // C'ÉTAIT LE DÉFAUT : « court ≈ 5-7 lignes, moyen ≈ 10-15 lignes » était
    // imprimé dans tous les prompts, y compris quand l'utilisateur n'avait rien
    // choisi — et depuis la refonte du Dock il ne choisit plus jamais de
    // longueur. Le modèle lisait « 5-7 lignes » comme seule consigne de volume.
    const p = resolveSystemPrompt('v1', { ...ctx, longueur: null }, [v1Template]);
    expect(p).not.toContain(LENGTH_SCALE);
  });

  it('le barème revient dès que la longueur est explicitement choisie', () => {
    for (const longueur of [20, 50, 90]) {
      const p = resolveSystemPrompt('v1', { ...ctx, longueur }, [v1Template]);
      expect(p).toContain(LENGTH_SCALE);
    }
  });

  it('la consigne de profondeur est présente dans les DEUX chemins de prompt', () => {
    expect(resolveSystemPrompt('v1', ctx, [v1Template])).toContain(DEPTH_MARK);
    expect(resolveSystemPrompt('mon-tpl', ctx, [userTemplate])).toContain(DEPTH_MARK);
    expect(resolveSystemPrompt('standard', ctx)).toContain(DEPTH_MARK);
  });

  it('mode scaffold : le marqueur est annoncé comme le CORPS du CR, pas une ligne à remplir', () => {
    // Le modèle répondait par UN paragraphe : le prompt disait « remplacé par un
    // texte ». Le scaffold ne fixe que le squelette — la structure interne du
    // compte rendu est produite par le modèle, et rien ne le lui disait.
    const p = resolveSystemPrompt('mon-tpl', ctx, [userTemplate]);
    expect(p).toContain('AUTANT de blocs HTML que le contenu l’exige'.replace('’', "'"));
    expect(p).toContain('Un seul paragraphe à cet endroit est une réponse INSUFFISANTE');
  });

  it('mode scaffold : la profondeur est BORNÉE au marqueur, jamais au scaffold', () => {
    // Sans cette borne, « couvre chaque sujet dans son propre bloc »
    // contredirait « n'ajoute AUCUNE section du scaffold » et ferait inventer
    // des sections hors du marqueur.
    const p = resolveSystemPrompt('mon-tpl', ctx, [userTemplate]);
    expect(p).toContain('portent UNIQUEMENT sur le contenu inséré à la place de');
  });

  it('les blocs à consigne fixe NE reçoivent PAS la consigne de profondeur', () => {
    // Ils ont un plafond de mots dur (20 mots, 100 mots) : la profondeur le
    // ferait exploser. C'est aussi pour cela qu'ils partent en verbosity 'low'.
    const plan = resolveSummaryPlan('mon-tpl', ctx, [
      { ...userTemplate, prompt: 'Résume.\n@@SCAFFOLD@@\n# Titre\n{{résumé}}\n{{résumé_20}}' },
    ]);
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].systemPrompt).not.toContain(DEPTH_MARK);
  });
});

describe('templates fournis — une seule forme, celle de l’éditeur (2026-09-15)', () => {
  const ctx = {
    language: 'fr',
    actions: [{ title: 'Envoyer le devis', owner: 'Marie' }],
    meetingDurationFormatted: '00:42:00',
    authorName: 'Alex',
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('Prospect IA ne fait plus partie des templates fournis', () => {
    expect(templateOptions.map((o) => o.value)).toEqual([
      'standard',
      'decision',
      'rh',
      'brainstorming',
      'planning',
      'retrospective',
    ]);
  });

  it('une réunion qui demande encore « prospect » retombe sur Standard', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T10:30:00'));
    expect(resolveSystemPrompt('prospect', ctx)).toBe(resolveSystemPrompt('standard', ctx));
  });

  it('chaque template fourni tourne par sa forme éditable : directives + mise en forme', () => {
    for (const t of templates) {
      const plan = resolveSummaryPlan(t.value, ctx);
      expect(plan.systemPrompt).toContain('#DIRECTIVES_UTILISATEUR');
      expect(plan.systemPrompt).toContain(t.instructions);
      expect(plan.systemPrompt).toContain('<h2>Synthèse</h2>\n[[AI_RESUME_BLOCK]]');
      expect(plan.systemPrompt).toContain('<strong>Envoyer le devis</strong> — Marie');
      expect(plan.blocks).toHaveLength(0); // aucun appel IA de plus
    }
  });

  it('sauvegarder un défaut sans le modifier ne change pas son rendu', () => {
    // C'ÉTAIT LE PIÈGE : le défaut tournait par un buildPrompt caché, l'éditeur
    // en montrait une « traduction » — la première sauvegarde changeait le
    // document, et la doc admin devait prévenir de relire avant d'enregistrer.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T10:30:00'));
    for (const d of DEFAULT_EDITABLE_TEMPLATES) {
      const saved = {
        value: d.value,
        icon: d.icon,
        labels: d.labels,
        prompt: combinePromptFields(d),
      };
      expect(resolveSummaryPlan(d.value, ctx, [saved])).toEqual(resolveSummaryPlan(d.value, ctx));
    }
  });

  it('interface anglaise : mise en forme et valeurs de repli en anglais', () => {
    const p = resolveSystemPrompt('standard', {
      language: 'en',
      actions: [],
      meetingDurationFormatted: null,
      authorName: null,
    });
    expect(p).toContain('<h2>Summary</h2>');
    expect(p).toContain('<h2>Action items</h2>\n<p>No actions</p>');
    expect(p).toContain('Author: Unknown author — Duration: unknown');
    expect(p).not.toContain('Synthèse');
    expect(p).not.toContain('Aucune action');
  });

  it('directives courtes et sans variable', () => {
    // Prospect IA en faisait 2 600 caractères. Les variables ne sont pas
    // interpolées dans les directives : un {{date}} y resterait brut.
    for (const t of templates) {
      expect(t.instructions).not.toMatch(/\{\{/);
      expect(t.instructions.length).toBeLessThanOrEqual(900);
    }
  });

  it("mises en forme dans la grammaire de l'éditeur : l'aller-retour TipTap les rend à l'identique", () => {
    for (const t of templates) {
      for (const scaffold of [t.scaffold, t.scaffoldEn]) {
        expect(tiptapDocToScaffold(scaffoldToTiptapDoc(scaffold))).toBe(scaffold);
        expect(scaffold).toContain('{{résumé}}');
        expect(scaffold).toContain('{{actions}}');
      }
    }
  });
});

describe('Pagimètre — la longueur du ✨ Résumé IA, en pages', () => {
  // Transcription assez longue pour ne rien plafonner (~8 pages de matière et plus).
  const LONG = 'mot '.repeat(20000);
  const ctx = (extra = {}) => ({
    language: 'fr',
    actions: [{ title: 'Envoyer le devis', owner: 'Marie' }],
    meetingDurationFormatted: '00:42:00',
    authorName: 'Alex',
    transcript: LONG,
    ...extra,
  });
  const customWithMeter = (
    pageMeter,
    scaffold = '# CR\n\n{{résumé}}\n\n## Actions\n\n{{actions}}',
  ) => ({
    value: 'maison',
    labels: { fr: 'Maison', en: 'House' },
    prompt: combinePromptFields({ instructions: 'Rédige un compte rendu.', scaffold }),
    ...(pageMeter === undefined ? {} : { pageMeter }),
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Standard le propose, réglé sur 1 page ; les autres templates fournis non', () => {
    const byValue = Object.fromEntries(templateOptions.map((o) => [o.value, o.pageMeter]));
    expect(byValue).toEqual({
      standard: 1,
      decision: null,
      rh: null,
      brainstorming: null,
      planning: null,
      retrospective: null,
    });
    // L'administration voit le même réglage que celui qui tourne.
    expect(DEFAULT_EDITABLE_TEMPLATES.find((d) => d.value === 'standard').pageMeter).toBe(1);
  });

  it('options de la carte : chacune porte son Pagimètre, ramené au pas', () => {
    const opts = buildTemplateOptions(
      [{ value: 'perso', icon: '🗒️', labels: { fr: 'Perso', en: 'Mine' }, pageMeter: 2.2 }],
      [
        { value: 'orga', labels: { fr: 'Orga', en: 'Org' } },
        // Standard recouvert par un enregistrement d'AVANT le Pagimètre : sans lui.
        { value: 'standard', labels: { fr: 'Standard', en: 'Standard' }, prompt: 'x' },
      ],
    );
    expect(opts.map((o) => [o.value, o.group, o.pageMeter])).toEqual([
      ['perso', 'user', 2],
      ['orga', 'admin', null],
      ['standard', 'admin', null],
      ['decision', 'admin', null],
      ['rh', 'admin', null],
      ['brainstorming', 'admin', null],
      ['planning', 'admin', null],
      ['retrospective', 'admin', null],
    ]);
    expect(buildTemplateOptions().find((o) => o.value === 'standard').pageMeter).toBe(1);
  });

  it('une longueur choisie devient une consigne chiffrée, à la place de la consigne de profondeur', () => {
    const plan = resolveSummaryPlan('standard', ctx({ pages: 1 }));
    const p = plan.systemPrompt;
    expect(p).toContain('#LONGUEUR_IMPOSÉE — Pagimètre');
    expect(p).toContain('environ 450 mots — entre 405 et 495 —, soit ≈ 1 page A4');
    expect(p).toContain('prime sur toute indication de longueur des DIRECTIVES_UTILISATEUR');
    // « ne t'auto-censure pas sur la longueur » contredirait un quart de page.
    expect(p).not.toContain('#PROFONDEUR_ATTENDUE');
    expect(p).toContain(
      '#RAPPEL_FINAL\nLe contenu inséré à la place de [[AI_RESUME_BLOCK]] fait environ 450 mots',
    );
    // Les directives du template restent, et le scaffold aussi.
    expect(p).toContain(templates[0].instructions);
    expect(p).toContain('<h2>Synthèse</h2>\n[[AI_RESUME_BLOCK]]');
  });

  it('le plan dit au serveur quoi vérifier, où découper, comment faire reprendre', () => {
    const { length } = resolveSummaryPlan(
      'standard',
      ctx({ pages: 2.5, userContext: 'Alex, DG', meetingNotes: 'SAL : lentilles' }),
    );
    expect(length.pages).toBe(2.5);
    expect(length.anchors).toEqual({
      before: '<h2>Synthèse</h2>',
      beforeCount: 1,
      after: '<h2>Actions à mener</h2>',
    });
    for (const [prompt, verb] of [
      [length.fix.expand, 'DÉVELOPPE-le'],
      [length.fix.condense, 'CONDENSE-le'],
    ]) {
      expect(prompt).toContain(verb);
      for (const slot of ['{{mots_actuels}}', '{{mots_cibles}}', '{{mots_min}}', '{{mots_max}}']) {
        expect(prompt).toContain(slot);
      }
      // Les contextes font foi dans la reprise aussi : graphie des noms, notes.
      expect(prompt).toContain(REFERENCE_MARK);
      expect(prompt).toContain(NOTES_MARK);
      expect(prompt).toContain(templates[0].instructions);
    }
    expect(length.fix.expand).toContain("N'invente rien et ne délaye pas");
    // La forme visée est celle de la longueur demandée (2,5 pages ≈ 1 125 mots).
    for (const prompt of [length.fix.expand, length.fix.condense]) {
      expect(prompt).toContain(
        'Forme visée pour cette longueur — Format : une partie titrée par sujet abordé',
      );
    }
    expect(length.fix.condense).toContain('Garde les mêmes parties tant que la longueur le permet');
    expect(length.fix.condense).toContain('Ne supprime aucune décision ni aucun engagement');
  });

  it('la forme suit la longueur : synthèse sans intertitre à ¼ de page, compte rendu détaillé à 10', () => {
    const small = resolveSummaryPlan('standard', ctx({ pages: 0.25 })).systemPrompt;
    expect(small).toContain('environ 113 mots');
    expect(small).toContain('sans intertitre');
    const big = resolveSummaryPlan('standard', ctx({ pages: 10 })).systemPrompt;
    expect(big).toContain('environ 4500 mots');
    expect(big).toContain('compte rendu détaillé');
  });

  it('réunion courte : la cible est bornée par la matière, et le modèle le sait', () => {
    // 1 500 mots dits → ~1,5 page au plus, même pour 10 demandées.
    const plan = resolveSummaryPlan(
      'standard',
      ctx({ pages: 10, transcript: 'mot '.repeat(1500) }),
    );
    expect(plan.length.pages).toBe(10);
    expect(plan.systemPrompt).toContain('environ 675 mots');
    expect(plan.systemPrompt).toContain('La réunion est courte');
    expect(resolveSummaryPlan('standard', ctx({ pages: 1 })).systemPrompt).not.toContain(
      'La réunion est courte',
    );
  });

  it('NON-RÉGRESSION : sans longueur, le prompt est celui d’avant', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T10:00:00'));
    const plan = resolveSummaryPlan('standard', ctx());
    expect(plan.length).toBeNull();
    expect(plan.systemPrompt).toContain('#PROFONDEUR_ATTENDUE');
    expect(plan.systemPrompt).not.toContain('Pagimètre');
    expect(resolveSummaryPlan('standard', ctx({ pages: null }))).toEqual(plan);
  });

  it('un template sans Pagimètre ignore une longueur égarée', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T10:00:00'));
    const withPages = resolveSummaryPlan('decision', ctx({ pages: 3 }));
    expect(withPages.length).toBeNull();
    expect(withPages).toEqual(resolveSummaryPlan('decision', ctx()));
    // Standard recouvert par un enregistrement antérieur au Pagimètre : idem.
    const legacy = {
      value: 'standard',
      labels: { fr: 'S', en: 'S' },
      prompt: combinePromptFields(templates[0]),
    };
    expect(resolveSummaryPlan('standard', ctx({ pages: 3 }), [legacy]).length).toBeNull();
  });

  it('templates enregistrés : le Pagimètre suit le champ ; un template V1 n’en a jamais', () => {
    expect(resolveSummaryPlan('maison', ctx({ pages: 2 }), [customWithMeter(1)]).length.pages).toBe(
      2,
    );
    expect(
      resolveSummaryPlan('maison', ctx({ pages: 2 }), [customWithMeter(undefined)]).length,
    ).toBeNull();
    expect(
      resolveSummaryPlan('maison', ctx({ pages: 2 }), [customWithMeter(null)]).length,
    ).toBeNull();
    const v1 = { ...v1Template, pageMeter: 1 };
    expect(resolveSummaryPlan('v1', ctx({ pages: 2 }), [v1]).length).toBeNull();
  });

  it('sauvegarder un défaut sans le modifier ne change pas son rendu — longueur comprise', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T10:00:00'));
    for (const d of DEFAULT_EDITABLE_TEMPLATES) {
      const saved = {
        value: d.value,
        icon: d.icon,
        labels: d.labels,
        prompt: combinePromptFields(d),
        ...(d.pageMeter ? { pageMeter: d.pageMeter } : {}),
      };
      for (const pages of [null, 0.5, 4]) {
        expect(resolveSummaryPlan(d.value, ctx({ pages }), [saved])).toEqual(
          resolveSummaryPlan(d.value, ctx({ pages })),
        );
      }
    }
  });

  it('ancres : résumé en tête ou en fin de mise en forme, jeton de bloc fixe voisin', () => {
    const first = resolveSummaryPlan('maison', ctx({ pages: 1 }), [
      customWithMeter(1, '{{résumé}}\n\n## Actions\n\n{{actions}}'),
    ]);
    expect(first.length.anchors).toEqual({
      before: null,
      beforeCount: 0,
      after: '<h2>Actions</h2>',
    });
    const last = resolveSummaryPlan('maison', ctx({ pages: 1 }), [
      customWithMeter(1, '# CR\n\n{{résumé}}'),
    ]);
    expect(last.length.anchors).toEqual({ before: '<h1>CR</h1>', beforeCount: 1, after: null });
    const slot = resolveSummaryPlan('maison', ctx({ pages: 1 }), [
      customWithMeter(1, '# CR\n\n{{résumé_20}}\n\n{{résumé}}\n\n{{points_clés}}'),
    ]);
    expect(slot.length.anchors).toEqual({
      before: '[[AI_SLOT_1]]',
      beforeCount: 1,
      after: '[[AI_SLOT_2]]',
    });
    // Les blocs fixes gardent leur consigne à eux : jamais la longueur.
    for (const b of slot.blocks) expect(b.systemPrompt).not.toContain('Pagimètre');
  });

  it('ancre de fin ambiguë (répétée plus loin) : pas de découpe, la consigne reste', () => {
    const plan = resolveSummaryPlan('maison', ctx({ pages: 1 }), [
      customWithMeter(1, '# CR\n\n{{résumé}}\n\n- a\n\n<br>\n\n- b'),
    ]);
    expect(plan.length.anchors).toBeNull();
    expect(plan.systemPrompt).toContain('#LONGUEUR_IMPOSÉE');
  });
});
