/**
 * Onglet « Actions » de « Ma configuration ».
 *
 * Ce que l'écran promet, et qui ne se voit que dans le rendu :
 *   - le PLAFOND est visible et bloquant : la (max+1)-ième adresse ne rentre
 *     pas, et le compteur le dit avant qu'on essaie ;
 *   - le bouton « Tester » AFFICHE son diagnostic, avec la provenance de chaque
 *     valeur. Un test réel dont le résultat n'apparaît pas ne diagnostique rien ;
 *   - une erreur du serveur arrive TRADUITE. Le slug brut (« Le test a échoué :
 *     storage_not_connected ») ne dit pas quel geste faire ;
 *   - le test porte sur les réglages ENREGISTRÉS : avec des modifications en
 *     attente, le bouton enregistre d'abord et le dit dans son libellé ;
 *   - un résultat qui ne parle plus des réglages affichés est marqué comme tel.
 *
 * Ce que l'administration ferme n'apparaît pas : `ceiling` gouverne le rendu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';

const fetchActionSettings = vi.fn();
const saveActionSettings = vi.fn();
const runActionTest = vi.fn();

vi.mock('../../services/actionsApi.js', () => ({
  fetchActionSettings: (...args) => fetchActionSettings(...args),
  saveActionSettings: (...args) => saveActionSettings(...args),
  runActionTest: (...args) => runActionTest(...args),
}));

// Le catalogue de tags est chargé par le composant (loadTags) : on le court-
// circuite par le store, le test n'a pas besoin d'un aller-retour de plus.
vi.mock('../../services/tagsApi.js', () => ({
  fetchTags: vi.fn().mockResolvedValue({ ok: false, status: 0, data: {} }),
  saveTag: vi.fn(),
  deleteTag: vi.fn(),
  setMeetingTag: vi.fn(),
}));

const { default: ActionsSettingsTab } = await import('./ActionsSettingsTab.svelte');
const { resetActionSettings } = await import('../../stores/actionSettings.js');
const { tags, tagColors } = await import('../../stores/tags.js');

const a = uiTextData.fr.configActions;

function settings({
  recipients = [],
  tagRecipients = [],
  ceiling = { email: true, storage: true },
  max = 2,
} = {}) {
  return {
    settings: {
      mail: { recipients, subjectTemplate: '', tagRecipients },
      storage: { folder: '' },
      naming: { filenameTemplate: '' },
    },
    ceiling,
    limits: { maxRecipients: max, templateMax: 200, folderMax: 500 },
    variables: ['titre', 'date', 'type', 'compte'],
    defaults: { subjectTemplate: '', filenameTemplate: '' },
  };
}

/** État de /connect/status. `driveReady` faux = connexion héritée « mail seul ». */
function connectStatus({ connected = true, driveReady = true } = {}) {
  return {
    actionEnabled: { transcription: true, summary: true },
    smtpAvailable: true,
    provider: {
      id: 'google',
      label: 'Google',
      available: true,
      connected,
      account: 'moi@client.fr',
      driveReady,
    },
  };
}

/**
 * Une action = une page (`section`), et le composant les sert toutes les deux.
 * Par défaut on monte celle de l'envoi ; les tests du dépôt le disent.
 */
const mount = (props = {}) =>
  render(ActionsSettingsTab, { connectStatus: connectStatus(), section: 'mail', ...props });
const mountStorage = (props = {}) => mount({ section: 'storage', ...props });

const byName = (label) => screen.getByRole('button', { name: new RegExp(label) });
const findByName = (label) => screen.findByRole('button', { name: new RegExp(label) });

