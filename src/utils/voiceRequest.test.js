/**
 * Écoute d'une demande dictée à l'Aide IA. Ce que ces tests protègent : la
 * demande part ENTIÈRE, une fois la personne tue — pas à la première phrase
 * bouclée (« il coupe trop tôt »), ni dix secondes après une phrase restée
 * sans point.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVoiceRequestCollector, looksFinished } from './voiceRequest.js';

const QUIET = 2500;
const OPEN = 4000;
const GESTURE = 900;
const MAX = 30_000;
const ARMED = 12_000;

const final = (key, text, source = 'local') => ({ key, text, source, isDelta: false });
const live = (key, text, source = 'local') => ({ key, text, source, isDelta: true });

function setup({ wakeWord = 'Alfred' } = {}) {
  const requests = [];
  const calls = [];
  const collector = createVoiceRequestCollector({
    getWakeWord: () => wakeWord,
    onRequest: (request) => requests.push(request),
    onCall: (entry) => calls.push(entry.key),
    now: () => Date.now(),
    timing: { quietMs: QUIET, openMs: OPEN, gestureMs: GESTURE, maxMs: MAX, armedMs: ARMED },
  });
  collector.observe([]); // premier passage : rien à l'écran
  return { collector, requests, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('la demande part entière, une fois la personne tue', () => {
  it('« j’ai une question. » puis la question : UNE demande, pas une demi-phrase', () => {
    const { collector, requests } = setup();
    const first = final('a', 'Alfred, j’ai une question.');
    collector.observe([first]);
    vi.advanceTimersByTime(2000); // la personne reprend son souffle
    expect(requests).toEqual([]);

    collector.observe([first, final('b', 'Est-ce que le budget du lot 2 a été validé ?')]);
    vi.advanceTimersByTime(QUIET - 1);
    expect(requests).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(requests).toEqual([
      {
        question: 'j’ai une question. Est-ce que le budget du lot 2 a été validé ?',
        lineKey: 'a',
      },
    ]);
  });

  it('une respiration en milieu de phrase : la suite est attendue, puis jointe', () => {
    const { collector, requests } = setup();
    const start = final('a', 'Alfred, est-ce que tu peux me dire.');
    collector.observe([start]);
    vi.advanceTimersByTime(3000);
    expect(requests).toEqual([]); // une amorce : on attend plus longtemps
    collector.observe([start, live('b', 'quelle est la date')]);
    vi.advanceTimersByTime(1000);
    collector.observe([start, live('b', 'quelle est la date de livraison du projet Atlas ?')]);
    vi.advanceTimersByTime(QUIET);
    expect(requests.map((r) => r.question)).toEqual([
      'est-ce que tu peux me dire. quelle est la date de livraison du projet Atlas ?',
    ]);
  });

  it('une demande restée sans point final part quand même — sans attendre qu’on reparle', () => {
    const { collector, requests } = setup();
    collector.observe([live('a', 'Alfred')]);
    collector.observe([live('a', 'Alfred, quelle est la date')]);
    collector.observe([live('a', 'Alfred, quelle est la date de livraison du lot 2')]);
    vi.advanceTimersByTime(QUIET);
    // La ligne est toujours « en cours » à l'écran : la demande est partie.
    expect(requests).toEqual([
      { question: 'quelle est la date de livraison du lot 2', lineKey: 'a' },
    ]);
  });

  it('chaque mot qui arrive repousse l’envoi', () => {
    const { collector, requests } = setup();
    collector.observe([live('a', 'Alfred, rappelle-moi la date de livraison du lot 2 ?')]);
    vi.advanceTimersByTime(QUIET - 100);
    collector.observe([
      live('a', 'Alfred, rappelle-moi la date de livraison du lot 2 ? Et son budget ?'),
    ]);
    vi.advanceTimersByTime(QUIET - 100);
    expect(requests).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(requests).toHaveLength(1);
  });

  it('une phrase en suspens attend plus longtemps qu’une phrase finie', () => {
    const { collector, requests } = setup();
    collector.observe([final('a', 'Alfred, donne-moi le budget de,')]);
    vi.advanceTimersByTime(QUIET);
    expect(requests).toEqual([]);
    vi.advanceTimersByTime(OPEN - QUIET);
    expect(requests).toHaveLength(1);
  });

  it('une personne qui ne s’arrête jamais : la demande part au plafond d’écoute', () => {
    const { collector, requests } = setup();
    let text = 'Alfred, résume';
    collector.observe([live('a', text)]);
    for (let t = 0; t < MAX + 2000; t += 1000) {
      vi.advanceTimersByTime(1000);
      text += ' et encore ceci,';
      collector.observe([live('a', text)]);
    }
    expect(requests).toHaveLength(1);
  });
});

describe('ce qui ne retarde ni ne pollue la demande', () => {
  it('quelqu’un d’autre parle (autre flux) : sa phrase n’entre pas dans la demande', () => {
    const { collector, requests } = setup();
    const ask = final('a', 'Alfred, où en est le lot 2 ?');
    collector.observe([ask]);
    vi.advanceTimersByTime(QUIET - 500);
    collector.observe([ask, live('b', 'Je crois qu’il est en retard', 'remote')]);
    vi.advanceTimersByTime(500);
    expect(requests).toEqual([{ question: 'où en est le lot 2 ?', lineKey: 'a' }]);
  });

  it('un second appel clôt la première demande et en ouvre une autre', () => {
    const { collector, requests, calls } = setup();
    const one = final('a', 'Alfred, où en est le lot 2 ?');
    const two = final('b', 'Alfred, et le budget du lot 3 ?');
    collector.observe([one]);
    collector.observe([one, two]);
    expect(requests.map((r) => r.question)).toEqual(['où en est le lot 2 ?']);
    vi.advanceTimersByTime(QUIET);
    expect(requests.map((r) => r.question)).toEqual([
      'où en est le lot 2 ?',
      'et le budget du lot 3 ?',
    ]);
    expect(calls).toEqual(['a', 'b']);
  });

  it('une ligne ne part qu’une fois, même si la liste est relue cent fois', () => {
    const { collector, requests } = setup();
    const ask = final('a', 'Alfred, où en est le lot 2 ?');
    collector.observe([ask]);
    vi.advanceTimersByTime(QUIET);
    for (let i = 0; i < 100; i += 1) collector.observe([ask, final(`n${i}`, 'On continue.')]);
    vi.advanceTimersByTime(OPEN);
    expect(requests).toHaveLength(1);
  });

  it('les lignes déjà là au premier passage sont du contexte, pas des appels', () => {
    const requests = [];
    const collector = createVoiceRequestCollector({
      getWakeWord: () => 'Alfred',
      onRequest: (request) => requests.push(request),
    });
    collector.observe([final('old', 'Alfred, une vieille question ?')]);
    vi.advanceTimersByTime(OPEN);
    expect(requests).toEqual([]);
    expect(collector.listening).toBe(false);
  });

  it('questions coupées : rien ne part, et rien ne repartira quand on les rallume', () => {
    const { collector, requests } = setup();
    const ask = final('a', 'Alfred, où en est le lot 2 ?');
    collector.observe([ask], { active: false });
    collector.observe([ask], { active: true });
    vi.advanceTimersByTime(OPEN);
    expect(requests).toEqual([]);
  });

  it('la ligne d’appel disparaît (écho retiré) : sa jumelle de l’autre flux prend le relais', () => {
    const { collector, requests } = setup();
    collector.observe([final('a', 'Alfred, où en est le lot 2 ?')]);
    collector.observe([final('twin', 'Alfred, où en est le lot 2 ?', 'remote')]);
    vi.advanceTimersByTime(QUIET);
    expect(requests).toEqual([{ question: 'où en est le lot 2 ?', lineKey: 'twin' }]);
  });
});

describe('prénom lancé seul, gestes', () => {
  it('« Alfred ? » : la phrase qui suit est la demande, si elle vient à temps', () => {
    const { collector, requests } = setup();
    const call = final('a', 'Alfred ?');
    collector.observe([call]);
    vi.advanceTimersByTime(5000);
    collector.observe([call, final('b', 'Où en est le budget ?')]);
    vi.advanceTimersByTime(QUIET);
    expect(requests).toEqual([{ question: 'Où en est le budget ?', lineKey: 'a' }]);
  });

  it('« Alfred ? » puis rien : l’écoute s’éteint, la conversation qui suit n’est pas pour lui', () => {
    const { collector, requests } = setup();
    const call = final('a', 'Alfred ?');
    collector.observe([call]);
    vi.advanceTimersByTime(ARMED);
    expect(collector.listening).toBe(false);
    collector.observe([call, final('b', 'Bon, on continue.')]);
    vi.advanceTimersByTime(OPEN);
    expect(requests).toEqual([]);
  });

  it('un geste reste vif', () => {
    const { collector, requests } = setup();
    collector.observe([final('a', 'Alfred, ferme.')]);
    vi.advanceTimersByTime(GESTURE);
    expect(requests).toEqual([{ question: 'ferme.', lineKey: 'a' }]);
  });

  it('« ferme le dossier Atlas » n’est pas un geste : la suite a le temps d’arriver', () => {
    const { collector, requests } = setup();
    collector.observe([live('a', 'Alfred, ferme')]);
    vi.advanceTimersByTime(GESTURE - 200);
    collector.observe([live('a', 'Alfred, ferme le dossier Atlas dans le plan.')]);
    vi.advanceTimersByTime(GESTURE);
    expect(requests).toEqual([]);
    vi.advanceTimersByTime(QUIET);
    expect(requests.map((r) => r.question)).toEqual(['ferme le dossier Atlas dans le plan.']);
  });

  it('réunion suivante : plus rien n’est retenu', () => {
    const { collector, requests } = setup();
    collector.observe([final('a', 'Alfred, où en est le lot 2 ?')]);
    collector.reset();
    vi.advanceTimersByTime(OPEN);
    expect(requests).toEqual([]);
  });
});

describe('looksFinished — dans le doute, « pas finie »', () => {
  it('une question, une phrase complète : finie', () => {
    for (const said of [
      'où en est le budget ?',
      'rappelle-moi la date de livraison du lot 2.',
      'résume.',
      'quelle est la date de livraison du lot 2',
      // Un mot interrogatif en dernier ferme la question — avec son « ? ».
      'Tu en penses quoi ?',
      'on livre quand ?',
    ]) {
      expect(looksFinished(said), said).toBe(true);
    }
  });

  it('une amorce, une virgule, un mot de liaison, une phrase courte sans point : en suspens', () => {
    for (const said of [
      'j’ai une question.',
      'est-ce que tu peux me dire.',
      'dis-moi',
      'je voudrais savoir',
      'donne-moi le budget de',
      'donne-moi le budget du lot 2,',
      'le budget…',
      'le budget du lot',
      'tu en penses quoi',
      'et c’est qui.',
      'cherche dans myBrain.',
      '',
    ]) {
      expect(looksFinished(said), said).toBe(false);
    }
  });
});
