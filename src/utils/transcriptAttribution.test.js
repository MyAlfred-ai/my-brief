import { describe, it, expect } from 'vitest';
import {
  buildAttributedTranscript,
  parseAttributedTranscript,
  effectiveSpeakerLabels,
  selfSpeakerLabel,
  REMOTE_SPEAKER_LABEL,
} from './transcriptAttribution.js';

const L = (text, extra = {}) => ({ text, source: 'local', ...extra });
const R = (text, extra = {}) => ({ text, source: 'remote', ...extra });

describe('selfSpeakerLabel', () => {
  it('nom valide : renvoyé tel quel (trim)', () => {
    expect(selfSpeakerLabel('  Alex  ')).toBe('Alex');
  });

  it('nom absent ou sentinelle : « Moi »', () => {
    expect(selfSpeakerLabel(undefined)).toBe('Moi');
    expect(selfSpeakerLabel('')).toBe('Moi');
    expect(selfSpeakerLabel('No value')).toBe('Moi');
    expect(selfSpeakerLabel('unknown')).toBe('Moi');
  });

  it('crochets retirés — ils délimitent les étiquettes', () => {
    expect(selfSpeakerLabel('[Alex]')).toBe('Alex');
    expect(selfSpeakerLabel('[]')).toBe('Moi');
  });
});

describe('buildAttributedTranscript — mono-flux : identique à l’ancien join', () => {
  it('micro seul : texte plat, pas d’étiquette, attribution null', () => {
    const history = [L('Bonjour.'), L('  '), L('On commence.'), { text: null }];
    const out = buildAttributedTranscript(history, 'Alex');
    // Octet pour octet l'ancien comportement : trim, filtre vides, join \n.
    expect(out.text).toBe('Bonjour.\nOn commence.');
    expect(out.attribution).toBeNull();
  });

  it('visio seule (utilisateur muet) : texte plat aussi', () => {
    const out = buildAttributedTranscript([R('Oui.'), R('Non.')], 'Alex');
    expect(out.text).toBe('Oui.\nNon.');
    expect(out.attribution).toBeNull();
  });

  it('source absente = local (convention transcriptDeltas)', () => {
    const out = buildAttributedTranscript([{ text: 'Sans source.' }, R('Réponse.')], 'Alex');
    expect(out.attribution).not.toBeNull();
    expect(out.text).toBe('[Alex]\nSans source.\n[Visio]\nRéponse.');
  });

  it('historique vide ou absent : texte vide', () => {
    expect(buildAttributedTranscript([], 'Alex')).toEqual({ text: '', attribution: null });
    expect(buildAttributedTranscript(undefined, 'Alex')).toEqual({ text: '', attribution: null });
  });
});

describe('buildAttributedTranscript — deux flux : format script', () => {
  it('étiquette à chaque changement de source, lignes consécutives groupées', () => {
    const history = [
      L('Bonjour à tous.'),
      L('On commence ?'),
      R('Oui.'),
      R('Allons-y.'),
      L('Parfait.'),
    ];
    const out = buildAttributedTranscript(history, 'Alex');
    expect(out.text).toBe(
      [
        '[Alex]',
        'Bonjour à tous.',
        'On commence ?',
        '[Visio]',
        'Oui.',
        'Allons-y.',
        '[Alex]',
        'Parfait.',
      ].join('\n'),
    );
    expect(out.attribution).toEqual({
      selfLabel: 'Alex',
      remoteLabel: REMOTE_SPEAKER_LABEL,
      remoteLabels: [REMOTE_SPEAKER_LABEL],
    });
  });

  it('nom invalide : étiquette « Moi »', () => {
    const out = buildAttributedTranscript([L('A.'), R('B.')], 'No value');
    expect(out.text).toBe('[Moi]\nA.\n[Visio]\nB.');
    expect(out.attribution.selfLabel).toBe('Moi');
  });

  it('marqueur de gap hors ligne : neutre, ne casse pas le groupement', () => {
    const history = [
      L('Avant la coupure.'),
      L('⟨passage hors ligne⟩', { offlineGapId: 'g1' }),
      L('Après la coupure.'),
      R('Réponse visio.'),
    ];
    const out = buildAttributedTranscript(history, 'Alex');
    // Pas de ré-étiquetage [Alex] après le marqueur : même locuteur.
    expect(out.text).toBe(
      [
        '[Alex]',
        'Avant la coupure.',
        '⟨passage hors ligne⟩',
        'Après la coupure.',
        '[Visio]',
        'Réponse visio.',
      ].join('\n'),
    );
  });

  it('marqueurs seuls ne comptent pas comme source : pas d’attribution', () => {
    const history = [R('Visio.'), L('⟨passage hors ligne⟩', { offlineGapId: 'g1' })];
    const out = buildAttributedTranscript(history, 'Alex');
    expect(out.attribution).toBeNull();
    expect(out.text).toBe('Visio.\n⟨passage hors ligne⟩');
  });
});

