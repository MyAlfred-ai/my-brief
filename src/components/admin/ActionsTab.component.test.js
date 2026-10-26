/**
 * Onglet « Actions » de l'administration.
 *
 * Ce que la refonte par action ne doit pas casser, et qui ne se voit que dans le
 * rendu :
 *   - le PAYLOAD d'enregistrement est inchangé. Le schéma ajv du serveur ignore
 *     silencieusement un champ mal placé : l'écran annoncerait « Enregistré »
 *     sans que rien ne bouge ;
 *   - l'aperçu applique les GARDE-FOUS. Un bouton coché mais inopérant (mail
 *     sans relais, dépôt sans fournisseur) ne doit pas y figurer, sinon
 *     l'administrateur croit avoir activé ce qui n'apparaîtra jamais ;
 *   - les variables de gabarit viennent du SERVEUR. Recopiées ici, elles
 *     divergeraient de l'allowlist qui valide à l'enregistrement ;
 *   - le test s'exécute en `scope: 'admin'` — ce sont les valeurs de
 *     l'organisation qu'on vérifie, pas celles de qui clique.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';

const fetchActionsSettings = vi.fn();
const saveActionsSettings = vi.fn();
const runActionTest = vi.fn();
const refreshCapabilities = vi.fn();

vi.mock('../../services/adminUsersApi.js', () => ({
  fetchActionsSettings: (...args) => fetchActionsSettings(...args),
  saveActionsSettings: (...args) => saveActionsSettings(...args),
}));
vi.mock('../../services/actionsApi.js', () => ({
  sendDocumentByEmail: vi.fn(),
  storeDocument: vi.fn(),
  runActionTest: (...args) => runActionTest(...args),
}));
vi.mock('../../stores/auth.js', () => ({
  refreshCapabilities: (...args) => refreshCapabilities(...args),
}));

const { default: ActionsTab } = await import('./ActionsTab.svelte');

const t = uiTextData.fr.adminActions;
const a = uiTextData.fr.configActions;

function payload({
  provider = 'google',
  sharepoint = true,
  emailAvailable = true,
  variables = ['titre', 'date', 'type', 'compte'],
} = {}) {
  return {
    settings: {
      transcription: { email: true, storage: true, download: true },
      summary: { email: true, storage: true, download: true },
      connections: { provider, sharepoint },
      storage: { provider: '', folder: 'myBrief/CR' },
      mail: { allowSmtpExternal: false, maxRecipients: 10, subjectTemplate: '' },
      naming: { filenameTemplate: '' },
      emailAvailable,
    },
    variables,
  };
}

const byName = (label) => screen.getByRole('button', { name: new RegExp(label) });

describe('admin ActionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchActionsSettings.mockResolvedValue({ ok: true, status: 200, data: payload() });
    saveActionsSettings.mockResolvedValue({ ok: true, status: 200, data: payload() });
  });

  it('enregistre le MÊME payload qu’avant la refonte', async () => {
    render(ActionsTab);
    const user = userEvent.setup();

    // Une modification quelconque pour activer le bouton.
    await user.clear(await screen.findByLabelText(t.maxRecipientsLabel));
    await user.type(screen.getByLabelText(t.maxRecipientsLabel), '4');
    await user.click(byName(`^${uiTextData.fr.adminUsers.save}$`));

    expect(saveActionsSettings).toHaveBeenCalledWith({
      transcription: { email: true, storage: true, download: true },
      summary: { email: true, storage: true, download: true },
      connections: { provider: 'google', sharepoint: true },
      storage: { folder: 'myBrief/CR' },
      mail: { allowSmtpExternal: false, maxRecipients: 4, subjectTemplate: '' },
      naming: { filenameTemplate: '' },
    });
    // Les boutons de l'écran principal lisent les capacités : sans ce
    // rafraîchissement, ils resteraient figés jusqu'au rechargement.
    expect(refreshCapabilities).toHaveBeenCalled();
  });

  it('n’offre le réglage SharePoint que chez Microsoft', async () => {
    // Google n'a aucun scope retirable : la case n'aurait rien à gouverner.
    const { unmount } = render(ActionsTab);
    expect(await screen.findByText(t.providerCardTitle)).toBeTruthy();
    expect(screen.queryByLabelText(t.sharePointScopeLabel)).toBe(null);
    unmount();

    fetchActionsSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: payload({ provider: 'microsoft' }),
    });
    render(ActionsTab);
    expect(await screen.findByLabelText(t.sharePointScopeLabel)).toBeTruthy();
  });

  it('enregistre le refus de SharePoint dans `connections`', async () => {
    // Mal placé, le champ serait ignoré SILENCIEUSEMENT par le schéma ajv :
    // l'écran dirait « Enregistré » et la liaison continuerait de demander
    // Sites.ReadWrite.All.
    fetchActionsSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: payload({ provider: 'microsoft' }),
    });
    render(ActionsTab);
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText(t.sharePointScopeLabel));
    await user.click(byName(`^${uiTextData.fr.adminUsers.save}$`));

    expect(saveActionsSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        connections: { provider: 'microsoft', sharepoint: false },
      }),
    );
  });

  it('n’active « Enregistrer » que s’il y a quelque chose à enregistrer', async () => {
    render(ActionsTab);

    const save = await screen.findByRole('button', {
      name: new RegExp(`^${uiTextData.fr.adminUsers.save}$`),
    });
    expect(save.disabled).toBe(true);
  });

  it('rend les variables servies par le serveur, pas une liste recopiée', async () => {
    fetchActionsSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: payload({ variables: ['titre', 'client'] }),
    });
    render(ActionsTab);

    // `client` n'existe nulle part dans le code du composant : s'il s'affiche,
    // c'est bien la réponse du serveur qui gouverne.
    expect((await screen.findAllByRole('button', { name: '{{client}}' })).length).toBe(2);
  });

  it('masque de l’aperçu un bouton activé mais inopérant', async () => {
    // Mail coché sans relais SMTP, dépôt coché sans fournisseur : il ne doit
    // rester que « Télécharger ».
    fetchActionsSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: payload({ provider: '', emailAvailable: false }),
    });
    render(ActionsTab);

    expect(await screen.findByText(t.emailUnavailable)).toBeTruthy();
    expect(screen.getByText(t.storageNotConfigured)).toBeTruthy();
  });

  it('teste avec les valeurs de l’organisation', async () => {
    runActionTest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, via: 'gmail', subject: 'CR', subjectSource: 'admin' },
    });
    render(ActionsTab);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: new RegExp(t.testEmail) }));

    expect(runActionTest).toHaveBeenCalledWith({ target: 'email', scope: 'admin' });
    const result = await screen.findByRole('status');
    expect(result.textContent).toContain(a.sourceAdmin);
  });

  it('traduit un slug d’erreur d’action, que son propre dictionnaire ignore', async () => {
    // `adminUsers.errors` ne connaît aucun slug de la chaîne d'exécution : sans
    // le dictionnaire partagé, l'écran affichait « storage_not_connected » brut.
    runActionTest.mockResolvedValue({
      ok: false,
      status: 501,
      data: { error: 'storage_not_connected' },
    });
    render(ActionsTab);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: new RegExp(t.testStorage) }));

    expect((await screen.findByRole('status')).textContent).toContain(
      a.errors.storage_not_connected,
    );
  });
});
