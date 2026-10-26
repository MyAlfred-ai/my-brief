/**
 * Fenêtre de navigation dans le stockage — ce qu'elle DIT et ce qu'elle
 * ENREGISTRE, le fournisseur factice étant réduit à ses réponses JSON.
 *
 * Deux choses valaient un test plutôt qu'une relecture :
 *   - la même réponse serveur (`sharedDrivesMissing`) désigne des Drive
 *     partagés chez Google et des bibliothèques SharePoint chez Microsoft : le
 *     texte doit nommer la bonne, sinon un compte Microsoft lit « Mon Drive » ;
 *   - la page suivante d'un niveau S'AJOUTE à la liste — avant, `nextPageToken`
 *     était rendu par l'API et jamais consommé, et un dossier de plus de cent
 *     entrées montrait sa première page comme si c'était tout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const actionsApi = {
  fetchStorageDrives: vi.fn(),
  fetchStorageFolders: vi.fn(),
  fetchStoragePath: vi.fn(),
  createStorageFolder: vi.fn(),
};
vi.mock('../../services/actionsApi.js', () => ({
  fetchStorageDrives: (...a) => actionsApi.fetchStorageDrives(...a),
  fetchStorageFolders: (...a) => actionsApi.fetchStorageFolders(...a),
  fetchStoragePath: (...a) => actionsApi.fetchStoragePath(...a),
  createStorageFolder: (...a) => actionsApi.createStorageFolder(...a),
}));

const DriveFolderPicker = (await import('./DriveFolderPicker.svelte')).default;
const { uiTextData } = await import('../../config/uiText.js');

const texts = uiTextData.fr.configActions;
const ok = (data) => ({ ok: true, status: 200, data });

const ONEDRIVE = { id: 'd-me', name: 'OneDrive', site: '' };
const MARKETING = { id: 'd-mkt', name: 'Documents', site: 'Marketing' };

function drivesPayload({ provider = 'microsoft', drives = [ONEDRIVE], missing = false } = {}) {
  return ok({ provider, multiDrive: true, sharedDrivesMissing: missing, drives });
}

function foldersPayload(names, nextPageToken = '') {
  return ok({
    ok: true,
    folders: names.map((name) => ({ name, cursor: name })),
    nextPageToken,
  });
}

function setup(props = {}) {
  const onSelect = vi.fn();
  render(DriveFolderPicker, { props: { texts, onSelect, onClose: vi.fn(), ...props } });
  return { onSelect };
}

beforeEach(() => {
  vi.clearAllMocks();
  actionsApi.fetchStorageDrives.mockResolvedValue(drivesPayload());
  actionsApi.fetchStorageFolders.mockResolvedValue(foldersPayload(['Clients', 'Archives']));
});

describe('vocabulaire du fournisseur', () => {
  it('nomme les bibliothèques SharePoint quand elles manquent à un compte Microsoft', async () => {
    actionsApi.fetchStorageDrives.mockResolvedValue(
      drivesPayload({ provider: 'microsoft', missing: true }),
    );
    setup();

    expect(await screen.findByText(/bibliothèques SharePoint n’apparaissent pas/)).toBeTruthy();
    expect(screen.queryByText(/Drive partagés/)).toBeNull();
  });

  it('nomme les Drive partagés quand ils manquent à un compte Google', async () => {
    actionsApi.fetchStorageDrives.mockResolvedValue(
      drivesPayload({
        provider: 'google',
        missing: true,
        drives: [{ id: '', name: 'Mon Drive', site: '' }],
      }),
    );
    setup();

    expect(await screen.findByText(/Drive partagés n’apparaissent pas/)).toBeTruthy();
    expect(screen.queryByText(/SharePoint/)).toBeNull();
  });

  it('ne dit rien quand la liste est complète', async () => {
    setup();
    await screen.findByText('Clients');
    expect(screen.queryByText(/n’apparaissent pas/)).toBeNull();
  });

  it('propose le OneDrive PUIS les bibliothèques des sites suivis, site nommé', async () => {
    actionsApi.fetchStorageDrives.mockResolvedValue(
      drivesPayload({ drives: [ONEDRIVE, MARKETING] }),
    );
    setup();

    const select = await screen.findByLabelText(texts.pickerLibrary);
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['OneDrive', 'Marketing / Documents']);
  });
});

describe('logo de la bibliothèque', () => {
  it('SharePoint pour une bibliothèque de site, OneDrive pour le OneDrive', async () => {
    actionsApi.fetchStorageDrives.mockResolvedValue(
      drivesPayload({ drives: [ONEDRIVE, MARKETING] }),
    );
    setup({ initialDriveId: 'd-mkt' });

    await screen.findByText('Clients');
    expect(document.querySelector('.fp-drive [data-kind="sharepoint"]')).toBeTruthy();

    const select = screen.getByLabelText(texts.pickerLibrary);
    await userEvent.selectOptions(select, 'd-me');
    await waitFor(() =>
      expect(document.querySelector('.fp-drive [data-kind="onedrive"]')).toBeTruthy(),
    );
    expect(document.querySelector('[data-kind="sharepoint"]')).toBeNull();
  });

  it('nomme la seule bibliothèque parcourue, avec son logo, quand il n’y a rien à choisir', async () => {
    setup();
    await screen.findByText('Clients');
    expect(screen.getByText('OneDrive')).toBeTruthy();
    expect(document.querySelector('.fp-drive-single [data-kind="onedrive"]')).toBeTruthy();
  });

  it('Google Drive chez Google, Drive partagé compris', async () => {
    actionsApi.fetchStorageDrives.mockResolvedValue(
      drivesPayload({
        provider: 'google',
        drives: [
          { id: '', name: 'Mon Drive', site: '' },
          { id: 'd-team', name: 'Drive Équipe', site: '' },
        ],
      }),
    );
    setup({ initialDriveId: 'd-team' });
    await screen.findByText('Clients');
    expect(document.querySelector('[data-kind="google-drive"]')).toBeTruthy();
  });
});

describe('pagination', () => {
  it('ajoute la page suivante à la liste au lieu de la remplacer', async () => {
    actionsApi.fetchStorageFolders
      .mockResolvedValueOnce(foldersPayload(['A', 'B'], 'https://graph.microsoft.com/v1.0/next'))
      .mockResolvedValueOnce(foldersPayload(['C']));
    setup();

    const more = await screen.findByRole('button', { name: texts.pickerMore });
    await userEvent.click(more);

    await screen.findByText('C');
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    // Le jeton rendu par le serveur repart tel quel — il est opaque ici.
    expect(actionsApi.fetchStorageFolders).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageToken: 'https://graph.microsoft.com/v1.0/next' }),
    );
    // Dernière page : plus rien à afficher de plus.
    expect(screen.queryByRole('button', { name: texts.pickerMore })).toBeNull();
  });

  it('n’offre pas « Afficher plus » quand le niveau tient en une page', async () => {
    setup();
    await screen.findByText('Clients');
    expect(screen.queryByRole('button', { name: texts.pickerMore })).toBeNull();
  });

  it('oublie la page suivante en descendant d’un niveau', async () => {
    actionsApi.fetchStorageFolders
      .mockResolvedValueOnce(foldersPayload(['Clients'], 'https://graph.microsoft.com/v1.0/p2'))
      .mockResolvedValueOnce(foldersPayload(['Acme']));
    setup();

    await screen.findByRole('button', { name: texts.pickerMore });
    await userEvent.click(screen.getByText('Clients'));

    await screen.findByText('Acme');
    expect(screen.queryByRole('button', { name: texts.pickerMore })).toBeNull();
  });
});

describe('sélection', () => {
  it('rend le chemin traversé ET la bibliothèque qui le porte', async () => {
    actionsApi.fetchStorageDrives.mockResolvedValue(
      drivesPayload({ drives: [ONEDRIVE, MARKETING] }),
    );
    actionsApi.fetchStorageFolders
      .mockResolvedValueOnce(foldersPayload(['Clients']))
      .mockResolvedValueOnce(foldersPayload(['Acme']))
      .mockResolvedValueOnce(foldersPayload([]));
    const { onSelect } = setup({ initialDriveId: 'd-mkt' });

    await userEvent.click(await screen.findByText('Clients'));
    await userEvent.click(await screen.findByText('Acme'));
    // Le chemin s'affiche deux fois : fil d'Ariane et sélection du pied.
    await waitFor(() => expect(screen.getAllByText('Clients/Acme')).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: texts.pickerConfirm }));

    expect(onSelect).toHaveBeenCalledWith({
      folder: 'Clients/Acme',
      driveId: 'd-mkt',
      driveName: 'Marketing / Documents',
    });
  });

  it('un résultat de recherche prend son chemin absolu auprès du serveur', async () => {
    actionsApi.fetchStorageFolders
      .mockResolvedValueOnce(foldersPayload(['Clients']))
      // Résultat de recherche : le curseur Graph est déjà un chemin.
      .mockResolvedValueOnce(
        ok({ ok: true, folders: [{ name: 'Acme', cursor: 'Clients/Acme' }], nextPageToken: '' }),
      )
      .mockResolvedValueOnce(foldersPayload([]));
    actionsApi.fetchStoragePath.mockResolvedValue(ok({ ok: true, path: 'Clients/Acme' }));
    const { onSelect } = setup();

    await screen.findByText('Clients');
    await userEvent.type(screen.getByLabelText(texts.pickerSearch), 'Acme{Enter}');
    await userEvent.click(await screen.findByText('Acme'));

    await waitFor(() => expect(screen.getAllByText('Clients/Acme')).toHaveLength(2));
    expect(actionsApi.fetchStoragePath).toHaveBeenCalledWith({
      driveId: 'd-me',
      cursor: 'Clients/Acme',
    });
    await userEvent.click(screen.getByRole('button', { name: texts.pickerConfirm }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ folder: 'Clients/Acme' }));
  });
});
