/**
 * Onglet « Mots remplacés » de « Réglages → Pendant la réunion ».
 *
 * Ce qui casserait sans ces tests : un écran qui montrerait la liste du
 * démarrage plutôt que celle en base (elle grandit pendant les réunions) ; un
 * enregistrement qui n'enverrait pas la saisie, ou qui enverrait une ligne en
 * erreur ; un interrupteur d'apprentissage qui ne partirait pas ; une liste
 * enregistrée qui ne rejoindrait pas le correcteur de la réunion en cours.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { uiTextData } from '../../config/uiText.js';

const fetchUserCorrections = vi.fn();
const saveUserCorrections = vi.fn();

vi.mock('../../services/transcriptApi.js', () => ({
  fetchUserCorrections: (...a) => fetchUserCorrections(...a),
  saveUserCorrections: (...a) => saveUserCorrections(...a),
  learnUserCorrections: vi.fn(),
}));

const { correctTranscript, resetUserCorrections, userCorrections } =
  await import('../../stores/transcriptCorrections.js');
const { default: CorrectionsSection } = await import('./CorrectionsSection.svelte');

const t = uiTextData.fr.configCorrections;
const card = { ...uiTextData.fr.adminTranscriptCorrections, ...t.card };

const settings = (over = {}) => ({
  rules: [{ from: ['Durend', 'Durant'], to: 'Durand' }],
  learn: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetUserCorrections();
  fetchUserCorrections.mockResolvedValue({ ok: true, data: { settings: settings() } });
  saveUserCorrections.mockImplementation(async (body) => ({
    ok: true,
    data: { settings: { ...settings(), ...body } },
  }));
});

/** Rendu + attente du chargement initial (onMount asynchrone). */
async function renderSection() {
  render(CorrectionsSection);
  await screen.findByText(t.learnTitle);
}

const saveButton = () => screen.getByRole('button', { name: t.save });

describe('CorrectionsSection', () => {
  it('montre la liste du compte telle qu’elle est en base, et sa portée', async () => {
    await renderSection();
    expect(screen.getByDisplayValue('Durend, Durant')).toBeTruthy();
    expect(screen.getByDisplayValue('Durand')).toBeTruthy();
    expect(screen.getByText(card.scopeTitle)).toBeTruthy();
    expect(screen.getByText('1 / 100')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('enregistre la liste saisie, qui s’applique aussitôt à la réunion en cours', async () => {
    const user = userEvent.setup();
    await renderSection();
    await user.click(screen.getByRole('button', { name: card.add }));
    const froms = screen.getAllByLabelText(card.fromHeader);
    const tos = screen.getAllByLabelText(card.toHeader);
    await user.type(froms[1], 'Market');
    await user.type(tos[1], 'Marquet');
    await user.click(saveButton());

    expect(saveUserCorrections).toHaveBeenCalledWith({
      rules: [
        { from: ['Durend', 'Durant'], to: 'Durand' },
        { from: ['Market'], to: 'Marquet' },
      ],
      learn: true,
    });
    expect(await screen.findByText(t.saved)).toBeTruthy();
    expect(correctTranscript('Market arrive.')).toBe('Marquet arrive.');
  });

  it('couper l’apprentissage part avec l’enregistrement, et l’écran dit ce que ça change', async () => {
    const user = userEvent.setup();
    await renderSection();
    expect(screen.getByText(t.learnScope)).toBeTruthy();
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByText(t.learnOff)).toBeTruthy();
    await user.click(saveButton());
    expect(saveUserCorrections).toHaveBeenCalledWith(expect.objectContaining({ learn: false }));
    expect(get(userCorrections).learn).toBe(false);
  });

  it('une ligne en erreur bloque l’enregistrement', async () => {
    const user = userEvent.setup();
    await renderSection();
    await user.clear(screen.getByDisplayValue('Durand'));
    expect(screen.getByText(card.errors.missingTo)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('« Annuler » revient à la liste enregistrée', async () => {
    const user = userEvent.setup();
    await renderSection();
    await user.click(screen.getByRole('button', { name: `${card.remove} — Remplacement 1` }));
    expect(screen.getByText(card.emptyTitle)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.discardChanges }));
    expect(screen.getByDisplayValue('Durand')).toBeTruthy();
    expect(saveUserCorrections).not.toHaveBeenCalled();
  });

  it('un échec d’enregistrement se dit, et la saisie reste', async () => {
    const user = userEvent.setup();
    saveUserCorrections.mockResolvedValue({ ok: false, status: 0, data: { error: 'network' } });
    await renderSection();
    await user.click(screen.getByRole('checkbox'));
    await user.click(saveButton());
    expect((await screen.findByRole('alert')).textContent).toBe(t.errors.network);
    expect(saveButton().disabled).toBe(false);
  });

  it('les textes existent en anglais aussi', () => {
    const en = uiTextData.en.configCorrections;
    expect(Object.keys(en).sort()).toEqual(Object.keys(t).sort());
    expect(Object.keys(en.card).sort()).toEqual(Object.keys(t.card).sort());
    expect(uiTextData.en.config.correctionsSection).toBeTruthy();
  });
});
