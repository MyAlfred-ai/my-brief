/**
 * Ces tests verrouillent le bug de timing constaté en visio quand les
 * interlocuteurs alternent :
 *
 *  - du texte NEUF apparaissait dans une section plus ancienne (la ligne « en
 *    cours » d'un flux restait coincée au-dessus des lignes écrites ensuite
 *    par l'autre flux, et les mots suivants s'y fusionnaient) ;
 *  - les premiers mots d'une prise de parole semblaient omis (avalés par cette
 *    ligne périmée, hors du champ de lecture, jusqu'à la première ponctuation).
 *
 * Invariants testés : le direct (lignes isDelta) reste en QUEUE d'historique,
 * un segment VAD (item_id) = une ligne, et une ligne muette n'est plus le
 * direct quand l'autre flux écrit.
 */
import { describe, it, expect } from 'vitest';
import {
  applyLiveDelta,
  applyLiveFinal,
  finalInsertIndex,
  findPendingForFinal,
  LIVE_SILENCE_MS,
  PENDING_STALE_MS,
} from './transcriptLive.js';
import { compileCorrections } from './transcriptCorrections.js';
import { recomputeFullText } from './offlineGaps.js';

const stamp = (s = 0) => ({
  time: `0:00:${String(s).padStart(2, '0')}`,
  timestamp: '10:00:00',
  author: 'Intervenant',
});

const NOW = 1_000_000;

/** Ligne en cours telle que produite par applyLiveDelta. */
function pendingLine(text, source, itemId, extra = {}) {
  return { ...stamp(), text, isDelta: true, source, itemId, lastDeltaAt: NOW, ...extra };
}

function finalLine(text, source, extra = {}) {
  return { ...stamp(), text, isDelta: false, source, ...extra };
}

describe('finalInsertIndex', () => {
  it('insère avant les lignes en cours de fin d’historique', () => {
    const h = [
      finalLine('A.', 'local'),
      pendingLine('b', 'remote', 'i1'),
      pendingLine('c', 'local', 'i2'),
    ];
    expect(finalInsertIndex(h)).toBe(1);
  });

  it('historique sans ligne en cours : à la fin', () => {
    expect(finalInsertIndex([finalLine('A.', 'local')])).toBe(1);
    expect(finalInsertIndex([])).toBe(0);
  });
});

