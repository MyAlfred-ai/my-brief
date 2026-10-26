/**
 * « Votre résumé est prêt » — la fenêtre qui suit le premier résumé
 * (components/AfterSummaryDialog.svelte).
 *
 * Ce qui compte ici :
 *   - rien ne part au clic sur une carte : on choisit, le bouton NOMME ce qui
 *     va se passer, et c'est lui qui lance ;
 *   - le tag passe AVANT le mail et le dépôt (le serveur relit le tag pour
 *     choisir destinataires et dossier) — et s'il échoue, rien d'autre ne part ;
 *   - destinataires et dossier annoncés suivent le tag CHOISI ;
 *   - une adresse ajoutée est ENREGISTRÉE (jamais passée à l'envoi), dans la
 *     liste du tag — même s'il n'en avait pas ;
 *   - « Ne plus me proposer » s'enregistre sur le compte.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';

const tagsApi = {
  setMeetingTag: vi.fn(),
  saveTag: vi.fn(),
  fetchTags: vi.fn(),
  deleteTag: vi.fn(),
};
vi.mock('../services/tagsApi.js', () => ({
  setMeetingTag: (...a) => tagsApi.setMeetingTag(...a),
  saveTag: (...a) => tagsApi.saveTag(...a),
  fetchTags: (...a) => tagsApi.fetchTags(...a),
  deleteTag: (...a) => tagsApi.deleteTag(...a),
}));
const actionsApi = { saveActionSettings: vi.fn(), fetchActionSettings: vi.fn() };
vi.mock('../services/actionsApi.js', () => ({
  saveActionSettings: (...a) => actionsApi.saveActionSettings(...a),
  fetchActionSettings: (...a) => actionsApi.fetchActionSettings(...a),
}));
vi.mock('../services/connectApi.js', () => ({ fetchConnectStatus: vi.fn() }));

const AfterSummaryDialog = (await import('./AfterSummaryDialog.svelte')).default;
const { tags, tagColors } = await import('../stores/tags.js');
const { historyItems } = await import('../stores/history.js');
const { auth } = await import('../stores/auth.js');
const { applyActionSettings, resetActionSettings, actionSettings } =
  await import('../stores/actionSettings.js');
const { afterSummaryRequest } = await import('../stores/afterSummary.js');
const { toasts } = await import('../stores/toasts.js');

const ACME = { id: 't-acme', label: 'Client Acme', color: 'red' };
const BETA = { id: 't-beta', label: 'Projet Beta', color: 'blue' };

const SETTINGS = {
  mail: {
    recipients: ['equipe@moi.fr'],
    tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com', 'compta@acme.com'] }],
  },
  storage: {
    folder: 'CR',
    driveId: '',
    driveName: '',
    requireApproval: false,
    tagSubfolders: false,
    tagFolders: [{ tagId: 't-acme', folder: 'Clients/Acme', driveId: '', driveName: '' }],
  },
  naming: { filenameTemplate: '' },
  afterSummary: { offer: true },
};

function setCapabilities(actions) {
  auth.update((state) => ({
    ...state,
    user: { email: 'moi@moi.fr', name: 'Moi' },
    capabilities: { ...state.capabilities, actions },
  }));
}

/** Le serveur rend les réglages complets après un enregistrement partiel. */
function echo(patch) {
  const current = get(actionSettings).settings;
  const settings = {
    ...current,
    mail: { ...current.mail, ...(patch.mail || {}) },
    afterSummary: { ...current.afterSummary, ...(patch.afterSummary || {}) },
  };
  return { ok: true, status: 200, data: { settings, limits: { maxRecipients: 10 } } };
}

function renderDialog({ meeting = { meetingId: 'm-1', title: 'Point hebdo', tagId: null } } = {}) {
  historyItems.set([meeting]);
  const calls = [];
  const onEmail = vi.fn(async () => calls.push('email'));
  const onStore = vi.fn(async () => calls.push('storage'));
  tagsApi.setMeetingTag.mockImplementation(async () => {
    calls.push('tag');
    return { ok: true, status: 200, data: {} };
  });
  const result = render(AfterSummaryDialog, {
    props: { meetingId: meeting.meetingId, onEmail, onStore },
  });
  afterSummaryRequest.set({ meetingId: meeting.meetingId });
  return { ...result, onEmail, onStore, calls };
}

