/**
 * La capsule du minuteur de l'Aide IA.
 *
 * Ce qui compte ici : le temps qui reste se lit en chiffres, et se DIT en
 * toutes lettres au lecteur d'écran ; son bouton l'arrête ; à zéro elle dit
 * « Temps écoulé » et son bouton ne fait plus que la fermer ; hors réunion,
 * elle n'existe pas ; et l'acte « minuteur » s'écrit sous la réponse de l'IA.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('../../services/aiHelpApi.js', () => ({
  fetchAiHelp: vi.fn(),
  saveAiHelpSession: vi.fn(async () => ({
    ok: true,
    status: 200,
    data: {
      session: {
        enabled: true,
        domains: { project: true, qa: true, agenda: true, ideas: true },
        agendaState: [],
        project: null,
        projectDeclined: false,
        items: [],
        timer: null,
      },
      candidates: [],
    },
  })),
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
const clock = await import('../../stores/aiHelpTimer.js');
const AiHelpTimer = (await import('./AiHelpTimer.svelte')).default;
const AiHelpCard = (await import('./AiHelpCard.svelte')).default;

const t = uiTextData.fr.aiHelp;

function meeting(over = {}) {
  store.aiHelp.update((s) => ({
    ...s,
    loaded: true,
    available: true,
    enabled: true,
    wakeWord: 'Alfred',
    meetingId: 'm1',
    ...over,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  clock.clearAiHelpTimer();
  store.aiHelpSize.set(0);
  meeting();
});
afterEach(() => {
  clock.clearAiHelpTimer();
  vi.useRealTimers();
});

describe('AiHelpTimer — le décompte', () => {
  it('rien tant qu’aucun minuteur ne tourne', () => {
    const { container } = render(AiHelpTimer);
    expect(container.querySelector('.ait')).toBeNull();
  });

  it('le temps en chiffres, à quoi il sert, et le tout dit au lecteur d’écran', async () => {
    clock.runAiHelpTimer({ remainingMs: 272_000, seconds: 300, label: 'Pause café' });
    const { container } = render(AiHelpTimer);

    const capsule = screen.getByRole('timer');
    expect(capsule.getAttribute('aria-label')).toBe(
      'Minuteur « Pause café » : il reste 4 min 32 s',
    );
    expect(container.querySelector('.ait-time').textContent).toBe('4:32');
    expect(container.querySelector('.ait-label').textContent).toBe('Pause café');
    expect(screen.getByRole('button', { name: t.timer.stop })).toBeTruthy();

    await vi.advanceTimersByTimeAsync(2000);
    await tick();
    expect(container.querySelector('.ait-time').textContent).toBe('4:30');
  });

  it('sans libellé : le temps seul ; les dix dernières secondes se signalent', async () => {
    clock.runAiHelpTimer({ remainingMs: 12_000, seconds: 60 });
    const { container } = render(AiHelpTimer);
    expect(container.querySelector('.ait-label')).toBeNull();
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Minuteur : il reste 12 s');
    expect(container.querySelector('.ait-last')).toBeNull();

    await vi.advanceTimersByTimeAsync(2000);
    await tick();
    expect(container.querySelector('.ait-last')).toBeTruthy();
  });

  it('l’anneau se vide avec le temps', async () => {
    clock.runAiHelpTimer({ remainingMs: 100_000, seconds: 100 });
    const { container } = render(AiHelpTimer);
    const arc = container.querySelector('.ait-arc');
    const length = Number(arc.getAttribute('stroke-dasharray'));
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 3);

    await vi.advanceTimersByTimeAsync(50_000);
    await tick();
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(length / 2, 3);
  });

  it('suit la taille choisie pour la fenêtre de l’IA', () => {
    store.aiHelpSize.set(2);
    clock.runAiHelpTimer({ remainingMs: 60_000, seconds: 60 });
    render(AiHelpTimer);
    expect(screen.getByRole('timer').style.getPropertyValue('--ai-scale')).toBe('1.45');
  });

  it('son bouton l’arrête : retiré de l’écran, dit au serveur', async () => {
    clock.runAiHelpTimer({ remainingMs: 272_000, seconds: 300, label: 'Pause café' });
    const { container } = render(AiHelpTimer);
    await fireEvent.click(screen.getByRole('button', { name: t.timer.stop }));
    expect(container.querySelector('.ait')).toBeNull();
    expect(api.saveAiHelpSession).toHaveBeenCalledWith({ meetingId: 'm1', timer: 'stop' });
  });

  it('à zéro : « Temps écoulé », et le bouton ne fait plus que fermer', async () => {
    clock.runAiHelpTimer({ remainingMs: 3000, seconds: 3, label: 'Tour de table' });
    const { container } = render(AiHelpTimer);
    await vi.advanceTimersByTimeAsync(3000);
    await tick();

    expect(container.querySelector('.ait-done')).toBeTruthy();
    expect(container.querySelector('.ait-time').textContent).toBe(t.timer.done);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe(
      'Temps écoulé — Tour de table',
    );
    await fireEvent.click(screen.getByRole('button', { name: t.timer.close }));
    expect(container.querySelector('.ait')).toBeNull();
    expect(api.saveAiHelpSession).not.toHaveBeenCalled();
  });

  it('hors réunion, elle n’existe pas', () => {
    meeting({ meetingId: null });
    clock.runAiHelpTimer({ remainingMs: 60_000, seconds: 60 });
    const { container } = render(AiHelpTimer);
    expect(container.querySelector('.ait')).toBeNull();
  });
});

describe('AiHelpCard — ce qu’elle a fait du minuteur', () => {
  const acts = (...list) =>
    render(AiHelpCard, {
      props: {
        name: 'Alfred',
        item: { kind: 'answer', question: 'Minuteur', body: '', acts: list },
      },
    }).container.querySelector('.ai-card-acts').textContent;

  it('lancé, rallongé, raccourci, arrêté : dit par myBrief, avec les durées', () => {
    expect(
      acts({ type: 'timer', do: 'start', seconds: 300, label: 'Pause café', ok: true }),
    ).toContain('Minuteur lancé : 5 min — Pause café');
    expect(acts({ type: 'timer', do: 'start', seconds: 90, ok: true })).toContain(
      'Minuteur lancé : 1 min 30 s.',
    );
    expect(acts({ type: 'timer', do: 'add', seconds: 120, left: 420, ok: true })).toContain(
      'Minuteur rallongé de 2 min : il reste 7 min.',
    );
    expect(acts({ type: 'timer', do: 'add', seconds: -60, left: 45, ok: true })).toContain(
      'Minuteur raccourci de 1 min : il reste 45 s.',
    );
    expect(acts({ type: 'timer', do: 'stop', ok: true })).toContain(t.acts.timerStop);
  });

  it('aucun minuteur à changer : dit tel quel', () => {
    expect(acts({ type: 'timer', do: 'add', seconds: 120, ok: false })).toContain(t.acts.timerNone);
    expect(acts({ type: 'timer', do: 'stop', ok: false })).toContain(t.acts.timerNone);
  });
});
