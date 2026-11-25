// @vitest-environment jsdom
/**
 * Identité des réunions : une réunion se désigne par son meetingId, jamais par
 * sa position.
 *
 * Le test central est `renomme/supprime la bonne réunion, pas celle du même
 * index` : la Sidebar travaille sur une liste FILTRÉE (recherche, et bientôt
 * filtre par tag) tandis que le store détient la liste complète. Tant que
 * l'API prenait un index, une recherche active suffisait à faire porter le
 * renommage — et la SUPPRESSION — sur une autre réunion que celle cliquée.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const post = vi.fn(async () => ({ ok: true, status: 200, data: { ok: true } }));
// Lectures : panne réseau par défaut — chaque test qui lit injecte son faux.
const apiGet = vi.fn(async () => ({ ok: false, status: 0, data: { error: 'network' } }));
vi.mock('../services/apiClient.js', () => ({
  post: (...args) => post(...args),
  get: (...args) => apiGet(...args),
}));

const {
  historyItems,
  selectedMeetingId,
  selectedHistoryItem,
  meetingIdOf,
  renameMeeting,
  deleteMeeting,
  applyTitleOverrides,
  getDeletedHistoryIds,
  pollHistoryUntilMeetingReady,
  loadHistoryList,
  historyItemWithContent,
  WITH_CONTENT,
} = await import('./history.js');

/** Trois réunions ; `m-2` n'est PAS à l'index où la liste filtrée la placerait. */
const seed = () => [
  { meetingId: 'm-1', title: 'Point produit', now: '2026-08-01T10:00:00.000Z' },
  { meetingId: 'm-2', title: 'Client Dupont', now: '2026-08-02T10:00:00.000Z' },
  { meetingId: 'm-3', title: 'Rétro sprint', now: '2026-08-03T10:00:00.000Z' },
];

beforeEach(() => {
  localStorage.clear();
  post.mockClear();
  historyItems.set(seed());
  selectedMeetingId.set(null);
});

describe('meetingIdOf', () => {
  it('préfère meetingId — la clé attendue par les routes backend', () => {
    expect(meetingIdOf({ meetingId: 'm-1', id: 'autre', uuid: 'encore-autre' })).toBe('m-1');
  });

  it('replie sur les champs hérités n8n, dans cet ordre', () => {
    expect(meetingIdOf({ id: 'a' })).toBe('a');
    expect(meetingIdOf({ _id: 'b' })).toBe('b');
    expect(meetingIdOf({ uuid: 'c' })).toBe('c');
    expect(meetingIdOf({ sessionId: 'd' })).toBe('d');
  });

  it('null quand aucune identité exploitable (jamais une chaîne vide)', () => {
    expect(meetingIdOf({})).toBe(null);
    expect(meetingIdOf(null)).toBe(null);
    expect(meetingIdOf({ meetingId: '' })).toBe(null);
  });

  it('normalise en chaîne — un id numérique ne doit pas rater la comparaison', () => {
    expect(meetingIdOf({ meetingId: 42 })).toBe('42');
  });
});

describe('renameMeeting', () => {
  it('renomme la réunion visée, pas celle du même index dans une liste filtrée', async () => {
    // Ce que voyait la Sidebar en cherchant « client » : m-2 en position 0.
    const filtered = get(historyItems).filter((m) => /client/i.test(m.title));
    expect(filtered).toHaveLength(1);
    const cible = meetingIdOf(filtered[0]);

    await renameMeeting(cible, 'Client Dupont — closing');

    const list = get(historyItems);
    expect(list.find((m) => m.meetingId === 'm-2').title).toBe('Client Dupont — closing');
    // L'ancien code aurait écrit sur l'index 0 de la liste complète.
    expect(list.find((m) => m.meetingId === 'm-1').title).toBe('Point produit');
  });

  it('poste le meetingId au backend', async () => {
    await renameMeeting('m-3', 'Rétro #12');
    expect(post).toHaveBeenCalledWith('/history/rename', {
      meetingId: 'm-3',
      title: 'Rétro #12',
    });
  });

  it('ignore un titre vide ou un id absent — aucun appel réseau', async () => {
    await renameMeeting('m-1', '   ');
    await renameMeeting(null, 'Titre');
    expect(post).not.toHaveBeenCalled();
    expect(get(historyItems).map((m) => m.title)).toEqual([
      'Point produit',
      'Client Dupont',
      'Rétro sprint',
    ]);
  });

  it('le titre renommé survit à un refetch via applyTitleOverrides', async () => {
    await renameMeeting('m-2', 'Client Dupont — closing');
    const refetched = applyTitleOverrides(seed(), 'fr');
    expect(refetched.find((m) => m.meetingId === 'm-2').title).toBe('Client Dupont — closing');
    expect(refetched.find((m) => m.meetingId === 'm-1').title).toBe('Point produit');
  });
});

