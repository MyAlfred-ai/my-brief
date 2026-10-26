/**
 * Éditeur de template — la section Pagimètre : proposée ou non, sa position de
 * départ, et ce qui part à l'enregistrement. Standard l'a d'origine, à 1 page ;
 * les autres templates fournis non.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TemplateEditor from './TemplateEditor.svelte';
import { DEFAULT_EDITABLE_TEMPLATES } from '../config/templates.js';
import { uiTextData } from '../config/uiText.js';

const T = uiTextData.fr.adminTemplates;
const PM = uiTextData.fr.pageMeter;

function setup() {
  const api = {
    list: vi.fn(async () => ({ ok: true, status: 200, data: { templates: [] } })),
    save: vi.fn(async () => ({ ok: true, status: 200, data: { ok: true } })),
    remove: vi.fn(),
  };
  const utils = render(TemplateEditor, {
    props: { api, texts: T, lang: 'fr', defaultTemplates: DEFAULT_EDITABLE_TEMPLATES },
  });
  return { ...utils, api };
}

async function open(name) {
  const row = (await screen.findByText(name)).closest('button');
  await userEvent.setup().click(row);
}

describe('TemplateEditor — Pagimètre', () => {
  it('Standard : proposé d’origine, à 1 page — et c’est ce qui s’enregistre', async () => {
    const { api, container } = setup();
    await open('Standard');
    const toggle = screen.getByRole('checkbox', { name: PM.editorToggle });
    expect(toggle.checked).toBe(true);
    expect(screen.getByText(PM.editorHint)).toBeTruthy();
    expect(container.querySelector('.pm-value').textContent).toBe('1 page');
    await userEvent.setup().click(screen.getByRole('button', { name: T.save }));
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'standard', pageMeter: 1 }),
    );
  });

  it('le désactiver enregistre null ; la note dit ce que cela change', async () => {
    const { api } = setup();
    await open('Standard');
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: PM.editorToggle }));
    expect(screen.getByText(PM.editorOff)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: T.save }));
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ pageMeter: null }));
  });

  it('un template sans Pagimètre peut le proposer, à la position choisie', async () => {
    const { api, container } = setup();
    await open('Réunion de décision');
    const user = userEvent.setup();
    const toggle = screen.getByRole('checkbox', { name: PM.editorToggle });
    expect(toggle.checked).toBe(false);
    expect(container.querySelector('.pm-value')).toBeNull();
    await user.click(toggle);
    const section = container.querySelector('.te-meter');
    expect(within(section).getByText(PM.editorDefault)).toBeTruthy();
    await fireEvent.input(within(section).getByRole('slider'), { target: { value: '9' } }); // 5 pages
    await user.click(screen.getByRole('button', { name: T.save }));
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'decision', pageMeter: 5 }),
    );
  });
});
