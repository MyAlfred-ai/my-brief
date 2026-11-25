/**
 * Logo de l'entreprise — lu une fois par session, remplacé sans relecture
 * après un enregistrement de l'administration, oublié à la déconnexion.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const apiGet = vi.fn();
vi.mock('../services/apiClient.js', () => ({ get: (...args) => apiGet(...args) }));

const { companyLogo, loadCompanyLogo, setCompanyLogo, resetCompanyLogo } =
  await import('./companyLogo.js');

const LOGO = 'data:image/png;base64,QUJD';

beforeEach(() => {
  apiGet.mockReset();
  resetCompanyLogo();
});

describe('companyLogo', () => {
  it('une seule lecture, même demandée par plusieurs infographies', async () => {
    apiGet.mockResolvedValue({ ok: true, data: { companyLogo: LOGO } });
    await Promise.all([loadCompanyLogo(), loadCompanyLogo()]);
    await loadCompanyLogo();
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/branding/company-logo');
    expect(get(companyLogo)).toEqual({ loaded: true, logo: LOGO });
  });

  it('un échec réseau laisse retenter à la prochaine infographie', async () => {
    apiGet.mockResolvedValueOnce({ ok: false, data: null });
    await loadCompanyLogo();
    expect(get(companyLogo).loaded).toBe(false);
    apiGet.mockResolvedValueOnce({ ok: true, data: { companyLogo: '' } });
    await loadCompanyLogo();
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(get(companyLogo)).toEqual({ loaded: true, logo: '' });
  });

  it('après un enregistrement : la valeur fraîche, sans relire', async () => {
    setCompanyLogo(LOGO);
    await loadCompanyLogo();
    expect(apiGet).not.toHaveBeenCalled();
    expect(get(companyLogo).logo).toBe(LOGO);
  });

  it('déconnexion : oublié, relu ensuite', async () => {
    setCompanyLogo(LOGO);
    resetCompanyLogo();
    expect(get(companyLogo)).toEqual({ loaded: false, logo: '' });
    apiGet.mockResolvedValue({ ok: true, data: { companyLogo: '' } });
    await loadCompanyLogo();
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});