describe('applyLiveDelta — fusion par segment', () => {
  it('même item : fusion sur place, la ligne reste en cours sans ponctuation', () => {
    const h0 = [];
    const r1 = applyLiveDelta(h0, {
      text: 'Bonjour',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(),
    });
    const r2 = applyLiveDelta(r1.history, {
      text: ' à tous',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW + 500,
      stamp: stamp(1),
    });
    expect(r2.history).toHaveLength(1);
    expect(r2.history[0]).toMatchObject({ text: 'Bonjour à tous', isDelta: true, itemId: 'i1' });
    expect(r2.finalized).toEqual([]);
  });

  it('la ponctuation de fin de phrase boucle la ligne et la verse aux analyses', () => {
    const r1 = applyLiveDelta([], {
      text: 'Bonjour',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(),
    });
    const r2 = applyLiveDelta(r1.history, {
      text: ' à tous.',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW + 500,
      stamp: stamp(1),
    });
    expect(r2.history[0]).toMatchObject({ text: 'Bonjour à tous.', isDelta: false });
    expect(r2.finalized).toEqual(['Bonjour à tous.']);
  });

  it('SYMPTÔME CORRIGÉ : un nouvel item boucle la ligne périmée — les premiers mots ouvrent leur propre ligne en bas', () => {
    // L'utilisateur parle sans ponctuation finale, la visio répond, puis
    // l'utilisateur reprend (nouvel item VAD) : avant, « Donc » se collait à
    // « on verra bien » au-dessus de la réponse visio.
    const h = [
      pendingLine('on verra bien', 'local', 'i1', { lastDeltaAt: NOW - 3000 }),
      finalLine('Très bonne idée.', 'remote'),
    ];
    // NB : l'état ci-dessus (finale APRÈS une ligne en cours) est celui que
    // l'ancien code produisait ; le rollover doit le résorber quand même.
    const r = applyLiveDelta(h, {
      text: 'Donc',
      itemId: 'i2',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(9),
    });
    expect(r.finalized).toEqual(['on verra bien']);
    expect(r.history.map((l) => [l.text, !!l.isDelta])).toEqual([
      ['on verra bien', false],
      ['Très bonne idée.', false],
      ['Donc', true],
    ]);
    expect(r.history[2].itemId).toBe('i2');
  });

  it('sans item_id, une ligne muette depuis PENDING_STALE_MS bascule aussi', () => {
    const h = [
      pendingLine('début sans ponctuation', 'local', undefined, {
        lastDeltaAt: NOW - PENDING_STALE_MS - 1,
      }),
    ];
    const r = applyLiveDelta(h, { text: 'Suite', source: 'local', nowMs: NOW, stamp: stamp(20) });
    expect(r.finalized).toEqual(['début sans ponctuation']);
    expect(r.history.map((l) => [l.text, !!l.isDelta])).toEqual([
      ['début sans ponctuation', false],
      ['Suite', true],
    ]);
  });

  it('même segment après une longue pause : fusion quand même — son `completed` remplacera la ligne ENTIÈRE', () => {
    const h = [
      pendingLine('avant la pause', 'local', 'i1', { lastDeltaAt: NOW - PENDING_STALE_MS * 6 }),
    ];
    const r = applyLiveDelta(h, {
      text: ' après la pause',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(90),
    });
    expect(r.history).toHaveLength(1);
    expect(r.history[0].text).toBe('avant la pause après la pause');
  });

  it('delta avec item_id sur une ligne SANS id (session restaurée) : bascule, jamais de fusion', () => {
    const restored = { ...stamp(), text: 'reliquat restauré', isDelta: true, source: 'local' };
    const r = applyLiveDelta([restored], {
      text: 'Nouveau départ',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(1),
    });
    expect(r.finalized).toEqual(['reliquat restauré']);
    expect(r.history.map((l) => [l.text, !!l.isDelta])).toEqual([
      ['reliquat restauré', false],
      ['Nouveau départ', true],
    ]);
  });

  it('deux lignes en cours (crosstalk) : chacune fusionne la sienne, le direct reste en queue', () => {
    const h0 = applyLiveDelta([], {
      text: 'Alors je pense',
      itemId: 'a1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(),
    }).history;
    const h1 = applyLiveDelta(h0, {
      text: 'Attendez',
      itemId: 'b1',
      source: 'remote',
      nowMs: NOW,
      stamp: stamp(1),
    }).history;
    const h2 = applyLiveDelta(h1, {
      text: ' que',
      itemId: 'a1',
      source: 'local',
      nowMs: NOW + 200,
      stamp: stamp(2),
    }).history;
    expect(h2.map((l) => [l.text, l.source])).toEqual([
      ['Alors je pense que', 'local'],
      ['Attendez', 'remote'],
    ]);
  });

  it('fin de phrase pendant que l’autre flux dicte : la ligne bouclée passe DEVANT le direct', () => {
    const h0 = applyLiveDelta([], {
      text: 'Je regarde',
      itemId: 'a1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(),
    }).history;
    const h1 = applyLiveDelta(h0, {
      text: 'Pendant ce temps',
      itemId: 'b1',
      source: 'remote',
      nowMs: NOW,
      stamp: stamp(1),
    }).history;
    const r = applyLiveDelta(h1, {
      text: ' demain.',
      itemId: 'a1',
      source: 'local',
      nowMs: NOW + 200,
      stamp: stamp(2),
    });
    expect(r.history.map((l) => [l.text, !!l.isDelta])).toEqual([
      ['Je regarde demain.', false],
      ['Pendant ce temps', true],
    ]);
    expect(r.finalized).toEqual(['Je regarde demain.']);
  });

  it('une phrase complète en un seul delta est bouclée immédiatement (whisper-1)', () => {
    const r = applyLiveDelta([], {
      text: 'Une phrase entière.',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(),
    });
    expect(r.history[0]).toMatchObject({ text: 'Une phrase entière.', isDelta: false });
    expect(r.finalized).toEqual(['Une phrase entière.']);
  });

  it('la clôture par bascule déduplique l’écho (la ligne micro redisait la visio)', () => {
    const h = [
      finalLine('Nous validerons le budget demain matin.', 'remote'),
      pendingLine('Nous validerons le budget demain matin', 'local', 'a1', {
        lastDeltaAt: NOW - 2000,
      }),
    ];
    const r = applyLiveDelta(h, {
      text: 'Autre chose',
      itemId: 'a2',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(5),
    });
    // La ligne écho n'est PAS versée aux analyses ni gardée dans l'historique.
    expect(r.finalized).toEqual([]);
    expect(r.dropped).toBe(true);
    expect(r.history.map((l) => l.text)).toEqual([
      'Nous validerons le budget demain matin.',
      'Autre chose',
    ]);
  });
});

