/**
 * « Tester le son » : quelque chose arrive-t-il au périphérique ? La mesure se
 * fait sans carte son — contexte audio, horloge et images injectés.
 */
import { describe, it, expect, vi } from 'vitest';
import { probeInputLevel, HEARD_THRESHOLD } from './levelProbe.js';

function rig(frames) {
  const stopped = vi.fn();
  const stream = { getTracks: () => [{ stop: stopped }] };
  let clock = 0;
  let frame = 0;
  const context = {
    state: 'running',
    close: vi.fn(),
    createAnalyser: () => ({
      fftSize: 0,
      getFloatTimeDomainData(samples) {
        samples.fill(frames[Math.min(frame, frames.length - 1)]);
        frame += 1;
      },
    }),
    createMediaStreamSource: () => ({ connect: () => {} }),
  };
  return {
    stopped,
    context,
    options: {
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
      constraints: { deviceId: { exact: 'bh-1' } },
      durationMs: 300,
      createContext: () => context,
      schedule: (tick) => {
        clock += 100;
        tick();
      },
      now: () => clock,
    },
  };
}

describe('probeInputLevel', () => {
  it('un son au-dessus du seuil est « reçu », et la jauge suit', async () => {
    const { options, stopped, context } = rig([0, 0.3, 0.05]);
    const levels = [];
    const result = await probeInputLevel({ ...options, onLevel: (level) => levels.push(level) });
    expect(result.heard).toBe(true);
    expect(result.peak).toBeCloseTo(0.3, 5);
    expect(levels.some((level) => level > 0.5)).toBe(true);
    // Le périphérique est relâché à la fin du test : il servira à la réunion.
    expect(stopped).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
  });

  it('un périphérique virtuel qui ne reçoit rien rend des zéros : « aucun son »', async () => {
    const { options } = rig([0, 0, 0]);
    await expect(probeInputLevel(options)).resolves.toMatchObject({ heard: false });
    expect(HEARD_THRESHOLD).toBeGreaterThan(0);
  });

  it('ouvre le périphérique avec les contraintes de l’enregistrement', async () => {
    const { options } = rig([0.2]);
    await probeInputLevel(options);
    expect(options.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: 'bh-1' } },
    });
  });
});
