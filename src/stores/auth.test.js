import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

const api = vi.hoisted(() => ({
  fetchAuthConfig: vi.fn(),
  fetchSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../services/authApi.js', () => api);

const { registerAuthFailureHandler } = vi.hoisted(() => ({ registerAuthFailureHandler: vi.fn() }));
vi.mock('../utils/httpErrorHandler.js', () => ({ registerAuthFailureHandler }));

const {
  auth,
  canGenerateInfographic,
  initAuth,
  bootstrapAuth,
  signIn,
  signOut,
  signedOut,
  setUserFromInit,
  clearPasswordChangeRequirement,
} = await import('./auth.js');

const USER = {
  email: 'a@b.fr',
  name: 'A',
  role: 'user',
  mustChangePassword: false,
  authMode: 'password',
};

describe('store d authentification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.set({
      status: 'unknown',
      user: null,
      capabilities: { passwordPolicy: { minLength: 10 } },
    });
  });

  it('démarre en « unknown » — l écran de connexion ne doit pas clignoter au boot', () => {
    expect(get(auth).status).toBe('unknown');
  });

  it('bootstrapAuth adopte les capacités du serveur et la session', async () => {
    api.fetchAuthConfig.mockResolvedValue({
      ok: true,
      data: { oidcEnabled: false, passwordResetEnabled: true },
    });
    api.fetchSession.mockResolvedValue({ ok: true, data: { authenticated: true, user: USER } });

    expect(await bootstrapAuth()).toBe(true);
    const state = get(auth);
    expect(state.status).toBe('authenticated');
    expect(state.user).toEqual(USER);
    expect(state.capabilities.oidcEnabled).toBe(false);
    expect(state.capabilities.passwordResetEnabled).toBe(true);
    // La politique par défaut reste en place quand le serveur ne la renvoie pas.
    expect(state.capabilities.passwordPolicy.minLength).toBe(10);
  });

  it('bootstrapAuth sans session native reste « unknown », jamais « signed_out »', async () => {
    api.fetchAuthConfig.mockResolvedValue({ ok: true, data: {} });
    api.fetchSession.mockResolvedValue({ ok: true, data: { authenticated: false } });
    expect(await bootstrapAuth()).toBe(false);
    // NON-RÉGRESSION : /api/auth/session est servi par un routeur qui efface
    // les en-têtes d'identité — il ne voit JAMAIS une session OIDC. Conclure
    // « signed_out » ici afficherait l'écran de connexion à un utilisateur SSO
    // valide et l'application ne chargerait jamais son historique. C'est
    // /api/init qui tranche.
    expect(get(auth).status).toBe('unknown');
    expect(get(auth).user).toBe(null);
  });

  it('un serveur injoignable laisse des capacités sûres plutôt que rien', async () => {
    api.fetchAuthConfig.mockResolvedValue({ ok: false, data: { error: 'network' } });
    api.fetchSession.mockResolvedValue({ ok: false, data: { error: 'network' } });
    await bootstrapAuth();
    // Sans ces défauts, l'écran de connexion n'afficherait NI le formulaire NI
    // le bouton SSO : l'utilisateur serait bloqué.
    expect(get(auth).capabilities.passwordLoginEnabled).toBe(true);
    expect(get(auth).capabilities.oidcEnabled).toBe(true);
  });

  it('signIn propage le slug d erreur du serveur sans authentifier', async () => {
    api.login.mockResolvedValue({ ok: false, data: { error: 'invalid_credentials' } });
    expect(await signIn('a@b.fr', 'faux')).toEqual({
      ok: false,
      error: 'invalid_credentials',
      retryAfter: undefined,
    });
    expect(get(auth).user).toBe(null);
  });

  it('signIn réussi renseigne l utilisateur', async () => {
    api.login.mockResolvedValue({ ok: true, data: { user: USER } });
    expect(await signIn('a@b.fr', 'bon')).toEqual({ ok: true });
    expect(get(auth)).toMatchObject({ status: 'authenticated', user: USER });
  });

  it('signOut signale à l appelant s il doit faire le RP-logout OIDC', async () => {
    api.logout.mockResolvedValue({ ok: true, data: {} });

    setUserFromInit({ ...USER, authMode: 'password' });
    expect(await signOut()).toEqual({ oidc: false });
    expect(get(auth).status).toBe('signed_out');

    setUserFromInit({ ...USER, authMode: 'oidc' });
    expect(await signOut()).toEqual({ oidc: true });
  });

  it('initAuth branche le point de sortie qui remplace le rebond vers l IdP', () => {
    initAuth();
    expect(registerAuthFailureHandler).toHaveBeenCalledTimes(1);

    // Le handler enregistré doit basculer le store, pas naviguer.
    setUserFromInit(USER);
    const handler = registerAuthFailureHandler.mock.calls[0][0];
    handler('http-401');
    expect(get(auth).status).toBe('signed_out');
  });

  it('clearPasswordChangeRequirement lève le verrou sans perdre l utilisateur', () => {
    setUserFromInit({ ...USER, mustChangePassword: true });
    clearPasswordChangeRequirement();
    expect(get(auth).user).toMatchObject({ email: USER.email, mustChangePassword: false });
  });

  it('signedOut vide l utilisateur', () => {
    setUserFromInit(USER);
    signedOut();
    expect(get(auth)).toMatchObject({ status: 'signed_out', user: null });
  });
});

describe('canGenerateInfographic', () => {
  const state = (enabled, rights) => ({
    status: 'authenticated',
    user: rights === undefined ? null : { ...USER, rights },
    capabilities: { infographic: { enabled } },
  });

  it('faut l interrupteur de l onglet IA ET le droit tenu des groupes', () => {
    auth.set(state(true, { infographic: true }));
    expect(get(canGenerateInfographic)).toBe(true);
  });

  it('l un sans l autre ne suffit pas, et sans compte non plus', () => {
    auth.set(state(false, { infographic: true }));
    expect(get(canGenerateInfographic)).toBe(false);
    auth.set(state(true, { infographic: false }));
    expect(get(canGenerateInfographic)).toBe(false);
    // Identité d'avant les droits, ou pas encore chargée : refusé.
    auth.set(state(true, {}));
    expect(get(canGenerateInfographic)).toBe(false);
    auth.set(state(true, undefined));
    expect(get(canGenerateInfographic)).toBe(false);
  });
});
