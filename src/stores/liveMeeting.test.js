// @vitest-environment jsdom
/**
 * Cycle de vie de la réunion en direct.
 *
 * Ce que ces tests protègent : une réunion doit exister en base dès le premier
 * mot — mais JAMAIS au prix du démarrage de l'enregistrement. Un serveur
 * injoignable ne doit rien casser, seulement faire retomber le produit sur son
 * ancien comportement (la réunion naîtra au premier compte-rendu).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const post = vi.fn();
vi.mock('../services/apiClient.js', () => ({ post: (...a) => post(...a) }));

const { liveMeetingIdStore } = await import('./recording.js');
const {
  newMeetingId,
  startLiveMeeting,
  stopLiveMeeting,
  flushLiveTranscription,
  disposeLiveMeeting,
} = await import('./liveMeeting.js');

const ok = (data = {}) => ({ ok: true, status: 200, data });
const ko = (status = 500) => ({ ok: false, status, data: { error: 'boom' } });

/** Ce que le direct a transcrit à cet instant — la source que le module relit. */
let transcript = '';
const start = () => startLiveMeeting({ readTranscription: () => transcript });

beforeEach(() => {
  vi.useRealTimers();
  post.mockReset();
  transcript = '';
  liveMeetingIdStore.set(null);
  disposeLiveMeeting();
});

describe('newMeetingId', () => {
  it('produit des identifiants distincts', () => {
    expect(newMeetingId()).not.toBe(newMeetingId());
  });
});

describe('startLiveMeeting', () => {
  it('ouvre la réunion en base et publie son identifiant', async () => {
    post.mockResolvedValue(ok());
    const id = await start();
    expect(id).toBeTruthy();
    expect(get(liveMeetingIdStore)).toBe(id);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/history/start');
    expect(body.meetingId).toBe(id);
    expect(Number.isNaN(new Date(body.startedAt).getTime())).toBe(false);
  });

  it("serveur injoignable : rien n'est publié, l'enregistrement continue", async () => {
    // Le démarrage d'une réunion ne doit JAMAIS dépendre du réseau. Sans
    // identifiant, on retombe sur l'ancien comportement.
    post.mockResolvedValue(ko(503));
    expect(await start()).toBeNull();
    expect(get(liveMeetingIdStore)).toBeNull();
  });
});