describe('ActionsSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Le store est un singleton de module : brouillon compris, il survit d'un
    // test à l'autre exactement comme il survit à un changement d'onglet.
    resetActionSettings();
    fetchActionSettings.mockResolvedValue({ ok: true, status: 200, data: settings() });
    saveActionSettings.mockResolvedValue({ ok: true, status: 200, data: settings() });
  });

  it('affiche les destinataires enregistrés et le compteur du plafond', async () => {
    fetchActionSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: settings({ recipients: ['compta@client.fr'] }),
    });
    mount();

    expect(await screen.findByText('compta@client.fr')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
  });

  it('bloque au plafond : le champ de saisie devient inactif', async () => {
    fetchActionSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: settings({ recipients: ['a@client.fr', 'b@client.fr'] }),
    });
    mount();

    expect(await screen.findByText('2 / 2')).toBeTruthy();
    expect(screen.getByPlaceholderText(a.recipientPlaceholder).disabled).toBe(true);
  });

  it('refuse une adresse manifestement invalide sans aller-retour', async () => {
    mount();
    const user = userEvent.setup();

    const input = await screen.findByPlaceholderText(a.recipientPlaceholder);
    await user.type(input, 'pas-une-adresse');
    await user.click(byName(a.recipientAdd));

    expect(screen.getByText(a.recipientInvalid)).toBeTruthy();
    expect(saveActionSettings).not.toHaveBeenCalled();
  });

  it('le bouton Tester exécute ET affiche le diagnostic détaillé', async () => {
    runActionTest.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ok: true,
        target: 'email',
        via: 'gmail',
        from: 'moi@client.fr',
        recipients: { to: ['compta@client.fr'], cc: ['moi@client.fr'] },
        recipientsSource: 'user',
      },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await findByName(a.testEmail));

    // Rien d'autre que la cible : les réglages sont déjà enregistrés, le serveur
    // les relit lui-même. Passer les valeurs de l'écran ferait du test un
    // simulacre.
    expect(runActionTest).toHaveBeenCalledWith({ target: 'email' });
    const result = await screen.findByRole('status');
    expect(result.textContent).toContain('gmail');
    expect(result.textContent).toContain('compta@client.fr');
    // La provenance : c'est ce qui dit OÙ corriger si la valeur est mauvaise.
    expect(result.textContent).toContain(a.sourceUser);
  });

  it('traduit un slug d’erreur du serveur au lieu de le montrer tel quel', async () => {
    runActionTest.mockResolvedValue({
      ok: false,
      status: 501,
      data: { error: 'storage_not_connected' },
    });
    mountStorage();
    const user = userEvent.setup();

    await user.click(await findByName(a.testStorage));

    const result = await screen.findByRole('status');
    expect(result.textContent).toContain(a.errors.storage_not_connected);
    expect(result.textContent).not.toContain('storage_not_connected');
  });

  it('dit combien de temps attendre quand le plafond de tests est atteint', async () => {
    runActionTest.mockResolvedValue({
      ok: false,
      status: 429,
      data: { error: 'too_many_requests', retryAfter: 120 },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await findByName(a.testEmail));

    expect((await screen.findByRole('status')).textContent).toContain('2 min');
  });

  it('dit qu’un envoi a été amputé de ses destinataires tiers', async () => {
    runActionTest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, target: 'email', via: 'smtp', degraded: 'smtp_recipients_dropped' },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await findByName(a.testEmail));
    expect((await screen.findByRole('status')).textContent).toContain(
      uiTextData.fr.messages.actionEmailDropped.slice(0, 30),
    );
  });

  it('chaque page ne montre QUE son action', async () => {
    mount();
    expect(await screen.findByText(a.mailCardTitle)).toBeTruthy();
    expect(screen.queryByText(a.storageCardTitle)).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(a.testStorage) })).toBeNull();
  });

  it('n’affiche pas ce que l’administration a fermé', async () => {
    fetchActionSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: settings({ ceiling: { email: false, storage: true } }),
    });
    mountStorage();

    expect(await screen.findByText(a.storageCardTitle)).toBeTruthy();
    expect(screen.queryByText(a.mailCardTitle)).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(a.testEmail) })).toBeNull();
  });

  it('explique le vide quand l’administration a fermé CETTE action', async () => {
    // Sans ce message, l'écran montrait une page quasi nue sans dire pourquoi.
    // Le message ne parle que de l'action affichée : dire « ni l'un ni l'autre »
    // sur la page de l'envoi laisserait croire que le dépôt est fermé aussi.
    fetchActionSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: settings({ ceiling: { email: false, storage: true } }),
    });
    mount();

    expect(await screen.findByText(a.ceilingClosedTitle)).toBeTruthy();
    expect(screen.getByText(a.mailClosedBody)).toBeTruthy();
    // Le nom de fichier reste réglable : il sert aussi au téléchargement, et
    // vaut pour les deux pages.
    expect(screen.getByText(a.filenameCardTitle)).toBeTruthy();
  });

  it('n’active « Enregistrer » qu’après une modification', async () => {
    mountStorage();
    const user = userEvent.setup();

    const save = await findByName(`^${a.save}$`);
    expect(save.disabled).toBe(true);

    await user.type(await screen.findByLabelText(a.folderTitle), 'Clients/Acme');
    expect(save.disabled).toBe(false);
    expect(screen.getByText(a.unsavedHint)).toBeTruthy();
  });

  it('enregistre AVANT de tester quand des modifications sont en attente', async () => {
    // Le test s'exécute sur les valeurs enregistrées : tester sans enregistrer
    // validerait des réglages que l'utilisateur ne voit plus.
    runActionTest.mockResolvedValue({ ok: true, status: 200, data: { ok: true, via: 'gmail' } });
    mountStorage();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(a.folderTitle), 'Clients/Acme');
    expect(byName(a.saveAndTestStorage)).toBeTruthy();

    await user.click(byName(a.saveAndTestStorage));

    expect(saveActionSettings).toHaveBeenCalledTimes(1);
    expect(runActionTest).toHaveBeenCalledTimes(1);
  });

  it('ne teste pas si l’enregistrement échoue', async () => {
    // L'erreur d'enregistrement est ce qu'il faut lire d'abord ; enchaîner le
    // test empilerait un second message par-dessus la vraie cause.
    saveActionSettings.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: 'recipient_invalid', rejected: ['x@y'] },
    });
    mountStorage();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(a.folderTitle), 'Clients/Acme');
    await user.click(byName(a.saveAndTestStorage));

    expect(runActionTest).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('x@y');
  });

  it('marque un résultat de test comme périmé dès que les réglages changent', async () => {
    runActionTest.mockResolvedValue({ ok: true, status: 200, data: { ok: true, via: 'gmail' } });
    mount();
    const user = userEvent.setup();

    await user.click(await findByName(a.testEmail));
    expect((await screen.findByRole('status')).textContent).not.toContain(a.testStale);

    await user.type(screen.getByLabelText(a.subjectLabel), 'X');
    expect(screen.getByRole('status').textContent).toContain(a.testStale);
  });

  it('propose de RECONNECTER un compte relié sans accès au dépôt', async () => {
    // Connexion héritée « Gmail seul » : re-cliquer sur « relier » ne dirait pas
    // que c'est le même geste avec un consentement de plus.
    mountStorage({ connectStatus: connectStatus({ driveReady: false }) });

    expect(await screen.findByText(a.reconnectWhy)).toBeTruthy();
    expect(byName(a.reconnectCta)).toBeTruthy();
  });

  it('propose de RELIER un compte absent', async () => {
    mount({ connectStatus: connectStatus({ connected: false }) });

    expect(await screen.findByText(a.notConnectedBadge)).toBeTruthy();
    expect(byName('Relier mon compte Google')).toBeTruthy();
  });

  // ── Destinataires par tag ──────────────────────────────────────────────────

  const TAG = { id: 't-acme', label: 'Acme', color: 'blue' };

  it('une ligne par tag : sa liste, ou « Liste par défaut »', async () => {
    tags.set([TAG, { id: 't-int', label: 'Interne', color: 'slate' }]);
    tagColors.set(['slate', 'blue']);
    fetchActionSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: settings({ tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com'] }] }),
    });
    mount();

    expect(await screen.findByText('dg@acme.com')).toBeTruthy();
    expect(screen.getByText(a.tagRecipientsDefault)).toBeTruthy();
    // Le texte dit la règle : la liste du tag REMPLACE la liste par défaut.
    expect(screen.getByText(a.tagRecipientsIntro)).toBeTruthy();
  });

  it('la fenêtre pose la liste dans le brouillon, et « Enregistrer » l’envoie avec le reste', async () => {
    tags.set([TAG]);
    tagColors.set(['blue']);
    mount();
    const user = userEvent.setup();

    const save = await findByName(`^${a.save}$`);
    expect(save.disabled).toBe(true);

    await user.click(await findByName(`^${a.tagRecipientsEdit}$`));
    const dialog = screen.getByRole('dialog', { name: a.tagRecipientsDialogTitle });
    expect(dialog.textContent).toContain(a.tagRecipientsDialogHint);
    await user.type(dialog.querySelector('input[type="email"]'), 'dg@acme.com{Enter}');
    await user.click(byName(`^${a.tagRecipientsApply}$`));

    // Rien n'est parti : c'est un brouillon.
    expect(saveActionSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('dg@acme.com')).toBeTruthy();
    expect(save.disabled).toBe(false);

    await user.click(save);
    expect(saveActionSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        mail: expect.objectContaining({
          tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com'] }],
        }),
      }),
    );
  });

  it('un refus du serveur NOMME le tag en cause', async () => {
    tags.set([TAG]);
    tagColors.set(['blue']);
    fetchActionSettings.mockResolvedValue({
      ok: true,
      status: 200,
      data: settings({ tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com'] }] }),
    });
    saveActionSettings.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: 'recipient_invalid', rejected: ['dg@acme.com'], tagId: 't-acme' },
    });
    mount();
    const user = userEvent.setup();

    // Une modification quelconque pour activer « Enregistrer ».
    await user.type(await screen.findByLabelText(a.subjectLabel), 'X');
    await user.click(byName(`^${a.save}$`));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('dg@acme.com');
    expect(alert.textContent).toContain('Acme');
  });
});