describe('applyLiveDelta — un delta fait d’espaces seules', () => {
  const delta = (text, itemId = 'i1', extra = {}) => ({
    text,
    itemId,
    source: 'local',
    nowMs: NOW,
    stamp: stamp(),
    ...extra,
  });

  it('SYMPTÔME CORRIGÉ : un nombre qui suit un mot garde son espace (« qu’à 4 h », pas « qu’à4 h »)', () => {
    // Découpage réel du tokeniseur : l'espace devant un nombre est un delta
    // À PART. App.svelte l'écartait (`delta.trim()`) et le chiffre se collait.
    const tokens = [
      'Rendez',
      '-vous',
      ' jusqu',
      '’à',
      ' ',
      '4',
      ' h',
      ',',
      ' puis',
      ' le',
      ' ',
      '12',
      ' mars',
      '.',
    ];
    let r = { history: [], finalized: [] };
    for (const text of tokens) r = applyLiveDelta(r.history, delta(text));
    expect(r.finalized).toEqual(['Rendez-vous jusqu’à 4 h, puis le 12 mars.']);
  });

  it('n’ouvre pas de ligne : sans ligne en cours, rien ne change', () => {
    const r = applyLiveDelta([finalLine('Bonjour.', 'local')], delta(' '));
    expect(r.history).toEqual([finalLine('Bonjour.', 'local')]);
    expect(r.finalized).toEqual([]);
    expect(r.dropped).toBe(false);
  });

  it('ne boucle pas la ligne d’un autre segment : c’est le mot suivant qui décide', () => {
    const h = [pendingLine('on verra bien', 'local', 'i1')];
    const r = applyLiveDelta(h, delta(' ', 'i2'));
    expect(r.history).toEqual(h);
    expect(r.finalized).toEqual([]);
  });

  it('ne boucle pas une ligne muette depuis PENDING_STALE_MS (sans item_id)', () => {
    const h = [pendingLine('on verra bien', 'local', undefined, { lastDeltaAt: NOW - 20_000 })];
    const r = applyLiveDelta(h, delta(' ', ''));
    expect(r.history).toEqual(h);
    expect(r.finalized).toEqual([]);
  });
});

