import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pickRefineTargets,
  acceptRefined,
  createTranscriptRefiner,
  diffWordFlags,
  flashRefinedWords,
  createNotesRefiner,
  changedWordGroups,
  isPlausibleRefinement,
  parseNoteDirectives,
  REFINE_FLASH_MS,
} from './transcriptRefine.js';

describe('diffWordFlags — quels mots la relecture a changés', () => {
  it('marque le seul mot remplacé, pas le reste de la phrase', () => {
    const flags = diffWordFlags('On livre chez Klobex demain.', 'On livre chez Globex demain.');
    expect(flags.map((f) => f.word)).toEqual(['On', 'livre', 'chez', 'Globex', 'demain.']);
    expect(flags.map((f) => f.changed)).toEqual([false, false, false, true, false]);
  });

  it('une insertion ne marque pas la fin de phrase (LCS, pas index à index)', () => {
    const flags = diffWordFlags(
      'Rendez-vous avec la SDIS lundi.',
      'Rendez-vous avec la société SDIS lundi.',
    );
    expect(flags.map((f) => f.changed)).toEqual([false, false, false, true, false, false]);
  });

  it('aucun changement : aucun drapeau', () => {
    expect(diffWordFlags('Pareil ici.', 'Pareil ici.').every((f) => !f.changed)).toBe(true);
  });

  it('entrées vides : liste vide, jamais d’exception', () => {
    expect(diffWordFlags('', '')).toEqual([]);
    expect(diffWordFlags('Un mot.', '')).toEqual([]);
  });
});

describe('flashRefinedWords — surlignage furtif, jamais rémanent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pose le marqueur sur le bon item puis le retire après l’animation', () => {
    let history = [{ text: 'Avant.' }, { text: 'On livre chez Globex demain.' }];
    const update = (up) => (history = up(history));
    flashRefinedWords(1, 'On livre chez Klobex demain.', 'On livre chez Globex demain.', update);

    expect(history[0].refineFlash).toBeUndefined();
    expect(history[1].refineFlash.tokens[3]).toEqual({ word: 'Globex', changed: true });

    vi.advanceTimersByTime(REFINE_FLASH_MS);
    expect(history[1].refineFlash).toBeUndefined();
    expect(history[1].text).toBe('On livre chez Globex demain.');
  });

  it('retrait par estampille : suit l’item même si l’historique bouge', () => {
    let history = [{ text: 'Globex corrigé.' }];
    const update = (up) => (history = up(history));
    flashRefinedWords(0, 'Klobex corrigé.', 'Globex corrigé.', update);
    // Une ligne s'insère EN TÊTE pendant l'animation (dédup, gap résolu…).
    history = [{ text: 'Nouvelle ligne.' }, ...history];

    vi.advanceTimersByTime(REFINE_FLASH_MS);
    expect(history[0].refineFlash).toBeUndefined();
    expect(history[1].refineFlash).toBeUndefined();
  });

  it('rien à surligner : aucun marqueur posé', () => {
    let called = 0;
    flashRefinedWords(0, 'Pareil.', 'Pareil.', () => called++);
    expect(called).toBe(0);
  });
});

describe('createNotesRefiner — câblage App : application + flash', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('corrige la phrase par editTranscription et allume les mots changés', async () => {
    let history = [{ text: 'On livre chez Klobex demain.' }];
    const edited = [];
    const refiner = createNotesRefiner({
      getHistory: () => history,
      setHistory: (h) => (history = h),
      getNotes: () => 'Globex',
      isActive: () => true,
      post: async () => ['On livre chez Globex demain.'],
      editTranscription: (i, text) => {
        edited.push([i, text]);
        history = history.map((it, k) => (k === i ? { ...it, text } : it));
      },
    });
    refiner.notify();
    await vi.advanceTimersByTimeAsync(1300);

    expect(edited).toEqual([[0, 'On livre chez Globex demain.']]);
    expect(history[0].refineFlash.tokens[3].changed).toBe(true);

    await vi.advanceTimersByTimeAsync(REFINE_FLASH_MS);
    expect(history[0].refineFlash).toBeUndefined();
  });

  it('item disparu ou modifié entre-temps : rien appliqué, pas de flash', async () => {
    let history = [{ text: 'On livre chez Klobex demain.' }];
    const edited = [];
    const refiner = createNotesRefiner({
      getHistory: () => history,
      setHistory: (h) => (history = h),
      getNotes: () => 'Globex',
      isActive: () => true,
      post: async () => {
        // L'utilisateur édite la ligne pendant l'appel : la référence change.
        history = [{ text: 'Réécrite à la main.' }];
        return ['On livre chez Globex demain.'];
      },
      editTranscription: (i, text) => edited.push([i, text]),
    });
    refiner.notify();
    await vi.runAllTimersAsync();

    expect(edited).toEqual([]);
    expect(history[0].refineFlash).toBeUndefined();
  });
});

