/**
 * Onglet « Authentification » — tableau de bord replié.
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - les pastilles Affiché/Masqué lisent les capacités du SERVEUR, la même
 *     source que l'écran de connexion — pas l'état du formulaire en cours
 *     d'édition : c'est la promesse « ce que voit un utilisateur » ;
 *   - un clic sur une pastille déplie TOUT son mode, un seul à la fois ; un
 *     fournisseur activé que le serveur ne sert pas s'ouvre de lui-même ;
 *   - « Tester » ouvre le VRAI flux dans un nouvel onglet, et reste inerte
 *     tant que le serveur ne sert pas le mode ;
 *   - l'enregistrement porte les réglages des deux modes sans fournisseur ;
 *     « Modifié » et « Annuler » suivent ce qui a changé ;
 *   - plus aucun mode affiché ⇒ le bouton Enregistrer se ferme AVANT le refus
 *     du serveur — la garde du serveur reste l'autorité, celle-ci prévient ;
 *   - la pastille du SSO historique n'existe que là où le déploiement le déclare ;
 *   - carte « Domaines autorisés » : un domaine tapé sans « Ajouter » part avec
 *     l'enregistrement — oublié, il refusait toute première connexion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';
import { fill } from '../../utils/i18nFormat.js';

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
const u = uiTextData.fr.adminUsers;
const names = t.modeNames;

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
  await screen.findByRole('heading', { name: t.loginModesTitle });
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pastille d'un mode : son nom, puis son état et un éventuel « Modifié ». */
function pill(name) {
  const card = screen.getByRole('region', { name: t.loginModesTitle });
  return within(card).getByRole('button', { name: new RegExp(`^${escape(name)}\\b`) });
}
const queryPill = (name) =>
  within(screen.getByRole('region', { name: t.loginModesTitle })).queryByRole('button', {
    name: new RegExp(`^${escape(name)}\\b`),
  });

/** Déplie un mode (sans le replier s'il l'est déjà). */
async function openMode(name) {
  if (pill(name).getAttribute('aria-expanded') !== 'true') await userEvent.click(pill(name));
}

const saveButton = () => screen.getByRole('button', { name: u.save });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