describe('une ligne muette n’est plus le direct', () => {
  const rows = (h) => h.map((l) => [l.text, !!l.isDelta]);

  it('SYMPTÔME CORRIGÉ : « Voilà » sans ponctuation ne reste plus en avant-dernier sous la visio', () => {
    // Modèle sans `completed` : « Voilà » n'est jamais bouclé par son auteur,
    // qui se tait. Avant, chaque phrase bouclée de la visio passait devant
    // lui, et sa ligne restait l'avant-dernière pendant des minutes.
    let h = applyLiveDelta([], {
      text: 'Voilà',
      itemId: 'a1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(),
    }).history;
    h = applyLiveDelta(h, {
      text: 'Donc t’as',
      itemId: 'b1',
      source: 'remote',
      nowMs: NOW + 800,
      stamp: stamp(1),
    }).history;
    expect(rows(h)).toEqual([
      ['Voilà', true],
      ['Donc t’as', true],
    ]);
    const r = applyLiveDelta(h, {
      text: ' un petit défaut.',
      itemId: 'b1',
      source: 'remote',
      nowMs: NOW + 3000,
      stamp: stamp(3),
    });
    expect(r.finalized).toEqual(['Voilà', 'Donc t’as un petit défaut.']);
    h = applyLiveDelta(r.history, {
      text: 'Même si ça restait',
      itemId: 'b2',
      source: 'remote',
      nowMs: NOW + 4000,
      stamp: stamp(4),
    }).history;
    h = applyLiveDelta(h, {
      text: ' de côté.',
      itemId: 'b2',
      source: 'remote',
      nowMs: NOW + 5000,
      stamp: stamp(5),
    }).history;
    expect(rows(h)).toEqual([
      ['Voilà', false],
      ['Donc t’as un petit défaut.', false],
      ['Même si ça restait de côté.', false],
    ]);
  });

  it('moins de LIVE_SILENCE_MS de silence : la ligne reste le direct, la réponse passe devant', () => {
    const h = [pendingLine('Je regarde', 'local', 'a1')];
    const r = applyLiveDelta(h, {
      text: 'Oui.',
      itemId: 'b1',
      source: 'remote',
      nowMs: NOW + LIVE_SILENCE_MS - 1,
      stamp: stamp(1),
    });
    expect(r.finalized).toEqual(['Oui.']);
    expect(rows(r.history)).toEqual([
      ['Oui.', false],
      ['Je regarde', true],
    ]);
  });

  it('le silence d’un flux ne boucle pas sa propre ligne : seul l’autre flux en décide', () => {
    const h = [
      pendingLine('avant la pause', 'local', 'a1', { lastDeltaAt: NOW - LIVE_SILENCE_MS * 4 }),
    ];
    const r = applyLiveDelta(h, {
      text: ' après',
      itemId: 'a1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(9),
    });
    expect(rows(r.history)).toEqual([['avant la pause après', true]]);
    expect(r.finalized).toEqual([]);
  });

  it('un `completed` de l’autre flux boucle aussi la ligne muette, et se range sous elle', () => {
    const h = [
      pendingLine('Voilà', 'local', 'a1', { lastDeltaAt: NOW - LIVE_SILENCE_MS }),
      pendingLine('bien reçu', 'remote', 'b1'),
    ];
    const r = applyLiveFinal(h, {
      text: 'Bien reçu.',
      itemId: 'b1',
      source: 'remote',
      nowMs: NOW,
      stamp: stamp(2),
    });
    expect(r.finalized).toEqual(['Voilà', 'Bien reçu.']);
    expect(rows(r.history)).toEqual([
      ['Voilà', false],
      ['Bien reçu.', false],
    ]);
  });

  it('la ligne muette bouclée passe par la déduplication d’écho', () => {
    const h = [
      finalLine('Nous validerons le budget demain matin.', 'remote'),
      pendingLine('Nous validerons le budget demain matin', 'local', 'a1', {
        lastDeltaAt: NOW - LIVE_SILENCE_MS,
      }),
    ];
    const r = applyLiveDelta(h, {
      text: 'Parfait',
      itemId: 'b2',
      source: 'remote',
      nowMs: NOW,
      stamp: stamp(5),
    });
    expect(r.finalized).toEqual([]);
    expect(r.dropped).toBe(true);
    expect(rows(r.history)).toEqual([
      ['Nous validerons le budget demain matin.', false],
      ['Parfait', true],
    ]);
  });
});

