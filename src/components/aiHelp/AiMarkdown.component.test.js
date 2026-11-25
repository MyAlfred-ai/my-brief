/**
 * Le texte d'une intervention, mis en forme (AiMarkdown).
 *
 * Ce qui compte : le Markdown d'une fiche de myBrain se LIT — plus
 * d'astérisques ni de crochets à l'écran —, et un texte hostile ne produit
 * aucun élément : ni balise, ni lien exécutable.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';

const AiMarkdown = (await import('./AiMarkdown.svelte')).default;

describe('AiMarkdown', () => {
  it('rend le gras, les listes et les liens, sans laisser la syntaxe à l’écran', () => {
    const { container } = render(AiMarkdown, {
      text: 'Le **projet AMBRE**, en bref :\n- Livraison le *15 mars*.\n- Voir [la fiche](/cerveau?f=wiki/ambre.md).',
      base: 'https://cerveau.example.test',
    });
    expect(container.querySelector('strong').textContent).toBe('projet AMBRE');
    expect([...container.querySelectorAll('li')].map((li) => li.textContent.trim())).toEqual([
      'Livraison le 15 mars.',
      'Voir la fiche.',
    ]);
    const link = container.querySelector('a');
    expect(link.getAttribute('href')).toBe('https://cerveau.example.test/cerveau?f=wiki/ambre.md');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.textContent).not.toMatch(/\*|\[|\]\(/);
    // Pas d'espace parasite entre un mot mis en forme et la ponctuation qui le suit.
    expect(container.querySelector('p').textContent.trim()).toBe('Le projet AMBRE, en bref :');
  });

  it('un texte hostile ne crée aucun élément : il s’affiche', () => {
    const { container } = render(AiMarkdown, {
      text: '<img src=x onerror="alert(1)"><script>alert(2)</script> [ici](javascript:alert(3))',
    });
    expect(container.querySelector('img, script, a')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.textContent).toContain('ici');
  });

  it('en cours d’écriture : le gras ouvert est déjà gras, et le curseur suit le texte', () => {
    const { container } = render(AiMarkdown, {
      text: '- Budget\n- Le **projet SAB',
      partial: true,
      caret: true,
    });
    expect(container.querySelector('strong').textContent).toBe('projet SAB');
    expect(container.textContent).not.toContain('*');
    // Le curseur est dans le dernier élément de la liste, pas sur une ligne à lui.
    const items = container.querySelectorAll('li');
    expect(items[1].querySelector('.aimd-caret')).toBeTruthy();
    expect(items[0].querySelector('.aimd-caret')).toBeNull();
  });
});