describe('flushLiveTranscription', () => {
  it('envoie la transcription courante, puis se tait tant que rien ne change', async () => {
    post.mockResolvedValue(ok());
    await start();
    post.mockClear();

    transcript = 'Bonjour à tous.';
    expect(await flushLiveTranscription()).toBe(true);
    expect(post).toHaveBeenCalledWith('/transcription/update', {
      meetingId: get(liveMeetingIdStore),
      transcription: 'Bonjour à tous.',
    });

    post.mockClear();
    expect(await flushLiveTranscription()).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('un envoi refusé est REJOUÉ au tour suivant, pas oublié', async () => {
    post.mockResolvedValue(ok());
    await start();
    transcript = 'Première phrase.';
    post.mockResolvedValue(ko(500));
    expect(await flushLiveTranscription()).toBe(false);
    post.mockResolvedValue(ok());
    expect(await flushLiveTranscription()).toBe(true);
  });

  it('sans réunion ouverte, n’écrit nulle part', async () => {
    transcript = 'Du texte.';
    expect(await flushLiveTranscription()).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('stopLiveMeeting', () => {
  it('pousse la dernière transcription puis clôt avec la durée mesurée', async () => {
    post.mockResolvedValue(ok());
    await start();
    transcript = 'Tout ce qui a été dit.';
    post.mockClear();

    const res = await stopLiveMeeting({ duration: 930 });
    expect(post.mock.calls[0][0]).toBe('/transcription/update');
    expect(post.mock.calls[1]).toEqual([
      '/history/stop',
      { meetingId: res.meetingId, duration: 930, discardIfEmpty: true },
    ]);
    expect(res.discarded).toBe(false);
    expect(get(liveMeetingIdStore)).toBeNull();
  });

  it('clôt AVEC les notes et les actions — une réunion rangée se rouvre avec elles', async () => {
    post.mockResolvedValue(ok());
    await start();
    post.mockClear();
    const actions = [{ id: 1, title: 'Relancer', show: true }];

    const res = await stopLiveMeeting({
      duration: 60,
      readNotesActions: () => ({ notes: 'Budget validé', actions }),
    });
    const [url, body] = post.mock.calls.at(-1);
    expect(url).toBe('/history/stop');
    expect(body).toEqual({
      meetingId: res.meetingId,
      duration: 60,
      discardIfEmpty: true,
      notes: 'Budget validé',
      actions,
    });
  });

  it('relit notes et actions au DERNIER moment — une retouche faite pendant l’envoi de la transcription part', async () => {
    post.mockResolvedValue(ok());
    await start();
    transcript = 'Une longue transcription.';
    let notes = 'Au clic';
    let releaseTranscript;
    post.mockImplementation((url) =>
      url === '/transcription/update'
        ? new Promise((resolve) => (releaseTranscript = () => resolve(ok())))
        : Promise.resolve(ok()),
    );
    const closing = stopLiveMeeting({ readNotesActions: () => ({ notes, actions: [] }) });
    notes = 'Retouchée pendant l’envoi';
    releaseTranscript();
    await closing;
    expect(post.mock.calls.at(-1)[1].notes).toBe('Retouchée pendant l’envoi');
  });

  it('sans état à relire (l’écran porte une autre réunion) : clôture sans notes ni actions', async () => {
    post.mockResolvedValue(ok());
    await start();
    await stopLiveMeeting({ readNotesActions: () => null });
    const body = post.mock.calls.at(-1)[1];
    expect(body.notes).toBeUndefined();
    expect(body.actions).toBeUndefined();
  });

  it("attend l'écriture de notes déjà en vol avant de clore — la clôture arrive en dernier", async () => {
    post.mockResolvedValue(ok());
    await start();
    let release;
    const settled = new Promise((resolve) => (release = resolve));
    const closing = stopLiveMeeting({ settled });
    await Promise.resolve();
    await Promise.resolve();
    expect(post.mock.calls.some(([url]) => url === '/history/stop')).toBe(false);
    release();
    await closing;
    expect(post.mock.calls.at(-1)[0]).toBe('/history/stop');
  });

  it('« Nouvelle réunion » : la suivante, ouverte pendant la clôture, garde son identifiant', async () => {
    // Mobile : arrêt puis redémarrage immédiat. Effacer l'identifiant sans
    // vérifier priverait la réunion suivante de ses sauvegardes et de sa clôture.
    post.mockResolvedValue(ok());
    await start();
    transcript = 'Fin de la première réunion.';
    let releaseTranscript;
    post.mockImplementation((url) =>
      url === '/transcription/update'
        ? new Promise((resolve) => (releaseTranscript = () => resolve(ok())))
        : Promise.resolve(ok()),
    );
    const closing = stopLiveMeeting();
    const next = await start(); // la suivante s'ouvre pendant l'envoi
    releaseTranscript();
    await closing;
    expect(get(liveMeetingIdStore)).toBe(next);
  });

  it('relaie la purge décidée par le serveur', async () => {
    post.mockResolvedValue(ok());
    await start();
    post.mockResolvedValue(ok({ ok: true, discarded: true }));
    expect((await stopLiveMeeting()).discarded).toBe(true);
  });

  it('rend null quand aucune réunion n’était ouverte (démarrage hors ligne)', async () => {
    expect(await stopLiveMeeting({ duration: 12 })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("l'identifiant tombe AVANT la réponse HTTP — l'italique suit l'arrêt, pas le réseau", async () => {
    post.mockResolvedValue(ok());
    await start();
    let idPendantLAppel = 'jamais lu';
    post.mockImplementation(async (url) => {
      if (url === '/history/stop') idPendantLAppel = get(liveMeetingIdStore);
      return ok();
    });
    await stopLiveMeeting();
    expect(idPendantLAppel).toBeNull();
  });
});

describe('sauvegardes périodiques', () => {
  it('envoie la transcription sans intervention, réunion ouverte', async () => {
    vi.useFakeTimers();
    post.mockResolvedValue(ok());
    await start();
    transcript = 'Une phrase dite pendant la réunion.';
    post.mockClear();

    await vi.advanceTimersByTimeAsync(21_000);
    expect(post).toHaveBeenCalledWith('/transcription/update', expect.anything());
  });

  it('ne survit pas à la clôture', async () => {
    vi.useFakeTimers();
    post.mockResolvedValue(ok());
    await start();
    await stopLiveMeeting();
    post.mockClear();
    transcript = 'Texte tapé après coup.';

    await vi.advanceTimersByTimeAsync(60_000);
    expect(post).not.toHaveBeenCalled();
  });
});
