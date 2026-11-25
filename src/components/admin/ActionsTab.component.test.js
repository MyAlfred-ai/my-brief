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
 *     l'organisation qu'on vérifie, pas celles de qui clique ;
 *   - depuis le repli en tableau de bord : un bouton inopérant le dit sur sa
 *     TUILE, sans qu'on la déplie ; replier ne perd aucune saisie, et la tuile
 *     dit « Modifié » jusqu'à l'enregistrement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
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

/**
 * Tuile d'un réglage : un bouton qui déplie (aria-expanded). L'ⓘ du panneau
 * déplié porte parfois le même début de nom (« Envoyer par mail »).
 */
function tile(label) {
  const found = screen
    .getAllByRole('button', { name: new RegExp(`^${label}`) })
    .filter((button) => button.hasAttribute('aria-expanded'));
  expect(found).toHaveLength(1);
  return found[0];
}

/** Attend le chargement, puis déplie le réglage d'une tuile. */
async function open(label) {
  await screen.findAllByRole('button', { name: new RegExp(`^${label}`) });
  if (tile(label).getAttribute('aria-expanded') !== 'true') await userEvent.click(tile(label));
}

describe('admin ActionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchActionsSettings.mockResolvedValue({ ok: true, status: 200, data: payload() });
    saveActionsSettings.mockResolvedValue({ ok: true, status: 200, data: payload() });
  });

  it('enregistre le MÊME payload qu’avant la refonte', async () => {
    render(ActionsTab);
    const user = userEvent.setup();
    await open(t.actionEmail);

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
    await open(t.providerCardTitle);
    expect(screen.getByRole('radiogroup', { name: t.providerLabel })).toBeTruthy();
    expect(screen.queryByLabelText(t.sharePointScopeLabel)).toBe(null);
    unmount();

    fetchActionsSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: payload({ provider: 'microsoft' }),
    });
    render(ActionsTab);
    await open(t.providerCardTitle);
    expect(screen.getByLabelText(t.sharePointScopeLabel)).toBeTruthy();
    expect(tile(t.providerCardTitle).textContent).toContain(t.tileSharePointOn);
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
    await open(t.providerCardTitle);

    await user.click(screen.getByLabelText(t.sharePointScopeLabel));
    expect(tile(t.providerCardTitle).textContent).toContain(t.tileSharePointOff);
    expect(tile(t.providerCardTitle).textContent).toContain(t.tileChanged);
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
    // c'est bien la réponse du serveur qui gouverne — dans l'objet du mail
    // comme dans le nom des fichiers.
    await open(t.actionEmail);
    expect(screen.getAllByRole('button', { name: '{{client}}' })).toHaveLength(1);
    await open(t.tileNaming);
    expect(screen.getAllByRole('button', { name: '{{client}}' })).toHaveLength(1);
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
    await screen.findAllByRole('button', { name: new RegExp(`^${t.actionEmail}`) });

    // Dit sur les tuiles, sans rien déplier…
    expect(tile(t.actionEmail).textContent).toContain(t.tileMailBlocked);
    expect(tile(t.actionStorage).textContent).toContain(t.tileStorageBlocked);
    // … et l'aperçu ne garde que « Télécharger ».
    const preview = screen.getByRole('region', { name: t.previewTitle });
    expect(within(preview).queryAllByText(t.previewEmpty)).toHaveLength(0);

    await open(t.actionEmail);
    expect(screen.getByText(t.emailUnavailable)).toBeTruthy();
    await open(t.actionStorage);
    expect(screen.getByText(t.storageNotConfigured, { exact: false })).toBeTruthy();
    // Le chemin vers ce qui manque : le compte relié, d'un clic.
    await userEvent.click(screen.getByRole('button', { name: t.chooseAccount }));
    expect(screen.getByRole('radiogroup', { name: t.providerLabel })).toBeTruthy();
  });

  it('s’ouvre replié : une tuile par bouton, où il apparaît', async () => {
    fetchActionsSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ...payload(),
        settings: {
          ...payload().settings,
          transcription: { email: false, storage: true, download: false },
          summary: { email: true, storage: true, download: false },
        },
      },
    });
    render(ActionsTab);
    await screen.findAllByRole('button', { name: new RegExp(`^${t.actionEmail}`) });

    expect(tile(t.actionEmail).textContent).toContain(t.tileScopeSummary);
    expect(tile(t.actionStorage).textContent).toContain(t.tileScopeBoth);
    expect(tile(t.actionStorage).textContent).toContain('myBrief/CR');
    expect(tile(t.actionDownload).textContent).toContain(t.tileScopeNone);
    expect(tile(t.providerCardTitle).textContent).toContain(t.providerGdrive);
    expect(screen.queryByLabelText(t.maxRecipientsLabel)).toBeNull();
  });

  it('replier ne perd rien : la tuile dit « Modifié », « Annuler » rétablit', async () => {
    render(ActionsTab);
    const user = userEvent.setup();
    await open(t.actionStorage);
    await user.type(screen.getByLabelText(t.folderLabel), '/2026');

    await open(t.actionDownload);
    expect(screen.queryByLabelText(t.folderLabel)).toBeNull();
    expect(tile(t.actionStorage).textContent).toContain(t.tileChanged);
    expect(tile(t.actionStorage).textContent).toContain('myBrief/CR/2026');
    expect(tile(t.actionDownload).textContent).not.toContain(t.tileChanged);

    await user.click(screen.getByRole('button', { name: t.discardChanges }));
    expect(tile(t.actionStorage).textContent).not.toContain(t.tileChanged);
    await open(t.actionStorage);
    expect(screen.getByLabelText(t.folderLabel).value).toBe('myBrief/CR');
  });

  it('teste avec les valeurs de l’organisation', async () => {
    runActionTest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, via: 'gmail', subject: 'CR', subjectSource: 'admin' },
    });
    render(ActionsTab);
    const user = userEvent.setup();
    await open(t.actionEmail);

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
    await open(t.actionStorage);

    await user.click(await screen.findByRole('button', { name: new RegExp(t.testStorage) }));

    expect((await screen.findByRole('status')).textContent).toContain(
      a.errors.storage_not_connected,
    );
  });
});