describe('deleteMeeting', () => {
  it('supprime la réunion visée, pas celle du même index', async () => {
    await deleteMeeting('m-2');
    expect(get(historyItems).map((m) => m.meetingId)).toEqual(['m-1', 'm-3']);
    expect(post).toHaveBeenCalledWith('/history/delete', { meetingId: 'm-2' });
  });

  it('mémorise l’id supprimé pour que le refetch ne le ressuscite pas', async () => {
    await deleteMeeting('m-2');
    expect(getDeletedHistoryIds().has('m-2')).toBe(true);
  });

  it('désélectionne seulement si c’est la réunion ouverte', async () => {
    selectedMeetingId.set('m-3');
    await deleteMeeting('m-2');
    expect(get(selectedMeetingId)).toBe('m-3');

    await deleteMeeting('m-3');
    expect(get(selectedMeetingId)).toBe(null);
  });

  it('ne fait rien sans id — pas de deleteMany à l’aveugle', async () => {
    await deleteMeeting(null);
    expect(post).not.toHaveBeenCalled();
    expect(get(historyItems)).toHaveLength(3);
  });
});

describe('selectedHistoryItem', () => {
  it('résout la réunion ouverte quelle que soit sa position', () => {
    selectedMeetingId.set('m-3');
    expect(get(selectedHistoryItem).title).toBe('Rétro sprint');
  });

  it('vaut null tant que la liste n’est pas chargée — le dock doit lire l’ID, pas cet objet', () => {
    historyItems.set([]);
    selectedMeetingId.set('m-1');
    expect(get(selectedHistoryItem)).toBe(null);
    expect(get(selectedMeetingId)).toBe('m-1');
  });

  it('suit la liste : une réunion supprimée n’est plus résolue', async () => {
    selectedMeetingId.set('m-2');
    expect(get(selectedHistoryItem)).not.toBe(null);
    await deleteMeeting('m-2');
    expect(get(selectedHistoryItem)).toBe(null);
  });
});

