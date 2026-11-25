/**
 * Le pupitre de l'Aide IA — une conversation.
 *
 * Ce qui compte ici : on y trouve le fil, quelques exemples et un champ, rien
 * d'autre ; les échanges s'empilent vers le bas, la question au-dessus de sa
 * réponse ; une question posée ici y reçoit sa réponse sans refermer le
 * pupitre ; et les réglages restent à un geste, derrière l'icône.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';

vi.mock('../../services/aiHelpApi.js', () => ({
  fetchAiHelp: vi.fn(),
  saveAiHelpSession: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
  watchAiHelp: vi.fn(),
  askAiHelp: vi.fn(),
  saveAiHelpItemState: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
  searchAiHelpProjects: vi.fn(),
}));
vi.mock('../../utils/chime.js', async () => {
  const { writable } = await import('svelte/store');
  return {
    playChime: vi.fn(),
    playBell: vi.fn(),
    playAck: vi.fn(),
    playTimerMelody: vi.fn(),
    aiHelpAudioLocked: writable(false),
    armAiHelpAudio: vi.fn(),
    unlockAiHelpAudio: vi.fn(async () => true),
    readyAudioContext: vi.fn(async () => null),
  };
});

const api = await import('../../services/aiHelpApi.js');
const { uiTextData } = await import('../../config/uiText.js');
const store = await import('../../stores/aiHelp.js');
const AiHelpDesk = (await import('./AiHelpDesk.svelte')).default;

const t = uiTextData.fr.aiHelp;
const ALL = { project: true, qa: true, agenda: true, ideas: true };
const id = (char) => char.repeat(32);

/** Une réunion en cours, Aide IA allumée, avec ce qu'elle a déjà dit. */
function meeting(items = [], over = {}) {
  store.aiHelp.update((s) => ({
    ...s,
    loaded: true,
    available: true,
    myBrain: true,
    allowed: ALL,
    domains: ALL,
    enabled: true,
    wakeWord: 'Alfred',
    meetingId: 'm1',
    items,
    pending: [],
    error: '',
    ...over,
  }));
  store.aiHelpDeskOpen.set(true);
  return render(AiHelpDesk);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.aiHelpDeskOpen.set(false);
});

describe('AiHelpDesk — une conversation', () => {
  it('vide : une invitation, des exemples, un champ — et rien d’autre', () => {
    meeting();
    expect(screen.getByText(t.chatEmpty.replaceAll('{name}', 'Alfred'))).toBeTruthy();
    for (const example of t.suggestions) {
      expect(screen.getByRole('button', { name: example })).toBeTruthy();
    }
    expect(screen.getByRole('textbox')).toBeTruthy();
    // Ni interrupteur, ni domaines, ni ordre du jour : ils sont derrière l'icône.
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(t.domains.project.title)).toBeNull();
  });

  it('questions-réponses coupées : plus d’exemples, mais le champ reste — pour un geste', async () => {
    meeting([], { domains: { ...ALL, qa: false } });
    const name = { name: 'Alfred' };
    for (const example of t.suggestions) {
      expect(screen.queryByRole('button', { name: example })).toBeNull();
    }
    expect(screen.getByText(t.commandsOnly.replace('{name}', name.name))).toBeTruthy();
    expect(screen.getByText(t.chatEmptyCommands.replaceAll('{name}', name.name))).toBeTruthy();
    const field = screen.getByRole('textbox', {
      name: t.askLabelCommands.replace('{name}', name.name),
    });
    expect(field.placeholder).toBe(t.askPlaceholderCommands);

    api.askAiHelp.mockResolvedValue({
      ok: true,
      status: 200,
      data: { item: null, notice: '', actions: [{ type: 'close' }], reminders: [] },
    });
    await userEvent.type(field, 'Ferme ta fenêtre{Enter}');
    expect(api.askAiHelp).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: 'm1', question: 'Ferme ta fenêtre' }),
    );
  });

  it('les échanges s’empilent vers le bas : la question, puis sa réponse', () => {
    const { container } = meeting([
      {
        id: id('a'),
        kind: 'answer',
        question: 'Où en est-on ?',
        body: 'Au point 2.',
        state: 'dismissed',
      },
      {
        id: id('b'),
        kind: 'alert',
        title: 'La signature fait partie du lot 2',
        body: 'Vous venez de la retirer.',
        state: 'acknowledged',
      },
      {
        id: id('c'),
        kind: 'answer',
        question: 'Fais une synthèse',
        body: '**En bref** :\n- Budget validé.\n- Livraison fin mars.',
        state: 'open',
      },
    ]);
    const bubbles = [...container.querySelectorAll('.aidk-me, .aidk-ai')].map((node) =>
      node.textContent.replace(/\s+/g, ' ').trim(),
    );
    expect(bubbles).toEqual([
      'Où en est-on ?',
      'Au point 2.',
      // Une intervention spontanée dit son type ; une réponse, non.
      `${t.kinds.alert} La signature fait partie du lot 2 Vous venez de la retirer.`,
      'Fais une synthèse',
      // Le Markdown de la réponse est mis en forme : ni astérisques ni tirets.
      expect.stringMatching(/^En bref :\s*Budget validé\.\s*Livraison fin mars\.$/),
    ]);
    expect(container.querySelectorAll('.aidk-ai li')).toHaveLength(2);
    expect(container.querySelector('.aidk-ai strong').textContent).toBe('En bref');
  });

  it('un exemple pose la question : elle s’affiche, l’IA cherche, la réponse arrive dans le fil', async () => {
    let answer;
    api.askAiHelp.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { container } = meeting();

    await userEvent.click(screen.getByRole('button', { name: t.suggestions[0] }));
    expect(api.askAiHelp).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: 'm1', question: t.suggestions[0], voice: false }),
    );
    expect(container.querySelector('.aidk-me').textContent.trim()).toBe(t.suggestions[0]);
    expect(screen.getByText(t.thinking.replace('{name}', 'Alfred'))).toBeTruthy();

    answer({
      ok: true,
      status: 200,
      data: {
        item: {
          id: id('d'),
          kind: 'answer',
          question: t.suggestions[0],
          body: 'Budget validé.',
          state: 'open',
        },
        notice: '',
        actions: [],
        reminders: [],
      },
    });
    expect(await screen.findByText('Budget validé.')).toBeTruthy();
    // Le pupitre reste ouvert, et la réponse ne ressurgira pas sur la scène.
    expect(get(store.aiHelpDeskOpen)).toBe(true);
    expect(get(store.aiHelpOpenItems)).toEqual([]);
  });

  it('une question tapée part à l’envoi ; le champ se vide', async () => {
    api.askAiHelp.mockResolvedValue({
      ok: false,
      status: 502,
      data: { error: 'ai_help_no_answer' },
    });
    meeting();
    const field = screen.getByRole('textbox');
    await userEvent.type(field, 'Quelles actions ?{Enter}');
    expect(api.askAiHelp).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'Quelles actions ?' }),
    );
    expect(field.value).toBe('');
    // Une panne se dit dans le fil.
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('les réglages sont derrière l’icône, à un geste', async () => {
    meeting();
    await userEvent.click(screen.getByRole('button', { name: t.settings }));
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.getByText(t.domains.project.title)).toBeTruthy();
    expect(
      screen.queryByRole('textbox', { name: t.askLabel.replace('{name}', 'Alfred') }),
    ).toBeNull();
  });

  it('éteinte : le fil le dit, et un geste la rallume', () => {
    meeting([], { enabled: false });
    expect(screen.getByText(t.setupOff)).toBeTruthy();
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
