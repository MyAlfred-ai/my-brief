/**
 * Actions post-réunion — un seul bouton « Partager », sur ordinateur comme
 * sur téléphone, et son mini-menu.
 *
 * Ce qui compte ici :
 *   - une entrée n'existe que si l'action peut aboutir (interrupteur de
 *     l'administration ET moyen d'envoi / compte relié) ;
 *   - « Partager » ouvre TOUJOURS le menu ; chaque entrée dit où part le
 *     document — le tag de la réunion, ou vos réglages ;
 *   - « Rédiger dans ma messagerie » ouvre un mailto: aux destinataires
 *     qu'aurait choisis l'envoi automatique, document dans le corps — marquée
 *     « téléphone » (le CSS la masque sur ordinateur), et absente si
 *     l'administration a fermé l'envoi par mail ;
 *   - l'action en cours se voit et verrouille le bouton.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../config/uiText.js';

const PostActions = (await import('./PostActions.svelte')).default;
const { tags } = await import('../stores/tags.js');
const { applyActionSettings, resetActionSettings } = await import('../stores/actionSettings.js');

const ALL = { email: true, storage: true, download: true };
const MEETING = { meetingId: 'm-1', title: 'Point client Dupont', tagId: 't-dupont' };

function renderActions(props = {}) {
  const handlers = {
    onEmail: vi.fn(),
    onStore: vi.fn(),
    onDownload: vi.fn(),
    openUrl: vi.fn(),
  };
  const result = render(PostActions, {
    props: {
      kind: 'summary',
      available: true,
      content: '<h1>Compte rendu</h1><ul><li><p>Devis à envoyer</p></li></ul>',
      meeting: MEETING,
      toggles: ALL,
      emailReady: true,
      storageProvider: 'google',
      ...handlers,
      ...props,
    },
  });
  return { ...result, ...handlers };
}

const shareButton = (container) => container.querySelector('.pa-share');

async function openMenu(container) {
  await userEvent.click(shareButton(container));
  return screen.getByRole('menu');
}

beforeEach(() => {
  resetActionSettings();
  tags.set([{ id: 't-dupont', label: 'Client Dupont', color: 'slate' }]);
  applyActionSettings({
    settings: {
      mail: {
        recipients: ['equipe@exemple.fr'],
        tagRecipients: [
          { tagId: 't-dupont', recipients: ['dupont@exemple.fr', 'chef@exemple.fr'] },
        ],
      },
      storage: { folder: 'CR', tagFolders: [{ tagId: 't-dupont', folder: 'Clients/Dupont' }] },
      naming: { filenameTemplate: '' },
    },
  });
});

describe('PostActions — un seul « Partager », partout', () => {
  it('pas d’icônes : le bouton ouvre le menu, où chaque action est nommée', async () => {
    const { container, onEmail } = renderActions();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    const menu = await openMenu(container);
    await userEvent.click(within(menu).getByText('Envoyer via le tag'));
    expect(onEmail).toHaveBeenCalledWith('summary');
  });

  it('« Rédiger dans ma messagerie » est marquée « téléphone » : le CSS la masque sur ordinateur', async () => {
    const { container } = renderActions();
    const menu = await openMenu(container);
    const mobileOnly = [...menu.querySelectorAll('.pa-item-mobile')].map(
      (item) => item.querySelector('.pa-item-label').textContent,
    );
    expect(mobileOnly).toEqual(['Rédiger dans ma messagerie']);
  });

  it('document absent : rien', () => {
    const { container } = renderActions({ available: false });
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('PostActions — le mini-menu', () => {
  it('« Partager » ouvre le mini-menu : via le tag, rédiger, télécharger', async () => {
    const { container } = renderActions();
    expect(shareButton(container).textContent).toContain('Partager');
    const menu = await openMenu(container);
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.querySelector('.pa-item-label').textContent);
    expect(labels).toEqual([
      'Envoyer via le tag',
      'Entreposer via le tag',
      'Rédiger dans ma messagerie',
      'Télécharger le PDF',
    ]);
    // Le sous-titre nomme le tag : on sait OÙ part le document.
    expect(menu.textContent).toContain('Client Dupont · 2 destinataires');
    expect(menu.textContent).toContain('Client Dupont · Google Drive');
  });

  it('sans règle du tag : vos réglages, dits comme tels', async () => {
    const { container } = renderActions({ meeting: { ...MEETING, tagId: null } });
    const menu = await openMenu(container);
    expect(within(menu).getByText('Envoyer par mail')).toBeTruthy();
    expect(within(menu).getByText('Vos destinataires habituels · 1 destinataire')).toBeTruthy();
    expect(within(menu).getByText('Entreposer dans Google Drive')).toBeTruthy();
  });

  it('« Rédiger dans ma messagerie » : mailto aux destinataires du tag, résumé en texte', async () => {
    const { container, openUrl } = renderActions();
    const menu = await openMenu(container);
    await userEvent.click(within(menu).getByText('Rédiger dans ma messagerie'));

    expect(openUrl).toHaveBeenCalledTimes(1);
    const url = openUrl.mock.calls[0][0];
    const [to, query] = url.slice('mailto:'.length).split('?');
    expect(to).toBe('dupont@exemple.fr,chef@exemple.fr');
    const params = new URLSearchParams(query.replace(/\+/g, '%2B'));
    expect(params.get('subject')).toBe('Résumé — Point client Dupont');
    expect(params.get('body')).toBe('Compte rendu\r\n\r\n• Devis à envoyer');
    // Le menu se referme dès le choix.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('gabarit d’objet de l’organisation : le brouillon le suit, comme l’envoi automatique', async () => {
    applyActionSettings({
      settings: { mail: { recipients: ['equipe@exemple.fr'] } },
      defaults: { subjectTemplate: '[CR] {{type}} — {{titre}}' },
    });
    const { container, openUrl } = renderActions({ kind: 'transcription', content: 'Bonjour.' });
    const menu = await openMenu(container);
    await userEvent.click(within(menu).getByText('Rédiger dans ma messagerie'));

    const query = openUrl.mock.calls[0][0].split('?')[1];
    const params = new URLSearchParams(query.replace(/\+/g, '%2B'));
    expect(params.get('subject')).toBe('[CR] Transcription — Point client Dupont');
  });

  it('sans moyen d’envoi du serveur, « Rédiger » reste : c’est la messagerie du téléphone qui envoie', async () => {
    const { container } = renderActions({ emailReady: false, storageProvider: '' });
    const menu = await openMenu(container);
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(labels.some((l) => l.includes('Rédiger dans ma messagerie'))).toBe(true);
    expect(labels.some((l) => l.includes('Envoyer'))).toBe(false);
  });

  it('envoi par mail fermé par l’administration : pas de « Rédiger » non plus', async () => {
    const { container } = renderActions({ toggles: { storage: true, download: true } });
    const menu = await openMenu(container);
    expect(within(menu).queryByText('Rédiger dans ma messagerie')).toBeNull();
  });

  it('une seule action : « Partager » ouvre quand même le menu', async () => {
    const { container, onDownload } = renderActions({ toggles: { download: true } });
    const menu = await openMenu(container);
    await userEvent.click(within(menu).getByText('Télécharger le PDF'));
    expect(onDownload).toHaveBeenCalledWith('summary');
  });

  it('action en cours : le bouton dit laquelle, et se verrouille', () => {
    const { container } = renderActions({ busy: 'email' });
    const share = shareButton(container);
    expect(share.textContent).toContain('Envoi…');
    expect(share.disabled).toBe(true);
  });

  it('Échap, ou un toucher ailleurs, referme le menu', async () => {
    const { container } = renderActions();
    await openMenu(container);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    await openMenu(container);
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('chaque libellé existe en français et en anglais', () => {
    const keys = Object.keys(uiTextData.fr.postActions);
    expect(Object.keys(uiTextData.en.postActions)).toEqual(keys);
    for (const key of keys) expect(uiTextData.en.postActions[key]).toBeTruthy();
  });
});
