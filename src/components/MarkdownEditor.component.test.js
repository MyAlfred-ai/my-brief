/**
 * Éditeur de résumé — barre d'outils de mise en forme.
 *
 * Ce qui compte ici : chaque bouton applique bien sa commande TipTap au
 * document (gras, titres, listes, lien, gomme), les états actifs suivent la
 * sélection (aria-pressed), le lien exige une sélection, et la sortie reste
 * dans la forme « donnée » (`<p><br></p>` pour les sauts de ligne — contrat
 * mail/PDF).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';

// jsdom n'implémente pas la géométrie des Range : ProseMirror l'appelle après
// chaque `focus()`/`scrollIntoView` (scrollToSelection → coordsAtPos). Un rect
// vide suffit — personne ne mesure ici.
const zeroRect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
for (const proto of [Range.prototype, Element.prototype]) {
  if (!proto.getClientRects) proto.getClientRects = () => [];
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = () => ({ ...zeroRect });
}

const MarkdownEditor = (await import('./MarkdownEditor.svelte')).default;

/** Monte l'éditeur et attend l'instance TipTap (créée dans onMount). */
async function mountEditor(props = {}) {
  const utils = render(MarkdownEditor, { props });
  await waitFor(() => {
    if (!utils.component.editorRef) throw new Error('éditeur pas prêt');
  });
  return { ...utils, editor: utils.component.editorRef };
}

describe('MarkdownEditor — barre d’outils', () => {
  it('affiche tous les boutons de mise en forme', async () => {
    await mountEditor();
    for (const name of [
      'Gras',
      'Italique',
      'Souligné',
      'Titre',
      'Sous-titre',
      'Liste à puces',
      'Liste numérotée',
      'Lien hypertexte',
      'Effacer la mise en forme',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('utilise les libellés i18n fournis en prop', async () => {
    await mountEditor({ labels: { bold: 'Bold', clearFormatting: 'Clear formatting' } });
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear formatting' })).toBeTruthy();
  });

  it('Gras applique <strong> à la sélection et le bouton passe actif', async () => {
    const { editor } = await mountEditor({ html: '<p>bonjour</p>' });
    editor.commands.selectAll();
    await tick();

    await userEvent.click(screen.getByRole('button', { name: 'Gras' }));

    expect(editor.getHTML()).toContain('<strong>bonjour</strong>');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Gras' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
    });
  });

  // NB : le StarterKit v3 inclut `trailingNode` — un <p></p> de saisie apparaît
  // après un titre/liste en fin de document. Les assertions tolèrent ce nœud.
  it('Titre bascule paragraphe → h2, re-clic → retour au normal', async () => {
    const { editor } = await mountEditor({ html: '<p>section</p>' });
    const titre = screen.getByRole('button', { name: 'Titre' });

    editor.commands.selectAll();
    await userEvent.click(titre);
    expect(editor.getHTML()).toContain('<h2>section</h2>');

    // La sélection a pu se réduire au caret après le toggle : re-viser le bloc.
    editor.commands.setTextSelection(2);
    await userEvent.click(titre);
    expect(editor.getHTML()).toContain('<p>section</p>');
    expect(editor.getHTML()).not.toContain('<h2>section</h2>');
  });

  it('Sous-titre produit un h3', async () => {
    const { editor } = await mountEditor({ html: '<p>détail</p>' });
    editor.commands.selectAll();
    await userEvent.click(screen.getByRole('button', { name: 'Sous-titre' }));
    expect(editor.getHTML()).toContain('<h3>détail</h3>');
  });

  it('les listes à puces et numérotées enveloppent le paragraphe', async () => {
    const { editor } = await mountEditor({ html: '<p>point</p>' });
    editor.commands.selectAll();

    await userEvent.click(screen.getByRole('button', { name: 'Liste à puces' }));
    expect(editor.getHTML()).toMatch(/<ul[^>]*>[\s\S]*point[\s\S]*<\/ul>/);

    await userEvent.click(screen.getByRole('button', { name: 'Liste numérotée' }));
    expect(editor.getHTML()).toMatch(/<ol[^>]*>[\s\S]*point[\s\S]*<\/ol>/);
  });

  it('Lien : inactif sans sélection, popover + https par défaut sur une sélection', async () => {
    const { editor } = await mountEditor({ html: '<p>voir le site</p>' });
    const bouton = screen.getByRole('button', { name: 'Lien hypertexte' });

    // Caret seul, pas de sélection → pas de cible pour un lien.
    expect(bouton.disabled).toBe(true);

    editor.commands.selectAll();
    await waitFor(() => expect(bouton.disabled).toBe(false));

    await userEvent.click(bouton);
    const champ = screen.getByPlaceholderText('Adresse du lien (https://…)');
    await userEvent.type(champ, 'exemple.com');
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    expect(editor.getHTML()).toContain('href="https://exemple.com"');

    // Caret dans le lien → « Retirer » le supprime en entier.
    editor.commands.setTextSelection(3);
    await tick();
    await userEvent.click(screen.getByRole('button', { name: 'Lien hypertexte' }));
    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(editor.getHTML()).not.toContain('<a');
  });

  it('la gomme ramène titre + marques au texte normal', async () => {
    const { editor } = await mountEditor({ html: '<h2><strong>chapitre</strong></h2>' });
    editor.commands.selectAll();
    await userEvent.click(screen.getByRole('button', { name: 'Effacer la mise en forme' }));
    expect(editor.getHTML()).toContain('<p>chapitre</p>');
    expect(editor.getHTML()).not.toContain('<strong>');
    expect(editor.getHTML()).not.toContain('<h2>');
  });

  it('une commande de la barre émet update avec les sauts de ligne en <p><br></p>', async () => {
    const onUpdate = vi.fn();
    const { editor, component } = await mountEditor({
      html: '<p>a</p><p><br></p><p>b</p>',
    });
    component.$on('update', (e) => onUpdate(e.detail.html));

    editor.commands.setTextSelection({ from: 1, to: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Gras' }));

    expect(onUpdate).toHaveBeenCalled();
    const html = onUpdate.mock.calls.at(-1)[0];
    expect(html).toContain('<p><br></p>'); // contrat mail/PDF intact
    expect(html).toContain('<strong>a</strong>');
  });
});
