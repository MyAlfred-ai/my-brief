import { describe, it, expect } from 'vitest';
import { meetingElapsed } from './formatUtils.js';

describe('meetingElapsed — secondes de réunion, pauses exclues', () => {
  const NOW = 1_800_000_000_000;

  it('le tronçon en cours s’ajoute à ce qui a été cumulé aux pauses', () => {
    expect(meetingElapsed(120, NOW - 45_000, 0, NOW)).toBe(165);
    expect(meetingElapsed(0, NOW - 45_900, 0, NOW)).toBe(45);
  });

  it('en pause ou à l’arrêt (aucun tronçon en cours) : le cumul seul', () => {
    expect(meetingElapsed(300, null, 0, NOW)).toBe(300);
  });

  it('chronomètre à zéro : la durée connue par ailleurs fait foi', () => {
    expect(meetingElapsed(0, null, 1800, NOW)).toBe(1800);
    expect(meetingElapsed(undefined, null, undefined, NOW)).toBe(0);
    // Dès qu'il tourne, le chronomètre l'emporte.
    expect(meetingElapsed(10, null, 1800, NOW)).toBe(10);
  });
});
