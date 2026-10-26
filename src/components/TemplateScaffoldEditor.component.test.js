/**
 * Éditeur du scaffold de template — états de la barre d'outils.
 *
 * Ce qui compte ici : les boutons de mise en forme suivent l'état de
 * l'éditeur (`is-active`), et un bloc IA déjà présent dans le document ne se
 * réinsère pas (pastille désactivée, titre « déjà inséré »). Ces deux états
 * dépendent d'un compteur de transactions que Svelte doit VOIR pour
 * recalculer : un recalcul perdu laisse la barre figée sans autre symptôme.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

// jsdom n'implémente pas la géométrie des Range : ProseMirror l'appelle après
// chaque `focus()`. Un rect vide suffit — personne ne mesure ici.
const zeroRect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
for (const proto of [Range.prototype, Element.prototype]) {
  if (!proto.getClientRects) proto.getClientRects = () => [];
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = () => ({ ...zeroRect });
}

const TemplateScaffoldEditor = (await import('./TemplateScaffoldEditor.svelte')).default;

const labels = { bold: 'Gras', alreadyInserted: 'Déjà inséré' };

function chip(label) {
  return screen.getByText(label).closest('button');
}

describe('TemplateScaffoldEditor — barre d’outils', () => {
  it('désactive la pastille d’un bloc IA déjà présent, et elle seule', async () => {
    render(TemplateScaffoldEditor, { props: { scaffold: '{{résumé}}', labels } });
    await waitFor(() => expect(chip('Résumé IA').disabled).toBe(true));
    expect(chip('Résumé IA').title).toBe('Déjà inséré');
    expect(chip('Points clés').disabled).toBe(false);
  });

  it('désactive une pastille dès que son bloc est inséré', async () => {
    const user = userEvent.setup();
    render(TemplateScaffoldEditor, { props: { scaffold: '{{résumé}}', labels } });
    await waitFor(() => expect(chip('Résumé IA').disabled).toBe(true));
    await user.click(chip('Points clés'));
    await waitFor(() => expect(chip('Points clés').disabled).toBe(true));
    expect(chip('Points clés').title).toBe('Déjà inséré');
  });

  it('allume le bouton Gras quand la mise en forme est active', async () => {
    const user = userEvent.setup();
    const { container } = render(TemplateScaffoldEditor, {
      props: { scaffold: 'Texte', labels },
    });
    const bold = container.querySelector('.ut-fmt-bold');
    await waitFor(() => expect(container.querySelector('.ut-ed-surface-input')).not.toBeNull());
    expect(bold.classList.contains('is-active')).toBe(false);
    await user.click(bold);
    await waitFor(() => expect(bold.classList.contains('is-active')).toBe(true));
    await user.click(bold);
    await waitFor(() => expect(bold.classList.contains('is-active')).toBe(false));
  });
});
