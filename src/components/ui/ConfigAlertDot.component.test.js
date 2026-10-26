/**
 * Pastille de configuration et sa bulle (components/ui/ConfigAlertDot.svelte).
 *
 * Ce qui compte : la bulle s'ouvre AU SURVOL de l'élément porteur (pas de la
 * seule pastille, trop petite pour être visée), jamais sur un écran sans
 * survol ; ses phrases DÉCRIVENT le porteur pour un lecteur d'écran sans
 * changer son nom ; et tout est retiré quand la pastille disparaît.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const ConfigAlertDot = (await import('./ConfigAlertDot.svelte')).default;

const ITEMS = [
  { level: 'error', text: 'Aucune clé OpenAI.' },
  { level: 'tip', text: 'Identité par défaut.' },
];

function hoverable(matches) {
  window.matchMedia = (query) => ({ matches: query.includes('hover: hover') && matches });
}

/**
 * Monte la pastille DANS un bouton-icône nommé par `aria-label`, comme la roue
 * crantée de la Sidebar — le cas où un texte glissé dedans serait ignoré.
 */
function renderIn(props) {
  const host = document.createElement('button');
  host.type = 'button';
  host.setAttribute('aria-label', 'Paramètres');
  document.body.appendChild(host);
  return render(ConfigAlertDot, { target: host, props: { placement: 'corner', ...props } });
}

afterEach(() => {
  delete window.matchMedia;
  document.body.innerHTML = '';
});

describe('ConfigAlertDot', () => {
  it('la couleur est celle du constat le plus grave', () => {
    renderIn({ level: 'error', items: ITEMS });
    expect(document.querySelector('.cad').classList.contains('cad-error')).toBe(true);
  });

  it('survoler le porteur ouvre la bulle au-dessus ; le quitter la ferme', async () => {
    hoverable(true);
    renderIn({ level: 'error', items: ITEMS, title: 'À régler', more: '+ 1 autre' });
    const host = screen.getByRole('button', { name: 'Paramètres' });

    await userEvent.hover(host);
    const bubble = document.body.querySelector('.cad-bubble');
    expect(bubble).toBeTruthy();
    // Téléportée dans <body>, hors de la colonne qui la couperait.
    expect(host.contains(bubble)).toBe(false);
    expect(bubble.textContent).toContain('À régler');
    expect([...bubble.querySelectorAll('.cad-line')].map((l) => l.textContent.trim())).toEqual([
      'Aucune clé OpenAI.',
      'Identité par défaut.',
    ]);
    expect(bubble.textContent).toContain('+ 1 autre');

    await userEvent.unhover(host);
    expect(document.body.querySelector('.cad-bubble')).toBeNull();
  });

  it("sans survol (écran tactile), pas de bulle : c'est le menu qui écrit la phrase", async () => {
    hoverable(false);
    renderIn({ level: 'error', items: ITEMS });
    await userEvent.hover(screen.getByRole('button', { name: 'Paramètres' }));
    expect(document.body.querySelector('.cad-bubble')).toBeNull();
  });

  it('les phrases décrivent le porteur sans changer son nom, et partent avec la pastille', async () => {
    const { unmount } = renderIn({ level: 'error', items: ITEMS });
    const host = screen.getByRole('button', {
      name: 'Paramètres',
      description: /Aucune clé OpenAI\..*Identité par défaut\./,
    });
    expect(host).toBeTruthy();

    unmount();
    expect(host.hasAttribute('aria-describedby')).toBe(false);
    expect(document.body.querySelector('.cad-sr')).toBeNull();
  });
});