describe('pickRefineTargets — choix des phrases à relire', () => {
  it('prend les 2 dernières phrases finalisées, jamais les deltas ni les gaps', () => {
    const history = [
      { text: 'Une.', isDelta: false },
      { text: 'Deux.', isDelta: false },
      { text: '⟨hors ligne⟩', isDelta: false, offlineGapId: 'gap-1' },
      { text: 'Trois.', isDelta: false },
      { text: 'en cours de dic', isDelta: true },
    ];
    const targets = pickRefineTargets(history);
    expect(targets.map((t) => t.text)).toEqual(['Deux.', 'Trois.']);
    // La référence d'item est conservée : c'est elle qui rend l'application
    // insensible aux insertions/retraits survenus pendant l'appel.
    expect(targets[1].item).toBe(history[3]);
  });

  it('historique vide ou sans finalisé : rien à relire', () => {
    expect(pickRefineTargets([])).toEqual([]);
    expect(pickRefineTargets([{ text: 'x', isDelta: true }])).toEqual([]);
    expect(pickRefineTargets(null)).toEqual([]);
  });
});

describe('acceptRefined — garde de cohérence', () => {
  it('accepte une correction de graphie', () => {
    expect(acceptRefined('On livre chez Klobex demain.', 'On livre chez Globex demain.')).toBe(
      'On livre chez Globex demain.',
    );
  });

  it('rejette identique, vide, ou non-string', () => {
    expect(acceptRefined('Pareil.', 'Pareil.')).toBeNull();
    expect(acceptRefined('Pareil.', '   ')).toBeNull();
    expect(acceptRefined('Pareil.', undefined)).toBeNull();
  });

  it('rejette une paraphrase (longueur sans rapport avec l’original)', () => {
    expect(
      acceptRefined('On livre chez Klobex demain matin sans faute.', 'Livraison Globex.'),
    ).toBeNull();
    expect(
      acceptRefined(
        'Livraison Globex.',
        'La livraison sera effectuée chez Globex demain matin sans faute par le transporteur.',
      ),
    ).toBeNull();
  });
});

