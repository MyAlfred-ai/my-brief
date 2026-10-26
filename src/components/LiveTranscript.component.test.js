/**
 * Zone de transcription du direct — suivi détachable.
 *
 * Ce qui compte ici : tant qu'on est en bas, chaque appel à `scrollToLatest()`
 * recolle la vue au flux ; dès qu'on remonte lire plus haut, la vue ne bouge
 * PLUS (c'est tout le point de la fonctionnalité) et la flèche « revenir au
 * direct » apparaît ; la flèche recolle et disparaît ; revenir en bas à la
 * main suffit aussi à réactiver le suivi. Pendant qu'on nomme une voix de la
 * visio, la vue ne bouge pas non plus : la ligne et son menu restent visibles.
 *
 * jsdom ne calcule aucune géométrie : scrollHeight/clientHeight sont posés à
 * la main, et l'événement scroll est dispatché explicitement.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const LiveTranscript = (await import('./LiveTranscript.svelte')).default;

const props = {
  items: [
    { time: '00:00:01', timestamp: '10:00:01', author: 'Intervenant', text: 'Bonjour à tous.' },
  ],
  waitingText: 'En attente de la transcription…',
  followLabel: 'Revenir à la transcription en cours',
};

function renderWithGeometry(items = props.items) {
  const utils = render(LiveTranscript, { props: { ...props, items } });
  const scroller = utils.container.querySelector('.rec-live-transcript');
  // 1000 px de contenu dans 300 px de fenêtre : il y a de quoi remonter.
  Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(scroller, 'clientHeight', { value: 300, configurable: true });
  return { ...utils, scroller };
}

describe('LiveTranscript', () => {
  it("affiche le texte d'attente sans transcription, et jamais de flèche au départ", () => {
    render(LiveTranscript, { props: { ...props, items: [] } });
    expect(screen.getByText('En attente de la transcription…')).toBeTruthy();
    expect(screen.queryByLabelText(props.followLabel)).toBeNull();
  });

  it('recolle la vue en bas tant que l’utilisateur suit le direct', () => {
    const { component, scroller } = renderWithGeometry();
    component.scrollToLatest();
    expect(scroller.scrollTop).toBe(1000);
  });

  it('remonter fige la vue : les nouvelles phrases ne la ramènent plus en bas', async () => {
    const { component, scroller } = renderWithGeometry();
    scroller.scrollTop = 200; // loin du bas (distance 500 > marge)
    await fireEvent.scroll(scroller);

    component.scrollToLatest(); // nouvelle phrase pendant la lecture
    expect(scroller.scrollTop).toBe(200);
    expect(screen.getByLabelText(props.followLabel)).toBeTruthy();
  });

  it('la flèche recolle au direct puis disparaît', async () => {
    const { scroller } = renderWithGeometry();
    scroller.scrollTop = 200;
    await fireEvent.scroll(scroller);

    await fireEvent.click(screen.getByLabelText(props.followLabel));
    expect(scroller.scrollTop).toBe(1000);
    expect(screen.queryByLabelText(props.followLabel)).toBeNull();
  });

  it('menu « Qui parle ici ? » ouvert : la vue ne bouge plus ; refermé, elle rejoint le direct', async () => {
    const { component, container, scroller } = renderWithGeometry([
      { time: '00:00:01', timestamp: '10:00:01', text: 'Bonjour.', source: 'local' },
      { time: '00:00:03', timestamp: '10:00:03', text: 'Salut', source: 'remote', isDelta: true },
    ]);
    scroller.scrollTop = 700; // en bas : le suivi est actif

    await fireEvent.click(container.querySelector('.transcript-speaker-btn'));
    component.scrollToLatest(); // la visio parle pendant qu'on nomme
    expect(scroller.scrollTop).toBe(700);

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(scroller.scrollTop).toBe(1000);
  });

  it('revenir en bas à la main réactive le suivi sans passer par la flèche', async () => {
    const { component, scroller } = renderWithGeometry();
    scroller.scrollTop = 200;
    await fireEvent.scroll(scroller);
    expect(screen.getByLabelText(props.followLabel)).toBeTruthy();

    scroller.scrollTop = 680; // distance 20 ≤ marge de 60 px
    await fireEvent.scroll(scroller);
    expect(screen.queryByLabelText(props.followLabel)).toBeNull();

    component.scrollToLatest();
    expect(scroller.scrollTop).toBe(1000);
  });
});
