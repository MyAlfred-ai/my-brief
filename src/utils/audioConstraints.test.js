import { describe, it, expect } from 'vitest';
import { buildAudioConstraints, buildSystemAudioConstraints } from './audioConstraints.js';

describe('buildAudioConstraints', () => {
  it('renvoie les contraintes par défaut sans deviceId', () => {
    expect(buildAudioConstraints('')).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(buildAudioConstraints(null)).not.toHaveProperty('deviceId');
    expect(buildAudioConstraints(undefined)).not.toHaveProperty('deviceId');
  });

  it('ajoute deviceId exact quand un micro est choisi', () => {
    const c = buildAudioConstraints('mic-123');
    expect(c.deviceId).toEqual({ exact: 'mic-123' });
    // les contraintes de base restent présentes (zéro régression)
    expect(c.echoCancellation).toBe(true);
    expect(c.noiseSuppression).toBe(true);
    expect(c.autoGainControl).toBe(true);
  });
});

describe('buildSystemAudioConstraints', () => {
  it("impose l'appareil et coupe tous les traitements de la voix", () => {
    // Avec l'annulation d'écho, Safari ferait migrer le MICRO hors de son unité
    // audio (il n'en garde qu'une), et la visio jouée par le navigateur serait
    // soustraite de l'entrée qui doit la capter.
    expect(buildSystemAudioConstraints('blackhole-1')).toEqual({
      deviceId: { exact: 'blackhole-1' },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });
});