describe('garde anti-substitution — les notes ne remplacent jamais un autre nom', () => {
  it('cas Sophie : un nom des notes ne remplace pas un nom différent', () => {
    // Le bug d'origine : « réunion avec Sophie » dans les notes, et le modèle
    // remplaçait tous les prénoms de la transcription par « Sophie ».
    expect(
      acceptRefined(
        'Marc présente le budget.',
        'Sophie présente le budget.',
        'Réunion avec Sophie, chef des ventes AIR FRANCE',
      ),
    ).toBeNull();
  });

  it('accepte la variante quasi identique phonétiquement du même mot', () => {
    expect(
      acceptRefined('Saufi valide le budget.', 'Sophie valide le budget.', 'Sophie, AIR FRANCE'),
    ).toBe('Sophie valide le budget.');
    expect(
      acceptRefined('On voit ça avec Alexe demain.', 'On voit ça avec Alex demain.', 'Alex'),
    ).toBe('On voit ça avec Alex demain.');
  });

  it('accepte un sigle du glossaire sur un mot quasi identique (SAL / salle)', () => {
    expect(
      acceptRefined(
        'On installe la salle chez le client.',
        'On installe la SAL chez le client.',
        "SAL : système d'aide pour les lentilles",
      ),
    ).toBe('On installe la SAL chez le client.');
  });

  it('remplacement phonétiquement lointain : seulement sur consigne explicite', () => {
    expect(
      acceptRefined('Bob arrive lundi.', 'Robert arrive lundi.', 'Remplace Bob par Robert'),
    ).toBe('Robert arrive lundi.');
    expect(
      acceptRefined(
        'On échange avec Durand lundi.',
        'On échange avec Dupont lundi.',
        'Durand → Dupont',
      ),
    ).toBe('On échange avec Dupont lundi.');
    // Robert seulement mentionné : aucune consigne, rejet.
    expect(
      acceptRefined('Bob arrive lundi.', 'Robert arrive lundi.', 'Robert gère le dossier'),
    ).toBeNull();
    // Deux noms réels vaguement proches (similarité 0,5) : sous le seuil,
    // rejet sans consigne — c'est le resserrage 0,5 → 0,7.
    expect(
      acceptRefined(
        'On échange avec Durand lundi.',
        'On échange avec Dupont lundi.',
        'Dupont au téléphone',
      ),
    ).toBeNull();
  });

  it('le mot remplacé présent dans les notes ne suffit PAS — il faut la consigne', () => {
    // Trou de la première garde : « Marc » figurait dans les notes, le repli
    // « mot présent dans les notes » laissait donc passer Marc → Sophie.
    expect(
      acceptRefined(
        'Marc présente le budget.',
        'Sophie présente le budget.',
        'Sophie et Marc au point vendredi',
      ),
    ).toBeNull();
    // Même avec le verbe « remplace » ailleurs dans les notes : la consigne
    // doit porter EXACTEMENT cette paire.
    expect(
      acceptRefined(
        'Marc présente le budget.',
        'Sophie présente le budget.',
        'Remplace Alexe par Alex. Sophie et Marc présents.',
      ),
    ).toBeNull();
  });

  it('parseNoteDirectives : consignes explicites, et rien d’autre', () => {
    expect(parseNoteDirectives('Remplace Alexe par Alex')).toEqual([
      { fromKey: 'alexe', toKey: 'alex' },
    ]);
    expect(parseNoteDirectives('corriger Klobex en Globex, Durand -> Dupont')).toEqual([
      { fromKey: 'klobex', toKey: 'globex' },
      { fromKey: 'durand', toKey: 'dupont' },
    ]);
    expect(parseNoteDirectives('air frans → AIR FRANCE')).toEqual([
      { fromKey: 'airfrans', toKey: 'airfrance' },
    ]);
    // Forme anglaise — celle que documente le hint de la locale EN.
    expect(parseNoteDirectives('Replace Bob with Robert')).toEqual([
      { fromKey: 'bob', toKey: 'robert' },
    ]);
    // Mention simple, glossaire « : », notes vides : aucune consigne.
    expect(parseNoteDirectives('Réunion avec Sophie, chef des ventes AIR FRANCE')).toEqual([]);
    expect(parseNoteDirectives("SAL : système d'aide pour les lentilles")).toEqual([]);
    expect(parseNoteDirectives('')).toEqual([]);
  });

  it('rejette insertions et suppressions pures — la relecture ne réécrit pas', () => {
    expect(
      acceptRefined(
        'Rendez-vous avec la SDIS lundi.',
        'Rendez-vous avec la société SDIS lundi.',
        'SDIS',
      ),
    ).toBeNull();
    expect(
      acceptRefined('On livre chez Globex demain.', 'On livre demain.', 'Globex'),
    ).toBeNull();
  });

  it('changedWordGroups aligne remplacements et scissions en blocs comparables', () => {
    expect(
      changedWordGroups('On livre chez Klobex demain.', 'On livre chez Globex demain.'),
    ).toEqual([{ from: ['Klobex'], to: ['Globex'] }]);
    // Mot scindé : comparé en bloc, pas mot à mot.
    expect(changedWordGroups('vol airfrance confirmé', 'vol AIR FRANCE confirmé')).toEqual([
      { from: ['airfrance'], to: ['AIR', 'FRANCE'] },
    ]);
    expect(isPlausibleRefinement('vol airfrance confirmé', 'vol AIR FRANCE confirmé')).toBe(true);
  });

  it('une phrase avec une bonne ET une mauvaise correction est rejetée en bloc', () => {
    // Échec conservateur : mieux vaut perdre « Globex » que laisser passer
    // la substitution de prénom qui l'accompagne.
    expect(
      acceptRefined(
        'Marc livre chez Klobex demain.',
        'Sophie livre chez Globex demain.',
        'Sophie, Globex',
      ),
    ).toBeNull();
  });
});

