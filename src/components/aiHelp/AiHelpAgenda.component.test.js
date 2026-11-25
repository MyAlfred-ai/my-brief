/**
 * L'ordre du jour, point par point (carte d'une intervention, pupitre).
 *
 * Ce que la liste doit tenir : l'état de chaque point se LIT (un texte, pas
 * une couleur seule), un point retenu d'après la réunion se distingue de ceux
 * qu'on a saisis, et on ne retire un point que là où c'est permis.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const { uiTextData } = await import('../../config/uiText.js');
const AiHelpAgenda = (await import('./AiHelpAgenda.svelte')).default;

const t = uiTextData.fr.aiHelp;
const points = [
  { label: 'Avancement', state: 'done', heard: false },
  { label: 'Risques', state: 'now', heard: true },
  { label: 'Budget', state: 'todo', heard: true },
];

describe('AiHelpAgenda', () => {
  it('dit l’état de chaque point, et marque ceux retenus d’après la réunion', () => {
    render(AiHelpAgenda, { points });
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      `Avancement ${t.agendaStates.done}`,
      `Risques ${t.agendaStates.now}`,
      `Budget ${t.agendaStates.todo}`,
    ]);
    expect(screen.getAllByRole('img', { name: t.agendaHeard })).toHaveLength(2);
    // En lecture seule (carte d'une intervention) : rien à retirer.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('au pupitre, un point se retire d’un clic — par son libellé', async () => {
    const onRemove = vi.fn();
    render(AiHelpAgenda, { points, onRemove });
    await userEvent.click(
      screen.getByRole('button', { name: t.agendaRemove.replace('{point}', 'Risques') }),
    );
    expect(onRemove).toHaveBeenCalledWith('Risques');
  });

  it('deux points identiques d’une ancienne réunion ne cassent pas la liste', () => {
    render(AiHelpAgenda, {
      points: [
        { label: 'Budget', state: 'todo' },
        { label: 'Budget', state: 'done' },
      ],
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
