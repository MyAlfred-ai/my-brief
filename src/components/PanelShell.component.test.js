/**
 * Coquille des panneaux (« Réglages », Administration) : Échap la referme,
 * comme « Fermer ».
 *
 * Ce qui casserait sans ces tests : un Échap tapé pour fermer une fenêtre DU
 * panneau qui emporterait le panneau entier (le défaut d'origine, quand
 * App.svelte portait ce geste), un Échap dans un champ qui jetterait la
 * saisie avec la page, et une administration qui ne se refermerait pas.
 *
 * jsdom ne calcule pas de mise en page : `getClientRects` est remplacé pour
 * que les calques comptent comme visibles (cf. utils/backNavigation.js).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const PanelShell = (await import('./PanelShell.svelte')).default;

const realRects = Element.prototype.getClientRects;

beforeEach(() => {
  Element.prototype.getClientRects = () => [{}];
});
afterEach(() => {
  Element.prototype.getClientRects = realRects;
  document.body.innerHTML = '';
});

function setup() {
  const onClose = vi.fn();
  render(PanelShell, { props: { title: 'Administration', onClose, closeLabel: 'Fermer' } });
  return onClose;
}

describe('PanelShell — Échap', () => {
  it('referme le panneau, comme « Fermer »', async () => {
    const onClose = setup();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ne le referme pas quand une fenêtre est ouverte par-dessus', async () => {
    const onClose = setup();
    const dialog = document.createElement('div');
    dialog.className = 'trd-backdrop';
    document.body.appendChild(dialog);

    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ne le referme pas depuis un champ en cours de saisie', async () => {
    const onClose = setup();
    const field = document.createElement('textarea');
    document.querySelector('.shell-panel').appendChild(field);
    field.focus();

    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('laisse passer un Échap déjà pris par quelqu’un d’autre', () => {
    const onClose = setup();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });
});
