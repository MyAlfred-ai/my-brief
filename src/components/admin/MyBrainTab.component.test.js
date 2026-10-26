/**
 * Onglet « MyBrain » de l'administration.
 *
 * Ce qui se vérifie ici et nulle part ailleurs :
 *   - changer la politique n'envoie NI la clé NI l'adresse : un corps qui
 *     porterait `apiKey: ''` débrancherait myBrain pour toute l'installation ;
 *   - la clé saisie part nettoyée, puis le champ se vide — elle n'est jamais
 *     réaffichée, seulement son aperçu ;
 *   - un refus de myBrain s'affiche en clair, avec le message de myBrain ;
 *   - une politique ouverte sans connexion le dit : rien ne partirait ;
 *   - « Tester la connexion » essaie la saisie AVANT tout enregistrement, dit
 *     ce qui lui manque tant qu'il est grisé, et rend son verdict à côté de
 *     lui.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';

const fetchMyBrainAdminSettings = vi.fn();
const saveMyBrainAdminSettings = vi.fn();
const testMyBrainConnection = vi.fn();

vi.mock('../../services/myBrainApi.js', () => ({
  fetchMyBrainAdminSettings: (...args) => fetchMyBrainAdminSettings(...args),
  saveMyBrainAdminSettings: (...args) => saveMyBrainAdminSettings(...args),
  testMyBrainConnection: (...args) => testMyBrainConnection(...args),
}));

const { default: MyBrainTab } = await import('./MyBrainTab.svelte');

const t = uiTextData.fr.adminMyBrain;
const save = uiTextData.fr.adminUsers.save;

const settings = (over = {}) => ({
  url: 'https://cerveau.example.test',
  hasKey: true,
  keyHint: 'mbk_AbCd…wxyz',
  keyUnreadable: false,
  policy: 'optin',
  configured: true,
  active: true,
  application: 'myBrief',
  droits: ['lire', 'nourrir'],
  publicUrl: 'https://cerveau.example.test',
  verifiedAt: null,
  updatedAt: null,
  updatedBy: 'patron@client.fr',
  ...over,
});

async function renderTab(over = {}) {
  fetchMyBrainAdminSettings.mockResolvedValue({ ok: true, data: { settings: settings(over) } });
  render(MyBrainTab);
  return screen.findByLabelText(t.urlLabel);
}

describe('MyBrainTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('montre la connexion en place : application, droits, aperçu de la clé', async () => {
    await renderTab();
    expect(screen.getByText(t.statusOn)).toBeTruthy();
    expect(
      screen.getByText(/Connecté en tant que « myBrief » — droits : lire, nourrir/),
    ).toBeTruthy();
    expect(screen.getByText('mbk_AbCd…wxyz')).toBeTruthy();
  });

  it("changer la politique n'envoie ni la clé ni l'adresse", async () => {
    await renderTab();
    saveMyBrainAdminSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ policy: 'forced' }) },
    });

    await userEvent.click(screen.getByLabelText(new RegExp(t.policies.forced.label)));
    await userEvent.click(screen.getByRole('button', { name: save }));

    expect(saveMyBrainAdminSettings).toHaveBeenCalledWith({ policy: 'forced' });
    expect(await screen.findByText(t.saved)).toBeTruthy();
  });

  it('la clé part nettoyée avec la nouvelle adresse, puis le champ se vide', async () => {
    const urlField = await renderTab({ url: '', hasKey: false, keyHint: '', configured: false });
    saveMyBrainAdminSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });

    await userEvent.type(urlField, 'https://cerveau.example.test/api/v1');
    const keyField = screen.getByLabelText(t.keyLabel);
    await userEvent.type(keyField, '  mbk_nouvelle  ');
    await userEvent.click(screen.getByRole('button', { name: save }));

    expect(saveMyBrainAdminSettings).toHaveBeenCalledWith({
      url: 'https://cerveau.example.test/api/v1',
      apiKey: 'mbk_nouvelle',
    });
    expect(await screen.findByText(t.saved)).toBeTruthy();
    expect(keyField.value).toBe('');
  });

  it('un refus de myBrain s’affiche en clair, avec son message', async () => {
    await renderTab();
    saveMyBrainAdminSettings.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: 'mybrain_right_missing', upstreamMessage: 'droit manquant' },
    });

    await userEvent.type(screen.getByLabelText(t.keyLabel), 'mbk_autre');
    await userEvent.click(screen.getByRole('button', { name: save }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      `${t.errors.mybrain_right_missing} — droit manquant`,
    );
  });

  it("changer d'hôte demande de recoller la clé : elle ne part jamais ailleurs", async () => {
    const urlField = await renderTab();
    await userEvent.clear(urlField);
    await userEvent.type(urlField, 'https://ailleurs.example');

    expect(screen.getByText(t.keyRequiredHint)).toBeTruthy();
    expect(screen.getByRole('button', { name: save }).disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(t.keyLabel), 'mbk_nouvelle');
    expect(screen.queryByText(t.keyRequiredHint)).toBeNull();
    expect(screen.getByRole('button', { name: save }).disabled).toBe(false);
  });

  it('le test de connexion rend son verdict', async () => {
    await renderTab();
    testMyBrainConnection.mockResolvedValue({
      ok: true,
      data: { ok: true, draft: false, settings: settings() },
    });
    await userEvent.click(screen.getByRole('button', { name: t.test }));
    expect(testMyBrainConnection).toHaveBeenCalledWith({});
    expect(await screen.findByText(t.testOk)).toBeTruthy();
  });

  it('un test refusé le dit à côté du bouton — pas en haut de l’onglet, hors de vue', async () => {
    await renderTab();
    testMyBrainConnection.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: 'mybrain_key_rejected', upstreamMessage: 'clé inconnue' },
    });
    await userEvent.click(screen.getByRole('button', { name: t.test }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(`${t.errors.mybrain_key_rejected} — clé inconnue`);
    const keyField = screen.getByLabelText(t.keyLabel);
    expect(keyField.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('rien d’enregistré : la carte dit ce qui manque, puis teste la saisie avant d’enregistrer', async () => {
    const urlField = await renderTab({
      url: '',
      hasKey: false,
      keyHint: '',
      configured: false,
      active: false,
      application: '',
      droits: [],
    });
    const testButton = screen.getByRole('button', { name: t.test });
    expect(testButton.disabled).toBe(true);
    expect(screen.getByText(t.testNeeds.both)).toBeTruthy();

    await userEvent.type(urlField, 'https://cerveau.example.test');
    expect(screen.getByText(t.testNeeds.key)).toBeTruthy();
    expect(testButton.disabled).toBe(true);

    const keyField = screen.getByLabelText(t.keyLabel);
    await userEvent.type(keyField, 'mbk_nouvelle');
    expect(screen.queryByText(t.testNeeds.key)).toBeNull();
    expect(testButton.disabled).toBe(false);

    testMyBrainConnection.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        draft: true,
        application: 'myBrief',
        droits: ['lire', 'nourrir'],
        settings: settings({ url: '', hasKey: false, configured: false, active: false }),
      },
    });
    await userEvent.click(testButton);

    expect(testMyBrainConnection).toHaveBeenCalledWith({
      url: 'https://cerveau.example.test',
      apiKey: 'mbk_nouvelle',
    });
    expect(saveMyBrainAdminSettings).not.toHaveBeenCalled();
    const verdict = await screen.findByRole('status');
    expect(verdict.textContent).toContain('« myBrief », droits : lire, nourrir');
    expect(verdict.textContent).toContain('Enregistrez pour l’appliquer');
    // La saisie reste en place, prête à être enregistrée.
    expect(keyField.value).toBe('mbk_nouvelle');

    // Retaper la clé périme le verdict : il ne valait que pour la clé testée.
    await userEvent.type(keyField, 'x');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('une politique ouverte sans connexion le dit : rien ne partirait', async () => {
    await renderTab({ url: '', hasKey: false, keyHint: '', configured: false, active: false });
    await userEvent.click(screen.getByLabelText(new RegExp(t.policies.optin.label)));
    expect(screen.getByText(t.policyNotConfigured)).toBeTruthy();
  });
});
