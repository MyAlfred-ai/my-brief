// @vitest-environment jsdom
/**
 * Ce qui peut partir, et par où (stores/actionAvailability.js) — la liste que
 * voient le menu « Partager » ET la fenêtre « Et maintenant ? ».
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const connectApi = { fetchConnectStatus: vi.fn() };
vi.mock('../services/connectApi.js', () => ({
  fetchConnectStatus: (...a) => connectApi.fetchConnectStatus(...a),
}));

const { auth } = await import('./auth.js');
const { actionAvailability, mailAccountConnected, loadMailAccountStatus } =
  await import('./actionAvailability.js');

function capabilities(actions) {
  auth.update((state) => ({ ...state, capabilities: { ...state.capabilities, actions } }));
}

beforeEach(() => {
  mailAccountConnected.set(false);
  capabilities(undefined);
});

describe('actionAvailability', () => {
  it('tant que /auth/config n’a rien dit : seul le téléchargement', () => {
    const value = get(actionAvailability);
    expect(value.summary).toEqual({ email: false, storage: false, download: true });
    expect(value.emailReady).toBe(false);
    expect(value.storageProvider).toBe('');
  });

  it('le relais SMTP OU un compte relié suffisent à l’envoi', async () => {
    capabilities({ emailAvailable: true });
    expect(get(actionAvailability).emailReady).toBe(true);

    capabilities({ emailAvailable: false });
    connectApi.fetchConnectStatus.mockResolvedValue({
      ok: true,
      data: { provider: { connected: true } },
    });
    await loadMailAccountStatus();
    expect(get(actionAvailability).emailReady).toBe(true);
  });

  it('nomme le fournisseur de dépôt', () => {
    capabilities({ connections: { provider: 'microsoft' } });
    expect(get(actionAvailability)).toMatchObject({
      storageProvider: 'microsoft',
      storageLabel: 'OneDrive',
    });
  });

  it('un statut en échec ne change rien', async () => {
    mailAccountConnected.set(true);
    connectApi.fetchConnectStatus.mockResolvedValue({ ok: false, data: {} });
    await loadMailAccountStatus();
    expect(get(mailAccountConnected)).toBe(true);
  });
});
