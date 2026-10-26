// @vitest-environment jsdom
/**
 * Branchement du bouton retour : Android seulement, une seule fois, et à la
 * racine l'app passe en arrière-plan — `exitApp` n'est jamais appelé (une
 * réunion en cours doit survivre).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const platform = { isNative: true, nativePlatform: 'android' };
const app = {
  addListener: vi.fn(),
  minimizeApp: vi.fn(async () => {}),
  exitApp: vi.fn(async () => {}),
};

vi.mock('./index.js', () => ({
  get isNative() {
    return platform.isNative;
  },
  get nativePlatform() {
    return platform.nativePlatform;
  },
  nativePlugin: () => app,
}));

async function freshInstall() {
  vi.resetModules();
  const { installBackButton } = await import('./backButton.js');
  return installBackButton;
}

beforeEach(() => {
  vi.clearAllMocks();
  platform.isNative = true;
  platform.nativePlatform = 'android';
  document.body.innerHTML = '';
});

describe('installBackButton', () => {
  it('Android : un écouteur, un seul, même appelé deux fois', async () => {
    const install = await freshInstall();
    install();
    install();
    expect(app.addListener).toHaveBeenCalledTimes(1);
    expect(app.addListener.mock.calls[0][0]).toBe('backButton');
  });

  it('iOS et navigateur : rien — le retour ne leur appartient pas', async () => {
    platform.nativePlatform = 'ios';
    (await freshInstall())();
    platform.isNative = false;
    platform.nativePlatform = 'web';
    (await freshInstall())();
    expect(app.addListener).not.toHaveBeenCalled();
  });

  it('rien d’ouvert : arrière-plan, jamais de sortie', async () => {
    (await freshInstall())();
    const onBack = app.addListener.mock.calls[0][1];
    onBack({ canGoBack: true });
    expect(app.minimizeApp).toHaveBeenCalledTimes(1);
    expect(app.exitApp).not.toHaveBeenCalled();
  });
});
