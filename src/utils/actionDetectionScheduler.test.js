import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ACTION_WINDOW_SIZE,
  ACTION_DEBOUNCE_MS,
  buildActionWindow,
  createActionScheduler,
} from './actionDetectionScheduler.js';

const line = (text, extra = {}) => ({
  time: '00:00:10',
  timestamp: '10:00:00',
  author: 'Intervenant',
  text,
  isDelta: false,
  source: 'local',
  ...extra,
});

describe('buildActionWindow', () => {
  it('joint les segments finalisés par des sauts de ligne', () => {
    const history = [line('Bonjour à tous.'), line('On commence par le budget.')];
    expect(buildActionWindow(history)).toBe('Bonjour à tous.\nOn commence par le budget.');
  });

  it('écarte les lignes en cours de dictée', () => {
    const history = [line('Phrase terminée.'), line('phrase en cours', { isDelta: true })];
    expect(buildActionWindow(history)).toBe('Phrase terminée.');
  });

  it('ne garde que les ACTION_WINDOW_SIZE derniers segments', () => {
    const history = Array.from({ length: 20 }, (_, i) => line(`ligne ${i}`));
    const window = buildActionWindow(history).split('\n');
    expect(window).toHaveLength(ACTION_WINDOW_SIZE);
    expect(window[0]).toBe(`ligne ${20 - ACTION_WINDOW_SIZE}`);
    expect(window.at(-1)).toBe('ligne 19');
  });

  it('recouvre la fenêtre précédente : une action à cheval reste entière', () => {
    const history = Array.from({ length: 9 }, (_, i) => line(`ligne ${i}`));
    const before = buildActionWindow(history.slice(0, 8));
    const after = buildActionWindow(history);
    const shared = after.split('\n').filter((l) => before.split('\n').includes(l));
    expect(shared).toHaveLength(ACTION_WINDOW_SIZE - 1);
  });

  it('tolère un historique absent ou vide', () => {
    expect(buildActionWindow(null)).toBe('');
    expect(buildActionWindow([])).toBe('');
    expect(buildActionWindow([line('   ')])).toBe('');
  });

  it('deux canaux audio : la fenêtre dit qui parle (qui s’engage)', () => {
    const history = [
      line('Il faut relancer Globex.', { source: 'local' }),
      line('Je m’en occupe demain.', { source: 'remote' }),
    ];
    expect(buildActionWindow(history, 10, 'Alex')).toBe(
      '[Alex]\nIl faut relancer Globex.\n[Visio]\nJe m’en occupe demain.',
    );
  });

  it('mono-flux : texte nu, NON-RÉGRESSION du format envoyé au modèle', () => {
    const history = [line('Bonjour.', { source: 'local' }), line('On commence.')];
    expect(buildActionWindow(history, 10, 'Alex')).toBe('Bonjour.\nOn commence.');
  });

  it('la tranche porte son étiquette dès sa première ligne', () => {
    // La fenêtre coupe au milieu d'une réplique : sans étiquette en tête, le
    // modèle attribuerait ses premières lignes au mauvais locuteur.
    const history = [
      line('Ligne coupée avant la fenêtre.', { source: 'remote' }),
      line('Première de la fenêtre.', { source: 'remote' }),
      line('Réponse micro.', { source: 'local' }),
    ];
    expect(buildActionWindow(history, 2, 'Alex')).toBe(
      '[Visio]\nPremière de la fenêtre.\n[Alex]\nRéponse micro.',
    );
  });
});