describe('parseAttributedTranscript — relecture d’une transcription stockée', () => {
  it('rend les étiquettes à l’état de source, sans les laisser comme lignes', () => {
    const items = parseAttributedTranscript('[Alex]\nBonjour.\nOn commence ?\n[Visio]\nOui.');
    expect(items).toEqual([
      { text: 'Bonjour.', source: 'local', speaker: 'Alex' },
      { text: 'On commence ?', source: 'local', speaker: 'Alex' },
      { text: 'Oui.', source: 'remote', speaker: 'Visio' },
    ]);
  });

  it('texte non étiqueté : null — l’appelant garde son traitement d’avant', () => {
    expect(parseAttributedTranscript('Première phrase.\nDeuxième phrase.')).toBeNull();
    expect(parseAttributedTranscript('')).toBeNull();
    expect(parseAttributedTranscript(null)).toBeNull();
  });

  it('une seule étiquette ne suffit pas : réplique entre crochets non confondue', () => {
    // « [rires] » ou une réplique isolée entre crochets ne doit pas transformer
    // la transcription en dialogue à deux voix.
    expect(parseAttributedTranscript('Bonjour.\n[rires]\nOn continue.')).toBeNull();
  });

  it('crochets internes ou trop longs : pas une étiquette', () => {
    expect(parseAttributedTranscript('[Alex]\nA.\n[note [interne]]\nB.')).toBeNull();
    const long = `[${'x'.repeat(61)}]`;
    expect(parseAttributedTranscript(`[Alex]\nA.\n${long}\nB.`)).toBeNull();
  });

  it('que des étiquettes, aucun texte : null', () => {
    expect(parseAttributedTranscript('[Alex]\n[Visio]')).toBeNull();
  });

  it('aller-retour : construire puis relire préserve les sources', () => {
    const history = [L('Bonjour.'), L('On commence ?'), R('Oui.'), L('Parfait.')];
    const { text } = buildAttributedTranscript(history, 'Alex');
    const back = parseAttributedTranscript(text);
    expect(back.map((it) => it.text)).toEqual(history.map((it) => it.text));
    expect(back.map((it) => it.source)).toEqual(['local', 'local', 'remote', 'local']);
    // Et re-construire depuis l'historique relu redonne le MÊME texte.
    expect(buildAttributedTranscript(back, 'Alex').text).toBe(text);
  });
});

describe('participants de la visio nommés par l’utilisateur', () => {
  it('effectiveSpeakerLabels : nom posé, héritage en direct, « Visio » sinon', () => {
    const h = [
      R('A.'),
      L('B.'),
      R('C.', { speaker: 'Marie' }),
      R('D.'),
      L('E.'),
      R('F.'),
      R('G.', { speaker: 'Paul' }),
      { text: '⟨gap⟩', offlineGapId: 'g1' },
      R('H.'),
    ];
    expect(effectiveSpeakerLabels(h, 'Alex')).toEqual([
      'Visio',
      'Alex',
      'Marie',
      'Marie',
      'Alex',
      'Marie',
      'Paul',
      '',
      'Paul',
    ]);
  });

  it('ligne micro : l’étiquette relue prime sur le nom courant (archive)', () => {
    expect(effectiveSpeakerLabels([L('A.', { speaker: 'Camille' }), L('B.')], 'Alex')).toEqual([
      'Camille',
      'Alex',
    ]);
  });

  it('build : étiquette au changement de NOM, pas seulement de canal', () => {
    const h = [
      L('Bonjour.'),
      R('Salut.', { speaker: 'Marie' }),
      R('Moi aussi.', { speaker: 'Paul' }),
    ];
    const out = buildAttributedTranscript(h, 'Alex');
    expect(out.text).toBe('[Alex]\nBonjour.\n[Marie]\nSalut.\n[Paul]\nMoi aussi.');
    expect(out.attribution.remoteLabels).toEqual(['Marie', 'Paul']);
    // Le micro garde le nom COURANT même si une archive portait un autre nom.
    const stale = buildAttributedTranscript([L('A.', { speaker: 'Camille' }), R('B.')], 'Alex');
    expect(stale.text).toBe('[Alex]\nA.\n[Visio]\nB.');
  });

  it('parse avec selfLabel : tout nom autre que le mien est une voix de la visio', () => {
    const items = parseAttributedTranscript('[Alex]\nA.\n[Marie]\nB.\n[Visio]\nC.', 'Alex');
    expect(items.map((it) => it.source)).toEqual(['local', 'remote', 'remote']);
    expect(items.map((it) => it.speaker)).toEqual(['Alex', 'Marie', 'Visio']);
  });

  it('parse SANS selfLabel : comportement d’avant, seule « Visio » est distante', () => {
    const items = parseAttributedTranscript('[Alex]\nA.\n[Marie]\nB.\n[Visio]\nC.');
    expect(items.map((it) => it.source)).toEqual(['local', 'local', 'remote']);
  });
});
