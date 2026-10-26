/**
 * Lignes de transcription éditables.
 *
 * Ce qui compte ici : le surlignage furtif de la relecture (`refineFlash`,
 * posé par flashRefinedWords) ne s'applique qu'aux mots au drapeau `changed`,
 * et une ligne sans marqueur reste du texte brut — le marqueur est un état
 * d'animation, pas du contenu.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const EditableTranscript = (await import('./EditableTranscript.svelte')).default;

describe('EditableTranscript — surlignage de la relecture', () => {
  it('sans marqueur : texte brut, aucun span de mot', () => {
    const { container } = render(EditableTranscript, {
      props: { items: [{ time: '00:00:01', text: 'On livre chez Globex demain.' }] },
    });

    expect(screen.getByText('On livre chez Globex demain.')).toBeTruthy();
    expect(container.querySelectorAll('.word-refined').length).toBe(0);
  });

  it('avec marqueur : seuls les mots changés portent la classe d’animation', () => {
    const tokens = [
      { word: 'On', changed: false },
      { word: 'livre', changed: false },
      { word: 'chez', changed: false },
      { word: 'Globex', changed: true },
      { word: 'demain.', changed: false },
    ];
    const { container } = render(EditableTranscript, {
      props: {
        items: [
          {
            time: '00:00:01',
            text: 'On livre chez Globex demain.',
            refineFlash: { at: 123, tokens },
          },
        ],
      },
    });

    const changed = container.querySelectorAll('.word-refined-changed');
    expect([...changed].map((el) => el.textContent)).toEqual(['Globex']);
    // La phrase reste lisible d'un seul tenant (mots séparés par des espaces).
    expect(container.querySelector('.transcript-text').textContent).toBe(
      'On livre chez Globex demain.',
    );
  });
});

describe('EditableTranscript — badge de locuteur', () => {
  const L = (text) => ({ time: '00:00:01', text, source: 'local' });
  const R = (text) => ({ time: '00:00:02', text, source: 'remote' });

  it('réunion mono-flux : aucun badge (affichage d’avant, inchangé)', () => {
    const { container } = render(EditableTranscript, {
      props: { items: [L('Bonjour.'), L('On commence.')], selfName: 'Alex' },
    });
    expect(container.querySelectorAll('.transcript-speaker').length).toBe(0);
  });

  it('deux flux : un badge par CHANGEMENT de locuteur, jamais par ligne', () => {
    const { container } = render(EditableTranscript, {
      props: {
        items: [L('Bonjour.'), L('On commence ?'), R('Oui.'), R('Allons-y.'), L('Parfait.')],
        selfName: 'Alex',
      },
    });
    const badges = [...container.querySelectorAll('.transcript-speaker')];
    expect(badges.map((el) => el.textContent.trim())).toEqual(['Alex', 'Visio', 'Alex']);
    // Le canal distant est nommé ET marqué en classe : la distinction ne
    // repose pas sur la seule couleur.
    expect(badges[1].classList.contains('transcript-speaker-remote')).toBe(true);
    expect(badges[0].classList.contains('transcript-speaker-remote')).toBe(false);
  });

  it('nom absent : repli « Moi »', () => {
    const { container } = render(EditableTranscript, {
      props: { items: [L('A.'), R('B.')], selfName: 'No value' },
    });
    expect(container.querySelector('.transcript-speaker').textContent.trim()).toBe('Moi');
  });

  it('réunion archivée : l’étiquette relue prime sur le nom courant', () => {
    const { container } = render(EditableTranscript, {
      props: {
        items: [
          { time: '', text: 'A.', source: 'local', speaker: 'Camille' },
          { time: '', text: 'B.', source: 'remote', speaker: 'Visio' },
        ],
        selfName: 'Alex',
      },
    });
    const badges = [...container.querySelectorAll('.transcript-speaker')];
    expect(badges.map((el) => el.textContent.trim())).toEqual(['Camille', 'Visio']);
  });

  it('la pastille vit DANS la ligne de texte, pas sur une ligne dédiée', () => {
    // Une ligne dédiée espaçait verticalement chaque prise de parole ; la
    // pastille est désormais en tête de réplique, dans le fil du texte.
    const { container } = render(EditableTranscript, {
      props: { items: [L('Bonjour.'), R('Oui.')], selfName: 'Alex' },
    });
    for (const badge of container.querySelectorAll('.transcript-speaker')) {
      expect(badge.closest('.transcript-text')).toBeTruthy();
      expect(badge.closest('.transcript-item')).toBeTruthy();
    }
  });
});

describe('EditableTranscript — colonne d’heure', () => {
  it('rendue quand la ligne porte une heure (le direct : écoulé + horloge)', () => {
    const { container } = render(EditableTranscript, {
      props: { items: [{ time: '00:00:05', timestamp: '10:30:05', text: 'Bonjour.' }] },
    });
    expect(container.querySelectorAll('.transcript-time-container').length).toBe(1);
    expect(container.querySelector('.transcript-time').textContent).toBe('00:00:05');
    expect(container.querySelector('.transcript-timestamp').textContent).toBe('10:30:05');
  });

  it('absente quand la ligne n’en a pas : une réunion rouverte n’a plus d’heure par ligne', () => {
    // Avant : la date ISO de la réunion était recopiée sur chaque ligne —
    // « 2026-08-27T15:01:27.449Z » en colonne, marge morte de ~150 px.
    const { container } = render(EditableTranscript, {
      props: { items: [{ time: '', text: 'Première phrase.' }] },
    });
    expect(container.querySelectorAll('.transcript-time-container').length).toBe(0);
  });
});