describe('createTranscriptRefiner — ordonnanceur', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function build({ targets, notes = 'Globex', active = true, refined }) {
    const applied = [];
    const post = vi.fn(async () => refined);
    const refiner = createTranscriptRefiner({
      getTargets: () => targets(),
      getNotes: () => notes,
      isActive: () => active,
      post,
      apply: (item, original, corrected) => applied.push({ item, original, corrected }),
      debounceMs: 100,
    });
    return { refiner, post, applied };
  }

  it('relit les phrases et applique les corrections acceptées', async () => {
    const items = [{ text: 'Chez Klobex.' }, { text: 'Rien à corriger.' }];
    const { refiner, post, applied } = build({
      targets: () => items.map((item) => ({ item, text: item.text })),
      refined: ['Chez Globex.', 'Rien à corriger.'],
    });
    refiner.notify();
    await vi.runAllTimersAsync();
    expect(post).toHaveBeenCalledWith(['Chez Klobex.', 'Rien à corriger.'], 'Globex');
    // Seule la phrase réellement corrigée est appliquée.
    expect(applied).toEqual([
      { item: items[0], original: 'Chez Klobex.', corrected: 'Chez Globex.' },
    ]);
  });

  it('ne dépense rien sans notes, hors enregistrement, ou sur travail déjà fait', async () => {
    const items = [{ text: 'Phrase.' }];
    const t = () => items.map((item) => ({ item, text: item.text }));

    const inactive = build({ targets: t, active: false, refined: ['Phrase.'] });
    inactive.refiner.notify();
    await vi.runAllTimersAsync();
    expect(inactive.post).not.toHaveBeenCalled();

    const noNotes = build({ targets: t, notes: '   ', refined: ['Phrase.'] });
    noNotes.refiner.notify();
    await vi.runAllTimersAsync();
    expect(noNotes.post).not.toHaveBeenCalled();

    // Deux blurs de notes identiques sur les mêmes phrases : un seul appel.
    const dedup = build({ targets: t, refined: ['Phrase.'] });
    dedup.refiner.notify();
    await vi.runAllTimersAsync();
    dedup.refiner.notify();
    await vi.runAllTimersAsync();
    expect(dedup.post).toHaveBeenCalledTimes(1);
  });

  it('un seul appel en vol, la relance de fin part avec le texte frais', async () => {
    let resolvePost;
    const items = [{ text: 'Première.' }];
    const post = vi.fn(() => new Promise((r) => (resolvePost = r)));
    const applied = [];
    const refiner = createTranscriptRefiner({
      getTargets: () => items.map((item) => ({ item, text: item.text })),
      getNotes: () => 'Globex',
      isActive: () => true,
      post,
      apply: (item, o, c) => applied.push(c),
      debounceMs: 100,
    });
    refiner.notify();
    await vi.advanceTimersByTimeAsync(100);
    expect(post).toHaveBeenCalledTimes(1);
    // Nouvelle phrase pendant l'appel : pas de 2e appel immédiat.
    items.push({ text: 'Seconde.' });
    refiner.notify();
    expect(post).toHaveBeenCalledTimes(1);
    resolvePost(['Première.']);
    await vi.runAllTimersAsync();
    // La relance de fin est partie, avec les phrases du moment.
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0]).toEqual(['Première.', 'Seconde.']);
  });

  it('réponse invalide ou échec réseau : silencieux, rien appliqué', async () => {
    const items = [{ text: 'Phrase.' }];
    const bad = build({
      targets: () => items.map((i) => ({ item: i, text: i.text })),
      refined: null,
    });
    bad.refiner.notify();
    await vi.runAllTimersAsync();
    expect(bad.applied).toEqual([]);

    const failing = createTranscriptRefiner({
      getTargets: () => items.map((i) => ({ item: i, text: i.text })),
      getNotes: () => 'Globex',
      isActive: () => true,
      post: async () => {
        throw new Error('réseau');
      },
      apply: () => {},
      debounceMs: 100,
    });
    failing.notify();
    await expect(vi.runAllTimersAsync()).resolves.not.toThrow();
    expect(failing.isInFlight()).toBe(false);
  });
});
