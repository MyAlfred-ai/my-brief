/**
 * Nommer les participants de la visio depuis la transcription.
 *
 * Ce qui compte : la pastille distante est un bouton qui ouvre le menu « Qui
 * parle ici ? », une ligne de suite porte le bouton « d'ici », le nom choisi
 * remonte à l'application avec la portée, et la pastille du micro reste un
 * simple texte (le nom vient du profil).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const EditableTranscript = (await import('./EditableTranscript.svelte')).default;

const L = (text, extra = {}) => ({ time: '', text, source: 'local', ...extra });
const R = (text, extra = {}) => ({ time: '', text, source: 'remote', ...extra });

describe('EditableTranscript — nommer une voix de la visio', () => {
  it('pastille distante = bouton ; pastille du micro = texte', () => {
    const { container } = render(EditableTranscript, {
      props: { items: [L('Bonjour.'), R('Salut.')], selfName: 'Alex' },
    });
    const badges = [...container.querySelectorAll('.transcript-speaker')];
    expect(badges.map((el) => el.tagName)).toEqual(['SPAN', 'BUTTON']);
    expect(badges[1].textContent.trim()).toBe('Visio');
    expect(badges[1].getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('pastille au changement de NOM, pas seulement de canal', () => {
    const { container } = render(EditableTranscript, {
      props: {
        items: [L('A.'), R('B.', { speaker: 'Marie' }), R('C.'), R('D.', { speaker: 'Paul' })],
        selfName: 'Alex',
      },
    });
    const badges = [...container.querySelectorAll('.transcript-speaker')];
    expect(badges.map((el) => el.textContent.trim())).toEqual(['Alex', 'Marie', 'Paul']);
  });

  it('ligne de suite distante : bouton « d’ici » ; ligne à pastille et ligne micro : non', () => {
    const { container } = render(EditableTranscript, {
      props: { items: [L('A.'), R('B.'), R('C.'), L('D.')], selfName: 'Alex' },
    });
    const items = [...container.querySelectorAll('.transcript-item')];
    expect(items.map((el) => !!el.querySelector('.transcript-speaker-split'))).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  it('mono-flux : ni pastille ni bouton « d’ici » (affichage d’avant)', () => {
    const { container } = render(EditableTranscript, {
      props: { items: [R('A.'), R('B.')], selfName: 'Alex' },
    });
    expect(container.querySelectorAll('.transcript-speaker').length).toBe(0);
    expect(container.querySelectorAll('.transcript-speaker-split').length).toBe(0);
  });

  it('cliquer la pastille ouvre le menu ; un nom saisi remonte avec sa portée', async () => {
    const { container, component } = render(EditableTranscript, {
      props: { items: [L('A.'), R('B.'), R('C.')], selfName: 'Alex' },
    });
    const onSpeaker = vi.fn();
    component.$on('speaker', (e) => onSpeaker(e.detail));

    await fireEvent.click(container.querySelector('.transcript-speaker-btn'));
    const pop = screen.getByTestId('speaker-popover');
    expect(pop.textContent).toContain('Qui parle ici ?');

    const input = pop.querySelector('input[type="text"]');
    await fireEvent.input(input, { target: { value: ' Marie ' } });
    await fireEvent.submit(pop.querySelector('form'));

    expect(onSpeaker).toHaveBeenCalledWith({ index: 1, name: 'Marie', everywhere: false });
    // Le menu se ferme après le choix.
    expect(screen.queryByTestId('speaker-popover')).toBeNull();
  });

  it('les noms déjà posés sont des raccourcis ; la case « partout » change la portée', async () => {
    const { container, component } = render(EditableTranscript, {
      props: {
        items: [L('A.'), R('B.', { speaker: 'Marie' }), R('C.'), R('D.')],
        selfName: 'Alex',
      },
    });
    const onSpeaker = vi.fn();
    component.$on('speaker', (e) => onSpeaker(e.detail));

    // Lignes C et D : héritées de Marie, sans pastille — bouton « d'ici ».
    await fireEvent.click(container.querySelectorAll('.transcript-speaker-split')[1]);
    const pop = screen.getByTestId('speaker-popover');
    const chips = [...pop.querySelectorAll('.spk-chip')].map((el) => el.textContent.trim());
    expect(chips[0]).toBe('Marie');
    expect(chips[chips.length - 1]).toContain('Visio');

    await fireEvent.click(pop.querySelector('input[type="checkbox"]'));
    await fireEvent.click(pop.querySelectorAll('.spk-chip')[0]);
    expect(onSpeaker).toHaveBeenCalledWith({ index: 3, name: 'Marie', everywhere: true });
  });

  it('Échap ferme le menu sans rien émettre', async () => {
    const { container, component } = render(EditableTranscript, {
      props: { items: [L('A.'), R('B.')], selfName: 'Alex' },
    });
    const onSpeaker = vi.fn();
    component.$on('speaker', (e) => onSpeaker(e.detail));
    await fireEvent.click(container.querySelector('.transcript-speaker-btn'));
    expect(screen.getByTestId('speaker-popover')).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('speaker-popover')).toBeNull();
    expect(onSpeaker).not.toHaveBeenCalled();
  });

  // ── En direct : la liste bouge sous le menu ────────────────────────────
  // Une finale s'insère DEVANT les lignes en cours (le direct reste en bas,
  // utils/transcriptLive.js), l'écho retire des lignes, la vue défile à chaque
  // phrase. Le menu doit rester ouvert et nommer SA ligne, pas sa position.
  const live = () => [
    L('A.', { time: '00:01', itemId: 'l1' }),
    R('Bonjour', { time: '00:02', itemId: 'r1', isDelta: true }),
    L('euh', { time: '00:03', itemId: 'l2', isDelta: true }),
  ];

  async function openOnRemote(items) {
    const { container, component } = render(EditableTranscript, {
      props: { items, selfName: 'Alex' },
    });
    const onSpeaker = vi.fn();
    component.$on('speaker', (e) => onSpeaker(e.detail));
    await fireEvent.click(container.querySelector('.transcript-speaker-btn'));
    expect(screen.getByTestId('speaker-popover')).toBeTruthy();
    return { component, onSpeaker };
  }

  async function nameIt(value) {
    const pop = screen.getByTestId('speaker-popover');
    await fireEvent.input(pop.querySelector('input[type="text"]'), { target: { value } });
    await fireEvent.submit(pop.querySelector('form'));
  }

  it('la visio parle, une ligne se boucle devant elle : le menu reste et nomme sa ligne', async () => {
    const [a, r, l] = live();
    const { component, onSpeaker } = await openOnRemote([a, r, l]);

    // La ligne micro se boucle : sa finale passe devant la ligne distante,
    // qui continue de s'écrire ; la vue suit le direct.
    await component.$set({
      items: [a, { ...l, text: 'euh.', isDelta: false }, { ...r, text: 'Bonjour à tous' }],
    });
    await fireEvent.scroll(window);

    await nameIt('Marie');
    expect(onSpeaker).toHaveBeenCalledWith({ index: 2, name: 'Marie', everywhere: false });
  });

  it('une ligne retirée au-dessus (écho) ne décale pas la cible', async () => {
    const [a, r, l] = live();
    const { component, onSpeaker } = await openOnRemote([a, r, l]);

    await component.$set({ items: [r, l] });
    await fireEvent.scroll(window);

    await nameIt('Marie');
    expect(onSpeaker).toHaveBeenCalledWith({ index: 0, name: 'Marie', everywhere: false });
  });

  it('la ligne visée disparaît : le menu se ferme', async () => {
    const [a, r, l] = live();
    const { component, onSpeaker } = await openOnRemote([a, r, l]);
    await component.$set({ items: [a, l] });
    expect(screen.queryByTestId('speaker-popover')).toBeNull();
    expect(onSpeaker).not.toHaveBeenCalled();
  });

  it('un double-clic sur la pastille n’ouvre PAS l’édition de la ligne', async () => {
    const { container } = render(EditableTranscript, {
      props: { items: [L('A.'), R('B.')], selfName: 'Alex' },
    });
    await fireEvent.dblClick(container.querySelector('.transcript-speaker-btn'));
    expect(container.querySelector('textarea')).toBeNull();
  });
});
