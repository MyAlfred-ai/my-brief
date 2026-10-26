/**
 * Store des pastilles de configuration (stores/configChecks.js).
 *
 * Ce qui casserait sans ces tests : un compte non administrateur qui
 * interrogerait la route d'organisation (403 à chaque ouverture) ; une relecture
 * en échec qui effacerait les pastilles ; un rafraîchissement demandé pendant
 * une lecture — typiquement juste après un enregistrement — qui serait perdu ;
 * des constats du compte précédent qui survivraient à la déconnexion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const fetchAccountChecks = vi.fn();
const fetchOrganizationChecks = vi.fn();
vi.mock('../services/configChecksApi.js', () => ({
  fetchAccountChecks: (...a) => fetchAccountChecks(...a),
  fetchOrganizationChecks: (...a) => fetchOrganizationChecks(...a),
}));

const { configChecks, refreshConfigChecks, resetConfigChecks } = await import('./configChecks.js');

const ACCOUNT = [{ section: 'tags', code: 'tag_folder_missing', level: 'warning' }];
const ORGANIZATION = [{ section: 'ai', code: 'ai_key_missing', level: 'error' }];
const ok = (issues) => ({ ok: true, status: 200, data: { issues } });

beforeEach(() => {
  resetConfigChecks();
  fetchAccountChecks.mockReset().mockResolvedValue(ok(ACCOUNT));
  fetchOrganizationChecks.mockReset().mockResolvedValue(ok(ORGANIZATION));
});

describe('configChecks', () => {
  it("un compte ordinaire ne lit que les siens ; un administrateur, aussi ceux de l'organisation", async () => {
    await refreshConfigChecks({ admin: false });
    expect(fetchOrganizationChecks).not.toHaveBeenCalled();
    expect(get(configChecks)).toEqual({ loaded: true, account: ACCOUNT, organization: [] });

    await refreshConfigChecks({ admin: true });
    expect(get(configChecks).organization).toEqual(ORGANIZATION);

    // Sans argument, le périmètre précédent est repris.
    await refreshConfigChecks();
    expect(fetchOrganizationChecks).toHaveBeenCalledTimes(2);
  });

  it('une relecture en échec garde les pastilles affichées', async () => {
    await refreshConfigChecks({ admin: true });
    fetchAccountChecks.mockResolvedValue({ ok: false, status: 502, data: { error: 'network' } });
    fetchOrganizationChecks.mockResolvedValue({ ok: false, status: 502, data: {} });
    const result = await refreshConfigChecks();
    expect(result.ok).toBe(false);
    expect(get(configChecks)).toMatchObject({ account: ACCOUNT, organization: ORGANIZATION });
  });

  it('un rafraîchissement demandé pendant une lecture est rejoué ensuite, une fois', async () => {
    let release;
    fetchAccountChecks.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(ok([]));
        }),
    );
    const first = refreshConfigChecks({ admin: false });
    refreshConfigChecks();
    refreshConfigChecks();
    release();
    await first;
    await vi.waitFor(() => expect(fetchAccountChecks).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(get(configChecks).account).toEqual(ACCOUNT));
  });

  it('la déconnexion efface tout, périmètre compris', async () => {
    await refreshConfigChecks({ admin: true });
    resetConfigChecks();
    expect(get(configChecks)).toEqual({ loaded: false, account: [], organization: [] });
    await refreshConfigChecks();
    expect(fetchOrganizationChecks).toHaveBeenCalledTimes(1);
  });
});
