/**
 * Notes et actions — ce qui compte pour « une réunion vide », et ce qui ne
 * doit pas repartir vers un modèle.
 *
 * Les routes sont testées dans meetings.test.js ; ici, les deux règles qui
 * décident en silence : une purge (réunion jugée vide) et le contenu d'une
 * infographie régénérée.
 */
import { describe, it, expect } from 'vitest';
import {
  hasNotesActionsContent,
  isLegacyActionPlaceholder,
  withoutLegacyPlaceholders,
  notesActionsFields,
} from '../lib/notesActions.js';

describe('hasNotesActionsContent', () => {
  it('des notes, ou une action écrite, comptent', () => {
    expect(hasNotesActionsContent({ notes: 'Budget validé' })).toBe(true);
    expect(hasNotesActionsContent({ actions: [{ title: '', dueDate: '2026-09-18' }] })).toBe(true);
  });

  it('ni des blancs, ni une carte vierge, ni les textes de remplacement d’autrefois', () => {
    expect(hasNotesActionsContent({ notes: '  \n ' })).toBe(false);
    expect(hasNotesActionsContent({ actions: [{ title: '', owner: '', description: '' }] })).toBe(
      false,
    );
    expect(
      hasNotesActionsContent({
        actions: [
          {
            title: 'Nouvelle action',
            owner: 'À définir',
            description: "Description de l'action...",
          },
        ],
      }),
    ).toBe(false);
    expect(hasNotesActionsContent({})).toBe(false);
  });
});

describe('isLegacyActionPlaceholder — liste unique, partagée avec l’envoi à myBrain', () => {
  it('reconnaît les textes d’autrefois, sans tenir compte de la casse ni des espaces', () => {
    expect(isLegacyActionPlaceholder('À définir')).toBe(true);
    expect(isLegacyActionPlaceholder('  to be decided ')).toBe(true);
    expect(isLegacyActionPlaceholder("DESCRIPTION DE L'ACTION...")).toBe(true);
  });

  it('laisse passer une vraie valeur', () => {
    expect(isLegacyActionPlaceholder('Alex')).toBe(false);
    expect(isLegacyActionPlaceholder('')).toBe(false);
  });
});

describe('withoutLegacyPlaceholders', () => {
  it('vide les textes de remplacement d’autrefois, garde le reste tel quel', () => {
    const [legacy, real] = withoutLegacyPlaceholders([
      { id: 1, title: 'New action', owner: 'To be decided', show: true },
      { id: 2, title: 'Relancer', owner: 'Alex', dueDate: '2026-09-18', show: false },
    ]);
    expect(legacy).toEqual({ id: 1, title: '', owner: '', show: true });
    expect(real).toEqual({
      id: 2,
      title: 'Relancer',
      owner: 'Alex',
      dueDate: '2026-09-18',
      show: false,
    });
  });

  it('tolère une base sans actions', () => {
    expect(withoutLegacyPlaceholders(undefined)).toEqual([]);
  });
});

describe('notesActionsFields', () => {
  it('seuls les champs présents s’écrivent — un client muet n’efface rien', () => {
    expect(notesActionsFields({ meetingId: 'm', notes: '' })).toEqual({ notes: '' });
    expect(notesActionsFields({ meetingId: 'm', actions: [] })).toEqual({ actions: [] });
    expect(notesActionsFields({ meetingId: 'm' })).toEqual({});
  });
});
