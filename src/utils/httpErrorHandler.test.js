import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerRecordingGuard,
  isRecordingGuardActive,
  consumeDeferredAuthError,
  forceReauth,
  autoRecoverFromAuthError,
  registerAuthTokenProvider,
  registerAuthFailureHandler,
  installAuthFetchInterceptor,
} from './httpErrorHandler.js';

describe('garde « enregistrement en cours »', () => {
  beforeEach(() => {
    registerRecordingGuard(() => false);
    consumeDeferredAuthError(); // vide un éventuel reliquat d'un test précédent
  });

  it('inactive par défaut, active quand le getter dit vrai', () => {
    expect(isRecordingGuardActive()).toBe(false);
    registerRecordingGuard(() => true);
    expect(isRecordingGuardActive()).toBe(true);
    registerRecordingGuard(() => false);
    expect(isRecordingGuardActive()).toBe(false);
  });

  it('un getter qui jette = « pas en enregistrement » (jamais bloquant)', () => {
    registerRecordingGuard(() => {
      throw new Error('boom');
    });
    expect(isRecordingGuardActive()).toBe(false);
  });

  it('un argument non-fonction désactive la garde sans crasher', () => {
    registerRecordingGuard(null);
    expect(isRecordingGuardActive()).toBe(false);
  });

  it('consumeDeferredAuthError retourne la raison puis null', async () => {
    registerRecordingGuard(() => true);
    const handled = await autoRecoverFromAuthError('http-401');
    expect(handled).toBe(false); // différé, pas pris en charge
    expect(consumeDeferredAuthError()).toBe('http-401');
    expect(consumeDeferredAuthError()).toBe(null);
  });

  it('seule la PREMIÈRE raison différée est conservée', async () => {
    registerRecordingGuard(() => true);
    await autoRecoverFromAuthError('http-401');
    await autoRecoverFromAuthError('opaque-redirect');
    expect(consumeDeferredAuthError()).toBe('http-401');
  });

  it('forceReauth pendant un enregistrement : no-op immédiat (pas de teardown)', async () => {
    registerRecordingGuard(() => true);
    // En environnement node, un forceReauth NON guardé exploserait sur
    // window/document/localStorage : résoudre sans rejet prouve l'early-return
    // avant tout effet de bord (et avant le verrou reauthInFlight).
    await expect(forceReauth()).resolves.toBeUndefined();
    expect(consumeDeferredAuthError()).toBe('forceReauth-pendant-enregistrement');
    // Rejouable : le verrou reauthInFlight n'a pas été posé par l'appel différé.
    await expect(forceReauth()).resolves.toBeUndefined();
    expect(consumeDeferredAuthError()).toBe('forceReauth-pendant-enregistrement');
  });
});

