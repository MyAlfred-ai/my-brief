/**
 * L'enveloppe de l'éditeur du compte rendu garde le contrat de MarkdownEditor :
 * props, événements `update` / `blur`, emplacement `status`. Le vrai éditeur
 * (TipTap) est chargé à la demande ; ici on vérifie qu'il arrive et que son
 * emplacement est rendu.
 */
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';

const Host = (await import('./MarkdownEditorHost.test.svelte')).default;

describe('lazy/MarkdownEditor', () => {
  it('charge l’éditeur et rend son emplacement `status`', async () => {
    const { container } = render(Host, { props: { html: '<p>Compte rendu</p>' } });
    await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy(), {
      timeout: 5000,
    });
    expect(container.textContent).toContain('Compte rendu');
    expect(container.querySelector('.statut-temoin')).toBeTruthy();
  });
});