describe('createActionScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Appel dont on contrôle la résolution, pour tenir le verrou ouvert. */
  function deferred() {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve };
  }

  it('appelle une fois après le débounce, avec le contenu du moment', async () => {
    let content = 'a';
    const run = vi.fn().mockResolvedValue(undefined);
    const s = createActionScheduler({ getContent: () => content, run });

    s.notify();
    expect(run).not.toHaveBeenCalled();

    content = 'a\nb';
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('a\nb');
  });

  it('coalesce une rafale de notifications en un seul appel', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const s = createActionScheduler({ getContent: () => 'texte', run });

    s.notify();
    s.notify();
    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('ne lance jamais deux appels en parallèle et relance UNE fois à la retombée', async () => {
    const first = deferred();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const s = createActionScheduler({ getContent: () => 'texte', run });

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    expect(s.isInFlight()).toBe(true);

    // Cinq segments arrivent pendant l'appel.
    for (let i = 0; i < 5; i++) {
      s.notify();
      await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    }
    expect(run).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('ne relance pas si rien n’est arrivé pendant l’appel', async () => {
    const first = deferred();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const s = createActionScheduler({ getContent: () => 'texte', run });

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    first.resolve();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS * 3);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('flush() part sans attendre le débounce', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const s = createActionScheduler({ getContent: () => 'texte', run });

    s.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('flush() pendant un appel est honoré par la relance de fin', async () => {
    const first = deferred();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const s = createActionScheduler({ getContent: () => 'texte', run });

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    s.flush();
    expect(run).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('n’appelle pas sur un contenu vide, et laisse le verrou libre', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    let content = '';
    const s = createActionScheduler({ getContent: () => content, run });

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).not.toHaveBeenCalled();
    expect(s.isInFlight()).toBe(false);

    content = 'enfin du texte';
    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rend le verrou quand l’appel échoue', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('réseau')).mockResolvedValue(undefined);
    const s = createActionScheduler({ getContent: () => 'texte', run });

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(s.isInFlight()).toBe(false);

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('signale l’état d’analyse à l’ouverture et à la fermeture', async () => {
    const first = deferred();
    const onStateChange = vi.fn();
    const s = createActionScheduler({
      getContent: () => 'texte',
      run: () => first.promise,
      onStateChange,
    });

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(onStateChange).toHaveBeenLastCalledWith(true);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(onStateChange).toHaveBeenLastCalledWith(false);
  });

  it('reset() annule une analyse en attente', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const s = createActionScheduler({ getContent: () => 'texte', run });

    s.notify();
    s.reset();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS * 3);

    expect(run).not.toHaveBeenCalled();
  });

  it('respecte l’espacement demandé par l’administration', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const s = createActionScheduler({
      getContent: () => 'texte',
      run,
      getMinSentences: () => 3,
    });

    s.notify();
    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS * 2);
    expect(run).not.toHaveBeenCalled();

    s.notify(); // 3ᵉ phrase : le seuil est atteint
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS * 2);
    expect(run).toHaveBeenCalledTimes(1); // le compteur est reparti de zéro
  });

  it('n’analyse pas le reliquat à la retombée d’un appel si l’espacement n’est pas atteint', async () => {
    // Sans ce garde-fou, la retombée contournerait le réglage à chaque fois.
    const first = deferred();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const s = createActionScheduler({
      getContent: () => 'texte',
      run,
      getMinSentences: () => 3,
    });

    s.notify();
    s.notify();
    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);

    s.notify(); // une seule phrase pendant l'appel
    first.resolve();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS * 2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('la fin d’enregistrement analyse le reliquat, même sous le seuil', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const s = createActionScheduler({
      getContent: () => 'texte',
      run,
      getMinSentences: () => 5,
    });

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS * 2);
    expect(run).not.toHaveBeenCalled();

    s.flush(); // une action dite dans la dernière phrase ne doit pas se perdre
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('l’espacement est relu à chaque phrase, pas capturé au montage', async () => {
    // L'administration peut changer le réglage pendant la réunion.
    const run = vi.fn().mockResolvedValue(undefined);
    let min = 4;
    const s = createActionScheduler({
      getContent: () => 'texte',
      run,
      getMinSentences: () => min,
    });

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).not.toHaveBeenCalled();

    min = 1;
    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('détection coupée : ni analyse, ni analyse de fin', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const s = createActionScheduler({
      getContent: () => 'texte',
      run,
      isEnabled: () => false,
    });

    s.notify();
    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS * 3);
    s.flush();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).not.toHaveBeenCalled();
  });

  it('reste correct quand l’historique rétrécit (déduplication d’écho)', async () => {
    // Le déclencheur d'avant reposait sur `length % 5` : retirer une ligne
    // pouvait refranchir un seuil déjà passé et relancer la même fenêtre.
    const run = vi.fn().mockResolvedValue(undefined);
    let history = Array.from({ length: 5 }, (_, i) => line(`ligne ${i}`));
    const s = createActionScheduler({ getContent: () => buildActionWindow(history), run });

    s.notify();
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);

    history = history.slice(0, 4); // une ligne d'écho retirée, sans nouveau texte
    await vi.advanceTimersByTimeAsync(ACTION_DEBOUNCE_MS * 3);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