describe('applyLiveFinal — le `completed` d’un segment', () => {
  it('remplace SA ligne en cours SUR PLACE — plus de saut sous les sections récentes', () => {
    const h = [
      pendingLine('bonjour à tous', 'local', 'i1', { lastDeltaAt: NOW - 1000 }),
      pendingLine('et moi je', 'remote', 'r1'),
    ];
    const r = applyLiveFinal(h, {
      text: 'Bonjour à tous.',
      itemId: 'i1',
      source: 'local',
      alreadyWritten: false,
      elapsedS: 3,
      stamp: stamp(3),
    });
    expect(r.history.map((l) => [l.text, !!l.isDelta])).toEqual([
      ['Bonjour à tous.', false],
      ['et moi je', true],
    ]);
    expect(r.finalized).toEqual(['Bonjour à tous.']);
  });

  it('ne touche JAMAIS la ligne en cours d’un autre segment (désordre whisper-1)', () => {
    const h = [pendingLine('seconde phrase en cours', 'local', 'i2')];
    expect(findPendingForFinal(h, 'local', 'i1')).toBe(-1);
    const r = applyLiveFinal(h, {
      text: 'Première phrase.',
      itemId: 'i1',
      source: 'local',
      alreadyWritten: false,
      elapsedS: 3,
      stamp: stamp(3),
    });
    // La finale s'insère devant le direct, la ligne i2 continue sa vie.
    expect(r.history.map((l) => [l.text, !!l.isDelta])).toEqual([
      ['Première phrase.', false],
      ['seconde phrase en cours', true],
    ]);
  });

  it('met au propre une ligne déjà bouclée du même segment, sans doublon', () => {
    const h = [
      finalLine('bonjour a tous', 'local', { itemId: 'i1' }),
      pendingLine('suite', 'local', 'i2'),
    ];
    const r = applyLiveFinal(h, {
      text: 'Bonjour à tous.',
      itemId: 'i1',
      source: 'local',
      alreadyWritten: false,
      elapsedS: 4,
      stamp: stamp(4),
    });
    expect(r.history.map((l) => l.text)).toEqual(['Bonjour à tous.', 'suite']);
    expect(r.finalized).toEqual([]);
    expect(r.recompute).toBe(true);
  });

  it('SYMPTÔME CORRIGÉ : segment déjà bouclé à la ponctuation puis repris — son `completed` ne double pas le début', () => {
    // gpt-4o-transcribe & co. : « Bonjour. » est bouclée par sa ponctuation,
    // la suite du MÊME segment ouvre une ligne en cours, puis le `completed`
    // livre la transcription ENTIÈRE du segment. Avant, il remplaçait la seule
    // ligne en cours : « Bonjour. » apparaissait deux fois, au texte complet
    // (résumé, compte rendu) comme à l'écran.
    let h = [];
    h = applyLiveDelta(h, {
      text: 'Bonjour.',
      itemId: 'x',
      source: 'local',
      nowMs: 1,
      stamp: stamp(),
    }).history;
    h = applyLiveDelta(h, {
      text: ' Ça va',
      itemId: 'x',
      source: 'local',
      nowMs: 2,
      stamp: stamp(1),
    }).history;
    const r = applyLiveFinal(h, {
      text: 'Bonjour. Ça va ?',
      itemId: 'x',
      source: 'local',
      stamp: stamp(2),
      elapsedS: 0,
    });
    expect(r.history.map((l) => [l.text, !!l.isDelta])).toEqual([['Bonjour. Ça va ?', false]]);
    expect(r.history[0]).toMatchObject({ itemId: 'x', time: stamp().time });
    expect(r.history[0]).not.toHaveProperty('lastDeltaAt');
    // « Bonjour. » est déjà au texte complet : le re-dériver, ne rien ajouter.
    expect(r.recompute).toBe(true);
    expect(r.finalized).toEqual([]);
    expect(recomputeFullText(r.history)).toBe('Bonjour. Ça va ?');
  });

  it('segment sur plusieurs lignes pendant que l’autre flux dicte : fusion dans la PREMIÈRE, le direct reste en queue', () => {
    let h = [];
    h = applyLiveDelta(h, {
      text: 'Bonjour.',
      itemId: 'x',
      source: 'local',
      nowMs: 1,
      stamp: stamp(),
    }).history;
    h = applyLiveDelta(h, {
      text: 'Attendez',
      itemId: 'r1',
      source: 'remote',
      nowMs: 2,
      stamp: stamp(1),
    }).history;
    h = applyLiveDelta(h, {
      text: ' Ça va',
      itemId: 'x',
      source: 'local',
      nowMs: 3,
      stamp: stamp(2),
    }).history;
    const r = applyLiveFinal(h, {
      text: 'Bonjour. Ça va ?',
      itemId: 'x',
      source: 'local',
      stamp: stamp(3),
      elapsedS: 3,
    });
    expect(r.history.map((l) => [l.text, l.source, !!l.isDelta])).toEqual([
      ['Bonjour. Ça va ?', 'local', false],
      ['Attendez', 'remote', true],
    ]);
    expect(r.recompute).toBe(true);
  });

  it('segment entièrement bouclé en plusieurs phrases : son `completed` les réunit en une ligne, sans doublon', () => {
    let h = [];
    h = applyLiveDelta(h, {
      text: 'Bonjour.',
      itemId: 'x',
      source: 'local',
      nowMs: 1,
      stamp: stamp(),
    }).history;
    h = applyLiveDelta(h, {
      text: ' Ça va ?',
      itemId: 'x',
      source: 'local',
      nowMs: 2,
      stamp: stamp(1),
    }).history;
    expect(h.map((l) => [l.text, !!l.isDelta])).toEqual([
      ['Bonjour.', false],
      ['Ça va ?', false],
    ]);
    const r = applyLiveFinal(h, {
      text: 'Bonjour. Ça va ?',
      itemId: 'x',
      source: 'local',
      stamp: stamp(2),
      elapsedS: 2,
    });
    expect(r.history.map((l) => [l.text, !!l.isDelta])).toEqual([['Bonjour. Ça va ?', false]]);
    expect(r.recompute).toBe(true);
    expect(r.finalized).toEqual([]);
  });

  it('texte identique déjà bouclé : aucun changement, aucune sauvegarde due', () => {
    const h = [finalLine('Bonjour à tous.', 'local', { itemId: 'i1' })];
    const r = applyLiveFinal(h, {
      text: 'Bonjour à tous.',
      itemId: 'i1',
      source: 'local',
      alreadyWritten: false,
      elapsedS: 4,
      stamp: stamp(4),
    });
    expect(r.history).toBe(h);
    expect(r.recompute).toBe(false);
    expect(r.finalized).toEqual([]);
  });

  it('déjà écrit par les deltas et ligne disparue (écho) : no-op', () => {
    const h = [finalLine('Nous validerons le budget.', 'remote')];
    const r = applyLiveFinal(h, {
      text: 'Nous validerons le budget.',
      itemId: 'i9',
      source: 'local',
      alreadyWritten: true,
      elapsedS: 5,
      stamp: stamp(5),
    });
    expect(r.history).toBe(h);
    expect(r.finalized).toEqual([]);
  });

  it('segment inconnu : insertion devant le direct, avec déduplication d’écho', () => {
    const h = [pendingLine('je continue de parler', 'remote', 'r1')];
    const r = applyLiveFinal(h, {
      text: 'Une phrase arrivée sans deltas.',
      itemId: 'i5',
      source: 'local',
      alreadyWritten: false,
      elapsedS: 6,
      stamp: stamp(6),
    });
    expect(r.history.map((l) => [l.text, !!l.isDelta])).toEqual([
      ['Une phrase arrivée sans deltas.', false],
      ['je continue de parler', true],
    ]);
    expect(r.finalized).toEqual(['Une phrase arrivée sans deltas.']);
  });

  it('l’écho d’une finale de l’autre flux est retiré et promeut la ligne gardée', () => {
    const h = [finalLine('Nous validerons le budget demain matin.', 'local')];
    const r = applyLiveFinal(h, {
      text: 'Nous validerons le budget demain matin.',
      itemId: 'r2',
      source: 'remote',
      alreadyWritten: false,
      elapsedS: 2,
      stamp: stamp(2),
    });
    expect(r.dropped).toBe(true);
    expect(r.history).toHaveLength(1);
    // C'est bien la personne distante qui parlait : la ligne gardée passe 'remote'.
    expect(r.history[0].source).toBe('remote');
  });
});

