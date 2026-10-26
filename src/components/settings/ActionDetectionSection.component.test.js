/**
 * Section « Détection d'actions » de « Ma configuration ».
 *
 * Ce qui casserait sans ces tests : un enregistrement qui n'enverrait pas la
 * saisie (l'écran annoncerait « Enregistré » sans que la détection change) ; un
 * rythme enregistré qui ne rejoindrait pas le store, alors que c'est le
 * NAVIGATEUR qui l'applique — une réunion en cours garderait l'ancien jusqu'au
 * rechargement ; un banc d'essai qui testerait les valeurs en base plutôt que
 * celles affichées (il validerait autre chose que ce qu'on lit à l'écran) ; et
 * un résultat d'essai qui resterait présenté comme valable après un changement
 * de réglage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';

const fetchDetectionSettings = vi.fn();
const saveDetectionSettings = vi.fn();
const testDetection = vi.fn();

vi.mock('../../services/actionsApi.js', () => ({
  fetchDetectionSettings: (...a) => fetchDetectionSettings(...a),
  saveDetectionSettings: (...a) => saveDetectionSettings(...a),
  testDetection: (...a) => testDetection(...a),
}));

const { actionDetection, resetActionDetection } = await import('../../stores/actionDetection.js');
const { default: ActionDetectionSection } = await import('./ActionDetectionSection.svelte');

const t = uiTextData.fr.configActionDetection;

const settings = (over = {}) => ({
  enabled: true,
  sensitivity: 'balanced',
  triggerWords: ['action'],
  allowUpdates: true,
  windowSize: 8,
  minSentences: 1,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetActionDetection();
  fetchDetectionSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });
  saveDetectionSettings.mockResolvedValue({ ok: true, data: { settings: settings() } });
  testDetection.mockResolvedValue({ ok: true, data: { actions: [], prompt: 'CONSIGNE' } });
});

/** Rendu + attente du chargement initial (onMount asynchrone). */
async function renderSection() {
  render(ActionDetectionSection);
  await screen.findByLabelText(t.triggerWordsLabel);
}

describe('ActionDetectionSection', () => {
  it('affiche les réglages du compte', async () => {
    fetchDetectionSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ triggerWords: ['action', 'à faire'], windowSize: 12 }) },
    });
    await renderSection();

    expect(screen.getByLabelText(t.triggerWordsLabel).value).toBe('action, à faire');
    expect(screen.getByLabelText(t.windowLabel).value).toBe('12');
  });

  it('n’enregistre qu’après modification, et envoie bien la saisie', async () => {
    await renderSection();
    const save = screen.getByRole('button', { name: t.save });
    expect(save.disabled).toBe(true);

    const words = screen.getByLabelText(t.triggerWordsLabel);
    await userEvent.clear(words);
    await userEvent.type(words, 'action, chantier');
    expect(save.disabled).toBe(false);

    await userEvent.click(save);
    expect(saveDetectionSettings).toHaveBeenCalledWith(
      expect.objectContaining({ triggerWords: ['action', 'chantier'] }),
    );
  });

  it('pousse le rythme enregistré dans le store qui pilote la réunion', async () => {
    // Sans cela, une réunion en cours garderait l'ancien rythme : c'est le
    // navigateur qui l'applique, pas le serveur.
    saveDetectionSettings.mockResolvedValue({
      ok: true,
      data: { settings: settings({ windowSize: 20, minSentences: 3 }) },
    });
    await renderSection();
    // Curseur : `type()` ne s'applique pas à un `input[type=range]`.
    await fireEvent.input(screen.getByLabelText(t.windowLabel), { target: { value: '20' } });
    await userEvent.click(screen.getByRole('button', { name: t.save }));

    expect(get(actionDetection)).toMatchObject({ windowSize: 20, minSentences: 3 });
  });

  it('avertit quand la détection est coupée', async () => {
    await renderSection();
    expect(screen.queryByText(t.disabledWarning)).toBeNull();

    await userEvent.click(screen.getByLabelText(t.enabledLabel));
    expect(screen.getByText(t.disabledWarning)).toBeTruthy();
  });

  it('le banc d’essai teste les réglages AFFICHÉS, pas ceux en base', async () => {
    await renderSection();
    const words = screen.getByLabelText(t.triggerWordsLabel);
    await userEvent.clear(words);
    await userEvent.type(words, 'chantier');
    await userEvent.type(screen.getByLabelText(t.sampleLabel), 'On relance le client');

    await userEvent.click(screen.getByRole('button', { name: t.testRun }));

    expect(testDetection).toHaveBeenCalledWith({
      content: 'On relance le client',
      // La langue de l'interface, comme en réunion.
      language: 'fr',
      settings: expect.objectContaining({ triggerWords: ['chantier'] }),
    });
    // Un essai ne doit rien enregistrer.
    expect(saveDetectionSettings).not.toHaveBeenCalled();
  });

  it('rend les actions trouvées et la consigne envoyée', async () => {
    testDetection.mockResolvedValue({
      ok: true,
      data: {
        actions: [{ title: 'Relancer INITECH', owner: 'Alex', dueDate: '2026-08-21' }],
        prompt: 'CONSIGNE ENVOYÉE',
      },
    });
    await renderSection();
    await userEvent.type(screen.getByLabelText(t.sampleLabel), 'Action : relancer INITECH');
    await userEvent.click(screen.getByRole('button', { name: t.testRun }));

    expect(await screen.findByText('Relancer INITECH')).toBeTruthy();
    expect(screen.getByText(t.testFound.replace('{n}', '1'))).toBeTruthy();

    // La consigne est repliée par défaut : elle sert au diagnostic, pas à
    // encombrer l'écran.
    expect(screen.queryByText('CONSIGNE ENVOYÉE')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: t.showPrompt }));
    expect(screen.getByText('CONSIGNE ENVOYÉE')).toBeTruthy();
  });

  it('signale un résultat devenu périmé sans l’effacer', async () => {
    await renderSection();
    await userEvent.type(screen.getByLabelText(t.sampleLabel), 'blabla');
    await userEvent.click(screen.getByRole('button', { name: t.testRun }));
    expect(await screen.findByText(t.testNoAction)).toBeTruthy();
    expect(screen.queryByText(t.testStale)).toBeNull();

    await userEvent.click(screen.getByLabelText(t.allowUpdatesLabel));

    expect(screen.getByText(t.testStale)).toBeTruthy();
    // Le résultat reste affiché : il est vrai de ce qui a été testé.
    expect(screen.getByText(t.testNoAction)).toBeTruthy();
  });

  it('affiche l’erreur du serveur, message d’amont compris', async () => {
    testDetection.mockResolvedValue({
      ok: false,
      data: { error: 'detection_test_failed', upstreamMessage: 'quota dépassé' },
    });
    await renderSection();
    await userEvent.type(screen.getByLabelText(t.sampleLabel), 'blabla');
    await userEvent.click(screen.getByRole('button', { name: t.testRun }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.errors.detection_test_failed);
    expect(alert.textContent).toContain('quota dépassé');
  });
});
