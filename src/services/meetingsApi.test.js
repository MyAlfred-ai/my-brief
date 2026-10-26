/**
 * Écritures sur une réunion déjà en base — ici le nommage IA sans compte rendu.
 *
 * Ce que ces tests protègent : l'appelant (App → fileMeeting) ne relit
 * l'historique en boucle QUE si le serveur a bien lancé une génération
 * (`titlePending`), et n'affiche une erreur QUE sur un vrai échec — « rien à
 * nommer » (titre déjà là, réunion vide) n'en est pas un.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn();
vi.mock('./apiClient.js', () => ({ post: (...a) => post(...a) }));

const { requestMeetingTitle, persistNotesActions } = await import('./meetingsApi.js');

beforeEach(() => post.mockReset());

const notesActions = {
  notes: 'Budget validé',
  actions: [{ id: 1, title: 'Relancer', show: true }],
};

describe('persistNotesActions', () => {
  it("écrit notes et actions sur la réunion — 'saved' quand le serveur accepte", async () => {
    post.mockResolvedValue({ ok: true, status: 200, data: { ok: true } });
    expect(await persistNotesActions('m-1', notesActions)).toBe('saved');
    expect(post).toHaveBeenCalledWith(
      '/history/notes-actions',
      { meetingId: 'm-1', ...notesActions },
      {},
    );
  });

  it('page qui se ferme : la requête part avec keepalive', async () => {
    post.mockResolvedValue({ ok: true, status: 200, data: { ok: true } });
    await persistNotesActions('m-1', notesActions, { keepalive: true });
    expect(post.mock.calls[0][2]).toEqual({ keepalive: true });
  });

  it("'error' sur un refus ou un réseau absent — l'appelant le signale", async () => {
    post.mockResolvedValue({ ok: false, status: 500, data: { error: 'internal_error' } });
    expect(await persistNotesActions('m-1', notesActions)).toBe('error');
    post.mockResolvedValue(null);
    expect(await persistNotesActions('m-1', notesActions)).toBe('error');
  });

  it('n’envoie que les champs fournis — le serveur ne touche pas aux autres', async () => {
    post.mockResolvedValue({ ok: true, status: 200, data: { ok: true } });
    await persistNotesActions('m-1', { notes: 'Seules les notes' });
    expect(post.mock.calls[0][1]).toEqual({ meetingId: 'm-1', notes: 'Seules les notes' });
    expect('actions' in post.mock.calls[0][1]).toBe(false);
  });

  it("'idle' sur une réunion disparue (404) : supprimée entre-temps, rien à signaler", async () => {
    post.mockResolvedValue({ ok: false, status: 404, data: { error: 'meeting_not_found' } });
    expect(await persistNotesActions('m-1', notesActions)).toBe('idle');
  });

  it('sans identifiant : rien ne part', async () => {
    expect(await persistNotesActions(null, notesActions)).toBe('idle');
    expect(post).not.toHaveBeenCalled();
  });
});

describe('requestMeetingTitle', () => {
  it("'saved' quand le serveur lance la génération — l'historique est à relire", async () => {
    post.mockResolvedValue({ ok: true, status: 200, data: { ok: true, titlePending: true } });
    expect(await requestMeetingTitle('m-1')).toBe('saved');
    expect(post).toHaveBeenCalledWith('/history/title', { meetingId: 'm-1' });
  });

  it("'idle' quand il n'y a rien à nommer (titre déjà posé, réunion vide)", async () => {
    post.mockResolvedValue({ ok: true, status: 200, data: { ok: true, titlePending: false } });
    expect(await requestMeetingTitle('m-1')).toBe('idle');
  });

  it("'error' sur un refus ou un réseau absent", async () => {
    post.mockResolvedValue({ ok: false, status: 404, data: { error: 'meeting_not_found' } });
    expect(await requestMeetingTitle('m-1')).toBe('error');
    post.mockResolvedValue(null);
    expect(await requestMeetingTitle('m-1')).toBe('error');
  });

  it('sans identifiant : rien ne part, et ce n’est pas une erreur', async () => {
    expect(await requestMeetingTitle(null)).toBe('idle');
    expect(post).not.toHaveBeenCalled();
  });

  it('range la réunion avec ses notes et ses actions', async () => {
    post.mockResolvedValue({ ok: true, status: 200, data: { ok: true, titlePending: true } });
    await requestMeetingTitle('m-1', notesActions);
    expect(post).toHaveBeenCalledWith('/history/title', { meetingId: 'm-1', ...notesActions });
  });
});