const dialog = () => screen.getByRole('dialog');
const primary = () => dialog().querySelector('.asd-btn-primary');
const card = (name) => within(dialog()).getByRole('button', { name: new RegExp(name) });

beforeEach(() => {
  vi.clearAllMocks();
  toasts.set([]);
  afterSummaryRequest.set(null);
  resetActionSettings();
  tagColors.set(['red', 'blue', 'green']);
  tags.set([ACME, BETA]);
  applyActionSettings({ settings: SETTINGS, limits: { maxRecipients: 10 } });
  setCapabilities({
    summary: { email: true, storage: true, download: true },
    emailAvailable: true,
    connections: { provider: 'google' },
  });
  actionsApi.saveActionSettings.mockImplementation(async (patch) => echo(patch));
});

describe('AfterSummaryDialog — ouverture', () => {
  it('ne s’affiche que pour la réunion demandée', async () => {
    renderDialog();
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Votre résumé est prêt')).toBeTruthy();
    expect(screen.getByText('Point hebdo')).toBeTruthy();
  });

  it('une autre réunion affichée : la proposition tombe, et ne revient pas', async () => {
    const { rerender } = renderDialog();
    await screen.findByRole('dialog');
    await rerender({ meetingId: 'm-2' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(get(afterSummaryRequest)).toBe(null));
    await rerender({ meetingId: 'm-1' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pas de carte pour une action qui échouerait', async () => {
    setCapabilities({ summary: { email: true, storage: true }, emailAvailable: false });
    renderDialog();
    await screen.findByRole('dialog');
    expect(within(dialog()).queryByText('Envoyer par mail')).toBeNull();
    expect(within(dialog()).queryByText(/Entreposer dans/)).toBeNull();
    expect(within(dialog()).getByText('Ranger la réunion')).toBeTruthy();
  });
});

describe('AfterSummaryDialog — choisir, puis lancer', () => {
  it('rien de choisi : le bouton principal est inerte', async () => {
    renderDialog();
    await screen.findByRole('dialog');
    expect(primary().disabled).toBe(true);
    expect(primary().textContent.trim()).toBe('Choisissez une action');
  });

  it('cliquer une carte ne lance rien : le bouton nomme les gestes choisis', async () => {
    const { onEmail } = renderDialog();
    await screen.findByRole('dialog');
    await userEvent.click(card('Envoyer par mail'));
    expect(onEmail).not.toHaveBeenCalled();
    expect(card('Envoyer par mail').getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(within(dialog()).getByRole('radio', { name: /Client Acme/ }));
    await userEvent.click(card('Entreposer dans Google Drive'));
    expect(primary().textContent.trim()).toBe('Ranger, envoyer et entreposer');
  });

  it('le tag choisi change ce qui est annoncé : destinataires et dossier', async () => {
    renderDialog();
    await screen.findByRole('dialog');
    expect(within(dialog()).getByText('Vos destinataires habituels · 1 destinataire')).toBeTruthy();
    expect(within(dialog()).getByText('Votre dossier de dépôt')).toBeTruthy();

    await userEvent.click(within(dialog()).getByRole('radio', { name: /Client Acme/ }));
    expect(
      within(dialog()).getByText('Destinataires du tag Client Acme · 2 destinataires'),
    ).toBeTruthy();
    expect(within(dialog()).getByText('Dossier du tag Client Acme')).toBeTruthy();

    await userEvent.click(card('Entreposer dans Google Drive'));
    expect(within(dialog()).getByText('Clients › Acme')).toBeTruthy();
  });

  it('lance dans l’ordre : tag, PUIS mail, PUIS dépôt — et se referme', async () => {
    const { calls, onEmail, onStore } = renderDialog();
    await screen.findByRole('dialog');
    await userEvent.click(within(dialog()).getByRole('radio', { name: /Client Acme/ }));
    await userEvent.click(card('Envoyer par mail'));
    await userEvent.click(card('Entreposer dans Google Drive'));
    await userEvent.click(primary());

    await waitFor(() => expect(onStore).toHaveBeenCalledWith('summary'));
    expect(onEmail).toHaveBeenCalledWith('summary');
    expect(tagsApi.setMeetingTag).toHaveBeenCalledWith('m-1', 't-acme');
    expect(calls).toEqual(['tag', 'email', 'storage']);
    expect(screen.queryByRole('dialog')).toBeNull();
    const messages = get(toasts).map((t) => t.message);
    expect(messages).toContain('Réunion rangée dans « Client Acme ».');
    // La notification d'attente est retirée une fois tout parti.
    await waitFor(() =>
      expect(get(toasts).find((t) => t.message.startsWith('En cours'))?.exiting ?? true).toBe(true),
    );
  });

  it('le tag échoue : ni mail ni dépôt — ils partiraient à la liste d’avant', async () => {
    const { onEmail, onStore } = renderDialog();
    await screen.findByRole('dialog');
    tagsApi.setMeetingTag.mockResolvedValue({ ok: false, status: 500, data: { error: 'x' } });
    await userEvent.click(within(dialog()).getByRole('radio', { name: /Client Acme/ }));
    await userEvent.click(card('Envoyer par mail'));
    await userEvent.click(primary());

    await waitFor(() =>
      expect(get(toasts).map((t) => t.message)).toContain(
        'Le tag n’a pas pu être posé : rien n’est parti, réessayez depuis « Partager ».',
      ),
    );
    expect(onEmail).not.toHaveBeenCalled();
    expect(onStore).not.toHaveBeenCalled();
  });

  it('réunion déjà rangée : le tag est dit, pas redemandé — et peut changer', async () => {
    const { onEmail } = renderDialog({
      meeting: { meetingId: 'm-1', title: 'Point', tagId: 't-acme' },
    });
    await screen.findByRole('dialog');
    expect(within(dialog()).getByText('Rangée dans')).toBeTruthy();
    expect(within(dialog()).queryByRole('radio')).toBeNull();

    await userEvent.click(card('Envoyer par mail'));
    expect(primary().textContent.trim()).toBe('Envoyer');
    await userEvent.click(primary());
    await waitFor(() => expect(onEmail).toHaveBeenCalled());
    expect(tagsApi.setMeetingTag).not.toHaveBeenCalled();
  });

  it('« Changer » ouvre le choix, « Garder » le referme sur le tag d’origine', async () => {
    renderDialog({ meeting: { meetingId: 'm-1', title: 'Point', tagId: 't-acme' } });
    await screen.findByRole('dialog');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Changer' }));
    await userEvent.click(within(dialog()).getByRole('radio', { name: /Projet Beta/ }));
    expect(primary().textContent.trim()).toBe('Ranger');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Garder' }));
    expect(primary().disabled).toBe(true);
  });

  it('créer un tag sur place, et le voir choisi', async () => {
    tagsApi.saveTag.mockResolvedValue({
      ok: true,
      status: 200,
      data: { tag: { id: 't-new', label: 'Client Gamma', color: 'green' } },
    });
    renderDialog();
    await screen.findByRole('dialog');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Nouveau tag' }));
    await userEvent.type(within(dialog()).getByPlaceholderText('Nom du tag'), 'Client Gamma');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Créer' }));

    // Couleur encore libre dans la palette : ni le rouge ni le bleu, déjà pris.
    expect(tagsApi.saveTag).toHaveBeenCalledWith({ label: 'Client Gamma', color: 'green' });
    await waitFor(() =>
      expect(
        within(dialog())
          .getByRole('radio', { name: /Client Gamma/ })
          .getAttribute('aria-checked'),
      ).toBe('true'),
    );
  });
});

describe('AfterSummaryDialog — ajouter un destinataire', () => {
  it('tag sans liste : la liste du TAG naît de ce qui était montré, plus l’adresse', async () => {
    renderDialog();
    await screen.findByRole('dialog');
    await userEvent.click(within(dialog()).getByRole('radio', { name: /Projet Beta/ }));
    await userEvent.click(card('Envoyer par mail'));
    expect(
      within(dialog()).getByText(
        'Les adresses ajoutées rejoignent les destinataires du tag Projet Beta.',
      ),
    ).toBeTruthy();
    await userEvent.type(within(dialog()).getByLabelText('Ajouter une adresse'), 'PDG@Beta.fr');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Ajouter' }));

    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({
      mail: {
        tagRecipients: [
          { tagId: 't-acme', recipients: ['dg@acme.com', 'compta@acme.com'] },
          { tagId: 't-beta', recipients: ['equipe@moi.fr', 'pdg@beta.fr'] },
        ],
      },
    });
    await waitFor(() => expect(within(dialog()).getByText('pdg@beta.fr')).toBeTruthy());

    // Faute de frappe : retirée, et le tag retombe sur la liste par défaut.
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Retirer pdg@beta.fr' }));
    await waitFor(() =>
      expect(actionsApi.saveActionSettings).toHaveBeenLastCalledWith({
        mail: {
          tagRecipients: [{ tagId: 't-acme', recipients: ['dg@acme.com', 'compta@acme.com'] }],
        },
      }),
    );
  });

  it('sans tag : la liste par défaut, et la note dit ce que ça implique', async () => {
    renderDialog();
    await screen.findByRole('dialog');
    await userEvent.click(card('Envoyer par mail'));
    expect(within(dialog()).getByText(/rejoignent votre liste par défaut/)).toBeTruthy();
    await userEvent.type(within(dialog()).getByLabelText('Ajouter une adresse'), 'x@moi.fr{Enter}');
    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({
      mail: { recipients: ['equipe@moi.fr', 'x@moi.fr'] },
    });
  });

  it('une adresse mal formée est signalée, rien n’est enregistré', async () => {
    renderDialog();
    await screen.findByRole('dialog');
    await userEvent.click(card('Envoyer par mail'));
    await userEvent.type(within(dialog()).getByLabelText('Ajouter une adresse'), 'pas-une-adresse');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Ajouter' }));
    expect(within(dialog()).getByRole('alert').textContent).toBe(
      'Cette adresse ne semble pas valide.',
    );
    expect(actionsApi.saveActionSettings).not.toHaveBeenCalled();
  });

  it('le refus du serveur est dit, adresse nommée', async () => {
    actionsApi.saveActionSettings.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: 'recipient_invalid', rejected: ['x@y.zz'] },
    });
    renderDialog();
    await screen.findByRole('dialog');
    await userEvent.click(card('Envoyer par mail'));
    await userEvent.type(within(dialog()).getByLabelText('Ajouter une adresse'), 'x@y.zz{Enter}');
    await waitFor(() =>
      expect(within(dialog()).getByRole('alert').textContent).toBe('Adresses refusées : x@y.zz'),
    );
  });
});

describe('AfterSummaryDialog — refermer', () => {
  it('« Plus tard » referme sans rien lancer', async () => {
    const { onEmail } = renderDialog();
    await screen.findByRole('dialog');
    await userEvent.click(card('Envoyer par mail'));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Plus tard' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onEmail).not.toHaveBeenCalled();
    expect(actionsApi.saveActionSettings).not.toHaveBeenCalled();
  });

  it('« Ne plus me proposer » s’enregistre sur le compte, et dit où le rallumer', async () => {
    renderDialog();
    await screen.findByRole('dialog');
    await userEvent.click(within(dialog()).getByLabelText('Ne plus me proposer'));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Plus tard' }));
    expect(actionsApi.saveActionSettings).toHaveBeenCalledWith({ afterSummary: { offer: false } });
    await waitFor(() =>
      expect(get(toasts).map((t) => t.message)).toContain(
        'Cette fenêtre ne s’ouvrira plus. Réactivez-la dans Ma configuration, rubrique Actions.',
      ),
    );
  });

  it('Échap referme', async () => {
    renderDialog();
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
