/**
 * L'horloge du minuteur de l'Aide IA (stores/aiHelpTimer.js) — horloge simulée.
 *
 * Garanties tenues ici :
 *   - le reste est RELU contre l'heure, jamais décompté : un poste qui dormait
 *     ne fait pas dériver l'affichage ;
 *   - à zéro : « terminé » une fois, la fin annoncée une seule fois, puis le
 *     minuteur s'efface seul au bout d'une minute ;
 *   - une fin passée depuis plus d'une minute ne s'annonce pas ;
 *   - en lancer un remplace celui qui tourne — l'ancien ne sonne jamais.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
  aiHelpTimer,
  aiHelpTimerLeft,
  aiHelpTimerLeftMs,
  clearAiHelpTimer,
  runAiHelpTimer,
} from './aiHelpTimer.js';
import { AI_HELP_TIMER_DONE_MS } from '../config/constants.js';

beforeEach(() => {
  vi.useFakeTimers();
  clearAiHelpTimer();
});
afterEach(() => {
  clearAiHelpTimer();
  vi.useRealTimers();
});

describe('aiHelpTimer — l’horloge', () => {
  it('décompte seconde par seconde, sans toucher au minuteur lui-même', async () => {
    runAiHelpTimer({ remainingMs: 300_000, seconds: 300, label: ' Pause café ' });
    const started = get(aiHelpTimer);
    expect(started).toMatchObject({ seconds: 300, label: 'Pause café', done: false });
    expect(started.endsAt).toBe(Date.now() + 300_000);
    expect(get(aiHelpTimerLeft)).toBe(300);

    await vi.advanceTimersByTimeAsync(1000);
    expect(get(aiHelpTimerLeft)).toBe(299);
    await vi.advanceTimersByTimeAsync(28_500);
    expect(get(aiHelpTimerLeft)).toBe(271);
    expect(aiHelpTimerLeftMs()).toBe(270_500);
    // Le minuteur n'a pas changé : seul le reste bouge, chaque seconde.
    expect(get(aiHelpTimer)).toBe(started);
  });

  it('à zéro : terminé, annoncé une seule fois, effacé une minute plus tard', async () => {
    const whenDone = vi.fn();
    runAiHelpTimer({ remainingMs: 5000, seconds: 5, label: 'Tour de table' }, whenDone);
    await vi.advanceTimersByTimeAsync(4750);
    expect(whenDone).not.toHaveBeenCalled();
    expect(get(aiHelpTimerLeft)).toBe(1);

    await vi.advanceTimersByTimeAsync(250);
    expect(whenDone).toHaveBeenCalledTimes(1);
    expect(whenDone.mock.calls[0][0]).toMatchObject({ label: 'Tour de table' });
    expect(get(aiHelpTimer)).toMatchObject({ done: true, label: 'Tour de table' });
    expect(get(aiHelpTimerLeft)).toBe(0);
    expect(aiHelpTimerLeftMs()).toBe(0);

    await vi.advanceTimersByTimeAsync(AI_HELP_TIMER_DONE_MS - 1);
    expect(get(aiHelpTimer)).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(get(aiHelpTimer)).toBeNull();
    expect(whenDone).toHaveBeenCalledTimes(1);
  });

  it('le poste dormait : la fin, vue en retard de moins d’une minute, sonne quand même', async () => {
    const whenDone = vi.fn();
    runAiHelpTimer({ remainingMs: 60_000, seconds: 60 }, whenDone);
    // Dix secondes passées la fin, sans qu'aucun battement n'ait eu lieu.
    vi.setSystemTime(Date.now() + 70_000);
    await vi.advanceTimersByTimeAsync(250);
    expect(whenDone).toHaveBeenCalledTimes(1);
    expect(get(aiHelpTimer)).toMatchObject({ done: true });
    // « Temps écoulé » ne reste que ce qu'il reste de sa minute.
    await vi.advanceTimersByTimeAsync(AI_HELP_TIMER_DONE_MS - 10_250);
    expect(get(aiHelpTimer)).toBeNull();
  });

  it('une fin passée depuis plus d’une minute s’efface sans s’annoncer', async () => {
    const whenDone = vi.fn();
    runAiHelpTimer({ remainingMs: 60_000, seconds: 60 }, whenDone);
    vi.setSystemTime(Date.now() + 60_000 + AI_HELP_TIMER_DONE_MS);
    await vi.advanceTimersByTimeAsync(250);
    expect(whenDone).not.toHaveBeenCalled();
    expect(get(aiHelpTimer)).toBeNull();
  });

  it('en lancer un remplace celui qui tourne : l’ancien ne sonne jamais', async () => {
    const first = vi.fn();
    const second = vi.fn();
    runAiHelpTimer({ remainingMs: 10_000, seconds: 10, label: 'Premier' }, first);
    await vi.advanceTimersByTimeAsync(4000);
    runAiHelpTimer({ remainingMs: 30_000, seconds: 30, label: 'Second' }, second);
    expect(get(aiHelpTimer)).toMatchObject({ seconds: 30, label: 'Second' });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('arrêté, il ne sonne pas ; sans reste, rien ne démarre', async () => {
    const whenDone = vi.fn();
    runAiHelpTimer({ remainingMs: 2000, seconds: 2 }, whenDone);
    clearAiHelpTimer();
    await vi.advanceTimersByTimeAsync(5000);
    expect(whenDone).not.toHaveBeenCalled();
    expect(get(aiHelpTimer)).toBeNull();
    expect(get(aiHelpTimerLeft)).toBe(0);

    runAiHelpTimer({ remainingMs: 0, seconds: 300 }, whenDone);
    runAiHelpTimer({ remainingMs: 'bientôt' }, whenDone);
    runAiHelpTimer(null, whenDone);
    expect(get(aiHelpTimer)).toBeNull();
  });

  it('la durée totale n’est jamais sous le reste : l’anneau ne déborde pas', () => {
    runAiHelpTimer({ remainingMs: 90_000, seconds: 30 });
    expect(get(aiHelpTimer).seconds).toBe(90);
    runAiHelpTimer({ remainingMs: 90_000 });
    expect(get(aiHelpTimer).seconds).toBe(90);
  });
});
