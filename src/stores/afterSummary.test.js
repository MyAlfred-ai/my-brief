// @vitest-environment jsdom
/**
 * « Et maintenant ? » — QUAND la fenêtre qui suit le premier résumé s'ouvre
 * (stores/afterSummary.js).
 *
 * Trois propriétés :
 *   - elle attend la relecture de la réunion (titre, tag posé pendant
 *     l'enregistrement) : ouvrir avant, c'était proposer de ranger une réunion
 *     déjà rangée ;
 *   - « Ne plus me proposer » est respecté, sur le compte ;
 *   - rien à proposer ⇒ rien ne s'ouvre.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const actionsApi = { fetchActionSettings: vi.fn(), saveActionSettings: vi.fn() };
vi.mock('../services/actionsApi.js', () => ({
  fetchActionSettings: (...a) => actionsApi.fetchActionSettings(...a),
  saveActionSettings: (...a) => actionsApi.saveActionSettings(...a),
}));
vi.mock('../services/connectApi.js', () => ({ fetchConnectStatus: vi.fn() }));

const { historyItems } = await import('./history.js');
const { auth } = await import('./auth.js');
const { resetActionSettings } = await import('./actionSettings.js');
const { afterSummaryRequest, offerAfterSummary, dismissAfterSummary } =
  await import('./afterSummary.js');

const settings = (afterSummary = { offer: true }) => ({
  ok: true,
  status: 200,
  data: {
    settings: {
      mail: { recipients: [], tagRecipients: [] },
      storage: { folder: '' },
      naming: {},
      afterSummary,
    },
  },
});

function capabilities(actions) {
  auth.update((state) => ({ ...state, capabilities: { ...state.capabilities, actions } }));
}

const OPEN = {
  summary: { email: true, storage: true, download: true },
  emailAvailable: true,
  connections: { provider: 'google' },
};

beforeEach(() => {
  vi.clearAllMocks();
  resetActionSettings();
  dismissAfterSummary();
  historyItems.set([{ meetingId: 'm-1', title: 'Point Acme', tagId: null }]);
  capabilities(OPEN);
  actionsApi.fetchActionSettings.mockResolvedValue(settings());
});

describe('offerAfterSummary', () => {
  it('ouvre la fenêtre pour la réunion dont le premier résumé vient d’arriver', async () => {
    expect(await offerAfterSummary('m-1')).toBe(true);
    expect(get(afterSummaryRequest)).toEqual({ meetingId: 'm-1' });
  });

  it('attend la relecture de la réunion avant de s’ouvrir', async () => {
    let release;
    const ready = new Promise((resolve) => (release = resolve));
    const pending = offerAfterSummary('m-1', ready);
    await Promise.resolve();
    await Promise.resolve();
    expect(get(afterSummaryRequest)).toBe(null);
    release();
    expect(await pending).toBe(true);
    expect(get(afterSummaryRequest)).toEqual({ meetingId: 'm-1' });
  });

  it('une relecture en échec n’empêche pas la proposition', async () => {
    expect(await offerAfterSummary('m-1', Promise.reject(new Error('réseau')))).toBe(true);
  });

  it('relit les réglages : destinataires et dossier ont pu changer ailleurs', async () => {
    await offerAfterSummary('m-1');
    expect(actionsApi.fetchActionSettings).toHaveBeenCalledTimes(1);
  });

  it('respecte « Ne plus me proposer »', async () => {
    actionsApi.fetchActionSettings.mockResolvedValue(settings({ offer: false }));
    expect(await offerAfterSummary('m-1')).toBe(false);
    expect(get(afterSummaryRequest)).toBe(null);
  });

  it('réunion déjà rangée, ni mail ni dépôt ouverts : rien à proposer', async () => {
    historyItems.set([{ meetingId: 'm-1', title: 'Point Acme', tagId: 't-acme' }]);
    capabilities({ summary: { email: false, storage: false, download: true } });
    expect(await offerAfterSummary('m-1')).toBe(false);
  });

  it('réunion sans tag : ranger reste proposé, même sans mail ni dépôt', async () => {
    capabilities({ summary: { email: false, storage: false, download: true } });
    expect(await offerAfterSummary('m-1')).toBe(true);
  });

  it('sans réunion, rien', async () => {
    expect(await offerAfterSummary(null)).toBe(false);
    expect(actionsApi.fetchActionSettings).not.toHaveBeenCalled();
  });
});
