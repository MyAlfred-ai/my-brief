/**
 * Onglet « Authentification » — carte « Page de connexion ».
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - les badges Affiché/Masqué lisent les capacités du SERVEUR, la même
 *     source que l'écran de connexion — pas l'état du formulaire en cours
 *     d'édition : c'est la promesse « ce que voit un utilisateur » ;
 *   - « Tester » ouvre le VRAI flux dans un nouvel onglet, et reste inerte
 *     tant que le serveur ne sert pas le mode ;
 *   - l'enregistrement porte les réglages des deux modes sans fournisseur ;
 *   - plus aucun mode affiché ⇒ le bouton Enregistrer se ferme AVANT le refus
 *     du serveur — la garde du serveur reste l'autorité, celle-ci prévient ;
 *   - la ligne du SSO historique n'existe que là où le déploiement le déclare ;
 *   - carte « Domaines autorisés » : un domaine tapé sans « Ajouter » part avec
 *     l'enregistrement — oublié, il refusait toute première connexion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';

const fetchAuthSettings = vi.fn();
const saveAuthSettings = vi.fn();
const refreshCapabilities = vi.fn();

vi.mock('../../services/adminUsersApi.js', () => ({
  fetchAuthSettings: (...a) => fetchAuthSettings(...a),
  saveAuthSettings: (...a) => saveAuthSettings(...a),
}));
// Le store `auth` réel (les capacités s'y écrivent directement), seule la
// relecture réseau est remplacée.
vi.mock('../../stores/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  refreshCapabilities: (...a) => refreshCapabilities(...a),
}));

const { default: AuthTab } = await import('./AuthTab.svelte');
const { auth } = await import('../../stores/auth.js');

const t = uiTextData.fr.adminAuth;
const si = uiTextData.fr.signIn;
const u = uiTextData.fr.adminUsers;

const settings = (over = {}) => ({
  google: { enabled: true, clientId: 'id-google', hasSecret: true },
  entra: { enabled: false, clientId: '', hasSecret: false, discoveryUrl: '' },
  passwordLogin: { enabled: true, envEnabled: true },
  legacySso: { enabled: true, envEnabled: true },
  allowedDomains: [],
  updatedAt: null,
  ...over,
});

function setCapabilities(over = {}) {
  auth.update((state) => ({
    ...state,
    capabilities: {
      ...state.capabilities,
      passwordLoginEnabled: true,
      googleEnabled: true,
      entraEnabled: false,
      oidcEnabled: true,
      ...over,
    },
  }));
}

async function renderTab(over = {}, caps = {}) {
  setCapabilities(caps);
  fetchAuthSettings.mockResolvedValue({ ok: true, data: { settings: settings(over) } });
  render(AuthTab);
  await screen.findByText(t.loginModesTitle);
}

/**
 * Ligne d'un mode, repérée par son libellé — celui de la page de connexion.
 * `selector` évite le doublon avec le label lecteur d'écran de l'interrupteur,
 * qui porte le même texte.
 */
function modeRow(name) {
  return screen.getByText(name, { selector: '.at-mode-name' }).closest('li');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

describe('AuthTab — carte « Page de connexion »', () => {
  it('les badges reflètent ce que le serveur sert, pas le formulaire', async () => {
    await renderTab({}, { passwordLoginEnabled: true, googleEnabled: false, oidcEnabled: true });

    expect(within(modeRow(t.modePassword)).getByText(t.modeShown)).toBeTruthy();
    // Google est coché dans le formulaire (settings.google.enabled) mais le
    // serveur ne le sert pas : le badge doit dire Masqué.
    expect(within(modeRow(si.googleButton)).getByText(t.modeHidden)).toBeTruthy();
  });

  it('« Tester » ouvre le vrai flux dans un nouvel onglet, et reste inerte sur un mode masqué', async () => {
    await renderTab({}, { googleEnabled: true, entraEnabled: false });

    await userEvent.click(
      within(modeRow(si.googleButton)).getByRole('button', { name: t.modeTest }),
    );
    expect(window.open).toHaveBeenCalledWith('/api/auth/google/start', '_blank', 'noopener');

    const entraTest = within(modeRow(si.entraButton)).getByRole('button', { name: t.modeTest });
    expect(entraTest.disabled).toBe(true);
  });

  it('la ligne du SSO historique n existe que là où le déploiement le déclare', async () => {
    await renderTab({ legacySso: { enabled: true, envEnabled: false } });
    expect(screen.queryByText(t.modeLegacy)).toBeNull();
  });

  it('enregistre les deux réglages de modes avec le reste de l onglet', async () => {
    await renderTab();
    saveAuthSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ passwordLogin: { enabled: false, envEnabled: true } }) },
    });

    await userEvent.click(screen.getByLabelText(t.modePassword));
    await userEvent.click(screen.getByRole('button', { name: u.save }));

    expect(saveAuthSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordLogin: { enabled: false },
        legacySso: { enabled: true },
      }),
    );
    // Les badges lisent le serveur : sans relecture ils resteraient figés.
    expect(refreshCapabilities).toHaveBeenCalled();
  });

  it('plus aucun mode affiché : avertit et ferme le bouton Enregistrer', async () => {
    await renderTab({
      google: { enabled: false, clientId: '', hasSecret: false },
      legacySso: { enabled: true, envEnabled: false },
    });

    await userEvent.click(screen.getByLabelText(t.modePassword));

    expect(screen.getByText(t.noModeLeft)).toBeTruthy();
    expect(screen.getByRole('button', { name: u.save }).disabled).toBe(true);
    expect(saveAuthSettings).not.toHaveBeenCalled();
  });
});

describe('AuthTab — carte « Domaines autorisés »', () => {
  it('un domaine tapé sans « Ajouter » part avec l enregistrement', async () => {
    await renderTab({ allowedDomains: ['deja.fr'] });
    saveAuthSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ allowedDomains: ['client.fr', 'deja.fr'] }) },
    });

    await userEvent.type(screen.getByPlaceholderText(t.domainPlaceholder), '@Client.FR');
    await userEvent.click(screen.getByRole('button', { name: u.save }));

    expect(saveAuthSettings).toHaveBeenCalledWith(
      expect.objectContaining({ allowedDomains: ['client.fr', 'deja.fr'] }),
    );
    // Rien ne reste en attente : le domaine a rejoint la liste affichée.
    expect(screen.getByPlaceholderText(t.domainPlaceholder).value).toBe('');
    expect(await screen.findByText('@client.fr')).toBeTruthy();
  });

  it('une saisie qui n est pas un domaine reste sous les yeux, hors de l envoi', async () => {
    await renderTab({ allowedDomains: ['deja.fr'] });
    saveAuthSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ allowedDomains: ['deja.fr'] }) },
    });

    await userEvent.type(screen.getByPlaceholderText(t.domainPlaceholder), 'intranet');
    await userEvent.click(screen.getByRole('button', { name: u.save }));

    expect(saveAuthSettings).toHaveBeenCalledWith(
      expect.objectContaining({ allowedDomains: ['deja.fr'] }),
    );
    expect(screen.getByPlaceholderText(t.domainPlaceholder).value).toBe('intranet');
  });

  it('les textes de la carte nomment Google ET Microsoft', async () => {
    await renderTab();
    expect(t.domainsIntro).toContain('Microsoft');
    expect(screen.getByText(t.domainEmpty).textContent).toContain('Microsoft');
    expect(uiTextData.en.adminAuth.domainsIntro).toContain('Microsoft');
    expect(uiTextData.en.adminAuth.domainEmpty).toContain('Microsoft');
  });
});
