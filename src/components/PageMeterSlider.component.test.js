/**
 * Pagimètre — le curseur. Trois lectures de la même valeur (libellé, feuilles,
 * mots) et, pour une réunion trop courte, ce qui ne sera pas écrit — dit
 * plutôt que promis.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PageMeterSlider from './PageMeterSlider.svelte';
import { uiTextData } from '../config/uiText.js';

const PM = uiTextData.fr.pageMeter;
const PM_EN = uiTextData.en.pageMeter;
const setup = (props = {}) => render(PageMeterSlider, { props: { labels: PM, ...props } });

describe('PageMeterSlider', () => {
  it('1 page : libellé, ≈ 450 mots, 2 min de lecture, une feuille pleine', () => {
    const { container } = setup({ value: 1 });
    expect(container.querySelector('.pm-value').textContent).toBe('1 page');
    expect(screen.getByText('≈ 450 mots')).toBeTruthy();
    expect(screen.getByText('2 min de lecture')).toBeTruthy();
    expect(container.querySelectorAll('.pm-sheet')).toHaveLength(1);
    expect(screen.getByText(PM.extras)).toBeTruthy();
    const range = screen.getByRole('slider', { name: PM.sliderAria });
    expect(range.getAttribute('aria-valuetext')).toBe('1 page');
  });

  it('le curseur parcourt les pas : rang 0 = ¼ de page, dernier = 10 pages', async () => {
    const onChange = vi.fn();
    const { container, component } = setup({ value: 1 });
    component.$on('change', (e) => onChange(e.detail));
    const range = screen.getByRole('slider');
    await fireEvent.input(range, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith(0.25);
    expect(container.querySelector('.pm-value').textContent).toBe('¼ de page');
    expect(screen.getByText('≈ 113 mots')).toBeTruthy();
    await fireEvent.input(range, { target: { value: '14' } });
    expect(onChange).toHaveBeenLastCalledWith(10);
    expect(container.querySelectorAll('.pm-sheet')).toHaveLength(10);
  });

  it('une feuille par page entamée, la dernière remplie au prorata', () => {
    const { container } = setup({ value: 2.5 });
    const sheets = [...container.querySelectorAll('.pm-sheet')];
    expect(sheets).toHaveLength(3);
    expect(sheets.map((s) => s.style.getPropertyValue('--ink'))).toEqual(['1', '1', '0.5']);
  });

  it('½ est le seul repère qui s’efface sur un curseur étroit (téléphone de 320 px)', () => {
    const { container } = setup({ value: 1 });
    const minor = [...container.querySelectorAll('.pm-tick-minor')].map((b) => b.textContent);
    expect(minor).toEqual(['½']);
  });

  it('les repères sautent à leur valeur', async () => {
    const onChange = vi.fn();
    const { component, container } = setup({ value: 1 });
    component.$on('change', (e) => onChange(e.detail));
    const tick = [...container.querySelectorAll('.pm-tick')].find((b) => b.textContent === '5');
    await fireEvent.click(tick);
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('réunion trop courte : la part hors de portée est hachurée et le résumé s’arrêtera avant', () => {
    const { container } = setup({ value: 3, cap: 1.6 });
    // Les mots annoncés sont ceux qui seront ÉCRITS, pas ceux demandés.
    expect(screen.getByText('≈ 720 mots')).toBeTruthy();
    expect(screen.getByText(PM.capNote.replaceAll('{max}', '1,5 page'))).toBeTruthy();
    expect(container.querySelector('.pm-track-cap')).toBeTruthy();
    const sheets = [...container.querySelectorAll('.pm-sheet')];
    expect(sheets.map((s) => s.style.getPropertyValue('--ink'))).toEqual(['1', '0.6', '0']);
    expect(sheets.map((s) => s.style.getPropertyValue('--ghost'))).toEqual(['1', '1', '1']);
  });

  it('plafond au-dessus de la demande : rien de hachuré, rien à dire', () => {
    const { container } = setup({ value: 1, cap: 4 });
    expect(container.querySelector('.pm-note-cap')).toBeNull();
    expect(screen.getByText(PM.extras)).toBeTruthy();
  });

  it('en anglais', () => {
    const { container } = render(PageMeterSlider, {
      props: { labels: PM_EN, lang: 'en', value: 1.5 },
    });
    expect(container.querySelector('.pm-value').textContent).toBe('1.5 pages');
    expect(screen.getByText('≈ 675 words')).toBeTruthy();
  });
});