describe('corrections automatiques de l’organisation', () => {
  const correct = compileCorrections([
    { from: ['Klobex', 'Clobex'], to: 'Globex' },
    { from: ['my alfred'], to: 'MyAlfred' },
  ]).apply;

  it('un delta ne se corrige pas : un mot coupé en deux deltas ne devient pas « Globexol »', () => {
    const r1 = applyLiveDelta([], {
      text: 'On commande du Klobex',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(),
      correct,
    });
    expect(r1.history[0].text).toBe('On commande du Klobex');
    const r2 = applyLiveDelta(r1.history, {
      text: 'ol.',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW + 100,
      stamp: stamp(1),
      correct,
    });
    expect(r2.history[0]).toMatchObject({ text: 'On commande du Klobexol.', isDelta: false });
    expect(r2.corrected).toEqual([]);
  });

  it('la ligne bouclée à la ponctuation est corrigée, versée corrigée aux analyses, et signalée', () => {
    const r1 = applyLiveDelta([], {
      text: 'On a revu Klo',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(),
      correct,
    });
    const r2 = applyLiveDelta(r1.history, {
      text: 'bex chez my alfred.',
      itemId: 'i1',
      source: 'local',
      nowMs: NOW + 100,
      stamp: stamp(1),
      correct,
    });
    expect(r2.history[0]).toMatchObject({
      text: 'On a revu Globex chez MyAlfred.',
      isDelta: false,
    });
    expect(r2.finalized).toEqual(['On a revu Globex chez MyAlfred.']);
    expect(r2.corrected).toEqual([
      { line: r2.history[0], original: 'On a revu Klobex chez my alfred.' },
    ]);
  });

  it('la ligne bouclée par la bascule de prise de parole est corrigée aussi', () => {
    const h = [pendingLine('rendez-vous chez Clobex', 'local', 'i1')];
    const r = applyLiveDelta(h, {
      text: 'Ensuite',
      itemId: 'i2',
      source: 'local',
      nowMs: NOW,
      stamp: stamp(3),
      correct,
    });
    expect(r.finalized).toEqual(['rendez-vous chez Globex']);
    expect(r.history[0].text).toBe('rendez-vous chez Globex');
    expect(r.corrected).toHaveLength(1);
  });

  it('le `completed` de la ligne en cours la remplace, corrigé', () => {
    const h = [pendingLine('on voit klobex', 'local', 'i1')];
    const r = applyLiveFinal(h, {
      text: 'On voit Klobex.',
      itemId: 'i1',
      source: 'local',
      alreadyWritten: false,
      elapsedS: 4,
      stamp: stamp(4),
      correct,
    });
    expect(r.history[0]).toMatchObject({ text: 'On voit Globex.', isDelta: false });
    expect(r.finalized).toEqual(['On voit Globex.']);
    expect(r.corrected[0].original).toBe('On voit Klobex.');
  });

  it('le `completed` d’une ligne déjà bouclée et corrigée ne la remet pas à l’ancienne graphie', () => {
    const h = [finalLine('On voit Globex.', 'local', { itemId: 'i1' })];
    const r = applyLiveFinal(h, {
      text: 'On voit Klobex.',
      itemId: 'i1',
      source: 'local',
      alreadyWritten: false,
      elapsedS: 4,
      stamp: stamp(4),
      correct,
    });
    expect(r.history).toBe(h);
    expect(r.recompute).toBe(false);
    expect(r.corrected).toEqual([]);
  });

  it('le `completed` d’un segment sur plusieurs lignes est corrigé, et la partie jamais montrée corrigée est signalée', () => {
    let h = [];
    h = applyLiveDelta(h, {
      text: 'On a vu Klobex.',
      itemId: 'x',
      source: 'local',
      nowMs: 1,
      stamp: stamp(),
      correct,
    }).history;
    expect(h[0].text).toBe('On a vu Globex.');
    h = applyLiveDelta(h, {
      text: ' Puis my alfred',
      itemId: 'x',
      source: 'local',
      nowMs: 2,
      stamp: stamp(1),
      correct,
    }).history;
    const r = applyLiveFinal(h, {
      text: 'On a vu Klobex. Puis my alfred.',
      itemId: 'x',
      source: 'local',
      stamp: stamp(2),
      elapsedS: 2,
      correct,
    });
    expect(r.history.map((l) => l.text)).toEqual(['On a vu Globex. Puis MyAlfred.']);
    expect(r.corrected).toEqual([
      { line: r.history[0], original: 'On a vu Klobex. Puis my alfred.' },
    ]);
  });

  it('une finale sans deltas (import, whisper-1) est insérée corrigée', () => {
    const r = applyLiveFinal([], {
      text: 'Point avec Klobex.',
      source: 'local',
      alreadyWritten: false,
      elapsedS: 0,
      stamp: stamp(),
      correct,
    });
    expect(r.history[0].text).toBe('Point avec Globex.');
    expect(r.finalized).toEqual(['Point avec Globex.']);
    expect(r.corrected).toEqual([{ line: r.history[0], original: 'Point avec Klobex.' }]);
  });

  it('l’écho se reconnaît dans la graphie corrigée des deux flux', () => {
    const h = [finalLine('Nous livrerons Globex demain matin.', 'local')];
    const r = applyLiveFinal(h, {
      text: 'Nous livrerons Klobex demain matin.',
      itemId: 'r1',
      source: 'remote',
      alreadyWritten: false,
      elapsedS: 2,
      stamp: stamp(2),
      correct,
    });
    expect(r.dropped).toBe(true);
    expect(r.history).toHaveLength(1);
  });

  it('sans corrections fournies : comportement d’origine, `corrected` vide', () => {
    const r = applyLiveFinal([], {
      text: 'Point avec Klobex.',
      source: 'local',
      alreadyWritten: false,
      elapsedS: 0,
      stamp: stamp(),
    });
    expect(r.history[0].text).toBe('Point avec Klobex.');
    expect(r.corrected).toEqual([]);
  });
});
