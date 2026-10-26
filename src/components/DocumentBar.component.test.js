/**
 * Barre des documents d'une réunion terminée.
 *
 * Ce qui compte ici :
 *   - UN sélecteur : « Transcription », puis un segment par version du résumé,
 *     et la croix seulement sur la version affichée, s'il en reste une autre ;
 *   - le bouton de résumé ne double jamais le dock : absent tant que le dock
 *     propose « Résumer → », nommé « Résumer » sans version, « Nouveau résumé »
 *     ensuite, enfoncé quand le choix du template est ouvert ;
 *   - le tag et « Partager » (PostActions) sont là dès qu'un document existe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../config/uiText.js';

const DocumentBar = (await import('./DocumentBar.svelte')).default;
const { tags } = await import('../stores/tags.js');

const SHARE = {
  kind: 'summary',
  available: true,
  content: '<p>Compte rendu</p>',
  meeting: { meetingId: 'm-1', title: 'Point client' },
  toggles: { download: true },
  emailReady: false,
  storageProvider: '',
};

function renderBar(props = {}) {
  const handlers = {
    onShowTranscription: vi.fn(),
    onSelectVersion: vi.fn(),
    onDeleteVersion: vi.fn(),
    onToggleSummary: vi.fn(),
  };
  const result = render(DocumentBar, {
    props: {
      activeTab: 'resume',
      versions: [{ id: 'v1' }, { id: 'v2' }],
      activeVersionId: 'v2',
      meetingId: 'm-1',
      share: SHARE,
      ...handlers,
      ...props,
    },
  });
  return { ...result, ...handlers };
}

beforeEach(() => tags.set([]));

describe('DocumentBar — le sélecteur de document', () => {
  it('un onglet par document, l’affiché marqué ; le clic remonte', async () => {
    const { onSelectVersion, onShowTranscription } = renderBar();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent.trim())).toEqual([
      'Transcription',
      'Résumé 1',
      'Résumé 2',
    ]);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true']);
    await userEvent.click(tabs[1]);
    expect(onSelectVersion).toHaveBeenCalledWith('v1');
    await userEvent.click(tabs[0]);
    expect(onShowTranscription).toHaveBeenCalledTimes(1);
  });

  it('la croix n’existe que sur la version affichée, et s’il en reste une autre', async () => {
    const { onDeleteVersion } = renderBar();
    const closes = screen.getAllByRole('button', { name: /Supprimer Résumé/ });
    expect(closes.map((b) => b.getAttribute('aria-label'))).toEqual(['Supprimer Résumé 2']);
    await userEvent.click(closes[0]);
    expect(onDeleteVersion).toHaveBeenCalledWith('v2');
  });

  it('une seule version : pas de croix', () => {
    renderBar({ versions: [{ id: 'v1' }], activeVersionId: 'v1' });
    expect(screen.queryByRole('button', { name: /Supprimer Résumé/ })).toBeNull();
  });

  it('version en cours de génération : nommée, occupée, sans clic', async () => {
    const { onSelectVersion } = renderBar({
      versions: [{ id: 'v1' }, { id: 'v2', pending: true }],
      activeVersionId: 'v1',
    });
    const pending = screen.getByRole('tab', { name: 'Résumé 2' });
    expect(pending.getAttribute('aria-busy')).toBe('true');
    expect(pending.title).toBe('Résumé 2 — génération en cours…');
    await userEvent.click(pending);
    expect(onSelectVersion).not.toHaveBeenCalled();
  });
});

describe('DocumentBar — « Résumer » / « Nouveau résumé »', () => {
  it('absent tant que le dock propose « Résumer → »', () => {
    renderBar({ summaryInDock: true, versions: [], activeTab: 'transcription' });
    expect(screen.queryByRole('button', { name: /Résumer|Nouveau résumé/ })).toBeNull();
    // Le reste de la barre, lui, est bien là.
    expect(screen.getByRole('tab', { name: 'Transcription' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Partager' })).toBeTruthy();
  });

  it('« Résumer » sans version, « Nouveau résumé » ensuite ; le clic remonte', async () => {
    const { onToggleSummary, unmount } = renderBar({
      versions: [],
      activeTab: 'transcription',
      share: { ...SHARE, kind: 'transcription' },
    });
    const cta = screen.getByRole('button', { name: 'Résumer' });
    expect(cta.title).toBe('Générer le compte rendu de cette réunion');
    await userEvent.click(cta);
    expect(onToggleSummary).toHaveBeenCalledTimes(1);
    unmount();

    renderBar();
    expect(screen.getByRole('button', { name: 'Nouveau résumé' }).title).toBe(
      'Générer une nouvelle version du résumé',
    );
  });

  it('choix du template ouvert : enfoncé, et il dit refermer', () => {
    renderBar({ pickerOpen: true });
    const cta = screen.getByRole('button', { name: 'Nouveau résumé' });
    expect(cta.getAttribute('aria-expanded')).toBe('true');
    expect(cta.title).toBe('Refermer le choix du template');
  });

  it('génération en cours : inactif', () => {
    renderBar({ generating: true });
    expect(screen.getByRole('button', { name: 'Nouveau résumé' }).disabled).toBe(true);
  });

  it('téléphone : « Résumer » même quand une version existe — nommé, jamais une icône seule', () => {
    // « Nouveau résumé » ne tient pas à côté du tag et de « Partager » à 360 px.
    const listeners = new Set();
    const mq = {
      matches: true,
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
    };
    window.matchMedia = vi.fn(() => mq);
    try {
      const { unmount } = renderBar();
      const cta = screen.getByRole('button', { name: 'Résumer' });
      expect(cta.textContent.trim()).toBe('Résumer');
      // Le nom accessible suit le texte affiché, même quand la largeur change.
      mq.matches = false;
      for (const fn of listeners) fn();
      unmount();
    } finally {
      delete window.matchMedia;
    }
  });
});

describe('DocumentBar — tag et « Partager »', () => {
  it('tag, « Partager », puis le bouton de résumé : le geste plein ferme la barre', () => {
    const { container } = renderBar();
    const names = [...container.querySelectorAll('.db-actions button, .db-cta')].map(
      (b) => b.getAttribute('aria-label') || b.textContent.trim(),
    );
    expect(names).toEqual(['Tag de la réunion', 'Partager', 'Nouveau résumé']);
  });

  it('sans réunion en base : pas de tag à poser', () => {
    renderBar({ meetingId: null });
    expect(screen.queryByRole('button', { name: 'Tag de la réunion' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Partager' })).toBeTruthy();
  });

  it('chaque libellé existe en français et en anglais', () => {
    const keys = Object.keys(uiTextData.fr.documentBar);
    expect(Object.keys(uiTextData.en.documentBar)).toEqual(keys);
    for (const key of keys) expect(uiTextData.en.documentBar[key]).toBeTruthy();
  });
});
