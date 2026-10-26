import { describe, it, expect } from 'vitest';
import {
  normalizeForCompare,
  similarity,
  parseElapsedSeconds,
  findEchoDuplicate,
  applyEchoDedup,
} from './transcriptEcho.js';

const line = (text, source, time, extra = {}) => ({
  time,
  timestamp: '10:00:00',
  author: 'Intervenant',
  text,
  isDelta: false,
  source,
  ...extra,
});

describe('normalizeForCompare', () => {
  it('ignore casse, accents et ponctuation', () => {
    expect(normalizeForCompare("On décale la réunion, d'accord ?")).toBe(
      'on decale la reunion d accord',
    );
    expect(normalizeForCompare('  ON  DÉCALE — la Réunion...  ')).toBe('on decale la reunion');
  });

  it('tolère null/undefined', () => {
    expect(normalizeForCompare(null)).toBe('');
    expect(normalizeForCompare(undefined)).toBe('');
  });
});

describe('similarity', () => {
  it('vaut 1 sur deux textes identiques', () => {
    expect(similarity('bonjour tout le monde', 'bonjour tout le monde')).toBe(1);
  });

  it('reste haute sur un mot manquant', () => {
    const s = similarity(
      normalizeForCompare('on se retrouve lundi pour le point budget'),
      normalizeForCompare('on se retrouve lundi pour le point de budget'),
    );
    expect(s).toBeGreaterThan(0.9);
  });

  it('tombe à 0 sur des longueurs très différentes', () => {
    expect(similarity('oui', 'une phrase nettement plus longue que ca')).toBe(0);
  });
});

describe('parseElapsedSeconds', () => {
  it('convertit HH:MM:SS', () => {
    expect(parseElapsedSeconds('00:00:42')).toBe(42);
    expect(parseElapsedSeconds('01:02:03')).toBe(3723);
  });

  it('renvoie NaN sur une valeur non parsable', () => {
    expect(parseElapsedSeconds('n/a')).toBeNaN();
    expect(parseElapsedSeconds(undefined)).toBeNaN();
  });
});

describe('findEchoDuplicate', () => {
  it("repère une phrase identique venue de l'autre flux", () => {
    const history = [line('On décale la réunion de lundi.', 'remote', '00:00:10')];
    const idx = findEchoDuplicate(history, {
      text: 'On décale la réunion de lundi.',
      source: 'local',
      elapsedS: 12,
    });
    expect(idx).toBe(0);
  });

  it('repère une variante proche (écho micro dégradé)', () => {
    const history = [line('On décale la réunion de lundi prochain.', 'remote', '00:00:10')];
    const idx = findEchoDuplicate(history, {
      text: 'On décale la reunion de lundi prochain',
      source: 'local',
      elapsedS: 11,
    });
    expect(idx).toBe(0);
  });

  it('ignore une phrase de la MÊME source (répétition légitime)', () => {
    const history = [line('On décale la réunion de lundi.', 'local', '00:00:10')];
    const idx = findEchoDuplicate(history, {
      text: 'On décale la réunion de lundi.',
      source: 'local',
      elapsedS: 12,
    });
    expect(idx).toBe(-1);
  });

  it('ignore hors fenêtre temporelle', () => {
    const history = [line('On décale la réunion de lundi.', 'remote', '00:00:10')];
    const idx = findEchoDuplicate(history, {
      text: 'On décale la réunion de lundi.',
      source: 'local',
      elapsedS: 90,
    });
    expect(idx).toBe(-1);
  });

  it('ne déduplique pas les interjections courtes', () => {
    const history = [line('Oui', 'remote', '00:00:10')];
    const idx = findEchoDuplicate(history, { text: 'Oui', source: 'local', elapsedS: 11 });
    expect(idx).toBe(-1);
  });

  it('ignore les lignes encore en delta', () => {
    const history = [
      line('On décale la réunion de lundi.', 'remote', '00:00:10', { isDelta: true }),
    ];
    const idx = findEchoDuplicate(history, {
      text: 'On décale la réunion de lundi.',
      source: 'local',
      elapsedS: 11,
    });
    expect(idx).toBe(-1);
  });

  it('ne se compare pas à soi-même via selfIndex', () => {
    const history = [line('On décale la réunion de lundi.', 'local', '00:00:10')];
    const idx = findEchoDuplicate(history, {
      text: 'On décale la réunion de lundi.',
      source: 'local',
      elapsedS: 10,
      selfIndex: 0,
    });
    expect(idx).toBe(-1);
  });

  it('ne rapproche pas deux phrases différentes', () => {
    const history = [line('On décale la réunion de lundi.', 'remote', '00:00:10')];
    const idx = findEchoDuplicate(history, {
      text: 'Je pars en congés la semaine prochaine.',
      source: 'local',
      elapsedS: 11,
    });
    expect(idx).toBe(-1);
  });
});

describe('applyEchoDedup', () => {
  it('laisse passer une ligne non dupliquée', () => {
    const history = [line('Bonjour à toutes et à tous.', 'remote', '00:00:05')];
    const res = applyEchoDedup(history, {
      text: 'Je vous rejoins dans deux minutes.',
      source: 'local',
      elapsedS: 8,
    });
    expect(res.dropped).toBe(false);
    expect(res.history).toBe(history);
  });

  it("écarte l'écho micro et conserve la ligne système", () => {
    const history = [line('On décale la réunion de lundi.', 'remote', '00:00:10')];
    const res = applyEchoDedup(history, {
      text: 'On décale la réunion de lundi.',
      source: 'local',
      elapsedS: 12,
    });
    expect(res.dropped).toBe(true);
    expect(res.history).toHaveLength(1);
    expect(res.history[0].source).toBe('remote');
  });

  it('promeut la ligne micro en remote quand le doublon système arrive après', () => {
    const history = [line('On décale la réunion de lundi.', 'local', '00:00:10')];
    const res = applyEchoDedup(history, {
      text: 'On décale la réunion de lundi.',
      source: 'remote',
      elapsedS: 12,
    });
    expect(res.dropped).toBe(true);
    expect(res.history).toHaveLength(1);
    expect(res.history[0].source).toBe('remote');
    expect(res.history[0].text).toBe('On décale la réunion de lundi.');
  });

  it('retire la ligne finalisée en place (selfIndex)', () => {
    const history = [
      line('On décale la réunion de lundi.', 'remote', '00:00:10'),
      line('On décale la réunion de lundi.', 'local', '00:00:11'),
    ];
    const res = applyEchoDedup(history, {
      text: 'On décale la réunion de lundi.',
      source: 'local',
      elapsedS: 11,
      selfIndex: 1,
    });
    expect(res.dropped).toBe(true);
    expect(res.history).toHaveLength(1);
    expect(res.history[0].source).toBe('remote');
  });

  it("ne mute pas l'historique d'origine", () => {
    const history = [line('On décale la réunion de lundi.', 'local', '00:00:10')];
    applyEchoDedup(history, {
      text: 'On décale la réunion de lundi.',
      source: 'remote',
      elapsedS: 12,
    });
    expect(history[0].source).toBe('local');
  });
});
