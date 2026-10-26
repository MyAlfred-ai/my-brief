/**
 * Carte de génération — le Pagimètre n'apparaît que pour un template qui le
 * propose, part de sa position par défaut, et la longueur choisie part avec la
 * génération. Un template sans lui génère exactement comme avant (pages: null)
 * et le dit en une ligne. Les cartes sont des boutons à bascule (un seul
 * pressé), leur pastille suit le réglage, les instructions se déplient à la
 * demande.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';
import TemplatePickerPanel from './TemplatePickerPanel.svelte';
import { buildTemplateOptions } from '../config/templates.js';
import { uiTextData } from '../config/uiText.js';
import { auth } from '../stores/auth.js';

const PM = uiTextData.fr.pageMeter;
const CARD = uiTextData.fr.dockCard;
const GENERATE = uiTextData.fr.buttons.generateArrow;
/** Une heure de réunion : aucun plafond sous 8 pages. */
const LONG_MEETING = Array.from({ length: 400 }, () => ({ text: 'mot '.repeat(25) }));

function setup(props = {}) {
  const onGenerate = vi.fn();
  const utils = render(TemplatePickerPanel, {
    props: {
      templateOptions: buildTemplateOptions([], []),
      currentTemplate: 'standard',
      transcript: LONG_MEETING,
      onGenerate,
      ...props,
    },
  });
  return { ...utils, onGenerate };
}

const cardOf = (label) => screen.getByText(label).closest('button');

describe('TemplatePickerPanel — Pagimètre', () => {
  it('Standard (1 page par défaut) : pastille sur sa carte, curseur sous les templates', () => {
    const { container } = setup();
    expect(cardOf('Standard').querySelector('.tpp-card-meter').textContent).toBe('1 p.');
    expect(cardOf('Réunion de décision').querySelector('.tpp-card-meter')).toBeNull();
    expect(screen.getByRole('slider', { name: PM.sliderAria })).toBeTruthy();
    expect(container.querySelector('.pm-value').textContent).toBe('1 page');
  });

  it('la longueur choisie part avec la génération', async () => {
    const { onGenerate } = setup();
    await fireEvent.input(screen.getByRole('slider'), { target: { value: '7' } }); // 3 pages
    await userEvent.setup().click(screen.getByRole('button', { name: GENERATE }));
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'standard', pages: 3 }),
    );
  });

  it('template sans Pagimètre : pas de curseur, et la génération part comme avant', async () => {
    const { onGenerate } = setup();
    const user = userEvent.setup();
    await user.click(cardOf('Réunion de décision'));
    // Le curseur se replie (transition de 180 ms) avant de quitter le DOM ;
    // suite complète en parallèle, les minuteries de jsdom prennent du retard.
    await waitFor(() => expect(screen.queryByRole('slider')).toBeNull(), { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: GENERATE }));
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'decision', pages: null }),
    );
  });

  it('passer d’un template à l’autre garde le réglage', async () => {
    const { container } = setup();
    const user = userEvent.setup();
    await fireEvent.input(screen.getByRole('slider'), { target: { value: '0' } });
    await user.click(cardOf('Réunion de décision'));
    await user.click(cardOf('Standard'));
    expect(container.querySelector('.pm-value').textContent).toBe('¼ de page');
  });

  it('régénérer une version : le curseur repart de SA longueur', () => {
    const { container } = setup({ currentPages: 5 });
    expect(container.querySelector('.pm-value').textContent).toBe('5 pages');
  });

  it('chaque template part de SA position : celle choisie par l’administration', () => {
    const options = buildTemplateOptions(
      [],
      [{ value: 'comite', labels: { fr: 'Comité', en: 'Board' }, pageMeter: 2.5 }],
    );
    const { container } = setup({ templateOptions: options, currentTemplate: 'comite' });
    expect(cardOf('Comité').querySelector('.tpp-card-meter').textContent).toBe('2,5 p.');
    expect(container.querySelector('.pm-value').textContent).toBe('2,5 pages');
  });

  it('réunion courte : le curseur dit où le résumé s’arrêtera', async () => {
    // ~150 mots dits : la matière ne tient pas une page.
    setup({ transcript: [{ text: 'mot '.repeat(150) }] });
    expect(screen.getByText(PM.capNote.replaceAll('{max}', '¼ de page'))).toBeTruthy();
  });
});

describe('TemplatePickerPanel — lisibilité du choix', () => {
  it('un seul template pressé : le choix passe d’une carte à l’autre', async () => {
    setup();
    expect(cardOf('Standard').getAttribute('aria-pressed')).toBe('true');
    expect(cardOf('Réunion de décision').getAttribute('aria-pressed')).toBe('false');
    await userEvent.setup().click(cardOf('Réunion de décision'));
    expect(cardOf('Standard').getAttribute('aria-pressed')).toBe('false');
    expect(cardOf('Réunion de décision').getAttribute('aria-pressed')).toBe('true');
  });

  it('template sans Pagimètre : une ligne dit pourquoi le curseur manque', async () => {
    setup();
    expect(screen.queryByText(PM.pickerOff)).toBeNull();
    await userEvent.setup().click(cardOf('Réunion de décision'));
    expect(screen.getByText(PM.pickerOff)).toBeTruthy();
  });

  it('la pastille d’une carte suit la longueur réglée', async () => {
    setup();
    await fireEvent.input(screen.getByRole('slider'), { target: { value: '7' } }); // 3 pages
    expect(cardOf('Standard').querySelector('.tpp-card-meter').textContent).toBe('3 p.');
  });

  it('instructions repliées : elles se déplient sur demande et partent avec la génération', async () => {
    const { onGenerate } = setup();
    const user = userEvent.setup();
    expect(screen.queryByRole('textbox')).toBeNull();
    const toggle = screen.getByRole('button', { name: new RegExp(CARD.instructionsLabel) });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    const field = screen.getByRole('textbox', { name: CARD.instructionsLabel });
    await waitFor(() => expect(document.activeElement).toBe(field));
    await user.type(field, 'Insister sur le budget');
    await user.click(screen.getByRole('button', { name: GENERATE }));
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ customPrompt: 'Insister sur le budget' }),
    );
  });

  it('infographie : la case garde son nom complet, même en libellé court', async () => {
    const saved = get(auth);
    auth.update((s) => ({
      ...s,
      user: { ...(s.user || {}), rights: { infographic: true } },
      capabilities: { ...s.capabilities, infographic: { enabled: true } },
    }));
    try {
      const { onGenerate } = setup();
      const box = screen.getByRole('checkbox', { name: CARD.infographicLabel });
      const user = userEvent.setup();
      await user.click(box);
      await user.click(screen.getByRole('button', { name: GENERATE }));
      expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ infographic: true }));
    } finally {
      auth.set(saved);
    }
  });
});
