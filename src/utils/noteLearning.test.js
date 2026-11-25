/**
 * Dire ce qui vient d'être retenu des notes. Ce que ces tests protègent : un
 * remplacement retenu se dit toujours (il réécrira les réunions à venir), un
 * passage sans rien de nouveau ne dit rien, et « liste pleine » ne se répète
 * pas à chaque note.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../stores/transcriptCorrections.js', () => ({ learnNoteReplacements: vi.fn() }));

const { learnFromNotes, resetNoteLearning } = await import('./noteLearning.js');
const { uiTextData } = await import('../config/uiText.js');

const outcome = (over = {}) => ({ ok: true, added: [], full: false, ...over });

beforeEach(resetNoteLearning);

describe('learnFromNotes', () => {
  it('un remplacement retenu : on dit lequel', async () => {
    const showToast = vi.fn();
    const learn = vi.fn(async () => outcome({ added: [{ from: 'Durend', to: 'Durand' }] }));
    await learnFromNotes('Remplace Durend par Durand', showToast, { learn });
    expect(learn).toHaveBeenCalledWith('Remplace Durend par Durand');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('statuses.replacementLearned', 'success', 7000, {
      from: 'Durend',
      to: 'Durand',
    });
  });

  it('plusieurs : on dit combien', async () => {
    const showToast = vi.fn();
    const added = [
      { from: 'Durend', to: 'Durand' },
      { from: 'Market', to: 'Marquet' },
    ];
    await learnFromNotes('…', showToast, { learn: async () => outcome({ added }) });
    expect(showToast).toHaveBeenCalledWith('statuses.replacementsLearned', 'success', 7000, {
      n: 2,
    });
  });

  it('rien de nouveau, ou un échec : rien à dire', async () => {
    const showToast = vi.fn();
    await learnFromNotes('…', showToast, { learn: async () => outcome() });
    await learnFromNotes('…', showToast, {
      learn: async () => ({ ok: false, error: 'network', added: [], full: false }),
    });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('liste pleine : dit une fois par session', async () => {
    const showToast = vi.fn();
    const learn = async () => outcome({ full: true });
    await learnFromNotes('…', showToast, { learn });
    await learnFromNotes('…', showToast, { learn });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('statuses.replacementsFull', 'warning', 10000, {
      max: 100,
    });
  });

  it('chaque message existe en français et en anglais, avec ses variables', () => {
    for (const lang of ['fr', 'en']) {
      const { statuses } = uiTextData[lang];
      expect(statuses.replacementLearned).toContain('{from}');
      expect(statuses.replacementLearned).toContain('{to}');
      expect(statuses.replacementsLearned).toContain('{n}');
      expect(statuses.replacementsFull).toContain('{max}');
    }
  });
});
