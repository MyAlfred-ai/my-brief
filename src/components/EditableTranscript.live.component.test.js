/**
 * Transcription en direct : édition d'une ligne et coût d'un delta.
 *
 * Ce qui compte ici :
 *  - l'édition (double-clic, Entrée, Échap, sortie du champ) produit le même
 *    événement `edit` qu'avant le passage des lignes en composant ;
 *  - un delta du direct — nouvelle liste, mêmes objets pour les lignes déjà
 *    dites — ne touche PAS les lignes inchangées (c'est le gain mesuré : une
 *    ligne inchangée ne coûte plus rien), et ne remet pas à zéro le champ en
 *    cours d'édition.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';

const EditableTranscript = (await import('./EditableTranscript.svelte')).default;

const line = (text, over = {}) => ({ time: '00:00:01', timestamp: '10:00:01', text, ...over });

function setup(items) {
  const onEdit = vi.fn();
  const utils = render(EditableTranscript, { props: { items } });
  utils.component.$on('edit', (e) => onEdit(e.detail));
  return { ...utils, onEdit };
}

const textOf = (container, i) =>
  container.querySelectorAll('.transcript-item')[i].querySelector('.transcript-text');

describe('EditableTranscript — édition d’une ligne', () => {
  it('double-clic : champ rempli du texte, focalisé, tout sélectionné', async () => {
    const { container } = setup([line('Bonjour à tous.')]);
    await fireEvent.dblClick(textOf(container, 0));
    const field = container.querySelector('textarea');
    expect(field.value).toBe('Bonjour à tous.');
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'Bonjour à tous.'.length]);
  });

  it('Entrée valide (texte rogné) ; Maj+Entrée ne valide pas', async () => {
    const { container, onEdit } = setup([line('Bonjour.'), line('On commence.')]);
    await fireEvent.dblClick(textOf(container, 1));
    const field = container.querySelector('textarea');
    field.value = '  On démarre.  ';
    await fireEvent.input(field);
    await fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    expect(onEdit).not.toHaveBeenCalled();
    await fireEvent.keyDown(field, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledWith({ index: 1, text: 'On démarre.' });
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('Échap annule ; texte vide ou inchangé : aucun événement', async () => {
    const { container, onEdit } = setup([line('Bonjour.')]);
    await fireEvent.dblClick(textOf(container, 0));
    let field = container.querySelector('textarea');
    field.value = 'Autre chose';
    await fireEvent.keyDown(field, { key: 'Escape' });
    expect(container.querySelector('textarea')).toBeNull();

    await fireEvent.dblClick(textOf(container, 0));
    field = container.querySelector('textarea');
    field.value = '   ';
    await fireEvent.keyDown(field, { key: 'Enter' });
    await fireEvent.dblClick(textOf(container, 0));
    await fireEvent.keyDown(container.querySelector('textarea'), { key: 'Enter' });
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('quitter le champ valide', async () => {
    const { container, onEdit } = setup([line('Bonjour.')]);
    await fireEvent.dblClick(textOf(container, 0));
    const field = container.querySelector('textarea');
    field.value = 'Bonsoir.';
    await fireEvent.input(field);
    await fireEvent.blur(field);
    expect(onEdit).toHaveBeenCalledWith({ index: 0, text: 'Bonsoir.' });
  });

  it('la ligne en cours (isDelta) ne s’édite pas', async () => {
    const { container } = setup([line('Bonjour', { isDelta: true })]);
    await fireEvent.dblClick(textOf(container, 0));
    expect(container.querySelector('textarea')).toBeNull();
  });
});

describe('EditableTranscript — un delta du direct', () => {
  it('ne touche pas les lignes inchangées', async () => {
    const first = line('Bonjour à tous.');
    const live = line('On', { isDelta: true });
    const { container, component } = setup([first, live]);
    // Témoin : la boucle d'avant rebasculait la classe `transcript-delta` de
    // CHAQUE ligne à chaque delta (classList.toggle, sans cache) — elle
    // retirait ce marqueur posé à la main. Une ligne qui n'est plus touchée
    // le garde.
    const row = container.querySelectorAll('.transcript-item')[0];
    row.classList.add('transcript-delta');

    await component.$set({ items: [first, { ...live, text: 'On commence' }] });

    expect(container.querySelectorAll('.transcript-item')[0]).toBe(row);
    expect(row.classList.contains('transcript-delta')).toBe(true);
    expect(textOf(container, 1).textContent).toBe('On commence');
  });

  it('ne remet pas à zéro le champ en cours d’édition — même si la ligne éditée est recopiée', async () => {
    const first = line('Bonjour à tous.');
    const live = line('On', { isDelta: true });
    const { container, component, onEdit } = setup([first, live]);
    await fireEvent.dblClick(textOf(container, 0));
    const field = container.querySelector('textarea');
    field.value = 'Bonjour à toutes.';
    await fireEvent.input(field);

    await component.$set({ items: [first, { ...live, text: 'On commence' }] });
    // Copie de la ligne éditée (relecture, nom de voix) pendant la frappe.
    await component.$set({ items: [{ ...first }, { ...live, text: 'On commence là' }] });

    expect(container.querySelector('textarea')).toBe(field);
    expect(field.value).toBe('Bonjour à toutes.');
    await fireEvent.keyDown(field, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledWith({ index: 0, text: 'Bonjour à toutes.' });
  });
});