describe('AuthTab — carte « Page de connexion »', () => {
  it('les pastilles reflètent ce que le serveur sert, pas le formulaire', async () => {
    await renderTab({}, { passwordLoginEnabled: true, googleEnabled: false, oidcEnabled: true });

    expect(pill(names.password).textContent).toContain(t.modeShown);
    // Google est coché dans le formulaire (settings.google.enabled) mais le
    // serveur ne le sert pas : la pastille dit Masqué…
    expect(pill(names.google).textContent).toContain(t.modeHidden);
    // … et ce mode, qui attend un geste, est déjà déplié.
    expect(pill(names.google).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText(t.clientId).value).toBe('id-google');
    expect(screen.getByText(fill(t.modesCount, { count: 2, total: 4 }))).toBeTruthy();
  });

  it('tout est replié quand chaque mode activé est servi ; un seul mode déplié à la fois', async () => {
    await renderTab();
    for (const name of [names.password, names.google, names.entra, names.legacy]) {
      expect(pill(name).getAttribute('aria-expanded')).toBe('false');
    }
    expect(screen.queryByLabelText(t.clientId)).toBeNull();

    await userEvent.click(pill(names.google));
    expect(screen.getByLabelText(t.clientId)).toBeTruthy();
    await userEvent.click(pill(names.password));
    expect(screen.queryByLabelText(t.clientId)).toBeNull();
    expect(screen.getByLabelText(t.modePassword)).toBeTruthy();
    await userEvent.click(pill(names.password));
    expect(screen.queryByLabelText(t.modePassword)).toBeNull();
  });

  it('« Tester » ouvre le vrai flux dans un nouvel onglet, et reste inerte sur un mode masqué', async () => {
    await renderTab({}, { googleEnabled: true, entraEnabled: false });

    await openMode(names.google);
    await userEvent.click(screen.getByRole('button', { name: `${t.modeTest} — ${t.googleTitle}` }));
    expect(window.open).toHaveBeenCalledWith('/api/auth/google/start', '_blank', 'noopener');

    await openMode(names.entra);
    const entraTest = screen.getByRole('button', { name: `${t.modeTest} — ${t.entraTitle}` });
    expect(entraTest.disabled).toBe(true);
  });

  it('la pastille du SSO historique n existe que là où le déploiement le déclare', async () => {
    await renderTab({ legacySso: { enabled: true, envEnabled: false } });
    expect(queryPill(names.legacy)).toBeNull();
    expect(screen.getByText(fill(t.modesCount, { count: 2, total: 3 }))).toBeTruthy();
  });

  it('enregistre les deux réglages de modes avec le reste de l onglet', async () => {
    await renderTab();
    saveAuthSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ passwordLogin: { enabled: false, envEnabled: true } }) },
    });
    // Rien n'a changé : rien à enregistrer.
    expect(saveButton().disabled).toBe(true);

    await openMode(names.password);
    await userEvent.click(screen.getByLabelText(t.modePassword));
    expect(pill(names.password).textContent).toContain(t.modeChanged);
    expect(screen.getByText(t.unsavedHint)).toBeTruthy();
    await userEvent.click(saveButton());

    expect(saveAuthSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordLogin: { enabled: false },
        legacySso: { enabled: true },
      }),
    );
    // Les pastilles lisent le serveur : sans relecture elles resteraient figées.
    expect(refreshCapabilities).toHaveBeenCalled();
    expect(pill(names.password).textContent).not.toContain(t.modeChanged);
    expect(await screen.findByText(t.saved)).toBeTruthy();
  });

  it('« Annuler » rend les réglages enregistrés', async () => {
    await renderTab();
    await openMode(names.google);
    await userEvent.type(screen.getByLabelText(t.clientSecret), 'secret-neuf');
    await userEvent.click(screen.getByLabelText(t.googleTitle));
    expect(pill(names.google).textContent).toContain(t.modeChanged);

    await userEvent.click(screen.getByRole('button', { name: t.discardChanges }));

    expect(screen.getByLabelText(t.clientSecret).value).toBe('');
    expect(screen.getByLabelText(t.googleTitle).checked).toBe(true);
    expect(pill(names.google).textContent).not.toContain(t.modeChanged);
    expect(saveButton().disabled).toBe(true);
  });

  it('plus aucun mode affiché : avertit et ferme le bouton Enregistrer', async () => {
    await renderTab({
      google: { enabled: false, clientId: '', hasSecret: false },
      legacySso: { enabled: true, envEnabled: false },
    });

    await openMode(names.password);
    await userEvent.click(screen.getByLabelText(t.modePassword));

    expect(screen.getByText(t.noModeLeft)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(saveAuthSettings).not.toHaveBeenCalled();
  });

  it('Microsoft activé sans secret : déplié d emblée, et dit ce qui manque — côté Microsoft', async () => {
    await renderTab(
      {
        entra: {
          enabled: true,
          clientId: 'id-entra',
          hasSecret: false,
          discoveryUrl: 'https://login.example/v2.0',
        },
      },
      { entraEnabled: false },
    );

    expect(pill(names.entra).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(t.entraCredentialsRequired)).toBeTruthy();
    expect(screen.getByText(t.entraSecretRequiredHint)).toBeTruthy();
  });
});

describe('AuthTab — carte « Domaines autorisés »', () => {
  it('un domaine tapé sans « Ajouter » part avec l enregistrement', async () => {
    await renderTab({ allowedDomains: ['deja.fr'] });
    saveAuthSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ allowedDomains: ['client.fr', 'deja.fr'] }) },
    });

    expect(screen.getByText(t.domainsOne)).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText(t.domainPlaceholder), '@Client.FR');
    await userEvent.click(saveButton());

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
    await userEvent.click(saveButton());

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
