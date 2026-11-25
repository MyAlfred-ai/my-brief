/**
 * Témoin « une réunion enregistre ». Ce que ces tests protègent : une
 * application tuée SANS préavis (aucun `beforeunload` sur téléphone) doit
 * retrouver sa réunion, son chronomètre et son document au lancement suivant.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  writeLiveSession,
  readLiveSession,
  clearLiveSession,
  settleRestoredHistory,
  createLiveSessionKeeper,
  readRecordingClock,
  seedRecordingClock,
} from './liveSession.js';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

describe('writeLiveSession / readLiveSession', () => {
  it('rend l’état, le chronomètre, la réunion et la date du dernier battement', () => {
    const storage = fakeStorage();
    writeLiveSession(
      { state: 'recording', elapsedS: 754.9, meetingId: 'm-1' },
      { storage, now: () => 1_000 },
    );
    expect(readLiveSession({ storage })).toEqual({
      state: 'recording',
      elapsedS: 754,
      meetingId: 'm-1',
      savedAt: 1_000,
    });
    // Le chronomètre garde sa clé historique, relue au démarrage d'un enregistrement.
    expect(storage.getItem('mybrief_cumulative_recording_time')).toBe('754');
  });

  it('sans réunion en base (démarrage hors ligne) : pas d’identifiant, la reprise en ouvrira une', () => {
    const storage = fakeStorage();
    writeLiveSession({ state: 'paused', elapsedS: 10 }, { storage });
    expect(readLiveSession({ storage })).toMatchObject({ state: 'paused', meetingId: null });
  });

  it('lit l’ancien format (chaîne écrite par beforeunload), sans identifiant ni date', () => {
    const storage = fakeStorage({
      mybrief_session_active: 'paused',
      mybrief_cumulative_recording_time: '321',
    });
    expect(readLiveSession({ storage })).toEqual({
      state: 'paused',
      elapsedS: 321,
      meetingId: null,
      savedAt: null,
    });
  });

  it('rien d’écrit, ou contenu illisible : pas de réunion à reprendre', () => {
    expect(readLiveSession({ storage: fakeStorage() })).toBeNull();
    expect(
      readLiveSession({ storage: fakeStorage({ mybrief_session_active: '{oups' }) }),
    ).toBeNull();
    expect(
      readLiveSession({ storage: fakeStorage({ mybrief_session_active: 'null' }) }),
    ).toBeNull();
    expect(readLiveSession({ storage: null })).toBeNull();
  });

  it('stockage plein : l’écriture échoue en silence, l’enregistrement continue', () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new DOMException('plein', 'QuotaExceededError');
    };
    expect(() => writeLiveSession({ state: 'recording', elapsedS: 5 }, { storage })).not.toThrow();
  });

  it('clearLiveSession retire le témoin, pas le chronomètre (lu au redémarrage après un arrêt)', () => {
    const storage = fakeStorage();
    writeLiveSession({ state: 'recording', elapsedS: 90 }, { storage });
    clearLiveSession({ storage });
    expect(readLiveSession({ storage })).toBeNull();
    expect(storage.getItem('mybrief_cumulative_recording_time')).toBe('90');
  });
});

describe('readRecordingClock / seedRecordingClock', () => {
  it('pose le chronomètre relu au prochain départ, sans écrire de témoin', () => {
    // Reprendre une réunion terminée : un micro refusé ensuite ne doit pas
    // laisser de fausse « Réunion interrompue » au prochain lancement.
    const storage = fakeStorage();
    seedRecordingClock(1234.7, { storage });
    expect(readRecordingClock({ storage })).toBe(1234);
    expect(readLiveSession({ storage })).toBeNull();
  });

  it('valeur absente ou illisible : zéro', () => {
    expect(readRecordingClock({ storage: fakeStorage() })).toBe(0);
    expect(
      readRecordingClock({ storage: fakeStorage({ mybrief_cumulative_recording_time: 'x' }) }),
    ).toBe(0);
    const storage = fakeStorage();
    seedRecordingClock(-3, { storage });
    expect(readRecordingClock({ storage })).toBe(0);
  });

  it('stockage refusé : ni l’un ni l’autre ne lève', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(() => seedRecordingClock(10, { storage: broken })).not.toThrow();
    expect(readRecordingClock({ storage: broken })).toBe(0);
  });
});

describe('createLiveSessionKeeper', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('écrit au démarrage puis à chaque battement : tuée sans préavis, la page laisse un état frais', () => {
    const storage = fakeStorage();
    let elapsedS = 0;
    const keeper = createLiveSessionKeeper({
      read: () => ({ state: 'recording', elapsedS, meetingId: 'm-1' }),
      intervalMs: 5000,
      storage,
      now: () => Date.now(),
    });
    keeper.start();
    expect(readLiveSession({ storage }).elapsedS).toBe(0);

    elapsedS = 63;
    vi.advanceTimersByTime(5000);
    // Aucun événement de fermeture n'a eu lieu : le témoin est pourtant à jour.
    expect(readLiveSession({ storage })).toMatchObject({ elapsedS: 63, meetingId: 'm-1' });
    keeper.stop();
  });

  it('l’arrêt voulu retire le témoin et coupe le battement', () => {
    const storage = fakeStorage();
    const read = vi.fn(() => ({ state: 'recording', elapsedS: 1 }));
    const keeper = createLiveSessionKeeper({ read, intervalMs: 5000, storage });
    keeper.start();
    keeper.stop();
    expect(readLiveSession({ storage })).toBeNull();
    const calls = read.mock.calls.length;
    vi.advanceTimersByTime(60_000);
    expect(read.mock.calls.length).toBe(calls);
  });

  it('rien n’enregistre : un battement n’écrit rien', () => {
    const storage = fakeStorage();
    const keeper = createLiveSessionKeeper({ read: () => null, storage });
    keeper.beat();
    expect(readLiveSession({ storage })).toBeNull();
  });

  it('beat() écrit sans attendre — pause, reprise, passage en arrière-plan', () => {
    const storage = fakeStorage();
    let state = 'recording';
    const keeper = createLiveSessionKeeper({
      read: () => ({ state, elapsedS: 12 }),
      storage,
    });
    keeper.start();
    state = 'paused';
    keeper.beat();
    expect(readLiveSession({ storage }).state).toBe('paused');
    keeper.stop();
  });
});

describe('settleRestoredHistory', () => {
  const final = (text, extra = {}) => ({ text, isDelta: false, source: 'local', ...extra });

  it('boucle les lignes restées « en cours » et rend leur texte pour le texte complet', () => {
    const history = [
      final('Bonjour à tous.'),
      { text: ' on reprend le point ', isDelta: true, source: 'local', lastDeltaAt: 123 },
    ];
    const { history: settled, added } = settleRestoredHistory(history);
    expect(settled[1]).toEqual({ text: 'on reprend le point', isDelta: false, source: 'local' });
    expect(added).toEqual(['on reprend le point']);
  });

  it('retire une ligne en cours restée vide', () => {
    const { history, added } = settleRestoredHistory([
      final('Bonjour.'),
      { text: '  ', isDelta: true },
    ]);
    expect(history).toHaveLength(1);
    expect(added).toEqual([]);
  });

  it('rien à boucler : rend le même tableau, sans copie', () => {
    const history = [final('Bonjour.'), final('Au revoir.')];
    expect(settleRestoredHistory(history).history).toBe(history);
  });

  it('un marqueur « hors ligne » restauré ne promet plus rien, et ne sera jamais résolu par erreur', () => {
    const history = [
      final('Avant.'),
      final('⟨ Passage hors ligne — transcription différée ⟩', { offlineGapId: 'gap-1' }),
      final('⟨ Enregistrement interrompu pendant 02:00 ⟩', { offlineGapId: 'cut-17' }),
    ];
    const { history: settled, added } = settleRestoredHistory(history, '⟨ non transcrit ⟩');
    expect(settled[1]).toMatchObject({ text: '⟨ non transcrit ⟩', offlineGapId: 'lost-gap-1' });
    // Le marqueur d'interruption n'attendait rien : intact.
    expect(settled[2]).toBe(history[2]);
    expect(added).toEqual([]);
  });

  it('historique absent ou illisible : tableau vide', () => {
    expect(settleRestoredHistory(null)).toEqual({ history: [], added: [] });
  });
});
