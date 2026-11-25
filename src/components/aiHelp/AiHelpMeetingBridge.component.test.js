/**
 * Le pont entre l'Aide IA et la réunion.
 *
 * Ce qui compte ici : un geste posé par le store est FAIT par les fonctions
 * d'App — celles des boutons de la barre de réunion — ; rien ne se fait hors
 * d'une réunion en cours ; « pause » et « reprends » ne se rejouent pas sur une
 * réunion qui y est déjà ; et l'IA ne reçoit que des templates qui existent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';

vi.mock('../../services/aiHelpApi.js', () => ({
  fetchAiHelp: vi.fn(async () => ({ ok: false, status: 0, data: {} })),
  saveAiHelpSession: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
  watchAiHelp: vi.fn(),
  askAiHelp: vi.fn(),
  saveAiHelpItemState: vi.fn(),
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
const store = await import('../../stores/aiHelp.js');
const { currentLanguageStore } = await import('../../store.js');
const AiHelpMeetingBridge = (await import('./AiHelpMeetingBridge.svelte')).default;

const TEMPLATES = [
  { value: 'standard', labels: { fr: 'Standard', en: 'Standard' } },
  { value: 'decision', labels: { fr: 'Réunion de décision', en: 'Decision meeting' } },
  { value: 'maison', labels: { fr: 'Point hebdo' } },
  { value: 'nu' },
];

function bridge(props = {}) {
  const calls = {
    onPause: vi.fn(),
    onResume: vi.fn(),
    onSave: vi.fn(),
    onSummarize: vi.fn(),
  };
  const view = render(AiHelpMeetingBridge, {
    props: { live: true, isPaused: false, templateOptions: TEMPLATES, ...calls, ...props },
  });
  return { ...view, calls };
}

/** Pose des gestes dans la file, comme le store après une réponse du serveur. */
async function command(...entries) {
  store.aiHelpCommands.set(entries);
  await tick();
}

beforeEach(() => {
  vi.clearAllMocks();
  store.aiHelpCommands.set([]);
  currentLanguageStore.set('fr');
});

describe('AiHelpMeetingBridge — les gestes sur la réunion', () => {
  it('pause, puis reprise : les fonctions de la barre de réunion, et la file se vide', async () => {
    const { calls, rerender } = bridge();
    await command({ type: 'meeting', do: 'pause' });
    expect(calls.onPause).toHaveBeenCalledTimes(1);
    expect(get(store.aiHelpCommands)).toEqual([]);

    await rerender({ isPaused: true });
    await command({ type: 'meeting', do: 'resume' });
    expect(calls.onResume).toHaveBeenCalledTimes(1);
  });

  it('ne rejoue ni une pause sur une réunion en pause, ni une reprise sur une réunion qui tourne', async () => {
    const running = bridge();
    await command({ type: 'meeting', do: 'resume' });
    expect(running.calls.onResume).not.toHaveBeenCalled();
    running.unmount();

    const paused = bridge({ isPaused: true });
    await command({ type: 'meeting', do: 'pause' });
    expect(paused.calls.onPause).not.toHaveBeenCalled();
  });

  it('« termine » range la réunion sans compte rendu ; « le compte rendu » la termine et le rédige', async () => {
    const { calls } = bridge();
    await command({ type: 'meeting', do: 'end' });
    expect(calls.onSave).toHaveBeenCalledTimes(1);
    expect(calls.onSummarize).not.toHaveBeenCalled();

    await command({ type: 'summary', template: 'decision' });
    expect(calls.onSummarize).toHaveBeenLastCalledWith({ template: 'decision' });
    // Sans template nommé : celui d'App, donc aucun argument.
    await command({ type: 'summary', template: '' });
    expect(calls.onSummarize).toHaveBeenLastCalledWith();
    expect(calls.onSave).toHaveBeenCalledTimes(1);
  });

  it('retient un template pour la fin : celui d’App change, la réunion continue', async () => {
    const { calls, component } = bridge({ currentTemplate: 'standard' });
    // La valeur que `bind:currentTemplate` rend à App : lue dans le composant,
    // faute d'un parent pour la recevoir.
    const current = () => component.$$.ctx[component.$$.props.currentTemplate];
    await command({ type: 'template', template: 'decision' });
    expect(current()).toBe('decision');
    // Aucun template nommé : celui d'App reste.
    await command({ type: 'template', template: '' });
    expect(current()).toBe('decision');
    expect(Object.values(calls).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it('hors d’une réunion en cours, un geste est jeté — pas gardé pour plus tard', async () => {
    const { calls, rerender } = bridge({ live: false });
    await command(
      { type: 'meeting', do: 'pause' },
      { type: 'meeting', do: 'end' },
      { type: 'summary', template: 'decision' },
    );
    expect(Object.values(calls).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect(get(store.aiHelpCommands)).toEqual([]);

    await rerender({ live: true });
    expect(calls.onSave).not.toHaveBeenCalled();
  });

  it('un geste inconnu ne fait rien', async () => {
    const { calls } = bridge();
    await command({ type: 'meeting', do: 'delete' }, { type: 'delete' }, {});
    expect(Object.values(calls).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });
});

describe('AiHelpMeetingBridge — les templates dits à l’IA', () => {
  /** Les noms qui partent avec une question. */
  async function sentTemplates() {
    store.aiHelp.update((s) => ({
      ...s,
      available: true,
      enabled: true,
      allowed: { project: true, qa: true, agenda: true, ideas: true },
      domains: { project: true, qa: true, agenda: true, ideas: true },
      meetingId: 'm1',
    }));
    api.askAiHelp.mockResolvedValue({ ok: true, status: 200, data: { item: null, actions: [] } });
    await store.askAiHelp('Quels templates ?');
    return api.askAiHelp.mock.calls.at(-1)[0].templates;
  }

  it('par leur nom dans la langue de l’écran ; à défaut le français, puis l’identifiant', async () => {
    bridge();
    expect(await sentTemplates()).toEqual(['Standard', 'Réunion de décision', 'Point hebdo', 'nu']);

    currentLanguageStore.set('en');
    await tick();
    expect(await sentTemplates()).toEqual(['Standard', 'Decision meeting', 'Point hebdo', 'nu']);
  });

  it('suit la liste : un template ajouté pendant la réunion peut être demandé', async () => {
    const { rerender } = bridge({ templateOptions: TEMPLATES.slice(0, 1) });
    expect(await sentTemplates()).toEqual(['Standard']);
    await rerender({ templateOptions: TEMPLATES.slice(0, 2) });
    expect(await sentTemplates()).toEqual(['Standard', 'Réunion de décision']);
  });
});
