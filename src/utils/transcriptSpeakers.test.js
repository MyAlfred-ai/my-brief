import { describe, it, expect } from 'vitest';
import { assignSpeaker, knownRemoteSpeakers, normalizeSpeakerName } from './transcriptSpeakers.js';
import { effectiveSpeakerLabels, buildAttributedTranscript } from './transcriptAttribution.js';

const L = (text, extra = {}) => ({ text, source: 'local', ...extra });
const R = (text, extra = {}) => ({ text, source: 'remote', ...extra });
const labels = (h) => effectiveSpeakerLabels(h, 'Alex');

describe('normalizeSpeakerName', () => {
  it('trim, crochets retirés, espaces aplatis, borné à 60', () => {
    expect(normalizeSpeakerName('  [Marie]  Dupont ')).toBe('Marie Dupont');
    expect(normalizeSpeakerName('Marie\nDupont')).toBe('Marie Dupont');
    expect(normalizeSpeakerName('x'.repeat(80)).length).toBe(60);
    expect(normalizeSpeakerName('[]')).toBe('');
    expect(normalizeSpeakerName(null)).toBe('');
  });
});

describe('assignSpeaker — portée « à partir d’ici »', () => {
  it('tête-à-tête : nommer la première réplique distante nomme toute la réunion', () => {
    const h = [L('Bonjour.'), R('Salut.'), L('Ça va ?'), R('Oui.'), R('Et toi ?')];
    const out = assignSpeaker(h, 1, 'Marie', { selfName: 'Alex' });
    expect(labels(out)).toEqual(['Alex', 'Marie', 'Alex', 'Marie', 'Marie']);
    // Posé explicitement sur CHAQUE ligne de la portée (relecture d'archive).
    expect(out.map((it) => it.speaker)).toEqual([undefined, 'Marie', undefined, 'Marie', 'Marie']);
  });

  it('à plusieurs : la portée s’arrête au prochain participant déjà nommé', () => {
    const h = [R('A.'), R('B.'), R('C.', { speaker: 'Paul' }), R('D.'), L('Ok.')];
    const out = assignSpeaker(h, 0, 'Marie', { selfName: 'Alex' });
    expect(labels(out)).toEqual(['Marie', 'Marie', 'Paul', 'Paul', 'Alex']);
  });

  it('couper une prise de parole au milieu : d’ici, c’est Paul', () => {
    const h = [R('A.', { speaker: 'Marie' }), R('B.'), R('C.'), R('D.')];
    const out = assignSpeaker(h, 2, 'Paul', { selfName: 'Alex' });
    expect(labels(out)).toEqual(['Marie', 'Marie', 'Paul', 'Paul']);
  });

  it('archive rouverte : lignes toutes explicites, la portée les suit quand même', () => {
    const h = [
      L('A.', { speaker: 'Alex' }),
      R('B.', { speaker: 'Visio' }),
      R('C.', { speaker: 'Visio' }),
      L('D.', { speaker: 'Alex' }),
      R('E.', { speaker: 'Visio' }),
    ];
    const out = assignSpeaker(h, 1, 'Marie', { selfName: 'Alex' });
    expect(labels(out)).toEqual(['Alex', 'Marie', 'Marie', 'Alex', 'Marie']);
  });

  it('lignes du direct : ce que Marie continue de dire reste à Marie', () => {
    const h = assignSpeaker([R('A.'), L('B.')], 0, 'Marie', { selfName: 'Alex' });
    const live = [...h, R('C.'), R('D.', { isDelta: true })];
    expect(labels(live)).toEqual(['Marie', 'Alex', 'Marie', 'Marie']);
  });

  it('immutable : l’entrée n’est pas modifiée', () => {
    const h = [R('A.'), R('B.')];
    assignSpeaker(h, 0, 'Marie');
    expect(h[0].speaker).toBeUndefined();
  });

  it('ligne micro, index hors borne, nom vide : entrée rendue telle quelle', () => {
    const h = [L('A.'), R('B.')];
    expect(assignSpeaker(h, 0, 'Marie')).toBe(h);
    expect(assignSpeaker(h, 5, 'Marie')).toBe(h);
    expect(assignSpeaker(h, 1, '   ')).toBe(h);
    expect(assignSpeaker(h, 1, '[]')).toBe(h);
  });
});

describe('assignSpeaker — portée « partout »', () => {
  it('renomme toutes les lignes qui portent l’étiquette visée, pas les autres', () => {
    const h = [
      R('A.', { speaker: 'Marie' }),
      R('B.', { speaker: 'Paul' }),
      L('C.'),
      R('D.', { speaker: 'Marie' }),
      R('E.'),
    ];
    const out = assignSpeaker(h, 0, 'Marie Dupont', { everywhere: true, selfName: 'Alex' });
    expect(labels(out)).toEqual(['Marie Dupont', 'Paul', 'Alex', 'Marie Dupont', 'Marie Dupont']);
  });

  it('tout « Visio » d’un coup, sans toucher aux voix déjà nommées', () => {
    const h = [R('A.'), L('B.'), R('C.', { speaker: 'Paul' }), R('D.', { speaker: 'Visio' })];
    const out = assignSpeaker(h, 3, 'Marie', { everywhere: true, selfName: 'Alex' });
    expect(labels(out)).toEqual(['Marie', 'Alex', 'Paul', 'Marie']);
  });

  it('« Visio » remet une voix en non identifié', () => {
    const h = [R('A.', { speaker: 'Marie' }), R('B.')];
    const out = assignSpeaker(h, 0, 'Visio', { everywhere: true, selfName: 'Alex' });
    expect(labels(out)).toEqual(['Visio', 'Visio']);
  });
});

describe('knownRemoteSpeakers', () => {
  it('noms distants dans l’ordre d’apparition, sans « Visio » ni le micro', () => {
    const h = [
      L('A.', { speaker: 'Camille' }),
      R('B.', { speaker: 'Paul' }),
      R('C.'),
      R('D.', { speaker: 'Marie' }),
      R('E.', { speaker: 'Paul' }),
      R('F.', { speaker: 'Visio' }),
    ];
    expect(knownRemoteSpeakers(h, 'Alex')).toEqual(['Paul', 'Marie']);
    expect(knownRemoteSpeakers([], 'Alex')).toEqual([]);
  });
});

describe('bout en bout : nommer, sauvegarder, relire', () => {
  it('le texte stocké porte les noms et se relit avec les bons canaux', async () => {
    const { parseAttributedTranscript } = await import('./transcriptAttribution.js');
    let h = [L('Bonjour.'), R('Salut.'), R('Ça va ?'), L('Oui.'), R('Super.')];
    h = assignSpeaker(h, 1, 'Marie', { selfName: 'Alex' });
    h = assignSpeaker(h, 2, 'Paul', { selfName: 'Alex' });
    const { text, attribution } = buildAttributedTranscript(h, 'Alex');
    expect(text).toBe(
      '[Alex]\nBonjour.\n[Marie]\nSalut.\n[Paul]\nÇa va ?\n[Alex]\nOui.\n[Paul]\nSuper.',
    );
    expect(attribution.remoteLabels).toEqual(['Marie', 'Paul']);

    const back = parseAttributedTranscript(text, 'Alex');
    expect(back.map((it) => it.source)).toEqual(['local', 'remote', 'remote', 'local', 'remote']);
    expect(labels(back)).toEqual(['Alex', 'Marie', 'Paul', 'Alex', 'Paul']);
    expect(buildAttributedTranscript(back, 'Alex').text).toBe(text);
  });
});