describe('pollHistoryUntilMeetingReady', () => {
  /** Le titre IA arrive en tâche de fond : la réunion apparaît d'abord avec `titlePending`. */
  const refetchThatSettlesTitleAfter = (rounds) => {
    let calls = 0;
    return vi.fn(async () => {
      calls += 1;
      historyItems.set([
        ...seed(),
        {
          meetingId: 'm-9',
          title: calls > rounds ? 'Migration INITECH validée' : 'Réunion sans titre',
          ...(calls > rounds ? {} : { titlePending: true }),
        },
      ]);
    });
  };

  it('continue de relire tant que le titre est en cours de génération', async () => {
    const refetch = refetchThatSettlesTitleAfter(2);
    await pollHistoryUntilMeetingReady('m-9', refetch, { intervalMs: 0 });
    // 2 tours avec titlePending + le tour où le titre est posé.
    expect(refetch).toHaveBeenCalledTimes(3);
    expect(get(historyItems).find((m) => m.meetingId === 'm-9').title).toBe(
      'Migration INITECH validée',
    );
  });

  it('rend la main dès le premier tour si le titre est déjà là', async () => {
    const refetch = refetchThatSettlesTitleAfter(0);
    await pollHistoryUntilMeetingReady('m-9', refetch, { intervalMs: 0 });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('abandonne après maxAttempts — un titre qui n’arrive jamais ne boucle pas sans fin', async () => {
    const refetch = refetchThatSettlesTitleAfter(Infinity);
    await pollHistoryUntilMeetingReady('m-9', refetch, { maxAttempts: 4, intervalMs: 0 });
    expect(refetch).toHaveBeenCalledTimes(4);
  });

  it('sans meetingId : un seul rechargement', async () => {
    const refetch = vi.fn(async () => {});
    await pollHistoryUntilMeetingReady(null, refetch, { intervalMs: 0 });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // Les tests ci-dessus tournent sans statut lisible (réseau en panne) : la
  // liste à chaque tour, comme avant /history/status. Avec le statut :
  it('avec /history/status : la liste n’est relue qu’au début et quand le titre est prêt', async () => {
    const refetch = refetchThatSettlesTitleAfter(1);
    let rounds = 0;
    const probe = vi.fn(async () => ({ titlePending: ++rounds < 4 }));
    await pollHistoryUntilMeetingReady('m-9', refetch, { intervalMs: 0, probe });
    expect(probe).toHaveBeenCalledTimes(4);
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(get(historyItems).find((m) => m.meetingId === 'm-9').title).toBe(
      'Migration INITECH validée',
    );
  });

  it('avec /history/status, titre jamais prêt : une dernière relecture, pas douze', async () => {
    const refetch = refetchThatSettlesTitleAfter(Infinity);
    const probe = vi.fn(async () => ({ titlePending: true }));
    await pollHistoryUntilMeetingReady('m-9', refetch, { maxAttempts: 12, intervalMs: 0, probe });
    expect(probe).toHaveBeenCalledTimes(11);
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});

describe('liste allégée et ouverture d’une réunion', () => {
  const lite = (id, over = {}) => ({ meetingId: id, title: id, versions: [{ id: 'v1' }], ...over });
  const full = (id) => ({
    meetingId: id,
    title: `${id} (serveur)`,
    notes: 'version serveur',
    transcription: `Transcription de ${id}`,
    resume: `<p>${id}</p>`,
    versions: [{ id: 'v1', html: `<p>${id}</p>` }],
  });

  it('loadHistoryList : la liste, plus le contenu des réunions à l’écran — rien d’autre', async () => {
    const fetchItem = vi.fn(async (id) => full(id));
    const fetchList = async () => ({
      ok: true,
      status: 200,
      data: [lite('a'), lite('b', { notes: 'locales' })],
    });
    const res = await loadHistoryList(['b', null, 'b'], { fetchList, fetchItem });
    expect(fetchItem).toHaveBeenCalledTimes(1); // doublons et vides écartés
    const [a, b] = res.items;
    expect(a[WITH_CONTENT]).toBeUndefined();
    expect(a.transcription).toBeUndefined();
    expect(b[WITH_CONTENT]).toBe(true);
    expect(b.transcription).toBe('Transcription de b');
    expect(b.versions[0].html).toBe('<p>b</p>');
    // Seuls les champs lourds viennent du serveur : le reste est celui de la liste.
    expect(b.notes).toBe('locales');
    expect(b.title).toBe('b');
  });

  it('loadHistoryList : erreurs rendues telles quelles à l’appelant', async () => {
    const fetchItem = async () => null;
    const call = (res) => loadHistoryList([], { fetchList: async () => res, fetchItem });
    expect(await call({ ok: false, status: 401, data: {} })).toEqual({ status: 401 });
    expect(await call({ ok: false, status: 0, data: { error: 'auth_redirect' } })).toEqual({
      authRedirect: true,
    });
    expect(await call({ ok: true, status: 200, data: null })).toEqual({ invalid: true });
  });

  it('historyItemWithContent : lit le contenu une fois, le garde dans la liste', async () => {
    historyItems.set([lite('a', { notes: 'en cours d’envoi' }), lite('b')]);
    const fetchItem = vi.fn(async (id) => full(id));
    const item = await historyItemWithContent('a', { fetchItem });
    expect(item.transcription).toBe('Transcription de a');
    expect(item.notes).toBe('en cours d’envoi'); // la copie locale l'emporte
    expect(get(historyItems)[0]).toBe(item);
    expect(await historyItemWithContent('a', { fetchItem })).toBe(item);
    expect(fetchItem).toHaveBeenCalledTimes(1);
  });

  it('historyItemWithContent : la dernière ouverture demandée gagne', async () => {
    historyItems.set([lite('a'), lite('b')]);
    let release;
    const slow = new Promise((resolve) => (release = resolve));
    const fetchItem = vi.fn(async (id) => (id === 'a' ? slow.then(() => full('a')) : full('b')));
    const first = historyItemWithContent('a', { fetchItem });
    const second = await historyItemWithContent('b', { fetchItem });
    release();
    expect(await first).toBe(false);
    expect(second.transcription).toBe('Transcription de b');
  });

  it('historyItemWithContent : introuvable ou illisible → null', async () => {
    historyItems.set([lite('a')]);
    expect(await historyItemWithContent('zz', { fetchItem: async () => full('zz') })).toBe(null);
    expect(await historyItemWithContent('a', { fetchItem: async () => null })).toBe(null);
    expect(get(historyItems)[0][WITH_CONTENT]).toBeUndefined();
  });
});

describe('persistance de la sélection', () => {
  it('écrit et efface la clé localStorage', () => {
    selectedMeetingId.set('m-1');
    expect(localStorage.getItem('mybrief_selected_meeting_id')).toBe('m-1');
    selectedMeetingId.set(null);
    expect(localStorage.getItem('mybrief_selected_meeting_id')).toBe(null);
  });
});