describe('hooks natifs (Bearer + failure handler)', () => {
  beforeEach(() => {
    // Reset : la garde/les hooks peuvent fuir depuis un describe précédent.
    registerRecordingGuard(() => false);
    consumeDeferredAuthError();
  });

  afterEach(() => {
    registerAuthTokenProvider(null);
    registerAuthFailureHandler(null);
    registerRecordingGuard(() => false);
    consumeDeferredAuthError();
  });

  it('forceReauth délègue au failure handler natif (pas de teardown web)', async () => {
    const handler = vi.fn();
    registerAuthFailureHandler(handler);
    // Résout en env node sans toucher window/localStorage => l'early-return
    // vers le handler a lieu avant tout effet de bord web.
    await expect(forceReauth()).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledWith('forceReauth');
  });

  it('la garde enregistrement PRIME sur le failure handler', async () => {
    const handler = vi.fn();
    registerAuthFailureHandler(handler);
    registerRecordingGuard(() => true);
    await expect(forceReauth()).resolves.toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
    expect(consumeDeferredAuthError()).toBe('forceReauth-pendant-enregistrement');
  });

  describe('intercepteur fetch', () => {
    // L'intercepteur ne s'installe qu'UNE fois par module (flag interne) et
    // capture window.fetch à ce moment-là : une seule fenêtre factice et un
    // seul mock pour tout le describe ; le comportement varie via nextResponse.
    const fetchMock = vi.fn(async () => nextResponse);
    let nextResponse = { status: 200 };

    beforeEach(() => {
      fetchMock.mockClear();
      nextResponse = { status: 200 };
      if (!globalThis.window) {
        globalThis.window = {
          fetch: fetchMock,
          location: { origin: 'http://test.local' },
        };
        installAuthFetchInterceptor();
      }
    });

    it('attache X-Requested-With + Bearer sur /api/ quand un provider est enregistré', async () => {
      registerAuthTokenProvider(() => 'jeton-abc');
      await window.fetch('/api/init');
      const [, init] = fetchMock.mock.calls.at(-1);
      const headers = new Headers(init.headers);
      expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
      expect(headers.get('Authorization')).toBe('Bearer jeton-abc');
      // apiOrigin vide (web) => credentials non forcés
      expect(init.credentials).toBeUndefined();
    });

    it('sans provider : pas d’en-tête Authorization (comportement web historique)', async () => {
      await window.fetch('/api/init');
      const [, init] = fetchMock.mock.calls.at(-1);
      expect(new Headers(init.headers).get('Authorization')).toBe(null);
    });

    it('les URLs hors API protégée passent inchangées', async () => {
      await window.fetch('https://ailleurs.example.com/x');
      expect(fetchMock.mock.calls.at(-1)[1]).toBeUndefined();
    });

    it('401 : le failure handler natif remplace autoRecover', async () => {
      const handler = vi.fn();
      registerAuthFailureHandler(handler);
      nextResponse = { status: 401 };
      await window.fetch('/api/history');
      expect(handler).toHaveBeenCalledWith('http-401');
    });

    it('401 pendant enregistrement : différé, le handler n’est PAS appelé', async () => {
      const handler = vi.fn();
      registerAuthFailureHandler(handler);
      registerRecordingGuard(() => true);
      nextResponse = { status: 401 };
      await window.fetch('/api/history');
      expect(handler).not.toHaveBeenCalled();
      expect(consumeDeferredAuthError()).toBe('http-401');
    });

    it('la sonde passive /ping ne déclenche jamais le handler', async () => {
      const handler = vi.fn();
      registerAuthFailureHandler(handler);
      nextResponse = { status: 401 };
      await window.fetch('/api/ping');
      expect(handler).not.toHaveBeenCalled();
    });

    it('les routes /api/auth/ gèrent leurs propres 401/403', async () => {
      const handler = vi.fn();
      registerAuthFailureHandler(handler);
      // 403 = mot de passe actuel erroné. Le traiter comme une perte de session
      // déconnecterait l'utilisateur pour une simple faute de frappe.
      nextResponse = { status: 403 };
      await window.fetch('/api/auth/change-password');
      expect(handler).not.toHaveBeenCalled();
      // 401 = identifiants invalides : le formulaire affiche son propre message.
      nextResponse = { status: 401 };
      await window.fetch('/api/auth/login');
      expect(handler).not.toHaveBeenCalled();
    });

    it('les routes /api/admin/ gèrent leur propre 403 (« pas administrateur »)', async () => {
      const handler = vi.fn();
      registerAuthFailureHandler(handler);
      nextResponse = { status: 403 };
      await window.fetch('/api/admin/users');
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

describe('apiOrigin cross-origin (build mobile, module frais avec env stubbée)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    delete globalThis.window;
  });

  it('Bearer + credentials omis sur l’origine API ; relative WebView non interceptée', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    const fetchMock = vi.fn(async () => ({ status: 200 }));
    globalThis.window = {
      fetch: fetchMock,
      location: { origin: 'capacitor://localhost' },
    };
    const mod = await import('./httpErrorHandler.js');
    mod.registerAuthTokenProvider(() => 'tok-natif');
    mod.installAuthFetchInterceptor();

    // Appel API absolu (cas nominal natif : baseUrl absolu via constants.js)
    await window.fetch('https://api.example.com/api/init', { credentials: 'include' });
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-natif');
    expect(init.credentials).toBe('omit'); // écrase le include historique

    // Une relative résout vers l'origine WebView ≠ apiOrigin => passthrough
    await window.fetch('/api/init');
    expect(fetchMock.mock.calls[1][1]).toBeUndefined();

    mod.registerAuthTokenProvider(null);
  });
});
